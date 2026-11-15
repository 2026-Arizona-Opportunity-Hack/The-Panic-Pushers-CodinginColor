// Student side: follow modules like a code.org lesson, submit work, get hints.
// Every query here runs as app.actor_kind='student', so RLS limits it to the
// signed-in student's own rows. Answer keys never leave the server: checks,
// pretests and post-tests are graded here.

// Hint ladder used until AI hints are switched on: the author's hints for the
// exercise in order, then general nudges that never give the answer away.
const BUILTIN_HINTS = [
  'Read the last line of the error first: it says what went wrong. The line number says where to look.',
  'Compare your output with the expected output character by character: spaces, capitals and punctuation all count.',
  'Try the smallest change you can, run it, and see what is different. Small steps, run often.',
  'Explain your code out loud, line by line, to a partner or your teacher. The bug often shows up while you talk.',
];
import { HttpError, bad, notFound, forbidden } from '../http.js';
import { loadClassProgress } from '../progress.js';
import { loadModuleTree } from './curriculum.js';
import * as v from '../validate.js';

const S = { auth: 'student' };
const MAX_CODE_TRIES_BEFORE_MOVE_ON = 5;

async function myProgress(q, principal) {
  const data = await loadClassProgress(q, principal.student.class_id, principal.student.id);
  const me = data.students[0];
  if (!me) throw notFound();
  return { data, me };
}

function findActivity(data, me, activityId) {
  for (const [mi, m] of data.modules.entries()) {
    const ai = m.activities.findIndex((a) => a.id === activityId);
    if (ai >= 0) return { module: m, def: m.activities[ai], state: me.modules[mi].activities[ai], moduleState: me.modules[mi] };
  }
  return null;
}

/** Remove answer keys and author hints before content goes to a student's browser. */
function forStudent(activity) {
  const c = { ...activity.content };
  if (activity.type === 'check') { delete c.answer; delete c.explanation; }
  if (activity.type === 'pretest' || activity.type === 'posttest') c.questions = (c.questions || []).map(({ question, choices }) => ({ question, choices }));
  if (activity.type === 'code') { c.has_author_hints = (c.hints || []).length > 0; delete c.hints; }
  return { id: activity.id, type: activity.type, title: activity.title, concept: activity.concept, content: c };
}

