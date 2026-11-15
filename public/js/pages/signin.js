// Staff sign-in. Redirects back to the page that sent them here (same-site only).
import { $ } from '../ui/html.js';
import { fillIcons } from '../ui/icons.js';
import { renderShell } from '../ui/shell.js';
import { setBusy, showFieldErrors, clearFieldErrors } from '../ui/components.js';
import { api, me } from '../ui/api.js';

fillIcons();
const params = new URLSearchParams(location.search);

// Only follow ?next= to a path on this site ("/x", never "//evil.example" or "https://...").
const next = (() => {
  const n = params.get('next') || '';
  return /^\/(?![/\\])/.test(n) ? n : '/home.html';
})();

if (params.get('as') === 'reviewer') {
  $('#signin-for').textContent = 'Curriculum reviewers';
}

// Attach handlers before awaiting anything, so an early Enter is handled here
// rather than by the browser's default form submit.
const form = $('#signin-form');
const formError = $('#form-error');
const password = $('#password');

const showFormError = (message) => {
  formError.querySelector('p').textContent = message;
  formError.hidden = false;
};

$('#toggle-password').addEventListener('click', (e) => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  e.currentTarget.textContent = show ? 'Hide' : 'Show';
  e.currentTarget.setAttribute('aria-pressed', String(show));
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.hidden = true;
  clearFieldErrors(form);
  const email = $('#email').value.trim();
  if (!email) return showFieldErrors(form, { field: 'Email', error: 'Enter your email' });
  if (!password.value) return showFieldErrors(form, { field: 'Password', error: 'Enter your password' });

  const button = form.querySelector('button[type="submit"]');
  setBusy(button, true);
  try {
    await api.post('auth/login', { email, password: password.value });
    await me({ refresh: true });
    location.assign(next);
  } catch (err) {
    setBusy(button, false);
    if (err.field && showFieldErrors(form, { field: err.field, error: err.message })) return;
    showFormError(err.status === 429 ? `${err.message} Ask a CIC admin if you're locked out.` : err.message);
    password.value = '';
    password.focus();
  }
});

const who = await renderShell();
if (who.kind === 'staff') location.replace(next);
