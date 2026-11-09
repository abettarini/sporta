'use strict';
/* Membri dei gruppi: identità, ruoli, richieste di accesso, inviti personali e presenza.

   Ogni persona (per ogni dispositivo) ha una chiave personale ("m_…", conservata solo come
   hash). Il codice del gruppo serve a chiedere di entrare: da solo non apre più nulla, tranne
   che per i gruppi creati prima della versione 3, finché dura il periodo di transizione
   (households.legacy_until), durante il quale i client aggiornati si "presentano" da soli.

   Ruoli: role = 'admin' | 'member' (permessi); relation = Familiare, Amico, … (descrittiva).
   Stati: 'pending' (in attesa), 'active', 'removed' (uscito o rimosso), 'rejected', 'blocked'. */

const crypto = require('node:crypto');
const { HttpError, newCode, newToken, sha, ID_RE, str, now, num, parseJson, checkRate } = require('./util');

const ROLES = ['admin', 'member'];
const RELATIONS = ['familiare', 'amico', 'collega', 'ospite'];
const ONLINE_MS = 50 * 1000;
const INVITE_DAYS = 7;
const MAX_PENDING = 20;
const LEGACY_DAYS = 30;
const LINK_MINUTES = 10;       // link per collegare un altro dispositivo
const RECOVERY_HOURS = 24;     // link di recupero inviati per email

const MEMBER_SCHEMA = `
  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    alias TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', relation TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending', email TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '',
    invited_by TEXT, created_at BIGINT NOT NULL, joined_at BIGINT, last_seen BIGINT, alive_at BIGINT,
    viewing TEXT NOT NULL DEFAULT '', updated_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS members_household ON members(household_id, status);
  CREATE TABLE IF NOT EXISTS member_devices (
    token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE, created_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS member_devices_member ON member_devices(member_id);
  CREATE TABLE IF NOT EXISTS device_links (
    token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, used_at BIGINT
  );
  CREATE TABLE IF NOT EXISTS invites (
    token_hash TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member', relation TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
    created_by TEXT, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, used_by TEXT, used_at BIGINT
  );
`;

const MEMBER_MIGRATIONS = [
  ['households', 'require_approval', 'INTEGER NOT NULL DEFAULT 1'],
  ['households', 'legacy_until', 'BIGINT'],
  ['items', 'created_by_id', 'TEXT'],
  ['items', 'checked_by_id', 'TEXT'],
  ['trips', 'created_by_id', 'TEXT'],
  ['members', 'hide_presence', 'INTEGER NOT NULL DEFAULT 0'],
];
// I gruppi esistenti prima della versione 3 (legacy_until ancora vuoto) entrano nel periodo di transizione.
const memberPostMigration = () =>
  `UPDATE households SET legacy_until = ${Date.now() + LEGACY_DAYS * 864e5} WHERE legacy_until IS NULL;`;

