'use strict';
/* Sporta — account della persona (email verificata con un codice): chiave del dispositivo,
   accesso con codice o link, gruppi ritrovati su ogni dispositivo, condizioni d'uso,
   pagina "Il tuo account" (email, dispositivi, i miei dati, eliminazione) e passaggio
   per chi usava Sporta prima degli account. */

// { token, email, terms_ok } — la chiave "a_…" dell'account su questo dispositivo.
let acct = ls.json('account', null);
const saveAcct = () => ls.setJson('account', acct);
const CONFIRM_GRACE_DAYS = 14;

// Chiamate con la chiave dell'account del dispositivo.
async function accountApi(method, url, body) {
  let r;
  try {
    r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (acct && acct.token) }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error('Serve la connessione a internet'); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && j.code === 'logged_out') { forgetDevice(); throw new Error(j.error); }
  if (!r.ok) { const e = new Error(j.error || 'Operazione non riuscita'); e.code = j.code; throw e; }
  return j;
}

// Chiavi di gruppo già presenti sul dispositivo (si collegano all'account al primo accesso).
const memberTokens = () => st.groups.map((g) => g.token).filter((t) => t && t.startsWith('m_'));

// --------------------------------------------------------------- protezione anti-abuso (ALTCHA)
// Prima di chiedere un codice il browser risolve una piccola prova di lavoro (in background,
// di solito meno di un secondo). La prepariamo appena si apre un campo email, così è già pronta.
let proof = null; // { promise, at }
function solveProof(c) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker('/js/altcha-worker.js'); } catch (e) { reject(e); return; }
    w.onmessage = (e) => { w.terminate(); e.data.number == null ? reject(new Error('Verifica non riuscita')) : resolve(e.data.number); };
    w.onerror = (e) => { w.terminate(); reject(e); };
    w.postMessage(c);
  });
}
function prepareProof() {
  if (proof && Date.now() - proof.at < 8 * 60e3) return proof.promise;
  const p = (async () => {
    const r = await fetch('/api/auth/challenge');
    if (!r.ok) throw new Error('Serve la connessione a internet');
    const c = await r.json();
    const number = await solveProof(c);
    return btoa(JSON.stringify({ algorithm: c.algorithm, challenge: c.challenge, number, salt: c.salt, signature: c.signature }));
  })();
  proof = { promise: p, at: Date.now() };
  p.catch(() => { if (proof && proof.promise === p) proof = null; });
  return p;
}
// Ogni prova vale una volta sola.
async function takeProof() {
  const p = prepareProof();
  proof = null;
  return p;
}
// Invia con la prova; se è scaduta o già usata ne prepara un'altra e riprova una volta.
async function withProof(send) {
  try { return await send(await takeProof()); }
  catch (e) { if (e.code !== 'bad_proof') throw e; return send(await takeProof()); }
}

async function requestCode(email) {
  return withProof((altcha) => publicApi('POST', '/api/auth/code', { email, altcha }));
}
// Verifica del codice (o del link dell'email): salva l'account e aggiunge i gruppi trovati.
async function verifyLogin(payload) {
  const res = await publicApi('POST', '/api/auth/verify', { ...payload, member_tokens: memberTokens() });
  setAccount(res);
  return res;
}
function setAccount(res) {
  acct = { token: res.account_token || (acct && acct.token), email: res.account.email, terms_ok: res.account.terms_ok };
  saveAcct();
  ls.set('confirmSince', null);
}

// Aggiunge al dispositivo i gruppi dell'account che non ha ancora (senza cambiare gruppo attivo).
function adoptGroups(groups) {
  let added = 0;
  for (const x of groups || []) {
    let g = st.groups.find((y) => y.hid === x.household.id);
    if (g && g.token) { Object.assign(g, { memberId: x.me.id, role: x.me.role, status: x.me.status, alias: x.me.alias, name: x.household.name }); continue; }
    if (!g) { g = { code: x.household.code }; st.groups.push(g); added++; }
    Object.assign(g, { hid: x.household.id, name: x.household.name, token: x.token, alias: x.me.alias, memberId: x.me.id, role: x.me.role, status: x.me.status });
  }
  saveGroups();
  if (!st.code && st.groups.length) {
    st.code = st.groups[0].code;
    ls.set('active', st.code);
    st.member = memberFor(st.code);
    loadGroupFromCache();
    connect();
  }
  if (added && typeof refreshOverview === 'function') { refreshOverview(true); if (typeof syncPush === 'function') syncPush(); }
  return added;
}

