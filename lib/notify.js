'use strict';
/* Avvisi: assegnazioni, rifiuti, cose fatte e promemoria delle scadenze.

   Ogni avviso è una riga in `notifications` per la persona che lo riceve, e arriva:
   - nell'app: segnale { t: 'notify', to } sullo stream del gruppo (il client rilegge gli avvisi);
   - come notifica push (Web Push con chiavi VAPID) sui dispositivi che l'hanno attivata;
   - per email, solo se la persona l'ha scelto per quel gruppo (members.notify_email).

   Variabili d'ambiente per il push (senza, l'app funziona e non manda notifiche push):
     VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   generabili con `npm run vapid`
     VAPID_SUBJECT                         contatto per i servizi push (mailto:… o https://…)
   Promemoria: GET /api/cron/reminders con "Authorization: Bearer $CRON_SECRET" (Vercel Cron),
   oppure in automatico ogni ora sul server locale. */

const crypto = require('node:crypto');
const { HttpError, str, now, num, parseJson, ID_RE } = require('./util');

const NOTIFY_SCHEMA = `
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, actor TEXT NOT NULL DEFAULT '', item_id TEXT, list_id TEXT,
    data TEXT NOT NULL DEFAULT '{}', created_at BIGINT NOT NULL, read_at BIGINT
  );
  CREATE INDEX IF NOT EXISTS notifications_member ON notifications(member_id, created_at);
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE, endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at BIGINT NOT NULL,
    PRIMARY KEY (member_id, endpoint)
  );
`;
const NOTIFY_MIGRATIONS = [
  ['members', 'notify_email', 'INTEGER NOT NULL DEFAULT 0'],
  ['items', 'reminded_due', "TEXT NOT NULL DEFAULT ''"],
];

// Avvisi che possono arrivare anche per email (se la persona l'ha scelto) e modello usato.
const EMAIL_KINDS = { assigned: 'assigned', due: 'reminder', event: 'event', event_changed: 'event', event_cancelled: 'event', event_due: 'event' };
const KEEP_DAYS = 60;     // gli avvisi più vecchi si cancellano
const LIST_MAX = 50;
const TZ = process.env.APP_TIMEZONE || 'Europe/Rome';

