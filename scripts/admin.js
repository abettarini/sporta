#!/usr/bin/env node
'use strict';
/* Amministrazione da riga di comando, direttamente sul database di Sporta
   (DATABASE_URL / POSTGRES_URL per Postgres, altrimenti SQLite in DATA_DIR).

   node scripts/admin.js gruppi [testo]                    elenco dei gruppi (filtro sul nome)
   node scripts/admin.js ricette <gruppo>                  ricette di un gruppo
   node scripts/admin.js cancella-ricette <gruppo> [--pubbliche] [--si]
                                                           cancella le ricette del gruppo (con foto,
                                                           preferite e voci del menu "La faccio")
   node scripts/admin.js rendi-private <gruppo|--tutti> [--si]
                                                           toglie la pubblicazione alle ricette
   node scripts/admin.js foto                              quante foto e quanto spazio (database / Blob store)
   node scripts/admin.js foto-su-blob [--si]               sposta sul Blob store di Vercel le foto ancora nel
                                                           database (serve BLOB_READ_WRITE_TOKEN)

   <gruppo>: identificativo (anche solo le prime 8 cifre), codice d'invito o nome esatto.
   Senza --si i comandi che cambiano i dati mostrano solo cosa farebbero.
   Su Postgres le app aperte ricaricano i dati da sole; su SQLite al prossimo accesso. */

// Il database prepara da solo schema e migrazioni alla prima query.
const { createDb, createRealtime } = require('../lib/backends');
const { createPhotos, blobOn, pathOf, putOptions } = require('../lib/photos');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [cmd, ...rest] = args.filter((a) => !a.startsWith('--'));
const yes = flags.has('--si') || flags.has('--yes');

const pad = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n); };
const date = (t) => (t ? new Date(Number(t)).toISOString().slice(0, 10) : '');
const parseJson = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

async function findGroup(db, key) {
  if (!key) throw new Error('Indica il gruppo (identificativo, codice o nome): vedi "gruppi"');
  const k = String(key).trim();
  let rows = await db.all('SELECT * FROM households WHERE id = ? OR code = ? OR upper(code) = upper(?)', [k, k, k]);
  if (!rows.length && /^[0-9a-f-]{6,}$/i.test(k)) rows = await db.all('SELECT * FROM households WHERE id LIKE ?', [k.toLowerCase() + '%']);
  if (!rows.length) rows = await db.all('SELECT * FROM households WHERE lower(name) = lower(?)', [k]);
  if (!rows.length) throw new Error(`Nessun gruppo trovato per "${k}"`);
  if (rows.length > 1) {
    console.log(`Più gruppi corrispondono a "${k}": usa l'identificativo.`);
    for (const h of rows) console.log(`  ${h.id}  ${h.name}`);
    throw new Error('Gruppo ambiguo');
  }
  return rows[0];
}
const kindOf = (h) => (h.personal_of ? 'personale' : h.kind === 'cookbook' ? 'ricettario' : 'gruppo') + (Number(h.system || 0) ? ' (sistema)' : '');

async function groups(db, filter) {
  const rows = await db.all(`SELECT h.*,
      (SELECT COUNT(*) FROM members m WHERE m.household_id = h.id AND m.status = 'active') AS n_members,
      (SELECT COUNT(*) FROM recipes r WHERE r.household_id = h.id) AS n_recipes,
      (SELECT COUNT(*) FROM recipes r WHERE r.household_id = h.id AND r.visibility = 'public') AS n_public
    FROM households h ORDER BY h.created_at`, []);
  const f = String(filter || '').toLowerCase();
  const shown = rows.filter((h) => !f || String(h.name).toLowerCase().includes(f));
  console.log(`${pad('ID', 10)}${pad('CODICE', 16)}${pad('NOME', 32)}${pad('TIPO', 22)}${pad('MEMBRI', 8)}${pad('RICETTE', 9)}PUBBLICHE  CREATO`);
  for (const h of shown) {
    console.log(`${pad(h.id.slice(0, 8), 10)}${pad(h.code, 16)}${pad(h.name, 32)}${pad(kindOf(h), 22)}${pad(h.n_members, 8)}${pad(h.n_recipes, 9)}${pad(h.n_public, 11)}${date(h.created_at)}`);
  }
  console.log(`\n${shown.length} ${shown.length === 1 ? 'gruppo' : 'gruppi'}${f ? ` (su ${rows.length})` : ''}.`);
}

