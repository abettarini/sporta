'use strict';
/* global Shared */
const S = window.Shared;

// =============================================================== utilità
const $ = (sel, el = document) => el.querySelector(sel);
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};
const ls = {
  get(k) { try { return localStorage.getItem('spesa.' + k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem('spesa.' + k) : localStorage.setItem('spesa.' + k, v); } catch { /* */ } },
  json(k, d) { try { return JSON.parse(this.get(k)) ?? d; } catch { return d; } },
  setJson(k, v) { this.set(k, JSON.stringify(v)); },
};
const vibrate = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* */ } };

const I = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.6l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.2l1.7-7.3H6.1"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};

// =============================================================== stato
const st = {
  code: ls.get('code'),
  member: ls.get('member') || '',
  household: null,
  lists: new Map(),
  items: new Map(),
  recipes: new Map(),
  history: [],
  outbox: ls.json('outbox', []),
  live: false,
};

function setState(j) {
  st.household = j.household;
  st.lists = new Map(j.lists.map((x) => [x.id, x]));
  st.items = new Map(j.items.map((x) => [x.id, x]));
  st.recipes = new Map(j.recipes.map((x) => [x.id, x]));
  st.history = j.history || [];
}

let cacheTimer = null;
function writeCache() {
  clearTimeout(cacheTimer);
  cacheTimer = null;
  if (!st.code) return;
  ls.setJson('cache', {
    household: st.household, lists: [...st.lists.values()], items: [...st.items.values()],
    recipes: [...st.recipes.values()], history: st.history,
  });
}
function saveCache() {
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(writeCache, 300);
}
// Quando l'app va in background salviamo subito (il telefono potrebbe chiuderla).
window.addEventListener('pagehide', () => { if (cacheTimer) writeCache(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && cacheTimer) writeCache(); });
const saveOutbox = () => ls.setJson('outbox', st.outbox);

const sortedLists = () => [...st.lists.values()].sort((a, b) => a.position - b.position || a.created_at - b.created_at);
const itemsOf = (listId) => [...st.items.values()].filter((i) => i.list_id === listId);
const todoOf = (listId) => itemsOf(listId).filter((i) => !i.checked).sort((a, b) => a.position - b.position || b.created_at - a.created_at);
const doneOf = (listId) => itemsOf(listId).filter((i) => i.checked).sort((a, b) => (b.checked_at || 0) - (a.checked_at || 0));

// =============================================================== operazioni + coda offline
// Ogni modifica è un'operazione: applicata subito in locale (ottimistica), poi
// messa in coda e inviata al server appena possibile. Funziona anche offline.
function applyLocal(op) {
  const t = Date.now();
  switch (op.k) {
    case 'list.put': {
      const ex = st.lists.get(op.id);
      st.lists.set(op.id, { ...(ex || { id: op.id, emoji: '🛒', position: t, created_at: t }), ...op.data, updated_at: t });
      break;
    }
    case 'list.del':
      st.lists.delete(op.id);
      for (const [id, it] of st.items) if (it.list_id === op.id) st.items.delete(id);
      break;
    case 'list.clear':
      for (const [id, it] of st.items) if (it.list_id === op.id && it.checked) st.items.delete(id);
      break;
    case 'item.put': {
      const ex = st.items.get(op.id);
      const it = {
        ...(ex || { id: op.id, qty: null, unit: '', brand: '', note: '', checked: false, checked_by: '',
          checked_at: null, created_by: st.member, created_at: t, position: -t }),
        ...op.data, updated_at: t,
      };
      if (op.data.checked !== undefined && (!ex || !!ex.checked !== !!op.data.checked)) {
        it.checked_at = op.data.checked ? t : null;
        it.checked_by = op.data.checked ? st.member : '';
      }
      st.items.set(op.id, it);
      break;
    }
    case 'item.del': st.items.delete(op.id); break;
    case 'recipe.put': {
      const ex = st.recipes.get(op.id);
      st.recipes.set(op.id, { ...(ex || { id: op.id, servings: 4, notes: '', ingredients: [], created_at: t }), ...op.data, updated_at: t });
      break;
    }
    case 'recipe.del': st.recipes.delete(op.id); break;
    case 'hh.put': st.household = { ...st.household, ...op.data }; break;
  }
}

function opRequest(op) {
  switch (op.k) {
    case 'list.put': return ['PUT', `/api/lists/${op.id}`, op.data];
    case 'list.del': return ['DELETE', `/api/lists/${op.id}`];
    case 'list.clear': return ['POST', `/api/lists/${op.id}/clear-checked`];
    case 'item.put': return ['PUT', `/api/items/${op.id}`, { ...op.data, by: st.member }];
    case 'item.del': return ['DELETE', `/api/items/${op.id}`];
    case 'recipe.put': return ['PUT', `/api/recipes/${op.id}`, op.data];
    case 'recipe.del': return ['DELETE', `/api/recipes/${op.id}`];
    case 'hh.put': return ['PATCH', '/api/household', op.data];
  }
}

function enqueue(op, { silent } = {}) {
  applyLocal(op);
  st.outbox.push(op);
  saveOutbox();
  saveCache();
  if (op.k === 'item.put' && op.data.name) rememberHistory(op.data);
  if (!silent) render();
  flush();
}

function rememberHistory(d) {
  const key = S.normName(d.name);
  const ex = st.history.find((x) => S.normName(x.name) === key);
  if (ex) { ex.count++; if (d.brand) ex.brand = d.brand; }
  else st.history.push({ name: d.name, unit: d.unit || '', brand: d.brand || '', count: 1 });
}

const isPending = (id) => st.outbox.some((o) => o.id === id);
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + st.code });

let flushing = false, retryTimer = null;
function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(flush, 4000);
}

async function flush() {
  if (flushing || !st.code || !st.outbox.length) { updateStatus(); return; }
  flushing = true;
  try {
    while (st.outbox.length) {
      const op = st.outbox[0];
      const [method, url, body] = opRequest(op);
      let res;
      try {
        res = await fetch(url, { method, headers: authHeaders(), body: body ? JSON.stringify(body) : undefined });
      } catch { scheduleRetry(); break; }
      if (res.status >= 500 || res.status === 429) { scheduleRetry(); break; }
      if (res.status === 401) { unauthorized(); break; }
      st.outbox.shift();
      saveOutbox();
      const j = await res.json().catch(() => null);
      if (res.ok) { if (j && j.events) applyEvents(j.events); }
      else { toast((j && j.error) || 'Operazione non riuscita'); loadState(); }
    }
  } finally {
    flushing = false;
    updateStatus();
  }
}

