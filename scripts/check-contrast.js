#!/usr/bin/env node
// Fails if any text color in public/css/tokens.css is below WCAG AA (4.5:1),
// or the focus ring below 3:1, on its worst-case background, in light and dark.
//
// "Worst case" for glass: the translucent surface composited over the page
// background AND over the strongest point of every aurora glow, then the
// lowest contrast of all of those is what counts.
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../public/css/tokens.css', import.meta.url), 'utf8');
const root = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')));

// ---- Parse custom properties from the first :root block ----
const raw = {};
for (const m of root.matchAll(/--([\w-]+):\s*([^;]+);/g)) raw[m[1]] = m[2].trim();

function splitTop(s) {
  // split "a, b" at the top-level comma (ignores commas inside rgba(...))
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
  }
  return [s.trim(), s.trim()];
}

function resolve(name, theme, seen = new Set()) {
  if (seen.has(name)) throw new Error(`Circular token --${name}`);
  seen.add(name);
  let v = raw[name];
  if (v === undefined) throw new Error(`Unknown token --${name}`);
  const ld = v.match(/^light-dark\((.*)\)$/s);
  if (ld) v = splitTop(ld[1])[theme === 'light' ? 0 : 1];
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  return ref ? resolve(ref[1], theme, seen) : v;
}

function parseColor(s) {
  s = s.trim();
  if (s === 'transparent') return [0, 0, 0, 0];
  let m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
  m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  throw new Error(`Cannot parse color "${s}"`);
}

const over = (fg, bg) => {
  const a = fg[3];
  return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)).concat(1);
};
const lum = ([r, g, b]) => {
  const ch = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

let failures = 0;
const fmt = (n) => n.toFixed(2).padStart(5);

for (const theme of ['light', 'dark']) {
  const c = (name) => parseColor(resolve(name, theme));
  const bg = c('bg');
  // Page backdrops: plain background plus the centre of each aurora glow.
  const backdrops = [bg, ...['aurora-1', 'aurora-2', 'aurora-3', 'aurora-4'].map((a) => over(c(a), bg))];
  const on = (surface) => backdrops.map((b) => over(c(surface), b));
  const surfaces = {
    page: backdrops,
    glass: on('surface'),
    'glass-strong': on('surface-strong'),
    solid: [c('surface-solid')],
  };

  const checks = [];
  for (const text of ['text', 'text-muted', 'heading', 'link', 'ok', 'warn', 'bad', 'info']) {
    for (const [sname, list] of Object.entries(surfaces)) checks.push([text, sname, list, 4.5]);
  }
  checks.push(['code-text', 'code on glass', surfaces.glass.map((s) => over(c('code-bg'), s)), 4.5]);
  checks.push(['on-primary', 'primary', [c('primary')], 4.5]);
  checks.push(['on-primary', 'primary-hover', [c('primary-hover')], 4.5]);
  for (const s of ['ok', 'warn', 'bad', 'info']) {
    checks.push([s, `${s}-soft on glass`, surfaces['glass-strong'].map((g) => over(c(`${s}-soft`), g)), 4.5]);
  }
  checks.push(['focus-ring', 'any surface', [...surfaces.page, ...surfaces.glass, ...surfaces.solid], 3]);
  checks.push(['primary', 'button edge vs glass', surfaces.glass, 3]);

  console.log(`\n${theme.toUpperCase()}`);
  for (const [fg, where, list, min] of checks) {
    const worst = Math.min(...list.map((b) => ratio(c(fg), b)));
    const ok = worst >= min;
    if (!ok) failures++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${fmt(worst)}:1  (min ${min})  --${fg} on ${where}`);
  }
}

if (failures) {
  console.error(`\n${failures} color pair(s) below WCAG AA. Adjust public/css/tokens.css.`);
  process.exit(1);
}
console.log('\nAll text colors meet WCAG AA on their worst-case backgrounds.');