async function recipes(db, key) {
  const h = await findGroup(db, key);
  const rows = await db.all('SELECT id, name, visibility, photos, created_at FROM recipes WHERE household_id = ? ORDER BY lower(name)', [h.id]);
  console.log(`${h.name} (${kindOf(h)}, ${h.id}): ${rows.length} ricette\n`);
  for (const r of rows) console.log(`${pad(r.id.slice(0, 8), 10)}${pad(r.name, 48)}${pad(r.visibility === 'public' ? 'pubblica' : 'privata', 10)}${pad(parseJson(r.photos, []).length + ' foto', 8)}${date(r.created_at)}`);
}

async function reload(db, hid) {
  if (db.kind !== 'postgres') return;
  try { await createRealtime(db).broadcast(hid, [{ t: 'reload' }]); } catch { /* le app ricaricano comunque al prossimo accesso */ }
}

async function deleteRecipes(db, key, onlyPublic) {
  const h = await findGroup(db, key);
  const rows = await db.all(`SELECT id, name, photos FROM recipes WHERE household_id = ?${onlyPublic ? " AND visibility = 'public'" : ''}`, [h.id]);
  console.log(`${h.name} (${kindOf(h)}): ${rows.length} ${onlyPublic ? 'ricette pubbliche' : 'ricette'} da cancellare.`);
  if (!rows.length) return;
  for (const r of rows.slice(0, 10)) console.log('  - ' + r.name);
  if (rows.length > 10) console.log(`  … e altre ${rows.length - 10}`);
  if (!yes) { console.log('\nNon ho cancellato nulla: aggiungi --si per procedere.'); return; }
  let n = 0;
  const photos = createPhotos({ db });
  for (const r of rows) {
    const ids = (await db.all('SELECT id FROM photos WHERE recipe_id = ?', [r.id])).map((x) => x.id);
    await photos.remove([...ids, ...parseJson(r.photos, [])]); // anche i file sul Blob store
    await db.run('DELETE FROM recipe_bookmarks WHERE recipe_id = ?', [r.id]);
    await db.run('DELETE FROM menu_entries WHERE recipe_id = ?', [r.id]);
    await db.run('DELETE FROM recipes WHERE id = ?', [r.id]);
    if (++n % 50 === 0) console.log(`  ${n}/${rows.length}…`);
  }
  await reload(db, h.id);
  console.log(`Cancellate ${n} ricette da "${h.name}".`);
}

async function unpublish(db, key, all) {
  const h = all ? null : await findGroup(db, key);
  const where = all ? "visibility = 'public'" : "household_id = ? AND visibility = 'public'";
  const params = all ? [] : [h.id];
  const n = Number((await db.get(`SELECT COUNT(*) AS n FROM recipes WHERE ${where}`, params)).n);
  console.log(`${all ? 'Tutti i gruppi' : `${h.name} (${kindOf(h)})`}: ${n} ricette pubbliche da rendere private.`);
  if (!n) return;
  if (!yes) { console.log('\nNon ho cambiato nulla: aggiungi --si per procedere.'); return; }
  const hids = (await db.all(`SELECT DISTINCT household_id FROM recipes WHERE ${where}`, params)).map((x) => x.household_id);
  const ids = (await db.all(`SELECT id FROM recipes WHERE ${where}`, params)).map((x) => x.id);
  await db.run(`UPDATE recipes SET visibility = 'private' WHERE ${where}`, params);
  // Fuori dai menu "La faccio" degli altri gruppi; le preferite di altri diventano "non più disponibile".
  for (const id of ids) await db.run('DELETE FROM menu_entries WHERE recipe_id = ? AND household_id <> (SELECT household_id FROM recipes WHERE id = ?)', [id, id]);
  for (const hid of hids) await reload(db, hid);
  console.log(`Rese private ${n} ricette.`);
}

