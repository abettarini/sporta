'use strict';
/* Sporta — persone nei gruppi: ingresso (email e codice, invito, codice del gruppo, nuovo gruppo), selettore dei
   gruppi, pagina Membri con presenza, revisione delle richieste, scheda membro, inviti,
   schermate di attesa e di uscita dal gruppo. */

const RELATIONS = [['familiare', 'Familiare'], ['amico', 'Amico'], ['collega', 'Collega'], ['ospite', 'Ospite']];
const relLabel = (r) => { if (!r) return ''; const f = RELATIONS.find((x) => x[0] === r); return f ? f[1] : r.charAt(0).toUpperCase() + r.slice(1); };
const roleLabel = (r) => (r === 'admin' ? 'Amministratore' : 'Partecipante');
const AV_COLORS = ['#1f8a5b', '#c8504a', '#2f86b8', '#7a5fc4', '#c45fa0', '#cf9a12', '#2a9d8f', '#a0703c', '#4f86d6', '#8e3b5a'];
const avColor = (key) => { let x = 0; for (const c of String(key || '')) x = (x * 31 + c.charCodeAt(0)) >>> 0; return AV_COLORS[x % AV_COLORS.length]; };
const avatar = (m, cls = '') => `<span class="avatar m ${cls} ${m.online ? 'on' : ''}" style="background:${avColor(m.id || m.alias)}">${h((m.alias || '?').slice(0, 1).toUpperCase())}</span>`;
const groupAvatar = (name) => `<span class="avatar lg">${h((name || '?').slice(0, 1).toUpperCase())}</span>`;
const focusLater = (sel) => setTimeout(() => { const el = $(sel); if (el) el.focus(); }, 50);

function fmtAgo(t) {
  if (!t) return '';
  const d = Date.now() - t;
  if (d < 90e3) return 'adesso';
  if (d < 3600e3) return `${Math.round(d / 60e3)} min fa`;
  if (d < 86400e3) return `${Math.round(d / 3600e3)} ${Math.round(d / 3600e3) === 1 ? 'ora' : 'ore'} fa`;
  if (d < 2 * 86400e3) return 'ieri';
  return fmtDate(t, { day: 'numeric', month: 'short' });
}

// --------------------------------------------------------------- configurazione del server
// email: true se il server può inviare email (inviti, recupero dell'accesso).
const serverConfig = ls.json('config', { email: false });
fetch('/api/config').then((r) => (r.ok ? r.json() : null)).then((j) => {
  if (!j) return;
  Object.assign(serverConfig, j);
  ls.setJson('config', serverConfig);
  if (view === Views.welcome && Views.welcome.step === 'start') Views.welcome.show('start');
  else if (view === Views.settings) render();
}).catch(() => {});

// --------------------------------------------------------------- chiamate per entrare nei gruppi
async function publicApi(method, url, body) {
  let r;
  try {
    // Con la chiave dell'account del dispositivo, se c'è (serve per entrare nei gruppi e crearli).
    const headers = { 'Content-Type': 'application/json', ...(acct && acct.token ? { Authorization: 'Bearer ' + acct.token } : {}) };
    r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error('Nessuna connessione.'); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && j.code === 'logged_out' && acct) { forgetDevice(); }
  if (!r.ok) { const e = new Error(j.error || 'Errore, riprova.'); e.code = j.code; e.status = r.status; throw e; }
  return j;
}
const previewCode = (code, alias = '') => publicApi('GET', `/api/preview?code=${encodeURIComponent(normCode(code))}${alias ? '&alias=' + encodeURIComponent(alias) : ''}`);
const previewInvite = (token, alias = '') => publicApi('GET', `/api/invites/${encodeURIComponent(token)}${alias ? '?alias=' + encodeURIComponent(alias) : ''}`);

// Verifica un codice e restituisce il nome del gruppo (usata anche altrove).
async function previewGroup(rawCode) {
  const code = normCode(rawCode);
  if (cleanCode(code).length !== CODE_LEN) throw new Error('Il codice è di 12 caratteri.');
  try { return (await previewCode(code)).household.name; } catch (e) { if (e.code === 'bad_code') throw new Error('Codice non valido.'); throw e; }
}

// Dopo l'ingresso: se si è in attesa il gruppo resta "in attesa", altrimenti si caricano i dati.
async function enterGroup(res) {
  ls.set('member', res.me.alias);
  st.member = res.me.alias;
  if (res.me.status !== 'active') { addGroup({ household: res.household }, { token: res.token, me: res.me }); return; }
  const r = await fetch('/api/state', { headers: { Authorization: 'Bearer ' + res.token } });
  if (!r.ok) throw new Error('Errore, riprova.');
  addGroup(await r.json(), { token: res.token, me: res.me });
}

async function createGroup(name, alias, acceptTerms) {
  const j = await publicApi('POST', '/api/households', { name: name || 'Gruppo', alias, accept_terms: !!acceptTerms });
  if (j.account && acct) { acct.terms_ok = j.account.terms_ok; saveAcct(); }
  ls.set('member', alias);
  st.member = alias;
  addGroup(j, { token: j.token, me: j.me });
  return j;
}

// --------------------------------------------------------------- campi per presentarsi
// Nome (con controllo che sia libero), relazione e, se serve l'approvazione, email e messaggio.
function presentFieldsHtml({ approval, relation, fixedRelation }) {
  return `<label class="field"><span>Come ti chiami?</span>
      <input class="input" name="alias" required maxlength="40" autocomplete="given-name" placeholder="es. Marco" value="${h(st.member || ls.get('member') || '')}">
      <span class="hint alias-hint"></span></label>
    ${fixedRelation ? '' : `<div class="field"><span>Chi sei per il gruppo?</span>${relationPicker('relation', relation || '')}</div>`}
    ${approval ? `<label class="field"><span>Messaggio per gli amministratori (facoltativo)</span><textarea class="input" name="message" rows="2" maxlength="300" placeholder="es. Ciao, sono Luca, il cugino di Giulia"></textarea></label>` : ''}`;
}

