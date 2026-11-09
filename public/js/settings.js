'use strict';
/* Sporta — impostazioni (gruppo, nome, inviti, ingresso, installazione), avvio e aggiornamenti. */

let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (view === Views.settings) Views.settings.update(); });

Views.settings = {
  mount() {
    app.innerHTML = topBar('Altro') + `<main class="settings wide">
      <div class="card"><h3>Gruppo attuale</h3>
        <div id="hn-box"></div>
        <form id="sn-f" class="inline-edit"><label class="field"><span>Il tuo nome in questo gruppo</span>
          <span class="row"><input class="input" id="sn" required maxlength="40" autocomplete="given-name"><button class="btn primary" id="sn-save" disabled>Salva</button></span></label>
          <p class="hint" id="sn-hint">È il nome che gli altri vedono su ciò che aggiungi o prendi: lo storico si aggiorna da solo. In ogni gruppo puoi usarne uno diverso.</p></form>
        <div class="me-line" id="me-line"></div>
      </div>
      <a class="card link-card" href="#/a" id="acc-card">${iconTile('persona')}<span class="t"><b>Il tuo account</b><span id="acc-sub"></span></span><span class="chev">›</span></a>
      <div class="card" id="prof"><h3>Il tuo profilo in questo gruppo</h3>
        <label class="switch"><input type="checkbox" id="hide"><span>Non mostrare quando sono online</span></label>
        <div class="sig-row"><span><b>Firma delle ricette pubbliche</b><small id="sig-v"></small></span><button type="button" class="btn" id="sig">Cambia</button></div>
      </div>
      <div class="card" id="ntf"></div>
      <a class="card link-card" href="#/m" id="mb-card">${iconTile('home')}<span class="t"><b>Membri <i class="tab-badge inline" data-badge hidden></i></b><span id="mb-sub">Chi c'è nel gruppo, inviti e richieste</span></span><span class="chev">›</span></a>
      <a class="card link-card narrow-only" href="#/t">${iconTile('receipt')}<span class="t"><b>Spese</b><span>Storico delle spese concluse</span></span><span class="chev">›</span></a>
      <a class="card link-card" href="#/p">${iconTile('tag')}<span class="t"><b>Prodotti</b><span>Catalogo, reparti, tag e prodotti abituali</span></span><span class="chev">›</span></a>
      ${st.platformAdmin ? `<a class="card link-card" href="#/admin">${iconTile('note')}<span class="t"><b>Segnalazioni</b><span>Ricette pubbliche segnalate (solo amministratori)</span></span><span class="chev">›</span></a>` : ''}
      <div class="card" id="inv-card"><h3>Invita</h3>
        <p id="inv-p"></p>
        <div class="code" id="hc"></div>
        <div class="actions"><button class="btn primary block" id="inv">Invita qualcuno</button></div>
      </div>
      <div class="card" id="adm" hidden><h3>Ingresso nel gruppo</h3>
        <label class="switch"><input type="checkbox" id="appr"><span>Chi usa il codice deve essere accettato</span></label>
        <p>Se lo spegni, chi ha il codice entra subito (comodo per un evento). I link personali entrano sempre senza approvazione.</p>
        <button class="btn" id="regen">Rigenera il codice</button>
        <p class="hint">Il vecchio codice smette di funzionare; chi è già nel gruppo non è toccato.</p>
        <button class="btn danger-text" id="del-group" style="margin-top:14px">Elimina il gruppo</button>
      </div>
      <div class="card"><h3>I tuoi gruppi</h3>
        <p>Puoi far parte di più gruppi: la famiglia, gli amici del calcetto, un evento…</p>
        <div id="groups"></div>
        <div class="actions"><button class="btn" id="g-join">Unisciti con codice</button><button class="btn primary" id="g-new">Nuovo gruppo</button></div>
      </div>
      <div class="card" id="inst"></div>
      <div class="card logout-card"><button class="btn block danger-text" id="logout">${I.logout} Esci da Sporta su questo dispositivo</button>
        <p class="hint center" id="logout-hint"></p></div>
      <p class="muted small center">Sporta v${h(window.SPORTA_VERSION || 'dev')}</p>
    </main>` + tabBar('settings');
    // --- firma delle ricette pubbliche (per questo gruppo)
    const sigShow = () => { $('#sig-v').textContent = `“${authorLabel(myAuthor())}”${st.me && st.me.author_name != null ? '' : ' (proposta)'} · vale per le prossime pubblicazioni`; };
    sigShow();
    $('#sig').onclick = () => authorSheet({ done: async (a) => { try { await api('PATCH', '/api/me', { author_name: a }); toast('Firma aggiornata'); } catch (e) { toast(e.message); } sigShow(); } });
    // --- il mio nome in questo gruppo
    const sn = $('#sn'), snSave = $('#sn-save');
    sn.value = st.member;
    sn.oninput = () => { const v = sn.value.trim(); snSave.disabled = !v || v === st.member; };
    $('#sn-f').onsubmit = async (e) => {
      e.preventDefault();
      const v = sn.value.trim(); if (!v || v === st.member) return;
      if (!tokenFor(st.code)) return toast('Un momento: sto collegando questo telefono al gruppo');
      try {
        await api('PATCH', '/api/me', { alias: v });
        setMember(v);
        snSave.disabled = true; sn.blur();
        toast('Nome aggiornato, anche su articoli e spese');
        refreshMembers();
      } catch (x) { toast(x.message); }
    };
    $('#inv').onclick = () => inviteSheet();
    $('#hide').onchange = async (e) => {
      try { const j = await api('PATCH', '/api/me', { hide_presence: e.target.checked }); st.me = { ...st.me, ...j.me }; toast(e.target.checked ? 'Gli altri non vedranno quando sei online' : 'Gli altri vedranno quando sei online'); }
      catch (x) { e.target.checked = !e.target.checked; toast(x.message); }
    };
    $('#appr').onchange = async (e) => {
      try { await api('PATCH', '/api/household', { require_approval: e.target.checked }); toast(e.target.checked ? 'Chi usa il codice dovrà essere accettato' : 'Chi ha il codice entra subito'); this.update(); }
      catch (x) { e.target.checked = !e.target.checked; toast(x.message); }
    };
    $('#del-group').onclick = () => deleteGroupSheet();
    $('#regen').onclick = async () => {
      if (!confirm('Generare un nuovo codice? Il codice attuale e i link che lo contengono smetteranno di funzionare.')) return;
      try { await api('POST', '/api/household/code', {}); toast('Nuovo codice creato'); this.update(); } catch (x) { toast(x.message); }
    };
    $('#g-new').onclick = () => newGroupSheet();
    $('#logout').onclick = () => logoutDevice();
    $('#g-join').onclick = () => joinGroupSheet();
    $('#groups').onclick = async (e) => {
      const leave = e.target.closest('[data-leave]');
      if (leave) {
        const g = groupOf(leave.dataset.leave);
        if (!confirm(`Uscire dal gruppo "${g.name}"? Il gruppo resta per gli altri; per rientrare servirà un nuovo invito.`)) return;
        try { await leaveGroup(g.code); toast(`Sei uscito da "${g.name}"`); } catch (x) { toast(x.message); }
        return;
      }
      const sw = e.target.closest('[data-switch]');
      if (sw) switchGroup(sw.dataset.switch, '#/s');
    };
    refreshMembers();
    this.update();
  },
  update() {
    const admin = isAdmin();
    const box = $('#hn-box');
    const hnFocused = document.activeElement && document.activeElement.id === 'hn';
    if (box && !hnFocused) {
      box.outerHTML = admin
        ? `<form id="hn-box" class="inline-edit"><label class="field"><span>Nome del gruppo</span>
            <span class="row"><input class="input" id="hn" required maxlength="80" value="${h(groupName())}"><button class="btn primary" id="hn-save" disabled>Salva</button></span></label></form>`
        : `<div id="hn-box" class="field"><span>Nome del gruppo</span><div class="ro">${h(groupName())}</div><p class="hint">Solo gli amministratori possono cambiarlo.</p></div>`;
    }
    // Nome del gruppo (solo amministratori): il riquadro può essere stato ridisegnato, ricollego gli eventi.
    const nb = $('#hn-box');
    if (nb && nb.tagName === 'FORM' && !nb.dataset.bound) {
      nb.dataset.bound = '1';
      nb.onsubmit = async (e) => {
        e.preventDefault();
        const hn = $('#hn'); const v = hn.value.trim(); if (!v || v === groupName()) return;
        try { await api('PATCH', '/api/household', { name: v }); const g = groupOf(st.code); if (g) { g.name = v; saveGroups(); } hn.blur(); toast('Nome del gruppo aggiornato per tutti'); this.update(); }
        catch (x) { toast(x.message); }
      };
      nb.oninput = () => { const hn = $('#hn'); $('#hn-save').disabled = !hn.value.trim() || hn.value.trim() === groupName(); };
    }
    const me = st.me;
    $('#me-line').innerHTML = me ? `${avatar({ ...me, online: st.live })}<span>${h(roleLabel(me.role))}${me.relation ? ' · ' + h(relLabel(me.relation)) : ''}</span>` : '';
    const n = [...st.members.values()].filter((m) => m.status === 'active');
    const on = n.filter((m) => m.online).length;
    $('#mb-sub').textContent = n.length ? `${n.length} ${n.length === 1 ? 'persona' : 'persone'}${on ? ` · ${on} online` : ''}${pendingRequests() ? ` · ${pendingRequests()} ${pendingRequests() === 1 ? 'richiesta' : 'richieste'} in attesa` : ''}` : "Chi c'è nel gruppo, inviti e richieste";
    const approval = !st.household || st.household.require_approval !== false;
    $('#hc').textContent = inviteCode();
    $('#inv-p').textContent = admin
      ? 'Crea un link personale (entra subito) oppure condividi il codice del gruppo.'
      : (approval ? 'Condividi il codice del gruppo: chi lo usa chiede di entrare e un amministratore lo accetta.' : 'Condividi il codice del gruppo: chi lo usa entra subito.');
    // Gruppo personale: niente membri, inviti, ingresso, presenza.
    const personal = isPersonal();
    $('#adm').hidden = !admin || !tokenFor(st.code) || personal;
    $('#prof').hidden = !st.me || personal;
    $('#mb-card').hidden = personal;
    $('#inv-card').hidden = personal;
    $('#logout-hint').textContent = acct ? `Entrato come ${acct.email}. I tuoi gruppi restano: per ritrovarli basta entrare di nuovo con la tua email.` : 'Le liste restano nei gruppi; su questo dispositivo verranno cancellate.';
    $('#acc-sub').textContent = acct ? `${acct.email} · dispositivi, i tuoi dati` : 'Conferma la tua email';
    $('#acc-card').onclick = (e) => { if (!acct) { e.preventDefault(); confirmEmailSheet(); } };
    const ntf = $('#ntf');
    if (ntf && !ntf.contains(document.activeElement)) { ntf.innerHTML = notifyCardHtml(); bindNotifyCard(ntf, () => this.update()); }
    if (st.me && document.activeElement !== $('#hide')) $('#hide').checked = !!st.me.hide_presence;
    $('#appr').checked = approval;
    $('#groups').innerHTML = orderedGroups().map((g) => `<div class="group-row">
      <button class="row-btn" data-switch="${h(g.code)}">${groupBadge(g)}
        <span class="t">${h(g.name)}${g.code === st.code ? ' <small>(attuale)</small>' : ''}<small class="as">${g.personal ? 'solo tuo: liste, ricette, eventi personali' : g.status === 'pending' ? 'richiesta in attesa' : memberFor(g.code) ? 'sei ' + h(memberFor(g.code)) + (g.role === 'admin' ? ' · amministratore' : '') : ''}</small></span></button>
      ${g.personal ? '' : `<button class="btn ghost danger-text" data-leave="${h(g.code)}">Esci</button>`}</div>`).join('');
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
    connect();
    flush();
  }
  const q = new URLSearchParams(location.search);
  // Link "Entra in Sporta" dell'email del codice.
  if (q.get('auth')) {
    history.replaceState(null, '', '/#/');
    app.innerHTML = `<div class="welcome"><div class="empty">${emptyArt('link')}Entro in Sporta…</div></div>`;
    verifyLogin({ link: q.get('auth') }).then((res) => {
      if (res.groups.length) {
        if (!res.account.terms_ok) { adoptGroups(res.groups); return mount(); }
        adoptGroups(res.groups); mount(); toast('Bentornato: i tuoi gruppi sono su questo dispositivo');
      } else { mount(); }
    }).catch((x) => { mount(); toast(x.message); });
  } else mount();
  syncAccount(true);
  setTimeout(maybeAskConfirm, 1500);
  // Link d'invito aperto da chi è già in altri gruppi.
  if ((q.get('join') || q.get('invite')) && st.code && !st.notice) {
    history.replaceState(null, '', '/' + location.hash);
    if (q.get('invite')) joinGroupSheet({ invite: q.get('invite') });
    else {
      const code = normCode(q.get('join'));
      const g = st.groups.find((x) => x.code === code || (st.household && st.household.code === code && x.code === st.code));
      if (g) switchGroup(g.code); else joinGroupSheet(code);
    }
  }
  setupServiceWorker();
  // Panoramica di tutti i gruppi e iscrizione alle notifiche (se attive su questo dispositivo).
  setTimeout(() => { refreshOverview(true); syncPush(); }, 800);
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