const cleanRelation = (v) => {
  const s = str(v, 24).toLowerCase();
  return s.replace(/[^\p{L}\p{N} '-]/gu, '').trim();
};
const cleanAlias = (v) => str(v, 40).replace(/\s+/g, ' ');
const cleanEmail = (v) => {
  const s = str(v, 120).toLowerCase();
  if (!s) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, 'Email non valida', 'bad_email');
  return s;
};
const isOnline = (m) => Number(m.alive_at || 0) > now() - ONLINE_MS;

// viewerId: chi guarda. Chi ha scelto di nascondere la presenza appare offline agli altri.
function memberOut(m, admin, viewerId) {
  if (!m) return m;
  const hidden = !!Number(m.hide_presence) && m.id !== viewerId;
  const o = {
    id: m.id, alias: m.alias, role: m.role, relation: m.relation, status: m.status, joined_at: num(m.joined_at),
    last_seen: hidden ? null : num(m.last_seen), online: hidden ? false : isOnline(m), viewing: hidden ? '' : m.viewing || '',
  };
  if (m.id === viewerId) Object.assign(o, { hide_presence: !!Number(m.hide_presence), notify_email: !!Number(m.notify_email) });
  if (admin) Object.assign(o, { email: m.email, message: m.message, created_at: num(m.created_at), invited_by: m.invited_by });
  return o;
}

function createMembers({ db, realtime, mailer }) {
  mailer = mailer || { enabled: false, send: async () => false, link: (p) => p };
  const SQL = {
    hh: 'SELECT * FROM households WHERE id = ?',
    hhByCode: 'SELECT * FROM households WHERE code = ?',
    member: 'SELECT * FROM members WHERE id = ?',
    members: `SELECT * FROM members WHERE household_id = ? AND status IN ('active', 'pending') ORDER BY created_at`,
    aliasTaken: `SELECT id FROM members WHERE household_id = ? AND lower(alias) = lower(?) AND status IN ('active', 'pending') AND id <> ?`,
    byAlias: `SELECT * FROM members WHERE household_id = ? AND lower(alias) = lower(?) AND status = 'active'`,
    insert: `INSERT INTO members (id, household_id, alias, role, relation, status, email, message, invited_by, created_at,
      joined_at, last_seen, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    device: 'SELECT * FROM member_devices WHERE token_hash = ?',
    deviceInsert: 'INSERT INTO member_devices (token_hash, member_id, household_id, created_at) VALUES (?, ?, ?, ?)',
    devicesDelete: 'DELETE FROM member_devices WHERE member_id = ?',
    deviceDelete: 'DELETE FROM member_devices WHERE token_hash = ?',
    adminsActive: `SELECT COUNT(*) AS n FROM members WHERE household_id = ? AND role = 'admin' AND status = 'active'`,
    pendingCount: `SELECT COUNT(*) AS n FROM members WHERE household_id = ? AND status = 'pending'`,
    blockedEmail: `SELECT id FROM members WHERE household_id = ? AND status = 'blocked' AND email <> '' AND email = ?`,
    invite: 'SELECT * FROM invites WHERE token_hash = ?',
    link: 'SELECT * FROM device_links WHERE token_hash = ?',
    adminEmails: `SELECT email FROM members WHERE household_id = ? AND role = 'admin' AND status = 'active' AND email <> ''`,
    byEmail: `SELECT * FROM members WHERE lower(email) = lower(?) AND status = 'active'`,
    devicesCount: 'SELECT COUNT(*) AS n FROM member_devices WHERE member_id = ?',
  };
  // Link temporaneo per collegare un altro dispositivo alla stessa persona.
  async function newDeviceLink(member, minutes) {
    const token = newToken(18);
    await db.run('INSERT INTO device_links (token_hash, member_id, household_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
      [sha(token), member.id, member.household_id, now(), now() + minutes * 60e3]);
    return token;
  }

  const notify = async (hid, events) => {
    try { await realtime.broadcast(hid, events); } catch (e) { console.error('broadcast fallito', e); }
  };
  // Le modifiche ai membri arrivano come segnale: i client rileggono l'elenco con i loro permessi
  // (così email e messaggi delle richieste restano visibili solo agli amministratori).
  const membersChanged = (hid, extra = []) => notify(hid, [...extra, { t: 'members' }]);

  async function newDevice(member) {
    const token = 'm_' + newToken(24);
    await db.run(SQL.deviceInsert, [sha(token), member.id, member.household_id, now()]);
    return token;
  }

  async function assertAliasFree(hid, alias, exceptId = '') {
    if (!alias) throw new HttpError(400, 'Scrivi il tuo nome', 'alias_required');
    if (await db.get(SQL.aliasTaken, [hid, alias, exceptId])) {
      throw new HttpError(409, `Il nome "${alias}" è già usato in questo gruppo: scegline un altro (per esempio aggiungi l'iniziale del cognome).`, 'alias_taken');
    }
  }

  async function createMember(hh, { alias, role = 'member', relation = '', status, email = '', message = '', invitedBy = null }) {
    const t = now();
    const m = {
      id: crypto.randomUUID(), household_id: hh.id, alias, role, relation, status, email, message,
      invited_by: invitedBy, created_at: t, joined_at: status === 'active' ? t : null, last_seen: t,
    };
    await db.run(SQL.insert, [m.id, hh.id, alias, role, relation, status, email, message, invitedBy, t, m.joined_at, t, t]);
    return m;
  }

  // Collega a una persona gli articoli e le spese scritti con il suo nome prima della versione 3.
  async function linkLegacyHistory(hid, member) {
    await db.run('UPDATE items SET created_by_id = ? WHERE household_id = ? AND created_by_id IS NULL AND lower(created_by) = lower(?)', [member.id, hid, member.alias]);
    await db.run('UPDATE items SET checked_by_id = ? WHERE household_id = ? AND checked_by_id IS NULL AND lower(checked_by) = lower(?)', [member.id, hid, member.alias]);
    await db.run('UPDATE trips SET created_by_id = ? WHERE household_id = ? AND created_by_id IS NULL AND lower(created_by) = lower(?)', [member.id, hid, member.alias]);
  }

  // ---------------------------------------------------------------- autenticazione
  // Ritorna il contesto della richiesta: { hh, me } con chiave personale, oppure
  // { hh, me: null, legacy: true } con il vecchio codice (solo durante la transizione).
  async function authenticate(raw, ip) {
    raw = String(raw || '').trim();
    if (raw.startsWith('m_')) {
      const d = await db.get(SQL.device, [sha(raw)]);
      if (!d) { checkRate('auth:' + ip); throw new HttpError(401, 'Questo dispositivo non fa più parte del gruppo', 'removed'); }
      const me = await db.get(SQL.member, [d.member_id]);
      if (!me || (me.status !== 'active' && me.status !== 'pending')) {
        throw new HttpError(401, 'Questo dispositivo non fa più parte del gruppo', me && me.status === 'rejected' ? 'rejected' : 'removed');
      }
      const hh = await db.get(SQL.hh, [d.household_id]);
      if (!hh) throw new HttpError(401, 'Il gruppo non esiste più', 'removed');
      if (me.status === 'active' && now() - Number(me.last_seen || 0) > 60 * 1000) {
        await db.run('UPDATE members SET last_seen = ? WHERE id = ?', [now(), me.id]);
      }
      return { hh, me, tokenHash: sha(raw) };
    }
    const code = raw.toUpperCase();
    const hh = code && await db.get(SQL.hhByCode, [code]);
    if (!hh) { checkRate('auth:' + ip); throw new HttpError(401, 'Codice del gruppo non valido', 'bad_code'); }
    if (!(Number(hh.legacy_until || 0) > now())) {
      throw new HttpError(401, 'Questo accesso non è più valido: chiedi di entrare nel gruppo', 'legacy_expired');
    }
    return { hh, me: null, legacy: true };
  }

  const isAdmin = (ctx) => ctx.legacy || (ctx.me && ctx.me.role === 'admin');
  function requireActive(ctx) {
    if (ctx.me && ctx.me.status === 'pending') throw new HttpError(403, 'La tua richiesta è in attesa di approvazione', 'pending');
  }
  function requireAdmin(ctx) {
    requireActive(ctx);
    if (!isAdmin(ctx)) throw new HttpError(403, 'Solo gli amministratori possono farlo', 'not_admin');
  }

  async function listMembers(ctx) {
    const admin = isAdmin(ctx);
    const rows = await db.all(SQL.members, [ctx.hh.id]);
    const me = ctx.me && ctx.me.id;
    return rows.filter((m) => admin || m.status === 'active').map((m) => memberOut(m, admin || m.id === me, me));
  }

  function householdOut(hh) {
    return {
      id: hh.id, name: hh.name, code: hh.code, require_approval: !!Number(hh.require_approval ?? 1),
      legacy_until: hh.legacy_until && Number(hh.legacy_until) > now() ? Number(hh.legacy_until) : null,
    };
  }

  // Dati del gruppo per lo stato iniziale.
  async function stateExtra(ctx) {
    return {
      me: ctx.me ? memberOut(ctx.me, true, ctx.me.id) : null,
      members: await listMembers(ctx),
      household: householdOut(ctx.hh),
    };
  }

  // ---------------------------------------------------------------- endpoint pubblici
  async function publicRoute(m, parts, b, ip) {
    // Collegamento di un altro dispositivo (link creato dal dispositivo già collegato o ricevuto per email).
    if (parts[0] === 'link' && parts[1] && /^[A-Za-z0-9_-]{16,64}$/.test(parts[1])) {
      const l = await db.get(SQL.link, [sha(parts[1])]);
      const valid = l && !l.used_at && Number(l.expires_at) > now();
      const member = l && await db.get(SQL.member, [l.member_id]);
      const ok = valid && member && member.status === 'active';
      if (m === 'GET' && parts.length === 2) {
        if (!l) { checkRate('auth:' + ip); throw new HttpError(404, 'Link non trovato', 'bad_link'); }
        const hh = await db.get(SQL.hh, [l.household_id]);
        return { status: 200, body: { valid: !!ok, household: { name: hh.name }, alias: member ? member.alias : '' } };
      }
      if (m === 'POST' && parts[2] === 'accept' && parts.length === 3) {
        if (!ok) throw new HttpError(410, 'Questo link non è più valido: creane uno nuovo', 'bad_link');
        await db.run('UPDATE device_links SET used_at = ? WHERE token_hash = ?', [now(), l.token_hash]);
        const hh = await db.get(SQL.hh, [l.household_id]);
        return { status: 201, body: { token: await newDevice(member), me: memberOut(member, true, member.id), household: householdOut(hh) } };
      }
    }
    // Recupero dell'accesso via email: un link per ogni gruppo in cui quell'email è registrata.
    // La risposta è sempre la stessa, per non rivelare quali email sono registrate.
    if (m === 'POST' && parts[0] === 'recover' && parts.length === 1) {
      checkRate('recover:' + ip, 5, 60 * 60 * 1000);
      if (!mailer.enabled) throw new HttpError(501, 'Il recupero via email non è attivo', 'no_email');
      const email = cleanEmail(b.email);
      if (email) {
        const groups = [];
        for (const mem of await db.all(SQL.byEmail, [email])) {
          const hh = await db.get(SQL.hh, [mem.household_id]);
          groups.push({ group: hh.name, alias: mem.alias, link: mailer.link('/?link=' + await newDeviceLink(mem, RECOVERY_HOURS * 60)) });
        }
        if (groups.length) await mailer.send('recovery', email, { groups, expires_hours: RECOVERY_HOURS });
      }
      return { status: 200, body: { ok: true } };
    }
    // Anteprima di un codice: nome del gruppo, se serve l'approvazione e se un nome è libero.
    if (m === 'GET' && parts[0] === 'preview' && parts.length === 1) {
      const code = str(b.code, 20).toUpperCase();
      const hh = code && await db.get(SQL.hhByCode, [code]);
      if (!hh) { checkRate('auth:' + ip); throw new HttpError(404, 'Codice non valido.', 'bad_code'); }
      const alias = cleanAlias(b.alias);
      return {
        status: 200,
        body: {
          household: { name: hh.name, require_approval: !!Number(hh.require_approval ?? 1) },
          alias_available: alias ? !(await db.get(SQL.aliasTaken, [hh.id, alias, ''])) : undefined,
        },
      };
    }
    // Richiesta di accesso con il codice del gruppo.
    if (m === 'POST' && parts[0] === 'join' && parts.length === 1) {
      checkRate('join:' + ip, 20);
      const hh = await db.get(SQL.hhByCode, [str(b.code, 20).toUpperCase()]);
      if (!hh) { checkRate('auth:' + ip); throw new HttpError(404, 'Codice non valido.', 'bad_code'); }
      const alias = cleanAlias(b.alias);
      await assertAliasFree(hh.id, alias);
      const email = cleanEmail(b.email);
      if (email && await db.get(SQL.blockedEmail, [hh.id, email])) throw new HttpError(403, 'Non è possibile entrare in questo gruppo', 'blocked');
      const approval = !!Number(hh.require_approval ?? 1);
      if (approval && Number((await db.get(SQL.pendingCount, [hh.id])).n) >= MAX_PENDING) {
        throw new HttpError(429, 'Ci sono troppe richieste in attesa per questo gruppo: riprova più tardi', 'too_many_pending');
      }
      const me = await createMember(hh, {
        alias, relation: cleanRelation(b.relation), email, message: str(b.message, 300),
        status: approval ? 'pending' : 'active', role: 'member',
      });
      const token = await newDevice(me);
      await membersChanged(hh.id, approval ? [] : [{ t: 'joined', id: me.id, alias }]);
      if (approval) {
        for (const a of await db.all(SQL.adminEmails, [hh.id])) {
          mailer.send('join_request', a.email, { group: hh.name, alias, relation: me.relation, message: me.message, link: mailer.link('/#/m') });
        }
      }
      return { status: 201, body: { token, me: memberOut(me, true, me.id), household: householdOut(hh) } };
    }
    // Passaggio dalla versione 2: chi aveva il codice si presenta con il suo nome (stesso nome =
    // stessa persona, per esempio telefono e tablet). Tutti amministratori, come deciso.
    if (m === 'POST' && parts[0] === 'join' && parts[1] === 'legacy' && parts.length === 2) {
      const hh = await db.get(SQL.hhByCode, [str(b.code, 20).toUpperCase()]);
      if (!hh) { checkRate('auth:' + ip); throw new HttpError(404, 'Codice non valido.', 'bad_code'); }
      if (!(Number(hh.legacy_until || 0) > now())) throw new HttpError(410, 'Il periodo di passaggio è finito: chiedi di entrare nel gruppo', 'legacy_expired');
      const alias = cleanAlias(b.alias) || 'Membro';
      let me = await db.get(SQL.byAlias, [hh.id, alias]);
      if (!me) {
        await assertAliasFree(hh.id, alias);
        me = await createMember(hh, { alias, role: 'admin', status: 'active' });
      }
      await linkLegacyHistory(hh.id, me);
      const token = await newDevice(me);
      await membersChanged(hh.id);
      return { status: 201, body: { token, me: memberOut(me, true), household: householdOut(hh) } };
    }
    // Invito personale: anteprima e accettazione.
    if (parts[0] === 'invites' && parts[1] && /^[A-Za-z0-9_-]{16,64}$/.test(parts[1])) {
      const inv = await db.get(SQL.invite, [sha(parts[1])]);
      const valid = inv && !inv.used_at && Number(inv.expires_at) > now();
      if (m === 'GET' && parts.length === 2) {
        if (!inv) { checkRate('auth:' + ip); throw new HttpError(404, 'Invito non trovato', 'bad_invite'); }
        const hh = await db.get(SQL.hh, [inv.household_id]);
        const by = inv.created_by && await db.get(SQL.member, [inv.created_by]);
        return {
          status: 200,
          body: {
            household: { name: hh.name }, invited_by: by ? by.alias : '', relation: inv.relation, role: inv.role,
            valid, reason: valid ? null : inv.used_at ? 'used' : 'expired',
            alias_available: b.alias ? !(await db.get(SQL.aliasTaken, [hh.id, cleanAlias(b.alias), ''])) : undefined,
          },
        };
      }
      if (m === 'POST' && parts[2] === 'accept' && parts.length === 3) {
        if (!valid) throw new HttpError(410, inv && inv.used_at ? 'Questo invito è già stato usato' : 'Questo invito non è più valido', 'bad_invite');
        const hh = await db.get(SQL.hh, [inv.household_id]);
        const alias = cleanAlias(b.alias);
        await assertAliasFree(hh.id, alias);
        const me = await createMember(hh, {
          alias, role: inv.role, relation: inv.relation, status: 'active', email: inv.email || cleanEmail(b.email), invitedBy: inv.created_by,
        });
        await db.run('UPDATE invites SET used_by = ?, used_at = ? WHERE token_hash = ?', [me.id, now(), inv.token_hash]);
        const token = await newDevice(me);
        await membersChanged(hh.id, [{ t: 'joined', id: me.id, alias }]);
        return { status: 201, body: { token, me: memberOut(me, true), household: householdOut(hh) } };
      }
    }
    return null;
  }

  // Creazione di un gruppo: chi lo crea ne è l'amministratore.
  async function createOwner(hh, alias) {
    const me = await createMember(hh, { alias: cleanAlias(alias) || 'Amministratore', role: 'admin', status: 'active' });
    return { me, token: await newDevice(me) };
  }

  // ---------------------------------------------------------------- endpoint con autenticazione
  async function route(ctx, m, parts, b) {
    const hid = ctx.hh.id;
    const [kind, id, action] = parts;

    // --- io
    if (kind === 'me' && parts.length === 1 && m === 'GET') {
      return { status: 200, body: { me: ctx.me ? memberOut(ctx.me, true, ctx.me.id) : null, household: householdOut(ctx.hh) } };
    }
    if (kind === 'me' && parts.length === 1 && m === 'DELETE') {
      // Annulla una richiesta in attesa.
      if (!ctx.me || ctx.me.status !== 'pending') throw new HttpError(400, 'Nessuna richiesta da annullare');
      await db.run(`UPDATE members SET status = 'removed', updated_at = ? WHERE id = ?`, [now(), ctx.me.id]);
      await db.run(SQL.devicesDelete, [ctx.me.id]);
      await membersChanged(hid);
      return { status: 200, body: { ok: true } };
    }
    if (kind === 'me' && parts.length === 1 && m === 'PATCH') {
      requireActive(ctx);
      if (!ctx.me) throw new HttpError(400, 'Aggiorna l\'app per cambiare nome', 'legacy');
      const alias = b.alias !== undefined ? cleanAlias(b.alias) : ctx.me.alias;
      const email = b.email !== undefined ? cleanEmail(b.email) : ctx.me.email;
      const hide = b.hide_presence !== undefined ? (b.hide_presence ? 1 : 0) : Number(ctx.me.hide_presence || 0);
      const notifyEmail = b.notify_email !== undefined ? (b.notify_email ? 1 : 0) : Number(ctx.me.notify_email || 0);
      if (alias !== ctx.me.alias) await assertAliasFree(hid, alias, ctx.me.id);
      await db.run('UPDATE members SET alias = ?, email = ?, hide_presence = ?, notify_email = ?, updated_at = ? WHERE id = ?', [alias, email, hide, notifyEmail, now(), ctx.me.id]);
      if (hide !== Number(ctx.me.hide_presence || 0)) {
        await notify(hid, [{ t: 'presence', id: ctx.me.id, online: !hide, viewing: '', last_seen: hide ? null : now() }]);
      }
      if (alias !== ctx.me.alias) {
        // Lo storico è legato alla persona: si aggiorna il nome mostrato, senza ambiguità.
        await db.run('UPDATE items SET created_by = ? WHERE created_by_id = ?', [alias, ctx.me.id]);
        await db.run('UPDATE items SET checked_by = ? WHERE checked_by_id = ?', [alias, ctx.me.id]);
        await db.run('UPDATE trips SET created_by = ? WHERE created_by_id = ?', [alias, ctx.me.id]);
        for (const t of await db.all('SELECT id, items FROM trips WHERE household_id = ?', [hid])) {
          const items = parseJson(t.items, []);
          if (!items.some((i) => i.by_id === ctx.me.id)) continue;
          for (const i of items) if (i.by_id === ctx.me.id) i.by = alias;
          await db.run('UPDATE trips SET items = ? WHERE id = ?', [JSON.stringify(items), t.id]);
        }
        await notify(hid, [{ t: 'reload' }]);
      }
      await membersChanged(hid);
      return { status: 200, body: { me: memberOut(await db.get(SQL.member, [ctx.me.id]), true, ctx.me.id) } };
    }
    if (kind === 'me' && id === 'leave' && parts.length === 2 && m === 'POST') {
      if (!ctx.me) return { status: 200, body: { ok: true } };
      if (ctx.me.role === 'admin' && ctx.me.status === 'active') {
        const others = Number((await db.get(SQL.adminsActive, [hid])).n) - 1;
        const anyone = (await db.all(SQL.members, [hid])).some((x) => x.id !== ctx.me.id && x.status === 'active');
        if (others < 1 && anyone) throw new HttpError(409, 'Sei l\'unico amministratore: nomina un altro amministratore prima di uscire', 'last_admin');
      }
      await db.run(`UPDATE members SET status = 'removed', alive_at = 0, updated_at = ? WHERE id = ?`, [now(), ctx.me.id]);
      await db.run(SQL.devicesDelete, [ctx.me.id]);
      await db.run('UPDATE items SET assigned_to = NULL, assigned_by = NULL WHERE assigned_to = ?', [ctx.me.id]);
      await db.run('DELETE FROM push_subscriptions WHERE member_id = ?', [ctx.me.id]);
      await notify(hid, [{ t: 'reload' }]);
      await membersChanged(hid);
      return { status: 200, body: { ok: true } };
    }
    if (kind === 'me' && id === 'presence' && parts.length === 2 && m === 'POST') {
      requireActive(ctx);
      if (!ctx.me) return { status: 200, body: { ok: true } };
      const viewing = ID_RE.test(String(b.viewing || '')) ? String(b.viewing) : '';
      await db.run('UPDATE members SET viewing = ?, alive_at = ?, last_seen = ? WHERE id = ?', [viewing, now(), now(), ctx.me.id]);
      if (!Number(ctx.me.hide_presence)) await notify(hid, [{ t: 'presence', id: ctx.me.id, online: true, viewing, last_seen: now() }]);
      return { status: 200, body: { ok: true } };
    }

    // --- i miei dispositivi
    if (kind === 'me' && id === 'devices' && ctx.me) {
      requireActive(ctx);
      if (parts.length === 2 && m === 'GET') {
        return { status: 200, body: { count: Number((await db.get(SQL.devicesCount, [ctx.me.id])).n) } };
      }
      if (action === 'link' && m === 'POST') {
        const token = await newDeviceLink(ctx.me, LINK_MINUTES);
        return { status: 201, body: { token, expires_at: now() + LINK_MINUTES * 60e3 } };
      }
      if (action === 'revoke-others' && m === 'POST') {
        await db.run('DELETE FROM member_devices WHERE member_id = ? AND token_hash <> ?', [ctx.me.id, ctx.tokenHash]);
        return { status: 200, body: { count: 1 } };
      }
    }

    // --- elenco membri (tutti) e gestione (amministratori)
    if (kind === 'members' && parts.length === 1 && m === 'GET') {
      requireActive(ctx);
      return { status: 200, body: { members: await listMembers(ctx), household: householdOut(ctx.hh) } };
    }
    if (kind === 'members' && id && ID_RE.test(id)) {
      requireAdmin(ctx);
      const target = await db.get(SQL.member, [id]);
      if (!target || target.household_id !== hid) throw new HttpError(404, 'Persona non trovata');
      const t = now();
      if (action === 'approve' && m === 'POST') {
        if (target.status !== 'pending') throw new HttpError(409, 'Questa richiesta è già stata gestita', 'not_pending');
        const alias = b.alias !== undefined ? cleanAlias(b.alias) : target.alias;
        await assertAliasFree(hid, alias, target.id);
        const role = ROLES.includes(b.role) ? b.role : 'member';
        const relation = b.relation !== undefined ? cleanRelation(b.relation) : target.relation;
        await db.run(`UPDATE members SET status = 'active', alias = ?, role = ?, relation = ?, joined_at = ?, invited_by = ?, updated_at = ? WHERE id = ?`,
          [alias, role, relation, t, ctx.me ? ctx.me.id : null, t, id]);
        await membersChanged(hid, [{ t: 'joined', id, alias }]);
        if (target.email) mailer.send('request_approved', target.email, { group: ctx.hh.name, link: mailer.link('/') });
        return { status: 200, body: { ok: true } };
      }
      if (action === 'reject' && m === 'POST') {
        if (target.status !== 'pending') throw new HttpError(409, 'Questa richiesta è già stata gestita', 'not_pending');
        await db.run('UPDATE members SET status = ?, updated_at = ? WHERE id = ?', [b.block ? 'blocked' : 'rejected', t, id]);
        await db.run(SQL.devicesDelete, [id]);
        await membersChanged(hid);
        if (target.email && !b.block) mailer.send('request_rejected', target.email, { group: ctx.hh.name });
        return { status: 200, body: { ok: true } };
      }
      if (!action && m === 'PATCH') {
        if (target.status !== 'active') throw new HttpError(409, 'Questa persona non è attiva nel gruppo');
        const role = ROLES.includes(b.role) ? b.role : target.role;
        if (target.role === 'admin' && role !== 'admin' && Number((await db.get(SQL.adminsActive, [hid])).n) <= 1) {
          throw new HttpError(409, 'Ci dev\'essere almeno un amministratore', 'last_admin');
        }
        const relation = b.relation !== undefined ? cleanRelation(b.relation) : target.relation;
        await db.run('UPDATE members SET role = ?, relation = ?, updated_at = ? WHERE id = ?', [role, relation, t, id]);
        await membersChanged(hid);
        return { status: 200, body: { ok: true } };
      }
      if (action === 'remove' && m === 'POST') {
        if (ctx.me && id === ctx.me.id) throw new HttpError(400, 'Per uscire dal gruppo usa "Esci"', 'self');
        if (target.status !== 'active') throw new HttpError(409, 'Questa persona non è attiva nel gruppo');
        if (target.role === 'admin' && Number((await db.get(SQL.adminsActive, [hid])).n) <= 1) {
          throw new HttpError(409, 'Ci dev\'essere almeno un amministratore', 'last_admin');
        }
        await db.run(`UPDATE members SET status = 'removed', alive_at = 0, updated_at = ? WHERE id = ?`, [t, id]);
        await db.run(SQL.devicesDelete, [id]);
        await db.run('UPDATE items SET assigned_to = NULL, assigned_by = NULL WHERE assigned_to = ?', [id]);
        await db.run('DELETE FROM push_subscriptions WHERE member_id = ?', [id]);
        await notify(hid, [{ t: 'reload' }]);
        // "kick": il dispositivo della persona rimossa chiude la connessione e cancella i dati locali.
        await membersChanged(hid, [{ t: 'kick', id }]);
        return { status: 200, body: { ok: true } };
      }
    }

    // --- inviti personali (amministratori)
    if (kind === 'invites' && parts.length === 1 && m === 'POST') {
      requireAdmin(ctx);
      const token = newToken(18);
      const role = ROLES.includes(b.role) ? b.role : 'member';
      const days = Math.max(1, Math.min(30, parseInt(b.days, 10) || INVITE_DAYS));
      const email = cleanEmail(b.email);
      if (email && !mailer.enabled) throw new HttpError(501, 'L\'invio delle email non è attivo', 'no_email');
      await db.run(`INSERT INTO invites (token_hash, household_id, role, relation, email, created_by, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [sha(token), hid, role, cleanRelation(b.relation), email,
        ctx.me ? ctx.me.id : null, now(), now() + days * 864e5]);
      let sent = false;
      if (email) {
        sent = await mailer.send('invite', email, { group: ctx.hh.name, invited_by: ctx.me ? ctx.me.alias : '', link: mailer.link('/?invite=' + token), expires_days: days });
        if (!sent) throw new HttpError(502, 'Non è stato possibile inviare l\'email, riprova', 'email_failed');
      }
      return { status: 201, body: { token: email ? undefined : token, sent, expires_at: now() + days * 864e5 } };
    }

    // --- impostazioni del gruppo (amministratori)
    if (kind === 'household' && parts.length === 1 && m === 'PATCH') {
      requireAdmin(ctx);
      const name = str(b.name, 80) || ctx.hh.name;
      const approval = b.require_approval !== undefined ? (b.require_approval ? 1 : 0) : Number(ctx.hh.require_approval ?? 1);
      await db.run('UPDATE households SET name = ?, require_approval = ? WHERE id = ?', [name, approval, hid]);
      const hh = await db.get(SQL.hh, [hid]);
      return { events: [{ t: 'household', op: 'put', data: householdOut(hh) }] };
    }
    if (kind === 'household' && id === 'code' && parts.length === 2 && m === 'POST') {
      requireAdmin(ctx);
      const code = newCode();
      await db.run('UPDATE households SET code = ? WHERE id = ?', [code, hid]);
      const hh = await db.get(SQL.hh, [hid]);
      return { events: [{ t: 'household', op: 'put', data: householdOut(hh) }] };
    }
    return null;
  }

  // ---------------------------------------------------------------- presenza (stream in tempo reale)
  function streamHooks(ctx) {
    if (!ctx.me) return {};
    const id = ctx.me.id, hid = ctx.hh.id;
    const hidden = async () => !!Number(((await db.get('SELECT hide_presence FROM members WHERE id = ?', [id])) || {}).hide_presence);
    return {
      memberId: id,
      async onOpen() {
        await db.run('UPDATE members SET alive_at = ?, last_seen = ? WHERE id = ?', [now(), now(), id]);
        if (!await hidden()) await notify(hid, [{ t: 'presence', id, online: true, last_seen: now() }]);
      },
      async onPing() { await db.run('UPDATE members SET alive_at = ? WHERE id = ?', [now(), id]); },
      async onClose() {
        await db.run(`UPDATE members SET alive_at = 0, last_seen = ?, viewing = '' WHERE id = ?`, [now(), id]);
        if (!await hidden()) await notify(hid, [{ t: 'presence', id, online: false, viewing: '', last_seen: now() }]);
      },
    };
  }

  return { authenticate, publicRoute, route, createOwner, stateExtra, streamHooks, isAdmin, requireActive, requireAdmin, householdOut };
}

module.exports = { createMembers, MEMBER_SCHEMA, MEMBER_MIGRATIONS, memberPostMigration, RELATIONS, ROLES };
