'use strict';
/* Invio delle email tramite un'API esterna a modelli (template).

   Si attiva impostando le variabili d'ambiente; senza, l'app funziona e non invia email.
     EMAIL_API_URL      endpoint che riceve le richieste di invio (POST JSON)
     EMAIL_API_KEY      chiave dell'API (riservata)
     EMAIL_API_HEADER   header della chiave (default "Authorization", con prefisso "Bearer ")
     EMAIL_FROM         mittente (facoltativo, se l'API lo richiede)
     APP_URL            indirizzo pubblico dell'app, per i link nelle email (es. https://sporta.example.it)
     EMAIL_TEMPLATE_<NOME>  identificativo del modello nell'API, se diverso dal nome interno
                            (es. EMAIL_TEMPLATE_INVITE=sporta-invito)

   Corpo inviato all'API (adattare `buildRequest` se il formato della vostra API è diverso):
     { "template": "<id modello>", "to": "<email>", "from": "<mittente>", "language": "it",
       "variables": { ... } }

   Modelli usati e variabili:
     invite            group, invited_by, link, expires_days
     join_request      group, alias, relation, message, link        (agli amministratori)
     request_approved  group, link
     request_rejected  group
     recovery          groups: [{ group, alias, link }], expires_hours */

const TEMPLATES = ['invite', 'join_request', 'request_approved', 'request_rejected', 'recovery'];

function createMailer(env = process.env) {
  const url = env.EMAIL_API_URL || '';
  const key = env.EMAIL_API_KEY || '';
  const appUrl = (env.APP_URL || '').replace(/\/$/, '');
  const enabled = !!(url && key && appUrl);
  const header = env.EMAIL_API_HEADER || 'Authorization';
  const templateId = (name) => env['EMAIL_TEMPLATE_' + name.toUpperCase()] || name;

  function buildRequest(template, to, variables) {
    return {
      headers: { 'Content-Type': 'application/json', [header]: header.toLowerCase() === 'authorization' ? `Bearer ${key}` : key },
      body: { template: templateId(template), to, from: env.EMAIL_FROM || undefined, language: 'it', variables },
    };
  }

  async function send(template, to, variables) {
    if (!enabled || !to) return false;
    if (!TEMPLATES.includes(template)) throw new Error('Modello email sconosciuto: ' + template);
    const { headers, body } = buildRequest(template, to, variables);
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
      if (!res.ok) { console.error(`email "${template}" non inviata: ${res.status} ${await res.text().catch(() => '')}`); return false; }
      return true;
    } catch (e) {
      console.error(`email "${template}" non inviata:`, e.message);
      return false;
    }
  }

  return { enabled, send, link: (path) => appUrl + path };
}

module.exports = { createMailer, TEMPLATES };
