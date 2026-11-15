// Class dashboard: Today (who needs the teacher first), learning gain, and the
// roster with CIC's four statuses. Actions: set pace, reset PIN, place a late
// joiner, read a student's work.
import { $, $$, html, render } from '../ui/html.js';
import { icon, fillIcons } from '../ui/icons.js';
import { renderShell } from '../ui/shell.js';
import { createDialog, openDialog, closeDialog, confirmDialog, toast, setBusy } from '../ui/components.js';
import { api, requireStaff } from '../ui/api.js';

fillIcons();
await renderShell({ current: '/class.html' });
await requireStaff();

const classId = Number(new URLSearchParams(location.search).get('id'));
let data;
let filter = 'All';

const STATUS_BADGE = { 'Not started': 'badge', 'In progress': 'badge badge-info', Complete: 'badge badge-ok', Stuck: 'badge badge-warn' };
const TODAY = {
  locked: ['lock', 'Locked out', 'badge badge-bad'],
  stuck: ['alert', 'Stuck', 'badge badge-warn'],
  not_started: ['clock', 'Not started', 'badge'],
  behind: ['arrow-down', 'Behind', 'badge badge-info'],
};
const pct = (x) => (x === null || x === undefined ? '–' : `${Math.round(x * 100)}%`);
const ago = (t) => {
  if (!t) return 'Never';
  const d = Math.round((Date.now() - new Date(t)) / 86_400_000);
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`;
};

async function load() {
  data = await api.get(`classes/${classId}`);
  draw();
}

function draw() {
  const c = data.class;
  document.title = `${c.name} · CIC Classroom`;
  $('#class-title').textContent = c.name;
  $('#class-meta').textContent = [c.school, c.cohort].filter(Boolean).join(' · ') || 'Class';

  // Join code + pace
  render($('#class-tools'), html`
    ${c.archived ? html`<span class="badge badge-warn">Archived</span>` : html`<span class="join-chip"><span class="muted text-sm">Join code</span> <strong class="code-chip">${c.join_code}</strong>
      <button class="btn btn-ghost btn-sm" type="button" id="copy-link">${icon('copy')} Copy link</button></span>`}
    <label class="pace"><span class="text-sm">${icon('flag')} Class is on</span>
      <select class="input input-sm" id="pace">${data.modules.map((m) => html`<option value="${m.position}" ${m.position === c.pace_position ? html`selected` : ''}>Module ${m.position}: ${m.title}</option>`)}</select>
    </label>`);
  $('#copy-link')?.addEventListener('click', async () => {
    const link = `${location.origin}/join.html?code=${c.join_code}`;
    try { await navigator.clipboard.writeText(link); toast('Join link copied', { type: 'ok' }); } catch { toast(link); }
  });
  $('#pace').addEventListener('change', async (e) => {
    try {
      await api.patch(`classes/${classId}`, { pace_position: Number(e.target.value) });
      toast('Class pace updated. Late joiners start here.', { type: 'ok' });
      await load();
    } catch (err) { toast(err.message, { type: 'bad' }); }
  });

  // Stats
  const t = data.totals;
  const counts = Object.fromEntries(['Not started', 'In progress', 'Complete', 'Stuck'].map((k) => [k, data.students.filter((s) => s.summary.status === k).length]));
  const gained = data.gain.filter((g) => g.avg_gain !== null);
  const avgGain = gained.length ? gained.reduce((a, g) => a + g.avg_gain, 0) / gained.length : null;
  render($('#stats'), html`
    <div class="glass stat"><span class="stat-label">Students</span><span class="stat-value">${t.students}</span><span class="muted text-sm">${counts['In progress']} in progress · ${counts.Complete} complete</span></div>
    <div class="glass stat"><span class="stat-label">Average completion</span><span class="stat-value">${pct(t.avg_completion)}</span><progress class="progress" max="1" value="${t.avg_completion}" aria-label="Average completion"></progress></div>
    <div class="glass stat"><span class="stat-label">Learning gain</span><span class="stat-value">${avgGain === null ? '–' : `${avgGain >= 0 ? '+' : ''}${Math.round(avgGain)} pts`}</span><span class="muted text-sm">Average across modules</span></div>
    <div class="glass stat ${counts.Stuck ? 'stat-alert' : ''}"><span class="stat-label">Need help</span><span class="stat-value">${data.today.length}</span><span class="muted text-sm">${counts.Stuck} stuck · ${counts['Not started']} not started</span></div>`);

  // Today
  render($('#today'), data.today.length ? html`${data.today.map((item) => {
    const [ic, label, badge] = TODAY[item.kind];
    return html`<li class="today-item">
      <span class="today-icon today-${item.kind}" aria-hidden="true">${icon(ic)}</span>
      <span class="today-text"><span class="today-name"><strong>${item.name}</strong> <span class="${badge}">${label}</span></span><span class="muted text-sm">${item.reason}</span></span>
      ${item.kind === 'locked'
        ? html`<button class="btn btn-primary btn-sm" type="button" data-reset="${item.student_id}">Reset PIN</button>`
        : item.kind === 'not_started'
          ? html`<button class="btn btn-secondary btn-sm" type="button" data-reset="${item.student_id}">New PIN</button>`
          : html`<button class="btn btn-secondary btn-sm" type="button" data-work="${item.student_id}">See work</button>`}
    </li>`;
  })}` : html`<li class="empty"><span class="empty-icon">${icon('check-circle')}</span><p><strong>Everyone is on track.</strong></p></li>`);

  // Gain per module
  render($('#gain'), html`<ul class="gain-list">${data.gain.map((g) => {
    const has = g.counted > 0;
    return html`<li class="gain-row">
      <span class="gain-title"><strong>${g.title}</strong><span class="muted text-xs">${has ? `${g.counted} of ${g.students} took both tests` : 'No one has taken both tests yet'}</span></span>
      ${has ? html`<span class="gain-bars" aria-hidden="true">
          <span class="gain-bar gain-pre"><span style-width="${g.avg_pre}"></span></span>
          <span class="gain-bar gain-post"><span style-width="${g.avg_post}"></span></span>
        </span>
        <span class="gain-num"><span class="sr-only">Pretest average ${g.avg_pre}%, post-test average ${g.avg_post}%,</span>
          <strong class="${g.avg_gain >= 0 ? 'gain-up' : 'gain-down'}">${g.avg_gain >= 0 ? '+' : ''}${g.avg_gain}</strong> pts
          <span class="muted text-xs">${g.avg_pre}% → ${g.avg_post}%</span></span>` : html`<span></span><span class="muted text-sm">–</span>`}
    </li>`;
  })}</ul><p class="muted text-xs gain-key"><span class="key key-pre"></span> Pretest <span class="key key-post"></span> Post-test</p>`);
  // CSP forbids inline styles, so bar widths are set through the CSSOM.
  for (const el of $$('[style-width]')) el.style.width = `${Math.max(0, Math.min(100, Number(el.getAttribute('style-width'))))}%`;

  drawRoster();
  $$('#today [data-reset]').forEach((b) => b.addEventListener('click', () => resetPin(Number(b.dataset.reset))));
  $$('#today [data-work]').forEach((b) => b.addEventListener('click', () => showWork(Number(b.dataset.work))));
}

function drawRoster() {
  const names = ['All', 'Stuck', 'Not started', 'In progress', 'Complete'];
  render($('#filters'), html`<fieldset class="segmented"><legend>Filter by status</legend>${names.map((n) => html`<label><input type="radio" name="filter" value="${n}" ${n === filter ? html`checked` : ''}><span>${n}</span></label>`)}</fieldset>`);
  $$('input[name=filter]').forEach((r) => r.addEventListener('change', () => { filter = r.value; drawRoster(); }));
  const rows = data.students.filter((s) => filter === 'All' || s.summary.status === filter);
  render($('#roster'), html`
    <caption class="sr-only">Students in ${data.class.name}, ${filter}</caption>
    <thead><tr><th scope="col">Student</th><th scope="col">Status</th>${data.modules.map((m) => html`<th scope="col" class="num">M${m.position}<span class="sr-only">: ${m.title}</span></th>`)}<th scope="col">Last active</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${rows.length ? rows.map((s) => html`<tr>
      <th scope="row"><span class="roster-name"><span class="avatar avatar-sm" aria-hidden="true">${s.display_name.slice(0, 2).toUpperCase()}</span>${s.display_name}${s.locked ? html` ${icon('lock', { label: 'locked out' })}` : ''}</span></th>
      <td><span class="${STATUS_BADGE[s.summary.status]}">${s.summary.status}</span></td>
      ${s.modules.map((m) => html`<td class="num"><span class="cell ${m.complete ? 'cell-done' : m.done ? 'cell-some' : ''}" title="${m.done} of ${m.total}">${m.complete ? icon('check', { label: 'complete' }) : m.total ? `${m.done}/${m.total}` : '–'}</span>${m.gain !== null && m.gain !== undefined ? html`<span class="cell-gain ${m.gain >= 0 ? 'gain-up' : 'gain-down'}">${m.gain >= 0 ? '+' : ''}${Math.round(m.gain * 100)}</span>` : ''}</td>`)}
      <td class="muted text-sm">${ago(s.summary.last_activity_at)}</td>
      <td><span class="row-actions">
        <button class="btn btn-ghost btn-sm" type="button" data-work="${s.id}">Work</button>
        <button class="btn btn-ghost btn-sm" type="button" data-reset="${s.id}">PIN</button>
        <button class="btn btn-ghost btn-sm" type="button" data-place="${s.id}">Place</button>
      </span></td></tr>`) : html`<tr><td colspan="${data.modules.length + 4}" class="muted">No students with this status.</td></tr>`}</tbody>`);
  $$('#roster [data-reset]').forEach((b) => b.addEventListener('click', () => resetPin(Number(b.dataset.reset))));
  $$('#roster [data-work]').forEach((b) => b.addEventListener('click', () => showWork(Number(b.dataset.work))));
  $$('#roster [data-place]').forEach((b) => b.addEventListener('click', () => place(Number(b.dataset.place))));
}

const nameOf = (id) => data.students.find((s) => s.id === id)?.display_name ?? 'this student';

async function resetPin(id) {
  const ok = await confirmDialog({
    title: `New PIN for ${nameOf(id)}?`,
    body: 'Their old PIN stops working and any device still signed in is signed out. If they were locked out, this unlocks them.',
    confirmLabel: 'Make a new PIN',
  });
  if (!ok) return;
  try {
    const r = await api.post(`students/${id}/reset-pin`, {});
    const dialog = createDialog({
      title: `${r.display_name}'s new PIN`,
      body: html`<p class="pin-big" aria-label="PIN ${r.pin.split('').join(' ')}">${r.pin}</p><p class="muted">Show it to the student now. It won't be shown again.</p>`,
      footer: html`<button class="btn btn-primary" type="button" data-close>Done</button>`,
    });
    dialog.addEventListener('close', () => setTimeout(() => dialog.remove(), 300));
    openDialog(dialog);
    await load();
  } catch (err) { toast(err.message, { type: 'bad' }); }
}

