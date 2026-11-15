#!/usr/bin/env node
// Adds demo data so there is something to teach, try and report on from day one:
//   - modules: db/demo-curriculum.js and db/demo-cic-modules.js
//   - classes, students and their progress: db/demo-classes.js
//
// Safe to run more than once. A module whose title, or a class whose join code,
// already exists is skipped, and progress is only added to a class that has
// none, so CIC's own edits and real student work are never overwritten.
//
//   npm run db:seed
import pg from 'pg';
import { loadEnv } from './env.js';
import { asSystem } from '../server/db.js';
import { activityContent, pin } from '../server/validate.js';
import { hashSecret } from '../server/secrets.js';
import { modules as baseModules } from '../db/demo-curriculum.js';
import { cicModules, extraConcepts } from '../db/demo-cic-modules.js';
import { demoClasses, STORIES, SAMPLE_ANSWERS } from '../db/demo-classes.js';

loadEnv();
if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL (the Neon owner connection string) in .env first.');
  process.exit(1);
}
const demoPin = pin(process.env.DEMO_PIN || '1234');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const DAY = 86_400_000;

async function addModules(q, admin, added, skipped) {
  for (const c of extraConcepts) {
    await q('insert into concepts (key, name) values ($1, $2) on conflict (key) do nothing', [c.key, c.name]);
  }
  const concepts = Object.fromEntries((await q('select key, id from concepts')).map((c) => [c.key, c.id]));
  const conceptId = (key) => {
    if (!key) return null;
    if (!concepts[key]) throw new Error(`Unknown concept "${key}". Run npm run db:setup first.`);
    return concepts[key];
  };
  for (const m of [...baseModules, ...cicModules]) {
    if (await q.one('select 1 from modules where title = $1', [m.title])) { skipped.push(m.title); continue; }
    const mod = await q.one('insert into modules (title, summary, published, created_by) values ($1, $2, true, $3) returning id', [m.title, m.summary, admin?.id ?? null]);
    for (const [li, lesson] of m.lessons.entries()) {
      const l = await q.one('insert into lessons (module_id, title, position) values ($1, $2, $3) returning id', [mod.id, lesson.title, li + 1]);
      for (const [ai, a] of lesson.activities.entries()) {
        // Questions name concepts by key; store ids. Then validate exactly as the API would.
        const raw = { ...a.content };
        if (raw.questions) raw.questions = raw.questions.map(({ concept, ...rest }) => ({ ...rest, concept_id: conceptId(concept) }));
        await q('insert into activities (lesson_id, type, title, position, concept_id, content) values ($1, $2, $3, $4, $5, $6)',
          [l.id, a.type, a.title, ai + 1, conceptId(a.concept), activityContent(a.type, raw)]);
      }
    }
    added.push(m.title);
  }
}

// ---------- Progress stories (see db/demo-classes.js) ----------
const scores = (story, n, i) => ({
  done: [Math.min(n - 1, i % 3), n - (i % 2)],
  ceiling: [n, n],
  negative: [Math.ceil(n * 0.67), Math.floor(n * 0.34)],
  retook: [1, n - 1],
}[story] ?? [i % 3, null]);

const testAnswer = (questions, correct) => ({
  answers: questions.map((qq, k) => (k < correct ? qq.answer : (qq.answer + 1) % qq.choices.length)),
});

