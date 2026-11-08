'use strict';
/* Sporta — benvenuto, impostazioni (nome, gruppi, inviti, installazione) e avvio. */

// Primo accesso. Tre percorsi:
//  - link d'invito con codice valido -> solo il proprio nome (alias);
//  - "Ho un codice" (o link senza codice valido) -> 1) codice, 2) nome;
//  - "Crea un gruppo" -> nome + nome del gruppo/famiglia.
const focusLater = (sel) => setTimeout(() => { const el = $(sel); if (el) el.focus(); }, 50);

Views.welcome = {
  mount() {
    this.code = null; this.group = null; this.err = ''; this.fromLink = false; this.prefill = '';
    const join = new URLSearchParams(location.search).get('join');
    if (join == null) return this.show('start');
    this.fromLink = true;
    const code = normCode(join);
    if (cleanCode(code).length !== CODE_LEN) { this.fromLink = false; this.err = 'Il link non contiene un codice valido: inseriscilo qui.'; this.prefill = code; return this.show('code'); }
    this.show('checking');
    previewGroup(code)
      .then((name) => { this.code = code; this.group = name; this.show('alias'); })
      .catch((e) => { this.fromLink = false; this.err = e.message === 'Codice non valido.' ? 'Il link non contiene un codice valido: inseriscilo qui.' : e.message; this.prefill = code; this.show('code'); });
  },
  show(step) {
    this.step = step;
    const back = (to) => `<button type="button" class="icon-btn wback" data-to="${to}" aria-label="Indietro">${I.back}</button>`;
    const err = `<p class="err" id="w-err">${h(this.err || '')}</p>`;
    const steps = (n) => `<div class="steps-dots"><span class="${n === 1 ? 'on' : ''}"></span><span class="${n === 2 ? 'on' : ''}"></span></div>`;
    let body = '';
    if (step === 'start') {
      body = `<img class="logo" src="/icons/icon-192.png" alt="">
        <h1>Sporta</h1>
        <p>La lista della spesa condivisa con la famiglia, gli amici o la squadra: aggiornata in tempo reale, con le tue ricette.</p>
        <button class="btn primary block lg" data-to="code">Ho un codice d'invito</button>
        <button class="btn block lg" data-to="create" style="margin-top:10px">Crea un nuovo gruppo</button>
        <p class="muted small center" style="margin-top:18px">Se qualcuno ti ha invitato, apri il link che ti ha mandato: basterà scrivere il tuo nome.</p>`;
    } else if (step === 'checking') {
      body = `<div class="empty">${emptyArt('link')}Verifico l'invito…</div>`;
    } else if (step === 'code') {
      body = `${back('start')}${steps(1)}
        <h2>Inserisci il codice d'invito</h2>
        <p class="muted">Lo trovi nel messaggio di chi ti ha invitato. Basta scrivere lettere e numeri: maiuscole e trattini si mettono da soli.</p>
        <form id="w-code-f"><input class="input" id="w-code" placeholder="XXXX-XXXX-XXXX" value="${h(this.prefill || '')}">
        ${err}<button class="btn primary block lg" id="w-next">Continua</button></form>`;
    } else if (step === 'alias') {
      body = `${this.fromLink ? '' : back('code')}${this.fromLink ? '' : steps(2)}
        <div class="invite-card">${groupAvatar(this.group)}<small>${this.fromLink ? 'Sei stato invitato nel gruppo' : 'Stai entrando nel gruppo'}</small><b>${h(this.group)}</b></div>
        <form id="w-alias-f"><label class="field"><span>Come ti chiami?</span>
          <input class="input" id="w-name" required maxlength="40" autocomplete="given-name" placeholder="es. Marco" value="${h(st.member)}"></label>
          <p class="hint">È il nome che gli altri vedranno sugli articoli che aggiungi o prendi.</p>
          ${err}<button class="btn primary block lg">Entra nel gruppo</button></form>
        ${this.fromLink ? `<button class="btn ghost block" data-to="code" style="margin-top:8px">Non è il tuo invito? Inserisci un altro codice</button>` : ''}`;
    } else if (step === 'create') {
      body = `${back('start')}
        <h2>Crea un gruppo</h2>
        <p class="muted">Una famiglia, la squadra di calcetto, una festa… Poi potrai invitare gli altri con un link.</p>
        <form id="w-create-f">
          <label class="field"><span>Il tuo nome</span><input class="input" id="w-name" required maxlength="40" autocomplete="given-name" placeholder="es. Marco" value="${h(st.member)}"></label>
          <label class="field"><span>Nome del gruppo o famiglia</span><input class="input" id="w-fam" required maxlength="80" placeholder="es. Casa Rossi, Calcetto, Festa di Anna"></label>
          ${err}<button class="btn primary block lg">Crea il gruppo</button></form>`;
    }
    app.innerHTML = `<div class="welcome">${body}</div>`;
    this.err = '';
    app.querySelectorAll('[data-to]').forEach((b) => {
      b.onclick = () => { if (b.dataset.to === 'code') this.prefill = ''; this.fromLink = this.fromLink && b.dataset.to !== 'code'; this.show(b.dataset.to); };
    });
    const fail = (m) => { $('#w-err').textContent = m; };
    const saveName = () => {
      const n = $('#w-name').value.trim();
      if (!n) { fail('Scrivi il tuo nome.'); $('#w-name').focus(); return false; }
      st.member = n; ls.set('member', n); return true;
    };
    const enter = (j) => { addGroup(j); history.replaceState(null, '', '/#/'); mount(); };
    if (step === 'code') {
      const next = $('#w-next');
      bindCodeInput($('#w-code'), (complete) => { next.disabled = !complete; });
      focusLater('#w-code');
      $('#w-code-f').onsubmit = async (e) => {
        e.preventDefault();
        next.disabled = true;
        try {
          const code = normCode($('#w-code').value);
          this.group = await previewGroup(code);
          this.code = code;
          this.show('alias');
        } catch (x) { fail(x.message); next.disabled = false; }
      };
    }
    if (step === 'alias') {
      if (!st.member) focusLater('#w-name');
      $('#w-alias-f').onsubmit = async (e) => {
        e.preventDefault();
        if (!saveName()) return;
        try { enter(await joinGroup(this.code)); toast(`Benvenuto nel gruppo "${this.group}"`); } catch (x) { fail(x.message); }
      };
    }
    if (step === 'create') {
      focusLater(st.member ? '#w-fam' : '#w-name');
      $('#w-create-f').onsubmit = async (e) => {
        e.preventDefault();
        if (!saveName()) return;
        const fam = $('#w-fam').value.trim();
        if (!fam) { fail('Dai un nome al gruppo.'); return; }
        try { enter(await createGroup(fam)); toast('Gruppo creato! Invita gli altri da Altro'); } catch (x) { fail(x.message); }
      };
    }
  },
};

