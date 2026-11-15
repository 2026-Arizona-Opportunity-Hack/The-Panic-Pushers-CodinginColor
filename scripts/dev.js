#!/usr/bin/env node
// Local dev server: serves public/, the Pyodide runtime and the API on one port.
// Production runs on Vercel instead (same handler, see api/index.js).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from './env.js';
loadEnv();
const { handle } = await import('../server/router.js');
const { SECURITY_HEADERS } = await import('../server/headers.js');

const PORT = Number(process.env.PORT || 3000);
const root = path.resolve('public');
const pyodideDir = path.resolve('node_modules/pyodide');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.zip': 'application/zip', '.csv': 'text/csv', '.txt': 'text/plain' };

http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (k !== 'Strict-Transport-Security') res.setHeader(k, v);
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return handle(req, res);
  let base = root, rel = url.pathname;
  if (rel.startsWith('/pyodide/')) { base = pyodideDir; rel = rel.slice('/pyodide'.length); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(base, path.normalize(decodeURIComponent(rel)));
  if (!file.startsWith(base)) { res.statusCode = 400; return res.end('Bad path'); }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(fs.existsSync(path.join(root, '404.html')) ? fs.readFileSync(path.join(root, '404.html')) : 'Not found');
    }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
}).listen(PORT, () => console.log(`CIC Classroom running at http://localhost:${PORT}`));
