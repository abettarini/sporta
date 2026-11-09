'use strict';
/* Sporta — panoramica di tutti i gruppi (cose da fare per me, da comprare, tutte le liste),
   avvisi (assegnazioni, "non posso", cose fatte, scadenze) e notifiche push.

   Il gruppo attivo è sempre aggiornato in tempo reale (st.*); per gli altri gruppi teniamo
   un riepilogo (POST /api/overview, una richiesta per tutti) salvato sul telefono e
   riletto quando serve. Le modifiche fatte da qui agli altri gruppi passano dalla stessa
   coda offline, con l'operazione legata al suo gruppo. */

const ov = { data: ls.json('overview', {}), at: 0, busy: false, timer: null };
const OV_POLL_MS = 45000;

// Gruppi da mostrare nella panoramica, con i dati nel formato comune.
function ovGroups() {
  return orderedGroups().filter((g) => g.status !== 'pending').map((g) => {
    const cur = g.code === st.code && st.household;
    const o = ov.data[g.code] || {};
    if (cur) {
      const lists = sortedLists().map((l) => ({ ...l, counts: { todo: todoOf(l.id).length, done: doneOf(l.id).length } }));
      return {
        code: g.code, hid: st.household.id || g.hid, name: groupName(), current: true, personal: isPersonal(g.code), me: st.me ? st.me.id : g.memberId,
        lists, items: [...st.items.values()].filter((i) => !i.checked), members: activeMembers(), inbox: o.inbox || { unread: 0, items: [] },
        events: [...st.events.values()],
      };
    }
    // Altri gruppi: riepilogo salvato + le nostre modifiche ancora in coda.
    const items = new Map((o.items || []).map((i) => [i.id, i]));
    for (const op of st.outbox) {
      if (op.g !== g.code) continue;
      if (op.k === 'item.put' && items.has(op.id)) {
        const it = { ...items.get(op.id), ...op.data };
        if (it.checked) items.delete(op.id); else items.set(op.id, it);
      } else if (op.k === 'item.del') items.delete(op.id);
    }
    return {
      code: g.code, hid: g.hid, name: g.name, current: false, personal: !!g.personal, me: (o.me && o.me.id) || g.memberId,
      lists: (o.lists || []).slice().sort((a, b) => a.position - b.position || a.created_at - b.created_at),
      items: [...items.values()], members: o.members || [], inbox: o.inbox || { unread: 0, items: [] }, stale: !o.lists,
      events: (o.events || []).map((e) => {
        // Le nostre risposte ancora in coda.
        const op = st.outbox.filter((x) => x.g === g.code && x.k === 'event.rsvp' && x.id === e.id).pop();
        const me = (o.me && o.me.id) || g.memberId;
        return op && me ? { ...e, participants: e.participants.filter((p) => p.member_id !== me).concat({ member_id: me, rsvp: op.data.rsvp, guests: op.data.guests || 0 }) } : e;
      }),
    };
  });
}

const unreadTotal = () => st.groups.reduce((n, g) => n + (((ov.data[g.code] || {}).inbox || {}).unread || 0), 0);

