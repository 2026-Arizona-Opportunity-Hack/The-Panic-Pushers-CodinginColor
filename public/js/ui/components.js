// Behaviour for interactive components. Styles: /css/components-interactive.css.
//
//   openDialog(el) / closeDialog(el)    native <dialog>, focus returns on close
//   confirmDialog({ title, body, ... }) -> Promise<boolean> (never window.confirm)
//   toast('Saved', { type: 'ok' })      announced to screen readers
//   initTabs(root)                       arrow keys, Home/End
//   progressRing(78, { label })          accessible SVG ring
//   setBusy(button, true)                loading state
//   showFieldErrors(form, apiError)      highlight the input the API named
import { html, render, $, $$ } from './html.js';
import { icon } from './icons.js';

// ---------- Dialogs ----------
const returnFocus = new WeakMap();

export function openDialog(dialog) {
  returnFocus.set(dialog, document.activeElement);
  dialog.showModal();
  const first = dialog.querySelector('[autofocus], input, select, textarea, button:not([data-close])')
    || dialog.querySelector('[data-close]');
  (first || dialog).focus();
  if (!dialog.dataset.wired) {
    dialog.dataset.wired = '1';
    dialog.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) closeDialog(dialog);
      else if (e.target === dialog && dialog.dataset.dismissable !== 'false') closeDialog(dialog); // backdrop click
    });
    dialog.addEventListener('close', () => {
      const back = returnFocus.get(dialog);
      if (back && document.contains(back)) back.focus();
    });
  }
}

export const closeDialog = (dialog, value = '') => dialog.open && dialog.close(value);

/** Build a dialog shell: <dialog class="modal|drawer"> with head, body and foot. */
export function createDialog({ title, body = '', footer = '', kind = 'modal' }) {
  const dialog = document.createElement('dialog');
  dialog.className = kind;
  const id = `dlg-${Math.random().toString(36).slice(2, 8)}`;
  dialog.setAttribute('aria-labelledby', id);
  render(dialog, html`
    <div class="dialog-head">
      <h2 id="${id}">${title}</h2>
      <button class="btn btn-ghost btn-icon" type="button" data-close>${icon('x', { label: 'Close' })}</button>
    </div>
    <div class="dialog-body">${body}</div>
    ${footer ? html`<div class="dialog-foot">${footer}</div>` : ''}`);
  document.body.append(dialog);
  return dialog;
}

/** Accessible replacement for window.confirm(). Resolves true only on confirm. */
export function confirmDialog({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  const dialog = createDialog({
    title,
    body: html`<p>${body}</p>`,
    footer: html`<button class="btn btn-secondary" type="button" data-close>${cancelLabel}</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-confirm>${confirmLabel}</button>`,
  });
  return new Promise((resolve) => {
    dialog.querySelector('[data-confirm]').addEventListener('click', () => closeDialog(dialog, 'confirm'));
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'confirm');
      setTimeout(() => dialog.remove(), 300);
    });
    openDialog(dialog);
    dialog.querySelector('[data-close].btn-secondary').focus(); // safe default for destructive actions
  });
}

// ---------- Toasts ----------
const TOAST_ICONS = { ok: 'check-circle', warn: 'alert', bad: 'x-circle', info: 'info' };

// Returns [region, isNew]. A live region must already be in the page before
// content is added, or screen readers can miss the first announcement.
function toastRegion(kind) {
  const id = kind === 'alert' ? 'toasts-alert' : 'toasts';
  let region = document.getElementById(id);
  const isNew = !region;
  if (isNew) {
    region = document.createElement('div');
    region.id = id;
    region.className = 'toasts';
    // Errors interrupt (role=alert); everything else waits politely.
    region.setAttribute('role', kind === 'alert' ? 'alert' : 'status');
    region.setAttribute('aria-live', kind === 'alert' ? 'assertive' : 'polite');
    document.body.append(region);
  }
  return [region, isNew];
}

/** Create both live regions up front (call once at page load). */
export function initToasts() {
  toastRegion('status');
  toastRegion('alert');
}

export function toast(message, { type = 'info', timeout = 5000 } = {}) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  render(el, html`${icon(TOAST_ICONS[type] || 'info')}<p>${message}</p>
    <button class="btn btn-ghost btn-icon" type="button">${icon('x', { label: 'Dismiss' })}</button>`);
  const [region, isNew] = toastRegion(type === 'bad' ? 'alert' : 'status');
  if (isNew) setTimeout(() => region.append(el), 100);
  else region.append(el);

  let timer;
  const dismiss = () => { el.classList.add('leaving'); setTimeout(() => el.remove(), 250); };
  const start = () => { if (timeout) timer = setTimeout(dismiss, timeout); };
  const pause = () => clearTimeout(timer);
  el.querySelector('button').addEventListener('click', dismiss);
  // Don't vanish while someone is reading or tabbing to it.
  el.addEventListener('mouseenter', pause);
  el.addEventListener('mouseleave', start);
  el.addEventListener('focusin', pause);
  el.addEventListener('focusout', start);
  start();
  return dismiss;
}

// ---------- Tabs ----------
export function initTabs(root) {
  const tabs = $$('[role="tab"]', root);
  const select = (tab, focus = true) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    }
    if (focus) tab.focus();
    root.dispatchEvent(new CustomEvent('tabchange', { detail: { id: tab.id } }));
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length]);
    });
  });
  select(tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0], false);
}

// ---------- Progress ring ----------
export function progressRing(percent, { size = 64, stroke = 7, label = 'Progress' } = {}) {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return html`<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}: ${p}%">
    <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
    <circle class="ring-value" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - p / 100)).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(size * 0.26)}" aria-hidden="true">${p}%</text>
  </svg>`;
}

// ---------- Buttons and forms ----------
export function setBusy(button, busy) {
  button.setAttribute('aria-busy', String(busy));
  button.disabled = busy;
}

/** Clear errors shown by showFieldErrors(). */
export function clearFieldErrors(form) {
  for (const msg of $$('.field-error[data-generated]', form)) {
    for (const input of $$(`[aria-describedby~="${CSS.escape(msg.id)}"]`, form)) {
      const rest = input.getAttribute('aria-describedby').split(/\s+/).filter((id) => id !== msg.id);
      if (rest.length) input.setAttribute('aria-describedby', rest.join(' '));
      else input.removeAttribute('aria-describedby');
    }
    msg.remove();
  }
  for (const el of $$('[aria-invalid="true"]', form)) el.removeAttribute('aria-invalid');
}

/**
 * Show an API error next to the input it names. The API returns
 * { error, field } where field matches an input's data-field (or its label).
 * Returns false when no input matched, so the caller can toast instead.
 */
export function showFieldErrors(form, { error, field }) {
  clearFieldErrors(form);
  if (!field) return false;
  const input = $(`[data-field="${CSS.escape(field)}"]`, form)
    || $$('input, select, textarea', form).find((i) => i.labels?.[0]?.textContent.trim() === field);
  if (!input) return false;
  const msg = document.createElement('p');
  msg.className = 'field-error';
  msg.dataset.generated = '1';
  msg.id = `${input.id || 'f'}-error`;
  render(msg, html`${icon('alert')}<span>${error}</span>`);
  input.closest('.field')?.append(msg) ?? input.after(msg);
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), msg.id].filter(Boolean).join(' '));
  input.focus();
  return true;
}
