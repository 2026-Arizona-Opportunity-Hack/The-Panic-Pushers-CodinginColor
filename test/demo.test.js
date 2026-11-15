// Demo access for judges is off unless DEMO_JUDGE_PASSWORD is set, and the
// judge role can see classes but never the admin areas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dbOpts, startServer, client } from './helpers.js';
import { JUDGE } from '../db/demo-judge.js';

let srv;
const saved = process.env.DEMO_JUDGE_PASSWORD;

before(async () => {
  if (dbOpts.skip) return;
  srv = await startServer([(await import('../server/routes/auth.js')).default, (await import('../server/routes/classes.js')).default]);
});
after(async () => {
  if (dbOpts.skip) return;
  if (saved === undefined) delete process.env.DEMO_JUDGE_PASSWORD; else process.env.DEMO_JUDGE_PASSWORD = saved;
  srv.close();
  await (await import('../server/db.js')).getPool().end();
});

test('demo access is off when DEMO_JUDGE_PASSWORD is not set', dbOpts, async () => {
  delete process.env.DEMO_JUDGE_PASSWORD;
  const r = await (await client(srv.base))('GET', 'auth/demo');
  assert.deepEqual(r.json, { enabled: false });
});

test('demo access returns the judge login and the student demo when switched on', dbOpts, async () => {
  process.env.DEMO_JUDGE_PASSWORD = 'example-only';
  const r = (await (await client(srv.base))('GET', 'auth/demo')).json;
  assert.equal(r.enabled, true);
  assert.equal(r.staff.email, JUDGE.email);
  assert.match(r.student.pin, /^\d{4}$/);
});

test('the judge role sees every class but no admin permissions', () => {
  assert.ok(JUDGE.role.perms.includes('classes.manage_all'));
  for (const p of ['users.manage', 'roles.manage', 'settings.manage', 'audit.read', 'curriculum.write']) {
    assert.ok(!JUDGE.role.perms.includes(p), `judge must not have ${p}`);
  }
});
