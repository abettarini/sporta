'use strict';
// Logica delle API, indipendente da database e canale in tempo reale.
// `db` espone: get(sql, params), all(sql, params), run(sql, params) — tutte async,
// con segnaposto "?". `realtime` espone: broadcast(householdId, events).

const crypto = require('node:crypto');
const Shared = require('../public/shared.js');

class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  let s = '';
  for (const b of crypto.randomBytes(12)) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const str = (v, max = 200) => (v == null ? '' : String(v).slice(0, max).trim());
const now = () => Date.now();
const num = (v) => (v == null ? v : Number(v));

function listOut(r) {
  return r && { ...r, position: num(r.position), created_at: num(r.created_at), updated_at: num(r.updated_at) };
}
function itemOut(r) {
  return r && {
    ...r, checked: !!Number(r.checked), qty: r.qty == null ? null : Number(r.qty), position: num(r.position),
    checked_at: r.checked_at == null ? null : Number(r.checked_at), created_at: num(r.created_at), updated_at: num(r.updated_at),
  };
}
function recipeOut(r) {
  if (!r) return r;
  let ingredients = [];
  try { ingredients = JSON.parse(r.ingredients); } catch { /* ignora */ }
  return { ...r, servings: Number(r.servings), ingredients, created_at: num(r.created_at), updated_at: num(r.updated_at) };
}

// Limite semplice ai tentativi con codice errato (anti forza bruta, per istanza).
const attempts = new Map();
function checkRate(ip) {
  const t = now();
  const a = attempts.get(ip) || { n: 0, t };
  if (t - a.t > 10 * 60 * 1000) { a.n = 0; a.t = t; }
  a.n++;
  attempts.set(ip, a);
  if (attempts.size > 10000) attempts.clear();
  if (a.n > 30) throw new HttpError(429, 'Troppi tentativi, riprova più tardi');
}

