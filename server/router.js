// One router for the whole API, shared by the Vercel function (api/index.js)
// and the local dev server. Every route declares who may call it, and the
// router enforces that BEFORE the handler runs, so a handler cannot forget.
//
//   auth: 'public'   anyone (sign-in, class join page, health)
//         'staff'    signed-in staff; optional perm: 'key' or ['any', 'of', 'these']
//         'student'  signed-in student
//         'apikey'   a valid API key (read-only aggregate data)
import { withActor, dbConfigured, rlsEnforced } from './db.js';
import { resolvePrincipal, actorFor, hasPerm } from './auth.js';
import { HttpError, readJsonBody, send, sendError, forbidden, unauthorized } from './http.js';
import authRoutes from './routes/auth.js';
import curriculumRoutes from './routes/curriculum.js';

// Vercel rewrites /api/<path> to /api/index?__path=<path>; locally we get the raw URL.
export function apiPath(req) {
  const url = new URL(req.url, 'http://localhost');
  const raw = url.searchParams.get('__path') ?? url.pathname.replace(/^\/api\/?/, '');
  return raw.replace(/^\/+|\/+$/g, '');
}

function healthRoutes(route) {
  route('GET', 'health', { auth: 'public', db: false }, async ({ ctx }) => {
    const body = { ok: true, database: dbConfigured() ? 'configured' : 'not configured', time: new Date().toISOString() };
    if (!dbConfigured()) return body;
    try {
      return { ...body, rls_enforced: await rlsEnforced() };
    } catch {
      ctx.status = 503;
      return { ...body, ok: false, database: 'unreachable' };
    }
  });
}

const AUTH_KINDS = ['public', 'staff', 'student', 'apikey'];

export function createRouter(registers) {
  const routes = [];
  const route = (method, pattern, opts, handler) => {
    if (!AUTH_KINDS.includes(opts?.auth)) throw new Error(`Route ${method} ${pattern} must declare auth`);
    routes.push({ method, parts: pattern.split('/').filter(Boolean), opts, handler });
  };
  for (const register of registers) register(route);

  function match(method, path) {
    const parts = path.split('/').filter(Boolean);
    let wrongMethod = false;
    for (const r of routes) {
      if (r.parts.length !== parts.length) continue;
      const params = {};
      const ok = r.parts.every((p, i) => {
        if (p.startsWith(':')) {
          try { params[p.slice(1)] = decodeURIComponent(parts[i]); return true; } catch { return false; }
        }
        return p === parts[i];
      });
      if (!ok) continue;
      if (r.method !== method) { wrongMethod = true; continue; }
      return { r, params };
    }
    if (wrongMethod) throw new HttpError(405, 'Method not allowed');
    throw new HttpError(404, 'No such API route');
  }

  return async function handle(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      url.searchParams.delete('__path');
      const { r, params } = match(req.method, apiPath(req));
      const need = r.opts.auth;
      const mutating = !['GET', 'HEAD'].includes(req.method);

      // CSRF, layer 1: writes must be JSON (a cross-site form cannot send it
      // without a CORS preflight, which we never allow) from this same site.
      if (mutating) {
        if (!(req.headers['content-type'] || '').startsWith('application/json')) {
          throw new HttpError(415, 'Send JSON (Content-Type: application/json)');
        }
        const origin = req.headers.origin;
        if (origin && origin !== 'null') {
          let host;
          try { host = new URL(origin).host; } catch { host = null; }
          if (host !== req.headers.host) throw forbidden('Cross-site request blocked');
        }
        if (req.headers['sec-fetch-site'] === 'cross-site') throw forbidden('Cross-site request blocked');
      }

      const principal = need === 'public'
        ? await resolvePrincipal(req).catch(() => null)
        : await resolvePrincipal(req);

      if (need === 'staff') {
        if (principal?.kind !== 'staff') throw principal ? forbidden('Staff only') : unauthorized();
        if (r.opts.perm && !hasPerm(principal, r.opts.perm)) throw forbidden();
      } else if (need === 'student') {
        if (principal?.kind !== 'student') throw principal ? forbidden('Students only') : unauthorized();
      } else if (need === 'apikey') {
        if (principal?.kind !== 'apikey') throw unauthorized('A valid API key is required (Authorization: Bearer cic_...)');
      }

      // CSRF, layer 2: signed-in writes must echo the session's CSRF token
      // (from GET /api/auth/me) in the X-CSRF-Token header.
      if (mutating && need !== 'public' && principal?.csrf && req.headers['x-csrf-token'] !== principal.csrf) {
        throw forbidden('Your session expired. Reload the page and try again.');
      }

      const body = mutating ? await readJsonBody(req) : {};
      const ctx = { req, params, query: Object.fromEntries(url.searchParams), body, principal, status: 200, cookies: [] };
      ctx.ctx = ctx; // lets handlers set ctx.status after destructuring
      const run = async (q) => { ctx.q = q; return r.handler(ctx); };
      const result = r.opts.db === false
        ? await run(null)
        : await withActor(need === 'public' ? { kind: 'system' } : actorFor(principal), run);

      const headers = {};
      if (ctx.cookies.length) headers['Set-Cookie'] = ctx.cookies;
      if (result && result.$csv !== undefined) {
        headers['Content-Type'] = 'text/csv; charset=utf-8';
        headers['Content-Disposition'] = `attachment; filename="${result.$filename || 'export.csv'}"`;
        return send(res, 200, result.$csv, headers);
      }
      return send(res, ctx.status, result ?? { ok: true }, headers);
    } catch (err) {
      if (err?.code === '23505') return send(res, 409, { error: 'That already exists. It must be unique.' });
      if (err?.code === '23503') return send(res, 409, { error: 'That item is still in use, so it cannot be removed.' });
      return sendError(res, err);
    }
  };
}

export const handle = createRouter([healthRoutes, authRoutes, curriculumRoutes]);
