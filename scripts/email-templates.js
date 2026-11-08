'use strict';
/* Modelli email di Sporta.
     node scripts/email-templates.js preview   -> controlla la sintassi Liquid e genera le anteprime
                                                   in emails/preview/ (con i dati di esempio)
     node scripts/email-templates.js sync      -> crea o aggiorna i modelli sul servizio (per nome)
   Per "sync" servono EMAIL_API_KEY ed eventualmente EMAIL_API_URL (default https://api-eu.procmail.sh). */

const fs = require('node:fs');
const path = require('node:path');
const { TEMPLATES, SAMPLES } = require('../emails/templates');

async function preview() {
  let Liquid;
  try { ({ Liquid } = require('liquidjs')); } catch { console.error('Per l\'anteprima serve liquidjs: npm install'); process.exit(1); }
  // Stesse impostazioni del servizio: escape automatico, variabili mancanti = vuote.
  const engine = new Liquid({ outputEscape: 'escape', strictVariables: false });
  const out = path.join(__dirname, '..', 'emails', 'preview');
  fs.mkdirSync(out, { recursive: true });
  const index = [];
  for (const t of TEMPLATES) {
    const vars = SAMPLES[t.name] || {};
    const plain = new Liquid({ strictVariables: false }); // oggetto e testo: senza escape HTML
    const subject = await plain.parseAndRender(t.subject, vars);
    const html = await engine.parseAndRender(t.html, vars);
    const text = await plain.parseAndRender(t.text, vars);
    fs.writeFileSync(path.join(out, t.name + '.html'), html);
    fs.writeFileSync(path.join(out, t.name + '.txt'), `Oggetto: ${subject}\n\n${text}\n`);
    index.push(`<li><a href="${t.name}.html">${t.name}</a> — ${subject.replace(/</g, '&lt;')} (<a href="${t.name}.txt">testo</a>)</li>`);
    console.log(`ok  ${t.name.padEnd(26)} ${subject}`);
  }
  fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Email Sporta</title><ul>${index.join('')}</ul>`);
  console.log('Anteprime in', out);
}

async function sync() {
  const key = process.env.EMAIL_API_KEY;
  const base = (process.env.EMAIL_API_URL || 'https://api-eu.procmail.sh').replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1';
  if (!key) { console.error('Imposta EMAIL_API_KEY'); process.exit(1); }
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key };
  const call = async (method, url, body) => {
    const r = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { j = t; }
    if (!r.ok) throw new Error(`${method} ${url}: ${r.status} ${typeof j === 'string' ? j : JSON.stringify(j)}`);
    return j;
  };
  const list = await call('GET', '/email-templates');
  const existing = new Map((Array.isArray(list) ? list : list.data || list.templates || []).map((t) => [t.name, t.id]));
  for (const t of TEMPLATES) {
    const body = { name: t.name, subject: t.subject, html: t.html, text: t.text };
    if (existing.has(t.name)) {
      await call('PATCH', `/email-templates/${existing.get(t.name)}`, { subject: t.subject, html: t.html, text: t.text });
      console.log('aggiornato', t.name, existing.get(t.name));
    } else {
      const c = await call('POST', '/email-templates', body);
      console.log('creato    ', t.name, c.id);
    }
  }
}

const cmd = process.argv[2];
(cmd === 'sync' ? sync : cmd === 'preview' ? preview : () => { console.log('Uso: node scripts/email-templates.js preview|sync'); })()
  .catch((e) => { console.error(e.message); process.exit(1); });