function applyEvents(evs) {
  for (const e of evs) {
    const id = e.id || (e.data && e.data.id);
    if (isPending(id)) continue; // c'è una nostra modifica più recente in coda
    if (e.t === 'household') { st.household = { ...st.household, ...e.data }; continue; }
    const map = { list: st.lists, item: st.items, recipe: st.recipes }[e.t];
    if (!map) continue;
    if (e.op === 'put') {
      const prev = map.get(id);
      map.set(id, e.data);
      if (e.t === 'item' && prev && !prev.checked && e.data.checked === false && prev.qty !== e.data.qty) flashIds.add(id);
      if (e.t === 'item' && !prev) flashIds.add(id);
    } else {
      map.delete(id);
      if (e.t === 'list') for (const [iid, it] of st.items) if (it.list_id === id) st.items.delete(iid);
    }
  }
  saveCache();
  render();
}

async function loadState() {
  try {
    const r = await fetch('/api/state', { headers: authHeaders() });
    if (r.status === 401) return unauthorized();
    if (!r.ok) return;
    setState(await r.json());
    for (const op of st.outbox) applyLocal(op);
    saveCache();
    render();
  } catch { /* offline: restiamo sulla cache */ }
}

function unauthorized() {
  toast('Codice famiglia non più valido');
  logout();
}

function logout() {
  if (rt) { rt.close(); rt = null; }
  for (const k of ['code', 'cache', 'outbox', 'lastList']) ls.set(k, null);
  st.code = null; st.outbox = []; st.household = null;
  st.lists.clear(); st.items.clear(); st.recipes.clear(); st.history = [];
  location.hash = '#/';
  mount();
}

// =============================================================== tempo reale
// Tre modalità, scelte dal server (/api/config):
//  - "sse": server Node sempre acceso (self-hosted)
//  - "supabase": Supabase Realtime Broadcast (deploy serverless, es. Vercel)
//  - "poll": nessun push disponibile, aggiornamento periodico
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
let rt = null; // { type, close(), isOpen() }
let rtRetry = null;

async function rtConfig() {
  try {
    const r = await fetch('/api/config', { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); ls.setJson('rtconfig', j.realtime); return j.realtime; }
  } catch { /* offline */ }
  return ls.json('rtconfig', { type: 'sse' });
}

let sbLoad = null;
function loadSupabase() {
  if (window.supabase) return Promise.resolve(window.supabase);
  return (sbLoad ||= new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = SUPABASE_JS;
    sc.async = true;
    sc.crossOrigin = 'anonymous';
    sc.onload = () => resolve(window.supabase);
    sc.onerror = () => { sbLoad = null; reject(new Error('supabase-js non caricato')); };
    document.head.appendChild(sc);
  }));
}

function onLive() { st.live = true; updateStatus(); loadState(); flush(); }
function onDown(retry) {
  st.live = false; updateStatus();
  if (retry) { clearTimeout(rtRetry); rtRetry = setTimeout(connect, 5000); }
}

function connectSse() {
  const es = new EventSource('/api/events?k=' + encodeURIComponent(st.code));
  es.addEventListener('hello', onLive);
  es.onmessage = (e) => { try { applyEvents(JSON.parse(e.data)); } catch { /* */ } };
  es.onerror = () => onDown(es.readyState === EventSource.CLOSED);
  return { type: 'sse', close: () => es.close(), isOpen: () => es.readyState === EventSource.OPEN };
}

let sbClient = null;
async function connectSupabase(cfg) {
  if (!st.household || !st.household.id) await loadState();
  if (!st.household || !st.household.id) throw new Error('famiglia non caricata');
  const lib = await loadSupabase();
  sbClient ||= lib.createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
  let open = false;
  const ch = sbClient.channel('hh-' + st.household.id, { config: { broadcast: { self: false } } });
  ch.on('broadcast', { event: 'ev' }, (m) => { if (m.payload && m.payload.events) applyEvents(m.payload.events); });
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') { open = true; onLive(); }
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { open = false; onDown(false); }
  });
  // Finché il canale non è attivo ci aggiorniamo a intervalli.
  const timer = setInterval(() => { if (!open && document.visibilityState === 'visible' && navigator.onLine) loadState(); }, 10000);
  return { type: 'supabase', close: () => { clearInterval(timer); sbClient.removeChannel(ch); }, isOpen: () => open };
}

function connectPoll() {
  const tick = () => { if (document.visibilityState === 'visible' && navigator.onLine) loadState(); };
  const timer = setInterval(tick, 5000);
  if (navigator.onLine) onLive();
  return { type: 'poll', close: () => clearInterval(timer), isOpen: () => navigator.onLine };
}

let connecting = false;
async function connect() {
  if (!st.code || connecting) return;
  connecting = true;
  clearTimeout(rtRetry);
  try {
    if (rt) { rt.close(); rt = null; }
    const cfg = await rtConfig();
    if (cfg.type === 'supabase') {
      try { rt = await connectSupabase(cfg); }
      catch { rt = connectPoll(); rtRetry = setTimeout(connect, 15000); } // ripiego finché Supabase non risponde
    } else if (cfg.type === 'poll') rt = connectPoll();
    else rt = connectSse();
  } finally { connecting = false; }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !st.code) return;
  // I telefoni chiudono le connessioni in background: al ritorno ci riallineiamo.
  if (!rt || !rt.isOpen()) connect(); else loadState();
  flush();
});
window.addEventListener('online', () => { connect(); flush(); });
window.addEventListener('offline', () => { st.live = false; updateStatus(); });

function updateStatus() {
  const dot = $('#status'), pend = $('#pending');
  if (!dot) return;
  dot.className = 'status ' + (st.live ? 'live' : 'off');
  dot.title = st.live ? 'Sincronizzato in tempo reale' : 'Non connesso: le modifiche verranno inviate appena possibile';
  if (pend) pend.textContent = st.outbox.length ? `${st.outbox.length} in attesa` : '';
}

