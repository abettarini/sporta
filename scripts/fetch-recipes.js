#!/usr/bin/env node
'use strict';
/* Scarica ricette da pagine web che pubblicano i dati strutturati schema.org/Recipe
   (GialloZafferano, Cucchiaio d'Argento, Misya, Fatto in casa da Benedetta e quasi tutti
   i siti di cucina) per POPOLARE E PROVARE un'istanza di Sporta.

   Testi e foto restano di chi li ha pubblicati: le ricette vengono caricate sempre come
   PRIVATE e lo script si rifiuta di scrivere in un Ricettario (dove tutto è pubblico e
   finisce sul web). Legge solo gli indirizzi che gli dai, rispetta robots.txt e aspetta
   tra una richiesta e l'altra.

   Uso:
     node scripts/fetch-recipes.js urls.txt --out ricette.json [--images cartella]
     node scripts/fetch-recipes.js urls.txt --push http://localhost:3000 --token m_…

   urls.txt: un indirizzo per riga (le righe vuote e quelle che iniziano con # si saltano).
   --out      file JSON nel formato di "Importa ricette" (le foto lì non si importano)
   --images   con --out: salva anche le foto in questa cartella
   --push     indirizzo dell'istanza di Sporta in cui caricare ricette e foto
   --token    chiave del gruppo di destinazione: nell'app, dalla console del browser,
              tokenFor(st.code)
   --delay    secondi tra una richiesta e l'altra (default 2)
   --photos   foto per ricetta da caricare con --push (default 1, massimo 4)
   --duplicates  con --push carica anche le ricette con un nome già presente nel gruppo
*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const S = require('../public/shared.js');

const UA = 'SportaTestImporter/1.0 (popolamento di un ambiente di prova; una richiesta ogni pochi secondi)';
const MAX_PHOTO = 3 * 1024 * 1024; // come il server
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// ------------------------------------------------------------------ argomenti
function parseArgs(argv) {
  const a = { urls: null, out: null, images: null, push: null, token: null, delay: 2, photos: 1, duplicates: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--out') a.out = next();
    else if (k === '--images') a.images = next();
    else if (k === '--push') a.push = String(next() || '').replace(/\/+$/, '');
    else if (k === '--token') a.token = next();
    else if (k === '--delay') a.delay = Math.max(1, Number(next()) || 2);
    else if (k === '--photos') a.photos = Math.max(0, Math.min(4, parseInt(next(), 10) || 0));
    else if (k === '--duplicates') a.duplicates = true;
    else if (k === '-h' || k === '--help') a.help = true;
    else if (!a.urls) a.urls = k;
    else throw new Error(`Argomento sconosciuto: ${k}`);
  }
  return a;
}

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

// ------------------------------------------------------------------ robots.txt
const robotsCache = new Map();
async function allowedByRobots(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    let rules = [];
    try {
      const res = await fetch(u.origin + '/robots.txt', { headers: { 'User-Agent': UA } });
      if (res.ok) rules = parseRobots(await res.text());
    } catch { /* senza robots.txt: tutto permesso */ }
    robotsCache.set(u.origin, rules);
  }
  const p = u.pathname + u.search;
  // La regola più lunga che corrisponde vince (come fa Google); a parità vince Allow.
  let best = null;
  for (const r of robotsCache.get(u.origin)) {
    if (!r.path || !matchRobots(r.path, p)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return !best || best.allow;
}
function parseRobots(text) {
  const groups = [];
  let cur = null, lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (key === 'allow' || key === 'disallow')) cur.rules.push({ allow: key === 'allow', path: val });
    }
  }
  const mine = groups.filter((g) => g.agents.some((x) => x !== '*' && UA.toLowerCase().includes(x)));
  return (mine.length ? mine : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules);
}
function matchRobots(rule, p) {
  const re = new RegExp('^' + rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
  return re.test(p);
}

// ------------------------------------------------------------------ lettura della ricetta
async function getPage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
const decode = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;|&rsquo;|&#8217;/g, '’').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/\s+/g, ' ').trim();

function findRecipe(html) {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const isRecipe = (x) => x && [].concat(x['@type'] || []).includes('Recipe');
  const walk = (x) => {
    if (!x || typeof x !== 'object') return null;
    if (Array.isArray(x)) { for (const y of x) { const r = walk(y); if (r) return r; } return null; }
    if (isRecipe(x)) return x;
    return walk(x['@graph']) || walk(x.mainEntity) || null;
  };
  for (const b of blocks) {
    try { const r = walk(JSON.parse(b.trim().replace(/^<!--|-->$/g, ''))); if (r) return r; } catch { /* blocco non valido: il prossimo */ }
  }
  return null;
}

function minutesOf(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  const iso = s.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (iso && (iso[1] || iso[2] || iso[3])) return (Number(iso[1] || 0) * 1440) + (Number(iso[2] || 0) * 60) + Number(iso[3] || 0) || null;
  const n = parseInt(s, 10);
  return n > 0 ? n : null;
}
const COURSES = [
  ['antipasto', ['antipast', 'appetizer', 'stuzzichin', 'aperitiv', 'finger']], ['primo', ['primo', 'primi', 'pasta', 'risott', 'zupp', 'minestr']],
  ['secondo', ['secondo', 'secondi', 'main']], ['contorno', ['contorn', 'side']], ['unico', ['unico', 'piatti unici']],
  ['dolce', ['dolc', 'dessert', 'torta', 'biscott']], ['colazione', ['colazion', 'breakfast']], ['salsa', ['sals', 'sugh', 'condiment', 'pesto']],
  ['pane', ['pane', 'lievitat', 'pizza', 'focacc']], ['bevanda', ['bevand', 'drink', 'cocktail']],
];
function courseOf(v) {
  for (const s of [].concat(v || []).map((x) => S.foldText(x))) for (const [id, words] of COURSES) if (words.some((w) => s.includes(w))) return id;
  return '';
}
const DIETS = { vegetariandiet: 'vegetariana', vegandiet: 'vegana', glutenfreediet: 'senza-glutine', lowlactosediet: 'senza-lattosio', lowcaloriediet: 'light' };
function stepsOf(v) {
  if (typeof v === 'string') return decode(v).split(/(?<=\.)\s+(?=[A-ZÀ-Ý])/).filter(Boolean).map((text) => ({ text }));
  const out = [];
  for (const s of [].concat(v || [])) {
    if (typeof s === 'string') out.push({ text: decode(s) });
    else if (s && s.itemListElement) out.push(...stepsOf(s.itemListElement));
    else if (s && (s.text || s.name)) out.push({ text: decode(s.text || s.name) });
  }
  // Senza i rimandi alle foto dei passaggi ("…lo zucchero [1]").
  for (const x of out) x.text = x.text.replace(/\s*\[\d+\]/g, '').trim();
  return out.filter((s) => s.text).slice(0, 100).map((s) => ({ text: s.text.slice(0, 3000) }));
}
function imagesOf(v) {
  const out = [];
  for (const x of [].concat(v || [])) {
    if (typeof x === 'string') out.push(x);
    else if (x && (x.url || x.contentUrl)) out.push(x.url || x.contentUrl);
  }
  return [...new Set(out)];
}

// Ingrediente scritto come sui siti di ricette -> { name, qty, unit }.
// "1/2 cucchiaino di lievito", "2 mele (circa 350 g)", "q.b. olio di semi", "Pecorino 50 g"
const FRACTIONS = { '½': '0.5', '¼': '0.25', '¾': '0.75', '⅓': '0.33', '⅔': '0.67' };
function ingredientOf(text) {
  let t = decode(text).replace(/[½¼¾⅓⅔]/g, (c) => ` ${FRACTIONS[c]} `)
    .replace(/(\d+)\s*(l|litr[oi]|kg|chil[oi]|g)\s+e\s+(\d+)\/(\d+)/i, (_, a, u, n, d) => `${Number(a) + Number(n) / Number(d)} ${u}`) // "1 l e 1/2"
    .replace(/(\d+)\s+e\s+(\d+)\/(\d+)/, (_, a, n, d) => String(Number(a) + Number(n) / Number(d)))
    .replace(/(\d+)\/(\d+)/, (_, n, d) => String(Math.round((Number(n) / Number(d)) * 100) / 100))
    .replace(/\s+/g, ' ').trim();
  const note = (t.match(/\(([^)]*)\)/) || [])[1] || '';
  t = t.replace(/\s*\([^)]*\)/g, '').trim();
  const p = S.parseQuick(t);
  if (!p.name) return null;
  // Senza quantità: "mele (circa 350 g)" -> 350 g, presi dalla nota tra parentesi.
  const inNote = note.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\b/i);
  if (inNote && p.qty == null) { p.qty = S.parseNum(inNote[1]); p.unit = inNote[2].toLowerCase(); }
  return { name: p.name.slice(0, 120), qty: p.qty ?? null, unit: p.unit || '', brand: '' };
}
// Procedimento in un solo blocco lungo: si divide in passaggi di poche frasi.
function splitLong(steps) {
  if (steps.length !== 1 || steps[0].text.length < 500) return steps;
  const sentences = steps[0].text.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])/);
  const out = [];
  let cur = '';
  for (const x of sentences) {
    if (cur && (cur + ' ' + x).length > 380) { out.push({ text: cur }); cur = x; } else cur = cur ? cur + ' ' + x : x;
  }
  if (cur) out.push({ text: cur });
  return out;
}

