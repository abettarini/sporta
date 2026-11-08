'use strict';
// Funzione serverless per Vercel: tutte le richieste /api/* arrivano qui (vedi vercel.json).
// Richiede Postgres (DATABASE_URL o POSTGRES_URL). Il tempo reale usa SSE + LISTEN/NOTIFY.

const { createCore } = require('../lib/core');
const { createDb, createRealtime } = require('../lib/backends');
const { handleApi, send } = require('../lib/http');

// Durata massima di uno stream SSE: deve restare sotto il maxDuration di vercel.json.
// Allo scadere il browser si riconnette da solo e ricarica lo stato.
const SSE_MAX_MS = (Number(process.env.SSE_MAX_SECONDS) || 240) * 1000;

let ctx = null;
function getCtx() {
  if (ctx) return ctx;
  const db = createDb();
  if (db.kind !== 'postgres') {
    throw new Error('Su Vercel serve un database Postgres: imposta DATABASE_URL o POSTGRES_URL.');
  }
  const realtime = createRealtime(db);
  ctx = { realtime, core: createCore({ db, realtime }) };
  return ctx;
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // vercel.json riscrive /api/<percorso> in /api?__path=<percorso>.
  const raw = url.searchParams.get('__path') ?? url.pathname.replace(/^\/api\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  let c;
  try { c = getCtx(); } catch (e) {
    console.error(e);
    return send(res, 500, { error: e.message });
  }
  return handleApi(c.core, req, res, parts, url, (rq, rs, hh) => c.realtime.open(rq, rs, hh.id, SSE_MAX_MS));
};
