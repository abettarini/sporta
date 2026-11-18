#!/usr/bin/env node
'use strict';
/* Scarica i loghi delle catene di scripts/chains/chains.txt in public/chains/ e scrive
   public/chains/chains.json (elenco usato dall'app).
   Fonti: Wikimedia Commons (SVG; con la licenza indicata dalla pagina del file), altrimenti
   l'icona del sito della catena (servizio favicon di Google). Senza nessuno dei due l'app
   mostra l'iniziale.
   I loghi sono marchi dei rispettivi titolari: vanno usati solo per indicare il negozio della carta.

   Uso: NODE_USE_ENV_PROXY=1 node scripts/chains/fetch-logos.js [id …] [--solo-icone]
   Per scegliere a mano un file di Commons: quinta colonna "File:Nome.svg" in chains.txt.
   Per non mostrare un logo: quinta colonna "-". */

const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', '..', 'public', 'chains');
const UA = { 'User-Agent': 'SportaChainLogos/1.0 (loyalty card picker)' };
const args = process.argv.slice(2);
const only = new Set(args.filter((a) => !a.startsWith('--')));
const iconsOnly = args.includes('--solo-icone');

const rows = fs.readFileSync(path.join(__dirname, 'chains.txt'), 'utf8').split('\n')
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => { const [id, name, kind, site, query] = l.split('|').map((s) => s.trim()); return { id, name, kind, site, query: query || '' }; });

const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// SVG da usare come <img>: niente script, eventi, oggetti esterni.
function cleanSvg(s) {
  return s.replace(/<\?xml[^>]*>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/(xlink:)?href\s*=\s*("|')(?!#|data:image\/)[^"']*\2/gi, '').trim();
}

// File di Commons scaricati direttamente da upload.wikimedia.org (l'API di ricerca limita molto i
// client senza recapito): si provano i nomi più comuni dei file dei loghi, o quello indicato.
const crypto = require('node:crypto');
function commonsUrl(file) {
  const f = file.replace(/^File:/, '').replace(/ /g, '_');
  const name = f.charAt(0).toUpperCase() + f.slice(1);
  const md5 = crypto.createHash('md5').update(name).digest('hex');
  return { url: `https://upload.wikimedia.org/wikipedia/commons/${md5[0]}/${md5.slice(0, 2)}/${encodeURIComponent(name)}`, page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name)}` };
}
function candidates(c) {
  if (c.query.startsWith('File:')) return [c.query];
  const names = [...new Set([c.query.replace(/ logo$/i, ''), c.name.replace(/ · .*/, ''), c.name.replace(/ · .*/, '').toUpperCase()].filter(Boolean))];
  const out = [];
  for (const n of names) out.push(`${n} logo.svg`, `${n}-Logo.svg`, `${n} Logo.svg`, `Logo ${n}.svg`, `${n}-logo.svg`, `${n}.svg`, `Logo_${n}.svg`, `${n} logo 2020.svg`, `${n} (logo).svg`);
  return [...new Set(out)];
}
async function commons(c) {
  if (c.query === '-') return null;
  for (const file of candidates(c)) {
    const { url, page } = commonsUrl(file);
    const r = await fetch(url, { headers: UA });
    await sleep(250);
    if (r.status === 404) continue;
    if (!r.ok) { console.error(c.id, file, r.status); continue; }
    const svg = cleanSvg(await r.text());
    if (!/^<svg[\s>]/i.test(svg) || svg.length > 300000) continue;
    return { file: `${c.id}.svg`, data: svg, source: page, license: 'Wikimedia Commons' };
  }
  return null;
}

async function favicon(c) {
  const url = `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=256&url=${encodeURIComponent('https://www.' + c.site)}`;
  const r = await fetch(url, { headers: UA });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  // PNG di almeno 64 px (le icone più piccole si vedono sgranate: meglio l'iniziale)
  if (buf.slice(1, 4).toString() !== 'PNG') return null;
  const w = buf.readUInt32BE(16);
  if (w < 64) return null;
  return { file: `${c.id}.png`, data: buf, source: `https://www.${c.site}`, license: 'icona del sito' };
}

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const outFile = path.join(DIR, 'chains.json');
  const prev = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : [];
  const byId = new Map(prev.map((x) => [x.id, x]));
  const save = () => fs.writeFileSync(outFile, JSON.stringify(rows.map((c) => byId.get(c.id) || { id: c.id, name: c.name, kind: c.kind, site: c.site }), null, 1) + '\n');
  for (const c of rows) {
    const entry = { id: c.id, name: c.name, kind: c.kind, site: c.site };
    if (only.size && !only.has(c.id)) { byId.set(c.id, { ...(byId.get(c.id) || {}), ...entry }); continue; }
    let logo = null;
    try { if (!iconsOnly) logo = await commons(c); } catch (e) { console.error(c.id, 'commons:', e.message); }
    try { if (!logo && c.query !== '-') logo = await favicon(c); } catch (e) { console.error(c.id, 'icona:', e.message); }
    for (const ext of ['svg', 'png']) { const f = path.join(DIR, `${c.id}.${ext}`); if (fs.existsSync(f) && (!logo || logo.file !== `${c.id}.${ext}`)) fs.unlinkSync(f); }
    if (logo) {
      fs.writeFileSync(path.join(DIR, logo.file), logo.data);
      Object.assign(entry, { logo: logo.file, source: logo.source, license: logo.license });
    }
    byId.set(c.id, entry);
    save();
    console.log(`${c.id.padEnd(16)} ${logo ? `${logo.file.padEnd(20)} ${logo.license}` : '— (iniziale)'}`);
  }
  save();
  const out = rows.map((c) => byId.get(c.id));
  console.log(`${out.filter((x) => x.logo).length}/${out.length} con logo`);
})();
