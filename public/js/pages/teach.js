// Instructor: my classes. Each card opens the class dashboard.
import { $, html, render } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { renderShell } from '../ui/shell.js';
import { api, requireStaff } from '../ui/api.js';

await renderShell();
await requireStaff();

try {
  const classes = await api.get('classes');
  render($('#classes'), classes.length ? html`${classes.map((c) => html`<li>
    <a class="glass class-card ${c.archived ? 'is-archived' : ''}" href="/class.html?id=${c.id}">
      <span class="class-card-top">
        <span class="badge">${c.school || 'No school'}</span>
        ${c.archived ? html`<span class="badge badge-warn">Archived</span>` : html`<span class="badge badge-info code-chip">${c.join_code}</span>`}
      </span>
      <strong class="class-card-title">${c.name}</strong>
      <span class="muted text-sm">${c.cohort || ''}</span>
      <span class="class-card-meta">
        <span>${icon('users')} ${c.students} ${c.students === 1 ? 'student' : 'students'}</span>
        <span>${icon('book')} ${c.modules} ${c.modules === 1 ? 'module' : 'modules'}</span>
      </span>
      ${c.pace_module ? html`<span class="class-card-pace">${icon('flag')} <span class="nowrap">Class is on</span> <strong>${c.pace_module}</strong></span>` : ''}
    </a></li>`)}`
    : html`<li class="glass empty"><span class="empty-icon">${icon('users')}</span><p><strong>No classes yet.</strong></p><p class="muted">Classes assigned to you will show up here.</p></li>`);
} catch (err) {
  render($('#classes'), html`<li class="callout callout-bad">${icon('x-circle')}<p>${err.message}</p></li>`);
}
