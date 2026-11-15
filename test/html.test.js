// The safe-HTML helper is the main defence against injected markup in names,
// answers and code, so its escaping rules are tested directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, raw, escapeHtml, initials } from '../public/js/ui/html.js';
import { icon } from '../public/js/ui/icons.js';

test('interpolated values are escaped', () => {
  const name = '<img src=x onerror="alert(1)">';
  assert.equal(String(html`<li>${name}</li>`), '<li>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</li>');
  assert.equal(escapeHtml(`'\`&`), '&#39;&#96;&amp;');
});

test('attribute values cannot break out of quotes', () => {
  const evil = '" onmouseover="steal()';
  assert.equal(String(html`<a title="${evil}">x</a>`), '<a title="&quot; onmouseover=&quot;steal()">x</a>');
});

test('nested templates and lists are kept, their values still escaped', () => {
  const names = ['Ana', '<b>Ben</b>'];
  const out = String(html`<ul>${names.map((n) => html`<li>${n}</li>`)}</ul>`);
  assert.equal(out, '<ul><li>Ana</li><li>&lt;b&gt;Ben&lt;/b&gt;</li></ul>');
});

test('null, undefined and false render nothing; 0 renders', () => {
  assert.equal(String(html`${null}${undefined}${false}${0}`), '0');
});

test('raw() is the only way to insert markup', () => {
  assert.equal(String(html`${raw('<em>ok</em>')}`), '<em>ok</em>');
});

test('icons are hidden from screen readers unless labelled', () => {
  assert.match(String(icon('check')), /aria-hidden="true"/);
  const labelled = String(icon('trash', { label: 'Delete "Loops"' }));
  assert.match(labelled, /role="img" aria-label="Delete &quot;Loops&quot;"/);
});

test('initials for avatars', () => {
  assert.equal(initials('maria g.'), 'MG');
  assert.equal(initials('  '), '?');
});
