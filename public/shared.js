// Logica condivisa tra client e server: parsing inserimento rapido,
// unità di misura, somma e scalatura delle quantità.
(function (root) {
  const UNIT_ALIASES = {
    g: 'g', gr: 'g', grammi: 'g', grammo: 'g',
    hg: 'hg', etto: 'hg', etti: 'hg',
    kg: 'kg', chili: 'kg', chilo: 'kg', kilo: 'kg',
    ml: 'ml', cl: 'cl', dl: 'dl',
    l: 'l', lt: 'l', litro: 'l', litri: 'l',
    pz: 'pz', pezzo: 'pz', pezzi: 'pz',
    conf: 'conf', confezione: 'conf', confezioni: 'conf',
    bott: 'bottiglie', bottiglia: 'bottiglie', bottiglie: 'bottiglie',
    scatola: 'scatole', scatole: 'scatole', scatolette: 'scatole', scatoletta: 'scatole',
    vasetto: 'vasetti', vasetti: 'vasetti',
    pacco: 'pacchi', pacchi: 'pacchi', pacchetto: 'pacchi', pacchetti: 'pacchi',
    busta: 'buste', buste: 'buste',
    cucchiaio: 'cucchiai', cucchiai: 'cucchiai',
    cucchiaino: 'cucchiaini', cucchiaini: 'cucchiaini',
    tazza: 'tazze', tazze: 'tazze',
    spicchio: 'spicchi', spicchi: 'spicchi',
    foglia: 'foglie', foglie: 'foglie',
    fetta: 'fette', fette: 'fette',
    mazzo: 'mazzi', mazzi: 'mazzi',
    pizzico: 'pizzichi', pizzichi: 'pizzichi',
    'q.b.': 'q.b.', qb: 'q.b.',
  };

  const UNITS = ['', 'g', 'hg', 'kg', 'ml', 'cl', 'dl', 'l', 'pz', 'conf', 'bottiglie', 'scatole',
    'vasetti', 'pacchi', 'buste', 'cucchiai', 'cucchiaini', 'tazze', 'spicchi', 'foglie',
    'fette', 'mazzi', 'pizzichi', 'q.b.'];

  // Fattori di conversione verso l'unità base della stessa grandezza.
  const DIM = {
    g: ['mass', 1], hg: ['mass', 100], kg: ['mass', 1000],
    ml: ['vol', 1], cl: ['vol', 10], dl: ['vol', 100], l: ['vol', 1000],
  };

  function normUnit(u) {
    if (!u) return '';
    const k = String(u).trim().toLowerCase();
    return UNIT_ALIASES[k] || UNIT_ALIASES[k.replace(/\.$/, '')] || k;
  }

  function normName(n) {
    return String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function parseNum(s) {
    if (s == null || s === '') return null;
    const n = parseFloat(String(s).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const unitPattern = Object.keys(UNIT_ALIASES)
    .sort((a, b) => b.length - a.length)
    .map((u) => u.replace(/\./g, '\\.'))
    .join('|');

  // "2 kg patate @Selex" -> { name: 'patate', qty: 2, unit: 'kg', brand: 'Selex' }
  // Supporta anche "latte x3", "3x yogurt", "500g farina", "uova 6".
  function parseQuick(text) {
    let s = String(text || '').trim();
    const out = { name: '', qty: null, unit: '', brand: '' };
    const at = s.indexOf('@');
    if (at >= 0) {
      out.brand = s.slice(at + 1).trim();
      s = s.slice(0, at).trim();
    }
    const num = '(\\d+(?:[.,]\\d+)?)';
    const reUnit = new RegExp('(?:^|\\s)' + num + '\\s*(' + unitPattern + ')(?=\\s|$)', 'i');
    const reX = new RegExp('(?:^|\\s)(?:x\\s*' + num + '|' + num + '\\s*x)(?=\\s|$)', 'i');
    const reLead = new RegExp('^' + num + '\\s+');
    const reTrail = new RegExp('\\s+' + num + '$');
    let m;
    if ((m = s.match(/(?:^|\s)(q\.?b\.?)(?=\s|$)/i))) {
      out.unit = 'q.b.';
      s = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).trim();
    } else if ((m = s.match(reUnit))) {
      out.qty = parseNum(m[1]);
      out.unit = normUnit(m[2]);
      s = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).trim();
    } else if ((m = s.match(reX))) {
      out.qty = parseNum(m[1] || m[2]);
      s = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).trim();
    } else if ((m = s.match(reLead))) {
      out.qty = parseNum(m[1]);
      s = s.slice(m[0].length).trim();
    } else if ((m = s.match(reTrail))) {
      out.qty = parseNum(m[1]);
      s = s.slice(0, m.index).trim();
    }
    s = s.replace(/^(di|d')\s*/i, '').replace(/\s+/g, ' ').trim();
    out.name = s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    if (out.unit === 'q.b.') out.qty = null;
    return out;
  }

  function convert(qty, from, to) {
    from = normUnit(from); to = normUnit(to);
    if (from === to) return qty;
    const a = DIM[from], b = DIM[to];
    if (a && b && a[0] === b[0]) return (qty * a[1]) / b[1];
    return null;
  }

  // Unità compatibili per poter sommare due quantità.
  function compatible(u1, u2) {
    u1 = normUnit(u1); u2 = normUnit(u2);
    if (u1 === u2) return true;
    const a = DIM[u1], b = DIM[u2];
    return !!(a && b && a[0] === b[0]);
  }

  // Somma b a a (stessa grandezza). Ritorna {qty, unit} o null se non sommabili.
  function addQty(qa, ua, qb, ub) {
    ua = normUnit(ua); ub = normUnit(ub);
    if (qa == null && qb == null) return { qty: null, unit: ua || ub };
    if (qa == null) return { qty: qb, unit: ub };
    if (qb == null) return { qty: qa, unit: ua };
    if (!compatible(ua, ub)) return null;
    let unit = ua, qty = qa + convert(qb, ub, ua);
    // Passa a kg / l quando conviene.
    if (unit === 'g' && qty >= 1000) { qty /= 1000; unit = 'kg'; }
    if (unit === 'ml' && qty >= 1000) { qty /= 1000; unit = 'l'; }
    return { qty: roundSmart(qty, unit), unit };
  }

  function roundSmart(q, unit) {
    if (q == null) return null;
    unit = normUnit(unit);
    if (unit === 'g' || unit === 'ml') {
      if (q < 10) return Math.max(1, Math.round(q));
      if (q < 100) return Math.round(q / 5) * 5;
      return Math.round(q / 10) * 10;
    }
    if (unit === 'kg' || unit === 'l') return Math.round(q * 100) / 100;
    if (unit === 'hg' || unit === 'cl' || unit === 'dl') return Math.round(q * 10) / 10;
    if (['cucchiai', 'cucchiaini', 'tazze', 'pizzichi'].includes(unit)) {
      return Math.max(0.5, Math.round(q * 2) / 2);
    }
    // Pezzi, confezioni, uova...: si comprano interi.
    return Math.max(1, Math.ceil(q - 1e-9));
  }

  function scaleQty(qty, unit, from, to) {
    if (qty == null || !from || !to) return qty;
    return roundSmart((qty * to) / from, unit);
  }

  function fmtNum(n) {
    if (n == null) return '';
    return (Math.round(n * 100) / 100).toString().replace('.', ',');
  }

  function fmtQty(qty, unit) {
    unit = normUnit(unit);
    if (unit === 'q.b.') return 'q.b.';
    if (qty == null) return unit || '';
    if (!unit) return fmtNum(qty);
    const tight = ['g', 'hg', 'kg', 'ml', 'cl', 'dl', 'l'].includes(unit);
    return fmtNum(qty) + (tight ? ' ' : ' ') + unit;
  }


  // Reparti nell'ordine tipico di un supermercato.
  const DEPARTMENTS = [
    { id: 'frutta', label: 'Frutta e verdura', emoji: '🥬' },
    { id: 'pane', label: 'Pane e forno', emoji: '🥖' },
    { id: 'carne', label: 'Carne', emoji: '🥩' },
    { id: 'pesce', label: 'Pesce', emoji: '🐟' },
    { id: 'salumi', label: 'Salumi e formaggi', emoji: '🧀' },
    { id: 'latticini', label: 'Latte, latticini e uova', emoji: '🥛' },
    { id: 'pasta', label: 'Pasta, riso e cereali', emoji: '🍝' },
    { id: 'dispensa', label: 'Dispensa', emoji: '🥫' },
    { id: 'colazione', label: 'Colazione e dolci', emoji: '🍪' },
    { id: 'surgelati', label: 'Surgelati', emoji: '❄️' },
    { id: 'bevande', label: 'Bevande', emoji: '🥤' },
    { id: 'persona', label: 'Igiene e cura persona', emoji: '🧴' },
    { id: 'casa', label: 'Casa e pulizia', emoji: '🧽' },
    { id: 'animali', label: 'Animali', emoji: '🐾' },
    { id: 'bimbi', label: 'Infanzia', emoji: '🍼' },
    { id: '', label: 'Altro', emoji: '📦' },
  ];

  // Parole chiave per proporre il reparto di un prodotto nuovo (si può sempre cambiare).
  const DEPT_WORDS = {
    frutta: 'mel mele pera pere banan aranc limon mandarin clementin fragol uva kiwi pesc albicocc ciliegi anguri melone frutt ananas avocad insalat lattug rucola spinac pomodor pomodorin zucchin melanzan peperon patat cipoll aglio carot sedano finocch cavol broccol verza zucca fungh champignon funghi basilico prezzemol rosmarin salvia menta piselli fagiolin carciof asparag porr radicchi cetriol verdur scalogn zenzero',
    pane: 'pane panin pancarr piadin focacc grissin crackers cracker fette biscottate taralli pizza pangrattato',
    carne: 'carne pollo tacchino manzo vitell maiale salsicc macinat hamburger bistecc fettin cotolett arrost costin agnell coniglio petto cosce wurstel',
    pesce: 'pesce salmone tonno fresco merluzz orata branzin gamber cozz vongol calamar polpo seppi alici acciugh baccal sgombr',
    salumi: 'prosciutt salam mortadell bresaol speck pancett guancial coppa formagg parmigian grana pecorin mozzarell burrat stracchin gorgonzol provolon scamorz ricott fontina asiago emmental taleggio mascarpone feta',
    latticini: 'latte yogurt burro panna uova uovo kefir besciamella',
    pasta: 'pasta spaghett penne fusill rigaton linguin tagliatell lasagn gnocch riso farro orzo couscous quinoa farina semola polenta tortellin ravioli',
    dispensa: 'olio aceto sale pepe zucchero passata pelati sugo pesto tonno in scatola legumi fagioli ceci lenticch mais olive capperi brodo dado spezie origano curry maionese ketchup senape conserv sottaceti lievito',
    colazione: 'biscott cereali muesli marmellat confettur nutella miele caffè caffe the tè tisan cacao merendin cioccolat torta crostat cornett brioche',
    surgelati: 'surgelat gelato bastoncin findus minestrone surgel ghiacciol',
    bevande: 'acqua vino birra succo aranciata coca cola bibit tonica spumante prosecco liquor',
    persona: 'shampoo bagnoschiuma sapone dentifricio spazzolin deodorante assorbent rasoi crema cotone carta igienica fazzolett',
    casa: 'detersiv detergent sgrassator candeggin ammorbident pellicol alluminio sacchett spugn scottex rotoli tovagliol piatti carta forno lavastovigli anticalcare',
    animali: 'croccant crocchett gatto cane lettiera scatolett per cani per gatti',
    bimbi: 'pannolin omogeneizz salviett latte in polvere biberon',
  };
  const DEPT_INDEX = [];
  for (const [dept, words] of Object.entries(DEPT_WORDS)) {
    for (const w of words.split(' ')) if (w) DEPT_INDEX.push([w, dept]);
  }
  DEPT_INDEX.sort((a, b) => b[0].length - a[0].length);

  function guessDepartment(name) {
    const n = ' ' + normName(name).normalize('NFD').replace(/[̀-ͯ]/g, '') + ' ';
    for (const [w, dept] of DEPT_INDEX) {
      const ww = w.normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (n.includes(' ' + ww)) return dept;
    }
    return '';
  }

  function deptOf(id) {
    return DEPARTMENTS.find((d) => d.id === (id || '')) || DEPARTMENTS[DEPARTMENTS.length - 1];
  }

  function fmtMinutes(m) {
    if (m == null || m === '') return '';
    m = Number(m);
    if (m < 60) return m + ' min';
    const hh = Math.floor(m / 60), mm = m % 60;
    return hh + ' h' + (mm ? ' ' + mm + ' min' : '');
  }

  function fmtMoney(v) {
    if (v == null || v === '') return '';
    return Number(v).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  }

  const api = { parseQuick, normUnit, normName, parseNum, addQty, compatible, convert,
    roundSmart, scaleQty, fmtQty, fmtNum, UNITS, DEPARTMENTS, guessDepartment, deptOf, fmtMinutes, fmtMoney };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Shared = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
