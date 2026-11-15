// Student join: /join.html?code=K7M2QP
//   names  -> tap your name (searchable grid)
//   pin    -> 4-digit PIN on a big number pad (or the keyboard)
//   new    -> "I'm not on the list": type your name (when the class allows it)
//   reveal -> the new PIN, shown once, with a reminder to write it down
import { $, $$, html, render, initials } from '../ui/html.js';
import { fillIcons } from '../ui/icons.js';
import { renderShell, refreshUser } from '../ui/shell.js';
import { setBusy, showFieldErrors, clearFieldErrors, toast } from '../ui/components.js';
import { api, me } from '../ui/api.js';

const NEXT = '/learn.html';
const CODE = /^[A-HJ-KM-NP-Z2-9]{6}$/;
const code = (new URLSearchParams(location.search).get('code') || '').trim().toUpperCase();

fillIcons();
const shell = renderShell();

// ---------- Steps ----------
function show(step, focus) {
  for (const s of $$('[data-step]')) s.hidden = s.dataset.step !== step;
  const panel = $(`[data-step="${step}"]`);
  const target = focus ?? panel.querySelector('h1');
  if (target) {
    if (target.tagName === 'H1') target.tabIndex = -1;
    target.focus({ preventScroll: false });
  }
  window.scrollTo({ top: 0 });
}

function missing(message) {
  if (message) $('#missing-text').textContent = message;
  show('missing');
}

// ---------- Names ----------
let students = [];
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function renderNames(filter = '') {
  const f = fold(filter.trim());
  const list = f ? students.filter((s) => fold(s.display_name).includes(f)) : students;
  render($('#names'), html`${list.map((s) => html`<li>
    <button class="name-btn" type="button" data-id="${s.id}">
      <span class="avatar" aria-hidden="true">${initials(s.display_name)}</span><span>${s.display_name}</span>
    </button></li>`)}`);
  $('#names-empty').hidden = list.length > 0 || students.length === 0;
  $('#names-status').textContent = f ? `${list.length} ${list.length === 1 ? 'name matches' : 'names match'}` : '';
  return list;
}

$('#search').addEventListener('input', (e) => renderNames(e.target.value));
$('#search').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const list = renderNames(e.target.value);
  if (list.length === 1) choose(list[0]);
});
$('#names').addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (b) choose(students.find((s) => s.id === Number(b.dataset.id)));
});

// ---------- PIN ----------
const pinForm = $('#pin-form');
const pinInput = $('#pin');
const pinField = pinInput.closest('.pin-field');
const pinError = $('#pin-error');
let chosen = null;
let busy = false;

// On touch screens use our pad instead of popping up the phone keyboard.
if (matchMedia('(pointer: coarse)').matches) pinInput.setAttribute('inputmode', 'none');

function setPin(value) {
  pinInput.value = value.replace(/\D/g, '').slice(0, 4);
  if (pinInput.value.length === 1) pinMessage(''); // a fresh try clears the last error
  $$('.pin-dots span').forEach((d, i) => d.classList.toggle('on', i < pinInput.value.length));
  if (pinInput.value.length === 4) pinForm.requestSubmit();
}

function pinMessage(message) {
  pinError.querySelector('p').textContent = message;
  pinError.hidden = !message;
}

function lockPad(locked) {
  for (const b of $$('.pin-key, #pin-submit')) b.disabled = locked;
  pinInput.disabled = locked;
}

function choose(student) {
  chosen = student;
  $('#pin-name').textContent = student.display_name;
  $('#pin-avatar').textContent = initials(student.display_name);
  pinMessage('');
  pinField.classList.remove('bad');
  lockPad(false);
  setPin('');
  history.pushState({ step: 'pin' }, '');
  show('pin', pinInput);
}

pinInput.addEventListener('input', () => {
  pinField.classList.remove('bad');
  setPin(pinInput.value);
});
$('.pin-pad').addEventListener('click', (e) => {
  const key = e.target.closest('.pin-key');
  if (!key || busy) return;
  if (key.dataset.digit) setPin(pinInput.value + key.dataset.digit);
  else if ('erase' in key.dataset) setPin(pinInput.value.slice(0, -1));
  else setPin('');
  pinField.classList.remove('bad');
});

pinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  if (pinInput.value.length !== 4) {
    pinMessage('Enter all 4 numbers of your PIN.');
    pinInput.focus();
    return;
  }
  busy = true;
  setBusy($('#pin-submit'), true);
  try {
    await api.post(`join/${code}/login`, { student_id: chosen.id, pin: pinInput.value });
    await me({ refresh: true });
    location.assign(NEXT);
  } catch (err) {
    busy = false;
    setBusy($('#pin-submit'), false);
    setPin('');
    pinField.classList.remove('bad');
    void pinField.offsetWidth; // restart the shake animation
    pinField.classList.add('bad');
    if (err.status === 429) {
      pinMessage(err.message);
      lockPad(true);
      $('[data-step="pin"] [data-back]').focus();
    } else {
      pinMessage(err.message);
      pinInput.focus();
    }
  }
});

// ---------- Late joiner ----------
const newForm = $('#new-form');

$('#new-start').addEventListener('click', () => {
  clearFieldErrors(newForm);
  $('#new-name').value = $('#search').value.trim();
  history.pushState({ step: 'new' }, '');
  show('new', $('#new-name'));
});

newForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors(newForm);
  const name = $('#new-name').value.trim().replace(/\s+/g, ' ');
  if (!name) return showFieldErrors(newForm, { field: 'Your name', error: 'Type your name' });
  const button = newForm.querySelector('button[type="submit"]');
  setBusy(button, true);
  try {
    const { pin } = await api.post(`join/${code}/new`, { display_name: name });
    $('#reveal-pin').textContent = pin;
    $('#reveal-pin').setAttribute('aria-label', `Your PIN is ${pin.split('').join(' ')}`);
    history.replaceState({ step: 'reveal' }, '');
    show('reveal');
    $('#already').hidden = true;
    refreshUser();
  } catch (err) {
    setBusy(button, false);
    if (!showFieldErrors(newForm, { field: err.field, error: err.message })) toast(err.message, { type: 'bad' });
  }
});

$('#reveal-ok').addEventListener('change', (e) => { $('#reveal-go').disabled = !e.target.checked; });
$('#reveal-go').addEventListener('click', () => location.assign(NEXT));

// ---------- Back ----------
for (const b of $$('[data-back]')) b.addEventListener('click', () => history.back());
window.addEventListener('popstate', () => {
  if (!$('[data-step="reveal"]').hidden) return; // the PIN screen stays until they continue
  show('names', $('#search'));
});

// ---------- Load the class ----------
async function load() {
  if (!CODE.test(code)) return missing('That link is missing a class code. Enter the code your teacher gave you.');
  let data;
  try {
    data = await api.get(`join/${code}`);
  } catch (err) {
    return missing(err.status === 404 ? undefined : err.message);
  }
  students = data.students;
  document.title = `${data.class.name} · CIC Classroom`;
  $('#class-title').textContent = data.class.name;
  $('#class-school').textContent = data.class.school || 'Your class';
  $('#new-start').hidden = !data.class.self_join;
  $('#not-listed-closed').hidden = data.class.self_join;
  $('#search-field').hidden = students.length < 8; // a short list doesn't need searching
  if (!students.length) {
    render($('#names'), html``);
    $('#names-empty').hidden = false;
    render($('#names-empty'), html`<p><strong>No one has joined yet.</strong></p>
      <p class="muted">${data.class.self_join ? 'Be the first: use “I’m not on the list”.' : 'Ask your teacher to add you.'}</p>`);
  } else {
    renderNames();
  }
  $('[data-step="loading"]').removeAttribute('aria-busy');
  show('names', false); // don't pull focus on first load

  const who = await shell;
  if (who.kind === 'student') {
    $('#already-name').textContent = who.student.display_name;
    $('#already').hidden = false;
  }
}

load();
