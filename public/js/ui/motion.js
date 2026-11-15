// Subtle motion, inspired by React Bits effects but written in plain JS so the
// app keeps its no-framework, no-build setup. Every effect is skipped when the
// viewer prefers reduced motion (system setting or Display settings).
//
//   spotlight  a soft light follows the pointer across glass cards
//   reveal     cards fade up the first time they scroll into view
//   countUp    numbers in [data-count] / .stat-value / .impact-stats dd count up
//   blurIn     a heading's words sharpen into place, one after another
//
// initMotion() is called once by the shell; it also watches for content that
// pages render later (lists, dashboards).

const reduced = () => document.documentElement.dataset.motion === 'reduce'
  || matchMedia('(prefers-reduced-motion: reduce)').matches;

const CARDS = '.glass, .glass-strong:not(.glass-bar), .journey-card, .class-card, .today-item, .name-btn';

function spotlight() {
  if (!matchMedia('(hover: hover)').matches) return;
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest?.(CARDS);
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });
}

let revealObserver;
function reveal(root) {
  revealObserver ??= new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      en.target.classList.add('is-in');
      revealObserver.unobserve(en.target);
    }
  }, { rootMargin: '0px 0px -40px 0px' });
  let i = 0;
  for (const el of root.querySelectorAll(CARDS)) {
    if (el.dataset.revealed || el.closest('dialog, .app-bar')) continue;
    el.dataset.revealed = '1';
    el.classList.add('reveal');
    el.style.setProperty('--reveal-delay', `${Math.min(i++, 8) * 45}ms`);
    revealObserver.observe(el);
  }
}

/** Count a number up from 0, keeping any prefix/suffix ("+12 pts", "57%", "140+"). */
export function countUp(el, duration = 900) {
  if (el.dataset.counted) return;
  const m = el.textContent.match(/^([^\d-]*)(-?\d+(?:\.\d+)?)(.*)$/s);
  if (!m) return;
  el.dataset.counted = '1';
  const [, pre, num, post] = m;
  const target = Number(num);
  const places = num.includes('.') ? num.split('.')[1].length : 0;
  if (reduced() || target === 0) return;
  const start = performance.now();
  const ease = (t) => 1 - (1 - t) ** 3;
  const label = el.textContent;
  el.setAttribute('aria-label', label); // screen readers hear the final value, not every frame
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = `${pre}${(target * ease(t)).toFixed(places)}${post}`;
    if (t < 1) requestAnimationFrame(tick);
    else el.removeAttribute('aria-label');
  };
  requestAnimationFrame(tick);
}

function counters(root) {
  for (const el of root.querySelectorAll('[data-count], .stat-value, .impact-stats dd, .ring text, .score-big')) countUp(el);
}

/** Words of a heading sharpen into place one after another. */
export function blurIn(el) {
  if (!el || reduced() || el.dataset.blurred) return;
  el.dataset.blurred = '1';
  let i = 0;
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.append(part); continue; }
          const w = document.createElement('span');
          w.className = 'blur-word';
          w.textContent = part;
          w.style.setProperty('--i', i++);
          frag.append(w);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) walk(child);
    }
  };
  walk(el);
}

export function initMotion() {
  if (reduced()) return;
  document.documentElement.classList.add('motion');
  spotlight();
  const scan = () => { reveal(document); counters(document); };
  scan();
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan(); });
  }).observe(document.body, { childList: true, subtree: true });
}
