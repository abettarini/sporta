'use strict';
/* Ricette pubbliche: visibilità, portata e caratteristiche, firma, ricerca per tutti
   (nome, ingredienti "con" e "senza", filtri), segnalazioni e revisione da parte
   dell'amministratore della piattaforma (ADMIN_EMAILS). Le ricette restano del gruppo
   che le ha scritte: gli altri le vedono in sola lettura e possono salvarne una copia. */

const Shared = require('../public/shared.js');
const { HttpError, str, now, num, ID_RE } = require('./util');
const { noLinks } = require('./protect');

const PUB_SCHEMA = `
  CREATE TABLE IF NOT EXISTS recipe_terms (
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, term TEXT NOT NULL,
    PRIMARY KEY (recipe_id, term)
  );
  CREATE INDEX IF NOT EXISTS recipe_terms_term ON recipe_terms(term);
  CREATE TABLE IF NOT EXISTS recipe_bookmarks (
    owner TEXT NOT NULL, recipe_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', author_name TEXT NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL, PRIMARY KEY (owner, recipe_id)
  );
  CREATE INDEX IF NOT EXISTS recipe_bookmarks_recipe ON recipe_bookmarks(recipe_id);
  CREATE TABLE IF NOT EXISTS recipe_reports (
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, reporter TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_at BIGINT NOT NULL,
    PRIMARY KEY (recipe_id, reporter)
  );
`;
const PUB_MIGRATIONS = [
  ['recipes', 'visibility', "TEXT NOT NULL DEFAULT 'private'"],
  ['recipes', 'published_at', 'BIGINT'],
  ['recipes', 'course', "TEXT NOT NULL DEFAULT ''"],
  ['recipes', 'traits', "TEXT NOT NULL DEFAULT '[]'"],
  ['recipes', 'slug', "TEXT NOT NULL DEFAULT ''"],
  ['recipes', 'saves', 'INTEGER NOT NULL DEFAULT 0'],
  ['recipes', 'hidden', 'INTEGER NOT NULL DEFAULT 0'],
  ['recipes', 'reviewed', 'INTEGER NOT NULL DEFAULT 0'],
  ['recipes', 'author_name', "TEXT NOT NULL DEFAULT ''"],
  ['recipes', 'search_text', "TEXT NOT NULL DEFAULT ''"],
  ['recipes', 'origin', "TEXT NOT NULL DEFAULT ''"],
  ['members', 'author_name', 'TEXT'],
];
const pubPostMigration = () => 'CREATE INDEX IF NOT EXISTS recipes_public ON recipes(visibility, hidden);\n';

const REPORT_REASONS = { spam: 'Pubblicità o spam', offensiva: 'Contenuto offensivo', copiata: 'Copiata senza permesso', persone: 'Foto di persone', altro: 'Altro' };
const HIDE_AFTER = 3; // segnalazioni da persone diverse prima di nasconderla
const PUBLISH_PER_DAY = 20;
const COURSE_IDS = Shared.COURSES.map((c) => c.id);
const TRAIT_IDS = Shared.TRAITS.map((t) => t.id);
const parseJson = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

