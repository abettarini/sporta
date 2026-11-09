'use strict';
/* Sporta — eventi del gruppo: elenco e calendario, pagina dell'evento con le risposte
   (ci sono / forse / no, con ospiti "+1" ripetibili), liste collegate ("Spesa per l'evento",
   "Chi porta cosa") ed esportazione nel calendario (.ics). */

const RSVP = {
  yes: { label: 'Ci sono', short: 'Ci sono', cls: 'yes' },
  maybe: { label: 'Forse', short: 'Forse', cls: 'maybe' },
  no: { label: 'Non ci sono', short: 'No', cls: 'no' },
};
const EVENT_ICONS = ['party', 'cake', 'ball', 'gift', 'wine', 'beer', 'tree', 'tent', 'home', 'persona', 'bimbi', 'animali'];

const todayYmd = () => S.ymd(new Date());
const sortedEvents = (evs = [...st.events.values()]) => evs.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99'));
const upcomingEvents = (evs) => sortedEvents(evs).filter((e) => e.date >= todayYmd());
const pastEvents = (evs) => sortedEvents(evs).filter((e) => e.date < todayYmd()).reverse();

// "sab 14 nov, 20:30" (short) oppure "sabato 14 novembre, 20:30–23:00".
function eventWhen(e, short) {
  const d = S.fromYmd(e.date);
  if (!d) return '';
  const day = d.toLocaleDateString('it-IT', short ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long' });
  return day + (e.time ? ', ' + e.time + (!short && e.end_time ? '–' + e.end_time : '') : '');
}
// "oggi", "domani", "tra 5 giorni", "passato"
function eventCountdown(e) {
  const d = S.fromYmd(e.date); if (!d) return '';
  const t = S.fromYmd(todayYmd());
  const n = Math.round((d - t) / 864e5);
  if (n < 0) return 'passato';
  if (n === 0) return 'oggi';
  if (n === 1) return 'domani';
  if (n < 7) return `tra ${n} giorni`;
  if (n < 14) return 'tra una settimana';
  return `tra ${Math.round(n / 7)} settimane`;
}

// Conteggi: chi c'è (con ospiti), forse, no, non ha risposto.
function eventTally(e, members) {
  const act = members.filter((m) => !m.status || m.status === 'active');
  const by = new Map((e.participants || []).map((p) => [p.member_id, p]));
  const yes = [], maybe = [], no = [], none = [];
  for (const m of act) {
    const p = by.get(m.id);
    (p ? { yes, maybe, no }[p.rsvp] || none : none).push({ m, p });
  }
  // Ospiti dal link pubblico (senza account).
  for (const g of e.guests || []) ({ yes, maybe, no }[g.rsvp] || none).push({ m: { id: 'g:' + g.id, alias: g.name }, p: { guests: g.guests }, guest: g });
  const guests = yes.reduce((n, x) => n + (x.p.guests || 0), 0);
  const maybeGuests = maybe.reduce((n, x) => n + (x.p.guests || 0), 0);
  return { yes, maybe, no, none, guests, maybeGuests, total: yes.length + guests };
}
const myRsvp = (e, meId) => (e.participants || []).find((p) => p.member_id === meId) || null;
const canEditEvent = (e) => isAdmin() || !e.created_by_id || (st.me && st.me.id === e.created_by_id);
const eventLists = (id) => sortedLists().filter((l) => l.event_id === id);

function dateTile(e) {
  const d = S.fromYmd(e.date);
  return `<span class="date-tile ${e.date < todayYmd() ? 'past' : ''}"><small>${h(d ? d.toLocaleDateString('it-IT', { month: 'short' }).replace('.', '') : '')}</small><b>${d ? d.getDate() : '?'}</b></span>`;
}
function rsvpChip(e, meId) {
  const p = myRsvp(e, meId);
  if (!p) return e.date >= todayYmd() ? '<span class="rsvp-chip ask">Ci sei?</span>' : '';
  return `<span class="rsvp-chip ${RSVP[p.rsvp].cls}">${h(RSVP[p.rsvp].short)}${p.guests ? ' +' + p.guests : ''}</span>`;
}
function eventCard(e, { href, meId, members, group } = {}) {
  const t = eventTally(e, members || activeMembers());
  const sub = [e.time, e.location, t.total ? `${t.total} ${t.total === 1 ? 'persona' : 'persone'}` : '', group].filter(Boolean).map(h).join(' · ');
  return `<a class="card event-card" href="${href || '#/e/' + e.id}">${dateTile(e)}
    <span class="t"><b>${h(e.title)}</b><span>${sub || h(eventCountdown(e))}</span></span>${rsvpChip(e, meId === undefined ? st.me && st.me.id : meId)}</a>`;
}

// --------------------------------------------------------------- calendario (schermi larghi)
function calendarHtml(monthStart, selected) {
  const y = monthStart.getFullYear(), mo = monthStart.getMonth();
  const first = new Date(y, mo, 1);
  const offset = (first.getDay() + 6) % 7; // lunedì per primo
  const days = new Date(y, mo + 1, 0).getDate();
  const byDay = new Map();
  for (const e of st.events.values()) { if (!byDay.has(e.date)) byDay.set(e.date, []); byDay.get(e.date).push(e); }
  const today = todayYmd();
  let cells = '';
  for (let k = 0; k < offset; k++) cells += '<span class="cal-d empty"></span>';
  for (let d = 1; d <= days; d++) {
    const key = S.ymd(new Date(y, mo, d));
    const evs = byDay.get(key) || [];
    cells += `<button type="button" class="cal-d ${key === today ? 'today' : ''} ${key === selected ? 'on' : ''} ${evs.length ? 'has' : ''}" data-day="${key}">
      <span>${d}</span>${evs.slice(0, 2).map((e) => `<i title="${h(e.title)}">${h(e.title)}</i>`).join('')}${evs.length > 2 ? `<i>+${evs.length - 2}</i>` : ''}</button>`;
  }
  const label = first.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  return `<div class="card cal">
    <div class="cal-h"><button type="button" class="icon-btn" data-cal="-1" aria-label="Mese precedente">${I.back}</button>
      <b>${h(label.charAt(0).toUpperCase() + label.slice(1))}</b>
      <button type="button" class="icon-btn flip" data-cal="1" aria-label="Mese successivo">${I.back}</button></div>
    <div class="cal-w">${['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map((x) => `<span>${x}</span>`).join('')}</div>
    <div class="cal-g">${cells}</div></div>`;
}

Views.events = {
  mount() {
    this.month = this.month || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    app.innerHTML = topBar('Eventi', {
      right: `<button class="icon-btn" id="ev-ics" aria-label="Esporta nel calendario" title="Esporta i prossimi eventi nel calendario">${I.download}</button><button class="icon-btn" id="ev-new" aria-label="Nuovo evento">${I.plus}</button>`,
    }) + `<main class="wide events-page"><div id="evcal" class="wide-only-block"></div><div id="evl"></div></main>` + tabBar('events');
    $('#ev-new').onclick = () => eventSheet(null, this.day);
    $('#ev-ics').onclick = () => {
      const evs = upcomingEvents();
      if (!evs.length) return toast('Nessun evento in programma');
      downloadIcs(evs, `sporta-${S.normName(groupName()).replace(/\s+/g, '-') || 'eventi'}.ics`);
    };
    $('#evcal').onclick = (e) => {
      const nav = e.target.closest('[data-cal]');
      if (nav) { this.month = new Date(this.month.getFullYear(), this.month.getMonth() + Number(nav.dataset.cal), 1); return this.update(); }
      const d = e.target.closest('[data-day]');
      if (d) { this.day = this.day === d.dataset.day ? null : d.dataset.day; this.update(); }
    };
    $('#evl').onclick = (e) => {
      if (e.target.closest('#ev-past')) { this.showPast = !this.showPast; this.update(); }
      if (e.target.closest('#ev-day-x')) { this.day = null; this.update(); }
      if (e.target.closest('#ev-day-new')) eventSheet(null, this.day);
    };
    this.update();
  },
  update() {
    const cal = $('#evcal');
    if (cal) cal.innerHTML = mqRail.matches ? calendarHtml(this.month, this.day) : '';
    const me = st.me && st.me.id;
    if (this.day) {
      const evs = sortedEvents().filter((e) => e.date === this.day);
      const d = S.fromYmd(this.day);
      $('#evl').innerHTML = `<div class="section-h"><span>${h(d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }))}</span><button class="btn ghost sm" id="ev-day-x">Tutti gli eventi</button></div>
        ${evs.length ? `<div class="list-cards">${evs.map((e) => eventCard(e, { meId: me })).join('')}</div>` : '<p class="muted">Nessun evento in questo giorno.</p>'}
        <button class="btn ghost block" id="ev-day-new">${I.plus} Nuovo evento in questo giorno</button>`;
      return;
    }
    const up = upcomingEvents(), past = pastEvents();
    const months = new Map();
    for (const e of up) { const k = e.date.slice(0, 7); if (!months.has(k)) months.set(k, []); months.get(k).push(e); }
    const mLabel = (k) => { const s = S.fromYmd(k + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); };
    $('#evl').innerHTML = (up.length ? [...months].map(([k, evs]) => `<div class="section-h"><span>${h(mLabel(k))}</span></div>
        <div class="list-cards">${evs.map((e) => eventCard(e, { meId: me })).join('')}</div>`).join('')
      : `<div class="empty">${emptyArt('party')}Nessun evento in programma.<br>Crea una cena, una festa, una partita: ognuno dice se c'è e quanti ospiti porta, e si organizza la spesa e chi porta cosa.</div>
        <button class="btn primary block" onclick="eventSheet()">${I.plus} Nuovo evento</button>`)
      + (past.length ? `<button class="btn ghost block" id="ev-past">${this.showPast ? 'Nascondi' : 'Mostra'} gli eventi passati (${past.length})</button>
        ${this.showPast ? `<div class="list-cards past">${past.slice(0, 30).map((e) => eventCard(e, { meId: me })).join('')}</div>` : ''}` : '');
  },
};

// --------------------------------------------------------------- pagina dell'evento
Views.event = {
  mount() {
    const e = st.events.get(this.route.id);
    if (!e) { history.replaceState(null, '', '#/e'); return mount(); }
    app.innerHTML = topBar(`<span id="et"></span>`, {
      back: '#/e', right: `<button class="icon-btn" id="ev-share" aria-label="Condividi">${I.share}</button><button class="icon-btn" id="ev-edit" aria-label="Modifica">${I.edit}</button>`,
    }) + `<main class="wide event-page"><div id="eb"></div></main>` + tabBar('events');
    $('#ev-edit').onclick = () => eventSheet(st.events.get(this.route.id));
    $('#ev-share').onclick = () => shareEvent(st.events.get(this.route.id));
    $('#eb').addEventListener('click', (ev) => {
      const e2 = st.events.get(this.route.id); if (!e2) return;
      const r = ev.target.closest('[data-rsvp]');
      const mine = myRsvp(e2, st.me && st.me.id);
      if (r) {
        const v = r.dataset.rsvp;
        enqueue({ k: 'event.rsvp', id: e2.id, data: { rsvp: v, guests: v === 'no' ? 0 : (mine && mine.guests) || 0 } });
        vibrate(15);
        return;
      }
      const g = ev.target.closest('[data-guests]');
      if (g && mine && mine.rsvp !== 'no') {
        const n = Math.max(0, Math.min(20, (mine.guests || 0) + Number(g.dataset.guests)));
        if (n !== mine.guests) enqueue({ k: 'event.rsvp', id: e2.id, data: { rsvp: mine.rsvp, guests: n } });
        return;
      }
      const rg = ev.target.closest('[data-rmguest]');
      if (rg) {
        const g = (e2.guests || []).find((x) => x.id === rg.dataset.rmguest);
        if (g && confirm(`Togliere la risposta di ${g.name}?`)) api('DELETE', `/api/events/${e2.id}/guests/${encodeURIComponent(g.id)}`).then(() => toast('Risposta tolta')).catch((x) => toast(x.message));
        return;
      }
      if (ev.target.closest('#ev-linkbtn')) return eventLinkSheet(e2);
      const nl = ev.target.closest('[data-newlist]');
      if (nl) return createEventList(e2, nl.dataset.newlist);
      if (ev.target.closest('#ev-link')) return linkListSheet(e2);
      if (ev.target.closest('#ev-ics1')) return downloadIcs([e2], `${S.normName(e2.title).replace(/\s+/g, '-') || 'evento'}.ics`);
    });
    this.update();
  },
  update() {
    const e = st.events.get(this.route.id);
    if (!e) { toast('L\'evento è stato annullato'); history.replaceState(null, '', '#/e'); return mount(); }
    $('#et').innerHTML = `${iconTile(e.icon || 'party', 'sm')} ${h(e.title)}`;
    $('#ev-edit').hidden = !canEditEvent(e);
    const me = st.me && st.me.id;
    const mine = myRsvp(e, me);
    const t = eventTally(e, activeMembers());
    const past = e.date < todayYmd();
    const maps = e.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}` : '';
    const edit = canEditEvent(e);
    const who = (arr, extra) => arr.map(({ m, p, guest }) => `<span class="who ${guest ? 'is-guest' : ''}">${avatar(m, 'sm')}<span>${h(guest ? m.alias : memberLabel(m.id) || m.alias)}${p && p.guests ? ` <b class="plus">+${p.guests}</b>` : ''}${guest ? ' <i class="rbadge g">dal link</i>' : ''}</span>${guest && edit ? `<button class="gx" data-rmguest="${h(guest.id)}" aria-label="Togli ${h(m.alias)}">${I.x}</button>` : ''}</span>`).join('') + (extra || '');
    const link = e.link;
    const inviteCard = !edit || past ? '' : link
      ? `<div class="card pad ev-link on"><div><b>Link d'invito attivo</b><small class="muted">${(e.guests || []).length ? `${e.guests.length} ${e.guests.length === 1 ? 'risposta' : 'risposte'} dal link` : 'Ancora nessuna risposta dal link'}${link.capacity ? ` · ${link.capacity} posti` : ''}${link.rsvp_until ? ' · entro ' + h(S.fromYmd(link.rsvp_until).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })) : ''}</small></div>
          <button class="btn" id="ev-linkbtn">Gestisci</button></div>`
      : `<div class="card pad ev-link"><b>Invita anche chi non usa Sporta</b><small class="muted">Un link per rispondere senza iscriversi.</small><button class="btn primary block" id="ev-linkbtn">Invita con un link</button></div>`;
    const lists = eventLists(e.id);
    const hasSpesa = lists.some((l) => typeOf(l) === 'spesa'), hasTodo = lists.some((l) => typeOf(l) === 'todo');
    $('#eb').innerHTML = `<div class="ev-col">
      <div class="card ev-hero">
        ${dateTile(e)}
        <div class="t"><b>${h(eventWhen(e))}</b><span class="muted">${h(eventCountdown(e))}${e.created_by ? ' · organizzato da ' + h(e.created_by === st.member ? 'te' : e.created_by) : ''}</span>
          ${e.location ? `<a class="ev-loc" href="${maps}" target="_blank" rel="noopener">${I.pin}<span>${h(e.location)}</span></a>` : ''}</div>
      </div>
      ${e.notes ? `<div class="card pad ev-notes">${h(e.notes).replace(/\n/g, '<br>')}</div>` : ''}
      ${e.source_url ? `<a class="card link-card ev-source" href="${h(e.source_url)}">${I.share}<span class="t"><b>Invito originale</b><span>Rispondi o cambia la risposta dalla pagina dell'invito</span></span><span class="chev">›</span></a>` : ''}
      ${inviteCard}
      ${past || isPersonal() ? '' : `<div class="card pad ev-rsvp">
        <h3>${mine ? 'La tua risposta' : 'Ci sei?'}</h3>
        <div class="seg rsvp-seg">${Object.entries(RSVP).map(([k, r]) => `<button type="button" data-rsvp="${k}" class="${r.cls} ${mine && mine.rsvp === k ? 'on' : ''}">${h(r.label)}</button>`).join('')}</div>
        ${mine && mine.rsvp !== 'no' ? `<div class="guests"><span>Porto anche</span>
          <button type="button" class="icon-btn round" data-guests="-1" aria-label="Un ospite in meno" ${mine.guests ? '' : 'disabled'}>−</button>
          <b>${mine.guests ? '+' + mine.guests : 'nessuno'}</b>
          <button type="button" class="icon-btn round" data-guests="1" aria-label="Un ospite in più">+</button>
          <small>${mine.guests ? (mine.guests === 1 ? 'ospite' : 'ospiti') : 'ospiti'}</small></div>` : ''}
      </div>`}
      ${isPersonal() && !link && !(e.guests || []).length ? '' : `<div class="card pad ev-people">
        <h3>${t.total} ${t.total === 1 ? 'persona' : 'persone'}${t.guests ? ` <small>(${t.yes.length} + ${t.guests} ${t.guests === 1 ? 'ospite' : 'ospiti'})</small>` : ''}</h3>
        ${t.yes.length ? `<div class="who-h yes">Ci sono</div><div class="whos">${who(t.yes)}</div>` : ''}
        ${t.maybe.length ? `<div class="who-h maybe">Forse${t.maybeGuests ? ` (+${t.maybeGuests})` : ''}</div><div class="whos">${who(t.maybe)}</div>` : ''}
        ${t.no.length ? `<div class="who-h no">Non ci sono</div><div class="whos">${who(t.no)}</div>` : ''}
        ${t.none.length ? `<div class="who-h">Non hanno risposto</div><div class="whos dim">${who(t.none)}</div>` : ''}
      </div>`}</div>
      <div class="ev-col">
      <div class="section-h"><span>Liste dell'evento</span></div>
      ${lists.length ? `<div class="list-cards">${lists.map((l) => {
        const sm = listSummary(l);
        return `<a class="card list-card lc" href="#/l/${l.id}">${listTile(l, 'sm')}<span class="t"><b>${h(l.name)}</b><span class="${sm.late ? 'late' : ''}">${h(sm.sub)}</span></span>${sm.badge ? `<span class="badge">${sm.badge}</span>` : ''}</a>`;
      }).join('')}</div>` : '<p class="muted small">Organizzatevi con una lista della spesa per l\'evento e con "Chi porta cosa": ognuno si prende qualcosa da portare.</p>'}
      <div class="ev-actions">
        ${hasSpesa ? '' : `<button class="btn" data-newlist="spesa">${I.cart} Spesa per l'evento</button>`}
        ${hasTodo ? '' : `<button class="btn" data-newlist="todo">${icon('todo')} Chi porta cosa</button>`}
        <button class="btn ghost" id="ev-link">Collega una lista</button>
      </div>
      <button class="btn ghost block" id="ev-ics1">${I.cal} Aggiungi al calendario</button>
      </div>`;
  },
};

// --------------------------------------------------------------- link d'invito pubblico
const eventLinkUrl = (e) => `${location.origin}/e/${e.link.token}`;

async function eventLinkSheet(e) {
  if (!e.link) {
    try { await api('PUT', `/api/events/${e.id}/link`, { enabled: true }); } catch (x) { return toast(x.message); }
    e = st.events.get(e.id);
  }
  openSheet('<div id="el"></div>', (sh) => {
    const box = $('#el', sh);
    const save = async (data, msg) => {
      try { await api('PUT', `/api/events/${e.id}/link`, data); if (msg) toast(msg); } catch (x) { toast(x.message); }
      e = st.events.get(e.id);
      if (!e || !e.link) { closeSheet(); return; }
      draw();
    };
    const draw = () => {
      const l = e.link, url = eventLinkUrl(e);
      box.innerHTML = `<h2>Invita con un link</h2>
        <p class="muted">Chi apre il link vede l'evento e risponde con il suo nome, senza iscriversi a Sporta.</p>
        <div class="code small-code">${h(url)}</div>
        <div class="actions"><button type="button" class="btn" id="el-copy">Copia</button><button type="button" class="btn primary" id="el-share">Condividi</button></div>
        <div class="field"><span>Chi apre il link vede</span><div class="seg" id="el-names"><button type="button" data-v="0" class="${l.names ? '' : 'on'}">Solo il numero</button><button type="button" data-v="1" class="${l.names ? 'on' : ''}">Anche i nomi</button></div></div>
        <div class="row2">
          <label class="field"><span>Posti (facoltativo)</span><input class="input" id="el-cap" type="number" inputmode="numeric" min="1" max="10000" placeholder="senza limite" value="${l.capacity || ''}"></label>
          <label class="field"><span>Rispondere entro</span><input class="input" id="el-until" type="date" max="${h(e.date)}" value="${h(l.rsvp_until || '')}"></label>
        </div>
        <p class="hint">I posti contano chi dice “ci sono”, con i suoi ospiti, compresi i membri del gruppo.</p>
        <div class="actions"><button type="button" class="btn" id="el-regen">Rigenera il link</button><button type="button" class="btn danger-text" id="el-off">Disattiva</button></div>
        <p class="hint">Rigenerando o disattivando, il vecchio link smette subito di funzionare. Le risposte già date restano.</p>
        <div class="actions"><button type="button" class="btn" data-close>Chiudi</button></div>`;
      $('#el-copy', sh).onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link copiato'); } catch { prompt('Copia il link:', url); } };
      $('#el-share', sh).onclick = async () => {
        const text = `${e.title} · ${eventWhen(e)}${e.location ? ' · ' + e.location : ''}\nRispondi qui:`;
        if (navigator.share) { try { await navigator.share({ title: e.title, text, url }); } catch { /* annullato */ } } else $('#el-copy', sh).click();
      };
      $('#el-names', sh).onclick = (ev) => { const b = ev.target.closest('[data-v]'); if (b) save({ names: b.dataset.v === '1' }); };
      $('#el-cap', sh).onchange = (ev) => save({ capacity: ev.target.value ? Number(ev.target.value) : null });
      $('#el-until', sh).onchange = (ev) => save({ rsvp_until: ev.target.value });
      $('#el-regen', sh).onclick = () => { if (confirm('Creare un nuovo link? Quello attuale smetterà di funzionare.')) save({ regenerate: true }, 'Nuovo link creato'); };
      $('#el-off', sh).onclick = () => { if (confirm('Disattivare il link? Chi lo apre vedrà che non è più valido.')) save({ enabled: false }, 'Link disattivato'); };
    };
    draw();
  });
}

function createEventList(e, type) {
  const id = uid();
  const name = type === 'spesa' ? `Spesa · ${e.title}` : `Chi porta cosa · ${e.title}`;
  enqueue({ k: 'list.put', id, data: { name, emoji: type === 'spesa' ? 'basket' : 'todo', type, variant: '', event_id: e.id, position: Date.now(), sort_mode: 'manual' } });
  toast(type === 'spesa' ? 'Lista della spesa creata' : 'Lista "Chi porta cosa" creata: scrivi cosa serve, ognuno tocca "Prendo io"', { label: 'Apri', run: () => { location.hash = '#/l/' + id; } });
}

function linkListSheet(e) {
  const lists = sortedLists().filter((l) => l.event_id !== e.id);
  openSheet(`<h2>Collega una lista</h2>
    ${lists.length ? `<div class="pick-list">${lists.map((l) => `<button type="button" class="row-btn" data-l="${l.id}">${listTile(l, 'sm')}<span class="t">${h(l.name)}${l.event_id && st.events.get(l.event_id) ? `<small class="as">ora in ${h(st.events.get(l.event_id).title)}</small>` : ''}</span></button>`).join('')}</div>` : '<p class="muted">Non ci sono altre liste nel gruppo.</p>'}
    <div class="actions"><button type="button" class="btn" data-close>Chiudi</button></div>`, (sh) => {
    sh.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-l]'); if (!b) return;
      enqueue({ k: 'list.put', id: b.dataset.l, data: { event_id: e.id } });
      closeSheet();
    });
  });
}

// --------------------------------------------------------------- crea / modifica
function eventSheet(e, day) {
  let iconId = e ? e.icon || 'party' : 'party';
  const d0 = day || S.ymd(S.addDays(new Date(), 7));
  openSheet(`<h2>${e ? 'Modifica evento' : 'Nuovo evento'}</h2>
    <form id="evf">
      <label class="field"><span>Cosa</span><input class="input" name="title" required maxlength="100" value="${h(e ? e.title : '')}" placeholder="es. Cena di fine torneo, Compleanno di Sara"></label>
      <div class="row3">
        <label class="field"><span>Giorno</span><input class="input" type="date" name="date" required value="${h(e ? e.date : d0)}"></label>
        <label class="field"><span>Ora</span><input class="input" type="time" name="time" value="${h(e ? e.time : '')}"></label>
        <label class="field"><span>Fine</span><input class="input" type="time" name="end_time" value="${h(e ? e.end_time : '')}"></label>
      </div>
      <label class="field"><span>Dove</span><input class="input" name="location" maxlength="200" value="${h(e ? e.location : '')}" placeholder="Indirizzo o nome del posto"></label>
      <label class="field"><span>Note</span><textarea class="input" name="notes" rows="3" maxlength="2000" placeholder="Dettagli, cosa portare, quota…">${h(e ? e.notes : '')}</textarea></label>
      <div class="field"><span>Icona</span><div class="emoji-pick">${EVENT_ICONS.map((x) => `<button type="button" data-e="${x}" class="${x === iconId ? 'on' : ''}" aria-label="${x}">${iconTile(x)}</button>`).join('')}</div></div>
      ${e ? '' : '<p class="hint">Tutti nel gruppo riceveranno un avviso per dire se ci sono.</p>'}
      <div class="actions"><button type="button" class="btn" data-close>Annulla</button><button class="btn primary">${e ? 'Salva' : 'Crea evento'}</button></div>
      ${e ? '<div class="actions"><button type="button" class="btn danger" id="ev-del">Annulla l\'evento</button></div>' : ''}
    </form>`, (sh) => {
    const f = $('#evf', sh);
    if (!e) setTimeout(() => f.elements.title.focus(), 50);
    $('.emoji-pick', sh).onclick = (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      iconId = b.dataset.e;
      sh.querySelectorAll('.emoji-pick button').forEach((x) => x.classList.toggle('on', x.dataset.e === iconId));
    };
    f.onsubmit = (ev) => {
      ev.preventDefault();
      const v = (k) => f.elements[k].value.trim();
      if (!v('title') || !S.fromYmd(v('date'))) return;
      const data = { title: v('title'), date: v('date'), time: v('time'), end_time: v('time') ? v('end_time') : '', location: v('location'), notes: v('notes'), icon: iconId };
      const id = e ? e.id : uid();
      enqueue({ k: 'event.put', id, data }, { silent: true });
      if (e) closeSheet(); else closeSheetAndGo('#/e/' + id);
    };
    const del = $('#ev-del', sh);
    if (del) del.onclick = () => {
      if (!confirm(`Annullare "${e.title}"? Chi ha detto che c'è riceverà un avviso. Le liste dell'evento restano nel gruppo.`)) return;
      enqueue({ k: 'event.del', id: e.id }, { silent: true });
      closeSheetAndGo('#/e');
    };
  });
}

// --------------------------------------------------------------- calendario esterno (.ics) e condivisione
function icsText(evs) {
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
  const fold = (line) => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const dt = (date, time) => date.replace(/-/g, '') + 'T' + time.replace(':', '') + '00';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sporta//Eventi//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of evs) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@sporta`, `DTSTAMP:${stamp}`);
    if (e.time) {
      // Ora locale "fluttuante": il calendario la mostra nel fuso di chi la importa.
      let end = e.end_time;
      let endDate = e.date;
      if (!end) { const [hh, mm] = e.time.split(':').map(Number); const x = new Date(2000, 0, 1, hh + 2, mm); end = `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; if (x.getDate() !== 1) endDate = S.ymd(S.addDays(S.fromYmd(e.date), 1)); }
      else if (end <= e.time) endDate = S.ymd(S.addDays(S.fromYmd(e.date), 1));
      lines.push(`DTSTART:${dt(e.date, e.time)}`, `DTEND:${dt(endDate, end)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${S.ymd(S.addDays(S.fromYmd(e.date), 1)).replace(/-/g, '')}`);
    }
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.notes) lines.push(`DESCRIPTION:${esc(e.notes)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
function downloadIcs(evs, name) {
  const blob = new Blob([icsText(evs)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
async function shareEvent(e) {
  const text = `${e.title}\n${eventWhen(e)}${e.location ? '\n' + e.location : ''}${e.notes ? '\n\n' + e.notes : ''}`;
  try {
    if (navigator.share) await navigator.share({ title: e.title, text });
    else { await navigator.clipboard.writeText(text); toast('Dettagli dell\'evento copiati'); }
  } catch { /* annullato */ }
}
