// Module player: one step at a time, like a code.org or CodeHS lesson.
// pretest -> reading/slides/video -> check -> worksheet / code -> exit -> post-test
// Grading happens on the server; code runs in the browser (Pyodide in a worker).
import { $, $$, html, render } from '../ui/html.js';
import { icon, fillIcons } from '../ui/icons.js';
import { renderShell } from '../ui/shell.js';
import { setBusy, toast } from '../ui/components.js';
import { api, requireStudent } from '../ui/api.js';
import { runPython, warmup } from '../ui/runner.js';

fillIcons();
await renderShell();
await requireStudent();

const params = new URLSearchParams(location.search);
const moduleId = Number(params.get('id'));
let mod, steps, current, openedAt;

const TYPE = {
  pretest: ['flag', 'Pretest'], posttest: ['target', 'Post-test'], reading: ['book', 'Read'],
  slides: ['book', 'Slides'], video: ['play', 'Video'], check: ['check-circle', 'Quick check'],
  worksheet: ['edit', 'Worksheet'], code: ['code', 'Code'], exit: ['flag', 'Exit ticket'],
};
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const draftKey = (id) => `cic-draft-${id}`;

// Text from the editor: blank lines split paragraphs; indentation is kept so code reads right.
const prose = (text) => html`${String(text || '').split(/\n{2,}/).map((b) => html`<p class="prose">${b}</p>`)}`;

function embedUrl(url) {
  try {
    const u = new URL(url);
    if (/(^|\.)youtube\.com$/.test(u.hostname) && u.searchParams.get('v')) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(u.searchParams.get('v'))}`;
    if (u.hostname === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(u.pathname.slice(1))}`;
    if (u.hostname === 'vimeo.com') return `https://player.vimeo.com/video/${encodeURIComponent(u.pathname.split('/').filter(Boolean)[0])}`;
    if (u.hostname === 'docs.google.com' && u.pathname.includes('/presentation/')) return url.replace(/\/(edit|pub|view)[^/]*$/, '/embed');
    return url;
  } catch { return null; }
}

// ---------- Load and draw ----------
async function load(selectId) {
  mod = await api.get(`me/modules/${moduleId}`);
  steps = mod.lessons.flatMap((l) => l.activities.map((a) => ({ ...a, lesson: l.title })));
  const wanted = steps.find((s) => s.id === selectId && s.state.status !== 'locked');
  current = wanted || steps.find((s) => s.state.status === 'current') || steps.at(-1);
  draw();
}

function go(step, { focus = true } = {}) {
  current = step;
  history.replaceState(null, '', `?id=${moduleId}&a=${step.id}`);
  draw();
  if (focus) $('#step-title')?.focus();
}

function draw() {
  document.title = `${mod.title} · CIC Classroom`;
  $('#module-title').textContent = mod.title;
  const done = steps.filter((s) => s.state.status === 'done').length;
  $('#module-progress').value = steps.length ? done / steps.length : 0;
  $('#module-count').textContent = `${done} of ${steps.length} steps`;

  let lastLesson = null;
  render($('#steps'), html`${steps.map((s, i) => {
    const head = s.lesson !== lastLesson ? html`<li class="rail-lesson" aria-hidden="true">${(lastLesson = s.lesson)}</li>` : '';
    const st = s.state.status;
    const mark = st === 'done' ? icon('check', { label: 'done' }) : st === 'locked' ? icon('lock', { label: 'locked' }) : html`<span class="sr-only">up next</span>`;
    const inner = html`<span class="rail-num" aria-hidden="true">${i + 1}</span><span class="rail-text">${s.title}<span class="rail-type">${TYPE[s.type][1]}</span></span><span class="rail-mark">${mark}</span>`;
    return html`${head}<li class="rail-step is-${st}">${st === 'locked'
      ? html`<span class="rail-link" aria-disabled="true">${inner}</span>`
      : html`<a class="rail-link" href="?id=${moduleId}&a=${s.id}" data-step="${s.id}" ${s.id === current.id ? html`aria-current="step"` : ''}>${inner}</a>`}</li>`;
  })}`);
  $$('[data-step]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    go(steps.find((s) => s.id === Number(a.dataset.step)));
  }));
  drawStep();
}

