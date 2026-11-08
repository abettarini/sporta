'use strict';
/* Sporta — storico delle spese: elenco per mese e dettaglio, con possibilità
   di rimettere in lista gli articoli di una spesa passata. */

const sortedTrips = () => [...st.trips.values()].sort((a, b) => b.created_at - a.created_at);
const monthKey = (t) => { const d = new Date(t); return d.getFullYear() * 12 + d.getMonth(); };
const monthLabel = (t) => { const s = new Date(t).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); };

// Elenco per mese (pagina Spese sul telefono, colonna laterale sugli schermi larghi).
function tripsListHtml(activeId, compact) {
  const trips = sortedTrips();
  if (!trips.length) {
    return `<div class="empty">${emptyArt('receipt')}Nessuna spesa salvata.<br>Quando hai preso tutto, tocca <b>Concludi spesa</b> in fondo alla lista: qui troverai cosa hai comprato, quando e dove.</div>`;
  }
  const months = new Map();
    for (const t of trips) {
      const k = monthKey(t.created_at);
      if (!months.has(k)) months.set(k, []);
      months.get(k).push(t);
    }
  return [...months.values()].map((ts) => {
      const sum = ts.reduce((s, t) => s + (t.total || 0), 0);
      return `<div class="section-h"><span>${h(monthLabel(ts[0].created_at))}</span>${sum ? `<span>${h(S.fmtMoney(sum))}</span>` : ''}</div>
        <div class="list-cards ${compact ? 'compact' : ''}">${ts.map((t) => `<a class="card trip-card ${t.id === activeId ? 'on' : ''}" href="#/t/${t.id}">
          <span class="date"><b>${new Date(t.created_at).getDate()}</b>${h(fmtDate(t.created_at, { weekday: 'short' }))}</span>
          <span class="t"><b>${h(t.store || t.list_name || 'Spesa')}</b><span>${t.items.length} articoli${t.created_by ? ' · ' + h(t.created_by) : ''}${t.store && t.list_name ? ' · ' + h(t.list_name) : ''}</span></span>
          ${t.total != null ? `<span class="amount">${h(S.fmtMoney(t.total))}</span>` : ''}</a>`).join('')}</div>`;
    }).join('');
}

Views.trips = {
  mount() {
    // Con la colonna laterale si apre direttamente la spesa più recente.
    const first = sortedTrips()[0];
    if (hasPane() && first) { history.replaceState(null, '', '#/t/' + first.id); return mount(); }
    app.innerHTML = topBar('Spese') + `<main><div id="tl"></div></main>` + tabBar('trips');
    this.update();
  },
  update() { $('#tl').innerHTML = tripsListHtml(null); },
};

