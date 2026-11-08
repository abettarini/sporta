'use strict';
/* Modelli delle email di Sporta, in Liquid (LiquidJS, come il servizio di invio).
   Vengono caricati sul servizio con `npm run emails:sync` e usati per nome dal server
   (lib/mailer.js). L'HTML dei messaggi è avvolto nell'impaginazione comune `layout`.

   Nell'HTML `{{ variabile }}` è già protetto (escape automatico): i dati scritti dalle
   persone (nomi, messaggi) non possono inserire HTML. */

const BRAND = '#1f8a5b';

// Impaginazione comune: tabelle e stili in linea, per la compatibilità con i client di posta.
function layout(title, body) {
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f6f4;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#16201b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f4;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td style="padding:0 4px 14px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:36px;height:36px;background:${BRAND};border-radius:10px;text-align:center;vertical-align:middle;color:#ffffff;font-size:18px;font-weight:700;">S</td>
          <td style="padding-left:10px;font-size:18px;font-weight:700;color:#16201b;">Sporta</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:#ffffff;border-radius:16px;padding:28px 26px;box-shadow:0 1px 2px rgba(16,32,24,.06),0 4px 16px rgba(16,32,24,.06);font-size:16px;line-height:1.55;">
${body}
      </td></tr>
      <tr><td style="padding:16px 8px;font-size:12px;line-height:1.5;color:#66736c;text-align:center;">
        Hai ricevuto questa email perché il tuo indirizzo è stato indicato su Sporta, la lista della spesa condivisa.<br>
        Se non c'entri nulla, puoi ignorarla.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

const h1 = (t) => `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#16201b;">${t}</h1>`;
const p = (t) => `<p style="margin:0 0 14px;">${t}</p>`;
const muted = (t) => `<p style="margin:14px 0 0;font-size:13px;color:#66736c;">${t}</p>`;
const button = (href, label) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 6px;"><tr>
  <td style="background:${BRAND};border-radius:12px;"><a href="${href}" style="display:inline-block;padding:13px 22px;color:#ffffff;font-weight:700;text-decoration:none;font-size:16px;">${label}</a></td>
</tr></table>`;
const quote = (t) => `<p style="margin:0 0 14px;padding:10px 14px;background:#eef2ef;border-radius:10px;font-style:italic;">${t}</p>`;

const TEMPLATES = [
  {
    // Invito personale inviato da un amministratore.
    name: 'sporta-invite',
    variables: ['group', 'invited_by', 'link', 'expires_days'],
    subject: '{% if invited_by != blank %}{{ invited_by }} ti invita{% else %}Sei invitato{% endif %} in «{{ group }}» su Sporta',
    html: layout('Invito su Sporta',
      h1('Sei invitato in «{{ group }}»') +
      p('{% if invited_by != blank %}<b>{{ invited_by }}</b> ti ha invitato{% else %}Sei stato invitato{% endif %} nel gruppo <b>{{ group }}</b> su Sporta, la lista della spesa condivisa in tempo reale.') +
      p('Apri il link e scrivi il tuo nome: entrerai subito nel gruppo.') +
      button('{{ link }}', 'Entra nel gruppo') +
      muted('L\'invito vale per una persona e scade tra {{ expires_days }} giorni. Se il pulsante non funziona, copia questo indirizzo nel browser:<br><span style="word-break:break-all;">{{ link }}</span>')),
    text: `{% if invited_by != blank %}{{ invited_by }} ti ha invitato{% else %}Sei stato invitato{% endif %} nel gruppo "{{ group }}" su Sporta, la lista della spesa condivisa.

Apri il link e scrivi il tuo nome per entrare:
{{ link }}

L'invito vale per una persona e scade tra {{ expires_days }} giorni.`,
  },
  {
    // A ogni amministratore con email, quando qualcuno chiede di entrare.
    name: 'sporta-join-request',
    variables: ['group', 'alias', 'relation', 'message', 'link'],
    subject: '{{ alias }} chiede di entrare in «{{ group }}»',
    html: layout('Nuova richiesta di accesso',
      h1('{{ alias }} chiede di entrare') +
      p('<b>{{ alias }}</b>{% if relation != blank %} ({{ relation | capitalize }}){% endif %} vorrebbe entrare nel gruppo <b>{{ group }}</b>.') +
      '{% if message != blank %}' + quote('“{{ message }}”') + '{% endif %}' +
      p('Puoi accettare la richiesta, scegliendo relazione e permessi, oppure rifiutarla.') +
      button('{{ link }}', 'Vedi la richiesta') +
      muted('Ricevi questa email perché sei amministratore di «{{ group }}».')),
    text: `{{ alias }}{% if relation != blank %} ({{ relation | capitalize }}){% endif %} vorrebbe entrare nel gruppo "{{ group }}".
{% if message != blank %}
Messaggio: "{{ message }}"
{% endif %}
Apri Sporta per accettare o rifiutare la richiesta:
{{ link }}`,
  },
  {
    name: 'sporta-request-approved',
    variables: ['group', 'link'],
    subject: 'Benvenuto in «{{ group }}»',
    html: layout('Richiesta accettata',
      h1('Sei dentro!') +
      p('La tua richiesta di entrare in <b>{{ group }}</b> è stata accettata. Apri Sporta per vedere le liste del gruppo.') +
      button('{{ link }}', 'Apri Sporta')),
    text: `La tua richiesta di entrare in "{{ group }}" è stata accettata.
Apri Sporta: {{ link }}`,
  },
  {
    name: 'sporta-request-rejected',
    variables: ['group'],
    subject: 'La tua richiesta per «{{ group }}»',
    html: layout('Richiesta non accettata',
      h1('Richiesta non accettata') +
      p('La tua richiesta di entrare nel gruppo <b>{{ group }}</b> non è stata accettata.') +
      p('Se pensi che sia un errore, chiedi a chi ti ha invitato di mandarti un link personale.')),
    text: `La tua richiesta di entrare nel gruppo "{{ group }}" non è stata accettata.
Se pensi che sia un errore, chiedi a chi ti ha invitato di mandarti un link personale.`,
  },
  {
    // Recupero dell'accesso: un link per ogni gruppo in cui l'email è registrata.
    name: 'sporta-recovery',
    variables: ['groups', 'expires_hours'],
    subject: 'Il tuo accesso a Sporta',
    html: layout('Recupera l\'accesso',
      h1('Collega questo dispositivo') +
      p('Hai chiesto di recuperare l\'accesso a Sporta. Apri il link del gruppo che vuoi collegare, dal telefono o dal computer che stai usando:') +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 10px;">{% for g in groups %}' +
      '<tr><td style="padding:10px 0;border-top:1px solid #dde4df;"><b>{{ g.group }}</b><br><span style="font-size:14px;color:#66736c;">come {{ g.alias }}</span></td>' +
      `<td align="right" style="padding:10px 0;border-top:1px solid #dde4df;"><a href="{{ g.link }}" style="display:inline-block;padding:9px 14px;background:${BRAND};border-radius:10px;color:#ffffff;font-weight:700;text-decoration:none;font-size:14px;">Collega</a></td></tr>` +
      '{% endfor %}</table>' +
      muted('I link valgono {{ expires_hours }} ore e si possono usare una volta sola. Se non hai chiesto tu il recupero, ignora questa email: senza i link nessuno può entrare.')),
    text: `Hai chiesto di recuperare l'accesso a Sporta. Apri il link del gruppo che vuoi collegare:
{% for g in groups %}
- {{ g.group }} (come {{ g.alias }}): {{ g.link }}
{% endfor %}
I link valgono {{ expires_hours }} ore e si possono usare una volta sola.
Se non hai chiesto tu il recupero, ignora questa email.`,
  },
];

// Dati di esempio per l'anteprima (npm run emails:preview).
const SAMPLES = {
  'sporta-invite': { group: 'Casa Rossi', invited_by: 'Marco', link: 'https://sporta.example.it/?invite=abc123', expires_days: 7 },
  'sporta-join-request': { group: 'Casa Rossi', alias: 'Luca', relation: 'amico', message: 'Ciao, sono il cugino di Giulia', link: 'https://sporta.example.it/#/m' },
  'sporta-request-approved': { group: 'Casa Rossi', link: 'https://sporta.example.it/' },
  'sporta-request-rejected': { group: 'Casa Rossi' },
  'sporta-recovery': {
    groups: [
      { group: 'Casa Rossi', alias: 'Luca', link: 'https://sporta.example.it/?link=aaa' },
      { group: 'Calcetto del giovedì', alias: 'Luca B.', link: 'https://sporta.example.it/?link=bbb' },
    ],
    expires_hours: 24,
  },
};

module.exports = { TEMPLATES, SAMPLES };