function nextAction() {
  const next = steps[steps.indexOf(current) + 1];
  if (next) return html`<button type="button" class="btn btn-primary btn-lg" id="next">Next: ${next.title} ${icon('arrow-right')}</button>`;
  if (mod.next_module) return html`<a class="btn btn-primary btn-lg" href="/module.html?id=${mod.next_module.id}">Next module: ${mod.next_module.title} ${icon('arrow-right')}</a>`;
  return html`<a class="btn btn-primary btn-lg" href="/learn.html">Back to my learning ${icon('arrow-right')}</a>`;
}

function wireNext() {
  $('#next')?.addEventListener('click', () => {
    const next = steps[steps.indexOf(current) + 1];
    if (next.state.status === 'locked') return toast('Finish this step first', { type: 'warn' });
    go(next);
  });
}

async function submit(answer, button) {
  if (button) setBusy(button, true);
  try {
    const r = await api.post(`me/activities/${current.id}/submit`, { answer, time_ms: Date.now() - openedAt });
    const wasComplete = mod.complete;
    const id = current.id;
    await load(id);
    if (!wasComplete && mod.complete) {
      toast(mod.next_module ? `Module complete! "${mod.next_module.title}" is unlocked.` : 'Module complete! You finished every step.', { type: 'ok', timeout: 8000 });
    }
    return r;
  } catch (err) {
    if (button) setBusy(button, false);
    toast(err.message, { type: 'bad' });
    throw err;
  }
}

function feedback(kind, title, text = '') {
  const el = $('#feedback');
  if (!el) return;
  render(el, html`<div class="callout callout-${kind}" role="status">${icon(kind === 'ok' ? 'check-circle' : 'alert')}<p><strong>${title}</strong> ${text}</p></div>`);
}

