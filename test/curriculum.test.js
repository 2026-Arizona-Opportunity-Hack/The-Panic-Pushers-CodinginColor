// Curriculum authoring API: who can read and write, validation, ordering,
// protecting student work, and the audit trail.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dbOpts, newTag, startServer, makeStaff, client } from './helpers.js';

const tag = newTag();
let srv, db, fx, author, reviewer, instructor;

before(async () => {
  if (dbOpts.skip) return;
  db = await import('../server/db.js');
  const authRoutes = (await import('../server/routes/auth.js')).default;
  const curriculumRoutes = (await import('../server/routes/curriculum.js')).default;
  fx = await db.asSystem(async (q) => ({
    author: await makeStaff(q, tag, 'author', ['curriculum.read', 'curriculum.write']),
    reviewer: await makeStaff(q, tag, 'reviewer', ['curriculum.read']),
    instructor: await makeStaff(q, tag, 'instructor', ['classes.manage_own']),
    concept: await q.one('select id from concepts order by id limit 1'),
  }));
  srv = await startServer([authRoutes, curriculumRoutes]);
  author = await client(srv.base, fx.author);
  reviewer = await client(srv.base, fx.reviewer);
  instructor = await client(srv.base, fx.instructor);
});

after(async () => {
  if (dbOpts.skip) return;
  srv.close();
  await db.asSystem(async (q) => {
    await q("delete from modules where title like $1", [`%${tag}%`]);
    await q('delete from audit_log where actor_id = any($1)', [[fx.author.id]]);
    await q('delete from users where id = any($1)', [[fx.author.id, fx.reviewer.id, fx.instructor.id]]);
    await q('delete from roles where id = any($1)', [[fx.author.roleId, fx.reviewer.roleId, fx.instructor.roleId]]);
  });
  await db.getPool().end();
});

const check = (title) => ({ type: 'check', title, content: { question: 'Which prints 1 to 5?', choices: ['range(5)', 'range(1, 6)'], answer: 1 } });

test('an author builds and publishes a module through the API alone', dbOpts, async () => {
  const mod = await author('POST', 'modules', { title: `Loops ${tag}`, summary: 'Repeat things' });
  assert.equal(mod.status, 201);
  const tree = (await author('GET', `modules/${mod.json.id}`)).json;
  assert.equal(tree.lessons.length, 1, 'a new module starts with one lesson');
  const lessonId = tree.lessons[0].id;

  const a1 = await author('POST', `lessons/${lessonId}/activities`, { ...check('First'), concept_id: fx.concept.id });
  const a2 = await author('POST', `lessons/${lessonId}/activities`, { type: 'exit', title: 'Second', content: { question: 'What did you learn?' } });
  assert.deepEqual([a1.status, a2.status], [201, 201]);

  const moved = await author('POST', `activities/${a2.json.id}/move`, { dir: -1 });
  assert.deepEqual(moved.json.order, [a2.json.id, a1.json.id]);

  assert.equal((await author('PATCH', `modules/${mod.json.id}`, { published: true })).json.published, true);
  const titles = (await instructor('GET', 'modules')).json.map((m) => m.title);
  assert.ok(titles.includes(`Loops ${tag}`), 'published module is visible to instructors');
});

test('reviewers read drafts but cannot change anything', dbOpts, async () => {
  const draft = (await author('POST', 'modules', { title: `Draft ${tag}` })).json;
  assert.equal((await reviewer('GET', `modules/${draft.id}`)).status, 200);
  assert.equal((await reviewer('POST', 'modules', { title: 'Nope' })).status, 403);
  assert.equal((await reviewer('PATCH', `modules/${draft.id}`, { published: true })).status, 403);
  assert.equal((await reviewer('DELETE', `modules/${draft.id}`, {})).status, 403);
});

test('instructors never see drafts', dbOpts, async () => {
  const draft = (await author('POST', 'modules', { title: `Hidden draft ${tag}` })).json;
  assert.equal((await instructor('GET', `modules/${draft.id}`)).status, 404);
  assert.ok(!(await instructor('GET', 'modules')).json.some((m) => m.id === draft.id));
  assert.equal((await instructor('POST', 'modules', { title: 'Nope' })).status, 403);
});

test('invalid activity content is rejected with the field named', dbOpts, async () => {
  const mod = (await author('POST', 'modules', { title: `Validation ${tag}` })).json;
  const lessonId = (await author('GET', `modules/${mod.id}`)).json.lessons[0].id;
  const badCheck = await author('POST', `lessons/${lessonId}/activities`, { type: 'check', title: 'x', content: { question: 'Q', choices: ['only one'], answer: 0 } });
  assert.equal(badCheck.status, 400);
  const badVideo = await author('POST', `lessons/${lessonId}/activities`, { type: 'video', title: 'x', content: { url: 'https://evil.example/v' } });
  assert.deepEqual([badVideo.status, badVideo.json.field], [400, 'Link']);
  const badConcept = await author('POST', `lessons/${lessonId}/activities`, { ...check('x'), concept_id: 999999 });
  assert.deepEqual([badConcept.status, badConcept.json.field], [400, 'Concept']);
});

test("an activity students have answered can't be deleted", dbOpts, async () => {
  const mod = (await author('POST', 'modules', { title: `Protected ${tag}` })).json;
  const lessonId = (await author('GET', `modules/${mod.id}`)).json.lessons[0].id;
  const act = (await author('POST', `lessons/${lessonId}/activities`, check('Answered'))).json;
  await db.asSystem(async (q) => {
    const cls = await q.one("insert into classes (name, join_code) values ($1, 'ZZ' || substr(md5(random()::text), 1, 4)) returning id", [`Class ${tag}`]);
    const st = await q.one("insert into students (class_id, display_name, pin_hash) values ($1, 'Test Student', 'x') returning id", [cls.id]);
    await q('insert into submissions (student_id, activity_id, completed) values ($1, $2, true)', [st.id, act.id]);
  });
  const del = await author('DELETE', `activities/${act.id}`, {});
  assert.equal(del.status, 403);
  assert.match(del.json.error, /Edit it instead/);
  await db.asSystem((q) => q('delete from classes where name = $1', [`Class ${tag}`]));
});

test('publishing and deleting are recorded in the audit log', dbOpts, async () => {
  const mod = (await author('POST', 'modules', { title: `Audited ${tag}` })).json;
  await author('PATCH', `modules/${mod.id}`, { published: true });
  await author('DELETE', `modules/${mod.id}`, {});
  const actions = await db.asSystem((q) => q("select action from audit_log where entity = 'module' and entity_id = $1 order by id", [String(mod.id)]));
  assert.deepEqual(actions.map((a) => a.action), ['create', 'publish', 'delete']);
});

test('the seeded demo modules are valid and complete', dbOpts, async () => {
  const mods = (await reviewer('GET', 'modules')).json.filter((m) => !m.title.includes(tag));
  if (!mods.length) return; // database without the demo seed
  for (const m of mods) {
    const tree = (await reviewer('GET', `modules/${m.id}`)).json;
    const types = tree.lessons.flatMap((l) => l.activities.map((a) => a.type));
    assert.equal(types[0], 'pretest', `${m.title} starts with a pretest`);
    assert.equal(types.at(-1), 'posttest', `${m.title} ends with a post-test`);
    const questions = tree.lessons.flatMap((l) => l.activities).filter((a) => a.type.endsWith('test')).flatMap((a) => a.content.questions);
    assert.ok(questions.every((qq) => qq.concept_id), `${m.title}: every test question has a concept`);
  }
});
