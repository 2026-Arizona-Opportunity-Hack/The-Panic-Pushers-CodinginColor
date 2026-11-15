// Student journey map: every module in the class, in order, with its state:
// done, up next, the class is here, catch up, or locked.
import { $, html, render } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { renderShell } from '../ui/shell.js';
import { progressRing } from '../ui/components.js';
import { api, requireStudent } from '../ui/api.js';
import { blurIn } from '../ui/motion.js';

await renderShell();
await requireStudent();

const STATUS = {
  'Not started': ['badge', 'Ready to start'],
  'In progress': ['badge badge-info', 'In progress'],
  Complete: ['badge badge-ok', 'All done'],
  Stuck: ['badge badge-warn', 'Ask for help on your current step'],
};

function moduleCard(m, data) {
  const isStart = m.id === data.summary.start_module_id;
  const atPace = m.position === data.class.pace_position;
  const state = m.complete ? 'done' : !m.unlocked ? 'locked' : isStart ? 'current' : 'open';
  const stateIcon = { done: 'check-circle', locked: 'lock', current: 'play', open: 'book' }[state];
  const stateText = { done: 'Done', locked: 'Locked', current: 'Up next', open: m.behind ? 'Catch up' : 'Open' }[state];
  const pct = m.total ? Math.round((100 * m.done) / m.total) : 0;
  const gain = m.gain !== null && m.gain !== undefined ? Math.round(m.gain * 100) : null;
  const body = html`
    <span class="journey-dot" aria-hidden="true">${icon(stateIcon)}</span>
    <span class="journey-body">
      <span class="journey-top">
        <span class="journey-num">Module ${m.position}</span>
        <span class="badge ${state === 'done' ? 'badge-ok' : state === 'current' ? 'badge-info' : m.behind && state === 'open' ? 'badge-warn' : ''}">${stateText}</span>
        ${atPace ? html`<span class="badge">${icon('users')} Class is here</span>` : ''}
      </span>
      <strong class="journey-title">${m.title}</strong>
      <span class="journey-meta">
        <progress class="progress" max="100" value="${pct}" aria-label="${m.title}: ${pct}% done"></progress>
        <span class="muted text-sm">${m.done} of ${m.total} steps${gain !== null ? html` · <strong class="${gain >= 0 ? 'gain-up' : 'gain-down'}">${gain >= 0 ? '+' : ''}${gain} pts</strong> since your pretest` : ''}</span>
      </span>
    </span>
    ${state === 'locked' ? html`<span class="muted text-sm journey-why">Finish the module before this one</span>` : icon('chevron-right')}`;
  return html`<li class="journey-item is-${state}">${state === 'locked'
    ? html`<div class="glass journey-card" aria-disabled="true">${body}</div>`
    : html`<a class="glass journey-card" href="/module.html?id=${m.id}" ${state === 'current' ? html`aria-current="step"` : ''}>${body}</a>`}</li>`;
}

try {
  const data = await api.get('me/learn');
  const s = data.summary;
  const [badgeClass, badgeText] = STATUS[s.status] ?? STATUS['In progress'];
  const start = data.modules.find((m) => m.id === s.start_module_id);

  $('#learn-class').textContent = data.class.name;
  $('#learn-title').textContent = `Hi, ${data.student.display_name}`;
  blurIn($('#learn-title'));
  render($('#learn-sub'), html`<span class="${badgeClass}">${badgeText}</span> ${s.done} of ${s.total} steps done across ${data.modules.length} modules.`);
  render($('#learn-cta'), start
    ? html`<a class="btn btn-primary btn-lg" href="/module.html?id=${start.id}">${s.done ? 'Continue' : 'Start'}: ${start.title} ${icon('arrow-right')}</a>`
    : html`<p class="callout callout-ok">${icon('check-circle')}<span>You finished everything your class has so far. Nice work!</span></p>`);
  render($('#learn-ring'), progressRing(Math.round(s.pct * 100), { size: 132, stroke: 12, label: 'Your progress' }));
  $('.learn-hero').removeAttribute('aria-busy');
  render($('#journey'), data.modules.length
    ? html`${data.modules.map((m) => moduleCard(m, data))}`
    : html`<li class="empty glass"><p><strong>No modules yet.</strong></p><p class="muted">Your teacher hasn't added any modules to this class yet.</p></li>`);
} catch (err) {
  render($('#main'), html`<div class="glass-strong empty"><h1>We couldn't load your modules</h1><p class="muted">${err.message}</p><a class="btn btn-primary" href="/learn.html">Try again</a></div>`);
}
