'use strict';
// Logica delle API, indipendente da database e canale in tempo reale.
// `db` espone: get(sql, params), all(sql, params), run(sql, params) — tutte async,
// con segnaposto "?". `realtime` espone: broadcast(householdId, events).
// Nel codice "household" è il gruppo (famiglia, amici, evento…).

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
const newToken = () => crypto.randomBytes(16).toString('base64url');
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const str = (v, max = 200) => (v == null ? '' : String(v).slice(0, max).trim());
const now = () => Date.now();
const num = (v) => (v == null ? v : Number(v));
const optInt = (v, max) => {
  if (v == null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null;
};
const parseJson = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };

const SORT_MODES = ['manual', 'department', 'alpha'];
const DIFFICULTIES = ['', 'facile', 'media', 'difficile'];
const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

function cleanTags(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const t of v) {
    const s = str(t, 24).toLowerCase().replace(/^#/, '').replace(/\s+/g, ' ');
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= 10) break;
  }
  return out;
}
const cleanDept = (v) => (Shared.DEPARTMENTS.some((d) => d.id === v) ? v : '');

function listOut(r) {
  return r && {
    ...r, sort_mode: r.sort_mode || 'manual',
    position: num(r.position), created_at: num(r.created_at), updated_at: num(r.updated_at),
  };
}
function itemOut(r) {
  return r && {
    ...r, checked: !!Number(r.checked), qty: r.qty == null ? null : Number(r.qty), position: num(r.position),
    department: r.department || '', tags: parseJson(r.tags, []),
    checked_at: r.checked_at == null ? null : Number(r.checked_at), created_at: num(r.created_at), updated_at: num(r.updated_at),
  };
}
function recipeOut(r) {
  if (!r) return r;
  return {
    ...r, servings: Number(r.servings), ingredients: parseJson(r.ingredients, []),
    steps: parseJson(r.steps, []), photos: parseJson(r.photos, []), difficulty: r.difficulty || '',
    description: r.description || '', prep_min: r.prep_min == null ? null : Number(r.prep_min),
    cook_min: r.cook_min == null ? null : Number(r.cook_min),
    created_at: num(r.created_at), updated_at: num(r.updated_at),
  };
}
function productOut(r) {
  return r && {
    key: r.key, name: r.name, unit: r.unit || '', brand: r.brand || '', count: Number(r.count) || 0,
    department: r.department || '', tags: parseJson(r.tags, []), favorite: !!Number(r.favorite),
    qty: r.qty == null ? null : Number(r.qty),
  };
}
function tripOut(r) {
  return r && {
    ...r, items: parseJson(r.items, []), total: r.total == null ? null : Number(r.total), created_at: num(r.created_at),
  };
}
// Ricetta visibile tramite link di condivisione: niente dati del gruppo.
function sharedOut(r) {
  const x = recipeOut(r);
  return {
    name: x.name, servings: x.servings, ingredients: x.ingredients, steps: x.steps, photos: x.photos,
    difficulty: x.difficulty, description: x.description, prep_min: x.prep_min, cook_min: x.cook_min, notes: x.notes,
  };
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

function createCore({ db, realtime }) {
  const SQL = {
    hhByCode: 'SELECT * FROM households WHERE code = ?',
    hhInsert: 'INSERT INTO households (id, code, name, created_at) VALUES (?, ?, ?, ?)',
    hhRename: 'UPDATE households SET name = ? WHERE id = ?',
    lists: 'SELECT * FROM lists WHERE household_id = ? ORDER BY position, created_at',
    list: 'SELECT * FROM lists WHERE id = ?',
    listInsert: `INSERT INTO lists (id, household_id, name, emoji, position, sort_mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    listUpdate: 'UPDATE lists SET name = ?, emoji = ?, position = ?, sort_mode = ?, updated_at = ? WHERE id = ?',
    listDelete: 'DELETE FROM lists WHERE id = ?',
    items: 'SELECT * FROM items WHERE household_id = ?',
    item: 'SELECT * FROM items WHERE id = ?',
    itemInsert: `INSERT INTO items (id, household_id, list_id, name, qty, unit, brand, note, department, tags, position,
      checked, checked_by, checked_at, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    itemUpdate: `UPDATE items SET list_id = ?, name = ?, qty = ?, unit = ?, brand = ?, note = ?, department = ?, tags = ?,
      position = ?, checked = ?, checked_by = ?, checked_at = ?, updated_at = ? WHERE id = ?`,
    itemDelete: 'DELETE FROM items WHERE id = ?',
    checkedOf: 'SELECT * FROM items WHERE list_id = ? AND checked = 1 ORDER BY checked_at',
    clearChecked: 'DELETE FROM items WHERE list_id = ? AND checked = 1 RETURNING id',
    recipes: 'SELECT * FROM recipes WHERE household_id = ? ORDER BY lower(name)',
    recipe: 'SELECT * FROM recipes WHERE id = ?',
    recipeByToken: 'SELECT * FROM recipes WHERE share_token = ?',
    recipeInsert: `INSERT INTO recipes (id, household_id, name, servings, notes, ingredients, difficulty, prep_min,
      cook_min, description, steps, photos, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    recipeUpdate: `UPDATE recipes SET name = ?, servings = ?, notes = ?, ingredients = ?, difficulty = ?, prep_min = ?,
      cook_min = ?, description = ?, steps = ?, photos = ?, updated_at = ? WHERE id = ?`,
    recipeShare: 'UPDATE recipes SET share_token = ?, updated_at = ? WHERE id = ?',
    recipeDelete: 'DELETE FROM recipes WHERE id = ?',
    products: `SELECT * FROM history WHERE household_id = ? ORDER BY favorite DESC, count DESC, last_used DESC LIMIT 1000`,
    product: 'SELECT * FROM history WHERE household_id = ? AND key = ?',
    productUse: `INSERT INTO history (household_id, key, name, unit, brand, count, last_used)
      VALUES (?, ?, ?, ?, ?, 1, ?) ON CONFLICT (household_id, key) DO UPDATE SET
      name = excluded.name,
      unit = CASE WHEN excluded.unit <> '' THEN excluded.unit ELSE history.unit END,
      brand = CASE WHEN excluded.brand <> '' THEN excluded.brand ELSE history.brand END,
      count = history.count + 1, last_used = excluded.last_used`,
    productMeta: 'UPDATE history SET department = ?, tags = ? WHERE household_id = ? AND key = ?',
    productTouch: `INSERT INTO history (household_id, key, name, unit, brand, department, count, last_used)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?) ON CONFLICT (household_id, key) DO NOTHING RETURNING key`,
    productInsert: `INSERT INTO history (household_id, key, name, unit, brand, department, tags, favorite, qty, count, last_used)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    productUpdate: `UPDATE history SET name = ?, unit = ?, brand = ?, department = ?, tags = ?, favorite = ?, qty = ?
      WHERE household_id = ? AND key = ?`,
    productDelete: 'DELETE FROM history WHERE household_id = ? AND key = ?',
    trips: 'SELECT * FROM trips WHERE household_id = ? ORDER BY created_at DESC LIMIT 300',
    trip: 'SELECT * FROM trips WHERE id = ?',
    tripInsert: `INSERT INTO trips (id, household_id, list_id, list_name, store, total, items, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    tripUpdate: 'UPDATE trips SET store = ?, total = ? WHERE id = ?',
    tripDelete: 'DELETE FROM trips WHERE id = ?',
    photoInsert: 'INSERT INTO photos (id, household_id, recipe_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    photo: 'SELECT mime, data FROM photos WHERE id = ?',
    photosOfRecipe: 'SELECT id FROM photos WHERE recipe_id = ?',
    photosOfHousehold: 'SELECT id FROM photos WHERE household_id = ?',
    photoDelete: 'DELETE FROM photos WHERE id = ?',
    photoCopy: `INSERT INTO photos (id, household_id, recipe_id, mime, data, created_at)
      SELECT ?, ?, ?, mime, data, ? FROM photos WHERE id = ?`,
  };

  async function auth(code, ip) {
    code = String(code || '').trim().toUpperCase();
    const hh = code && await db.get(SQL.hhByCode, [code]);
    if (!hh) {
      checkRate(ip);
      throw new HttpError(401, 'Codice del gruppo non valido');
    }
    return hh;
  }

  async function state(hh) {
    const [lists, items, recipes, products, trips] = await Promise.all([
      db.all(SQL.lists, [hh.id]), db.all(SQL.items, [hh.id]), db.all(SQL.recipes, [hh.id]),
      db.all(SQL.products, [hh.id]), db.all(SQL.trips, [hh.id]),
    ]);
    return {
      household: { id: hh.id, name: hh.name, code: hh.code },
      lists: lists.map(listOut),
      items: items.map(itemOut),
      recipes: recipes.map(recipeOut),
      products: products.map(productOut),
      trips: trips.map(tripOut),
      serverTime: now(),
    };
  }

  async function ownList(hh, id) {
    const l = await db.get(SQL.list, [id]);
    if (!l || l.household_id !== hh.id) throw new HttpError(404, 'Lista non trovata');
    return l;
  }
  async function ownRecipe(hh, id) {
    const r = await db.get(SQL.recipe, [id]);
    if (!r || r.household_id !== hh.id) throw new HttpError(404, 'Ricetta non trovata');
    return r;
  }
  const productEvent = async (hh, key) => {
    const p = await db.get(SQL.product, [hh.id, key]);
    return p ? { t: 'product', op: 'put', data: productOut(p) } : null;
  };

  // ------------------------------------------------------------ liste
  async function putList(hh, id, b) {
    const t = now();
    const ex = listOut(await db.get(SQL.list, [id]));
    if (ex && ex.household_id !== hh.id) throw new HttpError(404, 'Lista non trovata');
    const sortMode = SORT_MODES.includes(b.sort_mode) ? b.sort_mode : ex ? ex.sort_mode : 'manual';
    if (ex) {
      await db.run(SQL.listUpdate, [
        b.name !== undefined ? str(b.name, 80) || ex.name : ex.name,
        b.emoji !== undefined ? str(b.emoji, 16) || 'cart' : ex.emoji,
        b.position !== undefined && Number.isFinite(Number(b.position)) ? Number(b.position) : ex.position,
        sortMode, t, id]);
    } else {
      const name = str(b.name, 80);
      if (!name) throw new HttpError(400, 'Nome lista obbligatorio');
      const pos = b.position != null && Number.isFinite(Number(b.position)) ? Number(b.position) : t;
      await db.run(SQL.listInsert, [id, hh.id, name, str(b.emoji, 16) || 'cart', pos, sortMode, t, t]);
    }
    return [{ t: 'list', op: 'put', data: listOut(await db.get(SQL.list, [id])) }];
  }

  // Conclude la spesa: salva gli articoli presi nello storico e li toglie dalla lista.
  async function closeList(hh, listId, b) {
    const list = await ownList(hh, listId);
    const tripId = str(b.trip_id, 64);
    if (!ID_RE.test(tripId)) throw new HttpError(400, 'Identificativo spesa non valido');
    const ex = await db.get(SQL.trip, [tripId]);
    if (ex) return ex.household_id === hh.id ? [{ t: 'trip', op: 'put', data: tripOut(ex) }] : [];
    const rows = (await db.all(SQL.checkedOf, [listId])).map(itemOut);
    if (!rows.length) throw new HttpError(400, 'Nessun articolo nel carrello');
    const items = rows.map((i) => ({
      name: i.name, qty: i.qty, unit: i.unit, brand: i.brand, note: i.note, department: i.department,
      tags: i.tags, by: i.checked_by,
    }));
    const total = Shared.parseNum(b.total);
    await db.run(SQL.tripInsert, [tripId, hh.id, listId, list.name, str(b.store, 80), total, JSON.stringify(items),
      str(b.by, 40), now()]);
    const deleted = await db.all(SQL.clearChecked, [listId]);
    return [
      { t: 'trip', op: 'put', data: tripOut(await db.get(SQL.trip, [tripId])) },
      ...deleted.map((r) => ({ t: 'item', op: 'del', id: r.id })),
    ];
  }

  // ------------------------------------------------------------ articoli
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
    const department = pick('department', cleanDept);
    const tags = pick('tags', cleanTags);
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
    const tagsJson = JSON.stringify(tags);
    if (ex) {
      await db.run(SQL.itemUpdate, [listId, name, qty, unit, brand, note, department, tagsJson, position, checked,
        checkedBy, checkedAt, t, id]);
    } else {
      await db.run(SQL.itemInsert, [id, hh.id, listId, name, qty, unit, brand, note, department, tagsJson, position,
        checked, checkedBy, checkedAt, str(b.by, 40), t, t]);
    }
    const events = [{ t: 'item', op: 'put', data: itemOut(await db.get(SQL.item, [id])) }];
    // Il catalogo prodotti impara nome, unità, marca, reparto e tag.
    const key = Shared.normName(name);
    const used = !ex || ex.name !== name || (b.brand !== undefined && brand) || (b.unit !== undefined && unit);
    const meta = b.department !== undefined || b.tags !== undefined;
    if (used) await db.run(SQL.productUse, [hh.id, key, name, unit, brand, t]);
    if (meta) await db.run(SQL.productMeta, [department, tagsJson, hh.id, key]);
    if (used || meta) { const e = await productEvent(hh, key); if (e) events.push(e); }
    return events;
  }

  // ------------------------------------------------------------ catalogo prodotti
  async function putProduct(hh, b) {
    const name = str(b.name, 120);
    const key = Shared.normName(b.key || name);
    if (!key) throw new HttpError(400, 'Nome obbligatorio');
    const ex = productOut(await db.get(SQL.product, [hh.id, key]));
    const pick = (k, fn) => (b[k] !== undefined ? fn(b[k]) : ex ? ex[k] : fn(undefined));
    const vals = [
      pick('name', (v) => str(v, 120)) || name || key,
      pick('unit', (v) => Shared.normUnit(str(v, 20))),
      pick('brand', (v) => str(v, 80)),
      pick('department', cleanDept),
      JSON.stringify(pick('tags', cleanTags)),
      pick('favorite', (v) => (v ? 1 : 0)) ? 1 : 0,
      pick('qty', (v) => Shared.parseNum(v)),
    ];
    if (ex) await db.run(SQL.productUpdate, [...vals, hh.id, key]);
    else await db.run(SQL.productInsert, [hh.id, key, ...vals, now()]);
    return [await productEvent(hh, key)];
  }

  async function touchProducts(hh, names) {
    const events = [];
    for (const n of names) {
      const key = Shared.normName(n.name);
      if (!key) continue;
      const rows = await db.all(SQL.productTouch, [hh.id, key, n.name, n.unit || '', n.brand || '',
        Shared.guessDepartment(n.name), now()]);
      if (rows.length) events.push(await productEvent(hh, key));
    }
    return events.filter(Boolean);
  }

  // ------------------------------------------------------------ ricette
  async function putRecipe(hh, id, b) {
    const t = now();
    const ex = recipeOut(await db.get(SQL.recipe, [id]));
    if (ex && ex.household_id !== hh.id) throw new HttpError(404, 'Ricetta non trovata');
    const pick = (k, fn) => (b[k] !== undefined ? fn(b[k]) : ex ? ex[k] : fn(undefined));
    const name = pick('name', (v) => str(v, 120));
    if (!name) throw new HttpError(400, 'Nome ricetta obbligatorio');
    const servings = pick('servings', (v) => Math.max(1, Math.min(100, parseInt(v, 10) || 4)));
    const notes = pick('notes', (v) => str(v, 5000));
    const difficulty = pick('difficulty', (v) => (DIFFICULTIES.includes(v) ? v : ''));
    const prepMin = pick('prep_min', (v) => optInt(v, 10000));
    const cookMin = pick('cook_min', (v) => optInt(v, 10000));
    const description = pick('description', (v) => str(v, 2000));
    const ingredients = pick('ingredients', (v) => {
      if (v === undefined) return [];
      if (!Array.isArray(v)) throw new HttpError(400, 'Ingredienti non validi');
      return v.slice(0, 200).map((i) => ({
        name: str(i && i.name, 120), qty: Shared.parseNum(i && i.qty),
        unit: Shared.normUnit(str(i && i.unit, 20)), brand: str(i && i.brand, 80),
      })).filter((i) => i.name);
    });
    const steps = pick('steps', (v) => {
      if (v === undefined) return [];
      if (!Array.isArray(v)) throw new HttpError(400, 'Passaggi non validi');
      return v.slice(0, 100).map((s) => ({ text: str(s && typeof s === 'object' ? s.text : s, 3000) })).filter((s) => s.text);
    });
    let photos = ex ? ex.photos : [];
    if (b.photos !== undefined) {
      if (!Array.isArray(b.photos)) throw new HttpError(400, 'Foto non valide');
      const mine = new Set((await db.all(SQL.photosOfHousehold, [hh.id])).map((r) => r.id));
      photos = [...new Set(b.photos.map(String))].filter((p) => ID_RE.test(p) && mine.has(p)).slice(0, 12);
    }
    const row = [name, servings, notes, JSON.stringify(ingredients), difficulty, prepMin, cookMin, description,
      JSON.stringify(steps), JSON.stringify(photos)];
    if (ex) await db.run(SQL.recipeUpdate, [...row, t, id]);
    else await db.run(SQL.recipeInsert, [id, hh.id, ...row, t, t]);
    // Elimina le foto caricate per questa ricetta e poi tolte.
    const keep = new Set(photos);
    for (const r of await db.all(SQL.photosOfRecipe, [id])) if (!keep.has(r.id)) await db.run(SQL.photoDelete, [r.id]);
    const events = [{ t: 'recipe', op: 'put', data: recipeOut(await db.get(SQL.recipe, [id])) }];
    // Gli ingredienti nuovi entrano nel catalogo (e quindi nell'autocompletamento).
    if (b.ingredients !== undefined) events.push(...await touchProducts(hh, ingredients));
    return events;
  }

  async function deleteRecipe(hh, id) {
    const r = await db.get(SQL.recipe, [id]);
    if (r && r.household_id === hh.id) {
      for (const p of await db.all(SQL.photosOfRecipe, [id])) await db.run(SQL.photoDelete, [p.id]);
      for (const p of parseJson(r.photos, [])) await db.run(SQL.photoDelete, [p]);
      await db.run(SQL.recipeDelete, [id]);
    }
    return [{ t: 'recipe', op: 'del', id }];
  }

  async function importRecipe(hh, token) {
    const src = token && await db.get(SQL.recipeByToken, [String(token)]);
    if (!src) throw new HttpError(404, 'Ricetta non trovata o non più condivisa');
    const s = recipeOut(src);
    const id = crypto.randomUUID();
    const t = now();
    const photos = [];
    for (const p of s.photos) {
      const nid = crypto.randomUUID();
      await db.run(SQL.photoCopy, [nid, hh.id, id, t, p]);
      photos.push(nid);
    }
    await db.run(SQL.recipeInsert, [id, hh.id, s.name, s.servings, s.notes, JSON.stringify(s.ingredients), s.difficulty,
      s.prep_min, s.cook_min, s.description, JSON.stringify(s.steps), JSON.stringify(photos), t, t]);
    return [
      { t: 'recipe', op: 'put', data: recipeOut(await db.get(SQL.recipe, [id])) },
      ...await touchProducts(hh, s.ingredients),
    ];
  }

  async function uploadPhoto(hh, b) {
    const mime = String(b.mime || '');
    if (!PHOTO_MIMES.includes(mime)) throw new HttpError(400, 'Formato immagine non supportato');
    const data = Buffer.from(String(b.data || ''), 'base64');
    if (!data.length) throw new HttpError(400, 'Immagine vuota');
    if (data.length > MAX_PHOTO_BYTES) throw new HttpError(413, 'Immagine troppo grande');
    const recipeId = ID_RE.test(String(b.recipe_id || '')) ? String(b.recipe_id) : null;
    const id = crypto.randomUUID();
    await db.run(SQL.photoInsert, [id, hh.id, recipeId, mime, data, now()]);
    return id;
  }

  // ------------------------------------------------------------ router
  // `parts` è il percorso senza "/api", `body` l'oggetto JSON.
  // Ritorna { status, body } | { status, raw, headers } | { stream: hh }.
  async function handle({ method: m, parts, body: b = {}, code, ip }) {
    // --- endpoint pubblici
    if (m === 'POST' && parts[0] === 'households' && parts.length === 1) {
      const t = now();
      const hh = { id: crypto.randomUUID(), code: newCode(), name: str(b.name, 80) || 'Gruppo', created_at: t };
      await db.run(SQL.hhInsert, [hh.id, hh.code, hh.name, t]);
      await db.run(SQL.listInsert, [crypto.randomUUID(), hh.id, 'Spesa', 'cart', 0, 'manual', t, t]);
      return { status: 201, body: await state(hh) };
    }
    // Foto: l'identificativo casuale (non indovinabile) fa da chiave d'accesso, come per i link condivisi.
    if (m === 'GET' && parts[0] === 'photos' && parts.length === 2) {
      const p = ID_RE.test(parts[1]) && await db.get(SQL.photo, [parts[1]]);
      if (!p) throw new HttpError(404, 'Foto non trovata');
      return {
        status: 200, raw: Buffer.from(p.data),
        headers: { 'Content-Type': p.mime, 'Cache-Control': 'public, max-age=31536000, immutable' },
      };
    }
    if (m === 'GET' && parts[0] === 'shared' && parts.length === 2) {
      const r = /^[A-Za-z0-9_-]{16,64}$/.test(parts[1]) && await db.get(SQL.recipeByToken, [parts[1]]);
      if (!r) { checkRate(ip); throw new HttpError(404, 'Ricetta non trovata o non più condivisa'); }
      return { status: 200, body: { recipe: sharedOut(r) } };
    }

    const hh = await auth(code, ip);

    if (m === 'GET' && parts[0] === 'state') return { status: 200, body: await state(hh) };
    if (m === 'GET' && parts[0] === 'events') return { stream: hh };
    if (m === 'POST' && parts[0] === 'photos' && parts.length === 1) {
      return { status: 201, body: { id: await uploadPhoto(hh, b) } };
    }

    let events;
    const [kind, id, action] = parts;
    if (m === 'PATCH' && kind === 'household' && parts.length === 1) {
      const name = str(b.name, 80);
      if (name) await db.run(SQL.hhRename, [name, hh.id]);
      events = [{ t: 'household', op: 'put', data: { id: hh.id, name: name || hh.name, code: hh.code } }];
    } else if (kind === 'products' && m === 'POST' && parts.length === 1) {
      events = await putProduct(hh, b);
    } else if (kind === 'products' && m === 'POST' && id === 'delete' && parts.length === 2) {
      const key = Shared.normName(b.key || b.name);
      await db.run(SQL.productDelete, [hh.id, key]);
      events = [{ t: 'product', op: 'del', id: key }];
    } else if (kind === 'recipes' && m === 'POST' && id === 'import' && parts.length === 2) {
      events = await importRecipe(hh, b.token);
    } else {
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
        } else if (m === 'POST' && action === 'close') {
          events = await closeList(hh, id, b);
        }
      } else if (kind === 'items' && !action) {
        if (m === 'PUT') events = await putItem(hh, id, b);
        else if (m === 'DELETE') {
          const it = await db.get(SQL.item, [id]);
          if (it && it.household_id === hh.id) await db.run(SQL.itemDelete, [id]);
          events = [{ t: 'item', op: 'del', id }];
        }
      } else if (kind === 'recipes') {
        if (m === 'PUT' && !action) events = await putRecipe(hh, id, b);
        else if (m === 'DELETE' && !action) events = await deleteRecipe(hh, id);
        else if (action === 'share' && (m === 'POST' || m === 'DELETE')) {
          const r = await ownRecipe(hh, id);
          const token = m === 'POST' ? r.share_token || newToken() : null;
          await db.run(SQL.recipeShare, [token, now(), id]);
          events = [{ t: 'recipe', op: 'put', data: recipeOut(await db.get(SQL.recipe, [id])) }];
        }
      } else if (kind === 'trips' && !action) {
        const tr = await db.get(SQL.trip, [id]);
        if (m === 'PUT') {
          if (!tr || tr.household_id !== hh.id) throw new HttpError(404, 'Spesa non trovata');
          const store = b.store !== undefined ? str(b.store, 80) : tr.store;
          const total = b.total !== undefined ? Shared.parseNum(b.total) : tr.total;
          await db.run(SQL.tripUpdate, [store, total, id]);
          events = [{ t: 'trip', op: 'put', data: tripOut(await db.get(SQL.trip, [id])) }];
        } else if (m === 'DELETE') {
          if (tr && tr.household_id === hh.id) await db.run(SQL.tripDelete, [id]);
          events = [{ t: 'trip', op: 'del', id }];
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

// Schema di base: tipi compatibili sia con SQLite che con Postgres.
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
  CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    list_id TEXT, list_name TEXT NOT NULL DEFAULT '', store TEXT NOT NULL DEFAULT '', total DOUBLE PRECISION,
    items TEXT NOT NULL DEFAULT '[]', created_by TEXT NOT NULL DEFAULT '', created_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS trips_household ON trips(household_id, created_at);
  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    recipe_id TEXT, mime TEXT NOT NULL, data BYTEA NOT NULL, created_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS photos_household ON photos(household_id);
  CREATE INDEX IF NOT EXISTS photos_recipe ON photos(recipe_id);
`;

// Colonne aggiunte nelle versioni successive: applicate in automatico ai database esistenti.
const MIGRATIONS = [
  ['items', 'position', 'DOUBLE PRECISION NOT NULL DEFAULT 0'],
  ['lists', 'sort_mode', "TEXT NOT NULL DEFAULT 'manual'"],
  ['items', 'department', "TEXT NOT NULL DEFAULT ''"],
  ['items', 'tags', "TEXT NOT NULL DEFAULT '[]'"],
  ['history', 'department', "TEXT NOT NULL DEFAULT ''"],
  ['history', 'tags', "TEXT NOT NULL DEFAULT '[]'"],
  ['history', 'favorite', 'INTEGER NOT NULL DEFAULT 0'],
  ['history', 'qty', 'DOUBLE PRECISION'],
  ['recipes', 'difficulty', "TEXT NOT NULL DEFAULT ''"],
  ['recipes', 'prep_min', 'INTEGER'],
  ['recipes', 'cook_min', 'INTEGER'],
  ['recipes', 'description', "TEXT NOT NULL DEFAULT ''"],
  ['recipes', 'steps', "TEXT NOT NULL DEFAULT '[]'"],
  ['recipes', 'photos', "TEXT NOT NULL DEFAULT '[]'"],
  ['recipes', 'share_token', 'TEXT'],
];
// Indici che dipendono dalle colonne migrate.
const POST_MIGRATION = 'CREATE UNIQUE INDEX IF NOT EXISTS recipes_share ON recipes(share_token);';

module.exports = { createCore, HttpError, SCHEMA, MIGRATIONS, POST_MIGRATION };