async function addProgress(q, classId, studentIds, stories, cls, moduleActs) {
  const rows = [];
  const hints = [];
  for (const [i, studentId] of studentIds.entries()) {
    const raw = stories[i % stories.length];
    const story = Array.isArray(raw) ? { modules: raw } : raw;
    if (story.late) await q('update students set start_position = $2 where id = $1', [studentId, story.late]);
    let clock = Date.now() - (21 - (i % 5)) * DAY; // started 2 to 3 weeks ago
    const at = (minutes) => new Date((clock += minutes * 60_000));

    for (const [mi, kind] of story.modules.entries()) {
      const acts = moduleActs[mi];
      if (!kind || !acts) continue;
      const [pre, post] = scores(kind, acts.find((a) => a.type === 'pretest')?.content.questions.length ?? 3, i);
      const firstCode = acts.findIndex((a) => a.type === 'code');
      const last = { done: acts.length, ceiling: acts.length, negative: acts.length, retook: acts.length,
        'in-progress': 3, 'pretest-only': 1, stuck: firstCode === -1 ? 2 : firstCode }[kind];

      for (const a of acts.slice(0, last)) {
        const time = 60_000 * (2 + ((i * 7 + a.id) % 9));
        if (a.type === 'pretest' || a.type === 'posttest') {
          const qs = a.content.questions;
          const attempts = a.type === 'posttest' && kind === 'retook' ? [Math.max(0, pre - 1), post] : [a.type === 'pretest' ? pre : post];
          for (const correct of attempts) {
            rows.push([studentId, a.id, testAnswer(qs, correct), correct, qs.length, correct === qs.length, true, time, at(15)]);
          }
        } else if (a.type === 'code') {
          rows.push([studentId, a.id, { code: a.content.starter, output: 'All checks passed' }, 1, 1, true, true, time, at(12)]);
        } else if (a.type === 'check') {
          const right = (i + a.id) % 4 !== 0;
          rows.push([studentId, a.id, { choice: right ? a.content.answer : (a.content.answer + 1) % a.content.choices.length }, right ? 1 : 0, 1, right, true, time, at(3)]);
        } else if (a.type === 'worksheet') {
          rows.push([studentId, a.id, { fields: a.content.fields.map((_, k) => SAMPLE_ANSWERS[(i + k) % SAMPLE_ANSWERS.length]) }, null, null, null, true, time, at(10)]);
        } else if (a.type === 'exit') {
          rows.push([studentId, a.id, { text: SAMPLE_ANSWERS[(i + 3) % SAMPLE_ANSWERS.length] }, null, null, null, true, time, at(2)]);
        } else {
          rows.push([studentId, a.id, {}, null, null, null, true, time, at(6)]);
        }
      }

      if (kind === 'stuck' && firstCode !== -1) {
        const a = acts[firstCode];
        const errors = ["NameError: name 'nme' is not defined", 'AssertionError', 'IndentationError: expected an indented block', 'AssertionError'];
        for (const [k, err] of errors.entries()) {
          rows.push([studentId, a.id, { code: a.content.starter, error: err }, 0, 1, false, false, 90_000, at(4)]);
          if (k >= 2 && a.content.hints[k - 2]) {
            hints.push([studentId, a.id, a.concept_id, err, a.content.hints[k - 2], k - 1, at(1)]);
          }
        }
      }
      clock += 2 * DAY; // the next module, a couple of class days later
    }
  }
  for (const r of rows) {
    await q(`insert into submissions (student_id, activity_id, answer, score, max_score, passed, completed, time_ms, created_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, r);
  }
  for (const h of hints) {
    await q(`insert into hint_logs (student_id, activity_id, concept_id, error_text, hint, level, source, created_at)
             values ($1, $2, $3, $4, $5, $6, 'builtin', $7)`, h);
  }
  for (const name of cls.locked ?? []) {
    await q("update students set failed_logins = 5, locked_until = now() + interval '7 days' where class_id = $1 and display_name = $2", [classId, name]);
  }
  return rows.length;
}

async function addClasses(q, added, skipped) {
  const pinHash = await hashSecret(demoPin);
  for (const c of demoClasses) {
    let cls = await q.one('select id from classes where join_code = $1', [c.join_code]);
    if (!cls) {
      const school = await q.one('insert into schools (name) values ($1) on conflict (name) do update set name = excluded.name returning id', [c.school]);
      const cohort = await q.one('insert into cohorts (name) values ($1) on conflict (name) do update set name = excluded.name returning id', [c.cohort]);
      cls = await q.one(
        'insert into classes (name, school_id, cohort_id, join_code, self_join, archived, pace_position) values ($1, $2, $3, $4, $5, $6, $7) returning id',
        [c.name, school.id, cohort.id, c.join_code, c.self_join ?? true, c.archived ?? false, c.pace_position ?? 1]
      );
      for (const [i, title] of c.modules.entries()) {
        await q('insert into class_modules (class_id, module_id, position) select $1, id, $3 from modules where title = $2', [cls.id, title, i + 1]);
      }
      for (const name of c.students) {
        await q('insert into students (class_id, display_name, pin_hash) values ($1, $2, $3)', [cls.id, name, pinHash]);
      }
      added.push(`class ${c.join_code} ${c.name} (${c.students.length} students)`);
    } else {
      skipped.push(`class ${c.join_code}`);
    }

    const has = await q.one('select count(*)::int as n from submissions s join students st on st.id = s.student_id where st.class_id = $1', [cls.id]);
    if (has.n) continue;
    const studentIds = (await q('select id from students where class_id = $1 and display_name = any($2) order by array_position($2, display_name)', [cls.id, c.students])).map((s) => s.id);
    const moduleActs = [];
    for (const title of c.modules) {
      moduleActs.push(await q(
        `select a.id, a.type, a.concept_id, a.content from activities a join lessons l on l.id = a.lesson_id join modules m on m.id = l.module_id
          where m.title = $1 order by l.position, l.id, a.position, a.id`, [title]));
    }
    const n = await addProgress(q, cls.id, studentIds, c.stories ?? STORIES, c, moduleActs);
    added.push(`progress for ${c.join_code} (${n} submissions)`);
  }
}

const summary = await asSystem(async (q) => {
  const admin = await q.one("select u.id from users u join roles r on r.id = u.role_id where r.key = 'admin' order by u.id limit 1");
  const added = [];
  const skipped = [];
  await addModules(q, admin, added, skipped);
  await addClasses(q, added, skipped);
  return { added, skipped };
}, pool);

await pool.end();
for (const t of summary.added) console.log(`  added    ${t}`);
for (const t of summary.skipped) console.log(`  skipped  ${t} (already exists)`);
console.log(`Demo data: ${summary.added.length} added, ${summary.skipped.length} skipped. Students sign in with PIN ${demoPin}.`);
console.log(`Try it: /join.html?code=${demoClasses[0].join_code}`);
