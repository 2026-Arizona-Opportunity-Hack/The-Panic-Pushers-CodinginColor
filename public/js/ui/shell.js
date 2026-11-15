// App shell: skip link, top bar (brand, role-aware nav, display settings,
// user menu) and footer. Every page calls renderShell() once.
//
//   const who = await renderShell({ current: '/home.html' });
import { html, render, initials } from './html.js';
import { icon } from './icons.js';
import { initToasts } from './components.js';
import { openSettings } from './prefs.js';
import { initMotion } from './motion.js';
import { me, signOut, can } from './api.js';

// Navigation for signed-in staff. `perm` hides items a role can't use; pages
// add themselves here as they are built.
const NAV = [
  { href: '/home.html', label: 'Home', icon: 'home' },
  { href: '/teach.html', label: 'Classes', icon: 'users', perm: ['classes.manage_own', 'classes.manage_all'], also: ['/class.html'] },
];

const brandMark = html`<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
  <rect width="32" height="32" rx="9" fill="#007A3D"/>
  <path d="M12.5 10.5 7 16l5.5 5.5M19.5 10.5 25 16l-5.5 5.5" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="16" cy="16" r="2.2" fill="#00A850"/>
</svg>`;

function userMenu(who) {
  if (!who.kind) {
    return ['/signin.html', '/join.html'].includes(location.pathname) ? '' : html`<a class="btn btn-primary btn-sm" href="/signin.html">Sign in</a>`;
  }
  // Students share Chromebooks, so "Sign out" is one tap away.
  const [name, role_name] = who.kind === 'staff'
    ? [who.user.name, who.user.role_name]
    : [who.student.display_name, who.class_name ?? 'Student'];
  return html`<div class="menu">
    <button class="btn btn-ghost menu-button" type="button" aria-expanded="false" aria-controls="user-menu">
      <span class="avatar avatar-sm" aria-hidden="true">${initials(name)}</span>
      <span class="menu-name">${name}</span>${icon('chevron-down')}
    </button>
    <div class="menu-panel glass-strong" id="user-menu" hidden>
      <p class="menu-who"><strong>${name}</strong><span class="muted text-sm">${role_name}</span></p>
      <button class="btn btn-ghost btn-block menu-item" type="button" data-signout>${icon('log-out')} Sign out</button>
    </div>
  </div>`;
}

function wireMenu(header) {
  const button = header.querySelector('.menu-button');
  if (!button) return;
  const panel = header.querySelector('#user-menu');
  const setOpen = (open) => {
    button.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    if (open) panel.querySelector('button')?.focus();
  };
  button.addEventListener('click', () => setOpen(panel.hidden));
  header.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) { setOpen(false); button.focus(); }
  });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !e.target.closest('.menu')) setOpen(false);
  });
  panel.querySelector('[data-signout]').addEventListener('click', signOut);
}

/**
 * Insert the shell around the page's <main id="main">. Returns who is signed
 * in ({ kind: null } when nobody is) so the page doesn't fetch it twice.
 */
export async function renderShell({ current = location.pathname } = {}) {
  initToasts();
  initMotion();

  // Draw the frame immediately so the page doesn't jump when sign-in state
  // arrives; the nav and user menu fill in once /api/auth/me answers.
  const skip = document.createElement('a');
  skip.className = 'skip-link';
  skip.href = '#main';
  skip.textContent = 'Skip to content';

  const header = document.createElement('header');
  header.className = 'glass-bar app-bar';
  render(header, html`<div class="container app-bar-inner">
    <a class="brand" href="/">${brandMark}<span class="brand-text"><strong>CIC Classroom</strong><span>Coding in Color</span></span></a>
    <span class="app-nav-spacer" data-nav></span>
    <div class="app-actions">
      <button class="btn btn-ghost btn-icon" type="button" data-settings>${icon('sliders', { label: 'Display settings' })}</button>
      <span class="app-user" data-user></span>
    </div>
  </div>`);

  const footer = document.createElement('footer');
  footer.className = 'app-footer';
  render(footer, html`<div class="container spread">
    <p><strong>Coding in Color</strong> · Phoenix, Arizona. Computer science and AI education for every Arizona student.</p>
    <p class="cluster"><button class="btn btn-ghost btn-sm" type="button" data-settings>${icon('sliders')} Display settings</button></p>
  </div>`);

  document.body.prepend(skip, header);
  document.body.append(footer);
  for (const b of document.querySelectorAll('[data-settings]')) b.addEventListener('click', openSettings);

  const who = await me().catch(() => ({ kind: null }));
  const items = who.kind === 'staff' ? NAV.filter((n) => !n.perm || [].concat(n.perm).some((p) => can(who, p))) : [];
  if (who.kind) header.querySelector('.brand').href = who.kind === 'staff' ? '/home.html' : '/learn.html';
  if (items.length) {
    const nav = document.createElement('nav');
    nav.className = 'app-nav';
    nav.setAttribute('aria-label', 'Main');
    render(nav, html`<ul>${items.map((n) => html`<li><a href="${n.href}" ${n.href === current || n.also?.includes(current) ? html`aria-current="page"` : ''}>${icon(n.icon)}<span>${n.label}</span></a></li>`)}</ul>`);
    header.querySelector('[data-nav]').replaceWith(nav);
  }
  render(header.querySelector('[data-user]'), userMenu(who));
  wireMenu(header);
  return who;
}

/** Redraw the user menu after signing in on the same page (e.g. a late joiner). */
export async function refreshUser() {
  const header = document.querySelector('.app-bar');
  const who = await me({ refresh: true }).catch(() => ({ kind: null }));
  if (!header) return who;
  render(header.querySelector('[data-user]'), userMenu(who));
  wireMenu(header);
  return who;
}
