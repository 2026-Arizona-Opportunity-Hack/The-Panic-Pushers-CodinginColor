// Password/PIN hashing (scrypt) and random codes. Node built-ins only.
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const KEYLEN = 32;

/** Returns "scrypt$<salt>$<hash>" (base64url). */
export async function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(String(secret), salt, KEYLEN);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifySecret(secret, stored) {
  const [alg, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scrypt(String(secret), Buffer.from(salt, 'base64url'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

/** SHA-256 for session tokens and API keys (high-entropy, so no salt needed). */
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// No 0/O/1/I/L so codes are easy to read off a projector.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newJoinCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

export const newPin = () => String(crypto.randomInt(1000, 10000));