function relationPicker(name, value) {
  const known = RELATIONS.some((r) => r[0] === value);
  return `<input type="hidden" name="${name}" value="${h(value)}"><div class="chips rel-pick" data-for="${name}">
    ${RELATIONS.map(([id, label]) => `<button type="button" class="chip ${value === id ? 'on' : ''}" data-rel="${id}">${label}</button>`).join('')}
    <button type="button" class="chip ${value && !known ? 'on' : ''}" data-rel="_altro">${value && !known ? h(relLabel(value)) : '+ Altro'}</button></div>`;
}
function bindRelationPicker(root, name) {
  const input = root.querySelector(`[name="${name}"]`);
  const pick = root.querySelector(`.rel-pick[data-for="${name}"]`);
  if (!pick) return;
  pick.onclick = (e) => {
    const b = e.target.closest('[data-rel]'); if (!b) return;
    let v = b.dataset.rel;
    if (v === '_altro') {
      v = (prompt('Relazione (es. Vicino di casa, Compagno di squadra):', RELATIONS.some((r) => r[0] === input.value) ? '' : input.value) || '').trim().toLowerCase();
      if (!v) return;
      b.textContent = relLabel(v);
    }
    input.value = input.value === v ? '' : v;
    pick.querySelectorAll('[data-rel]').forEach((x) => x.classList.toggle('on', x === b && !!input.value));
  };
}

// Controllo dal vivo che il nome sia libero nel gruppo.
function bindAliasCheck(root, check) {
  const input = root.querySelector('[name="alias"]');
  const hint = root.querySelector('.alias-hint');
  let timer = null, seq = 0;
  const run = () => {
    clearTimeout(timer);
    const v = input.value.trim();
    hint.textContent = ''; hint.className = 'hint alias-hint';
    if (!v) return;
    timer = setTimeout(async () => {
      const n = ++seq;
      try {
        const free = await check(v);
        if (n !== seq || free === undefined) return;
        hint.textContent = free ? '✓ Disponibile in questo gruppo' : 'Questo nome è già usato nel gruppo: aggiungi per esempio l\'iniziale del cognome';
        hint.className = 'hint alias-hint ' + (free ? 'ok' : 'bad');
      } catch { /* offline */ }
    }, 350);
  };
  input.addEventListener('input', run);
  run();
}
function presentValues(root) {
  const v = (n) => { const el = root.querySelector(`[name="${n}"]`); return el ? el.value.trim() : ''; };
  return { alias: v('alias'), relation: v('relation'), message: v('message') };
}

