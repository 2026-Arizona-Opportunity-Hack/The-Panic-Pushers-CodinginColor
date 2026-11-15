// Classes for instructors: see who needs help today, set the class pace, reset
// PINs and place late joiners. Instructors see only their own classes; roles
// with classes.manage_all (CIC staff) see every class.
import { hasPerm } from '../auth.js';
import { audit } from '../db.js';
import { notFound, forbidden } from '../http.js';
import { hashSecret, newPin } from '../secrets.js';
import { loadClassProgress } from '../progress.js';
import { summarizeGain } from '../gain.js';
import * as v from '../validate.js';

const T = { auth: 'staff', perm: ['classes.manage_own', 'classes.manage_all'] };
const seesAll = (principal) => hasPerm(principal, 'classes.manage_all');

async function getClassFor(q, principal, classId) {
  const cls = await q.one('select id, instructor_id from classes where id = $1', [classId]);
  if (!cls) throw notFound('No such class');
  if (!seesAll(principal) && cls.instructor_id !== principal.user.id) throw forbidden('This is not one of your classes');
  return cls;
}

async function getStudentFor(q, principal, studentId) {
  const s = await q.one('select id, class_id, display_name from students where id = $1', [studentId]);
  if (!s) throw notFound('No such student');
  await getClassFor(q, principal, s.class_id);
  return s;
}

/** Who needs the teacher today, most urgent first, each with the reason in plain words. */
function todayList(data, locked) {
  const actById = new Map(data.modules.flatMap((m) => m.activities.map((a) => [a.id, { ...a, module: m.title }])));
  const items = [];
  for (const s of data.students) {
    const sum = s.summary;
    if (locked.has(s.id)) {
      items.push({ kind: 'locked', student_id: s.id, name: s.display_name, reason: 'Locked out after 5 wrong PINs. Reset their PIN.' });
    }
    if (sum.stuck) {
      const act = actById.get(sum.current_activity_id);
      const st = s.modules.flatMap((m) => m.activities).find((a) => a.id === sum.current_activity_id);
      items.push({
        kind: 'stuck', student_id: s.id, name: s.display_name,
        reason: `Stuck on "${act?.title ?? 'a step'}" (${act?.module ?? ''}): ${st?.fails ?? 0} failed tries, ${st?.hints ?? 0} hints.`,
      });
    } else if (sum.not_started) {
      items.push({ kind: 'not_started', student_id: s.id, name: s.display_name, reason: 'Joined but has not started. Check they can sign in.' });
    } else if (sum.behind_modules > 0) {
      items.push({ kind: 'behind', student_id: s.id, name: s.display_name, reason: `${sum.behind_modules} module${sum.behind_modules > 1 ? 's' : ''} behind the class.` });
    }
  }
  const order = { locked: 0, stuck: 1, not_started: 2, behind: 3 };
  return items.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
}