function createCore({ db, realtime, realtimeConfig }) {
  const SQL = {
    hhByCode: 'SELECT * FROM households WHERE code = ?',
    hhInsert: 'INSERT INTO households (id, code, name, created_at) VALUES (?, ?, ?, ?)',
    hhRename: 'UPDATE households SET name = ? WHERE id = ?',
    lists: 'SELECT * FROM lists WHERE household_id = ? ORDER BY position, created_at',
    list: 'SELECT * FROM lists WHERE id = ?',
    listInsert: `INSERT INTO lists (id, household_id, name, emoji, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    listUpdate: 'UPDATE lists SET name = ?, emoji = ?, position = ?, updated_at = ? WHERE id = ?',
    listDelete: 'DELETE FROM lists WHERE id = ?',
    items: 'SELECT * FROM items WHERE household_id = ?',
    item: 'SELECT * FROM items WHERE id = ?',
    itemInsert: `INSERT INTO items (id, household_id, list_id, name, qty, unit, brand, note, position, checked,
      checked_by, checked_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    itemUpdate: `UPDATE items SET list_id = ?, name = ?, qty = ?, unit = ?, brand = ?, note = ?, position = ?,
      checked = ?, checked_by = ?, checked_at = ?, updated_at = ? WHERE id = ?`,
    itemDelete: 'DELETE FROM items WHERE id = ?',
    clearChecked: 'DELETE FROM items WHERE list_id = ? AND checked = 1 RETURNING id',
    recipes: 'SELECT * FROM recipes WHERE household_id = ? ORDER BY lower(name)',
    recipe: 'SELECT * FROM recipes WHERE id = ?',
    recipeInsert: `INSERT INTO recipes (id, household_id, name, servings, notes, ingredients, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    recipeUpdate: 'UPDATE recipes SET name = ?, servings = ?, notes = ?, ingredients = ?, updated_at = ? WHERE id = ?',
    recipeDelete: 'DELETE FROM recipes WHERE id = ?',
    history: `SELECT name, unit, brand, count FROM history WHERE household_id = ?
      ORDER BY count DESC, last_used DESC LIMIT 500`,
    historyUpsert: `INSERT INTO history (household_id, key, name, unit, brand, count, last_used)
      VALUES (?, ?, ?, ?, ?, 1, ?) ON CONFLICT (household_id, key) DO UPDATE SET
      name = excluded.name,
      unit = CASE WHEN excluded.unit <> '' THEN excluded.unit ELSE history.unit END,
      brand = CASE WHEN excluded.brand <> '' THEN excluded.brand ELSE history.brand END,
      count = history.count + 1, last_used = excluded.last_used`,
  };

  async function auth(code, ip) {
    code = String(code || '').trim().toUpperCase();
    const hh = code && await db.get(SQL.hhByCode, [code]);
    if (!hh) {
      checkRate(ip);
      throw new HttpError(401, 'Codice famiglia non valido');
    }
    return hh;
  }

  async function state(hh) {
    const [lists, items, recipes, history] = await Promise.all([
      db.all(SQL.lists, [hh.id]), db.all(SQL.items, [hh.id]), db.all(SQL.recipes, [hh.id]), db.all(SQL.history, [hh.id]),
    ]);
    return {
      household: { id: hh.id, name: hh.name, code: hh.code },
      lists: lists.map(listOut),
      items: items.map(itemOut),
      recipes: recipes.map(recipeOut),
      history: history.map((x) => ({ ...x, count: Number(x.count) })),
      serverTime: now(),
    };
  }

  async function ownList(hh, id) {
    const l = await db.get(SQL.list, [id]);
    if (!l || l.household_id !== hh.id) throw new HttpError(404, 'Lista non trovata');
    return l;
  }

  async function putList(hh, id, b) {
    const t = now();
    const ex = listOut(await db.get(SQL.list, [id]));
    if (ex && ex.household_id !== hh.id) throw new HttpError(404, 'Lista non trovata');
    if (ex) {
      await db.run(SQL.listUpdate, [
        b.name !== undefined ? str(b.name, 80) || ex.name : ex.name,
        b.emoji !== undefined ? str(b.emoji, 16) || '🛒' : ex.emoji,
        b.position !== undefined && Number.isFinite(Number(b.position)) ? Number(b.position) : ex.position,
        t, id]);
    } else {
      const name = str(b.name, 80);
      if (!name) throw new HttpError(400, 'Nome lista obbligatorio');
      const pos = b.position != null && Number.isFinite(Number(b.position)) ? Number(b.position) : t;
      await db.run(SQL.listInsert, [id, hh.id, name, str(b.emoji, 16) || '🛒', pos, t, t]);
    }
    return [{ t: 'list', op: 'put', data: listOut(await db.get(SQL.list, [id])) }];
  }

  async function putItem(hh, id, b) {
    const t = now();
    const ex = itemOut(await db.get(SQL.item, [id]));
    if (ex && ex.household_id !== hh.id) throw new HttpError(404, 'Articolo non trovato');
    const listId = b.list_id !== undefined ? String(b.list_id) : ex && ex.list_id;
    if (!listId) throw new HttpError(400, 'Lista obbligatoria');
    await ownList(hh, listId);
    const pick = (k, fn) => (b[k] !== undefined ? fn(b[k]) : ex ? ex[k] : fn(undefined));
    const name = pick('name', (v) => str(v, 120));
    if (!name) throw new HttpError(400, 'Nome obbligatorio');
    const qty = pick('qty', (v) => Shared.parseNum(v));
    const unit = pick('unit', (v) => Shared.normUnit(str(v, 20)));
    const brand = pick('brand', (v) => str(v, 80));
    const note = pick('note', (v) => str(v, 300));
    // Posizione: crescente dall'alto verso il basso; senza indicazione l'articolo va in cima.
    const position = pick('position', (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : -t));
    let checked = ex ? (ex.checked ? 1 : 0) : 0;
    let checkedBy = ex ? ex.checked_by : '', checkedAt = ex ? ex.checked_at : null;
    if (b.checked !== undefined) {
      const c = b.checked ? 1 : 0;
      if (c !== checked) {
        checked = c;
        checkedBy = c ? str(b.by, 40) : '';
        checkedAt = c ? t : null;
      }
    }
    if (ex) {
      await db.run(SQL.itemUpdate, [listId, name, qty, unit, brand, note, position, checked, checkedBy, checkedAt, t, id]);
    } else {
      await db.run(SQL.itemInsert, [id, hh.id, listId, name, qty, unit, brand, note, position, checked, checkedBy,
        checkedAt, str(b.by, 40), t, t]);
    }
    if (!ex || ex.name !== name || (b.brand !== undefined && brand) || (b.unit !== undefined && unit)) {
      await db.run(SQL.historyUpsert, [hh.id, Shared.normName(name), name, unit, brand, t]);
    }
    return [{ t: 'item', op: 'put', data: itemOut(await db.get(SQL.item, [id])) }];
  }

  async function putRecipe(hh, id, b) {
    const t = now();
    const ex = recipeOut(await db.get(SQL.recipe, [id]));
    if (ex && ex.household_id !== hh.id) throw new HttpError(404, 'Ricetta non trovata');
    const name = b.name !== undefined ? str(b.name, 120) : ex && ex.name;
    if (!name) throw new HttpError(400, 'Nome ricetta obbligatorio');
    const servings = b.servings !== undefined
      ? Math.max(1, Math.min(100, parseInt(b.servings, 10) || 1)) : ex ? ex.servings : 4;
    const notes = b.notes !== undefined ? str(b.notes, 5000) : ex ? ex.notes : '';
    let ingredients = JSON.stringify(ex ? ex.ingredients : []);
    if (b.ingredients !== undefined) {
      if (!Array.isArray(b.ingredients)) throw new HttpError(400, 'Ingredienti non validi');
      ingredients = JSON.stringify(b.ingredients.slice(0, 200).map((i) => ({
        name: str(i && i.name, 120),
        qty: Shared.parseNum(i && i.qty),
        unit: Shared.normUnit(str(i && i.unit, 20)),
        brand: str(i && i.brand, 80),
      })).filter((i) => i.name));
    }
    if (ex) await db.run(SQL.recipeUpdate, [name, servings, notes, ingredients, t, id]);
    else await db.run(SQL.recipeInsert, [id, hh.id, name, servings, notes, ingredients, t, t]);
    return [{ t: 'recipe', op: 'put', data: recipeOut(await db.get(SQL.recipe, [id])) }];
  }

  // Gestisce una richiesta API. `parts` è il percorso senza "/api", `body` l'oggetto JSON.
  // Ritorna { status, body } oppure { stream: hh } per l'SSE.
  async function handle({ method: m, parts, body: b = {}, code, ip }) {
    if (m === 'GET' && parts[0] === 'config' && parts.length === 1) {
      return { status: 200, body: { realtime: realtimeConfig } };
    }
    if (m === 'POST' && parts[0] === 'households' && parts.length === 1) {
      const t = now();
      const hh = { id: crypto.randomUUID(), code: newCode(), name: str(b.name, 80) || 'Famiglia', created_at: t };
      await db.run(SQL.hhInsert, [hh.id, hh.code, hh.name, t]);
      await db.run(SQL.listInsert, [crypto.randomUUID(), hh.id, 'Spesa', '🛒', 0, t, t]);
      return { status: 201, body: await state(hh) };
    }

    const hh = await auth(code, ip);

    if (m === 'GET' && parts[0] === 'state') return { status: 200, body: await state(hh) };
    if (m === 'GET' && parts[0] === 'events') return { stream: hh };

    let events;
    if (m === 'PATCH' && parts[0] === 'household' && parts.length === 1) {
      const name = str(b.name, 80);
      if (name) await db.run(SQL.hhRename, [name, hh.id]);
      events = [{ t: 'household', op: 'put', data: { id: hh.id, name: name || hh.name, code: hh.code } }];
    } else {
      const [kind, id, action] = parts;
      if (!id || !ID_RE.test(id)) throw new HttpError(404, 'Non trovato');
      if (kind === 'lists') {
        if (m === 'PUT' && !action) events = await putList(hh, id, b);
        else if (m === 'DELETE' && !action) {
          const l = await db.get(SQL.list, [id]);
          if (l && l.household_id === hh.id) await db.run(SQL.listDelete, [id]);
          events = [{ t: 'list', op: 'del', id }];
        } else if (m === 'POST' && action === 'clear-checked') {
          await ownList(hh, id);
          const rows = await db.all(SQL.clearChecked, [id]);
          events = rows.map((r) => ({ t: 'item', op: 'del', id: r.id }));
        }
      } else if (kind === 'items' && !action) {
        if (m === 'PUT') events = await putItem(hh, id, b);
        else if (m === 'DELETE') {
          const it = await db.get(SQL.item, [id]);
          if (it && it.household_id === hh.id) await db.run(SQL.itemDelete, [id]);
          events = [{ t: 'item', op: 'del', id }];
        }
      } else if (kind === 'recipes' && !action) {
        if (m === 'PUT') events = await putRecipe(hh, id, b);
        else if (m === 'DELETE') {
          const r = await db.get(SQL.recipe, [id]);
          if (r && r.household_id === hh.id) await db.run(SQL.recipeDelete, [id]);
          events = [{ t: 'recipe', op: 'del', id }];
        }
      }
    }
    if (!events) throw new HttpError(404, 'Non trovato');
    if (events.length) {
      try { await realtime.broadcast(hh.id, events); }
      catch (e) { console.error('broadcast fallito', e); } // i client si riallineano comunque al ritorno in app
    }
    return { status: 200, body: { events } };
  }

  return { handle };
}

// Schema comune: tipi compatibili sia con SQLite che con Postgres.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, created_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '🛒', position DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS lists_household ON lists(household_id);
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    name TEXT NOT NULL, qty DOUBLE PRECISION, unit TEXT NOT NULL DEFAULT '', brand TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '', position DOUBLE PRECISION NOT NULL DEFAULT 0,
    checked INTEGER NOT NULL DEFAULT 0, checked_by TEXT NOT NULL DEFAULT '',
    checked_at BIGINT, created_by TEXT NOT NULL DEFAULT '', created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS items_household ON items(household_id);
  CREATE INDEX IF NOT EXISTS items_list ON items(list_id);
  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name TEXT NOT NULL, servings INTEGER NOT NULL DEFAULT 4, notes TEXT NOT NULL DEFAULT '',
    ingredients TEXT NOT NULL DEFAULT '[]', created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS recipes_household ON recipes(household_id);
  CREATE TABLE IF NOT EXISTS history (
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    key TEXT NOT NULL, name TEXT NOT NULL, unit TEXT NOT NULL DEFAULT '', brand TEXT NOT NULL DEFAULT '',
    count INTEGER NOT NULL DEFAULT 1, last_used BIGINT NOT NULL,
    PRIMARY KEY (household_id, key)
  );
`;

module.exports = { createCore, HttpError, SCHEMA };