// Procedimento mancante nei dati strutturati (succede in pagine più vecchie): il testo
// sotto un titolo "Procedimento" o "Preparazione", fino al titolo successivo.
function stepsFromHtml(html) {
  const m = String(html || '').match(/<h[1-5][^>]*>\s*(?:<[^>]+>\s*)*(procedimento|preparazione)\s*(?:<[^>]+>\s*)*<\/h[1-5]>([\s\S]{0,12000}?)(?=<h[1-5][\s>]|<\/article|<footer)/i);
  if (!m) return [];
  const text = m[2].split(/<(?:button|form|nav|aside|figure|iframe)[\s>]/i)[0] // fino a bottoni, voti, condivisioni…
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return splitLong(text.split(/\n+/).map(decode).filter((t) => t.length > 20).map((t) => ({ text: t.slice(0, 3000) })));
}

// Ricetta schema.org -> formato di Sporta (lo stesso di "Importa ricette").
function toSporta(r, url) {
  const ingredients = [].concat(r.recipeIngredient || r.ingredients || []).map(ingredientOf).filter(Boolean).slice(0, 200);
  const prep = minutesOf(r.prepTime), cook = minutesOf(r.cookTime), total = minutesOf(r.totalTime);
  const traits = new Set();
  for (const d of [].concat(r.suitableForDiet || [])) { const k = String(d).split('/').pop().toLowerCase(); if (DIETS[k]) traits.add(DIETS[k]); }
  for (const t of S.suggestTraits(ingredients, (prep || 0) + (cook || 0) || total || 0)) traits.add(t);
  const host = new URL(url).hostname.replace(/^www\./, '');
  return {
    // "Saltimbocca alla romana: un grande classico…" -> "Saltimbocca alla romana"
    name: decode(r.name).replace(/^(.{4,}?)\s*[:|–—]\s+.*$/, '$1').slice(0, 120),
    description: [decode(r.description).slice(0, 1800), `Fonte: ${url}`].filter(Boolean).join('\n\n'),
    servings: Math.max(1, Math.min(100, parseInt([].concat(r.recipeYield || '')[0], 10) || 4)),
    prep_min: prep ?? (cook == null ? total : null), cook_min: cook,
    difficulty: '', course: courseOf(r.recipeCategory) || courseOf(String(r.keywords || '').split(',')) || courseOf(r.name), traits: [...traits],
    ingredients, steps: splitLong(stepsOf(r.recipeInstructions)), notes: '', visibility: 'private',
    image: imagesOf(r.image), source: url, source_host: host,
  };
}