// Allinea il dispositivo con l'account: email, condizioni, gruppi in cui si è entrati altrove.
let accountSyncAt = 0;
async function syncAccount(force) {
  if (!acct || !navigator.onLine || (!force && Date.now() - accountSyncAt < 5 * 60e3)) return;
  accountSyncAt = Date.now();
  try {
    const j = await accountApi('GET', '/api/account');
    const termsBefore = acct.terms_ok;
    Object.assign(acct, { email: j.account.email, terms_ok: j.account.terms_ok });
    saveAcct();
    const missing = j.groups.filter((x) => !st.groups.some((g) => g.hid === x.household.id && g.token));
    if (missing.length) {
      const r = await accountApi('POST', '/api/account/groups', { member_ids: missing.map((x) => x.me.id) });
      const n = adoptGroups(r.groups);
      if (n) toast(n === 1 ? `Nuovo gruppo su questo dispositivo: ${r.groups[0].household.name}` : `${n} nuovi gruppi su questo dispositivo`);
      mount();
    } else if (termsBefore !== acct.terms_ok) mount();
  } catch { /* offline o uscito */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncAccount(); });

// Uscita da questo dispositivo: via tutti i dati locali.
function forgetDevice() {
  // Niente più scritture sul dispositivo (cache, coda) mentre si cancella tutto.
  clearTimeout(cacheTimer); cacheTimer = null;
  st.code = null; st.outbox = [];
  if (rt) { rt.close(); rt = null; }
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('spesa.') && k !== 'spesa.config') localStorage.removeItem(k);
  } catch { /* */ }
  location.replace('/');
}

// --------------------------------------------------------------- passaggio (chi usava già Sporta)
// Prima si può rimandare; dopo CONFIRM_GRACE_DAYS la conferma è necessaria.
function confirmState() {
  if (acct || !st.groups.length) return null;
  let since = Number(ls.get('confirmSince')) || 0;
  if (!since) { since = Date.now(); ls.set('confirmSince', String(since)); }
  const left = CONFIRM_GRACE_DAYS - Math.floor((Date.now() - since) / 864e5);
  return { left: Math.max(0, left), overdue: left <= 0 };
}
let confirmAsked = false;
function maybeAskConfirm() {
  const c = confirmState();
  if (!c || c.overdue || confirmAsked || sheetOpen) return;
  confirmAsked = true;
  confirmEmailSheet({ later: c.left });
}

// Email già scritta in uno dei gruppi (dalla cache), da proporre.
function knownEmail() {
  for (const g of st.groups) { const c = ls.json('cache.' + g.code, null); if (c && c.me && c.me.email) return c.me.email; }
  return '';
}

// Riquadro "email + codice" riusabile (pannello o pagina). onDone(res) dopo la verifica.
function emailCodeFlow(box, { intro = '', email = '', later = null, onDone, onLater, submitLabel = 'Invia il codice', terms = false } = {}) {
  const askEmail = (msg = '') => {
    prepareProof().catch(() => {});
    box.innerHTML = `${intro}
      <form class="ec-f"><label class="field"><span>La tua email</span><input class="input" name="email" type="email" inputmode="email" autocomplete="email" required placeholder="nome@esempio.it" value="${h(email)}"></label>
      ${terms ? termsCheckHtml() : ''}
      <p class="err">${h(msg)}</p><button class="btn primary block lg">${h(submitLabel)}</button></form>
      ${later != null ? `<button class="btn ghost block" data-later>${later > 0 ? `Più tardi · ancora ${later} ${later === 1 ? 'giorno' : 'giorni'}` : 'Più tardi'}</button>` : ''}`;
    const f = box.querySelector('.ec-f');
    if (terms) bindTermsCheck(f);
    const l = box.querySelector('[data-later]'); if (l) l.onclick = () => onLater && onLater();
    f.onsubmit = async (e) => {
      e.preventDefault();
      email = f.elements.email.value.trim();
      const btn = f.querySelector('button.primary'); btn.disabled = true;
      try { await requestCode(email); askCode(); }
      catch (x) { f.querySelector('.err').textContent = x.message; btn.disabled = false; }
    };
  };
  const askCode = () => {
    box.innerHTML = codeStepHtml(email);
    bindCodeStep(box, email, { onBack: () => askEmail(), onDone: async (code) => onDone(await verifyLogin({ email, code })) });
  };
  askEmail();
  return { askCode: (e) => { email = e; askCode(); } };
}

