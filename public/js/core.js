'use strict';
/* Sporta — nucleo del client: utilità, stato multi-gruppo, coda offline,
   sincronizzazione in tempo reale, componenti comuni e router.
   Gli altri file (lists.js, recipes.js, trips.js, settings.js) definiscono le viste. */
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
const photoUrl = (id) => '/api/photos/' + encodeURIComponent(id);
const fmtDate = (t, opts) => new Date(t).toLocaleDateString('it-IT', opts || { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (t) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

const svg = (body, o = {}) => `<svg viewBox="0 0 24 24" fill="${o.fill || 'none'}" stroke="${o.fill ? 'none' : 'currentColor'}" stroke-width="${o.sw || 2}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const I = {
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', { sw: 2.4 }),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', { sw: 3.2 }),
  more: svg('<circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/>', { fill: 'currentColor' }),
  grip: svg('<circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>', { fill: 'currentColor' }),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>', { sw: 2.2 }),
  cart: svg('<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.6l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.2l1.7-7.3H6.1"/>', { sw: 1.8 }),
  book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>', { sw: 1.8 }),
  receipt: svg('<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>', { sw: 1.8 }),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', { sw: 1.8 }),
  star: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>', { sw: 1.8 }),
  starFill: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>', { fill: 'currentColor' }),
  share: svg('<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>'),
  sort: svg('<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  flame: svg('<path d="M12 22c4 0 7-2.7 7-6.6 0-3.4-2.4-5.6-4-7.9-.6 2-1.6 3-3 3.5.3-3.2-1-6.3-3.5-8-.3 3.5-3.5 6.4-3.5 11C5 19.3 8 22 12 22z"/>'),
  chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
};

// =============================================================== gruppi (multi-famiglia)
// Il telefono può partecipare a più gruppi. Ogni gruppo ha la sua cache locale;
// la coda delle modifiche offline è unica, con ogni operazione legata al suo gruppo.
(function migrateSingleGroup() {
  const old = ls.get('code');
  if (!old || ls.get('groups')) return;
  const cache = ls.json('cache', null);
  ls.setJson('groups', [{ code: old, name: (cache && cache.household && cache.household.name) || 'Gruppo' }]);
  ls.set('active', old);
  if (cache) ls.setJson('cache.' + old, cache);
  ls.setJson('outbox', ls.json('outbox', []).map((o) => ({ ...o, g: o.g || old })));
  const last = ls.get('lastList');
  if (last) ls.set('lastList.' + old, last);
  for (const k of ['code', 'cache', 'lastList']) ls.set(k, null);
})();

const st = {
  groups: ls.json('groups', []),
  code: null,
  member: ls.get('member') || '',
  household: null,
  lists: new Map(),
  items: new Map(),
  recipes: new Map(),
  products: new Map(), // chiave: nome normalizzato
  trips: new Map(),
  outbox: ls.json('outbox', []),
  live: false,
};
st.code = st.groups.some((g) => g.code === ls.get('active')) ? ls.get('active') : (st.groups[0] && st.groups[0].code) || null;

const myOps = () => st.outbox.filter((o) => o.g === st.code);
const groupName = () => (st.household && st.household.name) || (st.groups.find((g) => g.code === st.code) || {}).name || '';

function setState(j) {
  st.household = j.household;
  st.lists = new Map((j.lists || []).map((x) => [x.id, x]));
  st.items = new Map((j.items || []).map((x) => [x.id, x]));
  st.recipes = new Map((j.recipes || []).map((x) => [x.id, x]));
  st.products = new Map((j.products || []).map((x) => [x.key, x]));
  st.trips = new Map((j.trips || []).map((x) => [x.id, x]));
  // Aggiorna il nome del gruppo salvato.
  const g = st.groups.find((x) => x.code === st.code);
  if (g && j.household && g.name !== j.household.name) { g.name = j.household.name; ls.setJson('groups', st.groups); }
}

function clearState() {
  st.household = null;
  for (const k of ['lists', 'items', 'recipes', 'products', 'trips']) st[k] = new Map();
}

let cacheTimer = null;
function writeCache() {
  clearTimeout(cacheTimer);
  cacheTimer = null;
  if (!st.code || !st.household) return;
  ls.setJson('cache.' + st.code, {
    household: st.household, lists: [...st.lists.values()], items: [...st.items.values()],
    recipes: [...st.recipes.values()], products: [...st.products.values()], trips: [...st.trips.values()],
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

function loadGroupFromCache() {
  clearState();
  const c = ls.json('cache.' + st.code, null);
  if (c && c.household) {
    // Cache di versioni precedenti: "history" invece di "products".
    if (!c.products && c.history) c.products = c.history.map((p) => ({ key: S.normName(p.name), ...p }));
    setState(c);
  }
  for (const op of myOps()) applyLocal(op);
}

function addGroup(j) {
  const code = j.household.code;
  if (!st.groups.some((g) => g.code === code)) st.groups.push({ code, name: j.household.name });
  ls.setJson('groups', st.groups);
  if (cacheTimer) writeCache();
  st.code = code;
  ls.set('active', code);
  setState(j);
  for (const op of myOps()) applyLocal(op);
  writeCache();
  connect();
}

function switchGroup(code, hash = '#/') {
  if (code === st.code) { location.hash = hash; return; }
  if (cacheTimer) writeCache();
  st.code = code;
  ls.set('active', code);
  loadGroupFromCache();
  history.replaceState(null, '', hash);
  connect();
  flush();
  mount();
}

// Toglie il gruppo da questo telefono (il gruppo continua a esistere per gli altri).
function leaveGroup(code) {
  st.groups = st.groups.filter((g) => g.code !== code);
  ls.setJson('groups', st.groups);
  st.outbox = st.outbox.filter((o) => o.g !== code);
  saveOutbox();
  ls.set('cache.' + code, null);
  ls.set('lastList.' + code, null);
  if (code !== st.code) return;
  if (rt) { rt.close(); rt = null; }
  st.code = st.groups[0] ? st.groups[0].code : null;
  ls.set('active', st.code);
  if (st.code) { loadGroupFromCache(); connect(); } else clearState();
  history.replaceState(null, '', '#/');
  mount();
}

// =============================================================== catalogo prodotti
const productOf = (name) => st.products.get(S.normName(name));

// Aggiorna subito il catalogo locale (il server farà lo stesso e lo confermerà).
function rememberProduct(d, { use = true } = {}) {
  const key = S.normName(d.name);
  if (!key) return;
  const ex = st.products.get(key);
  const p = ex ? { ...ex } : { key, name: d.name, unit: '', brand: '', count: 0, department: S.guessDepartment(d.name), tags: [], favorite: false, qty: null };
  if (use) p.count = (p.count || 0) + 1;
  if (d.unit) p.unit = d.unit;
  if (d.brand) p.brand = d.brand;
  if (d.department !== undefined) p.department = d.department;
  if (d.tags !== undefined) p.tags = d.tags;
  st.products.set(key, p);
}

const allTags = () => {
  const s = new Set();
  for (const p of st.products.values()) for (const t of p.tags || []) s.add(t);
  for (const i of st.items.values()) for (const t of i.tags || []) s.add(t);
  return [...s].sort((a, b) => a.localeCompare(b, 'it'));
};

function parseTags(text) {
  return [...new Set(String(text || '').split(/[,;\n]+|\s+(?=#)/).map((t) => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean))].slice(0, 10);
}

// =============================================================== operazioni + coda offline
// Ogni modifica è un'operazione: applicata subito in locale (ottimistica), poi
// messa in coda e inviata al server appena possibile. Funziona anche offline.
function applyLocal(op) {
  const t = Date.now();
  switch (op.k) {
    case 'list.put': {
      const ex = st.lists.get(op.id);
      st.lists.set(op.id, { ...(ex || { id: op.id, emoji: '🛒', position: t, sort_mode: 'manual', created_at: t }), ...op.data, updated_at: t });
      break;
    }
    case 'list.del':
      st.lists.delete(op.id);
      for (const [id, it] of st.items) if (it.list_id === op.id) st.items.delete(id);
      break;
    case 'list.clear':
      for (const [id, it] of st.items) if (it.list_id === op.id && it.checked) st.items.delete(id);
      break;
    case 'list.close': {
      const list = st.lists.get(op.id);
      const done = [...st.items.values()].filter((i) => i.list_id === op.id && i.checked)
        .sort((a, b) => (a.checked_at || 0) - (b.checked_at || 0));
      if (!st.trips.has(op.trip) && done.length) {
        st.trips.set(op.trip, {
          id: op.trip, list_id: op.id, list_name: list ? list.name : '', store: op.data.store || '',
          total: op.data.total ?? null, created_by: st.member, created_at: op.at || t,
          items: done.map((i) => ({ name: i.name, qty: i.qty, unit: i.unit, brand: i.brand, note: i.note, department: i.department || '', tags: i.tags || [], by: i.checked_by })),
        });
      }
      for (const i of done) st.items.delete(i.id);
      break;
    }
    case 'item.put': {
      const ex = st.items.get(op.id);
      const it = {
        ...(ex || { id: op.id, qty: null, unit: '', brand: '', note: '', department: '', tags: [], checked: false,
          checked_by: '', checked_at: null, created_by: st.member, created_at: t, position: -t }),
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
    case 'product.put': {
      const ex = st.products.get(op.id);
      st.products.set(op.id, { ...(ex || { key: op.id, name: op.data.name || op.id, unit: '', brand: '', count: 0, department: '', tags: [], favorite: false, qty: null }), ...op.data, key: op.id });
      break;
    }
    case 'product.del': st.products.delete(op.id); break;
    case 'recipe.put': {
      const ex = st.recipes.get(op.id);
      st.recipes.set(op.id, {
        ...(ex || { id: op.id, servings: 4, notes: '', ingredients: [], steps: [], photos: [], difficulty: '', description: '', prep_min: null, cook_min: null, share_token: null, created_at: t }),
        ...op.data, updated_at: t,
      });
      for (const i of op.data.ingredients || []) if (!productOf(i.name)) rememberProduct(i, { use: false });
      break;
    }
    case 'recipe.del': st.recipes.delete(op.id); break;
    case 'trip.put': { const ex = st.trips.get(op.id); if (ex) st.trips.set(op.id, { ...ex, ...op.data }); break; }
    case 'trip.del': st.trips.delete(op.id); break;
    case 'hh.put': st.household = { ...st.household, ...op.data }; break;
  }
}

function opRequest(op) {
  switch (op.k) {
    case 'list.put': return ['PUT', `/api/lists/${op.id}`, op.data];
    case 'list.del': return ['DELETE', `/api/lists/${op.id}`];
    case 'list.clear': return ['POST', `/api/lists/${op.id}/clear-checked`];
    case 'list.close': return ['POST', `/api/lists/${op.id}/close`, { ...op.data, trip_id: op.trip, by: st.member }];
    case 'item.put': return ['PUT', `/api/items/${op.id}`, { ...op.data, by: st.member }];
    case 'item.del': return ['DELETE', `/api/items/${op.id}`];
    case 'product.put': return ['POST', '/api/products', { ...op.data, key: op.id }];
    case 'product.del': return ['POST', '/api/products/delete', { key: op.id }];
    case 'recipe.put': return ['PUT', `/api/recipes/${op.id}`, op.data];
    case 'recipe.del': return ['DELETE', `/api/recipes/${op.id}`];
    case 'trip.put': return ['PUT', `/api/trips/${op.id}`, op.data];
    case 'trip.del': return ['DELETE', `/api/trips/${op.id}`];
    case 'hh.put': return ['PATCH', '/api/household', op.data];
  }
  return null;
}

function enqueue(op, { silent } = {}) {
  op.g = st.code;
  op.at = op.at || Date.now();
  applyLocal(op);
  if (op.k === 'item.put' && op.data.name) rememberProduct(op.data);
  else if (op.k === 'item.put' && (op.data.department !== undefined || op.data.tags !== undefined)) {
    const it = st.items.get(op.id);
    if (it) rememberProduct({ name: it.name, department: op.data.department, tags: op.data.tags }, { use: false });
  }
  st.outbox.push(op);
  saveOutbox();
  saveCache();
  if (!silent) render();
  flush();
}

const isPending = (id) => st.outbox.some((o) => o.g === st.code && (o.id === id || o.trip === id));
const authHeaders = (code = st.code) => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + code });

// Richiesta diretta (non in coda): per foto, condivisione e operazioni che richiedono la rete.
async function api(method, url, body, code = st.code) {
  let res;
  try {
    res = await fetch(url, { method, headers: authHeaders(code), body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error('Serve la connessione a internet'); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'Operazione non riuscita');
  if (j.events && code === st.code) applyEvents(j.events);
  return j;
}

let flushing = false, retryTimer = null;
function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(flush, 4000);
}

async function flush() {
  if (flushing || !st.outbox.length) { updateStatus(); return; }
  flushing = true;
  try {
    while (st.outbox.length) {
      const op = st.outbox[0];
      const req = opRequest(op);
      if (!req || !op.g) { st.outbox.shift(); saveOutbox(); continue; }
      const [method, url, body] = req;
      let res;
      try {
        res = await fetch(url, { method, headers: authHeaders(op.g), body: body ? JSON.stringify(body) : undefined });
      } catch { scheduleRetry(); break; }
      if (res.status >= 500 || res.status === 429) { scheduleRetry(); break; }
      if (res.status === 401) { unauthorized(op.g); continue; }
      st.outbox.shift();
      saveOutbox();
      const j = await res.json().catch(() => null);
      if (res.ok) { if (j && j.events && op.g === st.code) applyEvents(j.events); }
      else { toast((j && j.error) || 'Operazione non riuscita'); if (op.g === st.code) loadState(); }
    }
  } finally {
    flushing = false;
    updateStatus();
  }
}

const flashIds = new Set();

function applyEvents(evs) {
  for (const e of evs) {
    if (!e) continue;
    const id = e.id || (e.data && (e.data.id || e.data.key));
    if (isPending(id)) continue; // c'è una nostra modifica più recente in coda
    if (e.t === 'household') {
      st.household = { ...st.household, ...e.data };
      const g = st.groups.find((x) => x.code === st.code);
      if (g) { g.name = e.data.name; ls.setJson('groups', st.groups); }
      continue;
    }
    const map = { list: st.lists, item: st.items, recipe: st.recipes, product: st.products, trip: st.trips }[e.t];
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
  const code = st.code;
  if (!code) return;
  try {
    const r = await fetch('/api/state', { headers: authHeaders(code) });
    if (r.status === 401) return unauthorized(code);
    if (!r.ok || code !== st.code) return;
    setState(await r.json());
    for (const op of myOps()) applyLocal(op);
    saveCache();
    render();
  } catch { /* offline: restiamo sulla cache */ }
}

function unauthorized(code) {
  const g = st.groups.find((x) => x.code === code);
  toast(`Il codice del gruppo ${g ? '"' + g.name + '" ' : ''}non è più valido`);
  leaveGroup(code);
}

// =============================================================== tempo reale
// Stream SSE dal server (su Vercel la funzione lo chiude dopo qualche minuto e il browser
// si riconnette da solo). Finché lo stream non è attivo ci aggiorniamo a intervalli.
let rt = null;
let downTimer = null;
let pollTimer = null;

function setLive(v) {
  clearTimeout(downTimer);
  if (v) { st.live = true; updateStatus(); return; }
  downTimer = setTimeout(() => { st.live = false; updateStatus(); }, 4000);
}

function connect() {
  if (rt) { rt.close(); rt = null; }
  if (!st.code) return;
  const es = new EventSource('/api/events?k=' + encodeURIComponent(st.code));
  rt = es;
  es.addEventListener('hello', () => { setLive(true); loadState(); flush(); });
  es.onmessage = (e) => {
    if (rt !== es) return;
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (Array.isArray(msg)) applyEvents(msg);
    else if (msg && msg.reload) loadState();
  };
  es.onerror = () => {
    if (rt !== es) return;
    setLive(false);
    if (es.readyState === EventSource.CLOSED) setTimeout(() => { if (rt === es) connect(); }, 5000);
  };
  if (!pollTimer) {
    pollTimer = setInterval(() => {
      if (!st.live && st.code && document.visibilityState === 'visible' && navigator.onLine) loadState();
    }, 10000);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !st.code) return;
  // I telefoni chiudono le connessioni in background: al ritorno ci riallineiamo.
  if (!rt || rt.readyState === EventSource.CLOSED) connect(); else loadState();
  flush();
});
window.addEventListener('online', () => { connect(); flush(); });
window.addEventListener('offline', () => { clearTimeout(downTimer); st.live = false; updateStatus(); });

function updateStatus() {
  const dot = $('#status'), pend = $('#pending');
  if (!dot) return;
  dot.className = 'status ' + (st.live ? 'live' : 'off');
  dot.title = st.live ? 'Sincronizzato in tempo reale' : 'Non connesso: le modifiche verranno inviate appena possibile';
  const n = myOps().length;
  if (pend) pend.textContent = n ? `${n} in attesa` : '';
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
  sheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
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
// Chiude il pannello e passa a un'altra pagina senza lasciare voci nella cronologia.
function closeSheetAndGo(hash) {
  closeSheet(true);
  history.replaceState(null, '', hash);
  mount();
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
  return `<nav class="tabs">${t('lists', '#/', I.cart, 'Liste')}${t('recipes', '#/r', I.book, 'Ricette')}${t('trips', '#/t', I.receipt, 'Spese')}${t('settings', '#/s', I.gear, 'Altro')}</nav>`;
}

function unitOptions(sel) {
  const u = S.normUnit(sel);
  const all = S.UNITS.includes(u) ? S.UNITS : S.UNITS.concat([u]);
  return all.map((x) => `<option value="${h(x)}" ${x === u ? 'selected' : ''}>${x || '—'}</option>`).join('');
}
function deptOptions(sel) {
  return S.DEPARTMENTS.map((d) => `<option value="${d.id}" ${d.id === (sel || '') ? 'selected' : ''}>${d.emoji} ${h(d.label)}</option>`).join('');
}
function brandDatalist() {
  const brands = [...new Set([...st.products.values()].map((x) => x.brand).filter(Boolean))].sort();
  return `<datalist id="brands">${brands.map((b) => `<option value="${h(b)}">`).join('')}</datalist>`;
}
const tagPills = (tags) => (tags || []).map((t) => `<span class="tag">#${h(t)}</span>`).join('');

// Campo tag: testo libero separato da virgole + chip dei tag già usati da toccare.
function tagField(name, tags) {
  const known = allTags();
  return `<label class="field"><span>Tag</span>
    <input class="input" name="${name}" placeholder="es. bio, offerta, per Luca" value="${h((tags || []).join(', '))}" autocapitalize="none"></label>
    ${known.length ? `<div class="chips tag-pick" data-for="${name}">${known.map((t) => `<button type="button" class="chip sm ${(tags || []).includes(t) ? 'on' : ''}" data-tag="${h(t)}">#${h(t)}</button>`).join('')}</div>` : ''}`;
}
function bindTagField(root, name) {
  const input = root.querySelector(`[name="${name}"]`);
  const pick = root.querySelector(`.tag-pick[data-for="${name}"]`);
  if (!input || !pick) return;
  const sync = () => {
    const cur = parseTags(input.value);
    pick.querySelectorAll('[data-tag]').forEach((b) => b.classList.toggle('on', cur.includes(b.dataset.tag)));
  };
  input.addEventListener('input', sync);
  pick.onclick = (e) => {
    const b = e.target.closest('[data-tag]'); if (!b) return;
    let cur = parseTags(input.value);
    cur = cur.includes(b.dataset.tag) ? cur.filter((t) => t !== b.dataset.tag) : cur.concat(b.dataset.tag);
    input.value = cur.join(', ');
    sync();
  };
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

// =============================================================== router
// Le viste si registrano in `Views`; ognuna ha mount() e opzionalmente update().
const Views = {};
let view = null;
const app = $('#app');

function parseRoute() {
  const shared = location.pathname.match(/^\/r\/([A-Za-z0-9_-]{16,64})\/?$/);
  if (shared) return { name: 'shared', token: shared[1] };
  const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (p[0] === 'l' && p[1]) return { name: 'list', id: p[1] };
  if (p[0] === 'r' && p[1] && p[2] === 'edit') return { name: 'recipeEdit', id: p[1] };
  if (p[0] === 'r' && p[1]) return { name: 'recipe', id: p[1] };
  if (p[0] === 'r') return { name: 'recipes' };
  if (p[0] === 't' && p[1]) return { name: 'trip', id: p[1] };
  if (p[0] === 't') return { name: 'trips' };
  if (p[0] === 'p') return { name: 'products' };
  if (p[0] === 's') return { name: 'settings' };
  return { name: 'home' };
}

function mount() {
  closeSheet(true);
  const r = parseRoute();
  if (r.name === 'shared') view = Views.shared;
  else if (!st.code) view = Views.welcome;
  else view = Views[r.name] || Views.home;
  view.route = r;
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

window.addEventListener('hashchange', () => {
  // Dalla pagina di una ricetta condivisa (/r/…) si torna all'app normale.
  if (location.pathname !== '/') { history.replaceState(null, '', '/' + location.hash); }
  mount();
});