async function place(id) {
  const s = data.students.find((x) => x.id === id);
  const dialog = createDialog({
    title: `Where should ${s.display_name} start?`,
    body: html`<p class="muted">For late joiners: modules up to this one open for them, and they start here. Earlier modules stay open to catch up.</p>
      <div class="field"><label for="place-sel">Start at</label>
      <select class="input" id="place-sel"><option value="">With the class (default)</option>${data.modules.map((m) => html`<option value="${m.position}">Module ${m.position}: ${m.title}</option>`)}</select></div>`,
    footer: html`<button class="btn btn-secondary" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" id="place-save">Save</button>`,
  });
  dialog.addEventListener('close', () => setTimeout(() => dialog.remove(), 300));
  openDialog(dialog);
  dialog.querySelector('#place-save').addEventListener('click', async (e) => {
    setBusy(e.currentTarget, true);
    try {
      const v = dialog.querySelector('#place-sel').value;
      await api.patch(`students/${id}`, { start_position: v ? Number(v) : null });
      closeDialog(dialog);
      toast(`${s.display_name} placed.`, { type: 'ok' });
      await load();
    } catch (err) { setBusy(e.currentTarget, false); toast(err.message, { type: 'bad' }); }
  });
}

function answerView(w) {
  const a = w.answer || {};
  if (a.code !== undefined) return html`<pre class="work-code">${a.code}</pre>${a.error ? html`<p class="out-error text-sm">${a.error}</p>` : ''}`;
  if (a.fields) return html`<dl class="work-fields">${a.fields.map((f, i) => html`<dt>${w.fields?.[i] ?? `Part ${i + 1}`}</dt><dd>${f}</dd>`)}</dl>`;
  if (a.text) return html`<p><span class="muted">${w.question ?? ''}</span><br>${a.text}</p>`;
  if (w.max_score) return html`<p>Score ${w.score} / ${w.max_score}</p>`;
  return html`<p class="muted">Viewed</p>`;
}

