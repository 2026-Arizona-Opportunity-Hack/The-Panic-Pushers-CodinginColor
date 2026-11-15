// The student path: journey map, module player data, server grading, unlocking,
// hints, and answer keys that never reach the browser.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dbOpts, newTag, startServer, client } from './helpers.js';

const tag = newTag();
const code = `T${tag.slice(0, 5).toUpperCase().replace(/[01IO]/g, 'Z').replace(/[^A-HJ-KM-NP-Z2-9]/g, 'Q')}`;
let srv, db, fx, me;

before(async () => {
  if (dbOpts.skip) return;
  db = await import('../server/db.js');
  const { hashSecret } = await import('../server/secrets.js');
  fx = await db.asSystem(async (q) => {
    const mods = [];
    for (const n of [1, 2]) {
      const m = await q.one("insert into modules (title, published) values ($1, true) returning id", [`Path ${n} ${tag}`]);
      const l = await q.one("insert into lessons (module_id, title, position) values ($1, 'L', 1) returning id", [m.id]);
      const acts = {};
      const add = async (type, title, content, pos) => (acts[type] = (await q.one(
        'insert into activities (lesson_id, type, title, position, content) values ($1, $2, $3, $4, $5) returning id', [l.id, type, title, pos, content])).id);
      await add('pretest', 'Pre', { questions: [{ question: 'Q', choices: ['a', 'b'], answer: 1 }] }, 1);
      await add('check', 'Check', { question: 'Which?', choices: ['x', 'y', 'z'], answer: 2, explanation: 'Because z.' }, 2);
      await add('code', 'Code', { prompt: 'Print hi', expected_output: 'hi', hints: ['Author hint one'] }, 3);
      await add('posttest', 'Post', { questions: [{ question: 'Q', choices: ['a', 'b'], answer: 1 }] }, 4);
      mods.push({ id: m.id, acts });
    }
    const cls = await q.one('insert into classes (name, join_code) values ($1, $2) returning id', [`Path ${tag}`, code]);
    for (const [i, m] of mods.entries()) await q('insert into class_modules values ($1, $2, $3)', [cls.id, m.id, i + 1]);
    const st = await q.one("insert into students (class_id, display_name, pin_hash) values ($1, 'Pat T.', $2) returning id", [cls.id, await hashSecret('4321')]);
    return { mods, cls, st };
  });
  srv = await startServer([(await import('../server/routes/auth.js')).default, (await import('../server/routes/student.js')).default]);
  me = await client(srv.base, { student: { code, id: fx.st.id, pin: '4321' } });
});

after(async () => {
  if (dbOpts.skip) return;
  srv.close();
  await db.asSystem(async (q) => {
    await q('delete from classes where id = $1', [fx.cls.id]);
    await q('delete from modules where title like $1', [`%${tag}%`]);
  });
  await db.getPool().end();
});

test('journey map: first module open, second locked, status Not started', dbOpts, async () => {
  const r = (await me('GET', 'me/learn')).json;
  assert.deepEqual(r.modules.map((m) => m.unlocked), [true, false]);
  assert.equal(r.summary.status, 'Not started');
  assert.equal(r.summary.start_module_id, fx.mods[0].id);
  assert.equal((await me('GET', `me/modules/${fx.mods[1].id}`)).status, 403);
});

test('answer keys and author hints never reach the browser', dbOpts, async () => {
  const body = JSON.stringify((await me('GET', `me/modules/${fx.mods[0].id}`)).json);
  assert.ok(!body.includes('"answer"'), 'no answer keys');
  assert.ok(!body.includes('Because z.'), 'no explanations before answering');
  assert.ok(!body.includes('Author hint one'), 'no author hints up front');
});

test('activities unlock in order and are graded on the server', dbOpts, async () => {
  const a = fx.mods[0].acts;
  assert.equal((await me('POST', `me/activities/${a.check}/submit`, { answer: { choice: 2 } })).status, 403, 'check is locked until the pretest is done');
  const pre = (await me('POST', `me/activities/${a.pretest}/submit`, { answer: { choices: [0] } })).json;
  assert.deepEqual([pre.score, pre.max_score], [0, 1]);
  assert.equal((await me('POST', `me/activities/${a.pretest}/submit`, { answer: { choices: [1] } })).status, 409, 'no pretest retakes');
  const wrong = (await me('POST', `me/activities/${a.check}/submit`, { answer: { choice: 0 } })).json;
  assert.deepEqual([wrong.passed, wrong.feedback.answer, wrong.feedback.explanation], [false, 2, 'Because z.']);
});

test('hints climb the ladder: author hints first, then built-in nudges', dbOpts, async () => {
  const a = fx.mods[0].acts;
  const h1 = (await me('POST', `me/activities/${a.code}/hint`, { error: 'NameError' })).json;
  const h2 = (await me('POST', `me/activities/${a.code}/hint`, {})).json;
  assert.deepEqual([h1.hint, h1.source, h2.source, h2.hint_number], ['Author hint one', 'author', 'builtin', 2]);
});

test('finishing a module unlocks the next and reports gain', dbOpts, async () => {
  const a = fx.mods[0].acts;
  await me('POST', `me/activities/${a.code}/submit`, { answer: { code: 'print("hi")', output: 'hi', passed: true } });
  const post = (await me('POST', `me/activities/${a.posttest}/submit`, { answer: { choices: [1] } })).json;
  assert.equal(post.feedback.gain_points, 100);
  const r = (await me('GET', 'me/learn')).json;
  assert.deepEqual(r.modules.map((m) => [m.unlocked, m.complete]), [[true, true], [true, false]]);
  assert.equal(r.summary.status, 'In progress');
});