// Passo "codice": sei caselle, incolla automatico, reinvio dopo 60 secondi.
function codeStepHtml(email) {
  return `<div class="center"><div class="big-ico">${I.mail}</div><h2>Controlla la posta</h2>
    <p class="muted">Abbiamo mandato un codice a<br><b class="ink">${h(email)}</b></p></div>
    <form class="otp-f"><label class="otp"><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" aria-label="Codice di 6 cifre">
      <span class="otp-boxes">${'<i></i>'.repeat(6)}</span></label>
    <p class="err center"></p>
    <button class="btn primary block lg" disabled>Entra</button></form>
    <p class="hint center">Oppure tocca <b>Entra in Sporta</b> nell'email, da questo dispositivo. Non la trovi? Guarda nella posta indesiderata.</p>
    <div class="actions center-actions"><button type="button" class="btn" data-resend disabled>Reinvia</button><button type="button" class="btn" data-back>Cambia email</button></div>`;
}
function bindCodeStep(box, email, { onBack, onDone }) {
  const f = box.querySelector('.otp-f'), input = f.elements.code, btn = f.querySelector('button.primary');
  const boxes = [...box.querySelectorAll('.otp-boxes i')];
  const err = f.querySelector('.err');
  const paint = () => {
    const v = input.value;
    boxes.forEach((b, k) => { b.textContent = v[k] || ''; b.classList.toggle('cur', k === Math.min(v.length, 5) && document.activeElement === input); });
  };
  let busy = false;
  const submit = async () => {
    if (busy || input.value.length !== 6) return;
    busy = true; btn.disabled = true; err.textContent = '';
    try { await onDone(input.value); }
    catch (x) { err.textContent = x.message; input.value = ''; paint(); input.focus(); btn.disabled = true; }
    busy = false;
  };
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); btn.disabled = input.value.length !== 6; paint(); if (input.value.length === 6) submit(); });
  input.addEventListener('focus', paint); input.addEventListener('blur', paint);
  f.onsubmit = (e) => { e.preventDefault(); submit(); };
  setTimeout(() => input.focus(), 60);
  paint();
  const resend = box.querySelector('[data-resend]');
  let left = 60;
  const tick = () => {
    if (!resend.isConnected) return;
    resend.disabled = left > 0;
    resend.textContent = left > 0 ? `Reinvia tra ${left} s` : 'Reinvia il codice';
    if (left-- > 0) setTimeout(tick, 1000);
  };
  tick();
  resend.onclick = async () => {
    try { await requestCode(email); toast('Nuovo codice inviato'); left = 60; tick(); } catch (x) { err.textContent = x.message; }
  };
  box.querySelector('[data-back]').onclick = onBack;
}

// Casella delle condizioni (età minima inclusa): finché non è spuntata il pulsante resta spento.
function termsCheckHtml() {
  return `<label class="consent"><input type="checkbox" name="terms" required>
    <span>Ho almeno 14 anni e accetto le <a href="/termini.html" target="_blank" rel="noopener">condizioni d'uso</a>; ho letto l'<a href="/privacy.html" target="_blank" rel="noopener">informativa sulla privacy</a></span></label>`;
}
function bindTermsCheck(form) {
  const c = form.elements.terms, btn = form.querySelector('button.primary');
  if (!c || !btn) return;
  const sync = () => { btn.disabled = !c.checked; };
  c.addEventListener('change', sync);
  sync();
}
const termsAccepted = (form) => !!(form.elements.terms && form.elements.terms.checked);
const needTerms = () => !acct || !acct.terms_ok;

function confirmEmailSheet({ later } = {}) {
  openSheet(`<div id="ce"></div>`, (sh) => {
    emailCodeFlow($('#ce', sh), {
      intro: `<h2>Conferma la tua email</h2><p class="muted">Da ora Sporta ti riconosce dalla tua email: ritrovi tutti i tuoi gruppi su ogni dispositivo e non perdi l'accesso se cambi telefono.</p>`,
      email: knownEmail(), later, terms: true,
      onLater: () => closeSheet(),
      onDone: async (res) => {
        if (!res.account.terms_ok) await accountApi('POST', '/api/account/accept', { accept_terms: true }).then((j) => { acct.terms_ok = j.account.terms_ok; saveAcct(); });
        adoptGroups(res.groups);
        closeSheet();
        toast('Email confermata: i tuoi gruppi sono collegati al tuo account');
        mount();
      },
    });
  });
}

