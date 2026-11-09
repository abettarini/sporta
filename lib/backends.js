'use strict';
// Adattatori: database (SQLite locale o Postgres) e canale tempo reale.
// - SQLite: notifiche in memoria (un solo processo Node sempre acceso).
// - Postgres: LISTEN/NOTIFY, funziona anche con più istanze e su Vercel.

const path = require('node:path');
const fs = require('node:fs');
const { SCHEMA, MIGRATIONS, postMigration } = require('./core');

const env = (...names) => names.map((n) => process.env[n]).find(Boolean) || '';

// Versione dello schema: cambia quando cambiano tabelle, colonne o indici (le date che
// postMigration inserisce non contano).
const SCHEMA_VERSION = require('node:crypto').createHash('sha256')
  .update(SCHEMA + JSON.stringify(MIGRATIONS) + postMigration().replace(/\d{13}/g, '')).digest('hex').slice(0, 16);

const QUERY_TIMEOUT_MS = Number(process.env.DB_TIMEOUT_MS) || 25000;
function withTimeout(promise) {
  let timer;
  const t = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('Il database non risponde: riprova tra poco'), { status: 503 })), QUERY_TIMEOUT_MS);
  });
  return Promise.race([promise, t]).finally(() => clearTimeout(timer));
}

// ------------------------------------------------------------------ database
function sqliteDb(dir) {
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'spesa.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // Colonne aggiunte nelle versioni successive (SQLite non ha ADD COLUMN IF NOT EXISTS).
  const hasCol = db.prepare('SELECT 1 FROM pragma_table_info(?) WHERE name = ?');
  for (const [table, col, def] of MIGRATIONS) {
    if (!hasCol.get(table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
  db.exec(postMigration());
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
  // Preparazione del database (tabelle e colonne nuove), una volta per versione dello schema.
  // Prima si legge la versione salvata: se è quella attuale non si tocca nulla (niente blocchi
  // sulle tabelle a ogni avvio di un'istanza). Altrimenti si aggiorna in una transazione con un
  // lock "consultivo" (più istanze insieme) e con tempi massimi: se un blocco non arriva entro
  // pochi secondi la transazione si annulla e si riprova alla richiesta successiva, invece di
  // restare appesa e bloccare tutte le altre richieste.
  let ready = null;
  const migrate = async () => {
    try {
      const row = (await sql`SELECT value FROM app_meta WHERE key = 'schema'`)[0];
      if (row && row.value === SCHEMA_VERSION) return;
    } catch { /* tabella app_meta non ancora creata */ }
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL lock_timeout = '8s'; SET LOCAL statement_timeout = '60s'`);
      await tx`SELECT pg_advisory_xact_lock(727274)`;
      await tx.unsafe('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
      const row = (await tx`SELECT value FROM app_meta WHERE key = 'schema'`)[0];
      if (row && row.value === SCHEMA_VERSION) return; // aggiornato da un'altra istanza nel frattempo
      await tx.unsafe(SCHEMA);
      for (const [table, col, def] of MIGRATIONS) {
        await tx.unsafe(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${def}`);
      }
      await tx.unsafe(postMigration());
      await tx`INSERT INTO app_meta (key, value) VALUES ('schema', ${SCHEMA_VERSION}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    });
  };
  const init = () => (ready ||= migrate().catch((e) => { ready = null; console.error('Preparazione del database non riuscita:', e.message); throw e; }));
  // Nessuna richiesta resta appesa: oltre QUERY_TIMEOUT_MS si risponde con un errore.
  const exec = (q, p) => withTimeout((async () => { await init(); return sql.unsafe(toPg(q), p); })());
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
// `hooks` (facoltativi): memberId per chiudere lo stream di chi viene rimosso, onOpen/onPing/onClose
// per la presenza (online, ultimo accesso).
function openStream(req, res, subscribe, maxMs, hooks = {}) {
  const safe = (fn) => { if (fn) Promise.resolve().then(fn).catch((e) => console.error('presenza', e)); };
  return new Promise((resolve) => {
    let closed = false, cleanup = null, ping = null, timer = null;
    const end = () => {
      if (closed) return;
      closed = true;
      clearInterval(ping);
      clearTimeout(timer);
      Promise.resolve(cleanup && cleanup()).catch(() => {});
      if (cleanup !== null) safe(hooks.onClose);
      try { res.end(); } catch { /* già chiusa */ }
      resolve();
    };
    req.on('close', end);
    res.writeHead(200, SSE_HEADERS);
    res.write('retry: 2000\n\n');
    const kicked = (data) => {
      if (!hooks.memberId || !data.includes('"kick"')) return false;
      try { return JSON.parse(data).some((e) => e && e.t === 'kick' && e.id === hooks.memberId); } catch { return false; }
    };
    Promise.resolve(subscribe((data) => {
      if (closed) return;
      if (kicked(data)) { res.write(`event: kicked\ndata: {}\n\n`); end(); return; }
      res.write(`data: ${data}\n\n`);
    }))
      .then((c) => {
        cleanup = c || (() => {});
        if (closed) return Promise.resolve(c && c()).catch(() => {});
        safe(hooks.onOpen);
        // "hello" solo dopo l'iscrizione: il client ricarica lo stato e non perde eventi.
        res.write(`event: hello\ndata: ${Date.now()}\n\n`);
        ping = setInterval(() => { res.write(': ping\n\n'); safe(hooks.onPing); }, 20000);
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
    open(req, res, hid, maxMs, hooks) {
      return openStream(req, res, (send) => {
        if (!clients.has(hid)) clients.set(hid, new Set());
        clients.get(hid).add(send);
        return () => {
          const set = clients.get(hid);
          if (set) { set.delete(send); if (!set.size) clients.delete(hid); }
        };
      }, maxMs, hooks);
    },
  };
}

function postgresRealtime(db) {
  const channel = (hid) => 'sporta_' + String(hid).replace(/[^a-zA-Z0-9]/g, '');
  return {
    async broadcast(hid, events) { await db.notify(channel(hid), encodeEvents(events)); },
    open(req, res, hid, maxMs, hooks) {
      return openStream(req, res, async (send) => {
        const l = await db.listen(channel(hid), send);
        return () => l.unlisten();
      }, maxMs, hooks);
    },
  };
}

function createRealtime(db) {
  return db.kind === 'postgres' ? postgresRealtime(db) : memoryRealtime();
}

module.exports = { createDb, createRealtime };
