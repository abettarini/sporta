'use strict';
/* Invio delle email tramite inboundemail / Procmail (API REST con modelli Liquid).

   Si attiva con le variabili d'ambiente; senza, l'app funziona e non invia email.
     EMAIL_API_KEY   chiave API di Procmail (riservata)            — obbligatoria
     EMAIL_FROM      mittente, su un dominio verificato per l'invio — obbligatoria (es. "Sporta <noreply@…>")
     APP_URL         indirizzo pubblico dell'app, per i link          — obbligatoria
     EMAIL_API_URL   base dell'API (default https://api-eu.procmail.sh)

   I modelli (emails/templates.js) si caricano sul servizio con `npm run emails:sync` e qui
   vengono cercati per nome ("sporta-invite", …). Invio: POST /v1/emails con template_id e
   variables (risposta 202, l'invio prosegue in background sul servizio). */

const { TEMPLATES } = require('../emails/templates');

const NAMES = {
  invite: 'sporta-invite',
  join_request: 'sporta-join-request',
  request_approved: 'sporta-request-approved',
  request_rejected: 'sporta-request-rejected',
  recovery: 'sporta-recovery',
};

function createMailer(env = process.env) {
  const base = (env.EMAIL_API_URL || 'https://api-eu.procmail.sh').replace(/\/+$/, '').replace(/\/v1$/, '');
  const key = env.EMAIL_API_KEY || '';
  const from = env.EMAIL_FROM || '';
  const appUrl = (env.APP_URL || '').replace(/\/$/, '');
  const enabled = !!(key && from && appUrl);
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };

  // Identificativi dei modelli sul servizio, letti una volta (e riletti se un modello manca).
  let ids = null;
  async function templateId(name, refresh = false) {
    if (!ids || refresh) {
      const res = await fetch(base + '/v1/email-templates', { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`elenco modelli: ${res.status}`);
      const list = await res.json();
      ids = new Map((Array.isArray(list) ? list : list.data || list.templates || []).map((t) => [t.name, t.id]));
    }
    return ids.get(name) || (!refresh ? templateId(name, true) : null);
  }

  async function send(kind, to, variables) {
    if (!enabled || !to) return false;
    const name = NAMES[kind];
    if (!name) throw new Error('Modello email sconosciuto: ' + kind);
    try {
      const id = await templateId(name);
      if (!id) { console.error(`email "${name}": modello non trovato sul servizio (esegui npm run emails:sync)`); return false; }
      const res = await fetch(base + '/v1/emails', {
        method: 'POST', headers, signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ from, to: [to], template_id: id, variables }),
      });
      if (res.status === 422) ids = null; // modello cambiato: rileggo l'elenco la prossima volta
      if (!res.ok) { console.error(`email "${name}" non inviata: ${res.status} ${await res.text().catch(() => '')}`); return false; }
      return true;
    } catch (e) {
      console.error(`email "${name}" non inviata:`, e.message);
      return false;
    }
  }

  return { enabled, send, link: (path) => appUrl + path };
}

module.exports = { createMailer, NAMES, TEMPLATES };
