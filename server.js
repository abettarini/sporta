'use strict';
// Server della lista della spesa: API REST + Server-Sent Events + file statici.
// Nessuna dipendenza esterna: richiede Node.js >= 22.5 (node:sqlite).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const Shared = require('./public/shared.js');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------- database
const db = new DatabaseSync(path.join(DATA_DIR, 'spesa.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '🛒', position REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    name TEXT NOT NULL, qty REAL, unit TEXT NOT NULL DEFAULT '', brand TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '', position REAL NOT NULL DEFAULT 0, checked INTEGER NOT NULL DEFAULT 0, checked_by TEXT NOT NULL DEFAULT '',
    checked_at INTEGER, created_by TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS items_list ON items(list_id);
  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name TEXT NOT NULL, servings INTEGER NOT NULL DEFAULT 4, notes TEXT NOT NULL DEFAULT '',
    ingredients TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS history (
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    key TEXT NOT NULL, name TEXT NOT NULL, unit TEXT NOT NULL DEFAULT '', brand TEXT NOT NULL DEFAULT '',
    count INTEGER NOT NULL DEFAULT 1, last_used INTEGER NOT NULL,
    PRIMARY KEY (household_id, key)
  );
`);

// Migrazione per database creati prima dell'ordinamento manuale.
if (!db.prepare("SELECT 1 FROM pragma_table_info('items') WHERE name = 'position'").get()) {
  db.exec('ALTER TABLE items ADD COLUMN position REAL NOT NULL DEFAULT 0');
}

const q = {
  hhByCode: db.prepare('SELECT * FROM households WHERE code = ?'),
  hhInsert: db.prepare('INSERT INTO households (id, code, name, created_at) VALUES (?, ?, ?, ?)'),
  hhRename: db.prepare('UPDATE households SET name = ? WHERE id = ?'),
  lists: db.prepare('SELECT * FROM lists WHERE household_id = ? ORDER BY position, created_at'),
  list: db.prepare('SELECT * FROM lists WHERE id = ?'),
  listInsert: db.prepare(`INSERT INTO lists (id, household_id, name, emoji, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`),
  listUpdate: db.prepare('UPDATE lists SET name = ?, emoji = ?, position = ?, updated_at = ? WHERE id = ?'),
  listDelete: db.prepare('DELETE FROM lists WHERE id = ?'),
  items: db.prepare('SELECT * FROM items WHERE household_id = ?'),
  item: db.prepare('SELECT * FROM items WHERE id = ?'),
  itemInsert: db.prepare(`INSERT INTO items (id, household_id, list_id, name, qty, unit, brand, note, position, checked,
    checked_by, checked_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  itemUpdate: db.prepare(`UPDATE items SET list_id = ?, name = ?, qty = ?, unit = ?, brand = ?, note = ?, position = ?, checked = ?,
    checked_by = ?, checked_at = ?, updated_at = ? WHERE id = ?`),
  itemDelete: db.prepare('DELETE FROM items WHERE id = ?'),
  checkedInList: db.prepare('SELECT id FROM items WHERE list_id = ? AND checked = 1'),
  recipes: db.prepare('SELECT * FROM recipes WHERE household_id = ? ORDER BY name COLLATE NOCASE'),
  recipe: db.prepare('SELECT * FROM recipes WHERE id = ?'),
  recipeInsert: db.prepare(`INSERT INTO recipes (id, household_id, name, servings, notes, ingredients, created_at,
    updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
  recipeUpdate: db.prepare(`UPDATE recipes SET name = ?, servings = ?, notes = ?, ingredients = ?, updated_at = ?
    WHERE id = ?`),
  recipeDelete: db.prepare('DELETE FROM recipes WHERE id = ?'),
  history: db.prepare('SELECT name, unit, brand, count FROM history WHERE household_id = ? ORDER BY count DESC, last_used DESC LIMIT 500'),
  historyUpsert: db.prepare(`INSERT INTO history (household_id, key, name, unit, brand, count, last_used)
    VALUES (?, ?, ?, ?, ?, 1, ?) ON CONFLICT(household_id, key) DO UPDATE SET
    name = excluded.name, unit = CASE WHEN excluded.unit <> '' THEN excluded.unit ELSE unit END,
    brand = CASE WHEN excluded.brand <> '' THEN excluded.brand ELSE brand END,
    count = count + 1, last_used = excluded.last_used`),
};

// ---------------------------------------------------------------- helpers
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  let s = '';
  const bytes = crypto.randomBytes(12);
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const str = (v, max = 200) => (v == null ? '' : String(v).slice(0, max).trim());
const now = () => Date.now();

function itemOut(r) {
  return { ...r, checked: !!r.checked };
}
function recipeOut(r) {
  let ingredients = [];
  try { ingredients = JSON.parse(r.ingredients); } catch { /* ignora */ }
  return { ...r, ingredients };
}

class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

function send(res, status, body) {
  const data = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1e6) { reject(new HttpError(413, 'Richiesta troppo grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'JSON non valido')); }
    });
    req.on('error', reject);
  });
}

// Limite semplice ai tentativi di accesso con codice (anti forza bruta).
const attempts = new Map();
function checkRate(ip) {
  const t = now();
  const a = attempts.get(ip) || { n: 0, t };
  if (t - a.t > 10 * 60 * 1000) { a.n = 0; a.t = t; }
  a.n++;
  attempts.set(ip, a);
  if (a.n > 30) throw new HttpError(429, 'Troppi tentativi, riprova più tardi');
}

function auth(req, url) {
  const h = req.headers.authorization || '';
  const code = (h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('k') || '').trim().toUpperCase();
  const hh = code && q.hhByCode.get(code);
  if (!hh) {
    checkRate(req.socket.remoteAddress);
    throw new HttpError(401, 'Codice famiglia non valido');
  }
  return hh;
}

// ---------------------------------------------------------------- realtime (SSE)
const clients = new Map(); // household_id -> Set<res>

function broadcast(hid, events) {
  const set = clients.get(hid);
  if (!set || !events.length) return;
  const payload = `data: ${JSON.stringify(events)}\n\n`;
  for (const res of set) res.write(payload);
}

setInterval(() => {
  for (const set of clients.values()) for (const res of set) res.write(': ping\n\n');
}, 25000).unref();

function openStream(req, res, hh) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  res.write(`event: hello\ndata: ${JSON.stringify({ t: now() })}\n\n`);
  if (!clients.has(hh.id)) clients.set(hh.id, new Set());
  clients.get(hh.id).add(res);
  req.on('close', () => {
    const set = clients.get(hh.id);
    if (set) { set.delete(res); if (!set.size) clients.delete(hh.id); }
  });
}

// ---------------------------------------------------------------- handlers
function state(hh) {
  return {
    household: { id: hh.id, name: hh.name, code: hh.code },
    lists: q.lists.all(hh.id),
    items: q.items.all(hh.id).map(itemOut),
    recipes: q.recipes.all(hh.id).map(recipeOut),
    history: q.history.all(hh.id),
    serverTime: now(),
  };
}

function ownList(hh, id) {
  const l = q.list.get(id);
  if (!l || l.household_id !== hh.id) throw new HttpError(404, 'Lista non trovata');
  return l;
}

function putList(hh, id, b) {
  const t = now();
  const ex = q.list.get(id);
  if (ex && ex.household_id !== hh.id) throw new HttpError(404, 'Lista non trovata');
  if (ex) {
    q.listUpdate.run(
      b.name !== undefined ? str(b.name, 80) || ex.name : ex.name,
      b.emoji !== undefined ? str(b.emoji, 16) || '🛒' : ex.emoji,
      b.position !== undefined ? Number(b.position) || 0 : ex.position,
      t, id);
  } else {
    const name = str(b.name, 80);
    if (!name) throw new HttpError(400, 'Nome lista obbligatorio');
    q.listInsert.run(id, hh.id, name, str(b.emoji, 16) || '🛒', Number.isFinite(Number(b.position)) && b.position != null ? Number(b.position) : t, t, t);
  }
  return [{ t: 'list', op: 'put', data: q.list.get(id) }];
}

function putItem(hh, id, b) {
  const t = now();
  const ex = q.item.get(id);
  if (ex && ex.household_id !== hh.id) throw new HttpError(404, 'Articolo non trovato');
  const listId = b.list_id !== undefined ? String(b.list_id) : ex && ex.list_id;
  if (!listId) throw new HttpError(400, 'Lista obbligatoria');
  ownList(hh, listId);
  const pick = (k, fn) => (b[k] !== undefined ? fn(b[k]) : ex ? ex[k] : fn(undefined));
  const name = pick('name', (v) => str(v, 120));
  if (!name) throw new HttpError(400, 'Nome obbligatorio');
  const qty = pick('qty', (v) => Shared.parseNum(v));
  const unit = pick('unit', (v) => Shared.normUnit(str(v, 20)));
  const brand = pick('brand', (v) => str(v, 80));
  const note = pick('note', (v) => str(v, 300));
  // Posizione: numeri crescenti dall'alto verso il basso; i nuovi articoli vanno in cima.
  const position = pick('position', (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : -t));
  let checked = ex ? ex.checked : 0, checkedBy = ex ? ex.checked_by : '', checkedAt = ex ? ex.checked_at : null;
  if (b.checked !== undefined) {
    const c = b.checked ? 1 : 0;
    if (c !== checked) {
      checked = c;
      checkedBy = c ? str(b.by, 40) : '';
      checkedAt = c ? t : null;
    }
  }
  if (ex) {
    q.itemUpdate.run(listId, name, qty, unit, brand, note, position, checked, checkedBy, checkedAt, t, id);
  } else {
    q.itemInsert.run(id, hh.id, listId, name, qty, unit, brand, note, position, checked, checkedBy, checkedAt,
      str(b.by, 40), t, t);
  }
  if (!ex || ex.name !== name || (b.brand !== undefined && brand) || (b.unit !== undefined && unit)) {
    q.historyUpsert.run(hh.id, Shared.normName(name), name, unit, brand, t);
  }
  return [{ t: 'item', op: 'put', data: itemOut(q.item.get(id)) }];
}

function putRecipe(hh, id, b) {
  const t = now();
  const ex = q.recipe.get(id);
  if (ex && ex.household_id !== hh.id) throw new HttpError(404, 'Ricetta non trovata');
  const name = b.name !== undefined ? str(b.name, 120) : ex && ex.name;
  if (!name) throw new HttpError(400, 'Nome ricetta obbligatorio');
  const servings = b.servings !== undefined ? Math.max(1, Math.min(100, parseInt(b.servings, 10) || 1)) : ex ? ex.servings : 4;
  const notes = b.notes !== undefined ? str(b.notes, 5000) : ex ? ex.notes : '';
  let ingredients = ex ? ex.ingredients : '[]';
  if (b.ingredients !== undefined) {
    if (!Array.isArray(b.ingredients)) throw new HttpError(400, 'Ingredienti non validi');
    ingredients = JSON.stringify(b.ingredients.slice(0, 200).map((i) => ({
      name: str(i.name, 120),
      qty: Shared.parseNum(i.qty),
      unit: Shared.normUnit(str(i.unit, 20)),
      brand: str(i.brand, 80),
    })).filter((i) => i.name));
  }
  if (ex) q.recipeUpdate.run(name, servings, notes, ingredients, t, id);
  else q.recipeInsert.run(id, hh.id, name, servings, notes, ingredients, t, t);
  return [{ t: 'recipe', op: 'put', data: recipeOut(q.recipe.get(id)) }];
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // senza "api"
  const m = req.method;

  if (m === 'POST' && parts[0] === 'households' && parts.length === 1) {
    const b = await readBody(req);
    const name = str(b.name, 80) || 'Famiglia';
    const t = now();
    const hh = { id: crypto.randomUUID(), code: newCode(), name, created_at: t };
    q.hhInsert.run(hh.id, hh.code, hh.name, t);
    q.listInsert.run(crypto.randomUUID(), hh.id, 'Spesa', '🛒', t, t, t);
    return send(res, 201, state(hh));
  }

  const hh = auth(req, url);

  if (m === 'GET' && parts[0] === 'state') return send(res, 200, state(hh));
  if (m === 'GET' && parts[0] === 'events') return openStream(req, res, hh);

  if (m === 'PATCH' && parts[0] === 'household') {
    const b = await readBody(req);
    const name = str(b.name, 80);
    if (name) q.hhRename.run(name, hh.id);
    broadcast(hh.id, [{ t: 'household', op: 'put', data: { id: hh.id, name: name || hh.name, code: hh.code } }]);
    return send(res, 200, { ok: true });
  }

  const [kind, id, action] = parts;
  if (!id || !ID_RE.test(id)) throw new HttpError(404, 'Non trovato');
  let events;
  if (kind === 'lists') {
    if (m === 'PUT') events = putList(hh, id, await readBody(req));
    else if (m === 'DELETE') {
      const l = q.list.get(id);
      if (l && l.household_id === hh.id) q.listDelete.run(id);
      events = [{ t: 'list', op: 'del', id }];
    } else if (m === 'POST' && action === 'clear-checked') {
      ownList(hh, id);
      const ids = q.checkedInList.all(id).map((r) => r.id);
      db.exec('BEGIN');
      try { for (const i of ids) q.itemDelete.run(i); db.exec('COMMIT'); }
      catch (e) { db.exec('ROLLBACK'); throw e; }
      events = ids.map((i) => ({ t: 'item', op: 'del', id: i }));
    }
  } else if (kind === 'items') {
    if (m === 'PUT') events = putItem(hh, id, await readBody(req));
    else if (m === 'DELETE') {
      const it = q.item.get(id);
      if (it && it.household_id === hh.id) q.itemDelete.run(id);
      events = [{ t: 'item', op: 'del', id }];
    }
  } else if (kind === 'recipes') {
    if (m === 'PUT') events = putRecipe(hh, id, await readBody(req));
    else if (m === 'DELETE') {
      const r = q.recipe.get(id);
      if (r && r.household_id === hh.id) q.recipeDelete.run(id);
      events = [{ t: 'recipe', op: 'del', id }];
    }
  }
  if (!events) throw new HttpError(404, 'Non trovato');
  broadcast(hh.id, events);
  return send(res, 200, { events });
}

// ---------------------------------------------------------------- static
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || !path.extname(p)) p = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Non trovato'); }
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // Il service worker gestisce la cache offline; qui forziamo la rivalidazione.
      'Cache-Control': ext === '.png' ? 'public, max-age=604800' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
}

// ---------------------------------------------------------------- server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url);
    else { res.writeHead(405); res.end(); }
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Errore interno' : e.message });
    else res.end();
  }
});

server.listen(PORT, () => console.log(`Sporta in ascolto su http://localhost:${PORT}`));

function shutdown() {
  for (const set of clients.values()) for (const r of set) r.end();
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
