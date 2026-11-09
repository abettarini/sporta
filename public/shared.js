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
    { id: 'frutta', label: 'Frutta e verdura' },
    { id: 'pane', label: 'Pane e forno' },
    { id: 'carne', label: 'Carne' },
    { id: 'pesce', label: 'Pesce' },
    { id: 'salumi', label: 'Salumi e formaggi' },
    { id: 'latticini', label: 'Latte, latticini e uova' },
    { id: 'pasta', label: 'Pasta, riso e cereali' },
    { id: 'dispensa', label: 'Dispensa' },
    { id: 'colazione', label: 'Colazione e dolci' },
    { id: 'surgelati', label: 'Surgelati' },
    { id: 'bevande', label: 'Bevande' },
    { id: 'persona', label: 'Igiene e cura persona' },
    { id: 'casa', label: 'Casa e pulizia' },
    { id: 'animali', label: 'Animali' },
    { id: 'bimbi', label: 'Infanzia' },
    { id: '', label: 'Altro' },
  ];

  // Parole chiave per proporre il reparto di un prodotto nuovo (si può sempre cambiare).
  const DEPT_WORDS = {
    frutta: 'mel mele pera pere banan aranc limon mandarin clementin fragol uva kiwi pesc albicocc ciliegi anguri melone frutt ananas avocad insalat lattug rucola spinac pomodor pomodorin zucchin melanzan peperon patat cipoll aglio carot sedano finocch cavol broccol verza zucca fungh champignon funghi basilico prezzemol rosmarin salvia menta piselli fagiolin carciof asparag porr radicchi cetriol verdur scalogn zenzero',
    pane: 'pane panin pancarr piadin focacc grissin crackers cracker fette_biscottate taralli pizza pangrattato',
    carne: 'carne pollo tacchino manzo vitell maiale salsicc macinat hamburger bistecc fettin cotolett arrost costin agnell coniglio petto cosce wurstel',
    pesce: 'pesce salmone tonno fresco merluzz orata branzin gamber cozz vongol calamar polpo seppi alici acciugh baccal sgombr',
    salumi: 'prosciutt salam mortadell bresaol speck pancett guancial coppa formagg parmigian grana pecorin mozzarell burrat stracchin gorgonzol provolon scamorz ricott fontina asiago emmental taleggio mascarpone feta',
    latticini: 'latte yogurt burro panna uova uovo kefir besciamella',
    pasta: 'pasta spaghett penne fusill rigaton linguin tagliatell lasagn gnocch riso farro orzo couscous quinoa farina semola polenta tortellin ravioli',
    dispensa: 'olio aceto sale pepe zucchero passata pelati sugo pesto tonno_in_scatola in_scatola legumi fagioli ceci lenticch mais olive capperi brodo dado spezie origano curry maionese ketchup senape conserv sottaceti lievito',
    colazione: 'biscott cereali muesli marmellat confettur nutella miele caffè caffe the tè tisan cacao merendin cioccolat torta crostat cornett brioche',
    surgelati: 'surgelat gelato bastoncin findus minestrone surgel ghiacciol',
    bevande: 'acqua vino birra succo aranciata coca_cola bibit tonica spumante prosecco liquor',
    persona: 'shampoo bagnoschiuma sapone dentifricio spazzolin deodorante assorbent rasoi crema cotone carta_igienica fazzolett',
    casa: 'detersiv detergent sgrassator candeggin ammorbident pellicol alluminio sacchett spugn scottex rotoli tovagliol piatti carta_forno carta_stagnola lavastovigli anticalcare',
    animali: 'croccant crocchett gatto cane lettiera scatolett per_cani per_gatti',
    bimbi: 'pannolin omogeneizz salviett latte_in_polvere biberon',
  };
  const DEPT_INDEX = [];
  for (const [dept, words] of Object.entries(DEPT_WORDS)) {
    for (const w of words.split(' ')) if (w) DEPT_INDEX.push([w.replace(/_/g, ' '), dept]); // "_" unisce le frasi
  }
  DEPT_INDEX.sort((a, b) => b[0].length - a[0].length);

  // La parola che compare per prima nel nome indica di solito il prodotto
  // ("passata di pomodoro" -> dispensa); a parità vince la parola chiave più lunga.
  const deaccent = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '');
  function guessDepartment(name) {
    const n = ' ' + deaccent(normName(name)) + ' ';
    let best = null;
    for (const [w, dept] of DEPT_INDEX) {
      const at = n.indexOf(' ' + deaccent(w));
      if (at >= 0 && (!best || at < best.at || (at === best.at && w.length > best.len))) best = { at, len: w.length, dept };
    }
    return best ? best.dept : '';
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


  // ------------------------------------------------------------------ tipi di lista
  const LIST_TYPES = {
    spesa: { label: 'Spesa', hint: 'Quantità, reparti, carrello', icon: 'cart' },
    todo: { label: 'Da fare', hint: 'Chi, entro quando, priorità', icon: 'todo' },
    collezione: { label: 'Libri, film e desideri', hint: 'Autore, stato, voto', icon: 'book' },
    generica: { label: 'Generica', hint: 'Solo testo e spunta', icon: 'note' },
  };
  // Varianti della lista "collezione": etichette degli stati e del creatore.
  const COLLECTION_KINDS = {
    libri: { label: 'Libri', icon: 'book', creator: 'Autore', states: ['Da leggere', 'In lettura', 'Letto'], example: 'Dune - Frank Herbert' },
    film: { label: 'Film e serie', icon: 'film', creator: 'Regia', states: ['Da vedere', 'In visione', 'Visto'], example: 'Oppenheimer - Nolan' },
    desideri: { label: 'Desideri e regali', icon: 'gift', creator: 'Dove / marca', states: ['Desiderato', 'Prenotato', 'Ricevuto'], example: 'Cuffie - Sony' },
    altro: { label: 'Altro', icon: 'star', creator: 'Di', states: ['Da fare', 'In corso', 'Fatto'], example: 'Titolo - autore' },
  };
  const kindOf = (variant) => COLLECTION_KINDS[variant] || COLLECTION_KINDS.libri;

  // Date come stringhe "AAAA-MM-GG" (giorno locale, senza fusi orari).
  const pad2 = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fromYmd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const deaccentLc = (x) => String(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // "prenotare il campo @Luca venerdì !" -> { name, due: 'AAAA-MM-GG', priority: 1, assignee: 'Luca' }
  // Date: oggi, domani, dopodomani, giorni della settimana (il prossimo), 12/12, 12/12/2026, 12 dic.
  function parseTodo(text, now = new Date()) {
    let s = ' ' + String(text || '').trim() + ' ';
    const out = { name: '', due: '', priority: 0, assignee: '' };
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const take = (re, fn) => { const m = s.match(re); if (m) { fn(m); s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); } return !!m; };
    take(/\s(!{1,3})(?=\s)/, () => { out.priority = 1; });
    take(/\s@([^\s@!]+(?:\s[A-Z][^\s@!]*\.?)?)(?=\s)/u, (m) => { out.assignee = m[1].trim(); });
    const words = { oggi: 0, domani: 1, dopodomani: 2 };
    take(/\s(?:entro\s+)?(oggi|domani|dopodomani)(?=\s)/i, (m) => { out.due = ymd(addDays(today, words[m[1].toLowerCase()])); }) ||
    take(/\s(?:entro\s+|per\s+)?(luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica|lun|mar|mer|gio|ven|sab|dom)(?=\s)/i, (m) => {
      const target = WEEKDAYS.indexOf(deaccentLc(m[1]).slice(0, 3));
      let diff = (target - today.getDay() + 7) % 7; if (diff === 0) diff = 7;
      out.due = ymd(addDays(today, diff));
    }) ||
    take(/\s(?:entro\s+|il\s+)?(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?=\s)/, (m) => {
      let y = m[3] ? +m[3] : today.getFullYear(); if (y < 100) y += 2000;
      let d = new Date(y, +m[2] - 1, +m[1]);
      if (!m[3] && d < today) d = new Date(y + 1, +m[2] - 1, +m[1]);
      if (d.getDate() === +m[1]) out.due = ymd(d);
    }) ||
    take(/\s(?:entro\s+|il\s+)?(\d{1,2})\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)[a-z]*(?=\s)/i, (m) => {
      let d = new Date(today.getFullYear(), MONTHS.indexOf(m[2].toLowerCase()), +m[1]);
      if (d < today) d = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
      out.due = ymd(d);
    });
    s = s.replace(/\s+/g, ' ').trim();
    out.name = s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    return out;
  }

  // "Dune - Frank Herbert" -> { name: 'Dune', creator: 'Frank Herbert' }
  function parseCollection(text) {
    const s = String(text || '').trim();
    const m = s.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    const name = (m ? m[1] : s).trim();
    return { name: name ? name.charAt(0).toUpperCase() + name.slice(1) : '', creator: m ? m[2].trim() : '' };
  }

  // Scadenza leggibile e stato: 'late' (scaduta), 'soon' (entro 2 giorni), '' (più avanti).
  function fmtDue(due, now = new Date()) {
    const d = fromYmd(due); if (!d) return { text: '', state: '' };
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((d - today) / 864e5);
    let text;
    if (diff === 0) text = 'oggi';
    else if (diff === 1) text = 'domani';
    else if (diff === -1) text = 'ieri';
    else if (diff > 1 && diff < 7) text = WEEKDAYS[d.getDay()] + ' ' + d.getDate();
    else text = d.getDate() + ' ' + MONTHS[d.getMonth()] + (d.getFullYear() !== today.getFullYear() ? ' ' + d.getFullYear() : '');
    return { text, state: diff < 0 ? 'late' : diff <= 2 ? 'soon' : '', diff };
  }

  const api = { parseQuick, normUnit, normName, parseNum, addQty, compatible, convert,
    roundSmart, scaleQty, fmtQty, fmtNum, UNITS, DEPARTMENTS, guessDepartment, deptOf, fmtMinutes, fmtMoney,
    LIST_TYPES, COLLECTION_KINDS, kindOf, parseTodo, parseCollection, fmtDue, ymd, fromYmd, addDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Shared = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