// --------------------------------------------------------------- benvenuto (primo accesso)
// Percorsi: link personale (?invite=) -> solo il nome; link con codice (?join=) -> nome e
// presentazione; "Ho un codice" -> codice, poi presentazione; "Crea un gruppo" -> nome + gruppo.
Views.welcome = {
  mount() {
    Object.assign(this, { code: null, group: null, approval: true, invite: null, inviteInfo: null, err: '', fromLink: false, prefill: '', email: '', pending: null, res: null });
    const q = new URLSearchParams(location.search);
    if (q.get('invite')) return this.openInvite(q.get('invite'));
    const join = q.get('join');
    if (join != null) {
      this.fromLink = true;
      const code = normCode(join);
      if (cleanCode(code).length !== CODE_LEN) { this.fromLink = false; this.err = 'Il link non contiene un codice valido: inseriscilo qui.'; this.prefill = code; return this.show('code'); }
      this.show('checking');
      return previewCode(code)
        .then((j) => { this.code = code; this.group = j.household.name; this.approval = j.household.require_approval; this.show('alias'); })
        .catch((e) => { this.fromLink = false; this.err = e.code === 'bad_code' ? 'Il link non contiene un codice valido: inseriscilo qui.' : e.message; this.prefill = code; this.show('code'); });
    }
    // Account già sul dispositivo ma nessun gruppo: si sceglie il primo gruppo.
    this.show(acct ? 'new' : 'start');
  },
  openInvite(token) {
    this.invite = token;
    this.show('checking');
    previewInvite(token).then((j) => {
      this.inviteInfo = j; this.group = j.household.name;
      if (!j.valid) { this.err = j.reason === 'used' ? 'Questo invito è già stato usato.' : 'Questo invito è scaduto.'; this.invite = null; return this.show('code'); }
      this.show('alias');
    }).catch(() => { this.err = 'Invito non trovato: chiedi un nuovo link, oppure inserisci il codice del gruppo.'; this.invite = null; this.show('code'); });
  },
  // Dopo il codice: si completa l'azione in sospeso (entrare in un gruppo) oppure si mostrano i gruppi.
  async afterLogin(res) {
    this.res = res;
    if (this.pending) {
      const p = this.pending; this.pending = null;
      return this.submitJoin(p.values, p.terms);
    }
    if (res.groups.length) return this.show('back');
    this.show('new');
  },
  async submitJoin(v, terms) {
    const inv = this.invite && this.inviteInfo;
    const body = { alias: v.alias, accept_terms: !!terms };
    let res;
    if (this.invite) {
      // Invito per un'altra email, su un dispositivo che ha già un account: si entra con questo account.
      if (inv.email && acct && acct.email !== inv.email) body.use_device_account = true;
      res = await publicApi('POST', `/api/invites/${encodeURIComponent(this.invite)}/accept`, body);
    } else res = await publicApi('POST', '/api/join', { code: this.code, ...v, ...body });
    if (res.account_token) setAccount(res);
    else if (res.account && acct) { acct.terms_ok = res.account.terms_ok; saveAcct(); }
    if (res.groups) adoptGroups(res.groups.filter((x) => x.household.id !== res.household.id));
    await enterGroup(res);
    history.replaceState(null, '', '/#/'); mount();
    if (res.me.status === 'active') toast(`Benvenuto nel gruppo "${this.group}"`);
  },
  show(step) {
    this.step = step;
    const back = (to) => `<button type="button" class="icon-btn wback" data-to="${to}" aria-label="Indietro">${I.back}</button>`;
    const err = `<p class="err" id="w-err">${h(this.err || '')}</p>`;
    const dots = (n) => `<div class="steps-dots"><span class="${n === 1 ? 'on' : ''}"></span><span class="${n === 2 ? 'on' : ''}"></span></div>`;
    let body = '';
    if (step === 'start') {
      body = `<img class="logo" src="/icons/icon-192.png" alt="">
        <h1>Sporta</h1>
        <p>Liste della spesa, cose da fare ed eventi, condivisi in tempo reale con la famiglia, gli amici o la squadra.</p>
        <form id="w-mail-f"><label class="field"><span>La tua email</span><input class="input" id="w-email" type="email" inputmode="email" autocomplete="email" required placeholder="nome@esempio.it" value="${h(this.email)}"></label>
        ${err}<button class="btn primary block lg">Continua</button></form>
        <p class="muted small center">Ti mandiamo un codice per entrare: niente password da ricordare. Vale sia la prima volta sia per ritrovare i tuoi gruppi su un altro dispositivo.</p>
        <button class="btn ghost block" data-to="code" style="margin-top:14px">Ho un invito o un codice di gruppo</button>`;
    } else if (step === 'otp') {
      body = `${back(this.pending ? 'alias' : 'start')}<div id="w-otp">${codeStepHtml(this.email)}</div>`;
    } else if (step === 'back') {
      const gs = this.res.groups;
      body = `<h2>Bentornato${gs[0] ? ', ' + h(gs[0].me.alias) : ''}</h2>
        <p class="muted">Questi sono i tuoi gruppi: li ritrovi tutti anche qui.</p>
        <div class="card items">${gs.map((x) => `<div class="row-btn"><span class="avatar">${h((x.household.name || '?').slice(0, 1).toUpperCase())}</span>
          <span class="t">${h(x.household.name)}<small class="as">come ${h(x.me.alias)}${x.me.role === 'admin' ? ' · amministratore' : ''}${x.me.status === 'pending' ? ' · richiesta in attesa' : ''}</small></span><span class="ok">${I.check}</span></div>`).join('')}</div>
        <form id="w-back-f">${needTerms() ? termsCheckHtml() : ''}${err}<button class="btn primary block lg">Entra</button></form>`;
    } else if (step === 'new') {
      body = `<h2>Benvenuto su Sporta</h2>
        <p class="muted">${h(acct ? acct.email : '')} ✓ · Non fai ancora parte di nessun gruppo.</p>
        <form id="w-create-f">
          <label class="field"><span>Come ti chiami?</span><input class="input" name="alias" id="w-name" required maxlength="40" autocomplete="given-name" placeholder="es. Marco" value="${h(st.member || ls.get('member') || '')}">
            <span class="hint">È il nome che vedranno gli altri. In ogni gruppo puoi usarne uno diverso.</span></label>
          <label class="field"><span>Crea un gruppo</span><input class="input" id="w-fam" required maxlength="80" placeholder="es. Casa Rossi, Calcetto, Festa di Anna"></label>
          ${needTerms() ? termsCheckHtml() : ''}
          ${err}<button class="btn primary block lg">Crea il gruppo</button></form>
        <button class="btn ghost block" data-to="code" style="margin-top:10px">Ho un codice di gruppo o un invito</button>`;
    } else if (step === 'checking') {
      body = `<div class="empty">${emptyArt('link')}Verifico l'invito…</div>`;
    } else if (step === 'code') {
      body = `${back(acct ? 'new' : 'start')}${dots(1)}
        <h2>Inserisci il codice d'invito</h2>
        <p class="muted">Lo trovi nel messaggio di chi ti ha invitato. Basta scrivere lettere e numeri: maiuscole e trattini si mettono da soli.</p>
        <form id="w-code-f"><input class="input" id="w-code" placeholder="XXXX-XXXX-XXXX" value="${h(this.prefill || '')}">
        ${err}<button class="btn primary block lg" id="w-next">Continua</button></form>`;
    } else if (step === 'alias') {
      const inv = this.invite && this.inviteInfo;
      const sub = inv ? `<small>${h(inv.invited_by || 'Qualcuno')} ti ha invitato nel gruppo</small>`
        : `<small>${this.fromLink ? 'Sei stato invitato nel gruppo' : 'Stai per entrare nel gruppo'}</small>`;
      const extra = inv ? `<span class="tagline">${h([relLabel(inv.relation), inv.role === 'admin' ? 'Amministratore' : ''].filter(Boolean).join(' · '))}</span>`
        : this.approval ? '<span class="tagline">Un amministratore dovrà accettarti</span>' : '';
      // Email: dall'invito (bloccata), dall'account del dispositivo, oppure da scrivere (con il codice).
      let mail;
      if (inv && inv.email && !acct) mail = `<div class="field"><span>La tua email</span><div class="ro mail-ro">${h(inv.email)} <span class="ok-mark">✓ dall'invito</span></div></div>`;
      else if (acct) mail = `<div class="field"><span>La tua email</span><div class="ro mail-ro">${h(acct.email)} <span class="ok-mark">✓</span></div>
          ${inv && inv.email && inv.email !== acct.email ? `<span class="hint">L'invito era per ${h(inv.email)}: entrerai con l'account di questo dispositivo.</span>` : ''}</div>`;
      else mail = `<label class="field"><span>La tua email</span><input class="input" name="email" type="email" inputmode="email" autocomplete="email" required placeholder="nome@esempio.it" value="${h(this.email)}">
          <span class="hint">Ti mandiamo un codice per confermarla. La vedono solo gli amministratori.</span></label>`;
      const needCode = !acct && !(inv && inv.email);
      const label = needCode ? 'Invia il codice' : !inv && this.approval ? 'Invia richiesta' : 'Entra nel gruppo';
      body = `${this.fromLink || inv ? '' : back('code')}${this.fromLink || inv ? '' : dots(2)}
        <div class="invite-card">${groupAvatar(this.group)}${sub}<b>${h(this.group)}</b>${extra}</div>
        <form id="w-alias-f">${presentFieldsHtml({ approval: !inv && this.approval, fixedRelation: !!inv })}${mail}
          ${needTerms() ? termsCheckHtml() : ''}
          ${err}<button class="btn primary block lg">${label}</button></form>
        ${this.fromLink || inv ? `<button class="btn ghost block" data-to="code" style="margin-top:8px">Non è il tuo invito? Inserisci un codice</button>` : ''}`;
    }
    app.innerHTML = `<div class="welcome">${body}</div>`;
    this.err = '';
    app.querySelectorAll('[data-to]').forEach((b) => {
      b.onclick = () => { if (b.dataset.to === 'code') { this.prefill = ''; this.invite = null; this.fromLink = false; this.pending = null; } this.show(b.dataset.to); };
    });
    const fail = (m) => { const e = $('#w-err'); if (e) e.textContent = m; };
    const done = () => { history.replaceState(null, '', '/#/'); mount(); };
    if (step === 'start' || (step === 'alias' && !acct)) prepareProof().catch(() => {});
    if (step === 'start') {
      focusLater('#w-email');
      $('#w-mail-f').onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Un attimo…';
        this.email = $('#w-email').value.trim();
        try { await requestCode(this.email); this.show('otp'); } catch (x) { fail(x.message); btn.disabled = false; btn.textContent = 'Continua'; }
      };
    }
    if (step === 'otp') {
      bindCodeStep($('#w-otp'), this.email, {
        onBack: () => this.show(this.pending ? 'alias' : 'start'),
        onDone: async (code) => this.afterLogin(await verifyLogin({ email: this.email, code })),
      });
    }
    if (step === 'back') {
      const f = $('#w-back-f');
      bindTermsCheck(f);
      f.onsubmit = async (e) => {
        e.preventDefault();
        try {
          if (needTerms()) { const j = await accountApi('POST', '/api/account/accept', { accept_terms: termsAccepted(f) }); acct.terms_ok = j.account.terms_ok; saveAcct(); }
          adoptGroups(this.res.groups);
          done();
          toast('Bentornato: i tuoi gruppi sono su questo dispositivo');
        } catch (x) { fail(x.message); }
      };
    }
    if (step === 'code') {
      const next = $('#w-next');
      bindCodeInput($('#w-code'), (complete) => { next.disabled = !complete; });
      focusLater('#w-code');
      $('#w-code-f').onsubmit = async (e) => {
        e.preventDefault();
        next.disabled = true;
        try {
          const code = normCode($('#w-code').value);
          const j = await previewCode(code);
          Object.assign(this, { code, group: j.household.name, approval: j.household.require_approval });
          this.show('alias');
        } catch (x) { fail(x.code === 'bad_code' ? 'Codice non valido.' : x.message); next.disabled = false; }
      };
    }
    if (step === 'alias') {
      const f = $('#w-alias-f');
      bindRelationPicker(f, 'relation');
      bindTermsCheck(f);
      bindAliasCheck(f, async (alias) => (this.invite ? (await previewInvite(this.invite, alias)).alias_available : (await previewCode(this.code, alias)).alias_available));
      if (!f.elements.alias.value) focusLater('#w-alias-f [name=alias]');
      f.onsubmit = async (e) => {
        e.preventDefault();
        const v = presentValues(f);
        if (!v.alias) return fail('Scrivi il tuo nome.');
        const btn = f.querySelector('button.primary'); btn.disabled = true;
        const terms = termsAccepted(f);
        try {
          if (f.elements.email) {
            // Prima la conferma dell'email: poi la richiesta parte da sola.
            this.email = f.elements.email.value.trim();
            await requestCode(this.email);
            this.pending = { values: v, terms };
            return this.show('otp');
          }
          await this.submitJoin(v, terms);
        } catch (x) { fail(x.message); btn.disabled = false; }
      };
    }
    if (step === 'new') {
      const f = $('#w-create-f');
      bindTermsCheck(f);
      focusLater(f.elements.alias.value ? '#w-fam' : '#w-name');
      f.onsubmit = async (e) => {
        e.preventDefault();
        const alias = $('#w-name').value.trim(), fam = $('#w-fam').value.trim();
        if (!alias) return fail('Scrivi il tuo nome.');
        if (!fam) return fail('Dai un nome al gruppo.');
        try {
          await createGroup(fam, alias, termsAccepted(f));
          done(); toast('Gruppo creato! Invita gli altri da Membri');
        } catch (x) { fail(x.message); }
      };
    }
  },
};