function slugify(name, id) {
  const base = Shared.foldText(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'ricetta';
  return `${base}-${String(id).replace(/-/g, '').slice(0, 8)}`;
}
// Firma proposta: "Andrea da Famiglia Bardi"; nel gruppo personale solo il nome.
const defaultAuthor = (hh, me) => (hh.personal_of ? me.alias : `${me.alias} da ${hh.name}`).slice(0, 80);

// Scheda breve (risultati della ricerca) e completa (ricetta aperta).
function cardOut(r, hh) {
  return {
    id: r.id, name: r.name, servings: Number(r.servings), photos: parseJson(r.photos, []), course: r.course || '',
    traits: parseJson(r.traits, []), prep_min: r.prep_min == null ? null : Number(r.prep_min),
    cook_min: r.cook_min == null ? null : Number(r.cook_min), difficulty: r.difficulty || '',
    author_name: r.author_name || '', saves: Number(r.saves) || 0, published_at: num(r.published_at), slug: r.slug || '',
    mine: !!hh && r.household_id === hh.id,
  };
}
function fullOut(r, hh) {
  return {
    ...cardOut(r, hh), description: r.description || '', ingredients: parseJson(r.ingredients, []),
    steps: parseJson(r.steps, []), notes: r.notes || '', origin: r.origin || '',
  };
}

// Chi possiede le preferite: la persona (account); senza account, il membro.
const ownerOf = (ctx) => (ctx.me ? (ctx.me.account_id || 'm:' + ctx.me.id) : '');
// Una ricetta si può usare da un gruppo se è sua oppure pubblica e non nascosta.
const usableBy = (r, hh) => !!r && (r.household_id === hh.id || (r.visibility === 'public' && !Number(r.hidden)));

function createPublicRecipes({ db, realtime }) {
  const admins = () => String(process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  async function isAdmin(ctx) {
    if (!ctx.me || !ctx.me.account_id || !admins().length) return false;
    const a = await db.get('SELECT email FROM accounts WHERE id = ?', [ctx.me.account_id]);
    return !!a && admins().includes(String(a.email).toLowerCase());
  }

  // Dopo il salvataggio della ricetta: portata, caratteristiche, visibilità, firma e indice di ricerca.
  async function afterPut(ctx, id, b) {
    const r = await db.get('SELECT * FROM recipes WHERE id = ?', [id]);
    if (!r) return;
    const t = now();
    const course = b.course !== undefined ? (COURSE_IDS.includes(b.course) ? b.course : '') : r.course || '';
    const traits = b.traits !== undefined
      ? [...new Set((Array.isArray(b.traits) ? b.traits : []).map(String))].filter((x) => TRAIT_IDS.includes(x))
      : parseJson(r.traits, []);
    let visibility = r.visibility || 'private';
    if (b.visibility === 'public' || b.visibility === 'private') visibility = b.visibility;
    let publishedAt = r.published_at == null ? null : num(r.published_at);
    let author = r.author_name || '';
    if (visibility === 'public') {
      // Nei testi pubblici niente link (come per inviti e nomi): si evita lo spam.
      const all = [r.name, r.description, r.notes, ...parseJson(r.steps, []).map((x) => x.text), ...parseJson(r.ingredients, []).map((i) => `${i.name} ${i.brand || ''}`)].join('\n');
      noLinks(all, 'Una ricetta pubblica');
      // La firma: quella indicata ora, altrimenti quella già scelta nel gruppo, altrimenti quella proposta.
      if (b.author_name !== undefined && ctx.me) {
        const chosen = noLinks(str(b.author_name, 80), 'La firma');
        await db.run('UPDATE members SET author_name = ? WHERE id = ?', [chosen, ctx.me.id]);
        ctx.me.author_name = chosen;
      }
      if (r.visibility !== 'public' || !author || b.author_name !== undefined) {
        author = ctx.me ? (ctx.me.author_name != null ? ctx.me.author_name : defaultAuthor(ctx.hh, ctx.me)) : '';
      }
      if (r.visibility !== 'public') {
        const day = await db.get('SELECT COUNT(*) AS n FROM recipes WHERE household_id = ? AND published_at > ?', [ctx.hh.id, t - 864e5]);
        if (Number(day.n) >= PUBLISH_PER_DAY) throw new HttpError(429, 'Hai pubblicato molte ricette oggi: riprova domani', 'publish_limit');
        publishedAt = t;
      }
    }
    const ings = parseJson(r.ingredients, []);
    const search = Shared.foldText(`${r.name} ${r.description || ''}`).slice(0, 3000);
    await db.run(`UPDATE recipes SET course = ?, traits = ?, visibility = ?, published_at = ?, author_name = ?, slug = ?, search_text = ?
      WHERE id = ?`, [course, JSON.stringify(traits), visibility, publishedAt, author, slugify(r.name, r.id), search, id]);
    // Resa privata: esce dai menu "La faccio" degli altri gruppi.
    if (visibility !== 'public' && r.visibility === 'public') {
      const gone = await db.all('SELECT id, household_id FROM menu_entries WHERE recipe_id = ? AND household_id <> ?', [id, r.household_id]);
      await db.run('DELETE FROM menu_entries WHERE recipe_id = ? AND household_id <> ?', [id, r.household_id]);
      if (gone.length && realtime) for (const g of gone) realtime.broadcast(g.household_id, [{ t: 'menu', op: 'del', id: g.id }]).catch(() => {});
    }
    await db.run('DELETE FROM recipe_terms WHERE recipe_id = ?', [id]);
    const terms = [...new Set(ings.map((i) => Shared.foldText(i.name)).filter(Boolean))].slice(0, 200);
    for (const term of terms) await db.run('INSERT INTO recipe_terms (recipe_id, term) VALUES (?, ?)', [id, term.slice(0, 120)]);
  }

  // Ricerca tra le ricette pubbliche (non nascoste) di tutti i gruppi.
  async function search(ctx, q) {
    const where = ["r.visibility = 'public'", 'r.hidden = 0'];
    const args = [];
    const text = Shared.foldText(str(q.q, 100));
    if (text) {
      // Ogni parola deve comparire nel nome/descrizione o tra gli ingredienti.
      for (const w of text.split(' ').filter(Boolean).slice(0, 6)) {
        where.push('(r.search_text LIKE ? OR EXISTS (SELECT 1 FROM recipe_terms t WHERE t.recipe_id = r.id AND t.term LIKE ?))');
        args.push(`%${w}%`, `%${w}%`);
      }
    }
    if (q.course && COURSE_IDS.includes(q.course)) { where.push('r.course = ?'); args.push(q.course); }
    for (const tr of String(q.traits || '').split(',').filter((x) => TRAIT_IDS.includes(x))) {
      where.push('r.traits LIKE ?'); args.push(`%"${tr}"%`);
    }
    const list = (v) => String(v || '').split(',').map((s) => Shared.foldText(s)).filter(Boolean).slice(0, 10);
    for (const w of list(q.with)) {
      where.push('EXISTS (SELECT 1 FROM recipe_terms t WHERE t.recipe_id = r.id AND t.term LIKE ?)'); args.push(`%${w}%`);
    }
    for (const w of list(q.without)) {
      where.push('NOT EXISTS (SELECT 1 FROM recipe_terms t WHERE t.recipe_id = r.id AND t.term LIKE ?)'); args.push(`%${w}%`);
    }
    const max = parseInt(q.max_min, 10);
    if (max > 0) { where.push('(COALESCE(r.prep_min, 0) + COALESCE(r.cook_min, 0)) BETWEEN 1 AND ?'); args.push(max); }
    const order = {
      recenti: 'r.published_at DESC',
      veloci: "CASE WHEN COALESCE(r.prep_min, 0) + COALESCE(r.cook_min, 0) = 0 THEN 99999 ELSE COALESCE(r.prep_min, 0) + COALESCE(r.cook_min, 0) END, r.saves DESC",
      nome: 'lower(r.name)',
    }[q.sort] || 'r.saves DESC, r.published_at DESC';
    const limit = Math.max(1, Math.min(60, parseInt(q.limit, 10) || 30));
    const offset = Math.max(0, Math.min(2000, parseInt(q.offset, 10) || 0));
    const cond = where.join(' AND ');
    const [rows, count] = await Promise.all([
      db.all(`SELECT r.* FROM recipes r WHERE ${cond} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, args),
      db.get(`SELECT COUNT(*) AS n FROM recipes r WHERE ${cond}`, args),
    ]);
    return { total: Number(count.n), recipes: rows.map((r) => cardOut(r, ctx.hh)) };
  }

  async function getPublic(ctx, id) {
    const r = ID_RE.test(id) && await db.get('SELECT * FROM recipes WHERE id = ?', [id]);
    const visible = r && (r.household_id === ctx.hh.id || (r.visibility === 'public' && (!Number(r.hidden) || await isAdmin(ctx))));
    if (!visible) throw new HttpError(404, 'Ricetta non trovata o non più pubblica', 'not_public');
    return fullOut(r, ctx.hh);
  }

  async function report(ctx, id, b) {
    const r = ID_RE.test(id) && await db.get('SELECT * FROM recipes WHERE id = ?', [id]);
    if (!r || r.visibility !== 'public') throw new HttpError(404, 'Ricetta non trovata');
    if (r.household_id === ctx.hh.id) throw new HttpError(400, 'Non puoi segnalare una ricetta del tuo gruppo');
    const reason = REPORT_REASONS[b.reason] ? b.reason : 'altro';
    const reporter = (ctx.me && (ctx.me.account_id || ctx.me.id)) || 'anon';
    await db.run('DELETE FROM recipe_reports WHERE recipe_id = ? AND reporter = ?', [id, reporter]);
    await db.run('INSERT INTO recipe_reports (recipe_id, reporter, reason, note, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, reporter, reason, str(b.note, 500), now()]);
    const n = Number((await db.get('SELECT COUNT(*) AS n FROM recipe_reports WHERE recipe_id = ?', [id])).n);
    // Dopo la revisione dell'amministratore servono altre segnalazioni per nasconderla di nuovo.
    if (n >= HIDE_AFTER + Number(r.reviewed || 0)) await db.run('UPDATE recipes SET hidden = 1 WHERE id = ?', [id]);
    return { ok: true };
  }

  // Revisione delle segnalazioni (solo amministratori della piattaforma).
  async function reports(ctx) {
    if (!await isAdmin(ctx)) throw new HttpError(403, 'Solo per gli amministratori');
    const rows = await db.all(`SELECT r.*, (SELECT COUNT(*) FROM recipe_reports x WHERE x.recipe_id = r.id) AS n_reports
      FROM recipes r WHERE r.visibility = 'public' AND (r.hidden = 1 OR EXISTS (SELECT 1 FROM recipe_reports x WHERE x.recipe_id = r.id))
      ORDER BY r.hidden DESC, n_reports DESC LIMIT 200`, []);
    const out = [];
    for (const r of rows) {
      const reps = await db.all('SELECT reason, note, created_at FROM recipe_reports WHERE recipe_id = ? ORDER BY created_at DESC', [r.id]);
      out.push({ ...cardOut(r, null), hidden: !!Number(r.hidden), reports: reps.map((x) => ({ reason: REPORT_REASONS[x.reason] || x.reason, note: x.note, created_at: num(x.created_at) })) });
    }
    return { recipes: out };
  }
  async function review(ctx, id, b) {
    if (!await isAdmin(ctx)) throw new HttpError(403, 'Solo per gli amministratori');
    const r = ID_RE.test(id) && await db.get('SELECT * FROM recipes WHERE id = ?', [id]);
    if (!r) throw new HttpError(404, 'Ricetta non trovata');
    if (b.action === 'hide') await db.run('UPDATE recipes SET hidden = 1 WHERE id = ?', [id]);
    else if (b.action === 'restore') {
      const n = Number((await db.get('SELECT COUNT(*) AS n FROM recipe_reports WHERE recipe_id = ?', [id])).n);
      await db.run('UPDATE recipes SET hidden = 0, reviewed = ? WHERE id = ?', [n, id]);
    } else throw new HttpError(400, 'Azione non valida');
    return { ok: true };
  }

  // ------------------------------------------------------------ preferite (della persona, in tutti i suoi gruppi)
  async function bookmarks(ctx) {
    const owner = ownerOf(ctx); if (!owner) return [];
    const rows = await db.all('SELECT * FROM recipe_bookmarks WHERE owner = ? ORDER BY created_at DESC', [owner]);
    const out = [];
    for (const b of rows) {
      const r = await db.get('SELECT * FROM recipes WHERE id = ?', [b.recipe_id]);
      const ok = usableBy(r, ctx.hh);
      out.push({
        recipe_id: b.recipe_id, name: ok ? r.name : b.name, author_name: ok ? r.author_name || '' : b.author_name, created_at: num(b.created_at),
        recipe: ok ? fullOut(r, ctx.hh) : null,
        gone: !ok ? (!r ? 'deleted' : Number(r.hidden) ? 'hidden' : 'private') : '',
      });
    }
    return out;
  }
  async function recount(id) {
    await db.run('UPDATE recipes SET saves = (SELECT COUNT(*) FROM recipe_bookmarks WHERE recipe_id = ?) WHERE id = ?', [id, id]);
  }
  async function bookmark(ctx, m, id) {
    const owner = ownerOf(ctx);
    if (!owner) throw new HttpError(400, 'Aggiorna Sporta per salvare le preferite', 'legacy');
    if (!ID_RE.test(id)) throw new HttpError(404, 'Ricetta non trovata');
    if (m === 'DELETE') {
      await db.run('DELETE FROM recipe_bookmarks WHERE owner = ? AND recipe_id = ?', [owner, id]);
      await recount(id);
      return { ok: true };
    }
    const r = await db.get('SELECT * FROM recipes WHERE id = ?', [id]);
    if (!r || r.visibility !== 'public' || Number(r.hidden)) throw new HttpError(404, 'Ricetta non trovata o non più pubblica', 'not_public');
    const n = await db.get('SELECT COUNT(*) AS n FROM recipe_bookmarks WHERE owner = ?', [owner]);
    if (Number(n.n) >= 1000) throw new HttpError(409, 'Hai già 1000 preferite: togline qualcuna', 'too_many');
    await db.run('DELETE FROM recipe_bookmarks WHERE owner = ? AND recipe_id = ?', [owner, id]);
    await db.run('INSERT INTO recipe_bookmarks (owner, recipe_id, name, author_name, created_at) VALUES (?, ?, ?, ?, ?)', [owner, id, r.name, r.author_name || '', now()]);
    await recount(id);
    return { ok: true, bookmark: { recipe_id: id, name: r.name, author_name: r.author_name || '', created_at: now(), recipe: fullOut(r, ctx.hh), gone: '' } };
  }
  async function dropOwner(owner) {
    const ids = (await db.all('SELECT recipe_id FROM recipe_bookmarks WHERE owner = ?', [owner])).map((x) => x.recipe_id);
    await db.run('DELETE FROM recipe_bookmarks WHERE owner = ?', [owner]);
    for (const id of ids) await recount(id);
  }

  // GET/PUT/DELETE /api/bookmarks[/:id];
  // GET /api/recipes/search, GET /api/recipes/:id/public, POST /api/recipes/:id/report,
  // GET /api/recipes/reports, POST /api/recipes/:id/review.
  async function route(ctx, m, parts, b) {
    const [kind, id, action] = parts;
    if (kind === 'bookmarks') {
      if (m === 'GET' && parts.length === 1) return { status: 200, body: { bookmarks: await bookmarks(ctx) } };
      if ((m === 'PUT' || m === 'DELETE') && parts.length === 2) return { status: 200, body: await bookmark(ctx, m, id) };
      return null;
    }
    if (kind !== 'recipes') return null;
    if (m === 'GET' && id === 'search' && parts.length === 2) return { status: 200, body: await search(ctx, b) };
    if (m === 'GET' && id === 'reports' && parts.length === 2) return { status: 200, body: await reports(ctx) };
    if (m === 'GET' && action === 'public' && parts.length === 3) return { status: 200, body: { recipe: await getPublic(ctx, id) } };
    if (m === 'POST' && action === 'report' && parts.length === 3) return { status: 200, body: await report(ctx, id, b) };
    if (m === 'POST' && action === 'review' && parts.length === 3) return { status: 200, body: await review(ctx, id, b) };
    return null;
  }

  return { afterPut, route, isAdmin, defaultAuthor, bookmarks, dropOwner };
}

module.exports = { createPublicRecipes, PUB_SCHEMA, PUB_MIGRATIONS, pubPostMigration, REPORT_REASONS, cardOut, fullOut, usableBy };