// =============================================================== UI di base
let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${h(msg)}</span>` + (action ? `<button type="button">${h(action.label)}</button>` : '');
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); action.run(); };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2500);
}

let sheetOpen = null;
function openSheet(html, onMount) {
  closeSheet(true);
  const root = $('#sheet-root');
  root.innerHTML = `<div class="backdrop"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  const sheet = root.querySelector('.sheet');
  root.querySelector('.backdrop').onclick = () => closeSheet();
  history.pushState({ sheet: true }, '');
  sheetOpen = true;
  if (onMount) onMount(sheet);
  return sheet;
}
function closeSheet(silent) {
  if (!sheetOpen) return;
  sheetOpen = null;
  $('#sheet-root').innerHTML = '';
  if (!silent && history.state && history.state.sheet) history.back();
  render();
}
window.addEventListener('popstate', () => {
  if (sheetOpen) { sheetOpen = null; $('#sheet-root').innerHTML = ''; render(); }
});

function topBar(title, { back, right = '' } = {}) {
  return `<header class="top">
    ${back ? `<a class="icon-btn" href="${back}" aria-label="Indietro">${I.back}</a>` : ''}
    <h1>${title}</h1>
    <span id="pending" class="pending"></span><span id="status" class="status"></span>
    ${right}
  </header>`;
}

function tabBar(active) {
  const t = (id, href, icon, label) => `<a href="${href}" class="${active === id ? 'on' : ''}">${icon}<span>${label}</span></a>`;
  return `<nav class="tabs">${t('lists', '#/', I.cart, 'Liste')}${t('recipes', '#/r', I.book, 'Ricette')}${t('settings', '#/s', I.gear, 'Impostazioni')}</nav>`;
}

// =============================================================== drag & drop
// Riordino con pointer events: funziona con dito e mouse, tramite la maniglia.
let dragging = false, renderQueued = false;

function sortable(container, { itemSel, handleSel, onEnd }) {
  container.addEventListener('contextmenu', (e) => { if (e.target.closest(handleSel)) e.preventDefault(); });
  container.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest(handleSel);
    if (!handle || !container.contains(handle) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const el = handle.closest(itemSel);
    const items = [...container.children].filter((c) => c.matches(itemSel));
    const from = items.indexOf(el);
    if (from < 0 || items.length < 2) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const rects = items.map((i) => i.getBoundingClientRect());
    const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0;
    const shift = rects[from].height + gap;
    const startY = e.clientY, scroll0 = window.scrollY;
    let lastY = e.clientY, to = from, raf = 0;
    dragging = true;
    container.classList.add('sorting');
    el.classList.add('dragging');
    vibrate(15);

    const update = () => {
      const dy = lastY - startY + (window.scrollY - scroll0);
      el.style.transform = `translateY(${dy}px)`;
      const center = rects[from].top + rects[from].height / 2 + dy;
      let n = 0;
      for (let i = 0; i < items.length; i++) {
        if (i !== from && rects[i].top + rects[i].height / 2 < center) n++;
      }
      to = n;
      items.forEach((it, i) => {
        if (i === from) return;
        let s = 0;
        if (from < to && i > from && i <= to) s = -shift;
        else if (from > to && i >= to && i < from) s = shift;
        it.style.transform = s ? `translateY(${s}px)` : '';
      });
    };
    const tick = () => {
      const edge = 90;
      if (lastY < edge) window.scrollBy(0, -Math.ceil((edge - lastY) / 6));
      else if (lastY > innerHeight - edge - 70) window.scrollBy(0, Math.ceil((lastY - (innerHeight - edge - 70)) / 6));
      update();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const move = (ev) => { lastY = ev.clientY; };
    const end = () => {
      cancelAnimationFrame(raf);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      container.classList.remove('sorting');
      el.classList.remove('dragging');
      items.forEach((it) => { it.style.transform = ''; });
      dragging = false;
      if (to !== from) {
        const ids = items.map((i) => i.dataset.id);
        ids.splice(from, 1);
        ids.splice(to, 0, el.dataset.id);
        onEnd(el.dataset.id, ids);
      }
      render();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });
}

// Calcola la nuova posizione dell'elemento spostato tra i vicini; se lo spazio
// numerico è esaurito rinumera tutto l'ordine.
function reposition(ids, movedId, getPos, put) {
  const i = ids.indexOf(movedId);
  const p = i > 0 ? getPos(ids[i - 1]) : null;
  const n = i < ids.length - 1 ? getPos(ids[i + 1]) : null;
  let pos;
  if (p != null && n != null) pos = n - p > 1e-6 ? (p + n) / 2 : null;
  else if (p != null) pos = p + 1;
  else if (n != null) pos = n - 1;
  else pos = 0;
  if (pos != null) put(movedId, pos);
  else ids.forEach((id, k) => put(id, k));
}

// =============================================================== router / viste
let view = null;
const app = $('#app');

function parseRoute() {
  const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (p[0] === 'l' && p[1]) return { name: 'list', id: p[1] };
  if (p[0] === 'r' && p[1] && p[2] === 'edit') return { name: 'recipeEdit', id: p[1] };
  if (p[0] === 'r' && p[1]) return { name: 'recipe', id: p[1] };
  if (p[0] === 'r') return { name: 'recipes' };
  if (p[0] === 's') return { name: 'settings' };
  return { name: 'home' };
}

function mount() {
  closeSheet(true);
  if (!st.code) { view = Welcome; }
  else {
    const r = parseRoute();
    view = { home: Home, list: ListView, recipes: Recipes, recipe: RecipeView, recipeEdit: RecipeEdit, settings: Settings }[r.name];
    view.route = r;
  }
  view.mount();
  updateStatus();
  window.scrollTo(0, 0);
}

function render() {
  if (dragging) { renderQueued = true; return; }
  renderQueued = false;
  if (view && view.update) view.update();
  updateStatus();
}

window.addEventListener('hashchange', mount);

// --------------------------------------------------------------- benvenuto
const Welcome = {
  mount() {
    const join = new URLSearchParams(location.search).get('join') || '';
    app.innerHTML = `<div class="welcome">
      <img class="logo" src="/icons/icon-192.png" alt="">
      <h1>Sporta</h1>
      <p>Condivisa con la famiglia, aggiornata in tempo reale, con le tue ricette.</p>
      <label class="field"><span>Il tuo nome</span>
        <input class="input" id="w-name" autocomplete="given-name" placeholder="es. Marco" value="${h(st.member)}"></label>
      <div class="card">
        <h3>Hai un codice d'invito?</h3>
        <form id="w-join">
          <input class="input" id="w-code" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" value="${h(join)}">
          <button class="btn primary block" style="margin-top:10px">Unisciti alla famiglia</button>
        </form>
      </div>
      <div class="card">
        <h3>…oppure inizia da zero</h3>
        <form id="w-new">
          <input class="input" id="w-fam" placeholder="Nome famiglia (es. Casa Rossi)">
          <button class="btn block" style="margin-top:10px">Crea una nuova famiglia</button>
        </form>
      </div>
      <p class="err" id="w-err"></p>
    </div>`;
    const err = (m) => { $('#w-err').textContent = m; };
    const saveName = () => {
      const n = $('#w-name').value.trim();
      if (!n) { err('Inserisci il tuo nome: serve per vedere chi ha aggiunto cosa.'); $('#w-name').focus(); return false; }
      st.member = n; ls.set('member', n); return true;
    };
    const enter = (j) => {
      st.code = j.household.code; ls.set('code', st.code);
      setState(j); saveCache();
      history.replaceState(null, '', '/#/');
      connect(); mount();
    };
    $('#w-join').onsubmit = async (e) => {
      e.preventDefault();
      if (!saveName()) return;
      const code = $('#w-code').value.trim().toUpperCase().replace(/\s+/g, '');
      if (!code) return err('Inserisci il codice d\'invito.');
      try {
        const r = await fetch('/api/state', { headers: { Authorization: 'Bearer ' + code } });
        if (!r.ok) return err(r.status === 401 ? 'Codice non valido.' : 'Errore, riprova.');
        enter(await r.json());
      } catch { err('Nessuna connessione.'); }
    };
    $('#w-new').onsubmit = async (e) => {
      e.preventDefault();
      if (!saveName()) return;
      try {
        const r = await fetch('/api/households', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('#w-fam').value.trim() || 'Famiglia' }) });
        if (!r.ok) return err('Errore, riprova.');
        enter(await r.json());
        toast('Famiglia creata! Invita gli altri da Impostazioni');
      } catch { err('Nessuna connessione.'); }
    };
  },
};