export default function register(route) {
  route('GET', 'classes', T, async ({ q, principal }) =>
    q(
      `select c.id, c.name, c.join_code, c.pace_position, c.archived, c.self_join, s.name as school, co.name as cohort,
              (select count(*)::int from students st where st.class_id = c.id) as students,
              (select count(*)::int from class_modules cm where cm.class_id = c.id) as modules,
              (select m.title from class_modules cm join modules m on m.id = cm.module_id
                where cm.class_id = c.id and cm.position = c.pace_position) as pace_module
         from classes c left join schools s on s.id = c.school_id left join cohorts co on co.id = c.cohort_id
        where $1 or c.instructor_id = $2
        order by c.archived, c.name`,
      [seesAll(principal), principal.user.id]
    ));

  route('GET', 'classes/:id', T, async ({ q, params, principal }) => {
    const { id } = await getClassFor(q, principal, v.id(params.id, 'Class'));
    const data = await loadClassProgress(q, id);
    const meta = await q.one(
      `select s.name as school, co.name as cohort, c.archived from classes c
         left join schools s on s.id = c.school_id left join cohorts co on co.id = c.cohort_id where c.id = $1`, [id]);
    Object.assign(data.class, meta);
    const locked = new Set((await q('select id from students where class_id = $1 and locked_until > now()', [id])).map((r) => r.id));
    for (const s of data.students) s.locked = locked.has(s.id);
    data.today = todayList(data, locked);
    // Learning gain per module, with the same rules as every other report (server/gain.js).
    data.gain = data.modules.map((m, i) => ({
      module_id: m.id,
      title: m.title,
      ...summarizeGain(data.students.map((s) => ({ pre: s.modules[i].pre, preMax: 1, post: s.modules[i].post, postMax: 1 }))),
    }));
    return data;
  });

  route('PATCH', 'classes/:id', T, async ({ q, params, body, principal }) => {
    const { id } = await getClassFor(q, principal, v.id(params.id, 'Class'));
    const n = await q.one('select count(*)::int as n from class_modules where class_id = $1', [id]);
    const pace = v.int(body.pace_position, 'Class pace', { min: 1, max: Math.max(1, n.n), optional: true });
    const r = await q.one(
      `update classes set pace_position = coalesce($2, pace_position), self_join = coalesce($3, self_join)
        where id = $1 returning pace_position, self_join`,
      [id, pace, v.bool(body.self_join, 'Self join', { optional: true })]
    );
    if (pace !== null) await audit(q, principal.user.id, 'set_pace', 'class', id, { pace_position: pace });
    return r;
  });

  // New PIN, shown once to the teacher. Also unlocks the student and signs out
  // any device still using the old PIN.
  route('POST', 'students/:id/reset-pin', T, async ({ q, params, principal }) => {
    const s = await getStudentFor(q, principal, v.id(params.id, 'Student'));
    const pin = newPin();
    await q('update students set pin_hash = $2, failed_logins = 0, locked_until = null where id = $1', [s.id, await hashSecret(pin)]);
    await q('delete from sessions where student_id = $1', [s.id]);
    await audit(q, principal.user.id, 'reset_pin', 'student', s.id, { name: s.display_name });
    return { display_name: s.display_name, pin };
  });

  // Place a late joiner at a module (1 = first), or clear it with null.
  route('PATCH', 'students/:id', T, async ({ q, params, body, principal }) => {
    const s = await getStudentFor(q, principal, v.id(params.id, 'Student'));
    const start = body.start_position === null ? null : v.int(body.start_position, 'Start module', { min: 1, max: 100 });
    await q('update students set start_position = $2 where id = $1', [s.id, start]);
    await audit(q, principal.user.id, 'place_student', 'student', s.id, { start_position: start });
    return { ok: true };
  });

  // What a student actually wrote (worksheets, exit tickets, code) and which hints they got.
  route('GET', 'students/:id/work', T, async ({ q, params, principal }) => {
    const s = await getStudentFor(q, principal, v.id(params.id, 'Student'));
    const work = await q(
      `select distinct on (sub.activity_id) sub.activity_id, a.title, a.type, a.content, m.title as module, l.position as lesson_pos, a.position as act_pos,
              sub.answer, sub.score, sub.max_score, sub.passed, sub.created_at,
              (select count(*)::int from submissions x where x.student_id = sub.student_id and x.activity_id = sub.activity_id) as attempts
         from submissions sub join activities a on a.id = sub.activity_id
         join lessons l on l.id = a.lesson_id join modules m on m.id = l.module_id
        where sub.student_id = $1
        order by sub.activity_id, sub.created_at desc`,
      [s.id]
    );
    const hints = await q(
      `select h.created_at, h.hint, h.error_text, h.source, h.level, a.title as activity
         from hint_logs h join activities a on a.id = h.activity_id
        where h.student_id = $1 order by h.created_at desc limit 50`,
      [s.id]
    );
    // Only what a teacher needs to read the answer; never the full activity content.
    const shaped = work
      .sort((x, y) => new Date(y.created_at) - new Date(x.created_at))
      .map(({ content, ...w }) => ({ ...w, fields: content.fields?.map((f) => f.label) ?? null, question: content.question ?? null }));
    return { student: s, work: shaped, hints };
  });
}
