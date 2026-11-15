// Progress, unlocking and learning gain, computed from raw submissions.
//
// Unlock rules (agreed with CIC's success criteria):
//  * Activities inside a module unlock one after another.
//  * A module unlocks when the previous module is complete, OR when the class
//    pace has reached it. So a student who joins in week 3 is dropped straight
//    into the module the class is on and can catch up on earlier ones.
//  * "Start here" = the first unfinished, unlocked module at or after the class
//    pace (or the earliest unfinished one if the student is ahead).
//  * An instructor can place a student further on (students.start_position):
//    modules before it count as unlocked, so a late joiner starts in the right place.
//
// Roster status uses CIC's own words: Not started / In progress / Complete / Stuck.
//
// Learning gain = post-test % minus pretest % for each module, per student,
// averaged per class over students who took both.

export async function loadClassProgress(q, classId, onlyStudentId = null) {
  const cls = await q.one('select id, name, pace_position, join_code, self_join, instructor_id, school_id from classes where id = $1', [classId]);
  if (!cls) return null;

  const rows = await q(
    `select cm.position as module_position, m.id as module_id, m.title as module_title,
            a.id as activity_id, a.type, a.title, a.concept_id, c.name as concept
       from class_modules cm
       join modules m on m.id = cm.module_id
       join lessons l on l.module_id = m.id
       join activities a on a.lesson_id = l.id
       left join concepts c on c.id = a.concept_id
      where cm.class_id = $1
      order by cm.position, l.position, l.id, a.position, a.id`,
    [classId]
  );
  const modules = [];
  for (const r of rows) {
    let m = modules[modules.length - 1];
    if (!m || m.id !== r.module_id) {
      m = { id: r.module_id, title: r.module_title, position: r.module_position, activities: [] };
      modules.push(m);
    }
    m.activities.push({ id: r.activity_id, type: r.type, title: r.title, concept_id: r.concept_id, concept: r.concept });
  }
  // Modules assigned but still empty still count for ordering
  const assigned = await q(
    `select cm.position, m.id, m.title from class_modules cm join modules m on m.id = cm.module_id where cm.class_id = $1 order by cm.position`,
    [classId]
  );
  for (const a of assigned) if (!modules.find((m) => m.id === a.id)) modules.push({ id: a.id, title: a.title, position: a.position, activities: [] });
  modules.sort((a, b) => a.position - b.position);

  const students = await q(
    `select id, display_name, start_position, last_seen_at, created_at from students where class_id = $1 ${onlyStudentId ? 'and id = $2' : ''} order by display_name`,
    onlyStudentId ? [classId, onlyStudentId] : [classId]
  );
  const ids = students.map((s) => s.id);
  const subs = ids.length
    ? await q(
        `select student_id, activity_id, bool_or(completed) as completed, bool_or(passed) as passed,
                count(*)::int as attempts, count(*) filter (where passed = false)::int as fails,
                max(case when max_score > 0 then score / max_score end)::float as best,
                coalesce(sum(time_ms), 0)::int as time_ms, max(created_at) as last_at
           from submissions where student_id = any($1::int[]) group by 1, 2`,
        [ids]
      )
    : [];
  const hints = ids.length
    ? await q(`select student_id, activity_id, count(*)::int as n from hint_logs where student_id = any($1::int[]) group by 1, 2`, [ids])
    : [];
  const key = (s, a) => `${s}:${a}`;
  const subMap = new Map(subs.map((s) => [key(s.student_id, s.activity_id), s]));
  const hintMap = new Map(hints.map((h) => [key(h.student_id, h.activity_id), h.n]));

  const pace = cls.pace_position;
  for (const st of students) {
    const placed = Math.max(pace, st.start_position ?? 0);
    let prevComplete = true;
    let doneCount = 0;
    let total = 0;
    let timeMs = 0;
    let lastAt = null;
    st.modules = modules.map((m, idx) => {
      const unlocked = idx === 0 || prevComplete || m.position <= placed;
      let prevAct = true;
      const acts = m.activities.map((a) => {
        const s = subMap.get(key(st.id, a.id));
        const h = hintMap.get(key(st.id, a.id)) || 0;
        const completed = !!s?.completed;
        const status = completed ? 'done' : unlocked && prevAct ? 'current' : 'locked';
        prevAct = completed;
        total++;
        if (completed) doneCount++;
        if (s) {
          timeMs += s.time_ms;
          if (!lastAt || s.last_at > lastAt) lastAt = s.last_at;
        }
        return { id: a.id, status, attempts: s?.attempts || 0, fails: s?.fails || 0, best: s?.best ?? null, hints: h };
      });
      const complete = m.activities.length > 0 && acts.every((a) => a.status === 'done');
      prevComplete = complete;
      const pre = m.activities.find((a) => a.type === 'pretest');
      const post = m.activities.find((a) => a.type === 'posttest');
      const preScore = pre ? subMap.get(key(st.id, pre.id))?.best ?? null : null;
      const postScore = post ? subMap.get(key(st.id, post.id))?.best ?? null : null;
      return {
        id: m.id, unlocked, complete, behind: !complete && m.position < pace,
        done: acts.filter((a) => a.status === 'done').length, total: acts.length,
        pre: preScore, post: postScore, gain: preScore !== null && postScore !== null ? postScore - preScore : null,
        activities: acts,
      };
    });
    const open = st.modules.filter((m, i) => m.unlocked && !m.complete && modules[i].activities.length);
    const start = open.find((m) => modules[st.modules.indexOf(m)].position >= placed) || open[0] || null;
    const current = start?.activities.find((a) => a.status === 'current') || null;
    const gains = st.modules.map((m) => m.gain).filter((g) => g !== null);
    st.summary = {
      done: doneCount, total, pct: total ? doneCount / total : 0,
      start_module_id: start?.id ?? null,
      current_activity_id: current?.id ?? null,
      gain: gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : null,
      time_ms: timeMs, last_activity_at: lastAt,
      not_started: doneCount === 0 && !subs.some((s) => s.student_id === st.id),
      stuck: !!current && (current.fails >= 3 || current.hints >= 2),
      behind_modules: st.modules.filter((m) => m.behind).length,
    };
    const s = st.summary;
    s.status = s.not_started ? 'Not started' : s.stuck ? 'Stuck' : total && doneCount === total ? 'Complete' : 'In progress';
  }

  // Class-level learning gain per module
  const moduleStats = modules.map((m, i) => {
    const pairs = students.map((s) => s.modules[i]).filter((x) => x.gain !== null);
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    return {
      id: m.id, title: m.title, position: m.position,
      completed: students.filter((s) => s.modules[i].complete).length,
      avg_pre: avg(pairs.map((x) => x.pre)), avg_post: avg(pairs.map((x) => x.post)),
      avg_gain: avg(pairs.map((x) => x.gain)), n_pairs: pairs.length,
    };
  });

  // Concept mastery: who struggled (a failed try or asked for a hint) per concept
  const conceptMap = new Map();
  modules.forEach((m, mi) => m.activities.forEach((a, ai) => {
    if (!a.concept_id) return;
    if (!conceptMap.has(a.concept_id)) conceptMap.set(a.concept_id, { id: a.concept_id, name: a.concept, attempted: new Set(), struggled: new Set() });
    const c = conceptMap.get(a.concept_id);
    for (const s of students) {
      const x = s.modules[mi].activities[ai];
      if (x.attempts || x.hints) c.attempted.add(s.id);
      if (x.fails || x.hints) c.struggled.add(s.id);
    }
  }));
  const concepts = [...conceptMap.values()]
    .map((c) => ({ id: c.id, name: c.name, attempted: c.attempted.size, struggled: c.struggled.size, pct: c.attempted.size ? c.struggled.size / c.attempted.size : 0 }))
    .sort((a, b) => b.pct - a.pct);

  const avgGainStudents = students.map((s) => s.summary.gain).filter((g) => g !== null);
  return {
    class: cls,
    modules: modules.map((m) => ({ ...m, activities: m.activities })),
    students,
    module_stats: moduleStats,
    concepts,
    totals: {
      students: students.length,
      avg_completion: students.length ? students.reduce((a, s) => a + s.summary.pct, 0) / students.length : 0,
      avg_gain: avgGainStudents.length ? avgGainStudents.reduce((a, b) => a + b, 0) / avgGainStudents.length : null,
      stuck: students.filter((s) => s.summary.stuck).length,
      not_started: students.filter((s) => s.summary.not_started).length,
    },
  };
}