// ------------------------------------------------------------------ foto
async function getImage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const mime = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const buf = Buffer.from(await res.arrayBuffer());
  return { mime, buf };
}
const extOf = (mime) => ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[mime] || '.img');

// ------------------------------------------------------------------ Sporta
async function sporta(base, token, method, p, body) {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}

// ------------------------------------------------------------------ main
async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help || !a.urls || (!a.out && !a.push)) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^[\s\S]*?\/\*/, '').replace(/^ {3}/gm, ''));
    process.exit(a.help ? 0 : 1);
  }
  if (a.push && !a.token) throw new Error('Con --push serve --token (la chiave del gruppo)');
  const urls = fs.readFileSync(a.urls, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
  if (!urls.length) throw new Error('Nessun indirizzo nel file');
  if (urls.length > 500) throw new Error('Al massimo 500 indirizzi per volta');

  let existing = new Set();
  if (a.push) {
    const st = await sporta(a.push, a.token, 'GET', '/api/state');
    if (st.household && st.household.kind === 'cookbook') {
      throw new Error(`"${st.household.name}" è un Ricettario: lì ogni ricetta è pubblica e va sul web. Usa un gruppo normale (o il gruppo Personale).`);
    }
    existing = new Set((st.recipes || []).map((r) => S.foldText(r.name)));
    console.log(`Gruppo di destinazione: ${st.household.name} (${existing.size} ricette già presenti). Le ricette saranno private.`);
  }
  if (a.images) fs.mkdirSync(a.images, { recursive: true });

  const out = [];
  let ok = 0, skipped = 0, failed = 0;
  for (const [n, url] of urls.entries()) {
    const tag = `[${n + 1}/${urls.length}]`;
    try {
      if (!/^https?:\/\//.test(url)) throw new Error('indirizzo non valido');
      if (!await allowedByRobots(url)) { console.log(`${tag} saltata (robots.txt non lo permette): ${url}`); skipped++; continue; }
      const html = await getPage(url);
      const raw = findRecipe(html);
      if (!raw) throw new Error('nessuna ricetta schema.org nella pagina');
      const r = toSporta(raw, url);
      if (!r.steps.length) r.steps = stepsFromHtml(html).slice(0, 100);
      if (!r.name) throw new Error('ricetta senza nome');
      if (!a.duplicates && existing.has(S.foldText(r.name))) { console.log(`${tag} già presente: ${r.name}`); skipped++; await sleep(a.delay); continue; }

      const photos = [];
      if (a.images || a.push) {
        for (const [k, img] of r.image.slice(0, a.push ? a.photos : 1).entries()) {
          await sleep(a.delay / 2);
          try {
            const { mime, buf } = await getImage(new URL(img, url).href);
            if (a.images) {
              const file = path.join(a.images, `${S.foldText(r.name).replace(/[^a-z0-9]+/g, '-').slice(0, 60)}-${k + 1}${extOf(mime)}`);
              fs.writeFileSync(file, buf);
              r.image_files = [...(r.image_files || []), file];
            }
            if (a.push) {
              if (!PHOTO_TYPES.includes(mime)) { console.log(`   foto saltata (${mime || 'formato sconosciuto'})`); continue; }
              if (buf.length > MAX_PHOTO) { console.log(`   foto saltata (${Math.round(buf.length / 1024)} KB, oltre 3 MB)`); continue; }
              photos.push({ mime, data: buf.toString('base64') });
            }
          } catch (e) { console.log(`   foto non scaricata: ${e.message}`); }
        }
      }

      if (a.push) {
        const id = crypto.randomUUID();
        const ids = [];
        for (const p of photos) ids.push((await sporta(a.push, a.token, 'POST', '/api/photos', { ...p, recipe_id: id })).id);
        const { image, source, source_host, image_files, ...data } = r;
        await sporta(a.push, a.token, 'PUT', '/api/recipes/' + id, { ...data, photos: ids, visibility: 'private' });
        existing.add(S.foldText(r.name));
      }
      out.push(r);
      ok++;
      console.log(`${tag} ${r.name} · ${r.ingredients.length} ingredienti, ${r.steps.length} passaggi${a.push ? `, ${photos.length} foto` : ''}`);
    } catch (e) {
      failed++;
      console.log(`${tag} non riuscita (${e.message}): ${url}`);
    }
    if (n < urls.length - 1) await sleep(a.delay);
  }

  if (a.out) {
    fs.writeFileSync(a.out, JSON.stringify({ recipes: out.map(({ source, source_host, image_files, ...r }) => r) }, null, 2));
    console.log(`\nScritto ${a.out}: ${out.length} ricette (in Sporta: Altro → Importa ricette; le foto non si importano da file).`);
  }
  console.log(`\nFatto: ${ok} ${a.push ? 'caricate' : 'lette'}, ${skipped} saltate, ${failed} non riuscite.`);
}

if (require.main === module) main().catch((e) => { console.error('Errore:', e.message); process.exit(1); });
module.exports = { findRecipe, toSporta, parseRobots, matchRobots, minutesOf, ingredientOf, stepsFromHtml };
