// Unit tests for server-side validation and request helpers (no database needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import * as v from '../server/validate.js';
import { readJsonBody, parseCookies, HttpError, MAX_BODY } from '../server/http.js';

// Assert fn throws a 400 that names the given field.
const rejects400 = (fn, field) => {
  assert.throws(fn, (e) => e instanceof HttpError && e.status === 400 && (field === undefined || e.field === field));
};
const req = (body, headers = {}) => Object.assign(Readable.from(body === undefined ? [] : [body]), { headers });

test('str trims, enforces length and names the field', () => {
  assert.equal(v.str('  Loops  ', 'Title'), 'Loops');
  rejects400(() => v.str('', 'Title'), 'Title');
  rejects400(() => v.str('   ', 'Title'), 'Title');
  rejects400(() => v.str('x'.repeat(201), 'Title'), 'Title');
  rejects400(() => v.str(42, 'Title'), 'Title');
  assert.equal(v.str(undefined, 'Summary', { optional: true }), null);
});

test('int and id accept whole numbers only', () => {
  assert.equal(v.int('7', 'Position'), 7);
  assert.equal(v.id(3), 3);
  rejects400(() => v.int('7.5', 'Position'), 'Position');
  rejects400(() => v.int('1e3', 'Position'), 'Position');
  rejects400(() => v.id(0, 'Class'), 'Class');
  rejects400(() => v.id('abc', 'Class'), 'Class');
});

test('bool, oneOf and email', () => {
  assert.equal(v.bool(false, 'Published'), false);
  rejects400(() => v.bool('true', 'Published'), 'Published');
  assert.equal(v.oneOf('long', 'Kind', ['text', 'long']), 'long');
  rejects400(() => v.oneOf('html', 'Kind', ['text', 'long']), 'Kind');
  assert.equal(v.email(' Diana@CodingInColor.net '), 'diana@codingincolor.net');
  rejects400(() => v.email('not-an-email'), 'Email');
});

test('PINs, class codes and student names', () => {
  assert.equal(v.pin('0427'), '0427');
  rejects400(() => v.pin('12'), 'PIN');
  rejects400(() => v.pin('12a4'), 'PIN');
  assert.equal(v.classCode(' k7m2qp '), 'K7M2QP');
  rejects400(() => v.classCode('KO1LQP'), 'Class code'); // O, 1, L are never issued
  assert.equal(v.displayName('  José   Ramírez-O\'Neil '), "José Ramírez-O'Neil");
  rejects400(() => v.displayName('<script>'), 'Name');
});

test('passwords need at least 10 characters', () => {
  assert.equal(v.password('long enough pw'), 'long enough pw');
  rejects400(() => v.password('short'), 'Password');
});

test('media links must be https on an allow-listed host', () => {
  assert.equal(v.mediaUrl('https://www.youtube.com/watch?v=abc'), 'https://www.youtube.com/watch?v=abc');
  assert.equal(v.mediaUrl('https://docs.google.com/presentation/d/x'), 'https://docs.google.com/presentation/d/x');
  assert.equal(v.mediaUrl('', 'Link'), null);
  rejects400(() => v.mediaUrl('http://youtube.com/watch?v=abc'), 'Link');
  rejects400(() => v.mediaUrl('https://youtube.com.evil.example/x'), 'Link');
  rejects400(() => v.mediaUrl('https://evil-youtube.com/x'), 'Link');
  rejects400(() => v.mediaUrl('javascript:alert(1)'), 'Link');
});

test('activity content is validated per type and unknown keys are dropped', () => {
  const check = v.activityContent('check', { question: 'What prints?', choices: ['1', '2'], answer: 1, extra: 'x' });
  assert.deepEqual(Object.keys(check).sort(), ['answer', 'body', 'choices', 'explanation', 'question']);
  rejects400(() => v.activityContent('check', { question: 'Q', choices: ['only one'], answer: 0 }));
  rejects400(() => v.activityContent('check', { question: 'Q', choices: ['a', 'b'], answer: 5 }));

  const pre = v.activityContent('pretest', { questions: [{ question: 'Q1', choices: ['a', 'b'], answer: 0, concept_id: 4 }] });
  assert.equal(pre.questions[0].concept_id, 4);
  rejects400(() => v.activityContent('posttest', { questions: [] }), 'Post-test');

  assert.equal(v.activityContent('worksheet', { fields: [{ label: 'Describe a loop' }] }).fields[0].kind, 'text');
  rejects400(() => v.activityContent('worksheet', { fields: [{ label: 'x', kind: 'file' }] }));

  const code = v.activityContent('code', { prompt: 'Print 1 to 5', expected_output: '1\n2\n3\n4\n5' });
  assert.equal(code.starter, '');
  rejects400(() => v.activityContent('code', { prompt: 'Print 1 to 5' }), 'Expected output');
  rejects400(() => v.activityContent('video', { url: 'https://example.com/v.mp4' }), 'Link');
  rejects400(() => v.activityContent('quiz', {}), 'Type');
});

test('readJsonBody parses objects and rejects bad or oversized bodies', async () => {
  assert.deepEqual(await readJsonBody(req('{"name":"Loops"}')), { name: 'Loops' });
  assert.deepEqual(await readJsonBody(req()), {});
  await assert.rejects(readJsonBody(req('{oops')), (e) => e.status === 400);
  await assert.rejects(readJsonBody(req('[1,2]')), (e) => e.status === 400);
  await assert.rejects(readJsonBody(req('{}', { 'content-length': String(MAX_BODY + 1) })), (e) => e.status === 413);
  await assert.rejects(readJsonBody(req('"' + 'x'.repeat(MAX_BODY + 10) + '"')), (e) => e.status === 413);
});

test('parseCookies ignores malformed values', () => {
  assert.deepEqual(parseCookies({ headers: { cookie: 'a=1; cic_session=abc%20d; bad=%E0%A4%A' } }), { a: '1', cic_session: 'abc d' });
});
