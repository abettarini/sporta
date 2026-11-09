'use strict';
/* Menu "La faccio" del gruppo: le ricette che si vogliono preparare (con le persone) e,
   per ogni ingrediente, la scelta condivisa "Ce l'ho" / "Da comprare". Tutti nel gruppo lo
   vedono e lo modificano; resta finché qualcuno non lo svuota. */

const { HttpError, str, now, num, ID_RE } = require('./util');
const { fullOut, usableBy } = require('./pubrecipes');

const MENU_SCHEMA = `
  CREATE TABLE IF NOT EXISTS menu_entries (
    id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, servings INTEGER NOT NULL DEFAULT 4,
    added_by TEXT NOT NULL DEFAULT '', created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS menu_entries_household ON menu_entries(household_id);
  CREATE TABLE IF NOT EXISTS menu_marks (
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE, key TEXT NOT NULL,
    state TEXT NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY (household_id, key)
  );
`;
const STATES = ['have', 'buy'];

const entryOut = (r) => r && { id: r.id, recipe_id: r.recipe_id, servings: Number(r.servings), added_by: r.added_by || '', created_at: num(r.created_at), updated_at: num(r.updated_at) };
const markOut = (r) => r && { key: r.key, state: r.state, updated_at: num(r.updated_at) };

function createMenu({ db }) {
  // Le ricette pubbliche di altri gruppi nel menu arrivano insieme (chi non le ha tra le preferite deve vederle).
  async function state(hh) {
    const [entries, marks] = await Promise.all([
      db.all('SELECT * FROM menu_entries WHERE household_id = ? ORDER BY created_at', [hh.id]),
      db.all('SELECT * FROM menu_marks WHERE household_id = ?', [hh.id]),
    ]);
    const out = [];
    const recipes = [];
    for (const e of entries) {
      const r = await db.get('SELECT * FROM recipes WHERE id = ?', [e.recipe_id]);
      if (!usableBy(r, hh)) continue;
      if (r.household_id !== hh.id) recipes.push(fullOut(r, hh));
      out.push(entryOut(e));
    }
    return { entries: out, marks: marks.map(markOut), recipes };
  }
  async function entryEvent(hh, id) {
    const e = entryOut(await db.get('SELECT * FROM menu_entries WHERE id = ?', [id]));
    const r = await db.get('SELECT * FROM recipes WHERE id = ?', [e.recipe_id]);
    if (r && r.household_id !== hh.id) e.recipe = fullOut(r, hh);
    return { t: 'menu', op: 'put', data: e };
  }

  // /api/menu/:id (PUT, DELETE), /api/menu/clear (POST), /api/menu/marks (PUT).
  async function route(ctx, m, parts, b, who) {
    const [kind, id] = parts;
    if (kind !== 'menu') return null;
    const hh = ctx.hh, t = now();
    if (m === 'POST' && id === 'clear' && parts.length === 2) {
      const entries = await db.all('SELECT id FROM menu_entries WHERE household_id = ?', [hh.id]);
      const marks = await db.all('SELECT key FROM menu_marks WHERE household_id = ?', [hh.id]);
      await db.run('DELETE FROM menu_entries WHERE household_id = ?', [hh.id]);
      await db.run('DELETE FROM menu_marks WHERE household_id = ?', [hh.id]);
      return [...entries.map((e) => ({ t: 'menu', op: 'del', id: e.id })), ...marks.map((x) => ({ t: 'mark', op: 'del', id: x.key }))];
    }
    if (m === 'PUT' && id === 'marks' && parts.length === 2) {
      const key = str(b.key, 160);
      if (!key) throw new HttpError(400, 'Ingrediente non valido');
      if (!STATES.includes(b.state)) {
        await db.run('DELETE FROM menu_marks WHERE household_id = ? AND key = ?', [hh.id, key]);
        return [{ t: 'mark', op: 'del', id: key }];
      }
      await db.run('DELETE FROM menu_marks WHERE household_id = ? AND key = ?', [hh.id, key]);
      await db.run('INSERT INTO menu_marks (household_id, key, state, updated_at) VALUES (?, ?, ?, ?)', [hh.id, key, b.state, t]);
      return [{ t: 'mark', op: 'put', data: { key, state: b.state, updated_at: t } }];
    }
    if (!id || !ID_RE.test(id) || parts.length !== 2) throw new HttpError(404, 'Non trovato');
    const ex = await db.get('SELECT * FROM menu_entries WHERE id = ?', [id]);
    if (ex && ex.household_id !== hh.id) throw new HttpError(404, 'Non trovato');
    if (m === 'DELETE') {
      if (ex) await db.run('DELETE FROM menu_entries WHERE id = ?', [id]);
      return [{ t: 'menu', op: 'del', id }];
    }
    if (m === 'PUT') {
      const servings = Math.max(1, Math.min(99, parseInt(b.servings, 10) || (ex ? Number(ex.servings) : 4)));
      if (ex) {
        await db.run('UPDATE menu_entries SET servings = ?, updated_at = ? WHERE id = ?', [servings, t, id]);
      } else {
        const r = ID_RE.test(String(b.recipe_id || '')) && await db.get('SELECT * FROM recipes WHERE id = ?', [String(b.recipe_id)]);
        if (!usableBy(r, hh)) throw new HttpError(404, 'Ricetta non trovata');
        await db.run('INSERT INTO menu_entries (id, household_id, recipe_id, servings, added_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, hh.id, r.id, servings, who.name || '', t, t]);
      }
      return [await entryEvent(hh, id)];
    }
    return null;
  }

  return { state, route };
}

module.exports = { createMenu, MENU_SCHEMA };
