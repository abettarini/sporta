'use strict';
/* Membri dei gruppi: ruoli, richieste di accesso, inviti personali e presenza.

   Ogni appartenenza a un gruppo è collegata all'account della persona (lib/accounts.js, email
   verificata). Ogni dispositivo ha una chiave di gruppo ("m_…", conservata solo come hash) legata
   al dispositivo dell'account. Il codice del gruppo serve solo a chiedere di entrare.

   Ruoli: role = 'admin' | 'member' (permessi); relation = Familiare, Amico, … (descrittiva).
   Stati: 'pending' (in attesa), 'active', 'removed' (uscito o rimosso), 'rejected', 'blocked'. */

const crypto = require('node:crypto');
const { HttpError, newCode, newToken, sha, ID_RE, str, now, num, parseJson, checkRate } = require('./util');
const { noLinks } = require('./protect');

const ROLES = ['admin', 'member'];
const RELATIONS = ['familiare', 'amico', 'collega', 'ospite'];
const ONLINE_MS = 50 * 1000;
const INVITE_DAYS = 7;
const MAX_PENDING = 20;
const LEGACY_DAYS = 30;

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
  ['invites', 'name', "TEXT NOT NULL DEFAULT ''"], // nome proposto a chi entra con l'invito (modificabile)
];
// I gruppi esistenti prima della versione 3 (legacy_until ancora vuoto) entrano nel periodo di transizione.
const memberPostMigration = () =>
  `UPDATE households SET legacy_until = ${Date.now() + LEGACY_DAYS * 864e5} WHERE legacy_until IS NULL;`;

