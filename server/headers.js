// Security headers for every page. vercel.json carries the same list for
// production; scripts/check-headers.js keeps the two in sync.
export const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'", // wasm needed for the in-browser Python runner
    "worker-src 'self'",
    "connect-src 'self'",
    "img-src 'self' data: https:",
    "style-src 'self'",
    'frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://docs.google.com https://drive.google.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
};
