// Shared helpers for API tests that run over real HTTP against the database.
// Each test file creates its own fixtures with a random tag and removes them.
import http from 'node:http';
import crypto from 'node:crypto';
import { loadEnv } from '../scripts/env.js';

loadEnv();
export const dbOpts = { skip: process.env.APP_DATABASE_URL ? false : 'APP_DATABASE_URL not set' };
export const PASSWORD = 'correct horse battery';
export const newTag = () => crypto.randomBytes(3).toString('hex');

/** Start a server with the given route modules; returns { base, close }. */
export async function startServer(registers) {
  const { createRouter } = await import('../server/router.js');
  const server = http.createServer(createRouter(registers));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

/** Create a role with permissions and a user holding it. */
export async function makeStaff(q, tag, key, perms) {
  const { hashSecret } = await import('../server/secrets.js');
  const role = await q.one('insert into roles (key, name) values ($1, $1) returning id', [`${key}_${tag}`]);
  for (const p of perms) await q('insert into role_permissions values ($1, $2)', [role.id, p]);
  const user = await q.one(
    'insert into users (email, name, role_id, password_hash) values ($1, $2, $3, $4) returning id, email',
    [`${key}-${tag}@test.invalid`, key, role.id, await hashSecret(PASSWORD)]
  );
  return { ...user, roleId: role.id };
}

/** A signed-in client: call(method, path, body) with cookie and CSRF handled. */
export async function client(base, { email, password = PASSWORD } = {}) {
  let cookie = null;
  let csrf = null;
  const call = async (method, path, body) => {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (csrf && method !== 'GET') headers['x-csrf-token'] = csrf;
    const res = await fetch(`${base}/api/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  if (email) {
    const r = await call('POST', 'auth/login', { email, password });
    if (r.status !== 200) throw new Error(`Sign-in failed for ${email}: ${r.status}`);
    csrf = (await call('GET', 'auth/me')).json.csrf;
  }
  return call;
}