export default function register(route) {
  route('GET', 'me/learn', S, async ({ q, principal }) => {
    const { data, me } = await myProgress(q, principal);
    return {
      student: { id: me.id, display_name: me.display_name },
      class: { name: data.class.name, pace_position: data.class.pace_position },
      modules: data.modules.map((m, i) => ({
        ...me.modules[i], id: m.id, title: m.title, position: m.position, activities: undefined,
      })),
      summary: me.summary,
    };
  });

  route('GET', 'me/modules/:id', S, async ({ q, principal, params }) => {
    const moduleId = v.id(params.id, 'Module');
    const { data, me } = await myProgress(q, principal);
    const idx = data.modules.findIndex((m) => m.id === moduleId);
    if (idx < 0) throw notFound('This module is not part of your class');
    const state = me.modules[idx];
    if (!state.unlocked) throw forbidden('Finish the previous module first to unlock this one');
    const tree = await loadModuleTree(q, moduleId);
    const latest = await q(
      `select distinct on (activity_id) activity_id, answer, score, max_score, passed, completed
         from submissions where student_id = $1 and activity_id = any($2::int[])
        order by activity_id, created_at desc`,
      [me.id, state.activities.map((a) => a.id)]
    );
    const latestMap = new Map(latest.map((l) => [l.activity_id, l]));
    const statusMap = new Map(state.activities.map((a) => [a.id, a]));
    const next = data.modules[idx + 1];
    return {
      id: tree.id, title: tree.title, summary: tree.summary, complete: state.complete,
      next_module: next ? { id: next.id, title: next.title, unlocked: me.modules[idx + 1].unlocked } : null,
      lessons: tree.lessons.map((l) => ({
        id: l.id, title: l.title,
        activities: l.activities.map((a) => ({ ...forStudent(a), state: statusMap.get(a.id), last: latestMap.get(a.id) || null })),
      })),
    };
  });

  route('POST', 'me/activities/:id/submit', S, async ({ q, principal, params, body }) => {
    const activityId = v.id(params.id, 'Activity');
    const { data, me } = await myProgress(q, principal);
    const found = findActivity(data, me, activityId);
    if (!found) throw notFound('This activity is not part of your class');
    if (found.state.status === 'locked') throw forbidden('Finish the earlier steps first');
    const a = await q.one('select id, type, content from activities where id = $1', [activityId]);
    const c = a.content;
    const ans = body.answer ?? {};
    const timeMs = v.int(body.time_ms ?? 0, 'Time', { min: 0, max: 6 * 3600 * 1000 });
    let score = null, max = null, passed = null, completed = true;
    const feedback = {};

    switch (a.type) {
      case 'slides': case 'video': case 'reading':
        break;
      case 'check': {
        const choice = v.int(ans.choice, 'Your answer', { min: 0, max: c.choices.length - 1 });
        passed = choice === c.answer; score = passed ? 1 : 0; max = 1;
        Object.assign(feedback, { correct: passed, answer: c.answer, explanation: c.explanation || '' });
        break;
      }
      case 'pretest': case 'posttest': {
        if (found.state.status === 'done') throw new HttpError(409, `You already took this ${a.type === 'pretest' ? 'pretest' : 'post-test'}.`);
        if (!Array.isArray(ans.choices) || ans.choices.length !== c.questions.length) throw bad('Answer every question');
        score = c.questions.reduce((n, qq, i) => n + (Number(ans.choices[i]) === qq.answer ? 1 : 0), 0);
        max = c.questions.length; passed = null;
        feedback.score = score; feedback.max = max;
        if (a.type === 'posttest') {
          const modState = found.moduleState;
          if (modState.pre !== null) feedback.gain_points = Math.round((score / max - modState.pre) * 100);
        }
        break;
      }
      case 'worksheet': {
        if (!Array.isArray(ans.fields) || ans.fields.length !== c.fields.length) throw bad('Fill in every part of the worksheet');
        ans.fields = ans.fields.map((f, i) => v.str(String(f ?? ''), `Part ${i + 1}`, { max: 5000 }));
        break;
      }
      case 'exit': {
        ans.text = v.str(ans.text, 'Your answer', { max: 2000 });
        break;
      }
      case 'code': {
        // Code runs and is checked in the student's browser (Pyodide). We store the
        // code and the reported result; see README "Known gaps".
        ans.code = v.str(ans.code, 'Code', { max: 20_000 });
        ans.output = typeof ans.output === 'string' ? ans.output.slice(0, 5000) : '';
        passed = v.bool(ans.passed, 'Passed');
        score = passed ? 1 : 0; max = 1;
        completed = passed || found.state.attempts + 1 >= MAX_CODE_TRIES_BEFORE_MOVE_ON;
        if (!passed && completed) feedback.moved_on = true;
        break;
      }
      default:
        throw bad('Unknown activity');
    }

    await q(
      `insert into submissions (student_id, activity_id, answer, score, max_score, passed, completed, time_ms)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [me.id, activityId, ans, score, max, passed, completed, timeMs]
    );
    return { completed, passed, score, max_score: max, feedback };
  });

  route('POST', 'me/activities/:id/hint', S, async ({ q, principal, params, body }) => {
    const activityId = v.id(params.id, 'Activity');
    const { data, me } = await myProgress(q, principal);
    const found = findActivity(data, me, activityId);
    if (!found) throw notFound('This activity is not part of your class');
    if (found.state.status === 'locked') throw forbidden('Finish the earlier steps first');
    const a = await q.one('select id, type, concept_id, content from activities where id = $1', [activityId]);
    if (a.type !== 'code') throw bad('Hints are available on coding activities');
    const recent = await q.one(`select count(*)::int as n from hint_logs where student_id = $1 and created_at > now() - interval '1 hour'`, [me.id]);
    if (recent.n >= 20) throw new HttpError(429, 'You have asked for a lot of hints this hour. Try the step again, or ask your instructor.');
    const prior = await q('select hint from hint_logs where student_id = $1 and activity_id = $2 order by created_at', [me.id, activityId]);

    const error = typeof body.error === 'string' ? body.error.slice(0, 1000) : '';
    const ladder = [...(a.content.hints || []).map((h) => ({ hint: h, source: 'author' })), ...BUILTIN_HINTS.map((h) => ({ hint: h, source: 'builtin' }))];
    const { hint, source } = ladder[Math.min(prior.length, ladder.length - 1)];
    await q(
      'insert into hint_logs (student_id, activity_id, concept_id, error_text, hint, level, source) values ($1, $2, $3, $4, $5, $6, $7)',
      [me.id, activityId, a.concept_id, error || null, hint, prior.length + 1, source]
    );
    return { hint, source, hint_number: prior.length + 1 };
  });
}