// --------------------------------------------------------------- home: liste
const Home = {
  mount() {
    app.innerHTML = topBar('Le mie liste', {
      right: `<button class="icon-btn" id="new-list" aria-label="Nuova lista">${I.plus}</button>`,
    }) + `<main><div class="list-cards" id="cards"></div></main>` + tabBar('lists');
    $('#new-list').onclick = () => listSheet();
    sortable($('#cards'), {
      itemSel: '.list-card', handleSel: '.grip',
      onEnd: (id, ids) => reposition(ids, id, (x) => st.lists.get(x).position,
        (x, position) => enqueue({ k: 'list.put', id: x, data: { position } })),
    });
    this.update();
  },
  update() {
    const lists = sortedLists();
    $('#cards').innerHTML = lists.length ? lists.map((l) => {
      const todo = todoOf(l.id).length, done = doneOf(l.id).length;
      return `<div class="card list-card" data-id="${l.id}">
        <a class="lc" href="#/l/${l.id}">
          <span class="emoji">${h(l.emoji)}</span>
          <span class="t"><b>${h(l.name)}</b><span>${todo ? `${todo} da prendere` : 'Tutto preso'}${done ? ` · ${done} nel carrello` : ''}</span></span>
          ${todo ? `<span class="badge">${todo}</span>` : ''}
        </a>
        <span class="grip" aria-label="Trascina per riordinare">${I.grip}</span>
      </div>`;
    }).join('') : `<div class="empty"><div class="big">🧺</div>Nessuna lista. Creane una con il +</div>`;
  },
};

const EMOJIS = ['🛒', '🥦', '🍎', '🥩', '🐟', '🧀', '🍞', '🍝', '🍷', '🧴', '🧻', '🐶', '💊', '🏠', '🎉', '🎄'];

function listSheet(list) {
  let emoji = list ? list.emoji : '🛒';
  openSheet(`<h2>${list ? 'Modifica lista' : 'Nuova lista'}</h2>
    <form id="lf">
      <label class="field"><span>Nome</span><input class="input" name="name" required maxlength="80" value="${h(list ? list.name : '')}" placeholder="es. Supermercato, Farmacia…"></label>
      <div class="field"><span>Icona</span><div class="emoji-pick">${EMOJIS.map((e) => `<button type="button" data-e="${e}" class="${e === emoji ? 'on' : ''}">${e}</button>`).join('')}</div></div>
      <div class="actions"><button type="button" class="btn" data-close>Annulla</button><button class="btn primary">Salva</button></div>
      ${list ? `<div class="actions"><button type="button" class="btn danger" id="del-list">Elimina lista</button></div>` : ''}
    </form>`, (sh) => {
    const f = $('#lf', sh);
    if (!list) setTimeout(() => f.elements.name.focus(), 50);
    $('.emoji-pick', sh).onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      emoji = b.dataset.e;
      sh.querySelectorAll('.emoji-pick button').forEach((x) => x.classList.toggle('on', x === b));
    };
    $('[data-close]', sh).onclick = () => closeSheet();
    f.onsubmit = (e) => {
      e.preventDefault();
      const name = f.elements.name.value.trim(); if (!name) return;
      const id = list ? list.id : uid();
      const maxPos = Math.max(0, ...[...st.lists.values()].map((l) => l.position));
      enqueue({ k: 'list.put', id, data: list ? { name, emoji } : { name, emoji, position: maxPos + 1 } });
      if (list) return closeSheet();
      closeSheet(true);
      history.replaceState(null, '', '#/l/' + id);
      mount();
    };
    const del = $('#del-list', sh);
    if (del) del.onclick = () => {
      if (!confirm(`Eliminare la lista "${list.name}" e tutti i suoi articoli?`)) return;
      enqueue({ k: 'list.del', id: list.id });
      closeSheet(true);
      history.replaceState(null, '', '#/');
      mount();
    };
  });
}

// --------------------------------------------------------------- vista lista
const flashIds = new Set();

function topPos(listId) {
  const todo = todoOf(listId);
  return todo.length ? Math.min(...todo.map((i) => i.position)) - 1 : 0;
}