// Rilegge il riepilogo di tutti i gruppi (al massimo ogni 5 secondi, salvo force).
async function refreshOverview(force = false) {
  const groups = st.groups.filter((g) => g.token && g.status !== 'pending');
  if (!groups.length || ov.busy || (!force && Date.now() - ov.at < 5000) || !navigator.onLine) return;
  ov.busy = true;
  try {
    const r = await fetch('/api/overview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens: groups.map((g) => g.token) }) });
    if (!r.ok) return;
    const j = await r.json();
    ov.at = Date.now();
    let changed = false;
    j.groups.forEach((res, k) => {
      const g = groups[k];
      if (!groupOf(g.code)) return;
      if (!res.ok) {
        if (['removed', 'rejected', 'legacy_expired'].includes(res.code)) setTimeout(() => unauthorized(g.code, res.code), 0);
        return;
      }
      const prev = ov.data[g.code] && ov.data[g.code].inbox;
      ov.data[g.code] = { ...res, at: ov.at };
      if (res.household.name !== g.name || res.me.id !== g.memberId) { g.name = res.household.name; g.memberId = res.me.id; changed = true; }
      // Avviso arrivato per un altro gruppo (quello attivo lo segnala lo stream).
      if (prev && res.inbox.unread > prev.unread && g.code !== st.code) newNotice(g, res.inbox.items.find((n) => !n.read));
    });
    for (const code of Object.keys(ov.data)) if (!groupOf(code)) delete ov.data[code];
    if (changed) saveGroups();
    ls.setJson('overview', ov.data);
    if (view === Views.home || view === Views.notifs) render(); else updateStatus();
  } catch { /* offline */ } finally { ov.busy = false; }
}

// Nuovo avviso mentre l'app è aperta: un messaggio con il link (una volta per avviso).
const noticed = new Set(ls.json('noticed', []));
function newNotice(g, n) {
  if (!n || noticed.has(n.id) || document.visibilityState !== 'visible') return;
  noticed.add(n.id);
  ls.setJson('noticed', [...noticed].slice(-50));
  toast(n.title, { label: 'Apri', run: () => openNotification(g.code, n) });
}

// Avviso per me nel gruppo attivo (segnale "notify" dello stream).
async function onNotifySignal() {
  await refreshOverview(true);
  const g = groupOf(st.code);
  const o = ov.data[st.code];
  if (g && o) newNotice(g, o.inbox.items.find((n) => !n.read));
}

function startOverviewPolling() {
  clearInterval(ov.timer);
  ov.timer = setInterval(() => {
    if (document.visibilityState === 'visible' && (view === Views.home || view === Views.notifs)) refreshOverview();
  }, OV_POLL_MS);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshOverview(); });
window.addEventListener('online', () => refreshOverview(true));

// Modifica a un articolo di qualunque gruppo (dal gruppo attivo passa per la via normale).
function enqueueIn(code, op) {
  if (code === st.code) return enqueue(op);
  op.g = code;
  op.by = memberFor(code);
  op.at = Date.now();
  st.outbox.push(op);
  saveOutbox();
  render();
  flush().then(() => setTimeout(() => refreshOverview(true), 600));
}

// Apre una lista (o un articolo) di qualunque gruppo: #/go/<id gruppo>/<lista>/<articolo>.
Views.go = {
  mount() {
    const { hid, list, item, event } = this.route;
    const g = st.groups.find((x) => x.hid === hid);
    if (!g) { toast('Non fai più parte di questo gruppo'); history.replaceState(null, '', '#/'); return mount(); }
    if (item) {
      flashIds.add(item);
      // Aperto da una notifica: gli avvisi su questo articolo sono letti.
      const o = ov.data[g.code];
      const ids = o && o.inbox ? o.inbox.items.filter((n) => !n.read && n.item_id === item).map((n) => n.id) : [];
      if (ids.length) markRead(g.code, ids);
    }
    // Prima si passa al gruppo (la vista si ricarica con il gruppo attivo), poi alla lista.
    if (g.code !== st.code) return switchGroup(g.code, location.hash);
    if (event) {
      const o = ov.data[g.code];
      const ids = o && o.inbox ? o.inbox.items.filter((n) => !n.read && n.data && n.data.event === event).map((n) => n.id) : [];
      if (ids.length) markRead(g.code, ids);
    }
    const go = () => {
      if (event) {
        if (!st.events.has(event)) { toast('Questo evento non c\'è più'); history.replaceState(null, '', '#/e'); }
        else history.replaceState(null, '', '#/e/' + event);
      } else if (list && !st.lists.has(list)) { toast('Questa lista non c\'è più'); history.replaceState(null, '', '#/l'); }
      else history.replaceState(null, '', list ? '#/l/' + list : '#/l');
      mount();
    };
    if (event ? st.events.has(event) : !list || st.lists.has(list)) return go();
    // La lista non è ancora nella copia locale del gruppo: la aspettiamo dal server.
    app.innerHTML = topBar('Apro la lista…', { back: '#/' }) + `<main><div class="empty">Caricamento…</div></main>`;
    const route = this.route;
    loadState().finally(() => { if (view === Views.go && this.route === route) go(); });
  },
};
const goHref = (grp, listId, itemId) => `#/go/${grp.hid}${listId ? '/' + listId : ''}${itemId ? '/' + itemId : ''}`;
const goEvent = (grp, eventId) => `#/go/${grp.hid}/e/${eventId}`;

