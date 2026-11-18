'use strict';
/* Carte fedeltà. Di default sono del gruppo: le vedono e le usano tutti i membri, così basta
   un telefono per la carta di famiglia. Una carta "solo mia" è legata all'account di chi l'ha
   aggiunta e compare in tutti i suoi gruppi, solo a lui (non passa per il canale del gruppo).
   Si salvano solo i dati per ridisegnare il codice in cassa: niente foto. */

const { HttpError, str, now, num, ID_RE } = require('./util');

const CARD_SCHEMA = `
  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY, household_id TEXT REFERENCES households(id) ON DELETE CASCADE,
    owner TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, chain TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '',
    format TEXT NOT NULL, code TEXT NOT NULL, holder TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '', created_by_id TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
    used_at BIGINT, used_by TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS cards_household ON cards(household_id);
  CREATE INDEX IF NOT EXISTS cards_owner ON cards(owner);
`;

// Formati che l'app sa ridisegnare (gli altri si mostrano come numero e Code 128).
const FORMATS = ['ean13', 'ean8', 'upca', 'code128', 'code39', 'itf', 'codabar', 'qr', 'other'];

const cardOut = (r) => r && {
  id: r.id, name: r.name, chain: r.chain || '', color: r.color || '', format: r.format, code: r.code,
  holder: r.holder || '', note: r.note || '', mine: !!r.owner, created_by: r.created_by || '',
  created_at: num(r.created_at), updated_at: num(r.updated_at), used_at: num(r.used_at), used_by: r.used_by || '',
};

function createCards({ db, realtime }) {
  const accountOf = (ctx) => (ctx.me && ctx.me.account_id) || '';

  // Carte del gruppo più quelle personali dell'account.
  async function list(ctx) {
    const acc = accountOf(ctx);
    const rows = acc
      ? await db.all(`SELECT * FROM cards WHERE (household_id = ? AND owner = '') OR owner = ? ORDER BY lower(name)`, [ctx.hh.id, acc])
      : await db.all(`SELECT * FROM cards WHERE household_id = ? AND owner = '' ORDER BY lower(name)`, [ctx.hh.id]);
    return rows.map(cardOut);
  }

  async function own(ctx, id) {
    const r = await db.get('SELECT * FROM cards WHERE id = ?', [id]);
    if (!r) return null;
    if (r.owner ? r.owner !== accountOf(ctx) : r.household_id !== ctx.hh.id) throw new HttpError(404, 'Carta non trovata');
    return r;
  }

  function clean(b, ex) {
    const pick = (k, fn) => (b[k] !== undefined ? fn(b[k]) : ex ? ex[k] : fn(undefined));
    const name = pick('name', (v) => str(v, 60));
    if (!name) throw new HttpError(400, 'Il nome del negozio è obbligatorio');
    const format = pick('format', (v) => (FORMATS.includes(v) ? v : 'code128'));
    const code = pick('code', (v) => String(v ?? '').replace(/[\r\n\t]/g, '').trim().slice(0, 500));
    if (!code) throw new HttpError(400, 'Manca il codice della carta');
    if (['ean13', 'ean8', 'upca', 'itf'].includes(format) && !/^\d+$/.test(code)) throw new HttpError(400, 'Questo formato ha solo cifre');
    if (format !== 'qr' && code.length > 80) throw new HttpError(400, 'Codice troppo lungo');
    return {
      name, format, code,
      chain: pick('chain', (v) => str(v, 40)),
      color: pick('color', (v) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : '')),
      holder: pick('holder', (v) => str(v, 60)),
      note: pick('note', (v) => str(v, 300)),
    };
  }

  // Ritorna { events (tutti, per chi ha fatto la modifica), shared (da mandare al gruppo) }.
  async function route(ctx, m, parts, b, who) {
    const [, id, action] = parts;
    if (!id || !ID_RE.test(id)) throw new HttpError(400, 'Identificativo non valido');
    const t = now();
    const ex = await own(ctx, id);
    const done = async (cid) => {
      const r = await db.get('SELECT * FROM cards WHERE id = ?', [cid]);
      const e = [{ t: 'card', op: 'put', data: cardOut(r) }];
      return { events: e, shared: r.owner ? [] : e };
    };
    if (m === 'PUT' && !action) {
      const c = clean(b, ex);
      // condivisa con il gruppo (default) o solo mia
      const mine = b.mine !== undefined ? !!b.mine : ex ? !!ex.owner : false;
      const acc = accountOf(ctx);
      if (mine && !acc) throw new HttpError(400, 'Per una carta personale serve un account');
      const owner = mine ? acc : '', hid = mine ? null : ctx.hh.id;
      if (ex) {
        // passata da condivisa a personale (o viceversa): il gruppo la vede sparire (o comparire)
        const wasShared = !ex.owner;
        await db.run(`UPDATE cards SET name = ?, chain = ?, color = ?, format = ?, code = ?, holder = ?, note = ?, owner = ?, household_id = ?, updated_at = ? WHERE id = ?`,
          [c.name, c.chain, c.color, c.format, c.code, c.holder, c.note, owner, hid, t, id]);
        const out = await done(id);
        if (wasShared && mine) out.shared = [{ t: 'card', op: 'del', id }];
        return out;
      }
      await db.run(`INSERT INTO cards (id, household_id, owner, name, chain, color, format, code, holder, note, created_by, created_by_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, hid, owner, c.name, c.chain, c.color, c.format, c.code, c.holder, c.note, who.name, who.id, t, t]);
      return done(id);
    }
    if (m === 'POST' && action === 'used') {
      if (!ex) throw new HttpError(404, 'Carta non trovata');
      await db.run('UPDATE cards SET used_at = ?, used_by = ? WHERE id = ?', [t, who.name, id]);
      return done(id);
    }
    if (m === 'DELETE' && !action) {
      if (ex) await db.run('DELETE FROM cards WHERE id = ?', [id]);
      const e = [{ t: 'card', op: 'del', id }];
      return { events: e, shared: ex && !ex.owner ? e : [] };
    }
    throw new HttpError(404, 'Non trovato');
  }

  async function handle(ctx, m, parts, b, who) {
    const r = await route(ctx, m, parts, b, who);
    if (r.shared.length) {
      try { await realtime.broadcast(ctx.hh.id, r.shared); } catch (e) { console.error('broadcast fallito', e); }
    }
    return { status: 200, body: { events: r.events } };
  }

  return { list, handle };
}

module.exports = { createCards, CARD_SCHEMA, FORMATS, cardOut };
