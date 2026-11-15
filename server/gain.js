// Learning gain, as CIC reports it to funders. Kept in one place so the
// dashboard, CSV export, impact report and read API all agree.
//
//   raw gain        post% - pre%                      (percentage points)
//   normalized gain (post% - pre%) / (100 - pre%)     (share of the room to grow
//                                                      that the student used)
//
// A student counts only with both a pretest and a post-test. Someone who scored
// 100% on the pretest has no room to grow, so their normalized gain is blank
// (null) and they're left out of the class normalized average, but their raw gain
// still counts. Retakes: use the first pretest and the latest post-test.

const pct = (score, max) => (100 * score) / max;
const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

/** One student. Returns { included, reason, pre, post, gain, normalized }. */
export function learningGain({ pre, preMax, post, postMax }) {
  const has = (s, m) => s !== null && s !== undefined && s !== '' && Number(m) > 0;
  if (!has(pre, preMax)) return { included: false, reason: 'no pretest' };
  if (!has(post, postMax)) return { included: false, reason: 'no post-test' };
  const p0 = pct(Number(pre), Number(preMax));
  const p1 = pct(Number(post), Number(postMax));
  if (p0 > 100 || p1 > 100 || p0 < 0 || p1 < 0) return { included: false, reason: 'score out of range' };
  return {
    included: true,
    reason: p0 === 100 ? 'ceiling: no room to grow' : '',
    pre: round(p0, 1),
    post: round(p1, 1),
    gain: round(p1 - p0, 1),
    normalized: p0 === 100 ? null : round((p1 - p0) / (100 - p0), 2),
  };
}

/** A group (class, cohort, concept). Averages over included students only. */
export function summarizeGain(rows) {
  const results = rows.map(learningGain);
  const used = results.filter((r) => r.included);
  const norm = used.filter((r) => r.normalized !== null);
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const a = (xs, places) => (xs.length ? round(avg(xs), places) : null);
  return {
    students: rows.length,
    counted: used.length,
    avg_pre: a(used.map((r) => r.pre), 1),
    avg_post: a(used.map((r) => r.post), 1),
    avg_gain: a(used.map((r) => r.gain), 1),
    avg_normalized: a(norm.map((r) => r.normalized), 2),
    improved: used.filter((r) => r.gain > 0).length,
  };
}
