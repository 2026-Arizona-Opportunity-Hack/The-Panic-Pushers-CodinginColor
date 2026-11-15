// Sessions and "who is calling". Staff sign in with email + password; students
// with a class code + PIN. Session tokens and API keys are random and stored
// only as SHA-256 hashes, so a database leak does not leak live sessions.
import crypto from 'node:crypto';
import { asSystem } from './db.js';
import { parseCookies } from './http.js';
import { sha256 } from './secrets.js';

export const SESSION_HOURS = 12;
export const MAX_FAILED = 5;
export const LOCK_MINUTES = 15;
export const COOKIE = 'cic_session';

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export function sessionCookie(token, maxAgeSeconds) {
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${token ? encodeURIComponent(token) : ''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

/** Create a session row and return the raw token (only ever sent in the cookie). */
export async function createSession(q, { userId = null, studentId = null }) {
  const token = randomToken();
  await q(
    `insert into sessions (token_hash, user_id, student_id, csrf_token, expires_at)
     values ($1, $2, $3, $4, now() + make_interval(hours => $5))`,
    [sha256(token), userId, studentId, randomToken(24), SESSION_HOURS]
  );
  return token;
}

/**
 * Works out who is calling. Returns one of:
 *  { kind: 'staff', user, perms: Set<string>, csrf }
 *  { kind: 'student', student: { id, display_name, class_id }, csrf }
 *  { kind: 'apikey', key: { id, name } }
 *  null (anonymous)
 */
export async function resolvePrincipal(req) {
  const auth = req.headers.authorization || '';
  const apiKey = req.headers['x-api-key'] || (auth.startsWith('Bearer cic_') ? auth.slice(7) : null);
  if (apiKey) {
    return asSystem(async (q) => {
      const key = await q.one(
        'update api_keys set last_used_at = now() where key_hash = $1 and revoked_at is null returning id, name',
        [sha256(String(apiKey))]
      );
      return key ? { kind: 'apikey', key } : null;
    });
  }

  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  return asSystem(async (q) => {
    const s = await q.one('select user_id, student_id, csrf_token from sessions where token_hash = $1 and expires_at > now()', [sha256(token)]);
    if (!s) return null;
    if (s.user_id) {
      const user = await q.one(
        `select u.id, u.name, u.email, r.key as role_key, r.name as role_name,
                coalesce(array_agg(rp.permission_key) filter (where rp.permission_key is not null), '{}') as perms
           from users u join roles r on r.id = u.role_id
           left join role_permissions rp on rp.role_id = r.id
          where u.id = $1 and u.active
          group by u.id, r.key, r.name`,
        [s.user_id]
      );
      if (!user) return null;
      const perms = new Set(user.perms);
      delete user.perms;
      return { kind: 'staff', user, perms, csrf: s.csrf_token };
    }
    const student = await q.one('update students set last_seen_at = now() where id = $1 returning id, display_name, class_id', [s.student_id]);
    return student ? { kind: 'student', student, csrf: s.csrf_token } : null;
  });
}

/** The row-level security identity for a principal (see db/schema.sql). */
export function actorFor(principal) {
  if (principal?.kind === 'student') return { kind: 'student', studentId: principal.student.id };
  if (principal?.kind === 'staff') return { kind: 'staff' };
  if (principal?.kind === 'apikey') return { kind: 'system' }; // read-only aggregate routes only
  return { kind: 'none' };
}

export function hasPerm(principal, perm) {
  if (principal?.kind !== 'staff') return false;
  return (Array.isArray(perm) ? perm : [perm]).some((p) => principal.perms.has(p));
}

/** Count a failed sign-in; lock the account after MAX_FAILED in a row. */
export const recordFailure = (q, table, id) =>
  q(
    `update ${table === 'users' ? 'users' : 'students'} set failed_logins = failed_logins + 1,
       locked_until = case when failed_logins + 1 >= $2 then now() + make_interval(mins => $3) end
     where id = $1`,
    [id, MAX_FAILED, LOCK_MINUTES]
  );

export const isLocked = (row) => Boolean(row?.locked_until && new Date(row.locked_until) > new Date());
