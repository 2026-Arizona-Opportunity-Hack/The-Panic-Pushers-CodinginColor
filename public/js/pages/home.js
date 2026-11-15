// Signed-in staff home. Shows only what this person's role can do, so a
// reviewer sees the curriculum and an instructor sees their classes.
import { html, render, $ } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { renderShell } from '../ui/shell.js';
import { requireStaff, can } from '../ui/api.js';

const who = await requireStaff();
await renderShell({ current: '/home.html' });

// Each area appears for anyone holding one of its permissions. `ready` flips
// to a link as each part of the platform is built.
const AREAS = [
  { perms: ['classes.manage_own', 'classes.manage_all'], icon: 'users', title: 'My classes', text: 'See who is stuck or has not started, set the class pace, reset PINs and track learning gain.', href: '/teach.html' },
  { perms: ['curriculum.write'], icon: 'edit', title: 'Write curriculum', text: 'Build modules from videos, checks, worksheets and Python exercises, then publish.' },
  { perms: ['curriculum.read'], icon: 'book', title: 'Browse curriculum', text: 'Read every module, including pretests and post-tests, and preview it as a student.' },
  { perms: ['reports.read_all'], icon: 'chart', title: 'Impact and learning gain', text: 'Completion and learning gain by cohort, class and concept, ready for grant reports.' },
  { perms: ['users.manage', 'roles.manage', 'settings.manage'], icon: 'sliders', title: 'Admin', text: 'Staff, roles and permissions, schools, cohorts, concepts and API keys.' },
];

const hour = new Date().getHours();
const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
const first = who.user.name.split(/\s+/)[0];

const greeting = $('#greeting');
greeting.removeAttribute('aria-busy');
render(greeting, html`<p class="eyebrow">${who.user.role_name}</p>
  <h1>${hello}, ${first}</h1>
  <p>Here's what you can do with your role. Each area opens as it's built.</p>`);

const mine = AREAS.filter((a) => a.perms.some((p) => can(who, p)));
render($('#home-cards'), mine.length
  ? html`${mine.map((a) => html`<li class="glass card home-card">
      <span class="home-icon">${icon(a.icon)}</span>
      <h2>${a.title}</h2>
      <p>${a.text}</p>
      ${a.href ? html`<a class="btn btn-primary btn-sm" href="${a.href}">Open ${icon('arrow-right')}</a>` : html`<span class="badge">Coming next</span>`}
    </li>`)}`
  : html`<li class="glass card empty"><h2>No areas yet</h2><p>Your role has no permissions. Ask a CIC admin to update it.</p></li>`);
