// Sign-in, sessions and route permissions, tested over real HTTP against the
// database as the restricted app role. Creates its own fixtures (suffixed with
// a random id) and deletes them afterwards.
//
//   APP_DATABASE_URL=... npm test      (skipped when it is not set)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { loadEnv } from '../scripts/env.js';

loadEnv();
const opts = { skip: process.env.APP_DATABASE_URL ? false : 'APP_DATABASE_URL not set' };
const tag = crypto.randomBytes(3).toString('hex');
const PASSWORD = 'correct horse battery';
let server, base, fx, db;

// Test-only routes covering each kind of access rule.
function testRoutes(route) {
  route('GET', 'test/staff', { auth: 'staff' }, async () => ({ ok: 'staff' }));
  route('GET', 'test/admin', { auth: 'staff', perm: 'users.manage' }, async () => ({ ok: 'admin' }));
  route('GET', 'test/student', { auth: 'student' }, async ({ principal }) => ({ id: principal.student.id }));
  route('GET', 'test/apikey', { auth: 'apikey' }, async () => ({ ok: 'key' }));
  route('POST', 'test/staff-write', { auth: 'staff' }, async ({ body }) => ({ got: body.x }));
}

async function call(method, path, { cookie, body, headers = {} } = {}) {
  const res = await fetch(`${base}/api/${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, json: await res.json().catch(() => null), cookie: setCookie?.split(';')[0] };
}

before(async () => {
  if (opts.skip) return;
  db = await import('../server/db.js');
  const { hashSecret, sha256 } = await import('../server/secrets.js');
  const { createRouter } = await import('../server/router.js');
  const authRoutes = (await import('../server/routes/auth.js')).default;

  fx = await db.asSystem(async (q) => {
    const pw = await hashSecret(PASSWORD);
    const role = async (key, perms) => {
      const r = await q.one('insert into roles (key, name) values ($1, $1) returning id', [`${key}_${tag}`]);
      for (const p of perms) await q('insert into role_permissions values ($1, $2)', [r.id, p]);
      return r.id;
    };
    const instructorRole = await role('t_instructor', ['classes.manage_own']);
    const adminRole = await role('t_admin', ['users.manage']);
    const user = (name, roleId) => q.one('insert into users (email, name, role_id, password_hash) values ($1, $2, $3, $4) returning id, email', [`${name}-${tag}@test.invalid`, name, roleId, pw]);
    const instructor = await user('instructor', instructorRole);
    const admin = await user('admin', adminRole);
    const cls = await q.one("insert into classes (name, join_code) values ($1, $2) returning id, join_code", [`Auth test ${tag}`, `T${tag.toUpperCase().replace(/[01ILO]/g, 'X')}`.slice(0, 6).padEnd(6, 'Z')]);
    const pinHash = await hashSecret('1234');
    const stu = (name) => q.one('insert into students (class_id, display_name, pin_hash) values ($1, $2, $3) returning id', [cls.id, name, pinHash]);
    const ana = await stu('Ana P');
    const ben = await stu('Ben Q');
    const rawKey = `cic_test_${crypto.randomBytes(16).toString('hex')}`;
    await q('insert into api_keys (name, prefix, key_hash) values ($1, $2, $3)', [`test ${tag}`, 'cic_test', sha256(rawKey)]);
    return { roles: [instructorRole, adminRole], instructor, admin, cls, ana, ben, rawKey };
  });

  server = http.createServer(createRouter([authRoutes, testRoutes]));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (opts.skip) return;
  server?.close();
  await db.asSystem(async (q) => {
    await q('delete from classes where id = $1', [fx.cls.id]);
    await q('delete from users where id = any($1)', [[fx.instructor.id, fx.admin.id]]);
    await q('delete from roles where id = any($1)', [fx.roles]);
    await q('delete from api_keys where name = $1', [`test ${tag}`]);
  });
  await db.getPool().end();
});

const staffLogin = async (who) => (await call('POST', 'auth/login', { body: { email: who.email, password: PASSWORD } })).cookie;
const studentLogin = async (s, pin = '1234') => call('POST', `join/${fx.cls.join_code}/login`, { body: { student_id: s.id, pin } });

test('no session: protected routes return 401', opts, async () => {
  for (const p of ['test/staff', 'test/admin', 'test/student', 'test/apikey']) {
    assert.equal((await call('GET', p)).status, 401, p);
  }
  assert.deepEqual((await call('GET', 'auth/me')).json, { kind: null });
});

test('staff sign-in: wrong password and unknown email get the same generic 401', opts, async () => {
  const wrong = await call('POST', 'auth/login', { body: { email: fx.admin.email, password: 'not the password' } });
  const unknown = await call('POST', 'auth/login', { body: { email: `nobody-${tag}@test.invalid`, password: 'not the password' } });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.json, unknown.json);
  assert.equal((await call('POST', 'auth/login', { body: { email: 'x' } })).json.field, 'Email');
});

test('instructor: staff routes yes, admin-only and student routes no', opts, async () => {
  const cookie = await staffLogin(fx.instructor);
  assert.equal((await call('GET', 'test/staff', { cookie })).status, 200);
  assert.equal((await call('GET', 'test/admin', { cookie })).status, 403);
  assert.equal((await call('GET', 'test/student', { cookie })).status, 403);
  const me = (await call('GET', 'auth/me', { cookie })).json;
  assert.equal(me.kind, 'staff');
  assert.deepEqual(me.perms, ['classes.manage_own']);
});

test('admin with users.manage can reach the admin route', opts, async () => {
  const cookie = await staffLogin(fx.admin);
  assert.equal((await call('GET', 'test/admin', { cookie })).status, 200);
});

test('student: own route yes, every staff route 403', opts, async () => {
  const { status, cookie } = await studentLogin(fx.ana);
  assert.equal(status, 200);
  assert.equal((await call('GET', 'test/student', { cookie })).json.id, fx.ana.id);
  assert.equal((await call('GET', 'test/staff', { cookie })).status, 403);
  assert.equal((await call('GET', 'test/admin', { cookie })).status, 403);
  assert.equal((await call('GET', 'auth/me', { cookie })).json.student.display_name, 'Ana P');
});

test('API key reaches only API-key routes', opts, async () => {
  const headers = { authorization: `Bearer ${fx.rawKey}` };
  assert.equal((await call('GET', 'test/apikey', { headers })).status, 200);
  assert.equal((await call('GET', 'test/apikey', { headers: { authorization: 'Bearer cic_wrong' } })).status, 401);
  assert.equal((await call('GET', 'test/staff', { headers })).status, 403);
});

test('signed-in writes need JSON, same origin and the CSRF token', opts, async () => {
  const cookie = await staffLogin(fx.admin);
  const { csrf } = (await call('GET', 'auth/me', { cookie })).json;
  assert.equal((await call('POST', 'test/staff-write', { cookie, body: { x: 1 } })).status, 403);
  assert.equal((await call('POST', 'test/staff-write', { cookie, body: { x: 1 }, headers: { 'x-csrf-token': 'wrong' } })).status, 403);
  assert.equal((await call('POST', 'test/staff-write', { cookie, body: { x: 1 }, headers: { 'x-csrf-token': csrf, origin: 'https://evil.example' } })).status, 403);
  const plain = await fetch(`${base}/api/test/staff-write`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(plain.status, 415);
  const ok = await call('POST', 'test/staff-write', { cookie, body: { x: 7 }, headers: { 'x-csrf-token': csrf } });
  assert.deepEqual([ok.status, ok.json], [200, { got: 7 }]);
});

test('5 wrong PINs lock the student out, even for the right PIN', opts, async () => {
  for (let i = 0; i < 5; i++) assert.equal((await studentLogin(fx.ben, '9999')).status, 401);
  assert.equal((await studentLogin(fx.ben, '1234')).status, 429);
});

test('late joiner: duplicate names are refused, a new name gets a one-time PIN', opts, async () => {
  const dup = await call('POST', `join/${fx.cls.join_code}/new`, { body: { display_name: 'ana p' } });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.field, 'Your name');
  const fresh = await call('POST', `join/${fx.cls.join_code}/new`, { body: { display_name: 'Cruz R' } });
  assert.equal(fresh.status, 201);
  assert.match(fresh.json.pin, /^\d{4}$/);
  assert.equal((await call('GET', 'auth/me', { cookie: fresh.cookie })).json.kind, 'student');
  const page = await call('GET', `join/${fx.cls.join_code}`);
  assert.deepEqual(page.json.students.map((s) => s.display_name), ['Ana P', 'Ben Q', 'Cruz R']);
});

test('logout ends the session', opts, async () => {
  const cookie = await staffLogin(fx.instructor);
  assert.equal((await call('GET', 'test/staff', { cookie })).status, 200);
  await call('POST', 'auth/logout', { cookie, body: {} });
  assert.equal((await call('GET', 'test/staff', { cookie })).status, 401);
});

test('unknown route is 404 and wrong method is 405', opts, async () => {
  assert.equal((await call('GET', 'nope')).status, 404);
  assert.equal((await call('DELETE', 'auth/me')).status, 405);
});
