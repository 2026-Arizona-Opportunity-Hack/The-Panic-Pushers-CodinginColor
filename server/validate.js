// Server-side input validation. Never trust the browser: every field the API
// stores goes through one of these first. Each error names the field it is
// about so the UI can point at the right input.
import { bad } from './http.js';

const missing = (v) => v === undefined || v === null || v === '';

export function str(value, name, { min = 1, max = 200, optional = false } = {}) {
  if (missing(value) || (typeof value === 'string' && !value.trim())) {
    if (optional) return null;
    throw bad(`${name} is required`, name);
  }
  if (typeof value !== 'string') throw bad(`${name} must be text`, name);
  const s = value.trim();
  if (s.length < min) throw bad(`${name} must be at least ${min} characters`, name);
  if (s.length > max) throw bad(`${name} must be at most ${max} characters`, name);
  return s;
}

export function int(value, name, { min = -2147483648, max = 2147483647, optional = false } = {}) {
  if (missing(value)) {
    if (optional) return null;
    throw bad(`${name} is required`, name);
  }
  const n = typeof value === 'number' ? value : /^-?\d+$/.test(String(value).trim()) ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} must be a whole number between ${min} and ${max}`, name);
  return n;
}

/** A database id from a URL or body: positive integer. */
export const id = (value, name = 'ID', opts = {}) => int(value, name, { min: 1, ...opts });

export function bool(value, name, { optional = false } = {}) {
  if (value === undefined || value === null) {
    if (optional) return null;
    throw bad(`${name} is required`, name);
  }
  if (typeof value !== 'boolean') throw bad(`${name} must be true or false`, name);
  return value;
}

export function oneOf(value, name, allowed) {
  if (!allowed.includes(value)) throw bad(`${name} must be one of: ${allowed.join(', ')}`, name);
  return value;
}

export function email(value, name = 'Email') {
  const s = str(value, name, { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw bad(`${name} is not a valid email address`, name);
  return s;
}

export function pin(value, name = 'PIN') {
  const s = String(value ?? '').trim();
  if (!/^\d{4}$/.test(s)) throw bad(`${name} must be 4 digits`, name);
  return s;
}

export function password(value, name = 'Password') {
  return str(value, name, { min: 10, max: 200 });
}

/** Class join codes: 6 characters from the unambiguous alphabet in secrets.js. */
export function classCode(value, name = 'Class code') {
  const s = String(value ?? '').trim().toUpperCase();
  if (!/^[A-HJ-KM-NP-Z2-9]{6}$/.test(s)) throw bad(`${name} should be 6 letters and numbers`, name);
  return s;
}

/** Student display name as typed by a teacher or student: letters, spaces, . ' - */
export function displayName(value, name = 'Name') {
  const s = str(value, name, { max: 60 }).replace(/\s+/g, ' ');
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(s)) throw bad(`${name} can only use letters, spaces, . ' and -`, name);
  return s;
}

const MEDIA_HOSTS = ['youtube.com', 'youtube-nocookie.com', 'youtu.be', 'vimeo.com', 'player.vimeo.com', 'docs.google.com', 'drive.google.com'];
export function mediaUrl(value, name = 'Link') {
  const s = str(value, name, { max: 500, optional: true });
  if (!s) return null;
  let u;
  try { u = new URL(s); } catch { throw bad(`${name} is not a valid link`, name); }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (u.protocol !== 'https:' || !MEDIA_HOSTS.includes(host)) {
    throw bad(`${name} must be an https link to YouTube, Vimeo or Google Slides/Drive`, name);
  }
  return u.toString();
}

function choiceQuestion(q, label, { withConcept = false } = {}) {
  if (!q || typeof q !== 'object') throw bad(`${label} is missing`, label);
  const question = str(q.question, label, { max: 1000 });
  if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 6) throw bad(`${label} needs 2 to 6 choices`, label);
  const choices = q.choices.map((ch, i) => str(ch, `${label} choice ${i + 1}`, { max: 300 }));
  const answer = int(q.answer, `${label} correct answer`, { min: 0, max: choices.length - 1 });
  const out = { question, choices, answer };
  if (withConcept) out.concept_id = id(q.concept_id, `${label} concept`, { optional: true });
  return out;
}

/** Validate the type-specific content of an activity. Returns a clean object (unknown keys dropped). */
export function activityContent(type, c = {}) {
  if (typeof c !== 'object' || Array.isArray(c) || c === null) throw bad('Activity content must be an object');
  const body = str(c.body, 'Body text', { max: 10_000, optional: true }) ?? '';
  switch (type) {
    case 'slides':
    case 'video':
      return { body, url: mediaUrl(c.url, 'Link'), captions: bool(c.captions, 'Captions', { optional: true }) ?? false };
    case 'reading':
      return { body };
    case 'check':
      return { body, ...choiceQuestion(c, 'Check question'), explanation: str(c.explanation, 'Explanation', { max: 2000, optional: true }) ?? '' };
    case 'pretest':
    case 'posttest': {
      const label = type === 'pretest' ? 'Pretest' : 'Post-test';
      if (!Array.isArray(c.questions) || c.questions.length === 0 || c.questions.length > 30) throw bad(`${label} needs 1 to 30 questions`, label);
      return { body, questions: c.questions.map((q, i) => choiceQuestion(q, `${label} question ${i + 1}`, { withConcept: true })) };
    }
    case 'worksheet': {
      if (!Array.isArray(c.fields) || c.fields.length === 0 || c.fields.length > 25) throw bad('A worksheet needs 1 to 25 fields', 'Worksheet');
      const fields = c.fields.map((f, i) => ({
        label: str(f?.label, `Worksheet field ${i + 1}`, { max: 500 }),
        kind: oneOf(f?.kind ?? 'text', `Worksheet field ${i + 1} kind`, ['text', 'long']),
      }));
      return { body, fields };
    }
    case 'exit':
      return { body, question: str(c.question, 'Exit question', { max: 1000 }) };
    case 'code': {
      if (c.hints !== undefined && !Array.isArray(c.hints)) throw bad('Hints must be a list', 'Hints');
      const hints = (c.hints || []).slice(0, 5).map((h, i) => str(h, `Hint ${i + 1}`, { max: 500 }));
      const out = {
        body,
        prompt: str(c.prompt, 'Code prompt', { max: 4000 }),
        starter: typeof c.starter === 'string' ? c.starter.slice(0, 10_000) : '',
        expected_output: typeof c.expected_output === 'string' ? c.expected_output.slice(0, 10_000) : '',
        tests: typeof c.tests === 'string' ? c.tests.slice(0, 10_000) : '',
        hints,
      };
      if (!out.expected_output && !out.tests) throw bad('A code activity needs expected output or test code (or both)', 'Expected output');
      return out;
    }
    default:
      throw bad('Unknown activity type', 'Type');
  }
}