// Aggiunge un articolo (o somma la quantità se è già in lista). Ritorna l'id.
function addToList(listId, p) {
  const key = S.normName(p.name);
  const same = itemsOf(listId).filter((i) => S.normName(i.name) === key);
  const open = same.find((i) => !i.checked);
  if (open) {
    if (p.qty == null) {
      if (p.brand && p.brand !== open.brand) enqueue({ k: 'item.put', id: open.id, data: { brand: p.brand } }, { silent: true });
      flashIds.add(open.id);
      return { id: open.id, merged: true };
    }
    const sum = S.addQty(open.qty, open.unit, p.qty, p.unit);
    if (sum) {
      enqueue({ k: 'item.put', id: open.id, data: { qty: sum.qty, unit: sum.unit, ...(p.brand ? { brand: p.brand } : {}) } }, { silent: true });
      flashIds.add(open.id);
      return { id: open.id, merged: true };
    }
  }
  const done = !open && same.find((i) => i.checked);
  if (done) {
    enqueue({ k: 'item.put', id: done.id, data: { checked: false, qty: p.qty, unit: p.unit || '', brand: p.brand || done.brand, position: topPos(listId) } }, { silent: true });
    flashIds.add(done.id);
    return { id: done.id };
  }
  const id = uid();
  enqueue({ k: 'item.put', id, data: { list_id: listId, name: p.name, qty: p.qty, unit: p.unit || '', brand: p.brand || '', note: '', checked: false, position: topPos(listId) } }, { silent: true });
  flashIds.add(id);
  return { id };
}

function itemMeta(i, withBy) {
  const parts = [];
  if (i.brand) parts.push(h(i.brand));
  if (i.note) parts.push(h(i.note));
  if (withBy) {
    if (i.checked && i.checked_by && i.checked_by !== st.member) parts.push('preso da ' + h(i.checked_by));
    else if (!i.checked && i.created_by && i.created_by !== st.member) parts.push('da ' + h(i.created_by));
  }
  return parts.join(' · ');
}

function itemRow(i) {
  const q = S.fmtQty(i.qty, i.unit);
  const meta = itemMeta(i, true);
  return `<li class="item ${i.checked ? 'done' : ''} ${flashIds.has(i.id) ? 'flash' : ''}" data-id="${i.id}">
    <button class="tap" data-act="toggle" aria-pressed="${i.checked}">
      <span class="check">${I.check}</span>
      <span class="txt"><span class="name">${h(i.name)}${q ? `<span class="qty">${h(q)}</span>` : ''}</span>
      ${meta ? `<span class="meta">${meta}</span>` : ''}</span>
    </button>
    <button class="icon-btn more" data-act="edit" aria-label="Dettagli">${I.more}</button>
    ${i.checked ? '' : `<span class="grip" aria-label="Trascina per riordinare">${I.grip}</span>`}
  </li>`;
}

const ListView = {
  showDone: ls.get('showDone') !== '0',
  mount() {
    const list = st.lists.get(this.route.id);
    if (!list) { history.replaceState(null, '', '#/'); return mount(); }
    ls.set('lastList', list.id);
    app.innerHTML = topBar(`<span id="lt"></span>`, {
      back: '#/',
      right: `<button class="icon-btn" id="list-menu" aria-label="Opzioni lista">${I.more}</button>`,
    }) + `<main>
      <div class="quick">
        <form id="qf" autocomplete="off">
          <input id="qi" enterkeyhint="done" placeholder="Aggiungi… (es. 2 kg patate @Selex)" aria-label="Aggiungi articolo">
          <button class="add" aria-label="Aggiungi">${I.plus}</button>
        </form>
        <div class="suggest" id="sg"></div>
      </div>
      <ul class="items" id="todo"></ul>
      <div id="done-wrap"></div>
    </main>` + tabBar('lists');
    const qi = $('#qi');
    $('#qf').onsubmit = (e) => {
      e.preventDefault();
      const p = S.parseQuick(qi.value);
      if (!p.name) return;
      const r = addToList(list.id, p);
      if (r.merged) toast(p.qty != null ? `${p.name}: quantità aggiornata` : `${p.name} è già in lista`);
      qi.value = '';
      render();
      qi.focus();
    };
    qi.oninput = () => this.suggest();
    $('#sg').onclick = (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      const typed = S.parseQuick(qi.value);
      addToList(list.id, { name: b.dataset.name, qty: typed.qty, unit: typed.unit, brand: typed.brand });
      qi.value = '';
      render();
    };
    $('#list-menu').onclick = () => this.menu();
    const body = $('main');
    body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const li = btn.closest('.item');
      const it = li && st.items.get(li.dataset.id);
      if (btn.dataset.act === 'clear') return this.clearDone();
      if (btn.dataset.act === 'toggle-done') { this.showDone = !this.showDone; ls.set('showDone', this.showDone ? '1' : '0'); return render(); }
      if (!it) return;
      if (btn.dataset.act === 'toggle') {
        vibrate(10);
        const data = { checked: !it.checked };
        if (it.checked) data.position = topPos(it.list_id);
        enqueue({ k: 'item.put', id: it.id, data });
      } else if (btn.dataset.act === 'edit') itemSheet(it);
    });
    sortable($('#todo'), {
      itemSel: '.item', handleSel: '.grip',
      onEnd: (id, ids) => reposition(ids, id, (x) => st.items.get(x).position,
        (x, position) => enqueue({ k: 'item.put', id: x, data: { position } }, { silent: true })),
    });
    this.update();
  },
  update() {
    const list = st.lists.get(this.route.id);
    if (!list) { toast('La lista è stata eliminata'); history.replaceState(null, '', '#/'); return mount(); }
    $('#lt').textContent = `${list.emoji} ${list.name}`;
    const todo = todoOf(list.id), done = doneOf(list.id);
    $('#todo').innerHTML = todo.map(itemRow).join('');
    $('#done-wrap').innerHTML = (!todo.length && !done.length)
      ? `<div class="empty"><div class="big">📝</div>La lista è vuota.<br>Scrivi qui sopra cosa serve.</div>`
      : (!todo.length ? `<div class="empty" style="padding:24px"><div class="big">🎉</div>Tutto preso!</div>` : '') +
        (done.length ? `<div class="section-h"><button class="btn ghost" data-act="toggle-done">${this.showDone ? '▾' : '▸'} Nel carrello (${done.length})</button>
          <button class="btn ghost" data-act="clear">Svuota</button></div>
          ${this.showDone ? `<ul class="items">${done.map(itemRow).join('')}</ul>` : ''}` : '');
    flashIds.clear();
    this.suggest();
  },
  suggest() {
    const qi = $('#qi'); if (!qi) return;
    const typed = S.normName(S.parseQuick(qi.value).name);
    const inList = new Set(todoOf(this.route.id).map((i) => S.normName(i.name)));
    let cand = st.history.filter((x) => !inList.has(S.normName(x.name)));
    if (typed) {
      const starts = [], has = [];
      for (const x of cand) {
        const n = S.normName(x.name);
        if (n === typed) continue;
        if (n.startsWith(typed)) starts.push(x); else if (n.includes(typed)) has.push(x);
      }
      cand = starts.concat(has);
    } else {
      cand = cand.slice().sort((a, b) => b.count - a.count);
    }
    $('#sg').innerHTML = cand.slice(0, 12).map((x) =>
      `<button type="button" class="chip" data-name="${h(x.name)}">${h(x.name)}${x.brand ? `<small>${h(x.brand)}</small>` : ''}</button>`).join('');
  },
  clearDone() {
    const list = st.lists.get(this.route.id);
    const done = doneOf(list.id);
    if (!done.length) return;
    const backup = done.map((i) => ({ ...i }));
    enqueue({ k: 'list.clear', id: list.id });
    toast(`${backup.length} articoli rimossi`, {
      label: 'Annulla',
      run: () => backup.forEach((i) => enqueue({ k: 'item.put', id: i.id, data: pickItem(i) })),
    });
  },
  menu() {
    const list = st.lists.get(this.route.id);
    listSheet(list);
  },
};