function drawStep() {
  openedAt = Date.now();
  const a = current;
  const c = a.content;
  const done = a.state.status === 'done';
  const last = a.last;
  const [typeIcon, typeName] = TYPE[a.type];
  const head = html`<header class="pane-head">
      <span class="pane-type">${icon(typeIcon)} ${typeName}${a.concept ? html` · ${a.concept}` : ''}</span>
      <h2 id="step-title" tabindex="-1">${a.title}</h2>
    </header>
    ${c.body ? html`<div class="pane-body">${prose(c.body)}</div>` : ''}`;
  const pane = $('#pane');
  const footer = (extra = '') => html`<div id="feedback"></div><footer class="pane-foot">${extra}${done ? nextAction() : ''}</footer>`;

  if (['reading', 'slides', 'video'].includes(a.type)) {
    const src = a.type !== 'reading' && embedUrl(c.url);
    render(pane, html`${head}
      ${src ? html`<div class="embed"><iframe src="${src}" title="${a.title}" allowfullscreen loading="lazy"></iframe></div>` : ''}
      ${footer(done ? '' : html`<button type="button" class="btn btn-primary btn-lg" id="read">${a.type === 'reading' ? 'I read it' : 'I watched it'}, continue ${icon('arrow-right')}</button>`)}`);
    $('#read')?.addEventListener('click', async (e) => {
      await submit({}, e.currentTarget).catch(() => null);
      const next = steps[steps.indexOf(current) + 1];
      if (next && next.state.status !== 'locked') go(next);
    });
    return wireNext();
  }

  if (a.type === 'check') {
    render(pane, html`${head}
      <form id="f" class="stack">
        <fieldset class="choices"><legend>${c.question}</legend>
          ${c.choices.map((ch, i) => html`<label class="choice"><input type="radio" name="c" value="${i}" required ${last?.answer?.choice === i ? html`checked` : ''}><span>${ch}</span></label>`)}
        </fieldset>
        <div><button type="submit" class="btn btn-secondary btn-lg">Check my answer</button></div>
      </form>${footer()}`);
    $('#f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const picked = $('input[name=c]:checked');
      if (!picked) return feedback('warn', 'Pick an answer first.');
      const r = await submit({ choice: Number(picked.value) }, e.submitter).catch(() => null);
      if (!r) return;
      if (r.feedback.correct) feedback('ok', 'Correct!', r.feedback.explanation);
      else feedback('warn', `Not quite. The answer is "${c.choices[r.feedback.answer]}".`, r.feedback.explanation);
    });
    return wireNext();
  }

  if (a.type === 'pretest' || a.type === 'posttest') {
    if (done) {
      render(pane, html`${head}<div class="score-card glass">
        <span class="score-big">${last ? `${last.score} / ${last.max_score}` : '✓'}</span>
        <span class="muted">${a.type === 'pretest' ? "That's your starting point. You'll take a similar quiz at the end." : 'Your post-test score.'}</span>
      </div>${footer()}`);
      return wireNext();
    }
    render(pane, html`${head}
      <p class="callout">${icon('info')}<span>${a.type === 'pretest' ? "Not graded. It's fine not to know these yet: this shows where you're starting." : 'Show what you learned. You get one try, so take your time.'}</span></p>
      <form id="f" class="stack">
        ${c.questions.map((q, qi) => html`<fieldset class="choices"><legend><span class="q-num">${qi + 1}</span> ${q.question}</legend>
          ${q.choices.map((ch, i) => html`<label class="choice"><input type="radio" name="q${qi}" value="${i}"><span>${ch}</span></label>`)}</fieldset>`)}
        <div><button type="submit" class="btn btn-primary btn-lg">Submit</button></div>
      </form>${footer()}`);
    $('#f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const missing = c.questions.findIndex((_, i) => !$(`input[name=q${i}]:checked`));
      if (missing >= 0) {
        feedback('warn', `Question ${missing + 1} has no answer yet.`, 'Guessing is fine.');
        $(`input[name=q${missing}]`).focus();
        return;
      }
      const choices = c.questions.map((_, i) => Number($(`input[name=q${i}]:checked`).value));
      const r = await submit({ choices }, e.submitter).catch(() => null);
      if (r?.feedback.gain_points !== undefined) {
        const g = r.feedback.gain_points;
        feedback(g >= 0 ? 'ok' : 'warn', `${r.score} / ${r.max_score}.`, g > 0 ? `That's ${g} points higher than your pretest!` : g === 0 ? 'The same as your pretest.' : 'A bit lower than your pretest. Your teacher will see where to help.');
      }
    });
    return wireNext();
  }

  if (a.type === 'worksheet' || a.type === 'exit') {
    const fields = a.type === 'exit' ? [{ label: c.question, kind: 'long' }] : c.fields;
    const prev = a.type === 'exit' ? [last?.answer?.text] : last?.answer?.fields || [];
    render(pane, html`${head}
      <form id="f" class="stack">
        ${fields.map((f, i) => html`<div class="field"><label for="w${i}">${f.label}</label>
          ${f.kind === 'long'
            ? html`<textarea class="textarea" id="w${i}" rows="3" maxlength="5000" required>${prev[i] || ''}</textarea>`
            : html`<input class="input" id="w${i}" maxlength="5000" required value="${prev[i] || ''}">`}</div>`)}
        <div><button type="submit" class="btn btn-${done ? 'secondary' : 'primary'} btn-lg">${done ? 'Update my answers' : 'Submit'}</button></div>
      </form>
      ${done ? html`<p class="muted text-sm pane-note">${icon('check')} Submitted. Your teacher can see your answers.</p>` : ''}${footer()}`);
    $('#f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const vals = fields.map((_, i) => $(`#w${i}`).value.trim());
      const empty = vals.findIndex((v) => !v);
      if (empty >= 0) { feedback('warn', 'Answer every part first.'); $(`#w${empty}`).focus(); return; }
      await submit(a.type === 'exit' ? { text: vals[0] } : { fields: vals }, e.submitter).catch(() => null);
    });
    return wireNext();
  }

  if (a.type === 'code') return drawCode(head, a, c, done, last, footer);
}

