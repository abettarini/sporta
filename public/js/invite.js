'use strict';
/* Sporta — pagina pubblica di un evento (/e/<codice>): chi è invitato vede l'evento e risponde
   con il solo nome (Ci sono / Forse / Non ci sono, con eventuali ospiti), senza account.
   La risposta si ricorda su questo dispositivo; il link personale (/e/<codice>?r=<chiave>)
   permette di cambiarla da un altro. Chi usa già Sporta può aggiungere l'evento a un suo gruppo. */

const guestKey = (token) => 'guest.' + token;

Views.publicEvent = {
  async mount() {
    const token = this.route.token;
    // Arrivato con il link personale: la chiave si ricorda qui e sparisce dall'indirizzo.
    const q = new URLSearchParams(location.search);
    if (q.get('r')) {
      ls.setJson(guestKey(token), { ...ls.json(guestKey(token), {}), edit: q.get('r') });
      history.replaceState(null, '', location.pathname);
    }
    this.token = token;
    this.editing = false;
    this.form = { rsvp: 'yes', guests: 0, name: '' };
    app.innerHTML = `<div class="pub-page"><div class="pub-wrap" id="pe"><div class="empty">Caricamento…</div></div></div>`;
    prepareProof().catch(() => {});
    await this.load();
  },
  async load() {
    const saved = ls.json(guestKey(this.token), {});
    try {
      const r = await fetch(`/api/public/events/${encodeURIComponent(this.token)}${saved.edit ? '?edit=' + encodeURIComponent(saved.edit) : ''}`);
      const j = await r.json();
      if (!r.ok) throw Object.assign(new Error(j.error), { code: j.code });
      this.data = j;
      if (saved.edit && !j.mine) ls.setJson(guestKey(this.token), { name: saved.name || '' }); // risposta tolta da chi organizza
    } catch (e) {
      this.data = null;
      this.error = e.code === 'bad_link' ? 'invalid' : 'offline';
    }
    this.render();
  },
  render() {
    const box = $('#pe');
    const head = (by) => `<div class="pub-head"><a href="/" class="pub-brand"><img src="/icons/icon-192.png" alt=""><span>Sporta</span></a>${by ? `<small>Invito da <b>${h(by)}</b></small>` : ''}</div>`;
    if (!this.data) {
      box.innerHTML = head('') + (this.error === 'invalid'
        ? `<div class="pub-state">${emptyArt('link')}<b>Link non più valido</b><p class="muted">Chi organizza ha disattivato o cambiato il link, oppure l'evento è stato annullato.</p></div>`
        : `<div class="pub-state">${emptyArt('link')}<b>Non riesco a caricare l'invito</b><p class="muted">Controlla la connessione e riprova.</p><button class="btn" id="pe-retry">Riprova</button></div>`);
      const rt = $('#pe-retry'); if (rt) rt.onclick = () => this.load();
      return;
    }
    const d = this.data, e = d.event;
    document.title = e.title + ' · Sporta';
    const mine = d.mine;
    const maps = e.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}` : '';
    const until = d.rsvp_until ? S.fromYmd(d.rsvp_until).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
    const countLine = [`<b>${d.yes}</b> ${d.yes === 1 ? 'persona c\'è' : 'persone ci sono'}`, d.maybe ? `${d.maybe} forse` : '',
      d.free != null ? `<b>${d.free}</b> ${d.free === 1 ? 'posto libero' : 'posti liberi'}` : '', !d.closed && until ? `rispondi entro ${h(until)}` : ''].filter(Boolean).join(' · ');
    const full = d.free === 0;
    const left = `${head(e.organizer)}
      <div class="pub-hero">${iconTile(e.icon || 'party', 'lg')}<h1>${h(e.title)}</h1>
        <p class="pub-when">${h(eventWhen(e))}</p>
        ${e.location ? `<a class="ev-loc" href="${maps}" target="_blank" rel="noopener">${I.pin}<span>${h(e.location)}</span></a>` : ''}</div>
      ${e.notes ? `<div class="card pad pub-notes">${h(e.notes).replace(/\n/g, '<br>')}</div>` : ''}
      <button class="btn block" id="pe-ics">${I.cal} Aggiungi al calendario</button>`;
    let right = `<p class="pub-count">${countLine}</p>`;
    if (d.closed && !mine) {
      right += `<div class="pub-state small">${icon('clock')}<b>Le risposte sono chiuse</b><p class="muted">${e.date < todayYmd() ? 'L\'evento è già passato.' : `Si poteva rispondere entro ${h(until)}.`} Scrivi a chi ti ha invitato.</p></div>`;
    } else if (mine && !this.editing) {
      const label = { yes: 'ci sei', maybe: 'forse ci sei', no: 'non ci sei' }[mine.rsvp];
      right += `<div class="card pad pub-done"><span class="okc">${I.check}</span><b>Hai risposto: ${label}${mine.guests ? ', +' + mine.guests : ''}</b>
          <small class="muted">come ${h(mine.name)}${d.closed ? ' · le risposte sono chiuse' : until ? ` · puoi cambiare idea fino a ${h(until)}` : ''}</small>
          ${d.closed ? '' : `<div class="actions"><button class="btn" id="pe-change">Cambia risposta</button><button class="btn danger-text" id="pe-withdraw">Ritira</button></div>`}</div>
        <div class="card pad"><b>Per cambiare risposta da un altro dispositivo</b><p class="muted small">Salva questo link personale: chi lo ha può modificare la tua risposta.</p>
          <div class="actions"><button class="btn" id="pe-copy">Copia il link</button><button class="btn" id="pe-share">Condividi</button></div></div>`;
    } else if (full && !mine) {
      right += `<div class="pub-state small">${icon('users')}<b>Posti esauriti</b><p class="muted">Se qualcuno rinuncia si libera un posto: riprova più tardi. Puoi comunque rispondere “forse”.</p></div>`;
      right += this.formHtml(true);
    } else right += this.formHtml(false);
    if (d.names && d.names.length) {
      const yes = d.names.filter((x) => x.rsvp === 'yes'), maybe = d.names.filter((x) => x.rsvp === 'maybe');
      const row = (x) => `<div class="mrow">${avatar({ alias: x.name, id: x.name })}<span class="mt"><b>${h(x.name)}${x.guests ? ' +' + x.guests : ''}</b>${x.organizer ? '<small>organizza</small>' : x.me ? '<small>tu</small>' : ''}</span></div>`;
      right += `${yes.length ? `<div class="section-h"><span>Ci sono</span></div><div class="card mcard">${yes.map(row).join('')}</div>` : ''}
        ${maybe.length ? `<div class="section-h"><span>Forse</span></div><div class="card mcard">${maybe.map(row).join('')}</div>` : ''}`;
    }
    // Chi usa già Sporta su questo dispositivo può mettere l'evento in un suo gruppo.
    const mineGroups = st.groups.filter((g) => g.token && g.status !== 'pending');
    right += mineGroups.length ? `<p class="pub-cta">Usi Sporta? <button class="link-btn" id="pe-add">Aggiungi l'evento a un tuo gruppo</button></p>`
      : `<p class="pub-cta muted small">Sporta: liste, cose da fare ed eventi condivisi. <a href="/">Scoprilo</a></p>`;
    box.innerHTML = `<div class="pub-cols"><div class="pub-left">${left}</div><div class="pub-right">${right}</div></div>`;
    this.bind();
  },
  formHtml(onlyMaybe) {
    const f = this.form;
    if (onlyMaybe && f.rsvp === 'yes') f.rsvp = 'maybe';
    const mine = this.data.mine;
    const name = f.name || (mine && mine.name) || (ls.json(guestKey(this.token), {}).name) || st.member || '';
    return `<form class="card pad pub-form" id="pe-f">
      <label class="field"><span>Il tuo nome</span><input class="input" name="name" required maxlength="40" autocomplete="name" value="${h(name)}"></label>
      <div class="seg rsvp-seg">${Object.entries(RSVP).map(([k, r]) => `<button type="button" data-rsvp="${k}" class="${r.cls} ${f.rsvp === k ? 'on' : ''}" ${onlyMaybe && k === 'yes' ? 'disabled' : ''}>${h(r.label)}</button>`).join('')}</div>
      ${f.rsvp !== 'no' ? `<div class="guests"><span>Porto anche</span>
        <button type="button" class="icon-btn round" data-guests="-1" aria-label="Un ospite in meno" ${f.guests ? '' : 'disabled'}>−</button>
        <b>${f.guests ? '+' + f.guests : 'nessuno'}</b>
        <button type="button" class="icon-btn round" data-guests="1" aria-label="Un ospite in più">+</button></div>` : ''}
      <p class="err" id="pe-err"></p>
      <button class="btn primary block lg">${mine ? 'Salva la risposta' : 'Rispondi'}</button>
      ${mine ? '<button type="button" class="btn ghost block" id="pe-cancel">Annulla</button>' : ''}</form>`;
  },
  bind() {
    const e = this.data.event;
    $('#pe-ics').onclick = () => downloadIcs([{ id: this.token, ...e }], `${S.normName(e.title).replace(/\s+/g, '-') || 'evento'}.ics`);
    const f = $('#pe-f');
    if (f) {
      f.onclick = (ev) => {
        const r = ev.target.closest('[data-rsvp]');
        if (r && !r.disabled) { this.form.name = f.elements.name.value; this.form.rsvp = r.dataset.rsvp; if (r.dataset.rsvp === 'no') this.form.guests = 0; return this.render(); }
        const g = ev.target.closest('[data-guests]');
        if (g) { this.form.name = f.elements.name.value; this.form.guests = Math.max(0, Math.min(20, this.form.guests + Number(g.dataset.guests))); this.render(); }
      };
      f.onsubmit = (ev) => { ev.preventDefault(); this.submit(f); };
      const c = $('#pe-cancel'); if (c) c.onclick = () => { this.editing = false; this.render(); };
    }
    const change = $('#pe-change');
    if (change) change.onclick = () => { const m = this.data.mine; this.form = { rsvp: m.rsvp, guests: m.guests, name: m.name }; this.editing = true; this.render(); };
    const wd = $('#pe-withdraw');
    if (wd) wd.onclick = async () => {
      if (!confirm('Ritirare la tua risposta?')) return;
      const saved = ls.json(guestKey(this.token), {});
      try {
        const r = await fetch(`/api/public/events/${encodeURIComponent(this.token)}/rsvp?edit=${encodeURIComponent(saved.edit)}`, { method: 'DELETE' });
        const j = await r.json(); if (!r.ok) throw new Error(j.error);
        ls.setJson(guestKey(this.token), { name: saved.name || '' });
        this.data = j; this.render(); toast('Risposta ritirata');
      } catch (x) { toast(x.message || 'Serve la connessione a internet'); }
    };
    const personal = () => `${location.origin}/e/${this.token}?r=${encodeURIComponent(ls.json(guestKey(this.token), {}).edit || '')}`;
    const cp = $('#pe-copy');
    if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(personal()); toast('Link copiato'); } catch { prompt('Copia il link:', personal()); } };
    const sh = $('#pe-share');
    if (sh) sh.onclick = async () => { if (navigator.share) { try { await navigator.share({ title: e.title, url: personal() }); } catch { /* */ } } else cp.click(); };
    const add = $('#pe-add');
    if (add) add.onclick = () => addInvitedEventSheet(this.token, e);
  },
  async submit(f) {
    const btn = f.querySelector('button.primary'); btn.disabled = true;
    const err = $('#pe-err');
    const name = f.elements.name.value.trim();
    if (!name) { err.textContent = 'Scrivi il tuo nome'; btn.disabled = false; return; }
    const saved = ls.json(guestKey(this.token), {});
    const body = { name, rsvp: this.form.rsvp, guests: this.form.rsvp === 'no' ? 0 : this.form.guests };
    try {
      const send = async (extra) => {
        const r = await fetch(`/api/public/events/${encodeURIComponent(this.token)}/rsvp`, {
          method: this.data.mine ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...extra }),
        });
        const j = await r.json();
        if (!r.ok) throw Object.assign(new Error(j.error || 'Non riuscito'), { code: j.code });
        return j;
      };
      const j = this.data.mine ? await send({ edit: saved.edit }) : await withProof((altcha) => send({ altcha }));
      ls.setJson(guestKey(this.token), { name, edit: j.edit || saved.edit });
      this.data = j; this.editing = false; this.form.name = name;
      this.render();
      toast(this.form.rsvp === 'no' ? 'Grazie per aver risposto' : 'Risposta inviata: a presto!');
    } catch (x) {
      err.textContent = x.message || 'Serve la connessione a internet';
      btn.disabled = false;
      if (x.code === 'full' || x.code === 'closed') this.load();
    }
  },
};