const cleanRelation = (v) => {
  const s = str(v, 24).toLowerCase();
  return s.replace(/[^\p{L}\p{N} '-]/gu, '').trim();
};
const cleanAlias = (v) => noLinks(str(v, 40).replace(/\s+/g, ' '), 'Il nome');
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
  if (m.id === viewerId) Object.assign(o, { hide_presence: !!Number(m.hide_presence), notify_email: !!Number(m.notify_email), author_name: m.author_name ?? null });
  if (admin) Object.assign(o, { email: m.email, email_verified: !!m.account_id, message: m.message, created_at: num(m.created_at), invited_by: m.invited_by });
  return o;
}

function createMembers({ db, realtime, mailer, protect }) {
  mailer = mailer || { enabled: false, send: async () => false, link: (p) => p };
  let accounts = null; // collegato dopo (lib/accounts.js usa a sua volta questo modulo)
  let notifier = null; // avvisi (lib/notify.js), collegato dal core
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
    adminEmails: `SELECT email FROM members WHERE household_id = ? AND role = 'admin' AND status = 'active' AND email <> ''`,
    devicesCount: 'SELECT COUNT(*) AS n FROM member_devices WHERE member_id = ?',
  };
  const notify = async (hid, events) => {
    try { await realtime.broadcast(hid, events); } catch (e) { console.error('broadcast fallito', e); }
  };
  // Le modifiche ai membri arrivano come segnale: i client rileggono l'elenco con i loro permessi
  // (così email e messaggi delle richieste restano visibili solo agli amministratori).
  const membersChanged = (hid, extra = []) => notify(hid, [...extra, { t: 'members' }]);

  // Chiave di gruppo per un dispositivo dell'account (deviceId: account_devices.id).
  async function newDevice(member, deviceId = null) {
    const token = 'm_' + newToken(24);
    await db.run(SQL.deviceInsert, [sha(token), member.id, member.household_id, now()]);
    if (deviceId) await db.run('UPDATE member_devices SET device_id = ? WHERE token_hash = ?', [deviceId, sha(token)]);
    return token;
  }

  // Uscita o rimozione dal gruppo: chiavi, assegnazioni e notifiche push della persona.
  async function removeMember(m, status = 'removed', extra = []) {
    await db.run(`UPDATE members SET status = ?, alive_at = 0, updated_at = ? WHERE id = ?`, [status, now(), m.id]);
    await db.run(SQL.devicesDelete, [m.id]);
    await db.run('UPDATE items SET assigned_to = NULL, assigned_by = NULL WHERE assigned_to = ?', [m.id]);
    await db.run('DELETE FROM push_subscriptions WHERE member_id = ?', [m.id]);
    await notify(m.household_id, [{ t: 'reload' }]);
    await membersChanged(m.household_id, extra);
  }

  // L'account del dispositivo per gli endpoint pubblici (entrare in un gruppo, crearlo).
  function requireAccount(auth) {
    if (!auth) throw new HttpError(401, 'Prima conferma la tua email', 'account_required');
    return auth;
  }

  async function assertAliasFree(hid, alias, exceptId = '') {
    if (!alias) throw new HttpError(400, 'Scrivi il tuo nome', 'alias_required');
    if (await db.get(SQL.aliasTaken, [hid, alias, exceptId])) {
      throw new HttpError(409, `Il nome "${alias}" è già usato in questo gruppo: scegline un altro (per esempio aggiungi l'iniziale del cognome).`, 'alias_taken');
    }
  }

  async function createMember(hh, { alias, role = 'member', relation = '', status, email = '', message = '', invitedBy = null, accountId = null }) {
    const t = now();
    if (accountId && await db.get(`SELECT id FROM members WHERE household_id = ? AND account_id = ? AND status IN ('active', 'pending')`, [hh.id, accountId])) {
      throw new HttpError(409, 'Fai già parte di questo gruppo (o hai già chiesto di entrare)', 'already_member');
    }
    const m = {
      id: crypto.randomUUID(), household_id: hh.id, alias, role, relation, status, email, message,
      invited_by: invitedBy, created_at: t, joined_at: status === 'active' ? t : null, last_seen: t, account_id: accountId,
    };
    await db.run(SQL.insert, [m.id, hh.id, alias, role, relation, status, email, message, invitedBy, t, m.joined_at, t, t]);
    if (accountId) await db.run('UPDATE members SET account_id = ? WHERE id = ?', [accountId, m.id]);
    return m;
  }

  // ---------------------------------------------------------------- autenticazione
  // Ritorna il contesto della richiesta: { hh, me } con la chiave di gruppo del dispositivo.
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
    // Le chiavi "a_" sono dell'account (non di un gruppo); i vecchi codici di gruppo non aprono più nulla.
    checkRate('auth:' + ip);
    if (raw.startsWith('a_')) throw new HttpError(401, 'Chiave non valida per un gruppo', 'bad_token');
    throw new HttpError(401, 'Questo accesso non è più valido: entra con la tua email', 'legacy_expired');
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
      personal: !!hh.personal_of, kind: hh.kind || 'group', description: hh.description || '', slug: hh.slug || '', system: !!Number(hh.system || 0),
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
  // auth: { account, device } se la richiesta ha la chiave dell'account del dispositivo; ua: browser.
  async function publicRoute(m, parts, b, ip, auth, ua) {
    // Anteprima di un codice: nome del gruppo, se serve l'approvazione e se un nome è libero.
    if (m === 'GET' && parts[0] === 'preview' && parts.length === 1) {
      const code = str(b.code, 20).toUpperCase();
      const hh = code && await db.get(SQL.hhByCode, [code]);
      // Il gruppo personale non ha un codice utilizzabile.
      if (!hh || hh.personal_of) { checkRate('auth:' + ip); throw new HttpError(404, 'Codice non valido.', 'bad_code'); }
      const alias = cleanAlias(b.alias);
      return {
        status: 200,
        body: {
          household: { name: hh.name, require_approval: !!Number(hh.require_approval ?? 1) },
          alias_available: alias ? !(await db.get(SQL.aliasTaken, [hh.id, alias, ''])) : undefined,
        },
      };
    }
    // Richiesta di accesso con il codice del gruppo (con l'email già confermata).
    if (m === 'POST' && parts[0] === 'join' && parts.length === 1) {
      checkRate('join:' + ip, 20);
      const { account, device } = requireAccount(auth);
      await protect.hit('join-acct:' + account.id, 10, 864e5, 'Hai chiesto di entrare in troppi gruppi oggi: riprova domani');
      const hh = await db.get(SQL.hhByCode, [str(b.code, 20).toUpperCase()]);
      if (!hh || hh.personal_of) { checkRate('auth:' + ip); throw new HttpError(404, 'Codice non valido.', 'bad_code'); }
      const alias = cleanAlias(b.alias);
      await assertAliasFree(hh.id, alias);
      await accounts.ensureTerms(account, !!b.accept_terms, ip);
      const email = account.email;
      if (await db.get(SQL.blockedEmail, [hh.id, email])) throw new HttpError(403, 'Non è possibile entrare in questo gruppo', 'blocked');
      const approval = !!Number(hh.require_approval ?? 1);
      if (approval && Number((await db.get(SQL.pendingCount, [hh.id])).n) >= MAX_PENDING) {
        throw new HttpError(429, 'Ci sono troppe richieste in attesa per questo gruppo: riprova più tardi', 'too_many_pending');
      }
      const me = await createMember(hh, {
        alias, relation: cleanRelation(b.relation), email, message: str(b.message, 300),
        status: approval ? 'pending' : 'active', role: 'member', accountId: account.id,
      });
      const token = await newDevice(me, device.id);
      await membersChanged(hh.id, approval ? [] : [{ t: 'joined', id: me.id, alias }]);
      if (approval) {
        for (const a of await db.all(SQL.adminEmails, [hh.id])) {
          mailer.send('join_request', a.email, { group: hh.name, alias, relation: me.relation, message: me.message, link: mailer.link('/#/m') });
        }
        // Avviso nell'app e notifica push a ogni amministratore: toccandolo si apre Membri.
        if (notifier) {
          for (const a of await db.all(`SELECT * FROM members WHERE household_id = ? AND role = 'admin' AND status = 'active'`, [hh.id])) {
            try { await notifier.deliver(hh, a, { kind: 'join_request', actor: alias, path: 'm', data: { group_name: hh.name, message: me.message || '' } }); }
            catch (e) { console.error('avviso richiesta di ingresso non inviato', e); }
          }
        }
      }
      return { status: 201, body: { token, me: memberOut(me, true, me.id), household: householdOut(hh), account: accounts.accountOut(account) } };
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
            household: { name: hh.name }, invited_by: by ? by.alias : '', relation: inv.relation, role: inv.role, email: inv.email || '', name: inv.name || '',
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
        // Con un invito via email il link dimostra che l'email è della persona: niente codice.
        // Il dispositivo può però entrare con il suo account (use_device_account), se ne ha già uno.
        let account, deviceId, accountToken;
        if (inv.email && !(auth && b.use_device_account)) {
          account = await accounts.findOrCreate(inv.email, true);
          if (auth && auth.account.id === account.id) deviceId = auth.device.id;
          else { const d = await accounts.newDevice(account, ua); deviceId = d.id; accountToken = d.token; }
        } else {
          ({ account } = requireAccount(auth));
          deviceId = auth.device.id;
        }
        await accounts.ensureTerms(account, !!b.accept_terms, ip);
        const me = await createMember(hh, {
          alias, role: inv.role, relation: inv.relation, status: 'active', email: account.email, invitedBy: inv.created_by, accountId: account.id,
        });
        await db.run('UPDATE invites SET used_by = ?, used_at = ? WHERE token_hash = ?', [me.id, now(), inv.token_hash]);
        await notify(hh.id, [{ t: 'invites' }]);
        const token = await newDevice(me, deviceId);
        await membersChanged(hh.id, [{ t: 'joined', id: me.id, alias }]);
        return {
          status: 201,
          body: {
            token, me: memberOut(me, true), household: householdOut(hh), account: accounts.accountOut(account),
            ...(accountToken ? { account_token: accountToken, groups: await accounts.groupsFor(account, deviceId) } : {}),
          },
        };
      }
    }
    return null;
  }

  // Creazione di un gruppo: chi lo crea ne è l'amministratore.
  async function createOwner(hh, alias, auth) {
    const me = await createMember(hh, { alias: cleanAlias(alias) || 'Amministratore', role: 'admin', status: 'active', email: auth.account.email, accountId: auth.account.id });
    return { me, token: await newDevice(me, auth.device.id) };
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
      const email = ctx.me.account_id ? ctx.me.email : b.email !== undefined ? cleanEmail(b.email) : ctx.me.email; // con l'account si cambia da "Il tuo account"
      const hide = b.hide_presence !== undefined ? (b.hide_presence ? 1 : 0) : Number(ctx.me.hide_presence || 0);
      const notifyEmail = b.notify_email !== undefined ? (b.notify_email ? 1 : 0) : Number(ctx.me.notify_email || 0);
      if (alias !== ctx.me.alias) await assertAliasFree(hid, alias, ctx.me.id);
      await db.run('UPDATE members SET alias = ?, email = ?, hide_presence = ?, notify_email = ?, updated_at = ? WHERE id = ?', [alias, email, hide, notifyEmail, now(), ctx.me.id]);
      // Firma delle ricette pubbliche (vale per le prossime pubblicazioni); null = non ancora scelta.
      if (b.author_name !== undefined) await db.run('UPDATE members SET author_name = ? WHERE id = ?', [b.author_name === null ? null : noLinks(str(b.author_name, 80), 'La firma'), ctx.me.id]);
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
    if (kind === 'me' && id === 'leave' && parts.length === 2 && m === 'POST' && ctx.hh.personal_of) {
      throw new HttpError(409, 'Dal gruppo personale non si può uscire', 'personal');
    }
    if (kind === 'me' && id === 'leave' && parts.length === 2 && m === 'POST') {
      if (!ctx.me) return { status: 200, body: { ok: true } };
      if (ctx.me.role === 'admin' && ctx.me.status === 'active') {
        const others = Number((await db.get(SQL.adminsActive, [hid])).n) - 1;
        const anyone = (await db.all(SQL.members, [hid])).some((x) => x.id !== ctx.me.id && x.status === 'active');
        if (others < 1 && anyone) throw new HttpError(409, 'Sei l\'unico amministratore: nomina un altro amministratore prima di uscire', 'last_admin');
      }
      await removeMember(ctx.me);
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
        // "kick": il dispositivo della persona rimossa chiude la connessione e cancella i dati locali.
        await removeMember(target, 'removed', [{ t: 'kick', id }]);
        return { status: 200, body: { ok: true } };
      }
    }

    // --- inviti personali (amministratori): elenco di quelli in attesa e annullamento
    if (kind === 'invites' && parts.length === 1 && m === 'GET') {
      requireAdmin(ctx);
      const rows = await db.all(`SELECT i.*, m.alias AS by_alias FROM invites i LEFT JOIN members m ON m.id = i.created_by
        WHERE i.household_id = ? AND i.used_at IS NULL AND i.expires_at > ? ORDER BY i.created_at DESC`, [hid, now()]);
      return {
        status: 200,
        body: {
          invites: rows.map((r) => ({
            id: r.token_hash, email: r.email || '', name: r.name || '', role: r.role, relation: r.relation || '', created_by: r.by_alias || '',
            created_at: num(r.created_at), expires_at: num(r.expires_at),
          })),
        },
      };
    }
    if (kind === 'invites' && id && !action && m === 'DELETE') {
      requireAdmin(ctx);
      // L'invito annullato smette subito di funzionare (il link porta a "invito non trovato").
      await db.run('DELETE FROM invites WHERE token_hash = ? AND household_id = ? AND used_at IS NULL', [String(id), hid]);
      await notify(hid, [{ t: 'invites' }]);
      return { status: 200, body: { ok: true } };
    }
    if (kind === 'invites' && parts.length === 1 && m === 'POST' && ctx.hh.personal_of) {
      throw new HttpError(403, 'Il gruppo personale è solo tuo: per condividere crea un gruppo', 'personal');
    }
    if (kind === 'invites' && parts.length === 1 && m === 'POST') {
      requireAdmin(ctx);
      const token = newToken(18);
      const role = ROLES.includes(b.role) ? b.role : 'member';
      const days = Math.max(1, Math.min(30, parseInt(b.days, 10) || INVITE_DAYS));
      const email = cleanEmail(b.email);
      if (email && !mailer.enabled) throw new HttpError(501, 'L\'invio delle email non è attivo', 'no_email');
      if (email) {
        // Contro l'uso degli inviti come spam: chi non vuole inviti, limiti per gruppo e per persona.
        if (await protect.isBlocked(email)) throw new HttpError(409, 'Questa persona ha chiesto di non ricevere email da Sporta: mandale il link in un altro modo', 'email_blocked');
        const open = Number((await db.get(`SELECT COUNT(*) AS n FROM invites WHERE household_id = ? AND email <> '' AND used_at IS NULL AND expires_at > ?`, [hid, now()])).n);
        if (open >= 30) throw new HttpError(429, 'Ci sono già troppi inviti in attesa in questo gruppo', 'rate_limited');
        const limit = 'Hai mandato troppi inviti per email oggi: riprova domani, oppure condividi il link in un altro modo';
        await protect.hit('invite-group:' + hid, 10, 864e5, limit);
        const acc = ctx.me && ctx.me.account_id && await db.get('SELECT created_at FROM accounts WHERE id = ?', [ctx.me.account_id]);
        if (acc && now() - Number(acc.created_at) < 864e5) await protect.hit('invite-new:' + ctx.me.account_id, 3, 864e5, limit);
        else if (ctx.me && ctx.me.account_id) await protect.hit('invite-acct:' + ctx.me.account_id, 20, 864e5, limit);
      }
      const name = b.name ? cleanAlias(b.name) : '';
      await db.run(`INSERT INTO invites (token_hash, household_id, role, relation, email, created_by, created_at, expires_at, name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [sha(token), hid, role, cleanRelation(b.relation), email,
        ctx.me ? ctx.me.id : null, now(), now() + days * 864e5, name]);
      let sent = false;
      if (email) {
        sent = await mailer.send('invite', email, {
          group: ctx.hh.name, invited_by: ctx.me ? ctx.me.alias : '', link: mailer.link('/?invite=' + token), expires_days: days,
          stop_link: mailer.link(protect.stopPath(email)),
        });
        if (!sent) throw new HttpError(502, 'Non è stato possibile inviare l\'email, riprova', 'email_failed');
      }
      await notify(hid, [{ t: 'invites' }]);
      return { status: 201, body: { token: email ? undefined : token, sent, expires_at: now() + days * 864e5 } };
    }

    // --- impostazioni del gruppo (amministratori)
    if (kind === 'household' && parts.length === 1 && m === 'PATCH') {
      requireAdmin(ctx);
      const name = noLinks(str(b.name, 80), 'Il nome del gruppo') || ctx.hh.name;
      const approval = b.require_approval !== undefined ? (b.require_approval ? 1 : 0) : Number(ctx.hh.require_approval ?? 1);
      await db.run('UPDATE households SET name = ?, require_approval = ? WHERE id = ?', [name, approval, hid]);
      if (ctx.hh.kind === 'cookbook') {
        // Ricettario: descrizione per la pagina web; le ricette sono firmate con il suo nome.
        if (b.description !== undefined) await db.run('UPDATE households SET description = ? WHERE id = ?', [noLinks(str(b.description, 500), 'La descrizione'), hid]);
        if (name !== ctx.hh.name) {
          await db.run(`UPDATE recipes SET author_name = ? WHERE household_id = ? AND visibility = 'public'`, [name, hid]);
          await notify(hid, [{ t: 'reload' }]);
        }
      }
      const hh = await db.get(SQL.hh, [hid]);
      return { events: [{ t: 'household', op: 'put', data: householdOut(hh) }] };
    }
    if (kind === 'household' && id === 'code' && parts.length === 2 && m === 'POST' && ctx.hh.personal_of) {
      throw new HttpError(403, 'Il gruppo personale non ha un codice', 'personal');
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

  return {
    authenticate, publicRoute, route, createOwner, stateExtra, streamHooks, isAdmin, requireActive, requireAdmin, householdOut,
    issueToken: newDevice, addMember: createMember, memberView: (m) => memberOut(m, true, m.id), removeMember, useAccounts: (a) => { accounts = a; }, useNotifier: (n) => { notifier = n; },
  };
}

module.exports = { createMembers, MEMBER_SCHEMA, MEMBER_MIGRATIONS, memberPostMigration, RELATIONS, ROLES };