const mb = (n) => `${(Number(n || 0) / 1048576).toFixed(1)} MB`;
async function photoStats(db) {
  const tot = await db.get(`SELECT COUNT(*) AS n,
      SUM(CASE WHEN url <> '' THEN 1 ELSE 0 END) AS blob,
      SUM(CASE WHEN url = '' THEN COALESCE(size, length(data)) ELSE 0 END) AS db_bytes,
      SUM(CASE WHEN url <> '' THEN COALESCE(size, 0) ELSE 0 END) AS blob_bytes FROM photos`, []);
  console.log(`Foto: ${tot.n} · nel database ${Number(tot.n) - Number(tot.blob || 0)} (${mb(tot.db_bytes)}) · sul Blob store ${Number(tot.blob || 0)} (${mb(tot.blob_bytes)})`);
  console.log(`Blob store: ${blobOn() ? 'configurato (BLOB_READ_WRITE_TOKEN)' : 'non configurato'}\n`);
  const rows = await db.all(`SELECT h.name, h.id, COUNT(p.id) AS n, SUM(COALESCE(p.size, length(p.data))) AS bytes
    FROM photos p JOIN households h ON h.id = p.household_id GROUP BY h.id, h.name ORDER BY bytes DESC LIMIT 20`, []);
  for (const r of rows) console.log(`${pad(r.id.slice(0, 8), 10)}${pad(r.name, 32)}${pad(r.n + ' foto', 12)}${mb(r.bytes)}`);
}

async function photosToBlob(db) {
  if (!blobOn()) throw new Error('Manca BLOB_READ_WRITE_TOKEN (lo trovi su Vercel → Storage → il Blob store → .env.local)');
  const rows = await db.all(`SELECT id, household_id, mime, length(data) AS bytes FROM photos WHERE url = ''`, []);
  const bytes = rows.reduce((s, r) => s + Number(r.bytes || 0), 0);
  console.log(`${rows.length} foto nel database (${mb(bytes)}) da spostare sul Blob store.`);
  if (!rows.length) return;
  if (!yes) { console.log('\nNon ho spostato nulla: aggiungi --si per procedere.'); return; }
  const { put } = require('@vercel/blob');
  let n = 0, failed = 0;
  for (const r of rows) {
    try {
      const p = await db.get('SELECT data FROM photos WHERE id = ?', [r.id]);
      const data = Buffer.from(p.data);
      const res = await put(pathOf(r.household_id, r.id, r.mime), data, putOptions(r.mime));
      // Prima l'indirizzo, poi si libera lo spazio: se qualcosa si interrompe la foto resta leggibile.
      await db.run('UPDATE photos SET url = ?, size = ? WHERE id = ?', [res.url, data.length, r.id]);
      await db.run('UPDATE photos SET data = ? WHERE id = ?', [Buffer.alloc(0), r.id]);
      if (++n % 25 === 0) console.log(`  ${n}/${rows.length}…`);
    } catch (e) { failed++; console.log(`  foto ${r.id} non spostata: ${e.message}`); }
  }
  console.log(`Spostate ${n} foto${failed ? `, ${failed} non riuscite (rilancia il comando per riprovare)` : ''}.`);
  if (db.kind === 'postgres') console.log('Su Postgres lo spazio liberato torna disponibile dopo il VACUUM automatico.');
}

async function main() {
  const db = createDb();
  try {
    if (cmd === 'gruppi') await groups(db, rest[0]);
    else if (cmd === 'ricette') await recipes(db, rest[0]);
    else if (cmd === 'cancella-ricette') await deleteRecipes(db, rest[0], flags.has('--pubbliche'));
    else if (cmd === 'rendi-private') await unpublish(db, rest[0], flags.has('--tutti'));
    else if (cmd === 'foto') await photoStats(db);
    else if (cmd === 'foto-su-blob') await photosToBlob(db);
    else {
      console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^[\s\S]*?\/\*/, '').replace(/^ {3}/gm, ''));
      process.exitCode = cmd ? 1 : 0;
    }
  } finally { try { await db.close(); } catch { /* già chiuso */ } }
}

main().catch((e) => { console.error('Errore:', e.message); process.exit(1); });
