'use strict';
/* Eventi del gruppo: data e ora, luogo, note, partecipazione (sì / forse / no) con ospiti
   ("+1" ripetibile), liste collegate (lists.event_id: "Spesa per l'evento", "Chi porta cosa").

   Chiunque nel gruppo può creare un evento; modificarlo o annullarlo può chi l'ha creato
   o un amministratore. Gli avvisi: evento nuovo (a tutti), cambiato (a chi non ha detto no),
   annullato (a chi aveva detto sì o forse), promemoria il giorno prima. */

const { HttpError, str, now, num } = require('./util');
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
`;
const EVENT_MIGRATIONS = [['lists', 'event_id', 'TEXT']];

const RSVPS = ['yes', 'maybe', 'no'];
const MAX_GUESTS = 20;
const cleanTime = (v) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '');
const cleanDate = (v) => (typeof v === 'string' && Shared.fromYmd(v) ? v : '');
// "sabato 14 novembre, 20:00–23:00"
const whenLabel = (e) => fmtDay(e.date) + (e.time ? ', ' + e.time + (e.end_time ? '–' + e.end_time : '') : '');

function createEvents({ db, realtime, notifier, isAdmin }) {
  const SQL = {
    events: 'SELECT * FROM events WHERE household_id = ? ORDER BY date, time',
    event: 'SELECT * FROM events WHERE id = ?',
    partsOfHh: 'SELECT p.* FROM event_participants p JOIN events e ON e.id = p.event_id WHERE e.household_id = ?',
    parts: 'SELECT * FROM event_participants WHERE event_id = ?',
    activeMembers: `SELECT * FROM members WHERE household_id = ? AND status = 'active'`,
  };

  function eventOut(r, parts) {
    return r && {
      id: r.id, title: r.title, date: r.date, time: r.time || '', end_time: r.end_time || '', location: r.location || '',
      notes: r.notes || '', icon: r.icon || 'party', created_by: r.created_by || '', created_by_id: r.created_by_id || null,
      created_at: num(r.created_at), updated_at: num(r.updated_at),
      participants: (parts || []).map((p) => ({ member_id: p.member_id, rsvp: p.rsvp, guests: Number(p.guests || 0), note: p.note || '', updated_at: num(p.updated_at) })),
    };
  }
  async function eventEvent(id) {
    const r = await db.get(SQL.event, [id]);
    return { t: 'event', op: 'put', data: eventOut(r, await db.all(SQL.parts, [id])) };
  }

  async function listAll(hh, { from } = {}) {
    const [rows, parts] = await Promise.all([db.all(SQL.events, [hh.id]), db.all(SQL.partsOfHh, [hh.id])]);
    const by = new Map();
    for (const p of parts) { if (!by.has(p.event_id)) by.set(p.event_id, []); by.get(p.event_id).push(p); }
    return rows.filter((r) => !from || r.date >= from).map((r) => eventOut(r, by.get(r.id)));
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
    const t = now();
    if (ex) {
      await db.run('UPDATE events SET title = ?, date = ?, time = ?, end_time = ?, location = ?, notes = ?, icon = ?, updated_at = ? WHERE id = ?',
        [title, date, time, endTime, location, notes, icon, t, id]);
    } else {
      await db.run(`INSERT INTO events (id, household_id, title, date, time, end_time, location, notes, icon, created_by, created_by_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, hh.id, title, date, time, endTime, location, notes, icon, who.name, who.id, t, t]);
      // Chi crea l'evento partecipa.
      if (who.id) await db.run('INSERT INTO event_participants (event_id, member_id, rsvp, guests, note, updated_at) VALUES (?, ?, ?, 0, ?, ?)', [id, who.id, 'yes', '', t]);
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

  // Router: /api/events/:id (PUT, DELETE), /api/events/:id/rsvp (POST).
  async function route(ctx, m, parts, b, who) {
    const [kind, id, action] = parts;
    if (kind !== 'events' || !id) return null;
    const hh = ctx.hh;
    if (m === 'PUT' && !action) return put(hh, id, b, ctx, who);
    if (m === 'DELETE' && !action) return del(hh, id, ctx, who);
    if (m === 'POST' && action === 'rsvp') return rsvp(hh, id, b, ctx);
    return null;
  }

  return { route, listAll, linkList, eventOut };
}

module.exports = { createEvents, EVENT_SCHEMA, EVENT_MIGRATIONS, RSVPS };