const pickItem = (i) => ({ list_id: i.list_id, name: i.name, qty: i.qty, unit: i.unit, brand: i.brand, note: i.note, checked: i.checked, position: i.position });

function unitOptions(sel) {
  const u = S.normUnit(sel);
  const all = S.UNITS.includes(u) ? S.UNITS : S.UNITS.concat([u]);
  return all.map((x) => `<option value="${h(x)}" ${x === u ? 'selected' : ''}>${x || '—'}</option>`).join('');
}

function brandDatalist() {
  const brands = [...new Set(st.history.map((x) => x.brand).filter(Boolean))].sort();
  return `<datalist id="brands">${brands.map((b) => `<option value="${h(b)}">`).join('')}</datalist>`;
}

function itemSheet(it) {
  const lists = sortedLists();
  openSheet(`<h2>Dettagli</h2>
    <form id="itf">
      <label class="field"><span>Nome</span><input class="input" name="name" required maxlength="120" value="${h(it.name)}"></label>
      <div class="row">
        <label class="field"><span>Quantità</span><input class="input" name="qty" inputmode="decimal" placeholder="—" value="${h(S.fmtNum(it.qty))}"></label>
        <label class="field narrow"><span>Unità</span><select class="input" name="unit">${unitOptions(it.unit)}</select></label>
      </div>
      <label class="field"><span>Marca</span><input class="input" name="brand" list="brands" maxlength="80" placeholder="Qualsiasi" value="${h(it.brand)}">${brandDatalist()}</label>
      <label class="field"><span>Nota</span><input class="input" name="note" maxlength="300" placeholder="es. quello senza lattosio" value="${h(it.note)}"></label>
      ${lists.length > 1 ? `<label class="field"><span>Lista</span><select class="input" name="list_id">${lists.map((l) => `<option value="${l.id}" ${l.id === it.list_id ? 'selected' : ''}>${h(l.emoji)} ${h(l.name)}</option>`).join('')}</select></label>` : ''}
      <div class="actions"><button type="button" class="btn danger" id="del">Elimina</button><button class="btn primary">Salva</button></div>
    </form>`, (sh) => {
    const f = $('#itf', sh);
    f.onsubmit = (e) => {
      e.preventDefault();
      const name = f.elements.name.value.trim(); if (!name) return;
      const data = { name, qty: S.parseNum(f.qty.value), unit: f.unit.value, brand: f.brand.value.trim(), note: f.note.value.trim() };
      if (f.list_id && f.list_id.value !== it.list_id) { data.list_id = f.list_id.value; data.position = topPos(data.list_id); }
      enqueue({ k: 'item.put', id: it.id, data });
      closeSheet();
    };
    $('#del', sh).onclick = () => {
      const backup = { ...it };
      enqueue({ k: 'item.del', id: it.id });
      closeSheet();
      toast(`${backup.name} eliminato`, { label: 'Annulla', run: () => enqueue({ k: 'item.put', id: backup.id, data: pickItem(backup) }) });
    };
  });
}

// --------------------------------------------------------------- ricette
const Recipes = {
  q: '',
  mount() {
    app.innerHTML = topBar('Ricette', {
      right: `<a class="icon-btn" href="#/r/new/edit" aria-label="Nuova ricetta">${I.plus}</a>`,
    }) + `<main><input class="input search" id="rq" type="search" placeholder="Cerca ricetta o ingrediente…" value="${h(this.q)}"><div class="list-cards" id="rl"></div></main>` + tabBar('recipes');
    $('#rq').oninput = (e) => { this.q = e.target.value; this.update(); };
    this.update();
  },
  update() {
    const q = S.normName(this.q);
    const rs = [...st.recipes.values()]
      .filter((r) => !q || S.normName(r.name).includes(q) || r.ingredients.some((i) => S.normName(i.name).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'it'));
    $('#rl').innerHTML = rs.length ? rs.map((r) => `<a class="card recipe-card" href="#/r/${r.id}">
        <span class="t"><b>${h(r.name)}</b><span>${r.ingredients.length} ingredienti · per ${r.servings} ${r.servings === 1 ? 'persona' : 'persone'}</span></span>
        <span style="color:var(--muted)">›</span></a>`).join('')
      : `<div class="empty"><div class="big">📖</div>${st.recipes.size ? 'Nessuna ricetta trovata.' : 'Nessuna ricetta.<br>Aggiungine una con il +'}</div>`;
  },
};

