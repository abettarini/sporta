'use strict';
/* Sporta — benvenuto, impostazioni (nome, gruppi, inviti, installazione) e avvio. */

Views.welcome = {
  mount() {
    const join = new URLSearchParams(location.search).get('join') || '';
    app.innerHTML = `<div class="welcome">
      <img class="logo" src="/icons/icon-192.png" alt="">
      <h1>Sporta</h1>
      <p>La lista della spesa condivisa con la famiglia, gli amici o la squadra: aggiornata in tempo reale, con le tue ricette.</p>
      <label class="field"><span>Il tuo nome</span>
        <input class="input" id="w-name" autocomplete="given-name" placeholder="es. Marco" value="${h(st.member)}"></label>
      <div class="card">
        <h3>Hai un codice d'invito?</h3>
        <form id="w-join">
          <input class="input" id="w-code" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" value="${h(join)}">
          <button class="btn primary block" style="margin-top:10px">Unisciti al gruppo</button>
        </form>
      </div>
      <div class="card">
        <h3>…oppure crea un gruppo</h3>
        <form id="w-new">
          <input class="input" id="w-fam" placeholder="es. Casa Rossi, Calcetto, Festa di Anna">
          <button class="btn block" style="margin-top:10px">Crea un nuovo gruppo</button>
        </form>
      </div>
      <p class="err" id="w-err"></p>
    </div>`;
    const err = (m) => { $('#w-err').textContent = m; };
    const saveName = () => {
      const n = $('#w-name').value.trim();
      if (!n) { err('Inserisci il tuo nome: serve per vedere chi ha aggiunto cosa.'); $('#w-name').focus(); return false; }
      st.member = n; ls.set('member', n); return true;
    };
    const enter = (j) => {
      addGroup(j);
      history.replaceState(null, '', '/#/');
      mount();
    };
    $('#w-join').onsubmit = async (e) => {
      e.preventDefault();
      if (!saveName()) return;
      try { enter(await joinGroup($('#w-code').value)); } catch (x) { err(x.message); }
    };
    $('#w-new').onsubmit = async (e) => {
      e.preventDefault();
      if (!saveName()) return;
      try {
        enter(await createGroup($('#w-fam').value.trim()));
        toast('Gruppo creato! Invita gli altri da Altro');
      } catch (x) { err(x.message); }
    };
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
      <a class="card link-card" href="#/p"><span class="emoji">🏷️</span><span class="t"><b>Prodotti</b><span>Catalogo, reparti, tag e prodotti abituali</span></span><span class="chev">›</span></a>
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
      const data = { title: 'Sporta', text: `Unisciti al gruppo "${groupName()}" su Sporta (codice ${st.code})`, url: link() };
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
    if (!st.groups.some((g) => g.code === join.toUpperCase())) {
      joinGroupSheet();
      const input = document.querySelector('#jg [name="gcode"]');
      if (input) input.value = join;
    } else switchGroup(join.toUpperCase());
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