async function showWork(id) {
  const dialog = createDialog({ title: `${nameOf(id)}'s work`, kind: 'drawer', body: html`<p class="muted">Loading…</p>` });
  dialog.addEventListener('close', () => setTimeout(() => dialog.remove(), 300));
  openDialog(dialog);
  try {
    const r = await api.get(`students/${id}/work`);
    render(dialog.querySelector('.dialog-body'), html`
      ${r.hints.length ? html`<h3 class="work-h">${icon('lightbulb')} Hints asked (${r.hints.length})</h3>
        <ul class="work-hints">${r.hints.slice(0, 6).map((h) => html`<li><strong>${h.activity}</strong>${h.error_text ? html` <span class="muted text-xs">after: ${h.error_text}</span>` : ''}<p class="text-sm">${h.hint}</p></li>`)}</ul>` : ''}
      <h3 class="work-h">${icon('edit')} Latest work</h3>
      ${r.work.length ? html`<ul class="work-list">${r.work.map((w) => html`<li class="work-item">
        <span class="work-top"><strong>${w.title}</strong>
          ${w.passed === true ? html`<span class="badge badge-ok">Passed</span>` : w.passed === false ? html`<span class="badge badge-warn">Not yet · ${w.attempts} tries</span>` : ''}</span>
        <span class="muted text-xs">${w.module} · ${ago(w.created_at)}</span>
        ${answerView(w)}</li>`)}</ul>` : html`<p class="muted">Nothing submitted yet.</p>`}`);
  } catch (err) {
    render(dialog.querySelector('.dialog-body'), html`<p class="callout callout-bad">${err.message}</p>`);
  }
}

try {
  if (!classId) throw new Error('No class was chosen.');
  await load();
} catch (err) {
  $('#class-title').textContent = "We can't open this class";
  render($('#stats'), html`<p class="callout callout-bad">${icon('x-circle')}<span>${err.message} <a href="/teach.html">Back to my classes</a></span></p>`);
}
