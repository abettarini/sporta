// Database centrale degli alimenti: riconoscimento dei nomi, conversione in grammi, valori
// nutrizionali per porzione. Condiviso tra client (window.Foods) e server (require).
// I dati stanno in /foods.json (generato da scripts/foods/, fonti CIQUAL 2025 e USDA).
(function (root) {
  const NUT = ['kcal', 'prot', 'carb', 'sugar', 'fat', 'sat', 'fiber', 'salt'];

  // minuscole, niente accenti, apostrofi uniformi, punteggiatura e parentesi via
  function key(s) {
    let t = String(s || '').toLowerCase().replace(/[’`´]/g, "'").replace(/\([^)]*\)/g, ' ');
    t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
    t = t.replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
    return t;
  }

  // Misure scritte nel nome ("spicchio d'aglio", "bicchiere di vino"): diventano l'unità.
  const MEASURES = {
    spicchio: 'spicchi', spicchi: 'spicchi', rametto: 'rametti', rametti: 'rametti', rametto2: 'rametti',
    costa: 'coste', coste: 'coste', gambo: 'coste', gambi: 'coste', foglia: 'foglie', foglie: 'foglie', foglioline: 'foglie', fogliolina: 'foglie',
    ciuffo: 'mazzi', ciuffetto: 'mazzi', ciuffi: 'mazzi', mazzetto: 'mazzi', mazzetti: 'mazzi', mazzo: 'mazzi', mazzi: 'mazzi',
    noce: 'noci', noci: 'noci', noccioli: 'noci', bustina: 'bustine', bustine: 'bustine', busta: 'bustine', cubetto: 'cubetti', cubetti: 'cubetti',
    fetta: 'fette', fette: 'fette', fettina: 'fette', fettine: 'fette', bicchiere: 'bicchieri', bicchieri: 'bicchieri', bicchierino: 'bicchierini',
    cucchiaio: 'cucchiai', cucchiai: 'cucchiai', cucchiaino: 'cucchiaini', cucchiaini: 'cucchiaini', pizzico: 'pizzichi', pizzichi: 'pizzichi',
    tazza: 'tazze', tazze: 'tazze', tazzina: 'tazzine', tazzine: 'tazzine', manciata: 'manciate', manciate: 'manciate', pugno: 'manciate',
    filo: 'filo', goccio: 'goccio', gocce: 'goccio', panetto: 'panetti', rotolo: 'rotoli', rotoli: 'rotoli', foglio: 'fogli', fogli: 'fogli',
    scatola: 'scatole', scatolette: 'scatole', scatoletta: 'scatole', barattolo: 'scatole', vasetto: 'vasetti', confezione: 'conf',
    mestolo: 'mestoli', mestoli: 'mestoli', fascetto: 'mazzi', mazzettino: 'mazzi', presa: 'pizzichi', pezzetto: 'pezzetti', tocchetto: 'pezzetti',
    pezzo: 'pezzetti', cespo: 'pz', cespi: 'pz', gamba: 'coste', stecca: 'pz', stecche: 'pz', bastoncino: 'pz', cestino: 'cestini', cestini: 'cestini',
  };
  // Grammi (o ml, se ML) per unità quando l'alimento non dice altro.
  const UNIT_G = { g: 1, hg: 100, kg: 1000, pizzichi: 0.5, spicchi: 5, rametti: 2, coste: 40, foglie: 0.5, mazzi: 30, noci: 10, bustine: 16,
    cubetti: 25, fette: 30, manciate: 30, panetti: 250, rotoli: 230, fogli: 2, pezzetti: 10, cestini: 125 };
  const UNIT_ML = { ml: 1, cl: 10, dl: 100, l: 1000, cucchiai: 15, cucchiaini: 5, tazze: 240, tazzine: 50, bicchieri: 150, bicchierini: 40, filo: 5, goccio: 10, mestoli: 50 };

  // Aggiunte che non cambiano l'alimento ("a temperatura ambiente", "tritato", "per decorare"…).
  const QUAL = new RegExp('\\s+(?:a temperatura ambiente|a t a|per (?:decorare|spolverizzare|spolverare|guarnire|la decorazione|ungere|il fritto|la teglia|lo stampo|servire|condire|lo stampo|la superficie|la pentola|impastare|la frittura)|q ?b|qb|fresc[oaie]|freschissim[oaie]|tritat[oaie]|grattugiat[oaie]|sminuzzat[oaie]|in polvere|bio|biologic[oaie]|non trattat[oaie]|sgusciat[oaie]|a (?:cubetti|dadini|fette|fettine|listarelle|rondelle|pezzi|pezzetti|julienne|striscioline|tocchetti|spicchi|scaglie)|dop|igp|da grattugiare|surgelat[oaie]|(?:gia )?pulit[oaie]|medi[oaie]?|grand[ei]|piccol[oaie]|matur[oaie]|sottil[ei]|fredd[oaie]|cald[oaie]|tiepid[oaie]|morbid[oaie]|fus[oaie]|sciolt[oaie]|lessat[oaie]|sbucciat[oaie]|denocciolat[oaie]|scolat[oaie]|sgocciolat[oaie]|extra|di qualita|circa|abbondante|abbondanti|q b per|in grani|in fiocchi|macinat[oaie] (?:al momento|fresco)|(?:ben )?lavat[oaie]|secco|secca|secchi|secche)$');
  const LEAD = /^(?:circa |di |un |una |uno |il |lo |la |i |gli |le |l'|qualche |alcun[ei] |mezz[oa] |\d+(?: \d+)? )+/;

  function variants(s) {
    // singolare/plurale sull'ultima parola: uova/uovo, zucchine/zucchina, pomodori/pomodoro
    const out = [s];
    const m = s.match(/^(.*?)(\w+)$/); if (!m) return out;
    const [, head, w] = m;
    const swap = (a, b) => (w.endsWith(a) && w.length > 3 ? out.push(head + w.slice(0, -a.length) + b) : 0);
    swap('i', 'o'); swap('i', 'e'); swap('e', 'a'); swap('a', 'e'); swap('o', 'i'); swap('e', 'i'); swap('he', 'a'); swap('chi', 'co');
    return out;
  }

  function createIndex(data) {
    const byId = new Map((data.foods || []).map((f) => [f.id, f]));
    const aliases = new Map(Object.entries(data.aliases || {}));
    const look = (s) => { for (const v of variants(s)) { const id = aliases.get(v); if (id) return byId.get(id); } return null; };

    // Nome (come lo scrive l'utente o un sito) -> { food, unit } dove unit è la misura trovata nel nome.
    const cache = new Map();
    function match(name) {
      let s = key(name);
      if (!s) return null;
      if (cache.has(s)) return cache.get(s);
      // misura all'inizio: "2 spicchi d'aglio", "un bicchiere di vino bianco" (vale anche se il nome intero è noto)
      let unit = '';
      // "succo di 0.5 limone", "scorza di 1 arancia": il numero in mezzo non conta
      let rest = s.replace(LEAD, '').replace(/ di \d+(?: \d+)? /, ' di ');
      const mm = rest.match(/^(\w+) (?:di |d')(.+)$/);
      if (mm && MEASURES[mm[1]]) { unit = MEASURES[mm[1]]; rest = mm[2]; }
      else if (/^d'/.test(rest)) rest = rest.slice(2);
      const tryAll = (t) => {
        let f = look(t); if (f) return f;
        // aggiunte in coda, una alla volta
        for (let i = 0, cur = t; i < 6; i++) {
          const n = cur.replace(QUAL, '');
          if (n === cur) break;
          cur = n; f = look(cur); if (f) return f;
        }
        return null;
      };
      let res = tryAll(s);
      if (!res) {
        // "formaggio emmental", "polpa di avocado"
        const t = rest.replace(/^(?:formaggio|polpa di|cuori di|cuore di) /, '');
        res = tryAll(t);
        // "olio extravergine di oliva per la frittura" -> si toglie una parola alla volta dalla fine
        if (!res) {
          const words = t.split(' ');
          for (let n = words.length - 1; n >= 1 && !res; n--) res = tryAll(words.slice(0, n).join(' '));
        }
      }
      const out = res ? { food: res, unit } : null;
      if (cache.size > 5000) cache.clear();
      cache.set(s, out);
      return out;
    }

    // Grammi di un ingrediente; null se non si sa convertire (unità sconosciuta, quantità mancante).
    function grams(food, qty, unit, hint) {
      if (!food) return null;
      unit = unit || hint || '';
      if (unit === 'q.b.') return null;
      if (qty == null || !(qty > 0)) return null;
      const u = (food.u && food.u[unit]);
      if (u != null) return qty * u;
      if (unit in UNIT_G) return qty * UNIT_G[unit];
      if (unit in UNIT_ML) return qty * UNIT_ML[unit] * (food.den || 1);
      if (!unit || unit === 'pz') return food.pz ? qty * food.pz : null;
      return null;
    }

    // Valori per porzione di una ricetta: { per: {kcal, …}, counted, total, approx, sources }.
    // ingredients: [{ name, qty, unit }] già scalati per `servings` persone.
    function nutrition(ingredients, servings) {
      const sum = Object.fromEntries(NUT.map((k) => [k, 0]));
      let counted = 0, total = 0, approx = false;
      const sources = new Set(), missing = [], noQty = [];
      for (const i of ingredients || []) {
        if (!i || !i.name || i.unit === 'q.b.') continue;
        const m = match(i.name);
        // acqua, sale "q.b." e simili: non contano nella copertura
        if (m && m.food.src === 'zero') continue;
        if (i.qty == null) { noQty.push(i.name); continue; } // senza quantità (sale, olio "q.b." scritti senza): non si contano
        total++;
        const g = m && m.food.v ? grams(m.food, i.qty, i.unit, m.unit) : null;
        if (g == null) { missing.push(i.name); continue; }
        counted++;
        if (m.food.a) approx = true;
        sources.add(String(m.food.src).split(':')[0]);
        m.food.v.forEach((v, k) => { if (v != null) sum[NUT[k]] += (g * v) / 100; });
      }
      const n = Math.max(1, servings || 1);
      const per = Object.fromEntries(NUT.map((k) => [k, sum[k] / n]));
      return { per, counted, total, approx, sources: [...sources], missing, noQty };
    }

    // Il nome canonico (o della variante) per suggerimenti e reparti.
    const deptOf = (name) => { const m = match(name); return m ? m.food.d : ''; };
    // Tipo per le caratteristiche: carne, pesce, latte, uova, miele o '' (vegetale).
    const kindOf = (name) => { const m = match(name); if (!m) return null; let f = m.food; while (f && !f.k && f.p) f = byId.get(f.p); return (f && f.k) || ''; };
    const names = () => [...byId.values()].map((f) => f.n);
    return { match, grams, nutrition, deptOf, kindOf, names, byId, version: data.version, sources: data.sources || {} };
  }

  const api = { key, createIndex, NUT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Foods = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
