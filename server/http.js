// Small HTTP helpers shared by the Vercel function and the local dev server.

export class HttpError extends Error {
  constructor(status, message, field = null) {
    super(message);
    this.status = status;
    this.field = field; // which input caused it, so the UI can highlight it
  }
}

export const bad = (msg, field = null) => new HttpError(400, msg, field);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const forbidden = (msg = 'You do not have permission to do that') => new HttpError(403, msg);
export const unauthorized = (msg = 'Please sign in') => new HttpError(401, msg);

export const MAX_BODY = 1_000_000; // 1 MB covers a roster CSV or a full module

export async function readJsonBody(req) {
  // On Vercel req.body is a lazy getter that parses JSON (and throws on bad JSON);
  // locally it is undefined and we read the stream ourselves.
  let pre;
  try { pre = req.body; } catch { throw bad('Body must be valid JSON'); }
  if (pre !== undefined && pre !== null && typeof pre !== 'string' && !Buffer.isBuffer(pre)) return pre;

  const declared = Number(req.headers?.['content-length'] || 0);
  if (declared > MAX_BODY) throw new HttpError(413, 'Request too large');
  let raw = '';
  if (typeof pre === 'string') raw = pre;
  else if (Buffer.isBuffer(pre)) raw = pre.toString('utf8');
  else {
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > MAX_BODY) throw new HttpError(413, 'Request too large');
    }
  }
  if (raw.length > MAX_BODY) throw new HttpError(413, 'Request too large');
  if (!raw) return {};
  let body;
  try { body = JSON.parse(raw); } catch { throw bad('Body must be valid JSON'); }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw bad('Body must be a JSON object');
  return body;
}

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers?.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore malformed cookie */ }
  }
  return out;
}

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (typeof body === 'string') {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(body);
  } else {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  }
}

/** Turn any thrown error into a safe JSON response. Internal details are logged, never sent. */
export function sendError(res, err) {
  if (err instanceof HttpError) {
    const body = { error: err.message };
    if (err.field) body.field = err.field;
    return send(res, err.status, body);
  }
  console.error(err);
  return send(res, 500, { error: 'Something went wrong. Please try again.' });
}
