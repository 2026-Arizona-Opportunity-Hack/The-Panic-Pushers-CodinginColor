// Sign-in for staff (email + password) and students (class code + name + PIN).
import crypto from 'node:crypto';
import { createSession, sessionCookie, recordFailure, isLocked, COOKIE, SESSION_HOURS, LOCK_MINUTES } from '../auth.js';
import { hashSecret, verifySecret, sha256, newPin } from '../secrets.js';
import { HttpError, bad, notFound, parseCookies } from '../http.js';
import * as v from '../validate.js';

// Verify against a throwaway hash when the email is unknown, so response time
// does not reveal which emails have accounts.
let dummyHash;
const getDummyHash = async () => (dummyHash ??= await hashSecret(crypto.randomBytes(16).toString('hex')));

const findClass = async (q, code) => {
  const cls = await q.one(
    `select c.id, c.name, c.self_join, s.name as school
       from classes c left join schools s on s.id = c.school_id
      where c.join_code = $1 and not c.archived`,
    [v.classCode(code)]
  );
  if (!cls) throw notFound('No class with that code. Check the code with your teacher.');
  return cls;
};

export default function register(route) {
  route('POST', 'auth/login', { auth: 'public' }, async ({ q, body, cookies, ctx }) => {
    const email = v.email(body.email);
    const password = v.str(body.password, 'Password', { max: 200 });
    const user = await q.one('select id, password_hash, active, locked_until from users where email = $1', [email]);
    if (isLocked(user)) throw new HttpError(429, `Too many attempts. Try again in ${LOCK_MINUTES} minutes.`);
    const ok = await verifySecret(password, user?.password_hash ?? (await getDummyHash()));
    if (!user || !ok || !user.active) {
      if (user) await recordFailure(q, 'users', user.id);
      ctx.status = 401; // return, not throw, so the transaction commits the failure count
      return { error: 'Email or password is incorrect' };
    }
    await q('update users set failed_logins = 0, locked_until = null where id = $1', [user.id]);
    cookies.push(sessionCookie(await createSession(q, { userId: user.id }), SESSION_HOURS * 3600));
    return { ok: true };
  });

  route('POST', 'auth/logout', { auth: 'public' }, async ({ q, req, cookies }) => {
    const token = parseCookies(req)[COOKIE];
    if (token) await q('delete from sessions where token_hash = $1', [sha256(token)]);
    cookies.push(sessionCookie('', 0));
    return { ok: true };
  });

  // The UI calls this on load: who am I, what may I do, and the CSRF token for writes.
  route('GET', 'auth/me', { auth: 'public' }, async ({ principal, q }) => {
    if (principal?.kind === 'staff') {
      return { kind: 'staff', user: principal.user, perms: [...principal.perms].sort(), csrf: principal.csrf };
    }
    if (principal?.kind === 'student') {
      const cls = await q.one('select name from classes where id = $1', [principal.student.class_id]);
      return { kind: 'student', student: principal.student, class_name: cls?.name ?? null, csrf: principal.csrf };
    }
    return { kind: null };
  });

  // ----- Students: class join page (like a code.org class link) -----
  route('GET', 'join/:code', { auth: 'public' }, async ({ q, params }) => {
    const cls = await findClass(q, params.code);
    const students = await q('select id, display_name from students where class_id = $1 order by display_name', [cls.id]);
    return { class: { name: cls.name, school: cls.school, self_join: cls.self_join }, students };
  });

  route('POST', 'join/:code/login', { auth: 'public' }, async ({ q, params, body, cookies, ctx }) => {
    const cls = await findClass(q, params.code);
    const studentId = v.id(body.student_id, 'Student');
    const pin = v.pin(body.pin);
    const s = await q.one('select id, pin_hash, locked_until from students where id = $1 and class_id = $2', [studentId, cls.id]);
    if (!s) throw bad('Pick your name from the list', 'Student');
    if (isLocked(s)) throw new HttpError(429, `Too many tries. Ask your teacher to reset your PIN, or wait ${LOCK_MINUTES} minutes.`);
    if (!(await verifySecret(pin, s.pin_hash))) {
      await recordFailure(q, 'students', s.id);
      ctx.status = 401;
      return { error: 'That PIN is not right. Try again or ask your teacher.', field: 'PIN' };
    }
    await q('update students set failed_logins = 0, locked_until = null, last_seen_at = now() where id = $1', [s.id]);
    cookies.push(sessionCookie(await createSession(q, { studentId: s.id }), SESSION_HOURS * 3600));
    return { ok: true };
  });

  // A late joiner adds themselves (only when the instructor left self-join on).
  // They get a PIN once, to write down; the teacher can reset it later.
  route('POST', 'join/:code/new', { auth: 'public' }, async ({ q, params, body, cookies, ctx }) => {
    const cls = await findClass(q, params.code);
    if (!cls.self_join) throw bad('This class does not allow joining yourself. Ask your teacher to add you.');
    const name = v.displayName(body.display_name, 'Your name');
    const taken = await q.one('select 1 from students where class_id = $1 and lower(display_name) = lower($2)', [cls.id, name]);
    if (taken) throw new HttpError(409, 'Someone in this class already has that name. Add your last initial, like "Maria G."', 'Your name');
    const pin = newPin();
    const s = await q.one('insert into students (class_id, display_name, pin_hash) values ($1, $2, $3) returning id', [cls.id, name, await hashSecret(pin)]);
    cookies.push(sessionCookie(await createSession(q, { studentId: s.id }), SESSION_HOURS * 3600));
    ctx.status = 201;
    return { ok: true, pin };
  });
}