const RecipeView = {
  mount() {
    const r = st.recipes.get(this.route.id);
    if (!r) { history.replaceState(null, '', '#/r'); return mount(); }
    if (this.rid !== r.id) {
      this.rid = r.id;
      this.people = r.servings;
      this.off = new Set(r.ingredients.map((i, k) => (i.unit === 'q.b.' ? k : -1)).filter((k) => k >= 0));
    }
    const lastList = ls.get('lastList');
    app.innerHTML = topBar(`<span id="rt"></span>`, {
      back: '#/r',
      right: `<a class="icon-btn" href="#/r/${r.id}/edit" aria-label="Modifica">${I.edit}</a>`,
    }) + `<main>
      <div class="servings-box">
        <span class="lbl" id="rs"></span>
        <div class="stepper"><button type="button" data-d="-1" aria-label="Meno">−</button><output id="pp"></output><button type="button" data-d="1" aria-label="Più">+</button></div>
      </div>
      <ul class="items" id="ings"></ul>
      <div id="rnotes"></div>
      <div class="sticky-cta"><div class="card">
        <select class="input" id="tl">${sortedLists().map((l) => `<option value="${l.id}" ${l.id === lastList ? 'selected' : ''}>${h(l.emoji)} ${h(l.name)}</option>`).join('')}</select>
        <button class="btn primary" id="addr">Aggiungi</button>
      </div></div>
    </main>` + tabBar('recipes');
    $('.stepper').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this.people = Math.max(1, Math.min(99, this.people + Number(b.dataset.d)));
      this.update();
    };
    $('#ings').onclick = (e) => {
      const li = e.target.closest('.item'); if (!li) return;
      const k = Number(li.dataset.k);
      this.off.has(k) ? this.off.delete(k) : this.off.add(k);
      this.update();
    };
    $('#addr').onclick = () => this.addToList();
    this.update();
  },
  scaled() {
    const r = st.recipes.get(this.rid);
    return r.ingredients.map((i) => ({ ...i, qty: S.scaleQty(i.qty, i.unit, r.servings, this.people) }));
  },
  update() {
    const r = st.recipes.get(this.route.id);
    if (!r) { history.replaceState(null, '', '#/r'); return mount(); }
    $('#rt').textContent = r.name;
    $('#rs').innerHTML = `Ricetta per ${r.servings}<b>Quante persone?</b>`;
    $('#pp').textContent = this.people;
    const ings = this.scaled();
    $('#ings').innerHTML = ings.length ? ings.map((i, k) => {
      const q = S.fmtQty(i.qty, i.unit);
      return `<li class="item ing ${this.off.has(k) ? '' : 'done'}" data-k="${k}" style="--x:0">
        <button class="tap" type="button"><span class="check">${I.check}</span>
        <span class="txt"><span class="name" style="text-decoration:none;color:var(--text)">${h(i.name)}${q ? `<span class="qty" style="color:var(--accent)">${h(q)}</span>` : ''}</span>
        ${i.brand ? `<span class="meta">${h(i.brand)}</span>` : ''}</span></button></li>`;
    }).join('') : '';
    if (!ings.length) $('#ings').outerHTML = `<div class="empty" id="ings">Nessun ingrediente. Tocca ✎ per aggiungerli.</div>`;
    $('#rnotes').innerHTML = r.notes ? `<div class="section-h">Procedimento</div><div class="notes">${h(r.notes)}</div>` : '';
    const n = ings.length - [...this.off].filter((k) => k < ings.length).length;
    const btn = $('#addr');
    btn.textContent = n ? `Aggiungi ${n}` : 'Aggiungi';
    btn.disabled = !n || !st.lists.size;
  },
  addToList() {
    const listId = $('#tl').value;
    const list = st.lists.get(listId); if (!list) return;
    const ings = this.scaled().filter((_, k) => !this.off.has(k));
    for (const i of ings) addToList(listId, { name: i.name, qty: i.qty, unit: i.unit === 'q.b.' ? '' : i.unit, brand: i.brand });
    ls.set('lastList', listId);
    render();
    vibrate(20);
    toast(`${ings.length} ingredienti aggiunti a ${list.name}`, { label: 'Apri', run: () => { location.hash = '#/l/' + listId; } });
  },
};

const RecipeEdit = {
  mount() {
    const isNew = this.route.id === 'new';
    const r = isNew ? null : st.recipes.get(this.route.id);
    if (!isNew && !r) { history.replaceState(null, '', '#/r'); return mount(); }
    this.id = r ? r.id : uid();
    this.draft = r ? r.ingredients.map((i) => ({ ...i, _k: uid() })) : [];
    app.innerHTML = topBar(isNew ? 'Nuova ricetta' : 'Modifica ricetta', { back: r ? `#/r/${r.id}` : '#/r' }) + `<main>
      <form id="ref" autocomplete="off">
        <label class="field"><span>Nome</span><input class="input" name="name" required maxlength="120" value="${h(r ? r.name : '')}" placeholder="es. Carbonara"></label>
        <label class="field"><span>Dosi per quante persone?</span><input class="input" name="servings" type="number" min="1" max="100" inputmode="numeric" value="${r ? r.servings : 4}"></label>
        <div class="field"><span>Ingredienti</span>
          <div id="ingl"></div>
          <textarea class="input" id="ingq" rows="1" style="min-height:0" placeholder="Aggiungi: es. 320 g spaghetti (Invio). Puoi incollarne più righe."></textarea>
          <div class="hint">Formato: quantità, unità, nome e @marca facoltativa. Es. «4 uova», «150 g guanciale», «pecorino 50 g @Locatelli», «pepe q.b.»</div>
        </div>
        <label class="field"><span>Procedimento (facoltativo)</span><textarea class="input" name="notes" maxlength="5000" rows="5">${h(r ? r.notes : '')}</textarea></label>
        <div class="actions">${r ? '<button type="button" class="btn danger" id="rdel">Elimina</button>' : ''}<button class="btn primary">Salva ricetta</button></div>
      </form></main>` + tabBar('recipes');
    const ingq = $('#ingq');
    const addLines = (text) => {
      const lines = text.split(/\r?\n/).map((s) => s.replace(/^[-*•\s]+/, '').trim()).filter(Boolean);
      for (const line of lines) {
        const p = S.parseQuick(line);
        if (p.name) this.draft.push({ name: p.name, qty: p.qty, unit: p.unit, brand: p.brand, _k: uid() });
      }
      this.rows();
    };
    ingq.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addLines(ingq.value); ingq.value = ''; }
    });
    ingq.addEventListener('input', () => {
      if (ingq.value.includes('\n')) { addLines(ingq.value); ingq.value = ''; }
    });
    const ingl = $('#ingl');
    ingl.addEventListener('input', (e) => {
      const row = e.target.closest('.ing-edit'); if (!row) return;
      const d = this.draft.find((x) => x._k === row.dataset.id); if (!d) return;
      const f = e.target.dataset.f;
      d[f] = f === 'qty' ? S.parseNum(e.target.value) : e.target.value;
    });
    ingl.addEventListener('change', (e) => {
      const row = e.target.closest('.ing-edit'); if (!row) return;
      const d = this.draft.find((x) => x._k === row.dataset.id);
      if (d && e.target.dataset.f === 'unit') d.unit = e.target.value;
    });
    ingl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rm]'); if (!b) return;
      this.draft = this.draft.filter((x) => x._k !== b.dataset.rm);
      this.rows();
    });
    sortable(ingl, {
      itemSel: '.ing-edit', handleSel: '.grip',
      onEnd: (_, ids) => {
        const by = new Map(this.draft.map((d) => [d._k, d]));
        this.draft = ids.map((k) => by.get(k));
        this.rows();
      },
    });
    const f = $('#ref');
    f.onsubmit = (e) => {
      e.preventDefault();
      if (ingq.value.trim()) { addLines(ingq.value); ingq.value = ''; }
      const name = f.elements.name.value.trim(); if (!name) return;
      const ingredients = this.draft.filter((d) => String(d.name || '').trim())
        .map((d) => ({ name: d.name.trim(), qty: d.qty ?? null, unit: d.unit || '', brand: (d.brand || '').trim() }));
      enqueue({ k: 'recipe.put', id: this.id, data: { name, servings: Math.max(1, parseInt(f.servings.value, 10) || 1), notes: f.notes.value, ingredients } }, { silent: true });
      RecipeView.rid = null;
      history.replaceState(null, '', `#/r/${this.id}`);
      mount();
    };
    const del = $('#rdel');
    if (del) del.onclick = () => {
      if (!confirm(`Eliminare la ricetta "${r.name}"?`)) return;
      enqueue({ k: 'recipe.del', id: r.id }, { silent: true });
      history.replaceState(null, '', '#/r');
      mount();
    };
    this.rows();
  },
  rows() {
    $('#ingl').innerHTML = this.draft.map((d) => `<div class="ing-edit" data-id="${d._k}">
      <span class="grip" aria-label="Trascina">${I.grip}</span>
      <input class="input" data-f="name" value="${h(d.name)}" placeholder="Ingrediente" aria-label="Ingrediente">
      <input class="input" data-f="qty" inputmode="decimal" value="${h(S.fmtNum(d.qty))}" placeholder="Qtà" aria-label="Quantità">
      <select class="input" data-f="unit" aria-label="Unità">${unitOptions(d.unit)}</select>
      <button type="button" class="icon-btn" data-rm="${d._k}" aria-label="Rimuovi">${I.x}</button>
      <input class="input brand" data-f="brand" value="${h(d.brand)}" placeholder="Marca (facoltativa)" aria-label="Marca" list="brands">
    </div>`).join('') + brandDatalist();
  },
  update() { /* durante la modifica non ridisegniamo per non perdere l'input */ },
};

