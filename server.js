'use strict';
// Server locale / self-hosted: file statici + API + tempo reale.
// Database: SQLite in ./data (default) oppure Postgres se è impostata DATABASE_URL.
// Tempo reale: SSE; con Postgres passa da LISTEN/NOTIFY (funziona anche con più istanze).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createCore } = require('./lib/core');
const { createDb, createRealtime } = require('./lib/backends');
const { handleApi } = require('./lib/http');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Notifiche push: sul server locale, senza chiavi VAPID nell'ambiente, ne creiamo un paio
// e le conserviamo nella cartella dei dati (su Vercel vanno impostate: npm run vapid).
if (!process.env.VAPID_PUBLIC_KEY) {
  try {
    const dir = process.env.DATA_DIR || path.join(__dirname, 'data');
    const file = path.join(dir, 'vapid.json');
    let keys;
    try { keys = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {
      keys = require('web-push').generateVAPIDKeys();
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
    }
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  } catch (e) { console.error('Chiavi per le notifiche push non disponibili:', e.message); }
}

const db = createDb();
const realtime = createRealtime(db);
const core = createCore({ db, realtime });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, url) {
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
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
      'X-Robots-Tag': 'noindex, nofollow',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // Pagine web pubbliche: /ricetta/<slug>, /ricettario/<slug>, /sitemap.xml, /robots.txt.
  const page = url.pathname.match(/^\/(ricetta|ricettario)\/([^/]+)\/?$/) || url.pathname.match(/^\/(sitemap\.xml|robots\.txt)$/);
  if (page) return handleApi(core, req, res, ['pages', ...page.slice(1).filter(Boolean)], url);
  if (url.pathname.startsWith('/api/')) {
    const parts = url.pathname.split('/').filter(Boolean).slice(1);
    return handleApi(core, req, res, parts, url, (rq, rs, ctx) => realtime.open(rq, rs, ctx.hh.id, 0, core.streamHooks(ctx)));
  }
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, url);
  res.writeHead(405); res.end();
});

server.listen(PORT, () => {
  console.log(`Sporta in ascolto su http://localhost:${PORT} (database: ${db.kind})`);
});

// Promemoria delle scadenze: ogni ora (su Vercel ci pensa il cron, vedi vercel.json).
const reminders = () => core.runReminders().catch((e) => console.error('promemoria non inviati', e));
setTimeout(reminders, 15e3).unref();
setInterval(reminders, 60 * 60e3).unref();

function shutdown() {
  server.close(async () => { await db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
