#!/usr/bin/env node
// Adds demo curriculum (db/demo-curriculum.js) and a demo class with students
// (db/demo-class.js) so there is something to teach and try on day one. Safe to
// run more than once: a module whose title, or a class whose code, already
// exists is skipped, so CIC's own edits are never overwritten.
//
//   npm run db:seed
import pg from 'pg';
import { loadEnv } from './env.js';
import { asSystem } from '../server/db.js';
import { activityContent, pin } from '../server/validate.js';
import { hashSecret } from '../server/secrets.js';
import { modules } from '../db/demo-curriculum.js';
import { demoClass } from '../db/demo-class.js';

loadEnv();
if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL (the Neon owner connection string) in .env first.');
  process.exit(1);
}
const demoPin = pin(process.env.DEMO_PIN || '1234');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

const summary = await asSystem(async (q) => {
  const concepts = Object.fromEntries((await q('select key, id from concepts')).map((c) => [c.key, c.id]));
  const conceptId = (key) => {
    if (!key) return null;
    if (!concepts[key]) throw new Error(`Unknown concept "${key}". Run npm run db:setup first.`);
    return concepts[key];
  };
  const admin = await q.one("select u.id from users u join roles r on r.id = u.role_id where r.key = 'admin' order by u.id limit 1");
  const added = [];
  const skipped = [];

  for (const m of modules) {
    if (await q.one('select 1 from modules where title = $1', [m.title])) { skipped.push(m.title); continue; }
    const mod = await q.one('insert into modules (title, summary, published, created_by) values ($1, $2, true, $3) returning id', [m.title, m.summary, admin?.id ?? null]);
    for (const [li, lesson] of m.lessons.entries()) {
      const l = await q.one('insert into lessons (module_id, title, position) values ($1, $2, $3) returning id', [mod.id, lesson.title, li + 1]);
      for (const [ai, a] of lesson.activities.entries()) {
        // Questions name concepts by key; store ids. Then validate exactly as the API would.
        const raw = { ...a.content };
        if (raw.questions) raw.questions = raw.questions.map(({ concept, ...rest }) => ({ ...rest, concept_id: conceptId(concept) }));
        const content = activityContent(a.type, raw);
        await q('insert into activities (lesson_id, type, title, position, concept_id, content) values ($1, $2, $3, $4, $5, $6)',
          [l.id, a.type, a.title, ai + 1, conceptId(a.concept), content]);
      }
    }
    added.push(m.title);
  }

  // Demo class: same idea, keyed by its join code.
  const c = demoClass;
  if (await q.one('select 1 from classes where join_code = $1', [c.join_code])) {
    skipped.push(`class ${c.join_code}`);
  } else {
    const school = await q.one('insert into schools (name) values ($1) on conflict (name) do update set name = excluded.name returning id', [c.school]);
    const cohort = await q.one('insert into cohorts (name) values ($1) on conflict (name) do update set name = excluded.name returning id', [c.cohort]);
    const cls = await q.one('insert into classes (name, school_id, cohort_id, join_code) values ($1, $2, $3, $4) returning id', [c.name, school.id, cohort.id, c.join_code]);
    for (const [i, title] of c.modules.entries()) {
      await q('insert into class_modules (class_id, module_id, position) select $1, id, $3 from modules where title = $2', [cls.id, title, i + 1]);
    }
    const pinHash = await hashSecret(demoPin);
    for (const name of c.students) {
      await q('insert into students (class_id, display_name, pin_hash) values ($1, $2, $3)', [cls.id, name, pinHash]);
    }
    added.push(`class ${c.join_code} (${c.students.length} students, PIN ${demoPin})`);
  }
  return { added, skipped };
}, pool);

await pool.end();
for (const t of summary.added) console.log(`  added    ${t}`);
for (const t of summary.skipped) console.log(`  skipped  ${t} (already exists)`);
console.log(`Demo data: ${summary.added.length} added, ${summary.skipped.length} skipped. Try it at /join.html?code=${demoClass.join_code}`);