function openNotification(code, n) {
  const g = groupOf(code); if (!g) return;
  if (!n.read) markRead(code, [n.id]);
  location.hash = n.data && n.data.event ? goEvent(g, n.data.event) : goHref(g, n.list_id, n.item_id);
}
async function markRead(code, ids) {
  const o = ov.data[code];
  if (o && o.inbox) {
    for (const n of o.inbox.items) if (!ids || ids.includes(n.id)) n.read = true;
    o.inbox.unread = ids ? o.inbox.items.filter((n) => !n.read).length : 0;
    ls.setJson('overview', ov.data);
    render();
  }
  try { await api('POST', '/api/notifications/read', ids ? { ids } : { all: true }, code); } catch { /* riproveremo alla prossima lettura */ }
}

// --------------------------------------------------------------- panoramica
const SHOP_PREVIEW = 6;

function ovDueRank(i) {
  const d = S.fmtDue(i.due_date);
  return i.due_date ? (d.state === 'late' ? 0 : 1) : 2;
}

function ovItemRow(grp, list, i, { many, who }) {
  const q = S.fmtQty(i.qty, i.unit);
  const meta = [many && h(grp.name), list && h(list.name), who && h(who)].filter(Boolean).join(' · ');
  return `<li class="ov-item ${i.priority > 0 ? 'prio-high' : ''}" data-g="${h(grp.code)}" data-id="${i.id}">
    <button class="check-btn" data-act="check" aria-label="Fatto"><span class="check">${I.check}</span></button>
    <a class="txt" href="${goHref(grp, list && list.id, i.id)}"><span class="name">${h(i.name)}${q ? `<span class="qty">${h(q)}</span>` : ''}</span>${meta ? `<span class="meta">${meta}</span>` : ''}</a>
    ${dueChip(i.due_date)}</li>`;
}

function ovListSub(grp, l) {
  if (grp.current) return listSummary(l);
  const c = l.counts || { todo: 0, done: 0 };
  const type = typeOf(l);
  if (type === 'spesa') return { sub: c.todo ? `${c.todo} da prendere` : 'Tutto preso', badge: c.todo };
  if (type === 'todo') {
    const late = grp.items.filter((i) => i.list_id === l.id && S.fmtDue(i.due_date).state === 'late').length;
    return { sub: (c.todo ? `${c.todo} da fare` : 'Tutto fatto') + (late ? ` · ${late} ${late === 1 ? 'scaduta' : 'scadute'}` : ''), badge: c.todo, late: !!late };
  }
  const n = c.todo + c.done;
  return { sub: n ? `${n} ${n === 1 ? 'elemento' : 'elementi'}` : 'Vuota', badge: 0 };
}