// Conferma obbligatoria (finito il periodo per rimandare).
Views.confirmEmail = {
  mount() {
    app.innerHTML = `<div class="welcome"><div id="ce"></div></div>`;
    emailCodeFlow($('#ce'), {
      intro: `<img class="logo" src="/icons/icon-192.png" alt=""><h2>Conferma la tua email per continuare</h2>
        <p class="muted">Sporta ora riconosce le persone dalla loro email. Le tue liste sono al sicuro su questo dispositivo: dopo la conferma ritrovi tutto.</p>`,
      email: knownEmail(), terms: true,
      onDone: async (res) => {
        if (!res.account.terms_ok) { const j = await accountApi('POST', '/api/account/accept', { accept_terms: true }); acct.terms_ok = j.account.terms_ok; saveAcct(); }
        adoptGroups(res.groups);
        history.replaceState(null, '', '/#/');
        mount();
      },
    });
  },
};

// Nuova versione delle condizioni: si accettano prima di continuare.
Views.terms = {
  mount() {
    app.innerHTML = `<div class="welcome">
      <div class="center"><div class="big-ico">${icon('note')}</div><h2>Abbiamo aggiornato le condizioni</h2>
      <p class="muted">Per continuare a usare Sporta leggi e accetta le nuove condizioni d'uso e l'informativa sulla privacy.</p></div>
      <div class="actions"><a class="btn" href="/termini.html" target="_blank" rel="noopener">Condizioni d'uso</a><a class="btn" href="/privacy.html" target="_blank" rel="noopener">Privacy</a></div>
      <form id="tf">${termsCheckHtml()}<p class="err"></p><button class="btn primary block lg">Continua</button></form>
      <button class="btn ghost block danger-text" id="t-del">Non accetto: elimina il mio account</button></div>`;
    const f = $('#tf');
    bindTermsCheck(f);
    f.onsubmit = async (e) => {
      e.preventDefault();
      try { const j = await accountApi('POST', '/api/account/accept', { accept_terms: true }); acct.terms_ok = j.account.terms_ok; saveAcct(); mount(); }
      catch (x) { f.querySelector('.err').textContent = x.message; }
    };
    $('#t-del').onclick = () => deleteAccount();
  },
};

