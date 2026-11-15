#!/usr/bin/env node
// Fails if vercel.json's security headers drift from server/headers.js.
import fs from 'node:fs';
import { SECURITY_HEADERS } from '../server/headers.js';

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const prod = Object.fromEntries(vercel.headers[0].headers.map((h) => [h.key, h.value]));
const diff = Object.keys(SECURITY_HEADERS).filter((k) => prod[k] !== SECURITY_HEADERS[k]);
if (diff.length) { console.error('vercel.json headers differ from server/headers.js:', diff); process.exit(1); }
console.log('Security headers in sync.');
