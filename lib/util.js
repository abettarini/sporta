'use strict';
// Funzioni di supporto condivise dai moduli del server.

const crypto = require('node:crypto');

class HttpError extends Error {
  // `code`: identificativo dell'errore per il client (es. "removed", "alias_taken").
  constructor(status, msg, code) { super(msg); this.status = status; this.code = code; }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  let s = '';
  for (const b of crypto.randomBytes(12)) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}
const newToken = (bytes = 16) => crypto.randomBytes(bytes).toString('base64url');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const str = (v, max = 200) => (v == null ? '' : String(v).slice(0, max).trim());
const now = () => Date.now();
const num = (v) => (v == null ? v : Number(v));
const parseJson = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };

// Limite semplice ai tentativi (codici errati, richieste di accesso), per istanza.
const attempts = new Map();
function checkRate(key, max = 30, windowMs = 10 * 60 * 1000) {
  const t = now();
  const a = attempts.get(key) || { n: 0, t };
  if (t - a.t > windowMs) { a.n = 0; a.t = t; }
  a.n++;
  attempts.set(key, a);
  if (attempts.size > 10000) attempts.clear();
  if (a.n > max) throw new HttpError(429, 'Troppi tentativi, riprova più tardi', 'rate_limited');
}

module.exports = { HttpError, newCode, newToken, sha, ID_RE, str, now, num, parseJson, checkRate };
