'use strict';
// Funzione serverless per Vercel: tutte le richieste /api/* arrivano qui (vedi vercel.json).
// Richiede Postgres (DATABASE_URL o POSTGRES_URL) e, per il tempo reale, Supabase.

const { createCore } = require('../lib/core');
const { createDb, createRealtime } = require('../lib/backends');
const { handleApi, send } = require('../lib/http');

let core = null;
function getCore() {
  if (core) return core;
  const db = createDb();
  if (db.kind !== 'postgres') {
    throw new Error('Su Vercel serve un database Postgres: imposta DATABASE_URL o POSTGRES_URL.');
  }
  const realtime = createRealtime({ allowSse: false });
  core = createCore({ db, realtime, realtimeConfig: realtime.config });
  return core;
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // vercel.json riscrive /api/<percorso> in /api?__path=<percorso>.
  const raw = url.searchParams.get('__path') ?? url.pathname.replace(/^\/api\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  let c;
  try { c = getCore(); } catch (e) {
    console.error(e);
    return send(res, 500, { error: e.message });
  }
  return handleApi(c, req, res, parts, url, null);
};