Views.home = {
  mount() {
    app.innerHTML = topBar('Panoramica', {
      right: `<a class="icon-btn bell" href="#/n" aria-label="Avvisi">${I.bell}<i class="tab-badge" data-nbadge hidden></i></a>`,
    }) + `<main class="overview"><div id="ov"></div></main>` + tabBar('home');
    $('#ov').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act="check"]');
      if (b) {
        const li = b.closest('[data-id]');
        li.classList.add('leaving');
        vibrate(15);
        setTimeout(() => enqueueIn(li.dataset.g, { k: 'item.put', id: li.dataset.id, data: { checked: true } }), 180);
        return;
      }
      const more = e.target.closest('[data-more]');
      if (more) { this.open.add(more.dataset.more); this.update(); return; }
      const gs = e.target.closest('[data-gswitch]');
      if (gs) switchGroup(gs.dataset.gswitch, '#/l');
      const nl = e.target.closest('[data-newlist]');
      if (nl) listSheet();
    });
    this.open = this.open || new Set();
    refreshOverview();
    startOverviewPolling();
    this.update();
  },
  update() {
    const groups = ovGroups();
    const many = groups.length > 1;
    const memberName = (grp, id) => { const m = grp.members.find((x) => x.id === id); return m ? m.alias : ''; };
    const listOf = (grp, id) => grp.lists.find((l) => l.id === id);

    // Da fare per me (in tutti i gruppi) + in scadenza senza nessuno.
    const mine = [], free = [];
    const soon = S.ymd(S.addDays(new Date(), 2));
    for (const grp of groups) {
      for (const i of grp.items) {
        const l = listOf(grp, i.list_id);
        if (!l || typeOf(l) !== 'todo') continue;
        // Nel gruppo personale tutto ciò che c'è da fare è tuo.
        if (grp.me && (i.assigned_to === grp.me || (grp.personal && !i.assigned_to))) mine.push({ grp, l, i });
        else if (!i.assigned_to && i.due_date && i.due_date <= soon) free.push({ grp, l, i });
      }
    }
    const byDue = (a, b) => ovDueRank(a.i) - ovDueRank(b.i) || String(a.i.due_date).localeCompare(String(b.i.due_date)) || b.i.priority - a.i.priority || a.i.created_at - b.i.created_at;
    mine.sort(byDue); free.sort(byDue);
    const todoHtml = `<section class="ov-sec"><div class="section-h"><span>Da fare per me</span>${mine.length ? `<span>${mine.length}</span>` : ''}</div>
      ${mine.length ? `<ul class="ov-items card">${mine.map(({ grp, l, i }) => ovItemRow(grp, l, i, { many, who: i.assigned_by && i.assigned_by !== grp.me ? 'da ' + memberName(grp, i.assigned_by) : '' })).join('')}</ul>`
        : `<div class="card pad ov-empty">${icon('todo')}<span>Niente da fare per te. Nelle liste <b>Da fare</b> scrivi <b>@nome</b> per assegnare qualcosa.</span></div>`}
      ${free.length ? `<div class="section-h sub"><span>In scadenza, senza nessuno</span></div>
        <ul class="ov-items card">${free.map(({ grp, l, i }) => ovItemRow(grp, l, i, { many })).join('')}</ul>` : ''}</section>`;

    // Da comprare: liste della spesa con qualcosa da prendere.
    const shops = [];
    for (const grp of groups) {
      for (const l of grp.lists) {
        if (typeOf(l) !== 'spesa') continue;
        const its = grp.items.filter((i) => i.list_id === l.id).sort((a, b) => a.position - b.position || b.created_at - a.created_at);
        if (its.length) shops.push({ grp, l, its });
      }
    }
    const shopHtml = `<section class="ov-sec"><div class="section-h"><span>Da comprare</span></div>
      ${shops.length ? shops.map(({ grp, l, its }) => {
        const key = grp.code + ':' + l.id;
        const show = this.open.has(key) ? its : its.slice(0, SHOP_PREVIEW);
        return `<div class="card ov-shop">
          <a class="ov-shop-h" href="${goHref(grp, l.id)}">${listTile(l, 'sm')}<span class="t"><b>${h(l.name)}</b>${many ? `<small>${h(grp.name)}</small>` : ''}</span><span class="badge">${its.length}</span><span class="chev">›</span></a>
          <ul class="ov-items">${show.map((i) => ovItemRow(grp, null, i, { many: false })).join('')}</ul>
          ${its.length > show.length ? `<button class="btn ghost block sm" data-more="${h(key)}">Mostra altri ${its.length - show.length}</button>` : ''}
        </div>`;
      }).join('') : `<div class="card pad ov-empty">${icon('cart')}<span>Non c'è niente da comprare.</span></div>`}</section>`;

    // Tutte le liste, gruppo per gruppo.
    const listsHtml = `<section class="ov-sec"><div class="section-h"><span>${many ? 'Le liste dei tuoi gruppi' : 'Le tue liste'}</span></div>
      ${groups.map((grp) => `<div class="ov-group">
        ${many ? `<button class="ov-group-h" data-gswitch="${h(grp.code)}">${groupBadge(grp)}<b>${h(grp.name)}</b>${grp.current ? '<small>attuale</small>' : ''}<span class="chev">›</span></button>` : ''}
        <div class="list-cards compact">${grp.lists.length ? grp.lists.map((l) => {
          const sm = ovListSub(grp, l);
          return `<a class="card list-card lc" href="${goHref(grp, l.id)}">${listTile(l, 'sm')}<span class="t"><b>${h(l.name)}</b><span class="${sm.late ? 'late' : ''}">${h(sm.sub)}</span></span>${sm.badge ? `<span class="badge">${sm.badge}</span>` : ''}</a>`;
        }).join('') : `<p class="muted small">${grp.stale ? 'Caricamento…' : 'Nessuna lista'}</p>`}</div>
      </div>`).join('')}
      <button class="btn ghost block" data-newlist>${I.plus} Nuova lista${many ? ' in ' + h(groupName()) : ''}</button></section>`;

    // Prossimi eventi di tutti i gruppi (le prossime 5 settimane, al massimo 6).
    const limit = S.ymd(S.addDays(new Date(), 35));
    const evs = groups.flatMap((grp) => upcomingEvents(grp.events || []).filter((e) => e.date <= limit).map((e) => ({ grp, e })))
      .sort((a, b) => a.e.date.localeCompare(b.e.date) || (a.e.time || '99').localeCompare(b.e.time || '99')).slice(0, 6);
    const evHtml = evs.length ? `<section class="ov-sec"><div class="section-h"><span>Prossimi eventi</span></div>
      <div class="list-cards">${evs.map(({ grp, e }) => eventCard(e, { href: goEvent(grp, e.id), meId: grp.me, members: grp.members, group: many ? grp.name : '' })).join('')}</div></section>` : '';
    $('#ov').innerHTML = `<div class="ov-col">${todoHtml}${shopHtml}</div><div class="ov-col">${evHtml}${listsHtml}</div>`;
  },
};