// --------------------------------------------------------------- impostazioni
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (view === Settings) Settings.update(); });

const Settings = {
  mount() {
    app.innerHTML = topBar('Impostazioni') + `<main class="settings">
      <div class="card"><h3>Il tuo nome</h3>
        <p>Viene mostrato agli altri sugli articoli che aggiungi o prendi.</p>
        <input class="input" id="sn" value="${h(st.member)}" maxlength="40"></div>
      <div class="card"><h3>Famiglia</h3>
        <label class="field"><span>Nome</span><input class="input" id="hn" maxlength="80"></label>
        <p>Per invitare qualcuno condividi il link o il codice: chi lo inserisce vede e modifica tutte le liste e le ricette.</p>
        <div class="code" id="hc"></div>
        <div class="actions"><button class="btn" id="copy">Copia link</button><button class="btn primary" id="share">Condividi invito</button></div>
      </div>
      <div class="card" id="inst"></div>
      <div class="card"><h3>Questo dispositivo</h3>
        <p>Esci dalla famiglia su questo telefono. Potrai rientrare con il codice.</p>
        <button class="btn danger" id="out" style="padding-left:0">Esci dalla famiglia</button></div>
    </main>` + tabBar('settings');
    $('#sn').onchange = (e) => { const v = e.target.value.trim(); if (v) { st.member = v; ls.set('member', v); toast('Nome salvato'); } };
    $('#hn').onchange = (e) => { const v = e.target.value.trim(); if (v) { enqueue({ k: 'hh.put', id: 'hh', data: { name: v } }, { silent: true }); toast('Nome famiglia salvato'); } };
    const link = () => `${location.origin}/?join=${encodeURIComponent(st.code)}`;
    $('#copy').onclick = async () => {
      try { await navigator.clipboard.writeText(link()); toast('Link copiato'); } catch { prompt('Copia il link:', link()); }
    };
    $('#share').onclick = async () => {
      const data = { title: 'Sporta', text: `Unisciti alla nostra Sporta "${st.household?.name || ''}" (codice ${st.code})`, url: link() };
      if (navigator.share) { try { await navigator.share(data); } catch { /* annullato */ } }
      else $('#copy').click();
    };
    $('#out').onclick = () => { if (confirm('Uscire dalla famiglia su questo dispositivo?')) logout(); };
    this.update();
  },
  update() {
    const hn = $('#hn');
    if (hn && document.activeElement !== hn) hn.value = st.household?.name || '';
    if ($('#hc')) $('#hc').textContent = st.code;
    const inst = $('#inst'); if (!inst) return;
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    inst.hidden = standalone;
    inst.innerHTML = `<h3>Installa l'app</h3>` + (installEvt
      ? `<p>Aggiungila alla schermata Home per aprirla come un'app.</p><button class="btn primary" id="ib">Installa</button>`
      : ios ? `<p>In Safari tocca <b>Condividi</b> e poi <b>Aggiungi alla schermata Home</b>.</p>`
        : `<p>Dal menu del browser scegli <b>Installa app</b> o <b>Aggiungi a schermata Home</b>.</p>`);
    const ib = $('#ib');
    if (ib) ib.onclick = async () => { installEvt.prompt(); await installEvt.userChoice.catch(() => null); installEvt = null; this.update(); };
  },
};

// =============================================================== avvio
(function start() {
  if (st.code) {
    const c = ls.json('cache', null);
    if (c && c.household && c.household.code === st.code) setState(c);
    for (const op of st.outbox) applyLocal(op);
    // Apertura rapida: si riparte dall'ultima lista usata.
    const last = ls.get('lastList');
    if (!location.hash && last && st.lists.has(last)) history.replaceState(null, '', '#/l/' + last);
    connect();
    flush();
  }
  mount();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
