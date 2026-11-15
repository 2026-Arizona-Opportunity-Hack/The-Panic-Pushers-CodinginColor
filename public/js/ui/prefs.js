// Display settings: theme, text size, high contrast, reduced motion.
// Remembered on this device only (no account needed, works for students too).
// boot.js applies them before first paint; this module changes them.
import { html } from './html.js';
import { icon } from './icons.js';
import { createDialog, openDialog, toast } from './components.js';

const KEY = 'cic-prefs';
const DEFAULTS = { theme: 'system', text: 'base', contrast: 'normal', motion: 'system' };

export function getPrefs() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function applyPrefs(prefs) {
  const root = document.documentElement;
  const set = (attr, value, keep) => (keep.includes(value) ? (root.dataset[attr] = value) : delete root.dataset[attr]);
  set('theme', prefs.theme, ['light', 'dark']);
  set('text', prefs.text, ['lg', 'xl']);
  set('contrast', prefs.contrast, ['more']);
  set('motion', prefs.motion, ['reduce']);
}

export function savePrefs(prefs) {
  applyPrefs(prefs);
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false; // storage blocked: settings still apply until the page is closed
  }
}

const radios = (name, legend, options, current) => html`
  <fieldset class="segmented" data-pref="${name}">
    <legend>${legend}</legend>
    ${options.map(([value, label, ico]) => html`<label><input type="radio" name="pref-${name}" value="${value}" ${value === current ? 'checked' : ''}><span>${ico ? icon(ico) : ''}${label}</span></label>`)}
  </fieldset>`;

let dialog;

/** Open the Display settings dialog. Changes apply instantly. */
export function openSettings() {
  const p = getPrefs();
  dialog?.remove();
  dialog = createDialog({
    title: 'Display settings',
    body: html`<div class="stack settings">
      <div class="setting"><p class="label" aria-hidden="true">Theme</p>${radios('theme', 'Theme', [['system', 'Dark', 'moon'], ['light', 'Light', 'sun']], p.theme)}</div>
      <div class="setting"><p class="label" aria-hidden="true">Text size</p>${radios('text', 'Text size', [['base', 'A'], ['lg', 'A+'], ['xl', 'A++']], p.text)}</div>
      <label class="check setting-row"><span><strong>High contrast</strong><span class="hint">Solid backgrounds and stronger borders</span></span>
        <input type="checkbox" role="switch" class="switch" data-pref="contrast" ${p.contrast === 'more' ? 'checked' : ''}></label>
      <label class="check setting-row"><span><strong>Reduce motion</strong><span class="hint">Turn off animations and the moving background</span></span>
        <input type="checkbox" role="switch" class="switch" data-pref="motion" ${p.motion === 'reduce' ? 'checked' : ''}></label>
      <p class="hint">Saved on this device. Your device's own settings are used until you change these.</p>
    </div>`,
    footer: html`<button class="btn btn-ghost" type="button" data-reset>Reset to device settings</button><button class="btn btn-primary" type="button" data-close>Done</button>`,
  });

  const update = () => {
    const next = getPrefs();
    for (const fs of dialog.querySelectorAll('fieldset[data-pref]')) next[fs.dataset.pref] = fs.querySelector('input:checked')?.value;
    next.contrast = dialog.querySelector('[data-pref="contrast"]').checked ? 'more' : 'normal';
    next.motion = dialog.querySelector('[data-pref="motion"]').checked ? 'reduce' : 'system';
    if (!savePrefs(next)) toast("Settings apply now but can't be saved in this browser.", { type: 'warn' });
  };
  dialog.addEventListener('change', update);
  dialog.querySelector('[data-reset]').addEventListener('click', () => {
    savePrefs({ ...DEFAULTS });
    openSettings();
  });
  openDialog(dialog);
}
