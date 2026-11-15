// API entry point shared by the Vercel function (api/index.js) and the local
// dev server (scripts/dev.js). For now it only answers /api/health; auth,
// sessions and per-route permissions are added with the sign-in work.

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// Vercel rewrites /api/<path> to /api/index?__path=<path>; locally we get the raw URL.
export function apiPath(req) {
  const url = new URL(req.url, 'http://localhost');
  const rewritten = url.searchParams.get('__path');
  const raw = rewritten ?? url.pathname.replace(/^\/api\/?/, '');
  return raw.replace(/^\/+|\/+$/g, '');
}

export async function handle(req, res) {
  const path = apiPath(req);
  if (req.method === 'GET' && path === 'health') {
    return sendJson(res, 200, { ok: true, time: new Date().toISOString() });
  }
  return sendJson(res, 404, { error: 'Not found' });
}