// "Usi Sporta?": l'evento entra in un tuo gruppo (per esempio quello personale), con il link
// all'invito originale. La risposta all'invito resta quella data qui.
function addInvitedEventSheet(token, e) {
  const groups = orderedGroups().filter((g) => g.token && g.status !== 'pending');
  openSheet(`<h2>Aggiungi «${h(e.title)}»</h2>
    <p class="muted">L'evento comparirà nel gruppo che scegli, con il link a questo invito. La tua risposta all'invito resta quella data qui.</p>
    <div class="card items pick-list">${groups.map((g) => `<button type="button" class="row-btn" data-g="${h(g.code)}">${groupBadge(g)}<span class="t">${h(g.name)}<small class="as">${g.personal ? 'solo tuo' : 'lo vedranno tutti nel gruppo'}</small></span></button>`).join('')}</div>
    <p class="err" id="ai-err"></p>
    <div class="actions"><button type="button" class="btn" data-close>Annulla</button></div>`, (sh) => {
    sh.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-g]'); if (!b) return;
      const g = groupOf(b.dataset.g);
      const id = uid();
      try {
        await api('PUT', `/api/events/${id}`, {
          title: e.title, date: e.date, time: e.time, end_time: e.end_time, location: e.location, notes: e.notes, icon: e.icon,
          source_url: `${location.origin}/e/${token}`,
        }, g.code);
        closeSheet();
        toast(`Aggiunto a ${g.name}`, { label: 'Apri', run: () => { location.href = `/#/go/${g.hid}/e/${id}`; } });
      } catch (x) { $('#ai-err', sh).textContent = x.message; }
    });
  });
}
