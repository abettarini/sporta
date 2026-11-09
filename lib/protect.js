'use strict';
/* Protezioni contro gli abusi (spam, invii di massa).

   - ALTCHA: prima di chiedere un codice via email il browser risolve una piccola "prova di
     lavoro" (trovare un numero dalla sua impronta SHA-256). Per una persona è meno di un
     secondo, in background; per chi manda richieste in massa il costo cresce. La difficoltà
     aumenta con le richieste recenti dallo stesso indirizzo IP. Nessun servizio esterno.
   - Limiti salvati nel database (valgono anche con più istanze, come su Vercel).
   - Indirizzi che non vogliono più ricevere inviti (link in fondo agli inviti).
   - Niente indirizzi web nei testi scelti dagli utenti che finiscono nelle email.

   Segreto: APP_SECRET (firma delle sfide e dei link per non ricevere inviti). */

const crypto = require('node:crypto');
const altcha = require('altcha-lib/v1');
const { HttpError, now, sha } = require('./util');

const PROTECT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS rate_events (key TEXT NOT NULL, created_at BIGINT NOT NULL);
  CREATE INDEX IF NOT EXISTS rate_events_key ON rate_events(key, created_at);
  CREATE TABLE IF NOT EXISTS altcha_used (signature TEXT PRIMARY KEY, expires_at BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS email_blocks (email TEXT PRIMARY KEY, created_at BIGINT NOT NULL);
`;

const CHALLENGE_MINUTES = 10;
// Difficoltà (numero massimo da cercare): normale, poi più alta con molte richieste dallo stesso IP.
const LEVELS = [[0, 50000], [6, 200000], [15, 600000]];

// Indirizzi web nei testi: "http://…", "www.…" o un dominio con estensione comune.
const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|info|biz|xyz|top|ru|cn|io|co|me|app|link|click|shop|store|site|online|live|club|vip|win|bet|loan|eu|it|de|fr|uk|us)\b)/i;
const hasLink = (s) => LINK_RE.test(String(s || ''));
const stripLinks = (s) => String(s || '').replace(new RegExp(LINK_RE.source + '\\S*', 'gi'), '[link rimosso]');
function noLinks(s, what) {
  if (hasLink(s)) throw new HttpError(400, `${what} non può contenere indirizzi web`, 'no_links');
  return s;
}

function secretFrom(env) {
  if (env.APP_SECRET) return env.APP_SECRET;
  // Senza APP_SECRET: derivato da un altro segreto già presente (meglio impostarlo).
  const base = env.VAPID_PRIVATE_KEY || env.EMAIL_API_KEY || env.CRON_SECRET;
  if (base) { console.warn('APP_SECRET non impostato: uso un segreto derivato. Impostalo nelle variabili d\'ambiente.'); return sha('sporta:' + base); }
  console.warn('APP_SECRET non impostato: uso un segreto temporaneo (cambia a ogni avvio).');
  return crypto.randomBytes(32).toString('hex');
}

function createProtect({ db, env = process.env }) {
  const secret = secretFrom(env);
  const powOff = env.ALTCHA_DISABLED === '1'; // solo per i test automatici

  // ------------------------------------------------------------ limiti
  // Conta gli eventi di `key` nella finestra; oltre `max` rifiuta, altrimenti registra.
  async function hit(key, max, windowMs, message = 'Troppe richieste: riprova più tardi') {
    const n = Number((await db.get('SELECT COUNT(*) AS n FROM rate_events WHERE key = ? AND created_at > ?', [key, now() - windowMs])).n);
    if (n >= max) throw new HttpError(429, message, 'rate_limited');
    await db.run('INSERT INTO rate_events (key, created_at) VALUES (?, ?)', [key, now()]);
    if (Math.random() < 0.02) cleanup().catch(() => {});
  }
  const count = async (key, windowMs) => Number((await db.get('SELECT COUNT(*) AS n FROM rate_events WHERE key = ? AND created_at > ?', [key, now() - windowMs])).n);
  async function cleanup() {
    await db.run('DELETE FROM rate_events WHERE created_at < ?', [now() - 2 * 864e5]);
    await db.run('DELETE FROM altcha_used WHERE expires_at < ?', [now()]);
    // Inviti scaduti o già usati da più di 30 giorni (fino ad allora il link dice "scaduto" o "già usato").
    await db.run('DELETE FROM invites WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)', [now() - 30 * 864e5, now() - 30 * 864e5]);
  }

  // ------------------------------------------------------------ ALTCHA
  async function challenge(ip) {
    const recent = await count('code-ip:' + ip, 3600e3);
    const maxNumber = powOff ? 10 : LEVELS.filter(([n]) => recent >= n).pop()[1];
    return altcha.createChallenge({ hmacKey: secret, maxNumber, expires: new Date(now() + CHALLENGE_MINUTES * 60e3) });
  }
  async function verify(payload) {
    if (powOff) return;
    const bad = () => new HttpError(400, 'Verifica non riuscita: ricarica la pagina e riprova', 'bad_proof');
    if (typeof payload !== 'string' || payload.length > 2000) throw bad();
    let ok = false, sig = '';
    try {
      ok = await altcha.verifySolution(payload, secret, true);
      sig = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')).signature;
    } catch { ok = false; }
    if (!ok || !sig) throw bad();
    // Ogni sfida vale una volta sola.
    if (await db.get('SELECT signature FROM altcha_used WHERE signature = ?', [sig])) throw bad();
    await db.run('INSERT INTO altcha_used (signature, expires_at) VALUES (?, ?)', [sig, now() + CHALLENGE_MINUTES * 60e3]);
  }

  // ------------------------------------------------------------ "non voglio più ricevere inviti"
  const stopToken = (email) => crypto.createHmac('sha256', secret).update('stop:' + email).digest('base64url').slice(0, 32);
  const stopPath = (email) => `/api/email/stop?e=${encodeURIComponent(Buffer.from(email).toString('base64url'))}&t=${stopToken(email)}`;
  const isBlocked = async (email) => !!(await db.get('SELECT email FROM email_blocks WHERE email = ?', [email]));
  const unblock = (email) => db.run('DELETE FROM email_blocks WHERE email = ?', [email]);

  // Pagina del link: conferma con un pulsante (i controlli automatici dei link non bastano a bloccare).
  async function stopPage(m, b) {
    let email = '';
    try { email = Buffer.from(String(b.e || ''), 'base64url').toString('utf8'); } catch { /* */ }
    const valid = email && b.t && crypto.timingSafeEqual(Buffer.from(stopToken(email)), Buffer.from(String(b.t).padEnd(32).slice(0, 32)));
    let body;
    if (!valid) body = '<h1>Link non valido</h1><p>Il link è incompleto o non è più valido.</p>';
    else if (m === 'POST') {
      if (!await isBlocked(email)) await db.run('INSERT INTO email_blocks (email, created_at) VALUES (?, ?)', [email, now()]);
      body = `<h1>Fatto</h1><p>Non riceverai più inviti da Sporta su <b>${esc(email)}</b>.</p><p>Se un giorno vorrai usare Sporta, entra con questa email: gli inviti torneranno attivi.</p>`;
    } else {
      body = `<h1>Non vuoi ricevere inviti?</h1><p>Smetteremo di inviare inviti a <b>${esc(email)}</b>, da chiunque arrivino.</p>
        <form method="post"><button>Non voglio più ricevere inviti</button></form>`;
    }
    return {
      status: 200,
      raw: Buffer.from(`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Sporta</title>
<style>body{margin:0;background:#f4f6f4;color:#16201b;font:16px/1.55 system-ui,sans-serif}main{max-width:520px;margin:40px auto;padding:24px;background:#fff;border-radius:16px}h1{font-size:22px}button{background:#1f8a5b;color:#fff;border:0;border-radius:12px;padding:12px 18px;font:600 16px system-ui}</style>
</head><body><main>${body}</main></body></html>`),
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    };
  }

  return { hit, count, cleanup, challenge, verify, stopPath, stopPage, isBlocked, unblock, secret };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = { createProtect, PROTECT_SCHEMA, hasLink, stripLinks, noLinks };