let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (view === Views.settings) Views.settings.update(); });

Views.settings = {
  mount() {
    app.innerHTML = topBar('Altro') + `<main class="settings">
      <div class="card"><h3>Il tuo nome</h3>
        <p>Viene mostrato agli altri sugli articoli che aggiungi o prendi.</p>
        <input class="input" id="sn" value="${h(st.member)}" maxlength="40"></div>
      <a class="card link-card" href="#/p">${iconTile('tag')}<span class="t"><b>Prodotti</b><span>Catalogo, reparti, tag e prodotti abituali</span></span><span class="chev">›</span></a>
      <div class="card"><h3>Gruppo attuale</h3>
        <label class="field"><span>Nome</span><input class="input" id="hn" maxlength="80"></label>
        <p>Per invitare qualcuno condividi il link o il codice: chi lo inserisce vede e modifica liste, ricette e spese di questo gruppo.</p>
        <div class="code" id="hc"></div>
        <div class="actions"><button class="btn" id="copy">Copia link</button><button class="btn primary" id="share">Condividi invito</button></div>
      </div>
      <div class="card"><h3>I tuoi gruppi</h3>
        <p>Puoi far parte di più gruppi: la famiglia, gli amici del calcetto, un evento…</p>
        <div id="groups"></div>
        <div class="actions"><button class="btn" id="g-join">Unisciti con codice</button><button class="btn primary" id="g-new">Nuovo gruppo</button></div>
      </div>
      <div class="card" id="inst"></div>
      <p class="muted small center">Sporta v${h(window.SPORTA_VERSION || 'dev')}</p>
    </main>` + tabBar('settings');
    $('#sn').onchange = (e) => { const v = e.target.value.trim(); if (v) { st.member = v; ls.set('member', v); toast('Nome salvato'); } };
    $('#hn').onchange = (e) => {
      const v = e.target.value.trim(); if (!v) return;
      enqueue({ k: 'hh.put', id: 'hh', data: { name: v } }, { silent: true });
      const g = st.groups.find((x) => x.code === st.code);
      if (g) { g.name = v; ls.setJson('groups', st.groups); }
      toast('Nome del gruppo salvato');
      this.update();
    };
    const link = () => `${location.origin}/?join=${encodeURIComponent(st.code)}`;
    $('#copy').onclick = async () => {
      try { await navigator.clipboard.writeText(link()); toast('Link copiato'); } catch { prompt('Copia il link:', link()); }
    };
    $('#share').onclick = async () => {
      const data = { title: 'Sporta', text: `Ti invito nel gruppo "${groupName()}" su Sporta: apri il link e scrivi il tuo nome. (Codice: ${st.code})`, url: link() };
      if (navigator.share) { try { await navigator.share(data); } catch { /* annullato */ } } else $('#copy').click();
    };
    $('#g-new').onclick = () => newGroupSheet();
    $('#g-join').onclick = () => joinGroupSheet();
    $('#groups').onclick = (e) => {
      const leave = e.target.closest('[data-leave]');
      if (leave) {
        const g = st.groups.find((x) => x.code === leave.dataset.leave);
        if (confirm(`Uscire dal gruppo "${g.name}" su questo telefono? Il gruppo resta per gli altri e potrai rientrare con il codice.`)) leaveGroup(g.code);
        return;
      }
      const sw = e.target.closest('[data-switch]');
      if (sw) switchGroup(sw.dataset.switch, '#/s');
    };
    this.update();
  },
  update() {
    const hn = $('#hn');
    if (hn && document.activeElement !== hn) hn.value = groupName();
    if ($('#hc')) $('#hc').textContent = st.code;
    $('#groups').innerHTML = st.groups.map((g) => `<div class="group-row">
      <button class="row-btn" data-switch="${h(g.code)}"><span class="avatar">${h((g.name || '?').slice(0, 1).toUpperCase())}</span>
        <span class="t">${h(g.name)}${g.code === st.code ? ' <small>(attuale)</small>' : ''}</span></button>
      <button class="btn ghost danger-text" data-leave="${h(g.code)}">Esci</button></div>`).join('');
    const inst = $('#inst'); if (!inst) return;
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    inst.hidden = standalone;
    inst.innerHTML = `<h3>Installa l'app</h3>` + (installEvt
      ? `<p>Aggiungila alla schermata Home per aprirla come un'app.</p><button class="btn primary" id="ib">Installa</button>`
      : ios ? `<p>In Safari tocca <b>Condividi</b> e poi <b>Aggiungi alla schermata Home</b>.</p>`
        : `<p>Dal menu del browser scegli <b>Installa app</b> o <b>Aggiungi a schermata Home</b>.</p>`);
    const ib = $('#ib');
    if (ib) ib.onclick = async () => { installEvt.prompt(); await installEvt.userChoice.catch(() => null); installEvt = null; this.update(); };
  },
};

