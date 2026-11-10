'use strict';
/* Foto delle ricette. Con BLOB_READ_WRITE_TOKEN (Vercel Blob, store pubblico) il file va sul
   Blob store e nel database resta solo una riga con l'indirizzo; senza, il file sta nel
   database come prima. L'app usa sempre /api/photos/<id>: per le foto sul Blob store il server
   risponde con un reindirizzamento. Il percorso nel Blob store contiene l'identificativo
   casuale della foto, come l'indirizzo di oggi: chi non lo conosce non la trova. */

const { now } = require('./util');

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const YEAR = 365 * 24 * 3600;
const token = () => process.env.BLOB_READ_WRITE_TOKEN || '';
const blobOn = () => !!token();
const blob = () => require('@vercel/blob');
const pathOf = (hid, id, mime) => `photos/${hid}/${id}.${EXT[mime] || 'img'}`;
const putOptions = (mime) => ({ access: 'public', contentType: mime, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: YEAR, token: token() });

// Cancella dal Blob store i file indicati (in gruppi da 100). Gli errori non bloccano chi chiama:
// al peggio resta un file orfano, mai una foto che sparisce mentre serve.
async function deleteBlobs(urls) {
  urls = [...new Set(urls.filter(Boolean))];
  if (!urls.length) return;
  if (!blobOn()) { console.error(`Foto sul Blob store non cancellate (${urls.length}): manca BLOB_READ_WRITE_TOKEN`); return; }
  for (let i = 0; i < urls.length; i += 100) {
    try { await blob().del(urls.slice(i, i + 100), { token: token() }); } catch (e) { console.error('Cancellazione dal Blob store non riuscita:', e.message); }
  }
}
// File sul Blob store delle foto che la query seleziona (da chiamare PRIMA di cancellarle dal database).
async function blobUrlsWhere(db, where, params) {
  return (await db.all(`SELECT url FROM photos WHERE (${where}) AND url <> ''`, params)).map((r) => r.url);
}

function createPhotos({ db }) {
  async function save({ id, hid, recipeId = null, mime, data }) {
    if (blobOn()) {
      const r = await blob().put(pathOf(hid, id, mime), data, putOptions(mime));
      await db.run('INSERT INTO photos (id, household_id, recipe_id, mime, data, created_at, url, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, hid, recipeId, mime, Buffer.alloc(0), now(), r.url, data.length]);
    } else {
      await db.run('INSERT INTO photos (id, household_id, recipe_id, mime, data, created_at, url, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, hid, recipeId, mime, data, now(), '', data.length]);
    }
  }
  const get = (id) => db.get('SELECT mime, data, url FROM photos WHERE id = ?', [id]);

  // Copia di una foto in un altro gruppo (ricette copiate): un file nuovo, così le cancellazioni restano indipendenti.
  async function copy(srcId, { id, hid, recipeId }) {
    const src = await db.get('SELECT * FROM photos WHERE id = ?', [srcId]);
    if (!src) return false;
    if (src.url && blobOn()) {
      const r = await blob().copy(src.url, pathOf(hid, id, src.mime), putOptions(src.mime));
      await db.run('INSERT INTO photos (id, household_id, recipe_id, mime, data, created_at, url, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, hid, recipeId, src.mime, Buffer.alloc(0), now(), r.url, Number(src.size) || 0]);
      return true;
    }
    let data = src.data ? Buffer.from(src.data) : null;
    if (src.url && (!data || !data.length)) data = Buffer.from(await (await fetch(src.url)).arrayBuffer());
    await save({ id, hid, recipeId, mime: src.mime, data });
    return true;
  }

  async function remove(ids) {
    ids = [...new Set(ids.filter(Boolean))];
    if (!ids.length) return;
    const urls = [];
    for (const id of ids) {
      const r = await db.get('SELECT url FROM photos WHERE id = ?', [id]);
      if (r && r.url) urls.push(r.url);
      await db.run('DELETE FROM photos WHERE id = ?', [id]);
    }
    await deleteBlobs(urls);
  }

  // Prima di cancellare un gruppo (le righe se ne vanno a cascata): i file sul Blob store.
  async function dropHousehold(hid) { await deleteBlobs(await blobUrlsWhere(db, 'household_id = ?', [hid])); }

  return { save, get, copy, remove, dropHousehold, blobOn };
}

module.exports = { createPhotos, deleteBlobs, blobUrlsWhere, blobOn, pathOf, putOptions };