// --------------------------------------------------------------- selettore dei gruppi
function groupSheet() {
  openSheet(`<h2>I tuoi gruppi</h2>
    <div class="items">${st.groups.map((g) => `<button class="row-btn" data-code="${h(g.code)}">
      <span class="avatar">${h((g.name || '?').slice(0, 1).toUpperCase())}</span>
      <span class="t">${h(g.name)}<small class="as">${g.status === 'pending' ? 'richiesta in attesa' : memberFor(g.code) ? 'sei ' + h(memberFor(g.code)) + (g.role === 'admin' ? ' · amministratore' : '') : ''}</small></span>${g.code === st.code ? `<span class="ok">${I.check}</span>` : ''}</button>`).join('')}</div>
    <div class="actions"><button class="btn" id="g-join">Unisciti con codice</button><button class="btn primary" id="g-new">Nuovo gruppo</button></div>`, (sh) => {
    sh.querySelectorAll('[data-code]').forEach((b) => { b.onclick = () => { closeSheet(true); switchGroup(b.dataset.code); }; });
    $('#g-new', sh).onclick = () => newGroupSheet();
    $('#g-join', sh).onclick = () => joinGroupSheet();
  });
}

function newGroupSheet() {
  if (!acct) { toast('Prima conferma la tua email'); return confirmEmailSheet(); }
  openSheet(`<h2>Nuovo gruppo</h2>
    <p class="muted">Una famiglia, la squadra di calcetto, una festa… Ne sarai l'amministratore.</p>
    <form id="ng"><label class="field"><span>Nome del gruppo</span><input class="input" name="gname" required maxlength="80" placeholder="es. Calcetto del giovedì"></label>
    <label class="field"><span>Il tuo nome in questo gruppo</span><input class="input" name="alias" required maxlength="40" value="${h(st.member || ls.get('member') || '')}"></label>
    <p class="err" id="ng-err"></p>
    <div class="actions"><button type="button" class="btn" data-close>Annulla</button><button class="btn primary">Crea</button></div></form>`, (sh) => {
    const f = $('#ng', sh);
    setTimeout(() => f.elements.gname.focus(), 50);
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const j = await createGroup(f.elements.gname.value.trim(), f.elements.alias.value.trim());
        closeSheetAndGo('#/l');
        toast(`Gruppo "${j.household.name}" creato: invita gli altri da Membri`);
      } catch (err) { $('#ng-err', sh).textContent = err.message; }
    };
  });
}

