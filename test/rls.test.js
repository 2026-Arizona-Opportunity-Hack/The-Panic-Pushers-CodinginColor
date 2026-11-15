// Row-level security checks against a real database, run as the restricted
// app role. Everything happens inside one transaction that is rolled back,
// so it is safe to point at any database that has run `npm run db:setup`.
//
//   APP_DATABASE_URL=... npm test      (skipped when it is not set)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { loadEnv } from '../scripts/env.js';

loadEnv();
const url = process.env.APP_DATABASE_URL;
const opts = { skip: url ? false : 'APP_DATABASE_URL not set' };
let client;
let ids;

const as = (kind, studentId = '') =>
  client.query("select set_config('app.actor_kind', $1, true), set_config('app.student_id', $2, true)", [kind, String(studentId)]);
const rows = async (sql, params) => (await client.query(sql, params)).rows;

before(async () => {
  if (!url) return;
  client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('begin');
  await as('system');
  const [cls] = await rows("insert into classes (name, join_code) values ('RLS test', 'TEST' || floor(random()*1e6)::text) returning id");
  const [mod] = await rows("insert into modules (title) values ('RLS test') returning id");
  const [les] = await rows('insert into lessons (module_id, title) values ($1, $2) returning id', [mod.id, 'L']);
  const [act] = await rows("insert into activities (lesson_id, type, title) values ($1, 'check', 'Q') returning id", [les.id]);
  const [a] = await rows("insert into students (class_id, display_name, pin_hash) values ($1, 'Student A', 'x') returning id", [cls.id]);
  const [b] = await rows("insert into students (class_id, display_name, pin_hash) values ($1, 'Student B', 'x') returning id", [cls.id]);
  for (const s of [a, b]) {
    await client.query('insert into submissions (student_id, activity_id, completed) values ($1, $2, true)', [s.id, act.id]);
    await client.query("insert into hint_logs (student_id, activity_id, hint) values ($1, $2, 'h')", [s.id, act.id]);
  }
  ids = { a: a.id, b: b.id, act: act.id };
});

after(async () => {
  if (!client) return;
  await client.query('rollback');
  await client.end();
});

test('the app role cannot bypass row-level security', opts, async () => {
  const [r] = await rows('select rolsuper, rolbypassrls from pg_roles where rolname = current_user');
  assert.equal(r.rolsuper, false);
  assert.equal(r.rolbypassrls, false);
});

test("a student sees only their own submissions, hints and record", opts, async () => {
  await as('student', ids.a);
  const subs = await rows('select student_id from submissions where activity_id = $1', [ids.act]);
  assert.deepEqual(subs.map((s) => s.student_id), [ids.a]);
  assert.equal((await rows('select * from submissions where student_id = $1', [ids.b])).length, 0);
  assert.equal((await rows('select * from hint_logs where student_id = $1', [ids.b])).length, 0);
  assert.deepEqual((await rows('select id from students where id in ($1, $2)', [ids.a, ids.b])).map((s) => s.id), [ids.a]);
});

test("a student cannot write work into another student's record", opts, async () => {
  await as('student', ids.a);
  await client.query('savepoint w');
  await assert.rejects(
    client.query('insert into submissions (student_id, activity_id) values ($1, $2)', [ids.b, ids.act]),
    /row-level security/
  );
  await client.query('rollback to savepoint w');
});

test('a request with no actor sees no student data', opts, async () => {
  await as('');
  assert.equal((await rows('select * from students')).length, 0);
  assert.equal((await rows('select * from submissions')).length, 0);
});

test('staff see every student in the class', opts, async () => {
  await as('staff');
  assert.equal((await rows('select id from students where id in ($1, $2)', [ids.a, ids.b])).length, 2);
});
