'use strict';
// Adattatori: database (SQLite locale o Postgres) e canale tempo reale.
// - SQLite: notifiche in memoria (un solo processo Node sempre acceso).
// - Postgres: LISTEN/NOTIFY, funziona anche con più istanze e su Vercel.

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

// Gli URL delle integrazioni (es. "?sslmode=require&channel_binding=...") hanno parametri che il
// driver inoltrerebbe al server come impostazioni sconosciute: li togliamo e gestiamo l'SSL qui.
function pgConnect(rawUrl, opts) {
  const postgres = require('postgres');
  const u = new URL(rawUrl);
  const sslmode = u.searchParams.get('sslmode');
  u.search = '';
  const local = /^(localhost|127\.0\.0\.1|::1|\[::1\])$/.test(u.hostname);
  return postgres(u.toString(), {
    // Con i pooler (PgBouncer in modalità transaction) i prepared statement vanno disattivati.
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: sslmode === 'disable' || (local && !sslmode) ? false : 'require',
    types: { bigint: { to: 20, from: [20], parse: (x) => Number(x), serialize: (x) => String(x) } },
    onnotice: () => {},
    ...opts,
  });
}

function postgresDb(url, listenUrl) {
  const sql = pgConnect(url, { max: Number(process.env.PG_POOL_MAX) || 3 });
  const toPg = (q) => { let i = 0; return q.replace(/\?/g, () => '$' + ++i); };
  // Creazione delle tabelle (idempotente). Il lock evita conflitti quando più istanze
  // partono insieme su un database vuoto; funziona anche attraverso il pooler.
  let ready = null;
  const init = () => (ready ||= sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(727274)`;
    await tx.unsafe(SCHEMA);
  }).catch((e) => { ready = null; throw e; }));
  const exec = async (q, p) => { await init(); return sql.unsafe(toPg(q), p); };
  // LISTEN non funziona attraverso un pooler in modalità transaction: serve la connessione diretta.
  let listener = null;
  return {
    kind: 'postgres',
    init,
    async get(q, p = []) { return (await exec(q, p))[0]; },
    async all(q, p = []) { return [...(await exec(q, p))]; },
    async run(q, p = []) { await exec(q, p); },
    async notify(channel, payload) { await sql`SELECT pg_notify(${channel}, ${payload})`; },
    async listen(channel, fn) {
      listener ||= pgConnect(listenUrl || url, { max: 1, idle_timeout: 0 });
      return listener.listen(channel, fn); // -> { unlisten }
    },
    async close() {
      await sql.end({ timeout: 2 });
      if (listener) await listener.end({ timeout: 2 });
    },
  };
}

function createDb({ dataDir } = {}) {
  // Nomi impostati dalle integrazioni Vercel (Neon, Vercel Postgres…) o manualmente.
  const url = env('DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL');
  const direct = env('DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING', 'DIRECT_URL');
  if (url || direct) return postgresDb(url || direct, direct || url);
  return sqliteDb(dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
}

// ------------------------------------------------------------------ tempo reale (SSE)
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-store, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

// Apre uno stream SSE; `subscribe(send)` registra il client e ritorna una funzione di pulizia.
// `maxMs`: durata massima (le funzioni serverless hanno un limite): il browser si riconnette da solo.
function openStream(req, res, subscribe, maxMs) {
  return new Promise((resolve) => {
    let closed = false, cleanup = null, ping = null, timer = null;
    const end = () => {
      if (closed) return;
      closed = true;
      clearInterval(ping);
      clearTimeout(timer);
      Promise.resolve(cleanup && cleanup()).catch(() => {});
      try { res.end(); } catch { /* già chiusa */ }
      resolve();
    };
    req.on('close', end);
    res.writeHead(200, SSE_HEADERS);
    res.write('retry: 2000\n\n');
    Promise.resolve(subscribe((data) => { if (!closed) res.write(`data: ${data}\n\n`); }))
      .then((c) => {
        cleanup = c;
        if (closed) return Promise.resolve(c && c()).catch(() => {});
        // "hello" solo dopo l'iscrizione: il client ricarica lo stato e non perde eventi.
        res.write(`event: hello\ndata: ${Date.now()}\n\n`);
        ping = setInterval(() => res.write(': ping\n\n'), 20000);
        if (maxMs) timer = setTimeout(end, maxMs);
      })
      .catch((e) => { console.error('SSE: iscrizione fallita', e); end(); });
  });
}

// Payload NOTIFY limitato a ~8 KB: oltre, chiediamo ai client di ricaricare lo stato.
function encodeEvents(events) {
  const s = JSON.stringify(events);
  return Buffer.byteLength(s) > 7800 ? JSON.stringify({ reload: true }) : s;
}

function memoryRealtime() {
  const clients = new Map(); // household_id -> Set<send>
  return {
    async broadcast(hid, events) {
      const set = clients.get(hid);
      if (set) { const data = JSON.stringify(events); for (const send of set) send(data); }
    },
    open(req, res, hid, maxMs) {
      return openStream(req, res, (send) => {
        if (!clients.has(hid)) clients.set(hid, new Set());
        clients.get(hid).add(send);
        return () => {
          const set = clients.get(hid);
          if (set) { set.delete(send); if (!set.size) clients.delete(hid); }
        };
      }, maxMs);
    },
  };
}

function postgresRealtime(db) {
  const channel = (hid) => 'sporta_' + String(hid).replace(/[^a-zA-Z0-9]/g, '');
  return {
    async broadcast(hid, events) { await db.notify(channel(hid), encodeEvents(events)); },
    open(req, res, hid, maxMs) {
      return openStream(req, res, async (send) => {
        const l = await db.listen(channel(hid), send);
        return () => l.unlisten();
      }, maxMs);
    },
  };
}

function createRealtime(db) {
  return db.kind === 'postgres' ? postgresRealtime(db) : memoryRealtime();
}

module.exports = { createDb, createRealtime };