// Unirsi a un altro gruppo (per chi usa già Sporta): codice, poi presentazione.
// `prefill`: codice da un link ?join=, oppure { invite: token } da un link personale.
function joinGroupSheet(prefill) {
  if (!acct) { toast('Prima conferma la tua email'); return confirmEmailSheet(); }
  openSheet(`<div id="jg-body"></div>`, (sh) => {
    const body = $('#jg-body', sh);
    const stepCode = (msg = '', code = '') => {
      body.innerHTML = `<h2>Unisciti a un gruppo</h2>
        <form id="jg"><label class="field"><span>Codice d'invito</span><input class="input" name="gcode" required placeholder="XXXX-XXXX-XXXX" value="${h(code)}"></label>
        <p class="hint">Basta scrivere lettere e numeri: maiuscole e trattini si mettono da soli. Puoi anche incollare il link d'invito.</p>
        <p class="err" id="jg-err">${h(msg)}</p>
        <div class="actions"><button type="button" class="btn" data-close>Annulla</button><button class="btn primary">Continua</button></div></form>`;
      const f = $('#jg', sh);
      const ok = f.querySelector('button.primary');
      bindCodeInput(f.elements.gcode, (complete) => { ok.disabled = !complete; });
      setTimeout(() => f.elements.gcode.focus(), 50);
      f.onsubmit = async (e) => {
        e.preventDefault();
        ok.disabled = true;
        const c = normCode(f.elements.gcode.value);
        try { const j = await previewCode(c); stepPresent({ code: c, name: j.household.name, approval: j.household.require_approval }); }
        catch (err) { $('#jg-err', sh).textContent = err.code === 'bad_code' ? 'Codice non valido.' : err.message; ok.disabled = false; }
      };
    };
    const stepPresent = ({ code, invite, info, name, approval }) => {
      if (code && st.groups.some((g) => g.code === code)) { closeSheet(true); switchGroup(code); toast(`Sei già nel gruppo "${name}"`); return; }
      const askMore = !invite && approval;
      body.innerHTML = `<div class="invite-head">${groupAvatar(name)}<div><small>${invite ? h((info.invited_by || 'Qualcuno') + ' ti invita nel gruppo') : 'Entra nel gruppo'}</small><b>${h(name)}</b>
          ${askMore ? '<small>Un amministratore dovrà accettarti</small>' : ''}</div></div>
        <form id="jg2">${presentFieldsHtml({ approval: askMore, fixedRelation: !!invite })}
        <p class="err" id="jg-err"></p>
        <div class="actions"><button type="button" class="btn" id="jg-back">Altro codice</button><button class="btn primary">${askMore ? 'Invia richiesta' : 'Entra nel gruppo'}</button></div></form>`;
      const f = $('#jg2', sh);
      bindRelationPicker(f, 'relation');
      bindAliasCheck(f, async (alias) => (invite ? (await previewInvite(invite, alias)).alias_available : (await previewCode(code, alias)).alias_available));
      $('#jg-back', sh).onclick = () => stepCode();
      f.onsubmit = async (e) => {
        e.preventDefault();
        const v = presentValues(f);
        if (!v.alias) return;
        try {
          const res = invite
            ? await publicApi('POST', `/api/invites/${encodeURIComponent(invite)}/accept`, { alias: v.alias, use_device_account: true })
            : await publicApi('POST', '/api/join', { code, ...v });
          await enterGroup(res);
          closeSheetAndGo('#/l');
          toast(res.me.status === 'active' ? `Benvenuto nel gruppo "${name}"` : 'Richiesta inviata: ti avviseremo quando verrai accettato');
        } catch (err) { $('#jg-err', sh).textContent = err.message; }
      };
    };
    if (prefill && prefill.invite) {
      body.innerHTML = '<div class="empty">Verifico l\'invito…</div>';
      previewInvite(prefill.invite).then((info) => {
        if (!info.valid) return stepCode(info.reason === 'used' ? 'Questo invito è già stato usato.' : 'Questo invito è scaduto.');
        stepPresent({ invite: prefill.invite, info, name: info.household.name });
      }).catch(() => stepCode('Invito non trovato: inserisci il codice del gruppo.'));
    } else if (prefill && cleanCode(prefill).length === CODE_LEN) {
      body.innerHTML = '<div class="empty">Verifico l\'invito…</div>';
      const code = normCode(prefill);
      previewCode(code).then((j) => stepPresent({ code, name: j.household.name, approval: j.household.require_approval }))
        .catch((err) => stepCode(err.code === 'bad_code' ? 'Il link non contiene un codice valido: inseriscilo qui.' : err.message, code));
    } else stepCode(prefill ? 'Il link non contiene un codice valido: inseriscilo qui.' : '', prefill ? normCode(prefill) : '');
  });
}

// --------------------------------------------------------------- in attesa di approvazione
Views.pending = {
  mount() {
    const g = groupOf(st.code);
    const me = st.me || {};
    app.innerHTML = `<div class="welcome center">
      <div class="big-ico w">${icon('done')}</div>
      <h2>Richiesta inviata</h2>
      <p class="muted">Un amministratore di <b>${h(g.name)}</b> deve accettarti. Questa pagina si aggiorna da sola.</p>
      <span class="pill">In attesa${me.created_at ? ' · inviata ' + h(fmtAgo(me.created_at)) : ''}</span>
      <div class="card pad" style="text-align:left;margin:22px 0 10px"><small class="muted">Ti sei presentato come</small><b style="display:block">${h(g.alias || me.alias || '')}${me.relation ? ' · ' + h(relLabel(me.relation)) : ''}</b></div>
      ${st.groups.length > 1 ? '<button class="btn block" id="p-groups">Vai ai tuoi altri gruppi</button>' : ''}
      <button class="btn ghost danger-text" id="p-cancel" style="margin-top:8px">Annulla richiesta</button>
    </div>`;
    const go = $('#p-groups'); if (go) go.onclick = () => groupSheet();
    $('#p-cancel').onclick = async () => {
      if (!confirm('Annullare la richiesta di entrare in questo gruppo?')) return;
      try { await api('DELETE', '/api/me'); } catch { /* già gestita */ }
      dropGroup(g.code);
    };
    clearInterval(this.timer);
    const check = async () => {
      if (view !== Views.pending || document.visibilityState !== 'visible') return;
      const code = st.code;
      try {
        const r = await fetch('/api/me', { headers: authHeaders(code) });
        const j = await r.json().catch(() => ({}));
        if (r.status === 401) { clearInterval(this.timer); unauthorized(code, j.code || 'rejected'); return; }
        if (r.ok && j.me && j.me.status === 'active') {
          clearInterval(this.timer);
          const s = await fetch('/api/state', { headers: authHeaders(code) });
          if (!s.ok) return;
          addGroup(await s.json(), { me: j.me });
          history.replaceState(null, '', '/#/');
          mount();
          toast(`Sei stato accettato in "${j.household.name}"!`);
        }
      } catch { /* offline */ }
    };
    this.timer = setInterval(check, 5000);
    check();
  },
};