// --------------------------------------------------------------- avvisi
const NOTIF_ICON = { assigned: 'todo', declined: 'persona', done: 'todo', due: 'clock' };
const timeAgo = (t) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'ora';
  if (s < 3600) return `${Math.floor(s / 60)} min fa`;
  if (s < 86400) return `${Math.floor(s / 3600)} h fa`;
  if (s < 7 * 86400) return fmtDate(t, { weekday: 'long' });
  return fmtDate(t, { day: 'numeric', month: 'short' });
};

Views.notifs = {
  mount() {
    app.innerHTML = topBar('Avvisi', { back: '#/', right: `<button class="btn ghost sm" id="nall">Segna tutti come letti</button>` })
      + `<main class="wide"><div id="nl"></div><div id="push-hint"></div></main>` + tabBar('home');
    $('#nall').onclick = () => { for (const g of st.groups) if (((ov.data[g.code] || {}).inbox || {}).unread) markRead(g.code, null); };
    $('#nl').onclick = (e) => {
      const a = e.target.closest('[data-n]'); if (!a) return;
      e.preventDefault();
      const o = ov.data[a.dataset.g]; const n = o && o.inbox.items.find((x) => x.id === a.dataset.n);
      if (n) openNotification(a.dataset.g, n);
    };
    refreshOverview(true);
    startOverviewPolling();
    this.update();
  },
  update() {
    const all = [];
    for (const g of st.groups) for (const n of (((ov.data[g.code] || {}).inbox || {}).items || [])) all.push({ g, n });
    all.sort((a, b) => b.n.created_at - a.n.created_at);
    const many = st.groups.length > 1;
    $('#nall').hidden = !unreadTotal();
    $('#nl').innerHTML = all.length ? `<ul class="notifs card">${all.map(({ g, n }) => `<li class="${n.read ? '' : 'unread'}">
        <a href="#" data-n="${h(n.id)}" data-g="${h(g.code)}">${iconTile(NOTIF_ICON[n.kind] || 'note', 'sm')}
          <span class="t"><b>${h(n.title)}</b><span>${[n.body, many && g.name, timeAgo(n.created_at)].filter(Boolean).map(h).join(' · ')}</span></span></a></li>`).join('')}</ul>`
      : `<div class="empty">${emptyArt('todo')}Nessun avviso.<br>Qui trovi le cose che ti assegnano, chi non può occuparsene, le cose fatte e le scadenze.</div>`;
    const ph = $('#push-hint');
    if (ph) ph.innerHTML = pushSupported() && !pushOn() && serverConfig.push
      ? `<a class="card link-card" href="#/s">${iconTile('clock')}<span class="t"><b>Attiva le notifiche</b><span>Ricevi gli avvisi anche ad app chiusa</span></span><span class="chev">›</span></a>` : '';
  },
};

// --------------------------------------------------------------- notifiche push
// Una sola iscrizione per dispositivo, registrata in ogni gruppo (per la persona di quel gruppo).
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const pushOn = () => pushSupported() && ls.get('push') === '1' && Notification.permission === 'granted';
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;

function b64ToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function pushSubscription(create) {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const key = serverConfig.push;
  // Chiave del server cambiata: l'iscrizione vecchia non funziona più.
  if (sub && key && sub.options && sub.options.applicationServerKey) {
    const cur = new Uint8Array(sub.options.applicationServerKey);
    const want = b64ToBytes(key);
    if (cur.length !== want.length || cur.some((x, k) => x !== want[k])) { await sub.unsubscribe().catch(() => {}); sub = null; }
  }
  if (!sub && create && key) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  return sub;
}