// =============================================================== avvio
(function start() {
  if (st.code) {
    loadGroupFromCache();
    // Apertura rapida: si riparte dall'ultima lista usata.
    const last = ls.get('lastList.' + st.code);
    if (location.pathname === '/' && !location.hash && last && st.lists.has(last)) history.replaceState(null, '', '/#/l/' + last);
    connect();
    flush();
  }
  mount();
  // Link d'invito aperto da chi è già in altri gruppi.
  const join = new URLSearchParams(location.search).get('join');
  if (join && st.code) {
    history.replaceState(null, '', '/' + location.hash);
    const code = normCode(join);
    if (st.groups.some((g) => g.code === code)) switchGroup(code);
    else joinGroupSheet(code);
  }
  setupServiceWorker();
})();

// =============================================================== aggiornamenti dell'app
// Il service worker installa la nuova versione in background e la tiene in attesa:
// qui mostriamo l'avviso e, su richiesta, la attiviamo e ricarichiamo la pagina.
let updateRequested = false;

function showUpdateBar(worker) {
  let bar = $('#update-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'update-bar';
    bar.setAttribute('role', 'status');
    document.body.appendChild(bar);
  }
  bar.innerHTML = '<span>È disponibile una nuova versione di Sporta</span><button type="button">Aggiorna</button>';
  bar.querySelector('button').onclick = (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Aggiorno…';
    // Le modifiche non ancora inviate restano salvate e ripartono dopo il ricaricamento.
    writeCache();
    saveOutbox();
    updateRequested = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
  };
}

async function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let reg;
  try {
    // updateViaCache 'none': sw.js e version.js vengono sempre riscaricati per il controllo.
    reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
  } catch { return; }
  const track = (w) => {
    if (!w) return;
    w.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdateBar(w);
    });
  };
  if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg.waiting);
  track(reg.installing);
  reg.addEventListener('updatefound', () => track(reg.installing));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) { updateRequested = false; location.reload(); }
  });
  const check = () => reg.update().catch(() => {});
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  setInterval(check, 30 * 60 * 1000);
}