// --------------------------------------------------------------- uscita dal gruppo
Views.notice = {
  mount() {
    const n = st.notice;
    const text = {
      removed: [`Non fai più parte di «${n.name}»`, `Un amministratore ti ha rimosso dal gruppo, oppure sei uscito da un altro dispositivo. Le liste e le ricette di ${n.name} sono state tolte da questo telefono.`],
      rejected: [`Richiesta non accettata`, `La tua richiesta di entrare in «${n.name}» non è stata accettata.`],
      deleted: [`Gruppo eliminato`, `${n.by ? n.by + ' ha eliminato' : 'Un amministratore ha eliminato'} il gruppo «${n.name}»: le sue liste, ricette ed eventi non ci sono più e sono stati tolti anche da questo dispositivo.`],
      legacy_expired: [`Accesso da rinnovare`, `Per ritrovare «${n.name}» entra con la tua email: se fai parte del gruppo, lo ritrovi subito.`],
    }[n.reason] || [`Non fai più parte di «${n.name}»`, ''];
    app.innerHTML = `<div class="welcome center">
      <div class="big-ico" style="background:var(--surface-2);color:var(--muted)">${I.users}</div>
      <h2>${h(text[0])}</h2><p class="muted">${h(text[1])}</p>
      ${st.groups.length ? '<button class="btn primary block lg" id="n-groups">Vai ai tuoi gruppi</button>' : ''}
      <button class="btn block lg" id="n-again" style="margin-top:10px">Chiedi di entrare</button>
    </div>`;
    const close = () => { st.notice = null; };
    const g = $('#n-groups'); if (g) g.onclick = () => { close(); history.replaceState(null, '', '/#/'); mount(); };
    $('#n-again').onclick = () => {
      close();
      if (st.groups.length) { history.replaceState(null, '', '/#/'); mount(); joinGroupSheet(n.code); }
      else { history.replaceState(null, '', '/?join=' + encodeURIComponent(n.code)); mount(); }
    };
  },
};

// --------------------------------------------------------------- pagina Membri
const sortedMembers = () => [...st.members.values()].sort((a, b) =>
  (st.me && b.id === st.me.id) - (st.me && a.id === st.me.id) || (b.role === 'admin') - (a.role === 'admin') || a.alias.localeCompare(b.alias, 'it'));

function memberRow(m, { requests } = {}) {
  const meId = st.me && st.me.id;
  const sub = requests
    ? [relLabel(m.relation), m.email ? m.email + (m.email_verified ? ' ✓' : '') : '', fmtAgo(m.created_at)].filter(Boolean).join(' · ')
    : [relLabel(m.relation), m.online ? (m.viewing && st.lists.get(m.viewing) ? `nella lista "${st.lists.get(m.viewing).name}"` : 'online') : m.last_seen ? 'visto ' + fmtAgo(m.last_seen) : ''].filter(Boolean).join(' · ');
  return `<div class="mrow" data-mid="${m.id}">${avatar(m)}
    <span class="mt"><b>${h(m.alias)}${m.id === meId ? ' (tu)' : ''}${m.role === 'admin' && !requests ? ' <span class="rbadge">Admin</span>' : ''}${requests ? ' <span class="rbadge w">nuova</span>' : ''}${!requests && m.email_verified === false ? ' <span class="rbadge w">email da confermare</span>' : ''}</b><small>${h(sub)}</small>${!requests && m.email ? `<small class="m-email">${h(m.email)}${m.email_verified ? ' ✓' : ''}</small>` : ''}</span>
    ${requests ? `<button class="round no" data-reject="${m.id}" aria-label="Rifiuta">${I.x}</button><button class="round yes" data-review="${m.id}" aria-label="Accetta">${I.check}</button>` : '<span class="chev">›</span>'}</div>`;
}

Views.members = {
  mount() {
    app.innerHTML = topBar('Membri', {
      back: hasPane() ? '' : '#/s',
      right: `<button class="btn primary sm" id="m-inv">${I.plus} Invita</button>`,
    }) + `<main class="wide"><div id="mb"></div></main>` + tabBar(hasPane() || matchMedia('(min-width: 760px)').matches ? 'members' : 'settings');
    $('#m-inv').onclick = () => inviteSheet();
    $('#mb').onclick = (e) => {
      const rej = e.target.closest('[data-reject]');
      if (rej) return rejectRequest(st.members.get(rej.dataset.reject));
      const rev = e.target.closest('[data-review]');
      if (rev) return reviewSheet(st.members.get(rev.dataset.review));
      const row = e.target.closest('[data-mid]');
      if (!row) return;
      const m = st.members.get(row.dataset.mid);
      if (m.status === 'pending') reviewSheet(m); else memberSheet(m);
    };
    $('#mb').addEventListener('click', (e) => {
      const x = e.target.closest('[data-revoke-inv]'); if (!x) return;
      e.stopPropagation();
      revokeInvite((this.invites || []).find((i) => i.id === x.dataset.revokeInv));
    }, true);
    this.invites = null;
    refreshMembers();
    this.loadInvites();
    this.update();
  },
  // Inviti in attesa (solo per gli amministratori).
  async loadInvites() {
    if (!isAdmin() || !tokenFor(st.code)) { this.invites = []; return; }
    try { this.invites = (await api('GET', '/api/invites')).invites; } catch { this.invites = this.invites || []; }
    if (view === Views.members) this.update();
  },
  update() {
    const all = sortedMembers();
    const pending = all.filter((m) => m.status === 'pending');
    const active = all.filter((m) => m.status === 'active');
    const online = active.filter((m) => m.online || (st.me && m.id === st.me.id && st.live));
    const others = active.filter((m) => !online.includes(m));
    const sec = (title, rows, opts) => (rows.length ? `<div class="section-h"><span>${title} · ${rows.length}</span></div><div class="card mcard">${rows.map((m) => memberRow(m, opts)).join('')}</div>` : '');
    $('#mb').innerHTML = (!tokenFor(st.code) ? `<div class="card pad muted small">Sto collegando questo telefono al gruppo…</div>` : '') +
      (isAdmin() ? sec('Richieste in attesa', pending, { requests: true }) : '') +
      sec('Online ora', online) + sec(online.length ? 'Altri membri' : 'Membri', others) +
      (isAdmin() && this.invites && this.invites.length ? `<div class="section-h"><span>Inviti in attesa · ${this.invites.length}</span></div>
        <div class="card mcard">${this.invites.map(inviteRow).join('')}</div>` : '') +
      `<p class="muted small center" style="margin-top:16px">${isAdmin()
        ? (st.household && st.household.require_approval ? 'Chi entra con il codice del gruppo deve essere accettato da un amministratore.' : 'Chi ha il codice del gruppo entra senza approvazione (puoi cambiarlo in Altro).')
        : 'Solo gli amministratori possono accettare richieste e rimuovere membri.'}</p>`;
  },
};

function inviteRow(i) {
  const who = i.email || 'Link condiviso';
  const days = Math.max(0, Math.ceil((i.expires_at - Date.now()) / 864e5));
  const sub = [relLabel(i.relation), i.role === 'admin' ? 'amministratore' : '', i.created_by ? 'da ' + i.created_by : '', fmtAgo(i.created_at),
    days <= 1 ? 'scade oggi' : `scade tra ${days} giorni`].filter(Boolean).join(' · ');
  return `<div class="mrow inv-row"><span class="avatar inv">${i.email ? I.mail : icon('link')}</span>
    <span class="mt"><b>${h(who)}</b><small>${h(sub)}</small></span>
    <button class="btn ghost danger-text sm" data-revoke-inv="${h(i.id)}">Annulla</button></div>`;
}

