'use strict';
/* Eventi del gruppo: data e ora, luogo, note, partecipazione (sì / forse / no) con ospiti
   ("+1" ripetibile), liste collegate (lists.event_id: "Spesa per l'evento", "Chi porta cosa").

   Chiunque nel gruppo può creare un evento; modificarlo o annullarlo può chi l'ha creato
   o un amministratore. Gli avvisi: evento nuovo (a tutti), cambiato (a chi non ha detto no),
   annullato (a chi aveva detto sì o forse), promemoria il giorno prima.

   Link pubblico (/e/<codice>): chi non usa Sporta vede l'evento e risponde con il solo nome
   (event_guests), con un codice personale per cambiare la risposta. Chi organizza sceglie se
   mostrare i nomi, i posti disponibili e la scadenza per rispondere. */

const crypto = require('node:crypto');
const { HttpError, str, now, num, newToken, sha, checkRate } = require('./util');
const { noLinks } = require('./protect');
const Shared = require('../public/shared.js');
const { fmtDay, today } = require('./notify');

const EVENT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    title TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL DEFAULT '', end_time TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT 'party',
    created_by TEXT NOT NULL DEFAULT '', created_by_id TEXT, reminded_date TEXT NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS events_household ON events(household_id, date);
  CREATE TABLE IF NOT EXISTS event_participants (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    rsvp TEXT NOT NULL, guests INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', updated_at BIGINT NOT NULL,
    PRIMARY KEY (event_id, member_id)
  );
  CREATE TABLE IF NOT EXISTS event_guests (
    id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name TEXT NOT NULL, rsvp TEXT NOT NULL, guests INTEGER NOT NULL DEFAULT 0, edit_hash TEXT NOT NULL,
    ip TEXT NOT NULL DEFAULT '', created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS event_guests_event ON event_guests(event_id);
`;
const EVENT_MIGRATIONS = [
  ['lists', 'event_id', 'TEXT'],
  ['events', 'public_token', 'TEXT'],
  ['events', 'public_names', 'INTEGER NOT NULL DEFAULT 0'],
  ['events', 'capacity', 'INTEGER'],
  ['events', 'rsvp_until', "TEXT NOT NULL DEFAULT ''"],
  ['events', 'source_url', "TEXT NOT NULL DEFAULT ''"],
];
const eventPostMigration = () => 'CREATE UNIQUE INDEX IF NOT EXISTS events_public ON events(public_token) WHERE public_token IS NOT NULL;';
const MAX_LINK_GUESTS = 200; // risposte dal link per evento

const RSVPS = ['yes', 'maybe', 'no'];
const MAX_GUESTS = 20;
const cleanTime = (v) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '');
const cleanDate = (v) => (typeof v === 'string' && Shared.fromYmd(v) ? v : '');
// "sabato 14 novembre, 20:00–23:00"
const whenLabel = (e) => fmtDay(e.date) + (e.time ? ', ' + e.time + (e.end_time ? '–' + e.end_time : '') : '');

function createEvents({ db, realtime, notifier, isAdmin, protect, appUrl = '' }) {
  const SQL = {
    events: 'SELECT * FROM events WHERE household_id = ? ORDER BY date, time',
    event: 'SELECT * FROM events WHERE id = ?',
    partsOfHh: 'SELECT p.* FROM event_participants p JOIN events e ON e.id = p.event_id WHERE e.household_id = ?',
    parts: 'SELECT * FROM event_participants WHERE event_id = ?',
    activeMembers: `SELECT * FROM members WHERE household_id = ? AND status = 'active'`,
    guests: 'SELECT * FROM event_guests WHERE event_id = ? ORDER BY created_at',
    guestsOfHh: 'SELECT g.* FROM event_guests g JOIN events e ON e.id = g.event_id WHERE e.household_id = ? ORDER BY g.created_at',
  };

  const guestOut = (g) => ({ id: g.id, name: g.name, rsvp: g.rsvp, guests: Number(g.guests || 0), created_at: num(g.created_at), updated_at: num(g.updated_at) });
  function eventOut(r, parts, guests) {
    return r && {
      id: r.id, title: r.title, date: r.date, time: r.time || '', end_time: r.end_time || '', location: r.location || '',
      notes: r.notes || '', icon: r.icon || 'party', created_by: r.created_by || '', created_by_id: r.created_by_id || null,
      created_at: num(r.created_at), updated_at: num(r.updated_at), source_url: r.source_url || '',
      participants: (parts || []).map((p) => ({ member_id: p.member_id, rsvp: p.rsvp, guests: Number(p.guests || 0), note: p.note || '', updated_at: num(p.updated_at) })),
      // Link pubblico e risposte di chi non usa Sporta.
      link: r.public_token ? { token: r.public_token, names: !!Number(r.public_names), capacity: r.capacity == null ? null : Number(r.capacity), rsvp_until: r.rsvp_until || '' } : null,
      link_options: { names: !!Number(r.public_names), capacity: r.capacity == null ? null : Number(r.capacity), rsvp_until: r.rsvp_until || '' },
      guests: (guests || []).map(guestOut),
    };
  }
  async function eventEvent(id) {
    const r = await db.get(SQL.event, [id]);
    return { t: 'event', op: 'put', data: eventOut(r, await db.all(SQL.parts, [id]), await db.all(SQL.guests, [id])) };
  }

  async function listAll(hh, { from } = {}) {
    const [rows, parts, guests] = await Promise.all([db.all(SQL.events, [hh.id]), db.all(SQL.partsOfHh, [hh.id]), db.all(SQL.guestsOfHh, [hh.id])]);
    const by = new Map(), gby = new Map();
    for (const p of parts) { if (!by.has(p.event_id)) by.set(p.event_id, []); by.get(p.event_id).push(p); }
    for (const g of guests) { if (!gby.has(g.event_id)) gby.set(g.event_id, []); gby.get(g.event_id).push(g); }
    return rows.filter((r) => !from || r.date >= from).map((r) => eventOut(r, by.get(r.id), gby.get(r.id)));
  }

  async function own(hh, id) {
    const r = await db.get(SQL.event, [id]);
    if (!r || r.household_id !== hh.id) throw new HttpError(404, 'Evento non trovato');
    return r;
  }
  const canEdit = (ctx, r) => isAdmin(ctx) || !r.created_by_id || (ctx.me && ctx.me.id === r.created_by_id);

  // Avvisa i membri attivi (tranne chi ha fatto l'azione), filtrando per risposta.
  async function tell(hh, r, kind, actor, filter) {
    const parts = new Map((await db.all(SQL.parts, [r.id])).map((p) => [p.member_id, p.rsvp]));
    const data = { when_label: whenLabel(r), location: r.location || '' };
    for (const m of await db.all(SQL.activeMembers, [hh.id])) {
      if (actor && m.id === actor.id) continue;
      if (filter && !filter(parts.get(m.id))) continue;
      await notifier.deliver(hh, m, { kind, actor: actor ? actor.name : '', event: { id: r.id, title: r.title }, data });
    }
  }

  async function put(hh, id, b, ctx, who) {
    const ex = await db.get(SQL.event, [id]);
    if (ex && ex.household_id !== hh.id) throw new HttpError(404, 'Evento non trovato');
    if (ex && !canEdit(ctx, ex)) throw new HttpError(403, 'Può modificarlo chi l\'ha creato o un amministratore', 'not_owner');
    const pick = (k, fn, d) => (b[k] !== undefined ? fn(b[k]) : ex ? ex[k] : d);
    const title = pick('title', (v) => str(v, 100), '');
    if (!title) throw new HttpError(400, 'Scrivi il nome dell\'evento', 'title_required');
    const date = pick('date', cleanDate, '');
    if (!date) throw new HttpError(400, 'Scegli la data dell\'evento', 'date_required');
    const time = pick('time', cleanTime, '');
    const endTime = time ? pick('end_time', cleanTime, '') : '';
    const location = pick('location', (v) => str(v, 200), '');
    const notes = pick('notes', (v) => str(v, 2000), '');
    const icon = pick('icon', (v) => str(v, 16) || 'party', 'party');
    // Evento aggiunto da un invito pubblico: si ricorda il link dell'invito originale.
    const sourceUrl = pick('source_url', (v) => { const s = str(v, 300); return /^https?:\/\/[^\s]+\/e\/[A-Za-z0-9_-]{16,64}$/.test(s) ? s : ''; }, '');
    const t = now();
    if (ex) {
      await db.run('UPDATE events SET title = ?, date = ?, time = ?, end_time = ?, location = ?, notes = ?, icon = ?, updated_at = ? WHERE id = ?',
        [title, date, time, endTime, location, notes, icon, t, id]);
      if (b.source_url !== undefined) await db.run('UPDATE events SET source_url = ? WHERE id = ?', [sourceUrl, id]);
    } else {
      await db.run(`INSERT INTO events (id, household_id, title, date, time, end_time, location, notes, icon, created_by, created_by_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, hh.id, title, date, time, endTime, location, notes, icon, who.name, who.id, t, t]);
      // Chi crea l'evento partecipa.
      if (who.id) await db.run('INSERT INTO event_participants (event_id, member_id, rsvp, guests, note, updated_at) VALUES (?, ?, ?, 0, ?, ?)', [id, who.id, 'yes', '', t]);
      if (sourceUrl) await db.run('UPDATE events SET source_url = ? WHERE id = ?', [sourceUrl, id]);
    }
    const r = await db.get(SQL.event, [id]);
    try {
      if (!ex) await tell(hh, r, 'event', who);
      else if (ex.date !== date || ex.time !== time || ex.location !== location) {
        if (ex.date !== date) await db.run(`UPDATE events SET reminded_date = '' WHERE id = ?`, [id]);
        await tell(hh, r, 'event_changed', who, (rsvp) => rsvp !== 'no');
      }
    } catch (e) { console.error('avviso evento non inviato', e); }
    return [await eventEvent(id)];
  }

  async function del(hh, id, ctx, who) {
    const r = await db.get(SQL.event, [id]);
    if (!r || r.household_id !== hh.id) return [{ t: 'event', op: 'del', id }];
    if (!canEdit(ctx, r)) throw new HttpError(403, 'Può annullarlo chi l\'ha creato o un amministratore', 'not_owner');
    // Se l'evento non è ancora passato, chi aveva detto sì o forse lo sa.
    if (r.date >= today()) {
      try { await tell(hh, r, 'event_cancelled', who, (rsvp) => rsvp === 'yes' || rsvp === 'maybe'); } catch (e) { console.error(e); }
    }
    await db.run('DELETE FROM event_participants WHERE event_id = ?', [id]);
    await db.run('DELETE FROM event_guests WHERE event_id = ?', [id]);
    await db.run('DELETE FROM events WHERE id = ?', [id]);
    // Le liste collegate restano nel gruppo, scollegate.
    const lists = await db.all('SELECT id FROM lists WHERE event_id = ?', [id]);
    await db.run('UPDATE lists SET event_id = NULL WHERE event_id = ?', [id]);
    return [{ t: 'event', op: 'del', id }, ...(lists.length ? [{ t: 'reload' }] : [])];
  }

  // Risposta: sì / forse / no, con il numero di ospiti (+1, +2…) e una nota.
  async function rsvp(hh, id, b, ctx) {
    if (!ctx.me) throw new HttpError(400, 'Aggiorna l\'app per rispondere', 'legacy');
    await own(hh, id);
    const v = RSVPS.includes(b.rsvp) ? b.rsvp : null;
    if (!v) throw new HttpError(400, 'Risposta non valida', 'bad_rsvp');
    const guests = v === 'no' ? 0 : Math.max(0, Math.min(MAX_GUESTS, parseInt(b.guests, 10) || 0));
    const note = str(b.note, 200);
    await db.run('DELETE FROM event_participants WHERE event_id = ? AND member_id = ?', [id, ctx.me.id]);
    await db.run('INSERT INTO event_participants (event_id, member_id, rsvp, guests, note, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [id, ctx.me.id, v, guests, note, now()]);
    return [await eventEvent(id)];
  }

  // Lista collegata a un evento (o scollegata con null).
  async function linkList(hh, listId, eventId) {
    if (eventId) await own(hh, String(eventId));
    await db.run('UPDATE lists SET event_id = ? WHERE id = ? AND household_id = ?', [eventId ? String(eventId) : null, listId, hh.id]);
  }

  // Promemoria il giorno prima: a chi ha detto sì o forse e a chi non ha ancora risposto.
  notifier.hooks.eventReminders = async (tomorrow, { deliver, hh: getHh }) => {
    let sent = 0;
    const rows = await db.all('SELECT * FROM events WHERE date = ? AND reminded_date <> date', [tomorrow]);
    for (const r of rows) {
      await db.run('UPDATE events SET reminded_date = ? WHERE id = ?', [r.date, r.id]);
      const hh = await getHh(r.household_id);
      const parts = new Map((await db.all(SQL.parts, [r.id])).map((p) => [p.member_id, p.rsvp]));
      for (const m of await db.all(SQL.activeMembers, [hh.id])) {
        const v = parts.get(m.id);
        if (v === 'no') continue;
        await deliver(hh, m, { kind: 'event_due', event: { id: r.id, title: r.title }, data: { when_label: whenLabel(r), location: r.location || '', ask: !v } });
        sent++;
      }
    }
    return sent;
  };

  // ------------------------------------------------------------ link pubblico (chi organizza)
  async function putLink(hh, id, b, ctx) {
    const r = await own(hh, id);
    if (!canEdit(ctx, r)) throw new HttpError(403, 'Può gestire il link chi ha creato l\'evento o un amministratore', 'not_owner');
    let token = r.public_token;
    if (b.enabled === false) token = null;
    else if (b.enabled === true && !token) token = newToken(18);
    if (b.regenerate && token) token = newToken(18);
    const names = b.names !== undefined ? (b.names ? 1 : 0) : Number(r.public_names || 0);
    let capacity = b.capacity !== undefined ? parseInt(b.capacity, 10) : r.capacity;
    capacity = Number.isFinite(Number(capacity)) && Number(capacity) > 0 ? Math.min(10000, Number(capacity)) : null;
    const until = b.rsvp_until !== undefined ? cleanDate(b.rsvp_until) : r.rsvp_until || '';
    await db.run('UPDATE events SET public_token = ?, public_names = ?, capacity = ?, rsvp_until = ?, updated_at = ? WHERE id = ?',
      [token, names, capacity, until, now(), id]);
    return [await eventEvent(id)];
  }
  async function removeGuest(hh, id, gid, ctx) {
    const r = await own(hh, id);
    if (!canEdit(ctx, r)) throw new HttpError(403, 'Può togliere gli ospiti chi ha creato l\'evento o un amministratore', 'not_owner');
    await db.run('DELETE FROM event_guests WHERE id = ? AND event_id = ?', [String(gid), id]);
    return [await eventEvent(id)];
  }

  // ------------------------------------------------------------ pagina pubblica (/e/<codice>)
  // Persone che ci sono (membri e ospiti dal link, ognuno con i suoi "+1").
  function tally(parts, guests) {
    let yes = 0, maybe = 0;
    for (const x of [...parts, ...guests]) {
      if (x.rsvp === 'yes') yes += 1 + Number(x.guests || 0);
      else if (x.rsvp === 'maybe') maybe += 1 + Number(x.guests || 0);
    }
    return { yes, maybe };
  }
  const closedFor = (r) => r.date < today() || (r.rsvp_until && r.rsvp_until < today());

  async function publicEvent(token, ip) {
    const r = /^[A-Za-z0-9_-]{16,64}$/.test(token) && await db.get('SELECT * FROM events WHERE public_token = ?', [token]);
    if (!r) { checkRate('auth:' + ip); throw new HttpError(404, 'Questo invito non è più valido', 'bad_link'); }
    return r;
  }
  async function publicView(r, mine) {
    const [parts, guests] = await Promise.all([db.all(SQL.parts, [r.id]), db.all(SQL.guests, [r.id])]);
    const t = tally(parts, guests);
    const capacity = r.capacity == null ? null : Number(r.capacity);
    let names;
    if (Number(r.public_names)) {
      const mem = new Map((await db.all('SELECT id, alias FROM members WHERE household_id = ?', [r.household_id])).map((m) => [m.id, m.alias]));
      names = [
        ...parts.filter((p) => p.rsvp !== 'no' && mem.has(p.member_id)).map((p) => ({ name: mem.get(p.member_id), rsvp: p.rsvp, guests: Number(p.guests || 0), organizer: p.member_id === r.created_by_id })),
        ...guests.filter((g) => g.rsvp !== 'no').map((g) => ({ name: g.name, rsvp: g.rsvp, guests: Number(g.guests || 0), me: mine && g.id === mine.id })),
      ];
    }
    return {
      event: {
        title: r.title, date: r.date, time: r.time || '', end_time: r.end_time || '', location: r.location || '', notes: r.notes || '',
        icon: r.icon || 'party', organizer: r.created_by || '',
      },
      yes: t.yes, maybe: t.maybe, capacity, free: capacity == null ? null : Math.max(0, capacity - t.yes),
      rsvp_until: r.rsvp_until || '', closed: closedFor(r), names: names || null,
      mine: mine ? guestOut(mine) : null,
    };
  }
  const findMine = async (r, edit) => (edit && typeof edit === 'string' ? db.get('SELECT * FROM event_guests WHERE event_id = ? AND edit_hash = ?', [r.id, sha(edit)]) : null);
  // Posti: chi dice "ci sono" (con i suoi ospiti) non può superare i posti liberi.
  async function checkSeats(r, rsvp, guests, prev) {
    if (r.capacity == null || rsvp !== 'yes') return;
    const [parts, others] = await Promise.all([db.all(SQL.parts, [r.id]), db.all(SQL.guests, [r.id])]);
    const t = tally(parts, others.filter((g) => !prev || g.id !== prev.id));
    if (t.yes + 1 + guests > Number(r.capacity)) {
      const free = Math.max(0, Number(r.capacity) - t.yes);
      throw new HttpError(409, free ? `Restano solo ${free} ${free === 1 ? 'posto' : 'posti'}: riduci gli ospiti` : 'Posti esauriti', 'full');
    }
  }
  async function tellOrganizer(r, kind, g) {
    const creator = r.created_by_id && await db.get(`SELECT * FROM members WHERE id = ? AND status = 'active'`, [r.created_by_id]);
    if (!creator) return;
    const hh = await db.get('SELECT * FROM households WHERE id = ?', [r.household_id]);
    try { await notifier.deliver(hh, creator, { kind, actor: g.name, event: { id: r.id, title: r.title }, data: { rsvp: g.rsvp, guests: Number(g.guests || 0) } }); }
    catch (e) { console.error('avviso a chi organizza non inviato', e); }
  }
  const broadcastEvent = async (r) => { try { await realtime.broadcast(r.household_id, [await eventEvent(r.id)]); } catch (e) { console.error('broadcast fallito', e); } };

  async function publicRoute(m, parts, b, ip) {
    if (parts[0] !== 'public' || parts[1] !== 'events' || !parts[2]) return null;
    const r = await publicEvent(String(parts[2]), ip);
    const action = parts[3];
    if (m === 'GET' && !action) return { status: 200, body: await publicView(r, await findMine(r, b.edit)) };
    if (action !== 'rsvp' || parts.length !== 4) return null;
    const mine = await findMine(r, b.edit);
    if (m === 'DELETE') {
      if (!mine) throw new HttpError(404, 'Risposta non trovata', 'not_found');
      await db.run('DELETE FROM event_guests WHERE id = ?', [mine.id]);
      await broadcastEvent(r);
      await tellOrganizer(r, 'guest_withdrawn', mine);
      return { status: 200, body: await publicView(r, null) };
    }
    if (m !== 'POST' && m !== 'PATCH') return null;
    if (closedFor(r)) throw new HttpError(409, 'Le risposte per questo evento sono chiuse', 'closed');
    const rsvp = RSVPS.includes(b.rsvp) ? b.rsvp : null;
    if (!rsvp) throw new HttpError(400, 'Scegli una risposta', 'bad_rsvp');
    const guests = rsvp === 'no' ? 0 : Math.max(0, Math.min(MAX_GUESTS, parseInt(b.guests, 10) || 0));
    const name = noLinks(str(b.name, 40).replace(/\s+/g, ' '), 'Il nome');
    if (m === 'PATCH') {
      if (!mine) throw new HttpError(404, 'Risposta non trovata', 'not_found');
      await checkSeats(r, rsvp, guests, mine);
      await db.run('UPDATE event_guests SET name = ?, rsvp = ?, guests = ?, updated_at = ? WHERE id = ?', [name || mine.name, rsvp, guests, now(), mine.id]);
      const g = await db.get('SELECT * FROM event_guests WHERE id = ?', [mine.id]);
      await broadcastEvent(r);
      if (g.rsvp !== mine.rsvp || Number(g.guests) !== Number(mine.guests)) await tellOrganizer(r, 'guest_rsvp', g);
      return { status: 200, body: await publicView(r, g) };
    }
    // Nuova risposta: prova anti-spam, limiti, posti.
    if (!name) throw new HttpError(400, 'Scrivi il tuo nome', 'name_required');
    await protect.verify(b.altcha);
    await protect.hit('rsvp-ip:' + ip, 20, 3600e3, 'Troppe risposte da questa connessione: riprova più tardi');
    if (Number((await db.get('SELECT COUNT(*) AS n FROM event_guests WHERE event_id = ?', [r.id])).n) >= MAX_LINK_GUESTS) {
      throw new HttpError(429, 'Questo evento ha già ricevuto troppe risposte dal link', 'too_many');
    }
    await checkSeats(r, rsvp, guests, null);
    const edit = newToken(18), id = crypto.randomUUID(), t = now();
    await db.run(`INSERT INTO event_guests (id, event_id, name, rsvp, guests, edit_hash, ip, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, r.id, name, rsvp, guests, sha(edit), str(ip, 60), t, t]);
    const g = await db.get('SELECT * FROM event_guests WHERE id = ?', [id]);
    await broadcastEvent(r);
    await tellOrganizer(r, 'guest_rsvp', g);
    return { status: 201, body: { ...await publicView(r, g), edit } };
  }

  // Router: /api/events/:id (PUT, DELETE), /api/events/:id/rsvp (POST), /link (PUT), /guests/:gid (DELETE).
  async function route(ctx, m, parts, b, who) {
    const [kind, id, action, sub] = parts;
    if (kind !== 'events' || !id) return null;
    const hh = ctx.hh;
    if (m === 'PUT' && !action) return put(hh, id, b, ctx, who);
    if (m === 'DELETE' && !action) return del(hh, id, ctx, who);
    if (m === 'POST' && action === 'rsvp') return rsvp(hh, id, b, ctx);
    if (m === 'PUT' && action === 'link') return putLink(hh, id, b, ctx);
    if (m === 'DELETE' && action === 'guests' && sub) return removeGuest(hh, id, sub, ctx);
    return null;
  }

  return { route, publicRoute, listAll, linkList, eventOut };
}

module.exports = { createEvents, EVENT_SCHEMA, EVENT_MIGRATIONS, eventPostMigration, RSVPS };
