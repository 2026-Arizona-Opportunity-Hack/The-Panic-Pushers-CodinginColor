// Teacher dashboard API: who sees which class, the Today list, PIN reset and placement.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dbOpts, newTag, startServer, makeStaff, client } from './helpers.js';

const tag = newTag();
let srv, db, fx, owner, other, admin;

before(async () => {
  if (dbOpts.skip) return;
  db = await import('../server/db.js');
  const { hashSecret } = await import('../server/secrets.js');
  fx = await db.asSystem(async (q) => {
    const owner = await makeStaff(q, tag, 'teach', ['classes.manage_own']);
    const other = await makeStaff(q, tag, 'other', ['classes.manage_own']);
    const admin = await makeStaff(q, tag, 'cicadmin', ['classes.manage_all']);
    const m = await q.one('insert into modules (title, published) values ($1, true) returning id', [`Dash ${tag}`]);
    const l = await q.one("insert into lessons (module_id, title, position) values ($1, 'L', 1) returning id", [m.id]);
    const code = await q.one("insert into activities (lesson_id, type, title, position, content) values ($1, 'code', 'Loop it', 1, $2) returning id",
      [l.id, { prompt: 'p', expected_output: 'x' }]);
    const cls = await q.one("insert into classes (name, join_code, instructor_id) values ($1, 'ZQ' || upper(substr(md5(random()::text), 1, 4)), $2) returning id",
      [`Dash ${tag}`, owner.id]);
    await q('insert into class_modules values ($1, $2, 1)', [cls.id, m.id]);
    const add = (name, extra = '') => q.one(`insert into students (class_id, display_name, pin_hash${extra ? ', failed_logins, locked_until' : ''})
      values ($1, $2, $3${extra}) returning id`, [cls.id, name, 'x']);
    const stuck = await add('Stuck S.');
    const idle = await add('Idle I.');
    const locked = await add('Locked L.', ", 5, now() + interval '1 day'");
    for (let i = 0; i < 3; i++) await q('insert into submissions (student_id, activity_id, passed, completed) values ($1, $2, false, false)', [stuck.id, code.id]);
    return { owner, other, admin, cls, stuck, idle, locked, hash: await hashSecret('0000') };
  });
  srv = await startServer([(await import('../server/routes/auth.js')).default, (await import('../server/routes/classes.js')).default]);
  [owner, other, admin] = await Promise.all([fx.owner, fx.other, fx.admin].map((u) => client(srv.base, u)));
});

after(async () => {
  if (dbOpts.skip) return;
  srv.close();
  await db.asSystem(async (q) => {
    await q('delete from classes where id = $1', [fx.cls.id]);
    await q('delete from modules where title = $1', [`Dash ${tag}`]);
    const ids = [fx.owner.id, fx.other.id, fx.admin.id];
    await q('delete from audit_log where actor_id = any($1)', [ids]);
    await q('delete from users where id = any($1)', [ids]);
    await q('delete from roles where id = any($1)', [[fx.owner.roleId, fx.other.roleId, fx.admin.roleId]]);
  });
  await db.getPool().end();
});

test('instructors see only their classes; CIC admins see all', dbOpts, async () => {
  assert.ok((await owner('GET', 'classes')).json.some((c) => c.id === fx.cls.id));
  assert.ok(!(await other('GET', 'classes')).json.some((c) => c.id === fx.cls.id));
  assert.equal((await other('GET', `classes/${fx.cls.id}`)).status, 403);
  assert.equal((await other('POST', `students/${fx.stuck.id}/reset-pin`, {})).status, 403);
  assert.equal((await admin('GET', `classes/${fx.cls.id}`)).status, 200);
});

test('the Today list puts locked out first, then stuck, then not started', dbOpts, async () => {
  const d = (await owner('GET', `classes/${fx.cls.id}`)).json;
  assert.deepEqual(d.today.map((t) => [t.kind, t.name]).slice(0, 3), [['locked', 'Locked L.'], ['stuck', 'Stuck S.'], ['not_started', 'Idle I.']]);
  assert.equal(d.students.find((s) => s.id === fx.stuck.id).summary.status, 'Stuck');
  assert.match(d.today[1].reason, /3 failed tries/);
});

test('a PIN reset unlocks the student, shows the new PIN once and is audited', dbOpts, async () => {
  const r = (await owner('POST', `students/${fx.locked.id}/reset-pin`, {})).json;
  assert.match(r.pin, /^\d{4}$/);
  const row = await db.asSystem((q) => q.one('select failed_logins, locked_until from students where id = $1', [fx.locked.id]));
  assert.deepEqual([row.failed_logins, row.locked_until], [0, null]);
  const log = await db.asSystem((q) => q.one("select action from audit_log where entity = 'student' and entity_id = $1", [String(fx.locked.id)]));
  assert.equal(log.action, 'reset_pin');
});

test('pace is limited to the modules the class has', dbOpts, async () => {
  assert.equal((await owner('PATCH', `classes/${fx.cls.id}`, { pace_position: 5 })).status, 400);
  assert.equal((await owner('PATCH', `classes/${fx.cls.id}`, { pace_position: 1 })).json.pace_position, 1);
});