async function revokeInvite(i) {
  if (!i) return;
  if (!confirm(i.email ? `Annullare l'invito a ${i.email}? Il link nell'email smetterà subito di funzionare.` : 'Annullare questo link d\'invito? Smetterà subito di funzionare.')) return;
  try { await api('DELETE', '/api/invites/' + encodeURIComponent(i.id)); toast('Invito annullato'); Views.members.loadInvites(); } catch (e) { toast(e.message); }
}

// Eliminazione del gruppo (amministratori): conferma scrivendo il nome del gruppo.
function deleteGroupSheet() {
  const name = groupName(), code = st.code;
  const others = [...st.members.values()].filter((m) => m.status === 'active' && (!st.me || m.id !== st.me.id)).length;
  openSheet(`<h2>Eliminare «${h(name)}»?</h2>
    <p>Verranno cancellati per sempre, per tutti: <b>liste, articoli, ricette e foto, eventi, storico delle spese</b> e l'elenco dei membri. Le ricette condivise smetteranno di funzionare.</p>
    ${others ? `<p class="muted">${others === 1 ? 'L\'altra persona del gruppo riceverà' : `Le altre ${others} persone del gruppo riceveranno`} un avviso.</p>` : ''}
    <form id="dg"><label class="field"><span>Per confermare scrivi il nome del gruppo</span><input class="input" name="confirm" autocomplete="off" placeholder="${h(name)}"></label>
      <p class="err" id="dg-err"></p>
      <div class="actions"><button type="button" class="btn" data-close>Annulla</button><button class="btn danger" disabled>Elimina per sempre</button></div></form>`, (sh) => {
    const f = $('#dg', sh), btn = f.querySelector('.btn.danger');
    f.elements.confirm.oninput = () => { btn.disabled = f.elements.confirm.value.trim().toLowerCase() !== name.trim().toLowerCase(); };
    setTimeout(() => f.elements.confirm.focus(), 50);
    f.onsubmit = async (e) => {
      e.preventDefault();
      btn.disabled = true;
      deletingGroup = true;
      try {
        await api('POST', '/api/household/delete', { confirm: f.elements.confirm.value.trim() });
        closeSheet(true);
        dropGroup(code);
        toast(`Il gruppo «${name}» è stato eliminato`);
      } catch (x) { $('#dg-err', sh).textContent = x.message; btn.disabled = false; }
      deletingGroup = false;
    };
  });
}

async function rejectRequest(m) {
  if (!confirm(`Rifiutare la richiesta di ${m.alias}?`)) return;
  try { await api('POST', `/api/members/${m.id}/reject`, {}); toast('Richiesta rifiutata'); refreshMembers(); } catch (e) { toast(e.message); }
}

function roleSeg(name, value) {
  return `<input type="hidden" name="${name}" value="${value}"><div class="seg" data-for="${name}">
    <button type="button" data-v="member" class="${value === 'member' ? 'on' : ''}">Partecipante</button>
    <button type="button" data-v="admin" class="${value === 'admin' ? 'on' : ''}">Amministratore</button></div>`;
}
function bindSeg(root, name) {
  const input = root.querySelector(`[name="${name}"]`);
  const seg = root.querySelector(`.seg[data-for="${name}"]`);
  seg.onclick = (e) => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    input.value = b.dataset.v;
    seg.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('on', x === b));
  };
}

function reviewSheet(m) {
  openSheet(`<div class="req-head">${avatar(m, 'xl')}<div><b>${h(m.alias)} chiede di entrare</b><small class="muted">in ${h(groupName())} · ${h(fmtAgo(m.created_at))}${m.email ? '<br>' + h(m.email) + (m.email_verified ? ' ✓ verificata' : '') : ''}</small></div></div>
    ${m.message ? `<div class="bubble">“${h(m.message)}”</div>` : ''}
    <form id="rv">
      <label class="field"><span>Nome nel gruppo</span><input class="input" name="alias" required maxlength="40" value="${h(m.alias)}"><span class="hint">Deve essere unico nel gruppo: puoi correggerlo.</span></label>
      <div class="field"><span>Relazione</span>${relationPicker('relation', m.relation)}</div>
      <div class="field"><span>Permesso</span>${roleSeg('role', 'member')}<span class="hint">I partecipanti usano liste, ricette e spese ma non gestiscono i membri.</span></div>
      <p class="err" id="rv-err"></p>
      <div class="actions"><button type="button" class="btn" id="rv-no">Rifiuta</button><button class="btn primary">Accetta</button></div>
      <div class="actions"><button type="button" class="btn danger" id="rv-block">Rifiuta e blocca</button></div>
    </form>`, (sh) => {
    const f = $('#rv', sh);
    bindRelationPicker(f, 'relation');
    bindSeg(f, 'role');
    const done = (msg) => { closeSheet(); toast(msg); refreshMembers(); };
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api('POST', `/api/members/${m.id}/approve`, { alias: f.elements.alias.value.trim(), relation: f.elements.relation.value, role: f.elements.role.value });
        done(`${f.elements.alias.value.trim()} è entrato nel gruppo`);
      } catch (x) { $('#rv-err', sh).textContent = x.message; }
    };
    $('#rv-no', sh).onclick = async () => { try { await api('POST', `/api/members/${m.id}/reject`, {}); done('Richiesta rifiutata'); } catch (x) { $('#rv-err', sh).textContent = x.message; } };
    $('#rv-block', sh).onclick = async () => {
      if (!confirm(`Rifiutare e bloccare ${m.alias}? Non potrà ripetere la richiesta con la stessa email.`)) return;
      try { await api('POST', `/api/members/${m.id}/reject`, { block: true }); done('Richiesta rifiutata e bloccata'); } catch (x) { $('#rv-err', sh).textContent = x.message; }
    };
  });
}

