// Landing page: the class code box is the main path in.
import { $ } from '../ui/html.js';
import { fillIcons } from '../ui/icons.js';
import { renderShell } from '../ui/shell.js';
import { setBusy, showFieldErrors, clearFieldErrors, toast } from '../ui/components.js';
import { api } from '../ui/api.js';
import { blurIn } from '../ui/motion.js';
import { codeGlobe } from '../ui/code-globe.js';

fillIcons();
renderShell();
blurIn($('#hero-title'));
codeGlobe($('#cine-canvas'));

const form = $('#join-form');
const input = $('#class-code');
const CODE = /^[A-HJ-KM-NP-Z2-9]{6}$/;

// Teachers can share /?code=K7M2QP; prefill it.
const shared = new URLSearchParams(location.search).get('code');
if (shared) input.value = shared.toUpperCase().slice(0, 6);

input.addEventListener('input', () => {
  const clean = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean !== input.value) input.value = clean;
  clearFieldErrors(form);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors(form);
  const code = input.value.trim().toUpperCase();
  if (!CODE.test(code)) {
    const confusable = /[01IOL]/.test(code) ? ' Codes never use 0, 1, I, L or O.' : '';
    showFieldErrors(form, { field: 'Class code', error: `Class codes are 6 letters and numbers.${confusable}` });
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  setBusy(button, true);
  try {
    await api.get(`join/${code}`);
    location.assign(`/join.html?code=${code}`);
  } catch (err) {
    setBusy(button, false);
    if (err.status === 404) {
      showFieldErrors(form, { field: 'Class code', error: "We couldn't find that class. Check the code with your teacher." });
    } else {
      toast(err.message, { type: 'bad' });
    }
  }
});