Views.trip = {
  mount() {
    const t = st.trips.get(this.route.id);
    if (!t) { history.replaceState(null, '', '#/t'); return mount(); }
    if (this.tid !== t.id) { this.tid = t.id; this.off = new Set(); }
    app.innerHTML = topBar(`<span id="tt"></span>`, {
      back: hasPane() ? '' : '#/t',
      right: `<button class="icon-btn" id="tmenu" aria-label="Modifica">${I.edit}</button>`,
    }) + (hasPane() ? `<aside class="pane" id="pane-trips"></aside>` : '') + `<main><div id="tbody"></div>
      <div class="sticky-cta"><div class="card">
        <select class="input" id="ttl"></select>
        <button class="btn primary" id="tadd">Rimetti in lista</button>
      </div></div></main>` + tabBar('trips');
    $('#tbody').addEventListener('click', (e) => {
      const li = e.target.closest('[data-k]'); if (!li) return;
      const k = Number(li.dataset.k);
      this.off.has(k) ? this.off.delete(k) : this.off.add(k);
      this.update();
    });
    $('#tmenu').onclick = () => tripSheet(st.trips.get(this.tid));
    $('#tadd').onclick = () => this.addToList();
    this.update();
  },
  update() {
    const t = st.trips.get(this.route.id);
    if (!t) { history.replaceState(null, '', '#/t'); return mount(); }
    $('#tt').textContent = t.store || t.list_name || 'Spesa';
    const pane = $('#pane-trips');
    if (pane) pane.innerHTML = `<div class="pane-h"><b>Spese</b></div>${tripsListHtml(t.id, true)}`;
    const groups = new Map();
    t.items.forEach((i, k) => {
      const d = S.deptOf(i.department).id;
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push([i, k]);
    });
    $('#tbody').innerHTML = `<div class="card pad trip-head">
        <div><span class="muted tdate">${h(fmtDate(t.created_at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))} · ${h(fmtTime(t.created_at))}</span></div>
        <div class="trip-facts">
          <span><small>Negozio</small><b>${h(t.store || '—')}</b></span>
          <span><small>Totale</small><b>${t.total != null ? h(S.fmtMoney(t.total)) : '—'}</b></span>
          <span><small>Articoli</small><b>${t.items.length}</b></span>
        </div>
        ${t.created_by || t.list_name ? `<div class="muted small">${t.list_name ? 'Lista ' + h(t.list_name) : ''}${t.created_by ? ' · conclusa da ' + h(t.created_by) : ''}</div>` : ''}
      </div>
      <p class="muted small">Tocca gli articoli per scegliere quali rimettere in lista.</p>
      ${S.DEPARTMENTS.filter((d) => groups.has(d.id)).map((d) => `<div class="dept-h">${deptTile(d.id, 'sm')} ${h(d.label)}</div>
        <ul class="items">${groups.get(d.id).map(([i, k]) => {
          const q = S.fmtQty(i.qty, i.unit);
          const meta = [i.brand && h(i.brand), i.by && 'preso da ' + h(i.by)].filter(Boolean).join(' · ');
          return `<li class="item ing ${this.off.has(k) ? '' : 'done'}" data-k="${k}"><button class="tap" type="button"><span class="check">${I.check}</span>
            <span class="txt"><span class="name">${h(i.name)}${q ? `<span class="qty">${h(q)}</span>` : ''}</span>
            ${meta || (i.tags || []).length ? `<span class="meta">${meta} <span class="tags">${tagPills(i.tags)}</span></span>` : ''}</span></button></li>`;
        }).join('')}</ul>`).join('')}`;
    const tl = $('#ttl'), cur = tl.value || lastListId();
    tl.innerHTML = sortedLists().map((l) => listOption(l, cur)).join('');
    const n = t.items.length - this.off.size;
    const btn = $('#tadd');
    btn.textContent = n ? `Rimetti in lista (${n})` : 'Rimetti in lista';
    btn.disabled = !n || !st.lists.size;
  },
  addToList() {
    const t = st.trips.get(this.tid);
    const listId = $('#ttl').value;
    const list = st.lists.get(listId); if (!list) return;
    const items = t.items.filter((_, k) => !this.off.has(k));
    for (const i of items) addToList(listId, { name: i.name, qty: i.qty, unit: i.unit, brand: i.brand || undefined, department: i.department, tags: i.tags });
    render();
    vibrate(20);
    toast(`${items.length} articoli aggiunti a ${list.name}`, { label: 'Apri', run: () => { location.hash = '#/l/' + listId; } });
  },
};

function tripSheet(t) {
  const stores = [...new Set([...st.trips.values()].map((x) => x.store).filter(Boolean))];
  openSheet(`<h2>Modifica spesa</h2>
    <form id="tf">
      <label class="field"><span>Negozio</span><input class="input" name="store" list="stores" maxlength="80" value="${h(t.store)}">
        <datalist id="stores">${stores.map((s) => `<option value="${h(s)}">`).join('')}</datalist></label>
      <label class="field"><span>Totale speso</span><input class="input" name="total" inputmode="decimal" placeholder="€" value="${h(S.fmtNum(t.total))}"></label>
      <div class="actions"><button type="button" class="btn danger" id="tdel">Elimina</button><button class="btn primary">Salva</button></div>
    </form>`, (sh) => {
    const f = $('#tf', sh);
    f.onsubmit = (e) => {
      e.preventDefault();
      enqueue({ k: 'trip.put', id: t.id, data: { store: f.elements.store.value.trim(), total: S.parseNum(f.elements.total.value) } }, { silent: true });
      closeSheet();
    };
    $('#tdel', sh).onclick = () => {
      if (!confirm('Eliminare questa spesa dallo storico?')) return;
      enqueue({ k: 'trip.del', id: t.id }, { silent: true });
      closeSheetAndGo('#/t');
    };
  });
}