function memberSheet(m) {
  const me = st.me && m.id === st.me.id;
  const admin = isAdmin() && !me;
  const status = m.online ? (m.viewing && st.lists.get(m.viewing) ? `online · nella lista "${st.lists.get(m.viewing).name}"` : 'online ora') : m.last_seen ? 'visto ' + fmtAgo(m.last_seen) : '';
  openSheet(`<div class="req-head">${avatar(m, 'xl')}<div><b>${h(m.alias)}${me ? ' (tu)' : ''}</b><small class="muted">${h([relLabel(m.relation), roleLabel(m.role)].filter(Boolean).join(' · '))}<br>${h(status)}${m.joined_at ? ' · nel gruppo da ' + h(fmtDate(m.joined_at, { month: 'long', year: 'numeric' })) : ''}${m.email ? '<br>' + h(m.email) + (m.email_verified ? ' ✓' : '') : ''}</small></div></div>
    ${admin ? `<form id="ms">
      <div class="field"><span>Permesso</span>${roleSeg('role', m.role)}</div>
      <div class="field"><span>Relazione</span>${relationPicker('relation', m.relation)}</div>
      <p class="err" id="ms-err"></p>
      <div class="actions"><button type="button" class="btn" data-close>Annulla</button><button class="btn primary">Salva</button></div>
      <div class="actions"><button type="button" class="btn danger" id="ms-rm">Rimuovi dal gruppo</button></div></form>`
    : me ? `<div class="actions"><a class="btn block" href="#/s">Cambia il tuo nome</a></div>` : '<p class="muted small">Solo gli amministratori possono cambiare permessi e relazioni.</p>'}`, (sh) => {
    const f = $('#ms', sh);
    if (!f) return;
    bindRelationPicker(f, 'relation');
    bindSeg(f, 'role');
    f.onsubmit = async (e) => {
      e.preventDefault();
      try { await api('PATCH', `/api/members/${m.id}`, { role: f.elements.role.value, relation: f.elements.relation.value }); closeSheet(); toast('Salvato'); refreshMembers(); }
      catch (x) { $('#ms-err', sh).textContent = x.message; }
    };
    $('#ms-rm', sh).onclick = async () => {
      if (!confirm(`Rimuovere ${m.alias} dal gruppo? Perderà subito l'accesso a liste, ricette e spese. Quello che ha aggiunto resta.`)) return;
      try { await api('POST', `/api/members/${m.id}/remove`, {}); closeSheet(); toast(`${m.alias} è stato rimosso`); refreshMembers(); }
      catch (x) { $('#ms-err', sh).textContent = x.message; }
    };
  });
}

// --------------------------------------------------------------- inviti
function inviteSheet() {
  const code = inviteCode();
  const codeLink = `${location.origin}/?join=${encodeURIComponent(code)}`;
  const approval = !st.household || st.household.require_approval !== false;
  const share = async (url, text) => {
    if (navigator.share) { try { await navigator.share({ title: 'Sporta', text, url }); return; } catch { return; } }
    try { await navigator.clipboard.writeText(url); toast('Link copiato'); } catch { prompt('Copia il link:', url); }
  };
  openSheet(`<h2>Invita in ${h(groupName())}</h2>
    ${isAdmin() && tokenFor(st.code) ? `<div class="opt on"><b>Link personale</b><small>Entra subito, senza approvazione. Vale per una persona e scade tra 7 giorni.</small>
      <form id="iv"><div class="field" style="margin-bottom:8px">${relationPicker('relation', 'amico')}</div>
      <div class="field" style="margin-bottom:10px">${roleSeg('role', 'member')}</div>
      <div id="iv-out"></div><button class="btn primary block" id="iv-make">Crea link personale</button>
      ${serverConfig.email ? `<div class="or">oppure invialo per email</div>
        <div class="row"><input class="input" id="iv-email" type="email" inputmode="email" placeholder="nome@esempio.it"><button type="button" class="btn" id="iv-send">Invia</button></div>` : ''}</form></div>` : ''}
    <div class="opt"><b>Codice del gruppo</b><small>${approval ? 'Chi lo usa <i>chiede</i> di entrare: un amministratore deve accettarlo.' : 'Chi lo usa entra subito nel gruppo.'}</small>
      <div class="code">${h(code)}</div>
      <div class="actions"><button class="btn" id="iv-copy">Copia link</button><button class="btn primary" id="iv-share">Condividi</button></div></div>`, (sh) => {
    $('#iv-copy', sh).onclick = async () => { try { await navigator.clipboard.writeText(codeLink); toast('Link copiato'); } catch { prompt('Copia il link:', codeLink); } };
    $('#iv-share', sh).onclick = () => share(codeLink, `Ti invito nel gruppo "${groupName()}" su Sporta: apri il link e presentati. (Codice: ${code})`);
    const f = $('#iv', sh);
    if (!f) return;
    bindRelationPicker(f, 'relation');
    bindSeg(f, 'role');
    const send = $('#iv-send', sh);
    if (send) send.onclick = async () => {
      const email = $('#iv-email', sh).value.trim();
      if (!email) return $('#iv-email', sh).focus();
      send.disabled = true;
      try { await api('POST', '/api/invites', { email, relation: f.elements.relation.value, role: f.elements.role.value }); toast(`Invito inviato a ${email}`); $('#iv-email', sh).value = ''; }
      catch (x) { toast(x.message); }
      send.disabled = false;
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const j = await api('POST', '/api/invites', { relation: f.elements.relation.value, role: f.elements.role.value });
        const url = `${location.origin}/?invite=${encodeURIComponent(j.token)}`;
        $('#iv-out', sh).innerHTML = `<div class="code small-code">${h(url)}</div>
          <div class="actions" style="margin-bottom:8px"><button type="button" class="btn" id="iv-c2">Copia</button><button type="button" class="btn primary" id="iv-s2">Condividi</button></div>`;
        $('#iv-make', sh).hidden = true;
        $('#iv-c2', sh).onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link copiato'); } catch { prompt('Copia il link:', url); } };
        $('#iv-s2', sh).onclick = () => share(url, `Ti invito nel gruppo "${groupName()}" su Sporta: apri il link e scrivi il tuo nome.`);
      } catch (x) { toast(x.message); }
    };
  });
}

// Chi sta guardando la stessa lista (escluso me): avatar nell'intestazione della lista.
function listViewers(listId) {
  const meId = st.me && st.me.id;
  return [...st.members.values()].filter((m) => m.status === 'active' && m.online && m.viewing === listId && m.id !== meId);
}
function viewersHtml(listId) {
  const v = listViewers(listId);
  if (!v.length) return '';
  const names = v.map((m) => m.alias);
  const title = names.length === 1 ? `${names[0]} sta guardando questa lista` : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]} stanno guardando questa lista`;
  return `<span class="stack" title="${h(title)}" aria-label="${h(title)}">${v.slice(0, 4).map((m) => avatar(m, 'sm')).join('')}</span>`;
}
