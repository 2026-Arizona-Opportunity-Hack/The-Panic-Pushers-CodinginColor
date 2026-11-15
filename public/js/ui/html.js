// Safe HTML templating. Everything interpolated into html`...` is escaped
// unless it is itself the result of html`...` or raw(). Student names, answers
// and code come from users, so this is the only way pages should build markup.
//
//   import { html, render } from '/js/ui/html.js';
//   render(list, html`<li>${student.display_name}</li>`);

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"'`]/g, (c) => ESCAPES[c]);

class SafeHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

/** Mark trusted markup (icons, our own templates) as safe. Never pass user input. */
export const raw = (markup) => new SafeHtml(String(markup));

function part(value) {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(part).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Replace an element's content with a template. Plain strings are escaped. */
export function render(el, template) {
  el.innerHTML = template instanceof SafeHtml ? template.value : escapeHtml(template);
  return el;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Initials for an avatar: "Maria G." -> "MG". */
export const initials = (name) =>
  String(name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
