#!/usr/bin/env node
// Vercel build step: copy the Pyodide runtime into public/pyodide so the Python
// runner loads from our own domain (works on school networks that block CDNs).
import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve('node_modules/pyodide');
const dest = path.resolve('public/pyodide');
fs.mkdirSync(dest, { recursive: true });
for (const f of ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) {
  fs.copyFileSync(path.join(src, f), path.join(dest, f));
}
console.log('Copied Pyodide runtime to public/pyodide');