// ---------- Code: instructions | editor | output (CodeHS-style) ----------
function drawCode(head, a, c, done, last, footer) {
  warmup(); // start loading Python while they read
  const code = store.get(draftKey(a.id)) ?? last?.answer?.code ?? c.starter ?? '';
  render($('#pane'), html`${head}
    <div class="pane-body">${prose(c.prompt)}</div>
    <div class="code-grid">
      <div class="code-col">
        <div class="code-bar"><label for="code">${icon('code')} main.py</label><span class="muted text-xs">Ctrl+Enter runs · Esc then Tab leaves the editor</span></div>
        <textarea id="code" class="code-editor" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off">${code}</textarea>
        <div class="cluster code-actions">
          <button type="button" class="btn btn-secondary" id="run">${icon('play')} Run</button>
          <button type="button" class="btn btn-primary" id="check">${icon('check')} Check my code</button>
          <button type="button" class="btn btn-ghost" id="hint">${icon('lightbulb')} Hint</button>
          <button type="button" class="btn btn-ghost" id="reset">Reset</button>
        </div>
      </div>
      <div class="code-col">
        ${c.expected_output ? html`<div class="code-bar"><span>${icon('target')} Expected output</span></div><pre class="code-out code-expected">${c.expected_output}</pre>` : ''}
        <div class="code-bar"><span>${icon('chevron-right')} Output</span></div>
        <pre class="code-out" id="out" aria-live="polite"><span class="muted">Press Run to see what your code prints.</span></pre>
        <div id="hints" class="stack-sm"></div>
      </div>
    </div>
    ${done ? html`<p class="muted text-sm pane-note">${last?.passed ? html`${icon('check')} Passed. You can keep practising.` : 'Submitted. You can keep trying.'}</p>` : ''}
    ${footer()}`);

  const ta = $('#code');
  let lastResult = null;
  let escaped = false;
  ta.addEventListener('input', () => store.set(draftKey(a.id), ta.value));
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { escaped = true; return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('#run').click(); return; }
    if (e.key === 'Tab' && !escaped && !e.shiftKey) {
      e.preventDefault();
      ta.setRangeText('    ', ta.selectionStart, ta.selectionEnd, 'end');
      store.set(draftKey(a.id), ta.value);
    }
    escaped = false;
  });

  const out = $('#out');
  async function run() {
    render(out, html`<span class="muted">Running… (the first run loads Python, a few seconds)</span>`);
    const r = await runPython(ta.value, c);
    lastResult = r;
    out.classList.toggle('has-error', Boolean(r.error));
    render(out, html`${r.stdout ? r.stdout : ''}${r.error ? html`<span class="out-error">${r.error}</span>` : ''}${!r.stdout && !r.error ? html`<span class="muted">(Your program ran and printed nothing.)</span>` : ''}`);
    return r;
  }

  $('#run').addEventListener('click', async (e) => {
    setBusy(e.currentTarget, true);
    await run();
    setBusy(e.currentTarget, false);
  });
  $('#reset').addEventListener('click', () => {
    ta.value = c.starter || '';
    store.set(draftKey(a.id), ta.value);
    ta.focus();
  });
  $('#check').addEventListener('click', async (e) => {
    setBusy(e.currentTarget, true);
    const r = await run();
    const saved = out.innerHTML;
    const res = await submit({ code: ta.value, output: (r.stdout || r.error || '').slice(0, 5000), passed: r.passed }, null).catch(() => null);
    $('#out').innerHTML = saved; // keep the run visible after the pane redraws
    if (!res) return;
    if (res.passed) feedback('ok', 'All checks passed!', 'Great work.');
    else if (res.feedback.moved_on) feedback('warn', 'Not passing yet, but the next step is open.', "You've tried 5 times. Your teacher can see this one and help.");
    else feedback('warn', 'Not yet.', r.testError ? `A check didn't pass: ${r.testError}` : r.mismatch || 'Read the error, try again, or ask for a hint.');
  });
  $('#hint').addEventListener('click', async (e) => {
    setBusy(e.currentTarget, true);
    try {
      const r = lastResult || (await run());
      const error = r.error || r.testError || r.mismatch || '';
      const h = await api.post(`me/activities/${a.id}/hint`, { error });
      $('#hints').insertAdjacentHTML('beforeend', String(html`<div class="hint-card glass" role="status"><strong>${icon('lightbulb')} Hint ${h.hint_number}</strong><p>${h.hint}</p></div>`));
    } catch (err) {
      toast(err.message, { type: 'bad' });
    }
    setBusy(e.currentTarget, false);
  });
  wireNext();
}

try {
  if (!moduleId) throw new Error('No module was chosen.');
  await load(Number(params.get('a')) || null);
} catch (err) {
  $('#module-title').textContent = err.status === 403 ? 'This module is locked' : "We can't open this module";
  $('.player-progress').hidden = true;
  $('.player').classList.add('player-solo');
  render($('.player'), html`<div class="glass-strong empty"><span class="empty-icon">${icon(err.status === 403 ? 'lock' : 'alert')}</span><p>${err.message}</p><a class="btn btn-primary" href="/learn.html">Back to my learning</a></div>`);
}
