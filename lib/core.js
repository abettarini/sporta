'use strict';
// Logica delle API, indipendente da database e canale in tempo reale.
// `db` espone: get(sql, params), all(sql, params), run(sql, params) — tutte async,
// con segnaposto "?". `realtime` espone: broadcast(householdId, events).
// Nel codice "household" è il gruppo (famiglia, amici, evento…).

const crypto = require('node:crypto');
const Shared = require('../public/shared.js');

const { HttpError, newCode, newToken, ID_RE, str, now, num, parseJson, checkRate } = require('./util');
const { createMembers, MEMBER_SCHEMA, MEMBER_MIGRATIONS, memberPostMigration } = require('./members');
const { createMailer } = require('./mailer');
const { createNotifier, NOTIFY_SCHEMA, NOTIFY_MIGRATIONS, today } = require('./notify');
const { createEvents, EVENT_SCHEMA, EVENT_MIGRATIONS } = require('./events');
const { createAccounts, ACCOUNT_SCHEMA, ACCOUNT_MIGRATIONS, accountPostMigration } = require('./accounts');
const { TERMS_VERSION } = require('./legal');
const { createProtect, PROTECT_SCHEMA, noLinks } = require('./protect');

const optInt = (v, max) => {
  if (v == null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null;
};

const SORT_MODES = ['manual', 'department', 'alpha', 'due'];
const LIST_TYPES = Object.keys(Shared.LIST_TYPES);
const KINDS = Object.keys(Shared.COLLECTION_KINDS);
const cleanDue = (v) => (typeof v === 'string' && Shared.fromYmd(v) ? v : '');
const cleanPriority = (v) => Math.max(-1, Math.min(1, parseInt(v, 10) || 0));
// Campi propri delle liste "collezione" (libri, film, desideri…).
function cleanData(v) {
  if (!v || typeof v !== 'object') return {};
  const o = {};
  const creator = str(v.creator, 120); if (creator) o.creator = creator;
  const status = parseInt(v.status, 10); if (status === 1) o.status = 1; // 1 = in corso (il "fatto" è la spunta)
  const rating = parseInt(v.rating, 10); if (rating >= 1 && rating <= 5) o.rating = rating;
  const price = Shared.parseNum(v.price); if (price != null) o.price = Math.round(price * 100) / 100;
  const link = str(v.link, 500); if (/^https?:\/\/\S+$/i.test(link)) o.link = link;
  return o;
}
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
    ...r, sort_mode: r.sort_mode || 'manual', type: r.type || 'spesa', variant: r.variant || '',
    position: num(r.position), created_at: num(r.created_at), updated_at: num(r.updated_at),
  };
}
function itemOut(r) {
  return r && {
    ...r, checked: !!Number(r.checked), qty: r.qty == null ? null : Number(r.qty), position: num(r.position),
    department: r.department || '', tags: parseJson(r.tags, []),
    due_date: r.due_date || '', priority: Number(r.priority || 0), data: parseJson(r.data, {}),
    assigned_to: r.assigned_to || null, assigned_by: r.assigned_by || null,
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

function createCore({ db, realtime }) {
  const SQL = {
    hhByCode: 'SELECT * FROM households WHERE code = ?',
    hhInsert: 'INSERT INTO households (id, code, name, created_at, legacy_until, require_approval) VALUES (?, ?, ?, ?, ?, 1)',
    hh: 'SELECT * FROM households WHERE id = ?',
    hhRename: 'UPDATE households SET name = ? WHERE id = ?',
    lists: 'SELECT * FROM lists WHERE household_id = ? ORDER BY position, created_at',
    list: 'SELECT * FROM lists WHERE id = ?',
    listInsert: `INSERT INTO lists (id, household_id, name, emoji, position, sort_mode, created_at, updated_at, type, variant)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    listUpdate: 'UPDATE lists SET name = ?, emoji = ?, position = ?, sort_mode = ?, updated_at = ?, type = ?, variant = ? WHERE id = ?',
    listDelete: 'DELETE FROM lists WHERE id = ?',
    items: 'SELECT * FROM items WHERE household_id = ?',
    item: 'SELECT * FROM items WHERE id = ?',
    itemInsert: `INSERT INTO items (id, household_id, list_id, name, qty, unit, brand, note, department, tags, position,
      checked, checked_by, checked_by_id, checked_at, created_by, created_by_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    itemUpdate: `UPDATE items SET list_id = ?, name = ?, qty = ?, unit = ?, brand = ?, note = ?, department = ?, tags = ?,
      position = ?, checked = ?, checked_by = ?, checked_by_id = ?, checked_at = ?, updated_at = ? WHERE id = ?`,
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
    tripInsert: `INSERT INTO trips (id, household_id, list_id, list_name, store, total, items, created_by, created_by_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

  const mailer = createMailer();
  const protect = createProtect({ db });
  const members = createMembers({ db, realtime, mailer, protect });
  const accounts = createAccounts({ db, mailer, members, protect });
  members.useAccounts(accounts);

  // ------------------------------------------------------------ gruppo personale
  // Ogni account ha un gruppo solo suo ("Personale", rinominabile): non si elimina, non se ne
  // esce, non ha codice né inviti. Si crea alla prima occasione (accesso, sincronizzazione).
  async function ensurePersonal(account) {
    const ex = await db.get('SELECT id FROM households WHERE personal_of = ?', [account.id]);
    if (ex) return ex.id;
    const t = now(), id = crypto.randomUUID();
    try {
      await db.run('INSERT INTO households (id, code, name, created_at, legacy_until, require_approval, personal_of) VALUES (?, ?, ?, ?, 0, 1, ?)',
        [id, newCode(), 'Personale', t, account.id]);
    } catch (e) {
      const again = await db.get('SELECT id FROM households WHERE personal_of = ?', [account.id]); // creato in parallelo
      if (again) return again.id;
      throw e;
    }
    await db.run(SQL.listInsert, [crypto.randomUUID(), id, 'Spesa', 'cart', 0, 'manual', t, t, 'spesa', '']);
    // Nome: quello usato negli altri gruppi, altrimenti dall'email (anna.rossi@… → Anna).
    const other = await db.get(`SELECT alias FROM members WHERE account_id = ? AND status = 'active' ORDER BY created_at LIMIT 1`, [account.id]);
    const local = account.email.split('@')[0].split(/[._+-]/)[0] || 'Io';
    const alias = other ? other.alias : local.charAt(0).toUpperCase() + local.slice(1, 40);
    const hh = await db.get(SQL.hh, [id]);
    await members.addMember(hh, { alias, role: 'admin', status: 'active', email: account.email, accountId: account.id });
    return id;
  }
  accounts.usePersonal(ensurePersonal);
  const notifier = createNotifier({ db, realtime, mailer, protect });
  const eventsMod = createEvents({ db, realtime, notifier, isAdmin: (ctx) => members.isAdmin(ctx) });
  // Chi fa l'azione: la persona autenticata (o, durante la transizione, il nome inviato dal client).
  const actor = (ctx, b) => (ctx.me ? { name: ctx.me.alias, id: ctx.me.id } : { name: str(b.by, 40), id: null });

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
    const type = LIST_TYPES.includes(b.type) ? b.type : ex ? ex.type : 'spesa';
    const variant = type !== 'collezione' ? '' : KINDS.includes(b.variant) ? b.variant : ex && ex.variant ? ex.variant : 'libri';
    if (ex) {
      await db.run(SQL.listUpdate, [
        b.name !== undefined ? str(b.name, 80) || ex.name : ex.name,
        b.emoji !== undefined ? str(b.emoji, 16) || 'cart' : ex.emoji,
        b.position !== undefined && Number.isFinite(Number(b.position)) ? Number(b.position) : ex.position,
        sortMode, t, type, variant, id]);
    } else {
      const name = str(b.name, 80);
      if (!name) throw new HttpError(400, 'Nome lista obbligatorio');
      const pos = b.position != null && Number.isFinite(Number(b.position)) ? Number(b.position) : t;
      const icon = str(b.emoji, 16) || (type === 'collezione' ? Shared.kindOf(variant).icon : Shared.LIST_TYPES[type].icon);
      await db.run(SQL.listInsert, [id, hh.id, name, icon, pos, sortMode, t, t, type, variant]);
    }
    // Lista collegata a un evento del gruppo (o scollegata).
    if (b.event_id !== undefined) await eventsMod.linkList(hh, id, b.event_id || null);
    return [{ t: 'list', op: 'put', data: listOut(await db.get(SQL.list, [id])) }];
  }

  // Sposta una lista (con i suoi articoli) in un altro gruppo di cui la persona fa parte:
  // per esempio dal gruppo personale alla famiglia. target_token: la chiave di quel gruppo.
  async function moveList(hh, id, b, ctx, ip) {
    const l = await ownList(hh, id);
    const to = await members.authenticate(String(b.target_token || ''), ip);
    members.requireActive(to);
    if (!to.me) throw new HttpError(400, 'Gruppo di destinazione non valido');
    if (to.hh.id === hh.id) throw new HttpError(400, 'La lista è già in questo gruppo');
    if (ctx.me && to.me.account_id && ctx.me.account_id && to.me.account_id !== ctx.me.account_id) throw new HttpError(403, 'Gruppo di destinazione non valido');
    const t = now();
    const pos = Number((await db.get('SELECT MAX(position) AS p FROM lists WHERE household_id = ?', [to.hh.id])).p || 0) + 1;
    // Assegnazioni ed evento collegato non hanno senso nell'altro gruppo.
    await db.run('UPDATE lists SET household_id = ?, event_id = NULL, position = ?, updated_at = ? WHERE id = ?', [to.hh.id, pos, t, id]);
    await db.run('UPDATE items SET household_id = ?, assigned_to = NULL, assigned_by = NULL, updated_at = ? WHERE list_id = ?', [to.hh.id, t, id]);
    try { await realtime.broadcast(to.hh.id, [{ t: 'reload' }]); } catch (e) { console.error('broadcast fallito', e); }
    return [{ t: 'list', op: 'del', id, moved_to: to.hh.id, name: l.name }];
  }

  // Conclude la spesa: salva gli articoli presi nello storico e li toglie dalla lista.
  async function closeList(hh, listId, b, ctx) {
    const list = await ownList(hh, listId);
    const tripId = str(b.trip_id, 64);
    if (!ID_RE.test(tripId)) throw new HttpError(400, 'Identificativo spesa non valido');
    const ex = await db.get(SQL.trip, [tripId]);
    if (ex) return ex.household_id === hh.id ? [{ t: 'trip', op: 'put', data: tripOut(ex) }] : [];
    const rows = (await db.all(SQL.checkedOf, [listId])).map(itemOut);
    if (!rows.length) throw new HttpError(400, 'Nessun articolo nel carrello');
    const items = rows.map((i) => ({
      name: i.name, qty: i.qty, unit: i.unit, brand: i.brand, note: i.note, department: i.department,
      tags: i.tags, by: i.checked_by, by_id: i.checked_by_id || null,
    }));
    const who = actor(ctx, b);
    const total = Shared.parseNum(b.total);
    await db.run(SQL.tripInsert, [tripId, hh.id, listId, list.name, str(b.store, 80), total, JSON.stringify(items),
      who.name, who.id, now()]);
    const deleted = await db.all(SQL.clearChecked, [listId]);
    return [
      { t: 'trip', op: 'put', data: tripOut(await db.get(SQL.trip, [tripId])) },
      ...deleted.map((r) => ({ t: 'item', op: 'del', id: r.id })),
    ];
  }

  // ------------------------------------------------------------ articoli
  async function putItem(hh, id, b, ctx) {
    const t = now();
    const who = actor(ctx, b);
    const ex = itemOut(await db.get(SQL.item, [id]));
    if (ex && ex.household_id !== hh.id) throw new HttpError(404, 'Articolo non trovato');
    const listId = b.list_id !== undefined ? String(b.list_id) : ex && ex.list_id;
    if (!listId) throw new HttpError(400, 'Lista obbligatoria');
    const list = listOut(await ownList(hh, listId));
    const pick = (k, fn) => (b[k] !== undefined ? fn(b[k]) : ex ? ex[k] : fn(undefined));
    const name = pick('name', (v) => str(v, 120));
    if (!name) throw new HttpError(400, 'Nome obbligatorio');
    const qty = pick('qty', (v) => Shared.parseNum(v));
    const unit = pick('unit', (v) => Shared.normUnit(str(v, 20)));
    const brand = pick('brand', (v) => str(v, 80));
    const note = pick('note', (v) => str(v, 300));
    const department = pick('department', cleanDept);
    const tags = pick('tags', cleanTags);
    const dueDate = pick('due_date', cleanDue);
    const priority = pick('priority', cleanPriority);
    const data = pick('data', cleanData);
    // Assegnazione: a un membro attivo del gruppo (o a nessuno). Chi assegna resta registrato.
    let assignedTo = ex ? ex.assigned_to : null, assignedBy = ex ? ex.assigned_by : null;
    if (b.assigned_to !== undefined && (b.assigned_to || null) !== assignedTo) {
      if (b.assigned_to) {
        const m = await db.get('SELECT id FROM members WHERE id = ? AND household_id = ? AND status = ?', [String(b.assigned_to), hh.id, 'active']);
        if (!m) throw new HttpError(400, 'Persona non valida', 'bad_assignee');
        assignedTo = m.id;
      } else assignedTo = null;
      assignedBy = assignedTo ? who.id : null;
    }
    // Posizione: crescente dall'alto verso il basso; senza indicazione l'articolo va in cima.
    const position = pick('position', (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : -t));
    let checked = ex ? (ex.checked ? 1 : 0) : 0;
    let checkedBy = ex ? ex.checked_by : '', checkedById = ex ? ex.checked_by_id || null : null;
    let checkedAt = ex ? ex.checked_at : null;
    if (b.checked !== undefined) {
      const c = b.checked ? 1 : 0;
      if (c !== checked) {
        checked = c;
        checkedBy = c ? who.name : '';
        checkedById = c ? who.id : null;
        checkedAt = c ? t : null;
      }
    }
    const tagsJson = JSON.stringify(tags);
    if (ex) {
      await db.run(SQL.itemUpdate, [listId, name, qty, unit, brand, note, department, tagsJson, position, checked,
        checkedBy, checkedById, checkedAt, t, id]);
    } else {
      await db.run(SQL.itemInsert, [id, hh.id, listId, name, qty, unit, brand, note, department, tagsJson, position,
        checked, checkedBy, checkedById, checkedAt, who.name, who.id, t, t]);
    }
    await db.run('UPDATE items SET due_date = ?, priority = ?, data = ?, assigned_to = ?, assigned_by = ? WHERE id = ?',
      [dueDate, priority, JSON.stringify(data), assignedTo, assignedBy, id]);
    const after = itemOut(await db.get(SQL.item, [id]));
    const events = [{ t: 'item', op: 'put', data: after }];
    // Avvisi: assegnazione, "non posso", fatto.
    if (who.id) await notifier.itemChanged(hh, list, ex, after, who);
    // Il catalogo prodotti impara solo dalle liste della spesa.
    if (list.type !== 'spesa') return events;
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

  // ------------------------------------------------------------ alias dei membri
  // Chi cambia il proprio nome in un gruppo può aggiornare anche le attribuzioni passate
  // ("aggiunto da", "preso da", spese concluse). I client ricaricano lo stato.
  async function renameMember(hh, from, to) {
    if (!from || !to) throw new HttpError(400, 'Nome non valido');
    if (from !== to) {
      await db.run('UPDATE items SET created_by = ? WHERE household_id = ? AND created_by = ?', [to, hh.id, from]);
      await db.run('UPDATE items SET checked_by = ? WHERE household_id = ? AND checked_by = ?', [to, hh.id, from]);
      await db.run('UPDATE trips SET created_by = ? WHERE household_id = ? AND created_by = ?', [to, hh.id, from]);
      for (const t of await db.all('SELECT id, items FROM trips WHERE household_id = ?', [hh.id])) {
        const items = parseJson(t.items, []);
        if (!items.some((i) => i.by === from)) continue;
        for (const i of items) if (i.by === from) i.by = to;
        await db.run('UPDATE trips SET items = ? WHERE id = ?', [JSON.stringify(items), t.id]);
      }
    }
    return [{ t: 'reload' }];
  }

  // ------------------------------------------------------------ router
  // `parts` è il percorso senza "/api", `body` l'oggetto JSON.
  // Ritorna { status, body } | { status, raw, headers } | { stream: hh }.
  async function fullState(ctx) {
    return { ...await state(ctx.hh), events: await eventsMod.listAll(ctx.hh), ...await members.stateExtra(ctx) };
  }

  // Riepilogo di un gruppo per la panoramica: liste con i conteggi, cose ancora da fare/prendere
  // (solo spesa e "da fare"), membri attivi e avvisi recenti della persona.
  async function overviewOf(token, ip) {
    let ctx;
    try { ctx = await members.authenticate(token, ip); }
    catch (e) { return { ok: false, code: e.code || 'error' }; }
    if (!ctx.me) return { ok: false, code: 'legacy' };
    if (ctx.me.status !== 'active') return { ok: false, code: 'pending' };
    const hid = ctx.hh.id;
    const [lists, counts, items, mem, inbox, evs] = await Promise.all([
      db.all(SQL.lists, [hid]),
      db.all('SELECT list_id, checked, COUNT(*) AS n FROM items WHERE household_id = ? GROUP BY list_id, checked', [hid]),
      db.all(`SELECT i.* FROM items i JOIN lists l ON l.id = i.list_id WHERE i.household_id = ? AND i.checked = 0 AND l.type IN ('spesa', 'todo')`, [hid]),
      db.all(`SELECT id, alias FROM members WHERE household_id = ? AND status = 'active' ORDER BY created_at`, [hid]),
      notifier.listFor(ctx.hh, ctx.me.id, 20),
      eventsMod.listAll(ctx.hh, { from: today() }),
    ]);
    const cnt = {};
    for (const c of counts) { const o = cnt[c.list_id] || (cnt[c.list_id] = { todo: 0, done: 0 }); o[Number(c.checked) ? 'done' : 'todo'] = Number(c.n); }
    return {
      ok: true, household: { id: hid, name: ctx.hh.name, personal: !!ctx.hh.personal_of },
      me: { id: ctx.me.id, alias: ctx.me.alias, role: ctx.me.role, notify_email: !!Number(ctx.me.notify_email) },
      lists: lists.map((l) => ({ ...listOut(l), counts: cnt[l.id] || { todo: 0, done: 0 } })),
      items: items.map(itemOut), members: mem, inbox, events: evs,
    };
  }

  async function handle({ method: m, parts, body: b = {}, code = '', ip, ua = '' }) {
    // Chiave dell'account del dispositivo ("a_…"): per gli endpoint dell'account e per entrare nei gruppi.
    const auth = code.startsWith('a_') ? await accounts.resolve(code, ip) : null;
    if (parts[0] === 'account') {
      if (!auth) throw new HttpError(401, 'Entra con la tua email', 'logged_out');
      const r = await accounts.route(auth, m, parts, b, ip);
      if (r) return r;
      throw new HttpError(404, 'Non trovato');
    }
    // --- endpoint pubblici
    // Sfida ALTCHA da risolvere prima di chiedere un codice via email.
    if (m === 'GET' && parts[0] === 'auth' && parts[1] === 'challenge' && parts.length === 2) {
      return { status: 200, body: await protect.challenge(ip) };
    }
    // "Non voglio più ricevere inviti" (link in fondo agli inviti via email).
    if (parts[0] === 'email' && parts[1] === 'stop' && parts.length === 2 && (m === 'GET' || m === 'POST')) return protect.stopPage(m, b);
    const ar = await accounts.publicRoute(m, parts, b, ip, ua);
    if (ar) return ar;
    if (m === 'POST' && parts[0] === 'households' && parts.length === 1) {
      if (!auth) throw new HttpError(401, 'Prima conferma la tua email', 'account_required');
      await accounts.ensureTerms(auth.account, !!b.accept_terms, ip);
      const t = now();
      const id = crypto.randomUUID(), hcode = newCode();
      await db.run(SQL.hhInsert, [id, hcode, noLinks(str(b.name, 80), 'Il nome del gruppo') || 'Gruppo', t, 0]);
      await db.run(SQL.listInsert, [crypto.randomUUID(), id, 'Spesa', 'cart', 0, 'manual', t, t, 'spesa', '']);
      const hh = await db.get(SQL.hh, [id]);
      const { me, token } = await members.createOwner(hh, b.alias, auth);
      return { status: 201, body: { ...await fullState({ hh, me }), token, account: accounts.accountOut(auth.account) } };
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
      if (!r) { checkRate('auth:' + ip); throw new HttpError(404, 'Ricetta non trovata o non più condivisa'); }
      return { status: 200, body: { recipe: sharedOut(r) } };
    }

    if (m === 'GET' && parts[0] === 'config' && parts.length === 1) {
      return { status: 200, body: { email: mailer.enabled, push: notifier.publicKey, terms_version: TERMS_VERSION } };
    }
    // Promemoria delle scadenze (Vercel Cron manda "Authorization: Bearer $CRON_SECRET").
    if (parts[0] === 'cron' && parts[1] === 'reminders' && parts.length === 2 && (m === 'GET' || m === 'POST')) {
      const secret = process.env.CRON_SECRET || '';
      const ok = secret && code.length === secret.length && crypto.timingSafeEqual(Buffer.from(code), Buffer.from(secret));
      if (!ok) { checkRate('auth:' + ip); throw new HttpError(401, 'Non autorizzato', 'unauthorized'); }
      return { status: 200, body: await runDaily() };
    }
    // Panoramica: liste, cose da fare e avvisi di tutti i gruppi del telefono, in una richiesta.
    if (m === 'POST' && parts[0] === 'overview' && parts.length === 1) {
      checkRate('overview:' + ip, 240);
      const tokens = (Array.isArray(b.tokens) ? b.tokens : []).slice(0, 30).map((x) => String(x || ''));
      return { status: 200, body: { groups: await Promise.all(tokens.map((tk) => overviewOf(tk, ip))) } };
    }

    // Richieste di accesso, inviti personali, anteprima di un codice.
    const pub = await members.publicRoute(m, parts, b, ip, auth, ua);
    if (pub) return pub;

    const ctx = await members.authenticate(code, ip);
    const hh = ctx.hh;

    // Eliminazione del gruppo (amministratori, con il nome del gruppo come conferma): tutto ciò che
    // gli appartiene si cancella a cascata. Prima avvisiamo gli altri (push e tempo reale).
    if (m === 'POST' && parts[0] === 'household' && parts[1] === 'delete' && parts.length === 2) {
      members.requireAdmin(ctx);
      if (hh.personal_of) throw new HttpError(409, 'Il gruppo personale non si può eliminare', 'personal');
      if (str(b.confirm, 80).toLowerCase() !== String(hh.name).trim().toLowerCase()) {
        throw new HttpError(400, 'Per confermare scrivi esattamente il nome del gruppo', 'confirm_name');
      }
      const actor = ctx.me ? ctx.me.alias : '';
      for (const mm of await db.all(`SELECT * FROM members WHERE household_id = ? AND status = 'active'`, [hh.id])) {
        if (ctx.me && mm.id === ctx.me.id) continue;
        try { await notifier.deliver(hh, mm, { kind: 'group_deleted', actor, data: { group_name: hh.name } }); } catch (e) { console.error(e); }
      }
      try { await realtime.broadcast(hh.id, [{ t: 'group_deleted', by: actor }]); } catch (e) { console.error('broadcast fallito', e); }
      await db.run('DELETE FROM households WHERE id = ?', [hh.id]);
      return { status: 200, body: { ok: true } };
    }

    // Membri, profilo, impostazioni del gruppo; avvisi e notifiche push.
    const mr = await members.route(ctx, m, parts, b) || await notifier.route(ctx, m, parts, b);
    if (mr) {
      if (mr.events) {
        try { await realtime.broadcast(hh.id, mr.events); } catch (e) { console.error('broadcast fallito', e); }
        return { status: 200, body: { events: mr.events } };
      }
      return mr;
    }

    // Da qui in poi serve essere membri attivi (chi è in attesa non vede nulla del gruppo).
    members.requireActive(ctx);
    if (m === 'GET' && parts[0] === 'state') return { status: 200, body: await fullState(ctx) };
    if (m === 'GET' && parts[0] === 'events') return { stream: ctx };
    if (m === 'POST' && parts[0] === 'photos' && parts.length === 1) {
      return { status: 201, body: { id: await uploadPhoto(hh, b) } };
    }

    let events;
    const [kind, id, action] = parts;
    if (kind === 'products' && m === 'POST' && parts.length === 1) {
      events = await putProduct(hh, b);
    } else if (kind === 'products' && m === 'POST' && id === 'delete' && parts.length === 2) {
      const key = Shared.normName(b.key || b.name);
      await db.run(SQL.productDelete, [hh.id, key]);
      events = [{ t: 'product', op: 'del', id: key }];
    } else if (kind === 'member' && m === 'POST' && id === 'rename' && parts.length === 2 && ctx.legacy) {
      // Solo per i client della versione 2 durante la transizione (ora si usa PATCH /api/me).
      events = await renameMember(hh, str(b.from, 40), str(b.to, 40));
    } else if (kind === 'events') {
      if (!id || !ID_RE.test(id)) throw new HttpError(404, 'Non trovato');
      events = await eventsMod.route(ctx, m, parts, b, actor(ctx, b));
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
          events = await closeList(hh, id, b, ctx);
        } else if (m === 'POST' && action === 'move') {
          events = await moveList(hh, id, b, ctx, ip);
        }
      } else if (kind === 'items' && !action) {
        if (m === 'PUT') events = await putItem(hh, id, b, ctx);
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

  // Lavori periodici: promemoria e pulizia (limiti scaduti, prove usate, inviti vecchi).
  async function runDaily(t) {
    await protect.cleanup();
    return notifier.runReminders(t);
  }

  return { handle, streamHooks: (ctx) => members.streamHooks(ctx), runReminders: runDaily };
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
  ['households', 'personal_of', 'TEXT'],
  ['lists', 'type', "TEXT NOT NULL DEFAULT 'spesa'"],
  ['lists', 'variant', "TEXT NOT NULL DEFAULT ''"],
  ['items', 'due_date', "TEXT NOT NULL DEFAULT ''"],
  ['items', 'priority', 'INTEGER NOT NULL DEFAULT 0'],
  ['items', 'data', "TEXT NOT NULL DEFAULT '{}'"],
  ['items', 'assigned_to', 'TEXT'],
  ['items', 'assigned_by', 'TEXT'],
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
// Da eseguire dopo le migrazioni (indici sulle colonne nuove, avvio della transizione alla v3).
const postMigration = () => 'CREATE UNIQUE INDEX IF NOT EXISTS recipes_share ON recipes(share_token);\n' + memberPostMigration();

module.exports = {
  createCore, HttpError, SCHEMA: SCHEMA + MEMBER_SCHEMA + NOTIFY_SCHEMA + EVENT_SCHEMA + ACCOUNT_SCHEMA + PROTECT_SCHEMA,
  MIGRATIONS: [...MIGRATIONS, ...MEMBER_MIGRATIONS, ...NOTIFY_MIGRATIONS, ...EVENT_MIGRATIONS, ...ACCOUNT_MIGRATIONS],
  postMigration: () => postMigration() + '\n' + accountPostMigration()
    + '\nCREATE UNIQUE INDEX IF NOT EXISTS households_personal ON households(personal_of) WHERE personal_of IS NOT NULL;',
};
