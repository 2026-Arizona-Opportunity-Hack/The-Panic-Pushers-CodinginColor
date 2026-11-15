// API entry point shared by the Vercel function (api/index.js) and the local
// dev server (scripts/dev.js). For now it only answers /api/health; auth,
// sessions and per-route permissions are added with the sign-in work.
import { dbConfigured, rlsEnforced } from './db.js';
import { send, sendError, notFound } from './http.js';

// Vercel rewrites /api/<path> to /api/index?__path=<path>; locally we get the raw URL.
export function apiPath(req) {
  const url = new URL(req.url, 'http://localhost');
  const rewritten = url.searchParams.get('__path');
  const raw = rewritten ?? url.pathname.replace(/^\/api\/?/, '');
  return raw.replace(/^\/+|\/+$/g, '');
}

async function health() {
  const body = { ok: true, database: dbConfigured() ? 'configured' : 'not configured', time: new Date().toISOString() };
  if (!dbConfigured()) return [200, body];
  try {
    return [200, { ...body, rls_enforced: await rlsEnforced() }];
  } catch {
    return [503, { ...body, ok: false, database: 'unreachable' }];
  }
}

export async function handle(req, res) {
  try {
    const path = apiPath(req);
    if (req.method === 'GET' && path === 'health') {
      const [status, body] = await health();
      return send(res, status, body);
    }
    throw notFound();
  } catch (err) {
    return sendError(res, err);
  }
}
