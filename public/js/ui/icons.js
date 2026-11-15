// Inline SVG icons drawn for this project on a 24px grid, 2px rounded strokes.
// Decorative by default (aria-hidden); pass a label when the icon is the only
// content of a control, and the label becomes its accessible name.
//
//   html`<button class="btn btn-icon">${icon('trash', { label: 'Delete' })}</button>`
import { raw, escapeHtml } from './html.js';

const circle = (r = 9) => `<circle cx="12" cy="12" r="${r}"/>`;

const PATHS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
  'arrow-down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  lightbulb: '<path d="M9 18h6M10 21.5h4"/><path d="M12 2.5a6.5 6.5 0 0 0-3.9 11.7c.6.5.9 1.1.9 1.8v.5h6V16c0-.7.3-1.3.9-1.8A6.5 6.5 0 0 0 12 2.5z"/>',
  info: `${circle()}<path d="M12 16v-4.5M12 8h.01"/>`,
  alert: '<path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
  'check-circle': `${circle()}<path d="m8 12.5 2.8 2.8L16.5 9.5"/>`,
  'x-circle': `${circle()}<path d="m15 9-6 6M9 9l6 6"/>`,
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14a6.5 6.5 0 0 1 3 6"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2v.5A1.5 1.5 0 0 0 5.5 22H20"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  chart: '<path d="M3 21h18M6 17v-5M11 17V7M16 17v-8M21 17V4"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a6.5 6.5 0 0 0 11 11z"/>',
  contrast: `${circle()}<path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor"/>`,
  'log-out': '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l-5-5 5-5M5 12h11"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  sparkles: '<path d="M11 3.5 12.6 8l4.4 1.6-4.4 1.6L11 15.5l-1.6-4.3L5 9.6 9.4 8z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  clock: `${circle()}<path d="M12 7v5l3.5 2"/>`,
  home: '<path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  target: `${circle()}<circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>`,
  'graduation-cap': '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  printer: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/>',
};

export const iconNames = Object.keys(PATHS);

/**
 * Fill [data-icon="name"] placeholders in static HTML. A bare <span data-icon>
 * (no text, no class) becomes the icon; anything else gets it prepended.
 * data-icon-label gives the icon an accessible name.
 */
export function fillIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    const svg = String(icon(el.dataset.icon, { label: el.dataset.iconLabel }));
    if (el.tagName === 'SPAN' && !el.className && !el.textContent.trim()) el.outerHTML = svg;
    else el.insertAdjacentHTML('afterbegin', svg);
  }
}

export function icon(name, { label = null, className = '' } = {}) {
  const body = PATHS[name] ?? PATHS.info;
  const a11y = label ? `role="img" aria-label="${escapeHtml(label)}"` : 'aria-hidden="true" focusable="false"';
  return raw(
    `<svg class="icon ${escapeHtml(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${body}</svg>`
  );
}