// --------------------------------------------------------------- Il tuo account
Views.account = {
  mount() {
    if (!acct) { history.replaceState(null, '', '#/s'); return mount(); }
    app.innerHTML = topBar('Il tuo account', { back: '#/s' }) + `<main class="settings wide">
      <div class="card"><h3>Email</h3>
        <div class="acc-email"><b>${h(acct.email)} <span class="ok-mark">✓</span></b><button class="btn" id="a-mail">Cambia</button></div>
        <p class="hint">La usi per entrare in Sporta su ogni dispositivo. Gli amministratori dei tuoi gruppi la vedono.</p></div>
      <div class="card"><h3>Dispositivi</h3><div id="a-devs" class="items"><p class="muted">Caricamento…</p></div>
        <div class="actions"><button class="btn" id="a-others">Esci da tutti gli altri</button></div>
        <button class="btn block" id="a-out">Esci da questo dispositivo</button></div>
      <div class="card"><h3>I tuoi dati</h3>
        <p>Puoi scaricare una copia dei tuoi dati o eliminare il tuo account: uscirai da tutti i gruppi e la tua email verrà cancellata. Ciò che hai scritto nelle liste resta nei gruppi con il tuo nome.</p>
        <div class="actions"><button class="btn" id="a-exp">Scarica i miei dati</button><button class="btn danger" id="a-del">Elimina il mio account</button></div>
        <p class="hint"><a href="/termini.html" target="_blank" rel="noopener">Condizioni d'uso</a> · <a href="/privacy.html" target="_blank" rel="noopener">Informativa sulla privacy</a></p></div>
    </main>` + tabBar('settings');
    $('#a-mail').onclick = () => changeEmailSheet();
    $('#a-others').onclick = async () => {
      if (!confirm('Uscire da tutti gli altri dispositivi? Resterà collegato solo questo.')) return;
      try { await accountApi('POST', '/api/account/devices/revoke-others', {}); toast('Sei uscito dagli altri dispositivi'); this.update(); } catch (x) { toast(x.message); }
    };
    $('#a-out').onclick = async () => {
      if (!confirm('Uscire da questo dispositivo? Le liste restano nei gruppi: per ritrovarle basta entrare di nuovo con la tua email.')) return;
      try { await accountApi('POST', '/api/account/logout', {}); } catch { /* già uscito */ }
      forgetDevice();
    };
    $('#a-exp').onclick = async () => {
      try {
        const j = await accountApi('GET', '/api/account/export');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' }));
        a.download = 'sporta-i-miei-dati.json';
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      } catch (x) { toast(x.message); }
    };
    $('#a-del').onclick = () => deleteAccount();
    $('#a-devs').onclick = async (e) => {
      const b = e.target.closest('[data-revoke]'); if (!b) return;
      try { await accountApi('POST', `/api/account/devices/${encodeURIComponent(b.dataset.revoke)}/revoke`, {}); toast('Dispositivo scollegato'); this.update(); } catch (x) { toast(x.message); }
    };
    this.update();
  },
  async update() {
    const box = $('#a-devs'); if (!box) return;
    try {
      const j = await accountApi('GET', '/api/account');
      if (!$('#a-devs')) return;
      box.innerHTML = j.devices.sort((x, y) => y.current - x.current).map((d) => `<div class="row-btn dev-row"><span class="t">${h(d.current ? 'Questo dispositivo' : d.label)}<small class="as">${h(d.current ? d.label : '')}${d.current ? '' : 'ultimo uso ' + h(fmtAgo(d.last_seen))}</small></span>
        ${d.current ? '' : `<button class="btn ghost danger-text" data-revoke="${h(d.id)}">Esci</button>`}</div>`).join('');
      $('#a-others').disabled = j.devices.length < 2;
    } catch { box.innerHTML = '<p class="muted">Serve la connessione per vedere i dispositivi.</p>'; }
  },
};

function changeEmailSheet() {
  openSheet(`<div id="cm"></div>`, (sh) => {
    const box = $('#cm', sh);
    let email = '';
    const ask = (msg = '') => {
      prepareProof().catch(() => {});
      box.innerHTML = `<h2>Cambia email</h2><p class="muted">Ti mandiamo un codice al nuovo indirizzo. All'indirizzo attuale arriverà un avviso.</p>
        <form id="cm-f"><label class="field"><span>Nuova email</span><input class="input" name="email" type="email" inputmode="email" required></label>
        <p class="err">${h(msg)}</p><div class="actions"><button type="button" class="btn" data-close>Annulla</button><button class="btn primary">Invia il codice</button></div></form>`;
      const f = $('#cm-f', sh);
      setTimeout(() => f.elements.email.focus(), 50);
      f.onsubmit = async (e) => {
        e.preventDefault();
        email = f.elements.email.value.trim();
        try { await withProof((altcha) => accountApi('POST', '/api/account/email', { email, altcha })); code(); } catch (x) { f.querySelector('.err').textContent = x.message; }
      };
    };
    const code = () => {
      box.innerHTML = codeStepHtml(email);
      bindCodeStep(box, email, {
        onBack: () => ask(),
        onDone: async (c) => {
          const j = await accountApi('POST', '/api/account/email/verify', { email, code: c });
          acct.email = j.account.email; saveAcct();
          closeSheet(); toast('Email cambiata'); if (view === Views.account) mount();
        },
      });
      // Il reinvio per il cambio passa dall'endpoint dell'account.
      const r = box.querySelector('[data-resend]');
      r.onclick = async () => { try { await withProof((altcha) => accountApi('POST', '/api/account/email', { email, altcha })); toast('Nuovo codice inviato'); } catch (x) { toast(x.message); } };
    };
    ask();
  });
}

async function deleteAccount() {
  if (!confirm('Eliminare il tuo account? Uscirai da tutti i tuoi gruppi e la tua email verrà cancellata. Non si può annullare.')) return;
  try { await accountApi('DELETE', '/api/account'); forgetDevice(); }
  catch (x) { toast(x.message); }
}
