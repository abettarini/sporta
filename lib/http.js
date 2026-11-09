'use strict';
// Adatta una richiesta HTTP Node (server locale o funzione Vercel) al core.

const { HttpError } = require('./core');

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function readBody(req) {
  // Su Vercel il corpo può essere già stato letto e messo in req.body.
  if (req.body !== undefined && req.body !== null && typeof req.body !== 'function') {
    if (typeof req.body === 'string') {
      try { return Promise.resolve(req.body ? JSON.parse(req.body) : {}); }
      catch { return Promise.reject(new HttpError(400, 'JSON non valido')); }
    }
    if (Buffer.isBuffer(req.body)) {
      try { return Promise.resolve(req.body.length ? JSON.parse(req.body.toString('utf8')) : {}); }
      catch { return Promise.reject(new HttpError(400, 'JSON non valido')); }
    }
    return Promise.resolve(req.body);
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 6e6) { reject(new HttpError(413, 'Richiesta troppo grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'JSON non valido')); }
    });
    req.on('error', reject);
  });
}

// `parts`: segmenti del percorso dopo /api. `onStream(req, res, hh)` gestisce l'SSE se disponibile.
async function handleApi(core, req, res, parts, url, onStream) {
  try {
    const h = req.headers.authorization || '';
    const code = h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('k') || '';
    // Per le GET i parametri della query fanno da corpo (es. /api/preview?code=…).
    const query = Object.fromEntries(url.searchParams);
    delete query.__path;
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? { ...query, ...await readBody(req) } : query;
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
    const proto = String(req.headers['x-forwarded-proto'] || (/^(localhost|127\.)/.test(host) ? 'http' : 'https')).split(',')[0].trim();
    const r = await core.handle({ method: req.method, parts, body, code, ip, ua: String(req.headers['user-agent'] || '').slice(0, 300), base: `${proto}://${host}` });
    // Pagine web (HTML, XML, testo): indicizzabili, con una breve cache.
    if (r.text !== undefined) {
      res.writeHead(r.status, {
        'Content-Type': r.type, 'Cache-Control': r.status === 200 ? 'public, max-age=300, s-maxage=600' : 'no-store',
        'X-Robots-Tag': r.robots || 'index, follow', 'X-Content-Type-Options': 'nosniff', ...(r.headers || {}),
      });
      return res.end(req.method === 'HEAD' ? '' : r.text);
    }
    if (r.stream) {
      if (!onStream) throw new HttpError(404, 'Tempo reale non disponibile su questo server');
      return onStream(req, res, r.stream);
    }
    if (r.raw) {
      res.writeHead(r.status, { ...r.headers, 'Content-Length': r.raw.length });
      return res.end(r.raw);
    }
    send(res, r.status, r.body);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Errore interno' : e.message, code: e.code });
    else res.end();
  }
}

module.exports = { handleApi, send };
