// Style guide page: fills in icons and wires the theme / contrast switches.
import { html, render, $, $$ } from '../ui/html.js';
import { icon, iconNames } from '../ui/icons.js';

// [data-icon] placeholders get an inline SVG. A bare <span data-icon> (no text,
// no class) is replaced by the icon; anything else keeps its content after it.
for (const el of $$('[data-icon]')) {
  const svg = String(icon(el.dataset.icon, { label: el.dataset.iconLabel }));
  if (el.tagName === 'SPAN' && !el.className && !el.textContent.trim()) el.outerHTML = svg;
  else el.insertAdjacentHTML('afterbegin', svg);
}

render($('#icon-list'), html`${iconNames.map((name) => html`<li>${icon(name)}<span>${name}</span></li>`)}`);

const root = document.documentElement;
for (const radio of $$('#theme input')) {
  radio.addEventListener('change', () => {
    if (radio.value === 'system') delete root.dataset.theme;
    else root.dataset.theme = radio.value;
  });
}
$('#contrast').addEventListener('change', (e) => {
  if (e.target.checked) root.dataset.contrast = 'more';
  else delete root.dataset.contrast;
});