// Registra l'iscrizione in tutti i gruppi (o solo in quelli indicati).
async function syncPush(codes) {
  if (!pushOn() || !serverConfig.push) return;
  try {
    const sub = await pushSubscription(true);
    if (!sub) return;
    const body = sub.toJSON();
    const targets = st.groups.filter((g) => g.token && g.status !== 'pending' && (!codes || codes.includes(g.code)));
    await Promise.all(targets.map((g) => api('POST', '/api/push/subscribe', body, g.code).catch(() => {})));
  } catch { /* riproveremo al prossimo avvio */ }
}

async function enablePush() {
  if (!pushSupported()) throw new Error('Questo browser non supporta le notifiche');
  if (!serverConfig.push) throw new Error('Le notifiche non sono attive su questo server');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifiche bloccate: riattivale dalle impostazioni del browser' : 'Permesso non concesso');
  ls.set('push', '1');
  const sub = await pushSubscription(true);
  if (!sub) throw new Error('Non è stato possibile attivare le notifiche');
  const body = sub.toJSON();
  await Promise.all(st.groups.filter((g) => g.token && g.status !== 'pending').map((g) => api('POST', '/api/push/subscribe', body, g.code)));
}

async function disablePush() {
  ls.set('push', '0');
  try {
    const sub = await pushSubscription(false);
    if (!sub) return;
    const body = { endpoint: sub.endpoint };
    await Promise.all(st.groups.filter((g) => g.token).map((g) => api('POST', '/api/push/unsubscribe', body, g.code).catch(() => {})));
    await sub.unsubscribe();
  } catch { /* */ }
}

// Messaggi dal service worker: notifica arrivata (rileggo gli avvisi) o toccata (apro il link).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === 'PUSH') refreshOverview(true);
    if (d.type === 'OPEN' && d.url) {
      const u = new URL(d.url, location.origin);
      if (u.hash) location.hash = u.hash;
    }
  });
}

// Card "Avvisi" nelle impostazioni.
function notifyCardHtml() {
  const sup = pushSupported();
  let push;
  if (!serverConfig.push) push = '<p class="hint">Le notifiche push non sono attive su questo server.</p>';
  else if (!sup) push = `<p class="hint">${isIos() && !isStandalone() ? 'Su iPhone e iPad le notifiche funzionano con l\'app installata: aggiungila alla schermata Home e aprila da lì.' : 'Questo browser non supporta le notifiche.'}</p>`;
  else if (Notification.permission === 'denied') push = '<p class="hint">Le notifiche sono bloccate per questo sito: riattivale dalle impostazioni del browser.</p>';
  else push = `<label class="switch"><input type="checkbox" id="push-on" ${pushOn() ? 'checked' : ''}><span>Notifiche su questo dispositivo</span></label>
    <p class="hint">Per tutti i tuoi gruppi: cose assegnate a te, chi non può occuparsene, cose fatte e scadenze.</p>
    ${pushOn() ? '<button class="btn sm" id="push-test">Prova una notifica</button>' : ''}`;
  const email = st.me && st.me.email;
  const mail = serverConfig.email && st.me
    ? `<label class="switch"><input type="checkbox" id="mail-on" ${st.me.notify_email ? 'checked' : ''} ${email ? '' : 'disabled'}><span>Anche per email (in questo gruppo)</span></label>
      <p class="hint">${email ? `Assegnazioni e scadenze a ${h(email)}.` : 'Aggiungi la tua email qui sopra per riceverli.'}</p>` : '';
  return `<h3>Avvisi</h3>${push}${mail}`;
}
function bindNotifyCard(card, rerender) {
  const p = $('#push-on', card);
  if (p) p.onchange = async () => {
    p.disabled = true;
    try {
      if (p.checked) { await enablePush(); toast('Notifiche attive'); } else { await disablePush(); toast('Notifiche disattivate'); }
    } catch (x) { p.checked = !p.checked; ls.set('push', p.checked ? '1' : '0'); toast(x.message); }
    p.disabled = false;
    rerender();
  };
  const t = $('#push-test', card);
  if (t) t.onclick = async () => { try { await syncPush([st.code]); await api('POST', '/api/push/test', {}); toast('Notifica inviata'); } catch (x) { toast(x.message); } };
  const m = $('#mail-on', card);
  if (m) m.onchange = async () => {
    try { const j = await api('PATCH', '/api/me', { notify_email: m.checked }); st.me = { ...st.me, ...j.me }; toast(m.checked ? 'Riceverai gli avvisi anche per email' : 'Niente più avvisi per email'); }
    catch (x) { m.checked = !m.checked; toast(x.message); }
  };
}
