// Style guide page: fills in icons and wires the theme / contrast switches.
import { html, render, $, $$ } from '../ui/html.js';
import { icon, iconNames, fillIcons } from '../ui/icons.js';
import { createDialog, openDialog, confirmDialog, toast, initToasts, initTabs, progressRing, showFieldErrors } from '../ui/components.js';

fillIcons();

render($('#icon-list'), html`${iconNames.map((name) => html`<li>${icon(name)}<span>${name}</span></li>`)}`);

// ---------- Interactive demos ----------
initToasts();
initTabs($('#demo-tabs'));
render($('#rings'), html`${progressRing(78, { label: 'Module completion' })}
  ${progressRing(45, { label: 'Pretest average', size: 80 })}
  ${progressRing(100, { label: 'Loops mastery', size: 96, stroke: 9 })}`);

const modal = createDialog({
  title: 'Create a class',
  body: html`<div class="stack"><div class="field"><label for="m-name">Class name</label><input class="input" id="m-name" placeholder="Maryvale AI Academy"></div>
    <p class="hint">Takes under 3 minutes: name, modules, roster.</p></div>`,
  footer: html`<button class="btn btn-secondary" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-close>Continue</button>`,
});
const drawer = createDialog({
  kind: 'drawer',
  title: 'Camila R.',
  body: html`<div class="stack"><div class="cluster"><span class="avatar">CR</span><span class="badge badge-warn">Stuck 12 min on Loops</span></div>
    <h3>Hints asked for</h3><ol class="stack-sm"><li>What does range(1, 6) give you? Try printing it.</li><li>Which line repeats? Is it inside the loop?</li></ol>
    <pre><code>for i in range(5):\n    print(i)</code></pre></div>`,
});
$('#open-modal').addEventListener('click', () => openDialog(modal));
$('#open-drawer').addEventListener('click', () => openDialog(drawer));
$('#open-confirm').addEventListener('click', async () => {
  const yes = await confirmDialog({
    title: 'Delete Isaiah J.?',
    body: 'This removes the student and all their work. It cannot be undone.',
    confirmLabel: 'Delete student',
    danger: true,
  });
  $('#confirm-result').textContent = yes ? 'Confirmed: student would be deleted.' : 'Cancelled: nothing changed.';
});
$('#toast-ok').addEventListener('click', () => toast('Roster saved: 24 students added.', { type: 'ok' }));
$('#toast-bad').addEventListener('click', () => toast("Couldn't reach the server. Your answer is saved on this device.", { type: 'bad' }));
$('#demo-form').addEventListener('submit', (e) => {
  e.preventDefault();
  // Same shape the API returns for a duplicate name.
  showFieldErrors(e.target, { error: 'Someone in this class already has that name. Add your last initial, like "Maria G."', field: 'Your name' });
});

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
