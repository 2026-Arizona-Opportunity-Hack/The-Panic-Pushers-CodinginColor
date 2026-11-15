// Talks to /api. Sends JSON, attaches the CSRF token to writes, and turns
// error responses into ApiError({ status, message, field }) so forms can show
// the message next to the right input (see showFieldErrors).

export class ApiError extends Error {
  constructor(status, message, field = null) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

let mePromise = null;

/** Who is signed in: { kind: 'staff'|'student'|null, user|student, perms, csrf }. Cached per page. */
export function me({ refresh = false } = {}) {
  if (!mePromise || refresh) {
    mePromise = request('GET', 'auth/me').catch((err) => {
      mePromise = null;
      throw err;
    });
  }
  return mePromise;
}

async function request(method, path, body) {
  const headers = { Accept: 'application/json' };
  const write = method !== 'GET';
  if (write) {
    headers['Content-Type'] = 'application/json';
    // Public routes (sign-in) do not need a token; signed-in writes do.
    if (!path.startsWith('auth/login') && !path.startsWith('join/')) {
      const who = await me().catch(() => null);
      if (who?.csrf) headers['X-CSRF-Token'] = who.csrf;
    }
  }
  let res;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: write ? JSON.stringify(body ?? {}) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json().catch(() => null) : await res.text();
  if (!res.ok || (data && typeof data === 'object' && data.error && res.status >= 400)) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new ApiError(res.status, message, data?.field ?? null);
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path, body) => request('DELETE', path, body),
};

export async function signOut() {
  await api.post('auth/logout').catch(() => {});
  mePromise = null;
  location.assign('/');
}

/** Staff-only page guard: sends anyone else to sign-in (or students to their page). */
export async function requireStaff() {
  const who = await me().catch(() => ({ kind: null }));
  if (who.kind === 'staff') return who;
  if (who.kind === 'student') location.replace('/learn.html');
  else location.replace(`/signin.html?next=${encodeURIComponent(location.pathname + location.search)}`);
  return new Promise(() => {}); // page is navigating away
}

export const can = (who, perm) => Boolean(who?.perms?.includes(perm));
