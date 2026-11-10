'use strict';
/* Database centrale degli alimenti, lato server. La base è public/foods.json (generato da
   scripts/foods/); sopra ci sono le correzioni degli amministratori, salvate nel database e
   valide subito per tutti. Qui anche la coda dei nomi non riconosciuti (solo conteggi, senza
   dire quali gruppi) e le segnalazioni degli utenti. */

const crypto = require('node:crypto');
const Shared = require('../public/shared.js');
const FoodsLib = require('../public/foods-lib.js');
const { HttpError, str, now, num } = require('./util');

const FOODS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS food_edits (
    id TEXT PRIMARY KEY, data TEXT, deleted INTEGER NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL, updated_by TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS food_alias_edits (
    alias TEXT PRIMARY KEY, food_id TEXT NOT NULL DEFAULT '', updated_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS food_misses (
    key TEXT PRIMARY KEY, name TEXT NOT NULL, uses INTEGER NOT NULL DEFAULT 0, n_groups INTEGER NOT NULL DEFAULT 0,
    ignored INTEGER NOT NULL DEFAULT 0, last_seen BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS food_miss_groups (
    key TEXT NOT NULL, hh TEXT NOT NULL, PRIMARY KEY (key, hh)
  );
  CREATE TABLE IF NOT EXISTS food_reports (
    id TEXT PRIMARY KEY, food_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '', reporter TEXT NOT NULL DEFAULT '', created_at BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open', resolved_at BIGINT
  );
`;

const DEPS = new Set(Shared.DEPARTMENTS.map((d) => d.id));
const KINDS = ['', 'carne', 'pesce', 'latte', 'uova', 'miele'];
const REPORT_KINDS = { wrong_food: 'Alimento sbagliato', wrong_values: 'Valori sbagliati', missing: 'Alimento mancante', other: 'Altro' };
const NUT = FoodsLib.NUT;
const base = require('../public/foods.json');
const slug = (s) => FoodsLib.key(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const hhHash = (id) => crypto.createHash('sha256').update('food-miss:' + id).digest('hex').slice(0, 16);

// Dati di un alimento inviati dall'amministratore -> forma salvata (come in foods.json).
function cleanFood(id, b, byId) {
  const n = str(b.n || b.name, 80);
  if (!n) throw new HttpError(400, 'Il nome è obbligatorio');
  const f = { id, n, d: DEPS.has(b.d) ? b.d : '' };
  if (b.p && b.p !== id && byId.has(b.p)) f.p = b.p;
  if (KINDS.includes(b.k) && b.k) f.k = b.k;
  if (b.a) f.a = 1;
  const pos = (v, max) => { const x = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(x) && x > 0 && x <= max ? Math.round(x * 100) / 100 : null; };
  const pz = pos(b.pz, 5000); if (pz) f.pz = pz;
  const den = pos(b.den, 5); if (den) f.den = den;
  if (b.u && typeof b.u === 'object') {
    const u = {};
    for (const [k, v] of Object.entries(b.u)) { const g = pos(v, 5000); if (/^[a-z]{2,20}$/.test(k) && g) u[k] = g; }
    if (Object.keys(u).length) f.u = u;
  }
  f.src = /^(ciqual:\d+|usda:\d+|zero|manual)$/.test(String(b.src || '')) ? b.src : 'manual';
  if (Array.isArray(b.v)) {
    f.v = NUT.map((_, k) => { const x = Number(String(b.v[k] ?? '').replace(',', '.')); return b.v[k] === '' || b.v[k] == null || !Number.isFinite(x) || x < 0 ? null : Math.round(x * 100) / 100; });
    if (f.v[0] == null && f.src !== 'zero') throw new HttpError(400, 'Servono almeno le kcal per 100 g');
  } else if (f.src === 'zero') f.v = NUT.map(() => 0);
  return f;
}

function createFoods({ db }) {
  let merged = null, stamp = '', checkedAt = 0;

  // Base + correzioni. stamp cambia a ogni correzione: le app riscaricano solo allora.
  async function load(force = false) {
    if (!force && merged && Date.now() - checkedAt < 30000) return merged;
    checkedAt = Date.now();
    const last = await db.get('SELECT MAX(updated_at) AS t FROM (SELECT updated_at FROM food_edits UNION ALL SELECT updated_at FROM food_alias_edits) x', []);
    const s = `${base.version}.${num(last && last.t) || 0}`;
    if (merged && s === stamp) return merged;
    const byId = new Map(base.foods.map((f) => [f.id, { ...f }]));
    for (const e of await db.all('SELECT * FROM food_edits', [])) {
      if (Number(e.deleted)) byId.delete(e.id);
      else { try { byId.set(e.id, { ...JSON.parse(e.data), id: e.id, edited: num(e.updated_at) }); } catch { /* riga rovinata: si ignora */ } }
    }
    const aliases = { ...base.aliases };
    for (const a of await db.all('SELECT * FROM food_alias_edits', [])) {
      if (a.food_id && byId.has(a.food_id)) aliases[a.alias] = a.food_id; else delete aliases[a.alias];
    }
    for (const [k, id] of Object.entries(aliases)) if (!byId.has(id)) delete aliases[k];
    // il nome di ogni alimento è sempre anche un suo nome alternativo
    for (const f of byId.values()) aliases[FoodsLib.key(f.n)] = f.id;
    merged = { version: s, nutrients: base.nutrients, sources: base.sources, foods: [...byId.values()], aliases };
    stamp = s;
    Shared.foodIndex = FoodsLib.createIndex(merged);
    return merged;
  }
  const version = async () => (await load()).version;

  // Nomi di articoli e ingredienti non riconosciuti: solo conteggi. Il gruppo si conta con un'impronta.
  async function recordMisses(hh, names) {
    if (!Shared.foodIndex) return;
    const t = now();
    const seen = new Set();
    for (const raw of names) {
      const name = str(raw, 60).trim();
      const key = FoodsLib.key(name);
      if (!key || key.length < 3 || seen.has(key) || /\d{3,}/.test(key)) continue;
      seen.add(key);
      if (Shared.foodIndex.match(name)) continue;
      const ex = await db.get('SELECT key FROM food_misses WHERE key = ?', [key]);
      if (ex) await db.run('UPDATE food_misses SET uses = uses + 1, last_seen = ? WHERE key = ?', [t, key]);
      else await db.run('INSERT INTO food_misses (key, name, uses, n_groups, ignored, last_seen) VALUES (?, ?, 1, 0, 0, ?)', [key, name, t]);
      const h = hhHash(hh.id);
      if (!(await db.get('SELECT key FROM food_miss_groups WHERE key = ? AND hh = ?', [key, h]))) {
        await db.run('INSERT INTO food_miss_groups (key, hh) VALUES (?, ?)', [key, h]);
        await db.run('UPDATE food_misses SET n_groups = n_groups + 1 WHERE key = ?', [key]);
      }
    }
  }

  async function report(ctx, b) {
    const reporter = (ctx.me && (ctx.me.account_id || ctx.me.id)) || '';
    const day = await db.get('SELECT COUNT(*) AS n FROM food_reports WHERE reporter = ? AND created_at > ?', [reporter, now() - 864e5]);
    if (Number(day.n) >= 20) throw new HttpError(429, 'Hai già mandato molte segnalazioni oggi', 'rate_limited');
    const kind = REPORT_KINDS[b.kind] ? b.kind : 'other';
    const m = await load();
    const foodId = m.foods.some((f) => f.id === b.food_id) ? b.food_id : '';
    const name = str(b.name, 80);
    if (!foodId && !name) throw new HttpError(400, 'Indica l\'ingrediente');
    await db.run('INSERT INTO food_reports (id, food_id, name, kind, note, reporter, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), foodId, name, kind, str(b.note, 500), reporter, now(), 'open']);
    return { ok: true };
  }

  // ------------------------------------------------------------ amministratori
  async function saveFood(ctx, id, b) {
    const m = await load(true);
    const byId = new Map(m.foods.map((f) => [f.id, f]));
    const isNew = id === 'new';
    if (isNew) {
      id = slug(b.n || b.name);
      if (!id) throw new HttpError(400, 'Il nome è obbligatorio');
      if (byId.has(id)) throw new HttpError(409, 'Esiste già un alimento con questo nome', 'exists');
    } else if (!byId.has(id)) throw new HttpError(404, 'Alimento non trovato');
    const f = cleanFood(id, b, byId);
    // Nomi alternativi: quelli indicati sostituiscono i precedenti di questo alimento.
    if (Array.isArray(b.aliases)) {
      const want = new Set(b.aliases.map((a) => FoodsLib.key(a)).filter((a) => a && a.length <= 80));
      want.delete(FoodsLib.key(f.n));
      const clash = [...want].filter((a) => m.aliases[a] && m.aliases[a] !== id && byId.get(m.aliases[a]) && FoodsLib.key(byId.get(m.aliases[a]).n) === a);
      if (clash.length) throw new HttpError(409, `“${clash[0]}” è il nome di un altro alimento`, 'alias_clash');
      const t = now();
      for (const [a, fid] of Object.entries(m.aliases)) if (fid === id && !want.has(a) && a !== FoodsLib.key(f.n)) {
        await db.run('DELETE FROM food_alias_edits WHERE alias = ?', [a]);
        await db.run('INSERT INTO food_alias_edits (alias, food_id, updated_at) VALUES (?, ?, ?)', [a, '', t]);
      }
      for (const a of want) if (m.aliases[a] !== id) {
        await db.run('DELETE FROM food_alias_edits WHERE alias = ?', [a]);
        await db.run('INSERT INTO food_alias_edits (alias, food_id, updated_at) VALUES (?, ?, ?)', [a, id, t]);
      }
    }
    await db.run('DELETE FROM food_edits WHERE id = ?', [id]);
    await db.run('INSERT INTO food_edits (id, data, deleted, updated_at, updated_by) VALUES (?, ?, 0, ?, ?)', [id, JSON.stringify(f), now(), (ctx.me && ctx.me.alias) || '']);
    const m2 = await load(true);
    return { food: m2.foods.find((x) => x.id === id), aliases: aliasesOf(m2, id), version: m2.version };
  }
  async function deleteFood(ctx, id) {
    const m = await load(true);
    if (!m.foods.some((f) => f.id === id)) throw new HttpError(404, 'Alimento non trovato');
    if (m.foods.some((f) => f.p === id)) throw new HttpError(409, 'Ha delle varianti: prima eliminale o spostale', 'has_variants');
    await db.run('DELETE FROM food_edits WHERE id = ?', [id]);
    await db.run('INSERT INTO food_edits (id, data, deleted, updated_at, updated_by) VALUES (?, NULL, 1, ?, ?)', [id, now(), (ctx.me && ctx.me.alias) || '']);
    return { ok: true, version: (await load(true)).version };
  }
  const aliasesOf = (m, id) => Object.entries(m.aliases).filter(([a, fid]) => fid === id && a !== FoodsLib.key((m.foods.find((f) => f.id === id) || {}).n)).map(([a]) => a).sort();

  async function misses(all) {
    const rows = await db.all(`SELECT * FROM food_misses WHERE ignored = 0 ${all ? '' : 'AND n_groups >= 2'} ORDER BY n_groups DESC, uses DESC LIMIT 300`, []);
    const out = [];
    // i nomi riconosciuti nel frattempo (per un nome alternativo aggiunto) spariscono dalla coda
    for (const r of rows) {
      if (Shared.foodIndex && Shared.foodIndex.match(r.name)) { await db.run('DELETE FROM food_misses WHERE key = ?', [r.key]); continue; }
      out.push({ key: r.key, name: r.name, uses: Number(r.uses), groups: Number(r.n_groups), last_seen: num(r.last_seen) });
    }
    const hidden = Number((await db.get('SELECT COUNT(*) AS n FROM food_misses WHERE ignored = 0 AND n_groups < 2', [])).n);
    return { misses: out, hidden: all ? 0 : hidden };
  }
  async function missAction(ctx, key, b) {
    const r = await db.get('SELECT * FROM food_misses WHERE key = ?', [key]);
    if (!r) throw new HttpError(404, 'Nome non trovato');
    if (b.action === 'ignore') { await db.run('UPDATE food_misses SET ignored = 1 WHERE key = ?', [key]); return { ok: true }; }
    if (b.action === 'alias') {
      const m = await load(true);
      if (!m.foods.some((f) => f.id === b.food_id)) throw new HttpError(404, 'Alimento non trovato');
      await db.run('DELETE FROM food_alias_edits WHERE alias = ?', [key]);
      await db.run('INSERT INTO food_alias_edits (alias, food_id, updated_at) VALUES (?, ?, ?)', [key, b.food_id, now()]);
      await db.run('DELETE FROM food_misses WHERE key = ?', [key]);
      return { ok: true, version: (await load(true)).version };
    }
    throw new HttpError(400, 'Azione non valida');
  }
  async function reports() {
    const rows = await db.all(`SELECT * FROM food_reports WHERE status = 'open' ORDER BY created_at DESC LIMIT 200`, []);
    const m = await load();
    const names = new Map(m.foods.map((f) => [f.id, f.n]));
    return { reports: rows.map((r) => ({ id: r.id, food_id: r.food_id, food: names.get(r.food_id) || '', name: r.name, kind: r.kind, kind_label: REPORT_KINDS[r.kind], note: r.note, created_at: num(r.created_at) })) };
  }
  async function closeReport(id) {
    await db.run(`UPDATE food_reports SET status = 'closed', resolved_at = ? WHERE id = ?`, [now(), id]);
    return { ok: true };
  }
  async function counts() {
    const [a, b] = await Promise.all([
      db.get(`SELECT COUNT(*) AS n FROM food_reports WHERE status = 'open'`, []),
      db.get('SELECT COUNT(*) AS n FROM food_misses WHERE ignored = 0 AND n_groups >= 2', []),
    ]);
    return { reports: Number(a.n), misses: Number(b.n) };
  }

  // GET /api/foods (per tutti, senza accesso): il database unito, con la versione.
  async function publicRoute(m, parts) {
    if (m === 'GET' && parts.length === 1) return { status: 200, body: await load() };
    return null;
  }
  // POST /api/foods/report (utenti); /api/admin/foods/… (amministratori, isAdmin verificato da chi chiama)
  async function route(ctx, m, parts, b, isAdmin) {
    if (parts[0] === 'foods' && parts[1] === 'report' && m === 'POST' && parts.length === 2) return { status: 200, body: await report(ctx, b) };
    if (parts[0] !== 'admin' || parts[1] !== 'foods') return null;
    if (!isAdmin) throw new HttpError(403, 'Solo per gli amministratori della piattaforma');
    const [, , a, rawId, act] = parts;
    let id = rawId;
    try { id = rawId && decodeURIComponent(rawId); } catch { throw new HttpError(400, 'Percorso non valido'); }
    if (m === 'GET' && !a) return { status: 200, body: { ...(await load(true)), counts: await counts() } };
    if (a === 'item' && id && m === 'PUT' && !act) return { status: 200, body: await saveFood(ctx, id, b) };
    if (a === 'item' && id && m === 'DELETE' && !act) return { status: 200, body: await deleteFood(ctx, id) };
    if (a === 'misses' && m === 'GET' && !id) return { status: 200, body: await misses(b.all === '1') };
    if (a === 'misses' && id && m === 'POST') return { status: 200, body: await missAction(ctx, id, b) };
    if (a === 'reports' && m === 'GET' && !id) return { status: 200, body: await reports() };
    if (a === 'reports' && id && m === 'POST') return { status: 200, body: await closeReport(id) };
    throw new HttpError(404, 'Non trovato');
  }

  return { load, version, recordMisses, route, publicRoute, aliasesOf };
}

module.exports = { createFoods, FOODS_SCHEMA, REPORT_KINDS };
