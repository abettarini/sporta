'use strict';
/* Account delle persone: l'email (verificata) identifica la persona in tutti i gruppi.

   - Accesso senza password: codice di 6 cifre via email (con un link nella stessa email).
   - Ogni dispositivo dell'account ha una chiave "a_…"; le chiavi di gruppo "m_…" dello stesso
     dispositivo sono legate a lui (member_devices.device_id): uscendo, si revocano insieme.
   - Ogni appartenenza a un gruppo (members) è collegata all'account (members.account_id):
     una persona ha al massimo un posto per gruppo.
   - Condizioni d'uso e informativa privacy: versione accettata e data, per account. */

const crypto = require('node:crypto');
const { deleteBlobs, blobUrlsWhere } = require('./photos');
const { HttpError, newToken, sha, str, now, num, checkRate } = require('./util');
const { TERMS_VERSION } = require('./legal');

const ACCOUNT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, created_at BIGINT NOT NULL, verified_at BIGINT,
    last_login_at BIGINT, terms_version TEXT NOT NULL DEFAULT '', terms_accepted_at BIGINT, accepted_ip TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS auth_codes (
    id TEXT PRIMARY KEY, email TEXT NOT NULL, code_hash TEXT NOT NULL, link_hash TEXT NOT NULL, purpose TEXT NOT NULL,
    account_id TEXT, attempts INTEGER NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL,
    used_at BIGINT, ip TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS auth_codes_email ON auth_codes(email, created_at);
  CREATE INDEX IF NOT EXISTS auth_codes_link ON auth_codes(link_hash);
  CREATE TABLE IF NOT EXISTS account_devices (
    id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '', created_at BIGINT NOT NULL, last_seen BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS account_devices_account ON account_devices(account_id);
`;
const ACCOUNT_MIGRATIONS = [
  ['members', 'account_id', 'TEXT'],
  ['member_devices', 'device_id', 'TEXT'],
];
// Una persona ha al massimo un posto per gruppo (tra le appartenenze attive o in attesa).
const accountPostMigration = () => `CREATE UNIQUE INDEX IF NOT EXISTS members_account_group ON members(household_id, account_id) WHERE account_id IS NOT NULL AND status IN ('active', 'pending');`;

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;
const CODES_PER_HOUR = 5;

const cleanEmail = (v) => {
  const s = str(v, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, 'Scrivi un indirizzo email valido', 'bad_email');
  return s;
};
// "Android · Chrome", "iPhone · Safari", "Mac · Firefox"…
function deviceLabel(ua = '') {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [os, br].filter(Boolean).join(' · ') || 'Dispositivo';
}
const sixDigits = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function createAccounts({ db, mailer, members, protect, env = process.env }) {
  const debug = env.AUTH_DEBUG === '1';
  // Attesa tra un codice e l'altro (configurabile solo per i test).
  const resendSec = env.AUTH_RESEND_SECONDS != null ? Number(env.AUTH_RESEND_SECONDS) : RESEND_SECONDS;
  const perHour = env.AUTH_CODES_PER_HOUR != null ? Number(env.AUTH_CODES_PER_HOUR) : CODES_PER_HOUR;
  const SQL = {
    byEmail: 'SELECT * FROM accounts WHERE email = ?',
    byId: 'SELECT * FROM accounts WHERE id = ?',
    device: 'SELECT * FROM account_devices WHERE token_hash = ?',
    devices: 'SELECT * FROM account_devices WHERE account_id = ? ORDER BY last_seen DESC',
    memberships: `SELECT * FROM members WHERE account_id = ? AND status IN ('active', 'pending') ORDER BY created_at`,
  };
  const accountOut = (a) => ({
    id: a.id, email: a.email, terms_version: a.terms_version || '', terms_ok: a.terms_version === TERMS_VERSION, current_terms: TERMS_VERSION,
  });

  async function findOrCreate(email, verified) {
    let a = await db.get(SQL.byEmail, [email]);
    if (!a) {
      const id = crypto.randomUUID();
      await db.run('INSERT INTO accounts (id, email, created_at, verified_at) VALUES (?, ?, ?, ?)', [id, email, now(), verified ? now() : null]);
      a = await db.get(SQL.byId, [id]);
    } else if (verified && !a.verified_at) {
      await db.run('UPDATE accounts SET verified_at = ? WHERE id = ?', [now(), a.id]);
    }
    return a;
  }

  async function newDevice(account, ua) {
    const token = 'a_' + newToken(24);
    const id = crypto.randomUUID();
    await db.run('INSERT INTO account_devices (id, token_hash, account_id, label, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)',
      [id, sha(token), account.id, deviceLabel(ua), now(), now()]);
    await db.run('UPDATE accounts SET last_login_at = ? WHERE id = ?', [now(), account.id]);
    return { token, id };
  }

  // Chiave del dispositivo (a_…) → { account, device }.
  async function resolve(token, ip) {
    const d = await db.get(SQL.device, [sha(token)]);
    if (!d) { checkRate('auth:' + ip); throw new HttpError(401, 'Sei uscito da questo dispositivo: entra di nuovo con la tua email', 'logged_out'); }
    const account = await db.get(SQL.byId, [d.account_id]);
    if (!account) throw new HttpError(401, 'Account non trovato', 'logged_out');
    if (now() - Number(d.last_seen) > 60e3) await db.run('UPDATE account_devices SET last_seen = ? WHERE id = ?', [now(), d.id]);
    return { account, device: d };
  }

  // Condizioni d'uso: accettate ora (accept) o già accettate nella versione corrente.
  async function ensureTerms(account, accept, ip) {
    if (account.terms_version === TERMS_VERSION) return;
    if (!accept) throw new HttpError(400, 'Per continuare accetta le condizioni d\'uso e l\'informativa sulla privacy', 'terms_required');
    await db.run('UPDATE accounts SET terms_version = ?, terms_accepted_at = ?, accepted_ip = ? WHERE id = ?', [TERMS_VERSION, now(), str(ip, 60), account.id]);
    account.terms_version = TERMS_VERSION;
  }

  // Chiavi di gruppo di questo dispositivo per le appartenenze dell'account (tutte o quelle indicate).
  // Il gruppo personale (creato dal core, vedi ensurePersonal) esiste sempre per ogni account.
  let ensurePersonal = null;
  async function groupsFor(account, deviceId, onlyIds) {
    if (ensurePersonal) await ensurePersonal(account);
    const out = [];
    for (const m of await db.all(SQL.memberships, [account.id])) {
      if (onlyIds && !onlyIds.includes(m.id)) continue;
      const hh = await db.get('SELECT * FROM households WHERE id = ?', [m.household_id]);
      if (!hh) continue;
      out.push({ token: await members.issueToken(m, deviceId), me: members.memberView(m), household: members.householdOut(hh) });
    }
    return out;
  }

  // Collega all'account le appartenenze di cui il dispositivo ha già la chiave (passaggio alla 3.6).
  async function linkMemberTokens(account, deviceId, tokens) {
    for (const t of (Array.isArray(tokens) ? tokens : []).slice(0, 30)) {
      const md = typeof t === 'string' && t.startsWith('m_') && await db.get('SELECT * FROM member_devices WHERE token_hash = ?', [sha(t)]);
      if (!md) continue;
      const m = await db.get('SELECT * FROM members WHERE id = ?', [md.member_id]);
      if (!m || !['active', 'pending'].includes(m.status)) continue;
      if (m.account_id && m.account_id !== account.id) continue; // già di un'altra persona
      const dup = await db.get(`SELECT id FROM members WHERE household_id = ? AND account_id = ? AND id <> ? AND status IN ('active', 'pending')`, [m.household_id, account.id, m.id]);
      if (dup) continue; // la stessa persona ha già un posto in quel gruppo
      await db.run('UPDATE members SET account_id = ?, email = ?, updated_at = ? WHERE id = ?', [account.id, account.email, now(), m.id]);
      await db.run('UPDATE member_devices SET device_id = ? WHERE token_hash = ?', [deviceId, md.token_hash]);
    }
  }

  // ------------------------------------------------------------ codici
  async function sendCode(email, purpose, ip, accountId = null) {
    const t = now();
    // Limiti nel database: per indirizzo IP e in totale (freno di emergenza contro gli invii di massa).
    await protect.hit('code-ip:' + ip, Number(env.CODES_PER_IP) || 20, 600e3, 'Troppi codici richiesti da questa connessione: riprova tra qualche minuto');
    try { await protect.hit('code-all', Number(env.CODES_PER_HOUR_TOTAL) || 600, 3600e3, 'Sporta è molto richiesto in questo momento: riprova tra qualche minuto'); }
    catch (e) { console.error('Limite totale dei codici via email raggiunto: possibile abuso'); throw e; }
    const recent = await db.all('SELECT created_at FROM auth_codes WHERE email = ? AND created_at > ? ORDER BY created_at DESC', [email, t - 3600e3]);
    if (recent.length && t - Number(recent[0].created_at) < resendSec * 1000) {
      throw new HttpError(429, 'Aspetta un minuto prima di chiedere un altro codice', 'too_soon');
    }
    if (recent.length >= perHour) throw new HttpError(429, 'Troppi codici richiesti per questa email: riprova più tardi', 'rate_limited');
    const code = sixDigits(), link = newToken(24), id = crypto.randomUUID();
    // I codici precedenti non valgono più.
    await db.run('UPDATE auth_codes SET used_at = ? WHERE email = ? AND used_at IS NULL', [t, email]);
    await db.run(`INSERT INTO auth_codes (id, email, code_hash, link_hash, purpose, account_id, created_at, expires_at, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, email, sha(id + code), sha(link), purpose, accountId, t, t + CODE_MINUTES * 60e3, str(ip, 60)]);
    // Senza servizio email (sviluppo in locale) il codice compare nel registro del server.
    if (!mailer.enabled) console.log(`[sviluppo] codice per ${email}: ${code}`);
    else {
      const ok = await mailer.send('code', email, {
        code: code.slice(0, 3) + ' ' + code.slice(3), purpose, minutes: CODE_MINUTES,
        link: mailer.link('/?auth=' + link), email,
      });
      if (!ok) throw new HttpError(502, 'Non è stato possibile inviare l\'email, riprova', 'email_failed');
    }
    return debug ? { code, link } : {};
  }

  // Verifica (codice oppure link dell'email): ritorna la riga del codice usato.
  async function checkCode(b, purposes) {
    if (b.link) {
      const r = await db.get('SELECT * FROM auth_codes WHERE link_hash = ?', [sha(str(b.link, 80))]);
      if (!r || r.used_at || Number(r.expires_at) < now() || !purposes.includes(r.purpose)) {
        throw new HttpError(410, 'Il link non è più valido: chiedi un nuovo codice', 'bad_link');
      }
      await db.run('UPDATE auth_codes SET used_at = ? WHERE id = ?', [now(), r.id]);
      return r;
    }
    const email = cleanEmail(b.email);
    const code = String(b.code || '').replace(/\D/g, '');
    const r = await db.get('SELECT * FROM auth_codes WHERE email = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1', [email]);
    if (!r || Number(r.expires_at) < now() || !purposes.includes(r.purpose)) {
      throw new HttpError(400, 'Il codice è scaduto: chiedine uno nuovo', 'code_expired');
    }
    if (code.length !== 6 || !safeEq(sha(r.id + code), r.code_hash)) {
      const attempts = Number(r.attempts) + 1;
      await db.run('UPDATE auth_codes SET attempts = ?, used_at = ? WHERE id = ?', [attempts, attempts >= MAX_ATTEMPTS ? now() : null, r.id]);
      if (attempts >= MAX_ATTEMPTS) throw new HttpError(400, 'Troppi tentativi: chiedi un nuovo codice', 'code_expired');
      throw new HttpError(400, `Codice errato: ${MAX_ATTEMPTS - attempts === 1 ? 'ancora un tentativo' : `ancora ${MAX_ATTEMPTS - attempts} tentativi`}`, 'bad_code');
    }
    await db.run('UPDATE auth_codes SET used_at = ? WHERE id = ?', [now(), r.id]);
    return r;
  }

  // ------------------------------------------------------------ endpoint pubblici (/api/auth/*)
  async function publicRoute(m, parts, b, ip, ua) {
    if (parts[0] !== 'auth') return null;
    if (m === 'POST' && parts[1] === 'code' && parts.length === 2) {
      const email = cleanEmail(b.email);
      await protect.verify(b.altcha);
      const out = await sendCode(email, 'login', ip);
      return { status: 200, body: { ok: true, resend_after: RESEND_SECONDS, minutes: CODE_MINUTES, ...(debug ? { debug_code: out.code, debug_link: out.link } : {}) } };
    }
    if (m === 'POST' && parts[1] === 'verify' && parts.length === 2) {
      checkRate('verify:' + ip, 60);
      const r = await checkCode(b, ['login']);
      const isNew = !(await db.get(SQL.byEmail, [r.email]));
      const account = await findOrCreate(r.email, true);
      await protect.unblock(r.email); // chi entra con la sua email vuole di nuovo gli inviti
      const dev = await newDevice(account, ua);
      await linkMemberTokens(account, dev.id, b.member_tokens);
      return {
        status: 200,
        body: { account_token: dev.token, account: accountOut(account), is_new: isNew, groups: await groupsFor(account, dev.id) },
      };
    }
    return null;
  }

  // ------------------------------------------------------------ endpoint dell'account (/api/account/*)
  async function route(auth, m, parts, b, ip) {
    const { account, device } = auth;
    const [, a1, a2, a3] = parts;
    if (m === 'GET' && !a1) {
      if (ensurePersonal) await ensurePersonal(account);
      const devs = await db.all(SQL.devices, [account.id]);
      const groups = [];
      for (const mm of await db.all(SQL.memberships, [account.id])) {
        const hh = await db.get('SELECT * FROM households WHERE id = ?', [mm.household_id]);
        if (hh) groups.push({ household: { id: hh.id, name: hh.name }, me: members.memberView(mm) });
      }
      return {
        status: 200,
        body: {
          account: accountOut(account), groups,
          devices: devs.map((d) => ({ id: d.id, label: d.label, created_at: num(d.created_at), last_seen: num(d.last_seen), current: d.id === device.id })),
        },
      };
    }
    // Chiavi di gruppo per questo dispositivo (gruppi in cui si è entrati da un altro dispositivo).
    if (m === 'POST' && a1 === 'groups' && !a2) {
      const ids = Array.isArray(b.member_ids) ? b.member_ids.map(String).slice(0, 30) : null;
      return { status: 200, body: { groups: await groupsFor(account, device.id, ids) } };
    }
    // Collega le chiavi di gruppo già presenti su questo dispositivo.
    if (m === 'POST' && a1 === 'link' && !a2) {
      await linkMemberTokens(account, device.id, b.member_tokens);
      return { status: 200, body: { groups: await groupsFor(account, device.id) } };
    }
    if (m === 'POST' && a1 === 'accept' && !a2) {
      await ensureTerms(account, !!b.accept_terms, ip);
      return { status: 200, body: { account: accountOut(account) } };
    }
    // Cambio email: codice al nuovo indirizzo, poi verifica.
    if (m === 'POST' && a1 === 'email' && !a2) {
      const email = cleanEmail(b.email);
      if (email === account.email) throw new HttpError(400, 'È già la tua email', 'same_email');
      if (await db.get(SQL.byEmail, [email])) throw new HttpError(409, 'Questa email è già usata da un altro account', 'email_taken');
      await protect.verify(b.altcha);
      const out = await sendCode(email, 'change', ip, account.id);
      return { status: 200, body: { ok: true, resend_after: RESEND_SECONDS, ...(debug ? { debug_code: out.code } : {}) } };
    }
    if (m === 'POST' && a1 === 'email' && a2 === 'verify') {
      const r = await checkCode(b, ['change']);
      if (r.account_id !== account.id) throw new HttpError(400, 'Codice non valido', 'bad_code');
      if (await db.get(SQL.byEmail, [r.email])) throw new HttpError(409, 'Questa email è già usata da un altro account', 'email_taken');
      const old = account.email;
      await db.run('UPDATE accounts SET email = ?, verified_at = ? WHERE id = ?', [r.email, now(), account.id]);
      await db.run('UPDATE members SET email = ? WHERE account_id = ?', [r.email, account.id]);
      mailer.send('code', old, { purpose: 'changed', email: r.email, code: '', minutes: 0, link: mailer.link('/') });
      return { status: 200, body: { account: accountOut(await db.get(SQL.byId, [account.id])) } };
    }
    // Dispositivi: uscita da questo, da uno o da tutti gli altri.
    const dropDevice = async (id) => {
      await db.run('DELETE FROM member_devices WHERE device_id = ?', [id]);
      await db.run('DELETE FROM account_devices WHERE id = ? AND account_id = ?', [id, account.id]);
    };
    if (m === 'POST' && a1 === 'logout' && !a2) { await dropDevice(device.id); return { status: 200, body: { ok: true } }; }
    if (m === 'POST' && a1 === 'devices' && a2 === 'revoke-others') {
      for (const d of await db.all(SQL.devices, [account.id])) if (d.id !== device.id) await dropDevice(d.id);
      return { status: 200, body: { ok: true } };
    }
    if (m === 'POST' && a1 === 'devices' && a2 && a3 === 'revoke') {
      if (a2 === device.id) throw new HttpError(400, 'Per questo dispositivo usa "Esci"', 'self');
      await dropDevice(a2);
      return { status: 200, body: { ok: true } };
    }
    // I miei dati (diritto di accesso e portabilità).
    if (m === 'GET' && a1 === 'export') {
      const mems = await db.all('SELECT * FROM members WHERE account_id = ?', [account.id]);
      const groups = [];
      for (const mm of mems) {
        const hh = await db.get('SELECT * FROM households WHERE id = ?', [mm.household_id]);
        const items = await db.all('SELECT name, qty, unit, brand, note, created_at, checked FROM items WHERE created_by_id = ?', [mm.id]);
        const events = await db.all('SELECT title, date, time, location, notes, created_at FROM events WHERE created_by_id = ?', [mm.id]);
        const rsvps = await db.all('SELECT e.title, e.date, p.rsvp, p.guests FROM event_participants p JOIN events e ON e.id = p.event_id WHERE p.member_id = ?', [mm.id]);
        const trips = await db.all('SELECT store, total, list_name, created_at FROM trips WHERE created_by_id = ?', [mm.id]);
        groups.push({
          group: hh ? hh.name : null, alias: mm.alias, role: mm.role, relation: mm.relation, status: mm.status,
          joined_at: num(mm.joined_at), items_written: items, events_created: events, event_answers: rsvps, shopping_trips: trips,
        });
      }
      const devs = await db.all(SQL.devices, [account.id]);
      const saved = await db.all('SELECT name, author_name, created_at FROM recipe_bookmarks WHERE owner = ? ORDER BY created_at', [account.id]);
      return {
        status: 200,
        body: {
          exported_at: new Date().toISOString(),
          account: { email: account.email, created_at: num(account.created_at), terms_version: account.terms_version, terms_accepted_at: num(account.terms_accepted_at) },
          devices: devs.map((d) => ({ label: d.label, created_at: num(d.created_at), last_seen: num(d.last_seen) })),
          groups,
          favorite_recipes: saved.map((x) => ({ name: x.name, author: x.author_name, saved_at: num(x.created_at) })),
        },
      };
    }
    // Eliminazione: esce da tutti i gruppi e cancella email e dispositivi.
    if (m === 'DELETE' && !a1) {
      // Il gruppo personale se ne va con l'account (tutto il contenuto, a cascata).
      // Le foto sul Blob store del gruppo personale (le righe se ne vanno a cascata).
      await deleteBlobs(await blobUrlsWhere(db, 'household_id IN (SELECT id FROM households WHERE personal_of = ?)', [account.id]));
      await db.run('DELETE FROM households WHERE personal_of = ?', [account.id]);
      const mems = await db.all(SQL.memberships, [account.id]);
      for (const mm of mems) {
        if (mm.role !== 'admin' || mm.status !== 'active') continue;
        const others = await db.all(`SELECT role FROM members WHERE household_id = ? AND status = 'active' AND id <> ?`, [mm.household_id, mm.id]);
        if (others.length && !others.some((o) => o.role === 'admin')) {
          const hh = await db.get('SELECT name FROM households WHERE id = ?', [mm.household_id]);
          throw new HttpError(409, `Sei l'unico amministratore di «${hh.name}»: nomina un altro amministratore prima di eliminare l'account`, 'last_admin');
        }
      }
      for (const mm of mems) await members.removeMember(mm, 'removed');
      await db.run(`UPDATE members SET account_id = NULL, email = '' WHERE account_id = ?`, [account.id]);
      for (const d of await db.all(SQL.devices, [account.id])) await dropDevice(d.id);
      await db.run('DELETE FROM auth_codes WHERE email = ?', [account.email]);
      // Preferite: si cancellano e si aggiornano i contatori delle ricette.
      const fav = await db.all('SELECT recipe_id FROM recipe_bookmarks WHERE owner = ?', [account.id]);
      await db.run('DELETE FROM recipe_bookmarks WHERE owner = ?', [account.id]);
      for (const f of fav) await db.run('UPDATE recipes SET saves = (SELECT COUNT(*) FROM recipe_bookmarks WHERE recipe_id = ?) WHERE id = ?', [f.recipe_id, f.recipe_id]);
      await db.run('DELETE FROM accounts WHERE id = ?', [account.id]);
      return { status: 200, body: { ok: true } };
    }
    return null;
  }

  return { usePersonal: (fn) => { ensurePersonal = fn; }, resolve, findOrCreate, newDevice, ensureTerms, groupsFor, accountOut, publicRoute, route, cleanEmail };
}

module.exports = { createAccounts, ACCOUNT_SCHEMA, ACCOUNT_MIGRATIONS, accountPostMigration, deviceLabel };
