#!/usr/bin/env node
// Creates the database: tables, row-level security, built-in roles, starter
// concepts, one admin account and the restricted `cic_app` runtime role.
//
//   npm run db:setup              first-time setup (refuses if tables already exist)
//   npm run db:setup -- --reset   DROP everything and start over (destroys data)
//
// Runs as the database OWNER (DATABASE_URL). The app itself connects as
// cic_app (APP_DATABASE_URL), which cannot bypass row-level security.
import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadEnv } from './env.js';
import { hashSecret } from '../server/secrets.js';
import { asSystem } from '../server/db.js';

loadEnv();
if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL (the Neon owner connection string) in .env first.');
  process.exit(1);
}
const reset = process.argv.includes('--reset');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

const { rows: [{ exists }] } = await pool.query("select to_regclass('public.roles') is not null as exists");
if (exists && !reset) {
  console.error('Tables already exist. Re-run with --reset to DROP all data and recreate them.');
  await pool.end();
  process.exit(1);
}

console.log('Creating tables and row-level security…');
await pool.query(fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));

// Starting roles. All of them can be renamed, edited or deleted in the admin screens.
const ROLES = [
  ['admin', 'CIC admin', 'Founder and program manager: everything',
    ['curriculum.read', 'curriculum.write', 'classes.manage_own', 'classes.manage_all', 'reports.read_all', 'users.manage', 'roles.manage', 'settings.manage', 'audit.read']],
  ['instructor', 'Instructor', 'ASU instructors and partner-school teachers: run their own classes', ['classes.manage_own']],
  ['author', 'Curriculum author', 'Writes and publishes modules', ['curriculum.read', 'curriculum.write']],
  ['reviewer', 'External reviewer', 'K12 teacher or district admin: read-only view of the curriculum', ['curriculum.read']],
];
const CONCEPTS = ['Printing and output', 'Variables', 'Conditionals', 'Loops', 'Functions', 'Lists', 'AI basics'];

const adminEmail = (process.env.ADMIN_EMAIL || 'admin@codingincolor.net').toLowerCase();
const adminPassword = process.env.SEED_PASSWORD || `cic-${crypto.randomBytes(9).toString('base64url')}`;

await asSystem(async (q) => {
  const roleId = {};
  for (const [key, name, description, perms] of ROLES) {
    const r = await q.one('insert into roles (key, name, description) values ($1, $2, $3) returning id', [key, name, description]);
    roleId[key] = r.id;
    for (const p of perms) await q('insert into role_permissions values ($1, $2)', [r.id, p]);
  }
  for (const c of CONCEPTS) {
    await q('insert into concepts (key, name) values ($1, $2)', [c.toLowerCase().replace(/[^a-z0-9]+/g, '-'), c]);
  }
  const admin = await q.one(
    'insert into users (email, name, role_id, password_hash) values ($1, $2, $3, $4) returning id',
    [adminEmail, process.env.ADMIN_NAME || 'CIC Admin', roleId.admin, await hashSecret(adminPassword)]
  );
  await q("insert into settings (key, value) values ('ai_hints_enabled', 'true'), ('hints_per_activity', '3')");
  await q('insert into audit_log (actor_id, action, entity, entity_id) values ($1, $2, $3, $4)', [admin.id, 'setup', 'database', null]);
}, pool);

// ---------- Restricted runtime role ----------
const appPassword = process.env.APP_DB_PASSWORD || crypto.randomBytes(24).toString('base64url');
await pool.query(`do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'cic_app') then create role cic_app login nobypassrls; end if;
end $$`);
await pool.query(`alter role cic_app with login nobypassrls password '${appPassword}'`);
await pool.query('grant usage on schema public to cic_app');
await pool.query('grant select, insert, update, delete on all tables in schema public to cic_app');
await pool.query('grant usage, select on all sequences in schema public to cic_app');
await pool.query('alter default privileges in schema public grant select, insert, update, delete on tables to cic_app');
await pool.query('alter default privileges in schema public grant usage, select on sequences to cic_app');
await pool.end();

const appUrl = new URL(process.env.DATABASE_URL);
appUrl.username = 'cic_app';
appUrl.password = appPassword;

// Save the app connection string into the local .env rather than printing the password.
let saved = false;
if (fs.existsSync('.env')) {
  const env = fs.readFileSync('.env', 'utf8');
  const line = `APP_DATABASE_URL=${appUrl}`;
  fs.writeFileSync('.env', /^APP_DATABASE_URL=.*$/m.test(env) ? env.replace(/^APP_DATABASE_URL=.*$/m, line) : `${env.trimEnd()}\n${line}\n`);
  saved = true;
}

console.log(`
Database ready.
  Admin sign-in: ${adminEmail}
  Admin password: ${adminPassword}   (change it after first sign-in)
  App role: cic_app (row-level security enforced)
  ${saved ? 'APP_DATABASE_URL written to .env.' : `APP_DATABASE_URL=${appUrl}`}
  For Vercel, copy APP_DATABASE_URL from .env into the project's environment variables.
`);
