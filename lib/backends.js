'use strict';
// Adattatori: database (SQLite locale o Postgres) e canale tempo reale (SSE o Supabase).

const path = require('node:path');
const fs = require('node:fs');
const { SCHEMA } = require('./core');

const env = (...names) => names.map((n) => process.env[n]).find(Boolean) || '';

// ------------------------------------------------------------------ database
function sqliteDb(dir) {
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'spesa.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // Migrazione per database creati prima dell'ordinamento manuale.
  if (!db.prepare("SELECT 1 FROM pragma_table_info('items') WHERE name = 'position'").get()) {
    db.exec('ALTER TABLE items ADD COLUMN position REAL NOT NULL DEFAULT 0');
  }
  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = db.prepare(sql); cache.set(sql, s); }
    return s;
  };
  return {
    kind: 'sqlite',
    async get(sql, p = []) { return stmt(sql).get(...p); },
    async all(sql, p = []) { return stmt(sql).all(...p); },
    async run(sql, p = []) { stmt(sql).run(...p); },
    close() { db.close(); },
  };
}

// Su Supabase lo schema public è esposto anche via API REST con la chiave anon (pubblica):
// attiviamo la RLS senza policy così è accessibile solo dal nostro server (proprietario delle tabelle).
const RLS = ['households', 'lists', 'items', 'recipes', 'history']
  .map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join('\n');

function postgresDb(rawUrl) {
  const postgres = require('postgres');
  // Gli URL delle integrazioni (es. "?sslmode=require&supa=base-pooler.x") hanno parametri che il
  // driver inoltrerebbe al server come impostazioni sconosciute: li togliamo e gestiamo l'SSL qui.
  const u = new URL(rawUrl);
  const sslmode = u.searchParams.get('sslmode');
  u.search = '';
  const url = u.toString();
  const local = /^(localhost|127\.0\.0\.1|::1|\[::1\])$/.test(u.hostname);
  const sql = postgres(url, {
    // Con il pooler di Supabase/Neon (modalità transaction) i prepared statement vanno disattivati.
    prepare: false,
    max: Number(process.env.PG_POOL_MAX) || 3,
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: sslmode === 'disable' || (local && !sslmode) ? false : 'require',
    types: { bigint: { to: 20, from: [20], parse: (x) => Number(x), serialize: (x) => String(x) } },
    onnotice: () => {},
  });
  const toPg = (q) => { let i = 0; return q.replace(/\?/g, () => '$' + ++i); };
  let ready = null;
  const init = () => (ready ||= sql.unsafe(SCHEMA + RLS).catch((e) => { ready = null; throw e; }));
  const exec = async (q, p) => { await init(); return sql.unsafe(toPg(q), p); };
  return {
    kind: 'postgres',
    async get(q, p = []) { return (await exec(q, p))[0]; },
    async all(q, p = []) { return [...(await exec(q, p))]; },
    async run(q, p = []) { await exec(q, p); },
    close() { return sql.end({ timeout: 2 }); },
  };
}

function databaseUrl() {
  // Nomi impostati dalle integrazioni Vercel (Supabase, Neon) o manualmente.
  return env('DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING');
}

function createDb({ dataDir } = {}) {
  const url = databaseUrl();
  if (url) return postgresDb(url);
  return sqliteDb(dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
}

// ------------------------------------------------------------------ tempo reale
// Supabase Realtime (Broadcast): il server pubblica via REST, i client ascoltano
// il canale "hh-<id famiglia>". Serve quando il server è serverless (Vercel).
function supabaseRealtime() {
  const url = env('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
  const anonKey = env('SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  if (!url || !serviceKey || !anonKey) return null;
  return {
    config: { type: 'supabase', url, key: anonKey },
    async broadcast(hid, events) {
      const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ messages: [{ topic: 'hh-' + hid, event: 'ev', payload: { events }, private: false }] }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`Supabase broadcast ${res.status}: ${await res.text()}`);
    },
  };
}

// SSE in memoria: va bene per un singolo processo Node sempre acceso.
function sseRealtime() {
  const clients = new Map(); // household_id -> Set<res>
  setInterval(() => {
    for (const set of clients.values()) for (const res of set) res.write(': ping\n\n');
  }, 25000).unref();
  return {
    config: { type: 'sse' },
    async broadcast(hid, events) {
      const set = clients.get(hid);
      if (!set) return;
      const payload = `data: ${JSON.stringify(events)}\n\n`;
      for (const res of set) res.write(payload);
    },
    open(req, res, hid) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 3000\n\n');
      res.write(`event: hello\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`);
      if (!clients.has(hid)) clients.set(hid, new Set());
      clients.get(hid).add(res);
      req.on('close', () => {
        const set = clients.get(hid);
        if (set) { set.delete(res); if (!set.size) clients.delete(hid); }
      });
    },
    closeAll() { for (const set of clients.values()) for (const r of set) r.end(); },
  };
}

function createRealtime({ allowSse }) {
  const sb = supabaseRealtime();
  if (sb) return sb;
  if (allowSse) return sseRealtime();
  // Serverless senza Supabase: nessun push, i client si aggiornano a intervalli.
  return { config: { type: 'poll' }, async broadcast() {} };
}

module.exports = { createDb, createRealtime };
