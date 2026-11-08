'use strict';
// Crea le tabelle nel database indicato da DATABASE_URL (o POSTGRES_URL).
// Non è obbligatorio: l'app lo fa da sola alla prima richiesta.
//   DATABASE_URL="postgres://..." npm run db:init
const { createDb } = require('../lib/backends');

(async () => {
  const db = createDb();
  if (db.kind !== 'postgres') {
    console.error('Imposta DATABASE_URL (o POSTGRES_URL) con la stringa di connessione Postgres.');
    process.exit(1);
  }
  await db.init();
  const rows = await db.all(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN ('households','lists','items','recipes','history') ORDER BY 1");
  console.log('Database pronto. Tabelle:', rows.map((r) => r.table_name).join(', '));
  await db.close();
})().catch((e) => { console.error('Errore:', e.message); process.exit(1); });
