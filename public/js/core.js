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
  cal: svg('<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'),
  pin: svg('<path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  download: svg('<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>'),
  logout: svg('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  bell: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
  home: svg('<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>'),
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
  member: '', // alias nel gruppo attivo (vedi memberFor)
  household: null,
  lists: new Map(),
  items: new Map(),
  recipes: new Map(),
  products: new Map(), // chiave: nome normalizzato
  trips: new Map(),
  events: new Map(),   // eventi del gruppo attivo (con le risposte)
  menuEntries: new Map(), // menu "La faccio": ricette da preparare (con le persone)
  menuMarks: new Map(),   // scelte condivise per ingrediente: 'have' (Ce l'ho) / 'buy' (Da comprare)
  menuRecipes: new Map(), // ricette pubbliche di altri gruppi presenti nel menu
  bookmarks: new Map(),   // preferite della persona (recipe_id -> { name, author_name, recipe | null, gone })
  me: null,            // io nel gruppo attivo (ruolo, relazione, stato)
  members: new Map(),  // membri del gruppo attivo (con presenza)
  notice: null,        // avviso da mostrare (es. rimozione dal gruppo)
  outbox: ls.json('outbox', []),
  live: false,
};
st.code = st.groups.some((g) => g.code === ls.get('active')) ? ls.get('active') : (st.groups[0] && st.groups[0].code) || null;

// Ogni gruppo può avere un alias diverso; "member" è il nome predefinito per i gruppi nuovi.
function memberFor(code) {
  const g = st.groups.find((x) => x.code === code);
  return (g && g.alias) || ls.get('member') || '';
}
function setMember(alias) {
  st.member = alias;
  ls.set('member', alias);
  const g = st.groups.find((x) => x.code === st.code);
  if (g) { g.alias = alias; ls.setJson('groups', st.groups); }
}
st.member = memberFor(st.code);

const myOps = () => st.outbox.filter((o) => o.g === st.code);
// Ogni gruppo salvato sul telefono: { code (chiave locale), hid, name, alias, token, memberId, role, status }.
// "code" è il codice con cui il gruppo è stato aggiunto e resta la chiave locale anche se viene rigenerato;
// il codice da condividere è sempre quello attuale del gruppo (inviteCode).
const groupOf = (code) => st.groups.find((g) => g.code === code);
// Gruppo personale: solo tuo, niente membri, inviti, presenza o assegnazioni.
// Una ricetta usabile da questo gruppo: sua, pubblica nel menu, tra le preferite o già aperta.
const recipeById = (id) => st.recipes.get(id) || st.menuRecipes.get(id) || ((st.bookmarks.get(id) || {}).recipe) || (typeof pubCache !== 'undefined' && pubCache.get(id)) || null;
// Parte pubblica delle ricette (Scopri, preferite, Ricettari, pagine web): decisa dal server (PUBLIC_RECIPES).
const publicOn = () => !!(st.features && st.features.public_recipes);
// Ricettario: un gruppo di sole ricette, tutte pubbliche e firmate con il suo nome.
const isCookbook = (code = st.code) => ((groupOf(code) || {}).kind || (code === st.code && st.household && st.household.kind)) === 'cookbook';
const isPersonal = (code = st.code) => !!((groupOf(code) || {}).personal || (code === st.code && st.household && st.household.personal));
// I gruppi in ordine: prima quello personale, poi gli altri come sono stati aggiunti.
const orderedGroups = () => [...st.groups].sort((a, b) => (b.personal ? 1 : 0) - (a.personal ? 1 : 0));
const groupBadge = (g, cls = '') => `<span class="avatar ${g && g.personal ? 'personal' : ''} ${g && g.kind === 'cookbook' ? 'cookbook' : ''} ${cls}">${g && g.personal ? icon('me') : g && g.kind === 'cookbook' ? icon('book') : h(((g && g.name) || '?').slice(0, 1).toUpperCase())}</span>`;
const tokenFor = (code) => (groupOf(code) || {}).token;
const saveGroups = () => ls.setJson('groups', st.groups);
const inviteCode = () => (st.household && st.household.code) || st.code;
const isAdmin = () => !!(st.me ? st.me.role === 'admin' : groupOf(st.code) && !tokenFor(st.code));
const isPendingGroup = (code = st.code) => (groupOf(code) || {}).status === 'pending';
const pendingRequests = () => (isAdmin() ? [...st.members.values()].filter((m) => m.status === 'pending').length : 0);
const groupName = () => (st.household && st.household.name) || (st.groups.find((g) => g.code === st.code) || {}).name || '';

function setState(j) {
  st.household = j.household;
  st.lists = new Map((j.lists || []).map((x) => [x.id, x]));
  st.items = new Map((j.items || []).map((x) => [x.id, x]));
  st.recipes = new Map((j.recipes || []).map((x) => [x.id, x]));
  st.products = new Map((j.products || []).map((x) => [x.key, x]));
  st.trips = new Map((j.trips || []).map((x) => [x.id, x]));
  st.events = new Map((j.events || []).map((x) => [x.id, x]));
  st.menuEntries = new Map(((j.menu && j.menu.entries) || []).map((x) => [x.id, x]));
  st.menuMarks = new Map(((j.menu && j.menu.marks) || []).map((x) => [x.key, x]));
  st.menuRecipes = new Map(((j.menu && j.menu.recipes) || []).map((x) => [x.id, x]));
  st.bookmarks = new Map((j.bookmarks || []).map((x) => [x.recipe_id, x]));
  st.me = j.me || null;
  st.platformAdmin = !!j.platform_admin;
  st.features = j.features || {};
  st.members = new Map((j.members || []).map((x) => [x.id, x]));
  // Aggiorna i dati del gruppo salvati sul telefono.
  const g = groupOf(st.code);
  if (g) {
    if (j.household) { g.name = j.household.name; g.hid = j.household.id; g.personal = !!j.household.personal; g.kind = j.household.kind || 'group'; }
    if (j.me) Object.assign(g, { alias: j.me.alias, role: j.me.role, status: j.me.status, memberId: j.me.id });
    saveGroups();
    if (j.me) st.member = j.me.alias;
  }
}

function clearState() {
  st.household = null;
  for (const k of ['lists', 'items', 'recipes', 'products', 'trips', 'members', 'events', 'menuEntries', 'menuMarks', 'menuRecipes', 'bookmarks']) st[k] = new Map();
  st.me = null;
}

let cacheTimer = null;
function writeCache() {
  clearTimeout(cacheTimer);
  cacheTimer = null;
  if (!st.code || !st.household) return;
  ls.setJson('cache.' + st.code, {
    household: st.household, lists: [...st.lists.values()], items: [...st.items.values()],
    recipes: [...st.recipes.values()], products: [...st.products.values()], trips: [...st.trips.values()],
    events: [...st.events.values()], menu: { entries: [...st.menuEntries.values()], marks: [...st.menuMarks.values()], recipes: [...st.menuRecipes.values()] },
    bookmarks: [...st.bookmarks.values()], platform_admin: st.platformAdmin, features: st.features, me: st.me, members: [...st.members.values()],
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

// Aggiunge (o aggiorna) un gruppo sul telefono e lo rende attivo.
// j: stato del gruppo (o almeno { household }); auth: { token, me } ricevuti entrando.
function addGroup(j, auth = {}) {
  const hh = j.household;
  let g = st.groups.find((x) => (hh.id && x.hid === hh.id) || x.code === hh.code);
  if (!g) { g = { code: hh.code }; st.groups.push(g); }
  const me = auth.me || j.me;
  Object.assign(g, {
    hid: hh.id || g.hid, name: hh.name, token: auth.token || g.token, personal: !!hh.personal, kind: hh.kind || g.kind || 'group',
    alias: (me && me.alias) || g.alias || st.member || ls.get('member') || '',
    memberId: me ? me.id : g.memberId, role: me ? me.role : g.role, status: me ? me.status : g.status || 'active',
  });
  saveGroups();
  if (cacheTimer) writeCache();
  st.code = g.code;
  ls.set('active', g.code);
  st.member = memberFor(g.code);
  if (g.status === 'pending') { clearState(); st.household = hh; st.me = me || null; if (rt) { rt.close(); rt = null; } return; }
  setState(j);
  for (const op of myOps()) applyLocal(op);
  writeCache();
  connect();
  // Nuovo gruppo: notifiche push anche qui e panoramica aggiornata.
  if (typeof syncPush === 'function') { syncPush([g.code]); refreshOverview(true); }
}

function switchGroup(code, hash = '#/l') {
  if (code === st.code) { location.hash = hash; return; }
  if (cacheTimer) writeCache();
  st.code = code;
  ls.set('active', code);
  st.member = memberFor(code);
  loadGroupFromCache();
  history.replaceState(null, '', hash);
  connect();
  flush();
  mount();
}

// Toglie il gruppo da questo telefono (dati locali e modifiche in coda).
function dropGroup(code) {
  st.groups = st.groups.filter((g) => g.code !== code);
  saveGroups();
  st.outbox = st.outbox.filter((o) => o.g !== code);
  saveOutbox();
  ls.set('cache.' + code, null);
  ls.set('lastList.' + code, null);
  if (code !== st.code) { if (view && view.update) render(); return; }
  if (rt) { rt.close(); rt = null; }
  st.code = st.groups[0] ? st.groups[0].code : null;
  ls.set('active', st.code);
  st.member = memberFor(st.code);
  if (st.code) { loadGroupFromCache(); connect(); } else clearState();
  history.replaceState(null, '', '/#/');
  mount();
}

// Uscire da un gruppo (azione della persona): lo comunica al server, poi pulisce il telefono.
async function leaveGroup(code) {
  if (tokenFor(code)) await api('POST', '/api/me/leave', {}, code);
  dropGroup(code);
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
      st.lists.set(op.id, { ...(ex || { id: op.id, emoji: 'cart', position: t, sort_mode: 'manual', created_at: t }), ...op.data, updated_at: t });
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
    case 'event.put': {
      const ex = st.events.get(op.id);
      const me = st.me && st.me.id;
      st.events.set(op.id, {
        ...(ex || { id: op.id, time: '', end_time: '', location: '', notes: '', icon: 'party', created_by: st.member, created_by_id: me || null, created_at: t,
          participants: me ? [{ member_id: me, rsvp: 'yes', guests: 0, note: '', updated_at: t }] : [] }),
        ...op.data, updated_at: t,
      });
      break;
    }
    case 'bm.put': st.bookmarks.set(op.id, { ...op.data, recipe_id: op.id }); break;
    case 'bm.del': st.bookmarks.delete(op.id); break;
    case 'menu.put': {
      if (op.data.recipe) st.menuRecipes.set(op.data.recipe.id, op.data.recipe);
      const ex = st.menuEntries.get(op.id);
      st.menuEntries.set(op.id, { ...(ex || { id: op.id, added_by: st.member, created_at: t }), ...op.data, updated_at: t });
      break;
    }
    case 'menu.del': st.menuEntries.delete(op.id); break;
    case 'menu.clear': st.menuEntries.clear(); st.menuMarks.clear(); break;
    case 'mark.put':
      if (op.data.state) st.menuMarks.set(op.id, { key: op.id, state: op.data.state, updated_at: t });
      else st.menuMarks.delete(op.id);
      break;
    case 'event.del':
      st.events.delete(op.id);
      for (const l of st.lists.values()) if (l.event_id === op.id) l.event_id = null;
      break;
    case 'event.rsvp': {
      const ev = st.events.get(op.id);
      const me = st.me && st.me.id;
      if (!ev || !me) break;
      const p = { member_id: me, rsvp: op.data.rsvp, guests: op.data.rsvp === 'no' ? 0 : op.data.guests || 0, note: op.data.note || '', updated_at: t };
      st.events.set(op.id, { ...ev, participants: ev.participants.filter((x) => x.member_id !== me).concat(p) });
      break;
    }
  }
}

function opRequest(op) {
  switch (op.k) {
    case 'list.put': return ['PUT', `/api/lists/${op.id}`, op.data];
    case 'list.del': return ['DELETE', `/api/lists/${op.id}`];
    case 'list.clear': return ['POST', `/api/lists/${op.id}/clear-checked`];
    case 'list.close': return ['POST', `/api/lists/${op.id}/close`, { ...op.data, trip_id: op.trip, by: op.by || st.member }];
    case 'item.put': return ['PUT', `/api/items/${op.id}`, { ...op.data, by: op.by || st.member }];
    case 'item.del': return ['DELETE', `/api/items/${op.id}`];
    case 'product.put': return ['POST', '/api/products', { ...op.data, key: op.id }];
    case 'product.del': return ['POST', '/api/products/delete', { key: op.id }];
    case 'recipe.put': return ['PUT', `/api/recipes/${op.id}`, op.data];
    case 'recipe.del': return ['DELETE', `/api/recipes/${op.id}`];
    case 'trip.put': return ['PUT', `/api/trips/${op.id}`, op.data];
    case 'trip.del': return ['DELETE', `/api/trips/${op.id}`];
    case 'hh.put': return ['PATCH', '/api/household', op.data];
    case 'event.put': return ['PUT', `/api/events/${op.id}`, op.data];
    case 'menu.put': return ['PUT', `/api/menu/${op.id}`, { recipe_id: op.data.recipe_id, servings: op.data.servings }];
    case 'bm.put': return ['PUT', `/api/bookmarks/${op.id}`, {}];
    case 'bm.del': return ['DELETE', `/api/bookmarks/${op.id}`];
    case 'menu.del': return ['DELETE', `/api/menu/${op.id}`];
    case 'menu.clear': return ['POST', '/api/menu/clear', {}];
    case 'mark.put': return ['PUT', '/api/menu/marks', { key: op.id, state: op.data.state || null }];
    case 'event.del': return ['DELETE', `/api/events/${op.id}`];
    case 'event.rsvp': return ['POST', `/api/events/${op.id}/rsvp`, op.data];
  }
  return null;
}

function enqueue(op, { silent } = {}) {
  op.g = st.code;
  op.by = st.member; // l'alias del gruppo, anche se la coda parte dopo un cambio di gruppo
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
const authHeaders = (code = st.code) => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + (tokenFor(code) || code) });

// Richiesta diretta (non in coda): per foto, condivisione e operazioni che richiedono la rete.
async function api(method, url, body, code = st.code) {
  let res;
  try {
    res = await fetch(url, { method, headers: authHeaders(code), body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error('Serve la connessione a internet'); }
  const j = await res.json().catch(() => ({}));
  if (res.status === 401 && groupOf(code) && ['removed', 'rejected', 'legacy_expired'].includes(j.code)) unauthorized(code, j.code);
  if (!res.ok) { const err = new Error(j.error || 'Operazione non riuscita'); err.code = j.code; err.status = res.status; throw err; }
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
      if (res.status === 401) {
        const j = await res.json().catch(() => ({}));
        unauthorized(op.g, j.code);
        continue;
      }
      if (res.status === 403) {
        const j = await res.clone().json().catch(() => ({}));
        if (j.code === 'pending') { scheduleRetry(); break; }
      }
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
  if (evs.some((e) => e && e.t === 'reload')) setTimeout(loadState, 0);
  for (const e of evs) {
    if (!e || e.t === 'reload') continue;
    const id = e.id || (e.data && (e.data.id || e.data.key));
    if (isPending(id)) continue; // c'è una nostra modifica più recente in coda
    if (e.t === 'household') {
      st.household = { ...st.household, ...e.data };
      const g = groupOf(st.code);
      if (g) { g.name = e.data.name; saveGroups(); }
      continue;
    }
    if (e.t === 'members') { refreshMembers(); continue; }
    if (e.t === 'presence') {
      const m = st.members.get(e.id);
      if (m) Object.assign(m, { online: e.online, viewing: e.viewing ?? m.viewing, last_seen: e.last_seen });
      continue;
    }
    if (e.t === 'group_deleted') { if (!deletingGroup) { unauthorized(st.code, 'deleted', e.by); return; } continue; }
    if (e.t === 'kick') { if (st.me && e.id === st.me.id) { unauthorized(st.code, 'removed'); return; } continue; }
    if (e.t === 'joined') { if (!st.me || e.id !== st.me.id) toast(`${e.alias} è entrato nel gruppo`); continue; }
    if (e.t === 'invites') { if (view === Views.members && Views.members.loadInvites) Views.members.loadInvites(); continue; }
    if (e.t === 'notify') { if (st.me && e.to === st.me.id) onNotifySignal(); continue; }
    const map = { list: st.lists, item: st.items, recipe: st.recipes, product: st.products, trip: st.trips, event: st.events, menu: st.menuEntries, mark: st.menuMarks }[e.t];
    if (!map) continue;
    if (e.op === 'put') {
      const prev = map.get(id);
      if (e.t === 'menu' && e.data.recipe) { st.menuRecipes.set(e.data.recipe.id, e.data.recipe); delete e.data.recipe; }
      map.set(id, e.data);
      if (e.t === 'item' && prev && !prev.checked && e.data.checked === false && prev.qty !== e.data.qty) flashIds.add(id);
      if (e.t === 'item' && !prev) flashIds.add(id);
    } else {
      map.delete(id);
      if (e.t === 'list') for (const [iid, it] of st.items) if (it.list_id === id) st.items.delete(iid);
      if (e.t === 'event') for (const l of st.lists.values()) if (l.event_id === id) l.event_id = null;
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
    if (r.status === 401) { const j = await r.json().catch(() => ({})); return unauthorized(code, j.code); }
    if (r.status === 403) {
      const j = await r.json().catch(() => ({}));
      if (j.code === 'pending') { const g = groupOf(code); if (g && g.status !== 'pending') { g.status = 'pending'; saveGroups(); mount(); } }
      return;
    }
    if (!r.ok || code !== st.code) return;
    setState(await r.json());
    for (const op of myOps()) applyLocal(op);
    saveCache();
    render();
  } catch { /* offline: restiamo sulla cache */ }
}

// Il server non riconosce più questo telefono nel gruppo: rimosso, richiesta rifiutata,
// oppure fine del periodo di transizione dalla versione 2.
let deletingGroup = false; // l'eliminazione l'ha chiesta questo dispositivo
function unauthorized(code, reason, by) {
  const g = groupOf(code);
  if (!g) return;
  if (!g.token && !reason) reason = 'legacy_expired';
  st.notice = { name: g.name, reason: reason || 'removed', code: g.code, by: by || '' };
  dropGroup(code);
}

// Elenco dei membri aggiornato (con un piccolo ritardo per raggruppare più segnali).
let membersTimer = null;
function refreshMembers() {
  clearTimeout(membersTimer);
  membersTimer = setTimeout(async () => {
    if (!tokenFor(st.code) || isPendingGroup()) return;
    try {
      const code = st.code;
      const j = await api('GET', '/api/members');
      if (code !== st.code) return;
      st.members = new Map(j.members.map((m) => [m.id, m]));
      st.household = { ...st.household, ...j.household };
      const me = st.me && st.members.get(st.me.id);
      if (me) { st.me = { ...st.me, ...me }; Object.assign(groupOf(code) || {}, { role: me.role, alias: me.alias }); saveGroups(); st.member = me.alias; }
      saveCache();
      render();
    } catch { /* offline */ }
  }, 250);
}

// Presenza: dico al gruppo quale lista sto guardando (per "chi c'è in questa lista").
let lastViewing = { code: null, id: null, at: 0 };
function reportViewing(listId = '') {
  if (!tokenFor(st.code) || isPendingGroup() || !navigator.onLine) return;
  const t = Date.now();
  if (lastViewing.code === st.code && lastViewing.id === listId && t - lastViewing.at < 25000) return;
  lastViewing = { code: st.code, id: listId, at: t };
  api('POST', '/api/me/presence', { viewing: listId }).catch(() => {});
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
  if (!st.code || isPendingGroup()) return;
  const es = new EventSource('/api/events?k=' + encodeURIComponent(tokenFor(st.code) || st.code));
  rt = es;
  es.addEventListener('hello', () => { setLive(true); loadState(); flush(); });
  es.addEventListener('kicked', () => { if (rt === es) { es.close(); rt = null; unauthorized(st.code, 'removed'); } });
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

// Numero sull'icona dell'app installata: avvisi non letti di tutti i gruppi (dove il browser lo supporta).
let iconBadge = -1;
function setIconBadge(n) {
  if (n === iconBadge || !('setAppBadge' in navigator)) return;
  iconBadge = n;
  try { (n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {}); } catch { /* non supportato */ }
}

function updateStatus() {
  const dot = $('#status'), pend = $('#pending');
  if (!dot) return;
  dot.className = 'status ' + (st.live ? 'live' : 'off');
  dot.title = st.live ? 'Sincronizzato in tempo reale' : 'Non connesso: le modifiche verranno inviate appena possibile';
  const gn = $('.nav-group .g-name');
  if (gn) gn.textContent = groupName();
  const pr = pendingRequests();
  document.querySelectorAll('[data-badge]').forEach((b) => { b.hidden = !pr; b.textContent = pr || ''; });
  const nu = typeof unreadTotal === 'function' ? unreadTotal() : 0;
  document.querySelectorAll('[data-nbadge]').forEach((b) => { b.hidden = !nu; b.textContent = nu > 99 ? '99+' : nu || ''; });
  setIconBadge(nu);
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

// Barra di navigazione: in basso sul telefono, laterale su tablet e desktop (vedi CSS).
function tabBar(active) {
  // data-badge: numero di richieste di accesso in attesa (solo per gli amministratori).
  const t = (id, href, icon, label, cls = '', badge = false) => `<a href="${href}" class="${active === id ? 'on' : ''} ${cls}" title="${label}">${icon}<span>${label}</span>${badge === 'n' ? '<i class="tab-badge" data-nbadge hidden></i>' : badge ? '<i class="tab-badge" data-badge hidden></i>' : ''}</a>`;
  const g = groupName();
  return `<nav class="tabs">
    <button type="button" class="nav-group wide-only" id="nav-grp" title="Cambia gruppo">${groupBadge(groupOf(st.code) || { name: g })}<span class="g-name">${h(g)}</span>${I.down}</button>
    ${t('home', '#/', I.home, 'Panoramica', '', 'n')}${isCookbook() ? '' : t('lists', '#/l', I.cart, 'Liste') + t('events', '#/e', I.cal, 'Eventi')}${t('recipes', '#/r', I.book, 'Ricette')}${isCookbook() ? '' : t('trips', '#/t', I.receipt, 'Spese', 'wide-only')}
    ${isCookbook() ? '' : t('products', '#/p', icon('tag'), 'Prodotti', 'wide-only')}${isPersonal() ? '' : t('members', '#/m', I.users, 'Membri', 'wide-only', true)}${t('settings', '#/s', I.gear, 'Altro', 'narrow-only', true)}${t('settings', '#/s', I.gear, 'Altro', 'wide-only')}</nav>`;
}

// --------------------------------------------------------------- schermi larghi
// Fasce: telefono (< 760 px), tablet con barra laterale a icone (>= 760), colonna con
// l'elenco accanto al contenuto (>= 1000), barra laterale completa (>= 1240).
const mqRail = matchMedia('(min-width: 760px)');
const mqPane = matchMedia('(min-width: 1000px)');
const hasPane = () => mqPane.matches;
let layoutKey = `${mqRail.matches}${mqPane.matches}`;
const onLayoutChange = () => {
  const k = `${mqRail.matches}${mqPane.matches}`;
  if (k !== layoutKey) { layoutKey = k; if (st.code && !sheetOpen && !dragging) mount(); }
};
mqRail.addEventListener('change', onLayoutChange);
mqPane.addEventListener('change', onLayoutChange);

// Scorciatoie da tastiera: "/" per scrivere (aggiunta rapida o ricerca), Esc chiude i pannelli.
document.addEventListener('keydown', (e) => {
  const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
  if (e.key === 'Escape' && sheetOpen) { e.preventDefault(); closeSheet(); return; }
  if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) {
    const f = $('#qi') || $('#rq') || $('#pq');
    if (f) { e.preventDefault(); f.focus(); }
  }
});

function unitOptions(sel) {
  const u = S.normUnit(sel);
  const all = S.UNITS.includes(u) ? S.UNITS : S.UNITS.concat([u]);
  return all.map((x) => `<option value="${h(x)}" ${x === u ? 'selected' : ''}>${x || '—'}</option>`).join('');
}
// Scelta del reparto: griglia di icone (più comoda di una tendina sul telefono).
function deptPicker(name, sel) {
  return `<div class="field"><span>Reparto</span><input type="hidden" name="${name}" value="${h(sel || '')}">
    <div class="dept-pick" data-for="${name}">${S.DEPARTMENTS.map((d) => `<button type="button" data-dept="${d.id}" class="${d.id === (sel || '') ? 'on' : ''}">
      ${deptTile(d.id, 'sm')}<span>${h(d.label)}</span></button>`).join('')}</div></div>`;
}
function bindDeptPicker(root, name) {
  const input = root.querySelector(`[name="${name}"]`);
  const pick = root.querySelector(`.dept-pick[data-for="${name}"]`);
  const set = (v) => {
    input.value = v;
    pick.querySelectorAll('[data-dept]').forEach((b) => b.classList.toggle('on', b.dataset.dept === v));
  };
  pick.onclick = (e) => { const b = e.target.closest('[data-dept]'); if (b) set(b.dataset.dept); };
  return set;
}
const listOption = (l, cur) => `<option value="${l.id}" ${l.id === cur ? 'selected' : ''}>${h(l.name)}</option>`;
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

// =============================================================== codice d'invito
// Inserimento guidato: maiuscole automatiche, trattini inseriti da soli (XXXX-XXXX-XXXX),
// solo i caratteri ammessi nei codici (niente I, O, 0, 1, che si confondono).
const CODE_LEN = 12;
function cleanCode(v) {
  const s = String(v || '').toUpperCase();
  const link = s.match(/JOIN=([A-Z0-9-]+)/); // incollato un link d'invito intero
  return (link ? link[1] : s).replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ2-9]/g, '').slice(0, CODE_LEN);
}
const formatCode = (c) => c.replace(/(.{4})(?=.)/g, '$1-');
const normCode = (v) => formatCode(cleanCode(v));

function bindCodeInput(input, onChange) {
  Object.assign(input, { autocomplete: 'off', spellcheck: false, maxLength: CODE_LEN + 2 });
  input.setAttribute('autocapitalize', 'characters');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('inputmode', 'text');
  input.classList.add('code-input');
  let prev = input.value = normCode(input.value);
  const notify = () => onChange && onChange(cleanCode(input.value).length === CODE_LEN);
  input.addEventListener('input', (e) => {
    const raw = input.value;
    let clean, n;
    if (/JOIN=/i.test(raw)) { clean = cleanCode(raw); n = clean.length; }
    else {
      const caret = input.selectionStart == null ? raw.length : input.selectionStart;
      n = cleanCode(raw.slice(0, caret)).length; // caratteri validi prima del cursore
      clean = cleanCode(raw);
      // Cancellato solo un trattino: togliamo il carattere che lo precede (Backspace)
      // o quello che lo segue (Canc), altrimenti il trattino tornerebbe al suo posto.
      if (clean === cleanCode(prev)) {
        if (e.inputType === 'deleteContentBackward' && n > 0) { clean = clean.slice(0, n - 1) + clean.slice(n); n -= 1; }
        else if (e.inputType === 'deleteContentForward') clean = clean.slice(0, n) + clean.slice(n + 1);
      }
    }
    input.value = prev = formatCode(clean);
    const pos = n + Math.floor(Math.max(0, n - 1) / 4);
    try { input.setSelectionRange(pos, pos); } catch { /* campo non attivo */ }
    notify();
  });
  notify();
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
  // "Condividi con Sporta": il contenuto aspetta sul dispositivo e si apre la pagina per aggiungerlo.
  if (location.pathname === '/share') {
    const q = new URLSearchParams(location.search);
    ls.setJson('share', { title: q.get('title') || '', text: q.get('text') || '', url: q.get('url') || '', at: Date.now() });
    history.replaceState(null, '', '/#/share');
    return { name: 'shareIn' };
  }
  const invite = location.pathname.match(/^\/e\/([A-Za-z0-9_-]{16,64})\/?$/);
  if (invite) return { name: 'publicEvent', token: invite[1] };
  const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (p[0] === 'l' && p[1]) return { name: 'list', id: p[1] };
  if (p[0] === 'l') return { name: 'lists' };
  if (p[0] === 'n') return { name: 'notifs' };
  if (p[0] === 'go' && p[1] && p[2] === 'e') return { name: 'go', hid: p[1], event: p[3] || '' };
  if (p[0] === 'go' && p[1] && p[2] === 'm') return { name: 'go', hid: p[1], page: 'm' };
  if (p[0] === 'go' && p[1]) return { name: 'go', hid: p[1], list: p[2] || '', item: p[3] || '' };
  if (p[0] === 'e' && p[1]) return { name: 'event', id: p[1] };
  if (p[0] === 'e') return { name: 'events' };
  if (p[0] === 'r' && p[1] === 'scopri') return { name: 'discover' };
  if (p[0] === 'r' && p[1] === 'preferite') return { name: 'favorites' };
  if (p[0] === 'r' && p[1] === 'pub' && p[2]) return { name: 'pubRecipe', id: p[2] };
  if (p[0] === 'r' && p[1] && p[2] === 'edit') return { name: 'recipeEdit', id: p[1] };
  if (p[0] === 'r' && p[1]) return { name: 'recipe', id: p[1] };
  if (p[0] === 'r') return { name: 'recipes' };
  if (p[0] === 't' && p[1]) return { name: 'trip', id: p[1] };
  if (p[0] === 't') return { name: 'trips' };
  if (p[0] === 'p') return { name: 'products' };
  if (p[0] === 's') return { name: 'settings' };
  if (p[0] === 'm') return { name: 'members' };
  if (p[0] === 'a') return { name: 'account' };
  if (p[0] === 'share') return { name: 'shareIn' };
  if (p[0] === 'cook') return { name: 'cook' };
  if (p[0] === 'admin' && p[1] === 'gruppi') return { name: 'systemGroups' };
  if (p[0] === 'admin') return { name: 'reports' };
  return { name: 'home' };
}

function mount() {
  closeSheet(true);
  const r = parseRoute();
  if (r.name === 'shared') view = Views.shared;
  else if (r.name === 'publicEvent') view = Views.publicEvent;
  else if (st.notice) view = Views.notice;
  else if (!st.code) view = Views.welcome;
  // Account: condizioni da accettare, oppure conferma dell'email non più rimandabile.
  else if (acct && !acct.terms_ok) view = Views.terms;
  else if ((confirmState() || {}).overdue) view = Views.confirmEmail;
  else if (isPendingGroup()) view = Views.pending;
  else view = Views[r.name] || Views.home;
  // Contenuto condiviso in attesa (per esempio prima di entrare in Sporta): si riprende da lì.
  if (view !== Views.shareIn && st.code && !isPendingGroup() && [Views.home, Views.lists].includes(view) && ls.get('share')) {
    history.replaceState(null, '', '#/share');
    view = Views.shareIn; r.name = 'shareIn';
  }
  if (view === Views.members && isPersonal()) { history.replaceState(null, '', '#/s'); view = Views.settings; }
  // Parte pubblica spenta: Scopri, preferite e ricette di altri gruppi portano alle ricette del gruppo.
  if (!publicOn() && [Views.discover, Views.favorites, Views.pubRecipe].includes(view)) { history.replaceState(null, '', '#/r'); view = Views.recipes; }
  // Un ricettario ha solo ricette: liste, eventi e spese portano alle ricette.
  if (isCookbook() && [Views.lists, Views.list, Views.events, Views.event, Views.trips, Views.trip, Views.cook].includes(view)) { history.replaceState(null, '', '#/r'); view = Views.recipes; }
  // Con la colonna laterale l'elenco delle liste coincide con l'ultima lista aperta.
  if (view === Views.lists && hasPane() && st.lists.size) {
    history.replaceState(null, '', '#/l/' + lastListId());
    return mount();
  }
  view.route = r;
  view.mount();
  app.classList.toggle('has-pane', !!app.querySelector(':scope > .pane'));
  app.classList.toggle('with-nav', !!app.querySelector(':scope > .tabs'));
  const ng = $('#nav-grp');
  if (ng) ng.onclick = () => groupSheet();
  if (st.code && !isPendingGroup() && view !== Views.notice) reportViewing(view === Views.list ? r.id : '');
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
