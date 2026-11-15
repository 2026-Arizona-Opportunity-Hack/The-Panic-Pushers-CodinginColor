// Learning gain matches the hand-checked fixture in samples/learning-gain-fixture.csv.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { learningGain, summarizeGain } from '../server/gain.js';

const lines = readFileSync(new URL('../samples/learning-gain-fixture.csv', import.meta.url), 'utf8').trim().split('\n');
const head = lines[0].split(',');
const rows = lines.slice(1).map((l) => Object.fromEntries(l.split(',').map((v, i) => [head[i], v])));
const input = (r) => ({ pre: r.pre_score, preMax: r.pre_max, post: r.post_score, postMax: r.post_max });

for (const r of rows) {
  test(`gain: ${r.student} (${r.case})`, () => {
    const g = learningGain(input(r));
    assert.equal(g.included, r.expected_included === 'yes');
    assert.equal(g.reason, r.expected_reason);
    if (!g.included) return;
    assert.equal(g.gain, Number(r.expected_gain_pts));
    assert.equal(g.normalized, r.expected_normalized === '' ? null : Number(r.expected_normalized));
  });
}

test('class summary counts only students with both tests and skips ceiling in normalized', () => {
  const s = summarizeGain(rows.map(input));
  assert.deepEqual(s, {
    students: 14, counted: 10,
    avg_pre: 43.3, avg_post: 60, avg_gain: 16.7, avg_normalized: 0.28, improved: 4,
  });
});