// Data di oggi (YYYY-MM-DD) nel fuso dell'app: le scadenze sono date "di calendario".
function today(t = now(), tz = TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}
function addDays(ymd, n) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDay(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

// Testo dell'avviso (uguale per app, push ed email).
function describe(n) {
  const d = n.data || {};
  const what = `"${d.item || ''}"`;
  switch (n.kind) {
    case 'assigned': return { title: `${n.actor || 'Qualcuno'} ti ha assegnato ${what}`, body: [d.list, d.due && 'entro ' + d.due_label].filter(Boolean).join(' · ') };
    case 'declined': return { title: `${n.actor || 'Qualcuno'} non può occuparsi di ${what}`, body: `${d.list || ''} · ora non è assegnata a nessuno` };
    case 'done': return { title: `${n.actor || 'Qualcuno'} ha fatto ${what}`, body: d.list || '' };
    case 'guest_rsvp': return {
      title: `${n.actor || 'Un ospite'} ${d.rsvp === 'yes' ? 'ci sarà' : d.rsvp === 'maybe' ? 'forse ci sarà' : 'non ci sarà'}${d.guests ? ' +' + d.guests : ''}`,
      body: `«${d.event_title || ''}» · dal link d'invito`,
    };
    case 'guest_withdrawn': return { title: `${n.actor || 'Un ospite'} ha ritirato la risposta`, body: `«${d.event_title || ''}» · dal link d'invito` };
    case 'join_request': return { title: `${n.actor || 'Qualcuno'} chiede di entrare in «${d.group_name || ''}»`, body: d.message ? `“${String(d.message).slice(0, 80)}”` : 'Tocca per accettare o rifiutare' };
    case 'group_deleted': return { title: `${n.actor || 'Un amministratore'} ha eliminato il gruppo «${d.group_name || ''}»`, body: 'Liste, ricette ed eventi del gruppo non ci sono più' };
    case 'event': return { title: `${n.actor || 'Qualcuno'} ha creato l'evento ${d.event_title ? `"${d.event_title}"` : ''}`, body: [d.when_label, d.location].filter(Boolean).join(' · ') + ' · ci sei?' };
    case 'event_changed': return { title: `"${d.event_title || ''}" è cambiato`, body: [d.when_label, d.location].filter(Boolean).join(' · ') };
    case 'event_cancelled': return { title: `"${d.event_title || ''}" è stato annullato`, body: [d.when_label, n.actor && 'da ' + n.actor].filter(Boolean).join(' · ') };
    case 'event_due': return { title: `Domani: "${d.event_title || ''}"`, body: [d.when_label, d.location, d.ask && 'non hai ancora risposto'].filter(Boolean).join(' · ') };
    case 'due': return {
      title: d.when === 'late' ? `${what} è scaduta` : d.when === 'today' ? `${what} scade oggi` : `${what} scade domani`,
      body: d.list || '',
    };
  }
  return { title: what, body: d.list || '' };
}

function notificationOut(r, hh) {
  const n = {
    id: r.id, kind: r.kind, actor: r.actor, item_id: r.item_id || null, list_id: r.list_id || null,
    data: parseJson(r.data, {}), created_at: num(r.created_at), read: !!r.read_at,
  };
  return { ...n, ...describe(n), group: hh ? hh.name : undefined };
}

function loadWebPush() {
  try { return require('web-push'); } catch { return null; }
}

function createNotifier({ db, realtime, mailer, protect, env = process.env }) {
  const webpush = loadWebPush();
  const vapid = env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && webpush
    ? { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || env.APP_URL || 'mailto:noreply@example.com' }
    : null;
  const appUrl = (env.APP_URL || '').replace(/\/$/, '');

  // Link che apre la lista giusta, anche se sul telefono è attivo un altro gruppo.
  const openPath = (hid, listId, eventId) => `/#/go/${hid}${eventId ? '/e/' + eventId : listId ? '/' + listId : ''}`;

  // Avvisi non letti della persona in tutti i suoi gruppi (stesso account), per il numero sull'icona.
  async function unreadFor(m) {
    const row = m.account_id
      ? await db.get(`SELECT COUNT(*) AS n FROM notifications n JOIN members m ON m.id = n.member_id WHERE m.account_id = ? AND m.status = 'active' AND n.read_at IS NULL`, [m.account_id])
      : await db.get('SELECT COUNT(*) AS n FROM notifications WHERE member_id = ? AND read_at IS NULL', [m.id]);
    return Number(row.n) || 0;
  }

  async function sendPush(memberId, payload) {
    if (!vapid) return;
    const subs = await db.all('SELECT * FROM push_subscriptions WHERE member_id = ?', [memberId]);
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), {
          TTL: 24 * 3600, timeout: 5000, urgency: 'normal', vapidDetails: vapid,
        });
      } catch (e) {
        // Iscrizione scaduta o revocata dal browser: la togliamo.
        if (e.statusCode === 404 || e.statusCode === 410) await db.run('DELETE FROM push_subscriptions WHERE member_id = ? AND endpoint = ?', [memberId, s.endpoint]);
        else console.error('push non inviato:', e.statusCode || e.message);
      }
    }));
  }

  // Crea e consegna un avviso. `to`: riga del membro che lo riceve.
  // path: pagina da aprire toccando l'avviso, se diversa dalla lista o dall'evento (es. Membri).
  async function deliver(hh, to, { kind, actor = '', item = null, list = null, event = null, data = {}, path = '' }) {
    if (!to || to.status !== 'active') return;
    const r = {
      id: crypto.randomUUID(), household_id: hh.id, member_id: to.id, kind, actor,
      item_id: item ? item.id : null, list_id: list ? list.id : null,
      data: JSON.stringify({ item: item ? item.name : '', list: list ? list.name : '', ...(event ? { event: event.id, event_title: event.title } : {}), ...(path ? { path } : {}), ...data }), created_at: now(),
    };
    await db.run(`INSERT INTO notifications (id, household_id, member_id, kind, actor, item_id, list_id, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [r.id, r.household_id, r.member_id, kind, actor, r.item_id, r.list_id, r.data, r.created_at]);
    const n = notificationOut(r, hh);
    try { await realtime.broadcast(hh.id, [{ t: 'notify', to: to.id }]); } catch (e) { console.error('broadcast fallito', e); }
    const url = path ? `/#/go/${hh.id}/${path}` : openPath(hh.id, r.list_id, event && event.id);
    // Al massimo 20 avvisi per email al giorno per persona: oltre, restano nell'app e nelle notifiche.
    let mailOk = !!(EMAIL_KINDS[kind] && Number(to.notify_email) && to.email && to.account_id && mailer.enabled);
    if (mailOk && protect) { try { await protect.hit('notif-mail:' + to.id, 20, 864e5); } catch { mailOk = false; } }
    await Promise.all([
      sendPush(to.id, {
        title: n.title, body: [n.body, hh.name].filter(Boolean).join(' · '), url, tag: 'sporta-' + (r.item_id || (event && event.id) || r.id), id: r.id,
        badge: await unreadFor(to), // numero sull'icona dell'app: avvisi non letti di tutti i gruppi della persona
      }),
      mailOk
        ? mailer.send(EMAIL_KINDS[kind], to.email, {
          group: hh.name, alias: to.alias, actor, item: n.data.item, list: n.data.list, title: n.title, body: n.body,
          due: n.data.due_label || '', when: n.data.when || '', link: mailer.link(url),
          event: n.data.event_title || '', when_label: n.data.when_label || '', location: n.data.location || '', kind,
        })
        : null,
    ]);
  }

  const memberRow = (id) => (id ? db.get('SELECT * FROM members WHERE id = ?', [id]) : null);
  const dueData = (due) => (due ? { due, due_label: fmtDay(due) } : {});

  // Dopo una modifica a un articolo: assegnato a qualcuno, rifiutato, fatto.
  // ex/it: articolo prima e dopo; who: { id, name } di chi ha fatto la modifica.
  async function itemChanged(hh, list, ex, it, who) {
    try {
      const before = ex ? ex.assigned_to || null : null;
      if (it.assigned_to && it.assigned_to !== before && it.assigned_to !== who.id) {
        await deliver(hh, await memberRow(it.assigned_to), { kind: 'assigned', actor: who.name, item: it, list, data: dueData(it.due_date) });
      }
      // "Non posso": chi l'aveva ricevuta la toglie a sé; lo sa chi l'aveva assegnata.
      if (ex && before && !it.assigned_to && before === who.id && ex.assigned_by && ex.assigned_by !== who.id) {
        await deliver(hh, await memberRow(ex.assigned_by), { kind: 'declined', actor: who.name, item: it, list });
      }
      // Fatta da chi l'aveva ricevuta: lo sa chi l'aveva assegnata.
      if (ex && !ex.checked && it.checked && it.assigned_to && it.assigned_by && it.assigned_by !== who.id) {
        await deliver(hh, await memberRow(it.assigned_by), { kind: 'done', actor: who.name, item: it, list });
      }
    } catch (e) { console.error('avviso non creato', e); }
  }

  // Promemoria: cose assegnate e non fatte che scadono oggi o domani (o già scadute),
  // una volta per ogni data di scadenza.
  async function runReminders(t = now()) {
    const d0 = today(t), d1 = addDays(d0, 1);
    // Cose assegnate a qualcuno, oppure (nel gruppo personale) tutte: lì sono comunque della persona.
    const rows = await db.all(`SELECT i.*, l.name AS list_name, h.personal_of FROM items i JOIN lists l ON l.id = i.list_id JOIN households h ON h.id = i.household_id
      WHERE i.checked = 0 AND (i.assigned_to IS NOT NULL OR h.personal_of IS NOT NULL) AND i.due_date <> '' AND i.due_date <= ? AND i.reminded_due <> i.due_date`, [d1]);
    const hhs = new Map();
    let sent = 0;
    for (const r of rows) {
      if (!hhs.has(r.household_id)) hhs.set(r.household_id, await db.get('SELECT * FROM households WHERE id = ?', [r.household_id]));
      await db.run('UPDATE items SET reminded_due = ? WHERE id = ?', [r.due_date, r.id]);
      const when = r.due_date < d0 ? 'late' : r.due_date === d0 ? 'today' : 'tomorrow';
      const to = r.assigned_to ? await memberRow(r.assigned_to)
        : await db.get(`SELECT * FROM members WHERE household_id = ? AND account_id = ? AND status = 'active'`, [r.household_id, r.personal_of]);
      await deliver(hhs.get(r.household_id), to, {
        kind: 'due', item: { id: r.id, name: r.name }, list: { id: r.list_id, name: r.list_name }, data: { ...dueData(r.due_date), when },
      });
      sent++;
    }
    if (hooks.eventReminders) sent += await hooks.eventReminders(d1, { deliver, memberRow, hh: (id) => db.get('SELECT * FROM households WHERE id = ?', [id]) });
    await db.run('DELETE FROM notifications WHERE created_at < ?', [t - KEEP_DAYS * 864e5]);
    return { sent, today: d0 };
  }

  async function listFor(hh, memberId, limit = LIST_MAX) {
    const rows = await db.all('SELECT * FROM notifications WHERE member_id = ? ORDER BY created_at DESC LIMIT ?', [memberId, limit]);
    const unread = Number((await db.get('SELECT COUNT(*) AS n FROM notifications WHERE member_id = ? AND read_at IS NULL', [memberId])).n);
    return { items: rows.map((r) => notificationOut(r, hh)), unread };
  }

  // Endpoint con autenticazione: avvisi e iscrizioni push della persona.
  async function route(ctx, m, parts, b) {
    const [kind, action] = parts;
    if (kind !== 'notifications' && kind !== 'push') return null;
    if (!ctx.me) throw new HttpError(400, 'Aggiorna l\'app per ricevere gli avvisi', 'legacy');
    if (kind === 'notifications' && !action && m === 'GET') return { status: 200, body: await listFor(ctx.hh, ctx.me.id) };
    if (kind === 'notifications' && action === 'read' && m === 'POST') {
      const ids = Array.isArray(b.ids) ? b.ids.filter((x) => ID_RE.test(String(x))).slice(0, 200) : [];
      if (b.all) await db.run('UPDATE notifications SET read_at = ? WHERE member_id = ? AND read_at IS NULL', [now(), ctx.me.id]);
      for (const id of ids) await db.run('UPDATE notifications SET read_at = ? WHERE id = ? AND member_id = ? AND read_at IS NULL', [now(), id, ctx.me.id]);
      return { status: 200, body: { ok: true } };
    }
    if (kind === 'push' && (action === 'subscribe' || action === 'unsubscribe') && m === 'POST') {
      const endpoint = str(b.endpoint, 1000);
      if (!/^https:\/\//.test(endpoint)) throw new HttpError(400, 'Iscrizione non valida', 'bad_subscription');
      if (action === 'unsubscribe') {
        await db.run('DELETE FROM push_subscriptions WHERE member_id = ? AND endpoint = ?', [ctx.me.id, endpoint]);
        return { status: 200, body: { ok: true } };
      }
      if (!vapid) throw new HttpError(501, 'Le notifiche push non sono attive su questo server', 'no_push');
      const keys = b.keys || {};
      const p256dh = str(keys.p256dh, 200), auth = str(keys.auth, 100);
      if (!p256dh || !auth) throw new HttpError(400, 'Iscrizione non valida', 'bad_subscription');
      await db.run('DELETE FROM push_subscriptions WHERE member_id = ? AND endpoint = ?', [ctx.me.id, endpoint]);
      await db.run('INSERT INTO push_subscriptions (member_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)', [ctx.me.id, endpoint, p256dh, auth, now()]);
      return { status: 201, body: { ok: true } };
    }
    if (kind === 'push' && action === 'test' && m === 'POST') {
      await sendPush(ctx.me.id, { title: 'Notifiche attive', body: `Riceverai qui gli avvisi di ${ctx.hh.name}`, url: openPath(ctx.hh.id), tag: 'sporta-test' });
      return { status: 200, body: { ok: true } };
    }
    return null;
  }

  // Altri moduli (eventi) aggiungono i loro promemoria.
  const hooks = {};
  return { itemChanged, runReminders, listFor, route, deliver, memberRow, hooks, publicKey: vapid ? vapid.publicKey : null, appUrl };
}

module.exports = { createNotifier, NOTIFY_SCHEMA, NOTIFY_MIGRATIONS, today, addDays, describe, fmtDay };
