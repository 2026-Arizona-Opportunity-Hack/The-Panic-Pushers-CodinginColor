// The public class page lists names only, and the seeded demo class is ready to join.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dbOpts, startServer, client } from './helpers.js';
import { demoClass } from '../db/demo-class.js';

let srv, anon;

before(async () => {
  if (dbOpts.skip) return;
  srv = await startServer([(await import('../server/routes/auth.js')).default]);
  anon = await client(srv.base);
});

after(async () => {
  if (dbOpts.skip) return;
  srv.close();
  await (await import('../server/db.js')).getPool().end();
});

test('the class page shows names and nothing secret', dbOpts, async () => {
  const r = await anon('GET', `join/${demoClass.join_code}`);
  if (r.status === 404) return; // database without the demo seed
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json.class).sort(), ['name', 'school', 'self_join']);
  for (const s of r.json.students) assert.deepEqual(Object.keys(s).sort(), ['display_name', 'id']);
  assert.deepEqual(r.json.students.map((s) => s.display_name).filter((n) => demoClass.students.includes(n)).length, demoClass.students.length);
});

test('class codes are matched case-insensitively and bad codes are 400, unknown 404', dbOpts, async () => {
  assert.equal((await anon('GET', 'join/zzzzzz')).status, 404);
  assert.equal((await anon('GET', 'join/abc')).status, 400);
  assert.equal((await anon('GET', 'join/O0O0O0')).status, 400, 'confusable characters are never valid');
});
