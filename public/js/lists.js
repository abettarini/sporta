'use strict';
/* Sporta — liste: home, lista della spesa, dettagli articolo, abituali,
   conclusione della spesa, catalogo prodotti. */

const sortedLists = () => [...st.lists.values()].sort((a, b) => a.position - b.position || a.created_at - b.created_at);
const itemsOf = (listId) => [...st.items.values()].filter((i) => i.list_id === listId);
const todoOf = (listId) => itemsOf(listId).filter((i) => !i.checked).sort((a, b) => a.position - b.position || b.created_at - a.created_at);
const doneOf = (listId) => itemsOf(listId).filter((i) => i.checked).sort((a, b) => (b.checked_at || 0) - (a.checked_at || 0));
const lastListId = () => {
  const id = ls.get('lastList.' + st.code);
  return st.lists.has(id) ? id : (sortedLists()[0] || {}).id;
};
const pickItem = (i) => ({ list_id: i.list_id, name: i.name, qty: i.qty, unit: i.unit, brand: i.brand, note: i.note, department: i.department || '', tags: i.tags || [], checked: i.checked, position: i.position });

function topPos(listId) {
  const todo = todoOf(listId);
  return todo.length ? Math.min(...todo.map((i) => i.position)) - 1 : 0;
}

// Aggiunge un articolo (o somma la quantità se è già in lista). Reparto e tag arrivano dal
// catalogo prodotti, altrimenti il reparto viene proposto dal nome.
function addToList(listId, p) {
  const key = S.normName(p.name);
  const prod = st.products.get(key);
  const department = p.department ?? (prod && prod.department) ?? S.guessDepartment(p.name);
  const tags = p.tags ?? (prod && prod.tags) ?? [];
  const same = itemsOf(listId).filter((i) => S.normName(i.name) === key);
  const open = same.find((i) => !i.checked);
  if (open) {
    if (p.qty == null) {
      if (p.brand && p.brand !== open.brand) enqueue({ k: 'item.put', id: open.id, data: { brand: p.brand } }, { silent: true });
      flashIds.add(open.id);
      return { id: open.id, merged: true };
    }
    const sum = S.addQty(open.qty, open.unit, p.qty, p.unit);
    if (sum) {
      enqueue({ k: 'item.put', id: open.id, data: { qty: sum.qty, unit: sum.unit, ...(p.brand ? { brand: p.brand } : {}) } }, { silent: true });
      flashIds.add(open.id);
      return { id: open.id, merged: true };
    }
  }
  const done = !open && same.find((i) => i.checked);
  if (done) {
    enqueue({ k: 'item.put', id: done.id, data: { checked: false, qty: p.qty ?? null, unit: p.unit || '', brand: p.brand || done.brand, position: topPos(listId) } }, { silent: true });
    flashIds.add(done.id);
    return { id: done.id };
  }
  const id = uid();
  enqueue({
    k: 'item.put', id,
    data: { list_id: listId, name: p.name, qty: p.qty ?? null, unit: p.unit || '', brand: p.brand || '', note: p.note || '', department, tags, checked: false, position: topPos(listId) },
  }, { silent: true });
  flashIds.add(id);
  return { id };
}

// --------------------------------------------------------------- elenco delle liste del gruppo
Views.lists = {
  mount() {
    app.innerHTML = topBar(`<button class="group-btn" id="grp">${h(groupName())} ${I.down}</button>`, {
      right: `<button class="icon-btn" id="new-list" aria-label="Nuova lista">${I.plus}</button>`,
    }) + `<main><div class="list-cards" id="cards"></div>
      <button class="btn ghost block" id="favs-home" style="margin-top:12px">${I.star} Prodotti abituali</button></main>` + tabBar('lists');
    $('#new-list').onclick = () => listSheet();
    $('#grp').onclick = () => groupSheet();
    $('#favs-home').onclick = () => favoritesSheet(lastShoppingListId());
    sortable($('#cards'), {
      itemSel: '.list-card', handleSel: '.grip',
      onEnd: (id, ids) => reposition(ids, id, (x) => st.lists.get(x).position,
        (x, position) => enqueue({ k: 'list.put', id: x, data: { position } })),
    });
    this.update();
  },
  update() {
    // Schermi larghi: appena arrivano le liste si apre l'ultima, con la colonna laterale.
    if (hasPane() && st.lists.size) return mount();
    const g = $('#grp');
    if (g) g.innerHTML = `${h(groupName())} ${I.down}`;
    const lists = sortedLists();
    $('#cards').innerHTML = lists.length ? lists.map((l) => {
      const sm = listSummary(l);
      return `<div class="card list-card" data-id="${l.id}">
        <a class="lc" href="#/l/${l.id}">
          ${listTile(l)}
          <span class="t"><b>${h(l.name)}</b><span class="${sm.late ? 'late' : ''}">${h(sm.sub)}</span></span>
          ${sm.badge ? `<span class="badge">${sm.badge}</span>` : ''}
        </a>
        <span class="grip" aria-label="Trascina per riordinare">${I.grip}</span>
      </div>`;
    }).join('') : `<div class="empty">${emptyArt('basket')}Nessuna lista. Creane una con il +</div>`;
  },
};

function listSheet(list) {
  let emoji = list ? listIconId(list.emoji) : 'cart';
  let type = list ? typeOf(list) : 'spesa', variant = list ? list.variant || 'libri' : 'libri', iconTouched = !!list;
  const typeGrid = Object.entries(S.LIST_TYPES).map(([id, t]) => `<button type="button" data-type="${id}" class="${id === type ? 'on' : ''}">${iconTile(t.icon, 'sm')}<b>${h(t.label)}</b><small>${h(t.hint)}</small></button>`).join('');
  const kinds = Object.entries(S.COLLECTION_KINDS).map(([id, k]) => `<button type="button" class="chip ${id === variant ? 'on' : ''}" data-kind="${id}">${h(k.label)}</button>`).join('');
  openSheet(`<h2>${list ? 'Modifica lista' : 'Nuova lista'}</h2>
    <form id="lf">
      <label class="field"><span>Nome</span><input class="input" name="lname" required maxlength="80" value="${h(list ? list.name : '')}" placeholder="es. Supermercato, Torneo, Libri da leggere…"></label>
      ${list ? `<p class="muted small">Tipo: <b>${h(S.LIST_TYPES[type].label)}${type === 'collezione' ? ' · ' + h(S.kindOf(variant).label) : ''}</b></p>` : `<div class="field"><span>Tipo</span><div class="type-grid">${typeGrid}</div></div>
      <div class="field kind-field" ${type === 'collezione' ? '' : 'hidden'}><span>Cosa raccogli</span><div class="chips kind-pick">${kinds}</div></div>`}
      <div class="field"><span>Icona</span><div class="emoji-pick">${LIST_ICONS.map((e) => `<button type="button" data-e="${e}" class="${e === emoji ? 'on' : ''}" aria-label="${e}">${iconTile(e)}</button>`).join('')}</div></div>
      <div class="actions"><button type="button" class="btn" data-close>Annulla</button><button class="btn primary">Salva</button></div>
      ${list && moveTargets().length ? `<div class="actions"><button type="button" class="btn" id="move-list">${isPersonal() ? 'Condividi in un gruppo' : 'Sposta in un altro gruppo'}</button></div>` : ''}
      ${list ? `<div class="actions"><button type="button" class="btn danger" id="del-list">Elimina lista</button></div>` : ''}
    </form>`, (sh) => {
    const f = $('#lf', sh);
    if (!list) setTimeout(() => f.elements.lname.focus(), 50);
    const pickIcon = (e) => { emoji = e; sh.querySelectorAll('.emoji-pick button').forEach((x) => x.classList.toggle('on', x.dataset.e === e)); };
    $('.emoji-pick', sh).onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      iconTouched = true;
      pickIcon(b.dataset.e);
    };
    // Il tipo propone l'icona (finché non se ne sceglie una a mano).
    const tg = $('.type-grid', sh);
    if (tg) tg.onclick = (e) => {
      const b = e.target.closest('[data-type]'); if (!b) return;
      type = b.dataset.type;
      tg.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('on', x === b));
      $('.kind-field', sh).hidden = type !== 'collezione';
      if (!iconTouched) pickIcon(defaultListIcon(type, variant));
    };
    const kp = $('.kind-pick', sh);
    if (kp) kp.onclick = (e) => {
      const b = e.target.closest('[data-kind]'); if (!b) return;
      variant = b.dataset.kind;
      kp.querySelectorAll('[data-kind]').forEach((x) => x.classList.toggle('on', x === b));
      if (!iconTouched) pickIcon(defaultListIcon(type, variant));
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      const name = f.elements.lname.value.trim(); if (!name) return;
      const id = list ? list.id : uid();
      const maxPos = Math.max(0, ...[...st.lists.values()].map((l) => l.position));
      enqueue({ k: 'list.put', id, data: list ? { name, emoji } : { name, emoji, position: maxPos + 1, type, variant: type === 'collezione' ? variant : '' } });
      if (list) return closeSheet();
      closeSheetAndGo('#/l/' + id);
    };
    const mv = $('#move-list', sh);
    if (mv) mv.onclick = () => moveListSheet(list);
    const del = $('#del-list', sh);
    if (del) del.onclick = () => {
      if (!confirm(`Eliminare la lista "${list.name}" e tutti i suoi articoli?`)) return;
      enqueue({ k: 'list.del', id: list.id });
      closeSheetAndGo('#/l');
    };
  });
}

// --------------------------------------------------------------- spostare una lista in un altro gruppo
// Per esempio dal gruppo personale alla famiglia (o viceversa). Serve la connessione.
const moveTargets = () => orderedGroups().filter((g) => g.code !== st.code && g.token && g.status !== 'pending');

function moveListSheet(list) {
  openSheet(`<h2>Sposta «${h(list.name)}»</h2>
    <p class="muted">La lista passa, con tutti i suoi articoli, nel gruppo che scegli${isPersonal() ? ' e la vedranno tutti i suoi membri' : ''}. Le assegnazioni a persone vengono tolte${list.event_id ? ' e la lista non sarà più collegata all\'evento' : ''}.</p>
    <div class="card items pick-list">${moveTargets().map((g) => `<button type="button" class="row-btn" data-to="${h(g.code)}">${groupBadge(g)}<span class="t">${h(g.name)}<small class="as">${g.personal ? 'solo tuo' : 'sei ' + h(memberFor(g.code))}</small></span></button>`).join('')}</div>
    <p class="err" id="mv-err"></p>
    <div class="actions"><button type="button" class="btn" data-close>Annulla</button></div>`, (sh) => {
    sh.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-to]'); if (!b) return;
      const g = groupOf(b.dataset.to);
      sh.querySelectorAll('[data-to]').forEach((x) => { x.disabled = true; });
      try {
        // Prima si inviano le modifiche ancora in coda per questo gruppo.
        if (myOps().length) await flush();
        if (myOps().some((o) => o.id === list.id || (st.items.get(o.id) || {}).list_id === list.id)) throw new Error('Ci sono modifiche non ancora inviate: riprova con la connessione');
        await api('POST', `/api/lists/${list.id}/move`, { target_token: g.token });
        closeSheetAndGo('#/l');
        toast(`«${list.name}» spostata in ${g.name}`, { label: 'Apri', run: () => { location.hash = `#/go/${g.hid}/${list.id}`; } });
        if (typeof refreshOverview === 'function') refreshOverview(true);
      } catch (x) {
        $('#mv-err', sh).textContent = x.message;
        sh.querySelectorAll('[data-to]').forEach((y) => { y.disabled = false; });
      }
    });
  });
}

// --------------------------------------------------------------- colonna delle liste (schermi larghi)
function listsPaneBody(activeId) {
  return `<div class="pane-h"><b>Liste</b><button class="icon-btn" data-pane="new" aria-label="Nuova lista">${I.plus}</button></div>
    ${sortedLists().map((l) => {
      const sm = listSummary(l);
      return `<a class="pane-row ${l.id === activeId ? 'on' : ''}" href="#/l/${l.id}">${listTile(l, 'sm')}
        <span class="t"><b>${h(l.name)}</b><small>${h(sm.sub)}</small></span>${sm.badge ? `<span class="badge">${sm.badge}</span>` : ''}</a>`;
    }).join('')}
    <button class="pane-row ghost" data-pane="favs">${icon('star')} <span class="t"><b>Prodotti abituali</b></span></button>`;
}
function bindListsPane(activeId) {
  const pane = $('#pane-lists'); if (!pane) return;
  pane.onclick = (e) => {
    const b = e.target.closest('[data-pane]'); if (!b) return;
    if (b.dataset.pane === 'new') listSheet();
    if (b.dataset.pane === 'favs') favoritesSheet(activeId);
  };
}

// --------------------------------------------------------------- vista lista
function itemMeta(i) {
  const parts = [];
  if (i.brand) parts.push(h(i.brand));
  if (i.note) parts.push(h(i.note));
  if (i.checked && i.checked_by && i.checked_by !== st.member) parts.push('preso da ' + h(i.checked_by));
  else if (!i.checked && i.created_by && i.created_by !== st.member) parts.push('da ' + h(i.created_by));
  return parts.join(' · ');
}

function itemRow(i, { grip = false, dept = false } = {}) {
  const list = st.lists.get(i.list_id);
  if (list && typeOf(list) !== 'spesa') return typedRow(i, list, { grip });
  const q = S.fmtQty(i.qty, i.unit);
  const meta = itemMeta(i);
  const tags = tagPills(i.tags);
  const fav = (productOf(i.name) || {}).favorite;
  return `<li class="item ${i.checked ? 'done' : ''} ${flashIds.has(i.id) ? 'flash' : ''}" data-id="${i.id}">
    <button class="tap" data-act="toggle" aria-pressed="${i.checked}">
      <span class="check">${I.check}</span>
      <span class="txt"><span class="name">${dept ? deptTile(i.department, 'sm') : ''}${h(i.name)}${fav ? icon('starFill', 'fav') : ''}${q ? `<span class="qty">${h(q)}</span>` : ''}</span>
      ${meta || tags ? `<span class="meta">${meta}${tags ? ` <span class="tags">${tags}</span>` : ''}</span>` : ''}</span>
    </button>
    <button class="icon-btn more" data-act="edit" aria-label="Dettagli">${I.more}</button>
    ${grip ? `<span class="grip" aria-label="Trascina per riordinare">${I.grip}</span>` : ''}
  </li>`;
}

const SORT_LABEL = { manual: 'Manuale', department: 'Per reparto', alpha: 'A-Z', due: 'Scadenza' };
const SORT_BY_TYPE = { spesa: ['manual', 'department', 'alpha'], todo: ['manual', 'due', 'alpha'], collezione: ['manual', 'alpha'], generica: ['manual', 'alpha'] };
const PLACEHOLDER = {
  spesa: () => 'Aggiungi… (es. 2 kg patate @Selex)',
  todo: () => (isPersonal() ? 'Aggiungi… (es. rinnovare il passaporto venerdì !)' : 'Aggiungi… (es. prenotare il campo @Luca venerdì !)'),
  collezione: (l) => `Aggiungi… (es. ${S.kindOf(l.variant).example})`,
  generica: () => 'Aggiungi…',
};

Views.list = {
  showDone: ls.get('showDone') !== '0',
  tag: null,
  mount() {
    const list = st.lists.get(this.route.id);
    if (!list) { history.replaceState(null, '', '#/l'); return mount(); }
    ls.set('lastList.' + st.code, list.id);
    if (this.listId !== list.id) { this.listId = list.id; this.tag = null; this.filter = 'all'; }
    const type = typeOf(list);
    app.innerHTML = topBar(`<span id="lt"></span>`, {
      back: hasPane() ? '' : '#/l',
      right: `<span id="lv" class="viewers"></span><button class="icon-btn" id="list-menu" aria-label="Opzioni lista">${I.more}</button>`,
    }) + (hasPane() ? `<aside class="pane" id="pane-lists"></aside>` : '') + `<main class="wide">
      <div id="lev"></div>
      <div class="quick">
        <form id="qf" autocomplete="off">
          <input id="qi" enterkeyhint="done" placeholder="${h(PLACEHOLDER[type](list))}" aria-label="Aggiungi">
          <button class="add" aria-label="Aggiungi">${I.plus}</button>
        </form>
        <div class="suggest" id="sg"></div>
      </div>
      <div class="toolbar" id="tb"></div>
      <div id="todo-wrap"></div>
      <div id="done-wrap"></div>
    </main>` + tabBar('lists');
    const qi = $('#qi');
    $('#qf').onsubmit = (e) => {
      e.preventDefault();
      if (type !== 'spesa') {
        if (addTyped(st.lists.get(list.id), qi.value)) { qi.value = ''; render(); }
        return qi.focus();
      }
      const p = S.parseQuick(qi.value);
      if (!p.name) return;
      const r = addToList(list.id, p);
      if (r.merged) toast(p.qty != null ? `${p.name}: quantità aggiornata` : `${p.name} è già in lista`);
      qi.value = '';
      render();
      qi.focus();
    };
    qi.oninput = () => this.suggest();
    $('#sg').onclick = (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      const typed = S.parseQuick(qi.value);
      addToList(list.id, { name: b.dataset.name, qty: typed.qty, unit: typed.unit, brand: typed.brand || undefined });
      qi.value = '';
      render();
    };
    $('#list-menu').onclick = () => listSheet(st.lists.get(list.id));
    $('main').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'clear') return this.clearDone();
      if (act === 'close') return closeTripSheet(list.id);
      if (act === 'favs') return favoritesSheet(list.id);
      if (act === 'filter') { this.filter = btn.dataset.f; return render(); }
      if (act === 'sort') {
        const modes = SORT_BY_TYPE[type];
        const cur = modes.includes(st.lists.get(list.id).sort_mode) ? st.lists.get(list.id).sort_mode : 'manual';
        return enqueue({ k: 'list.put', id: list.id, data: { sort_mode: modes[(modes.indexOf(cur) + 1) % modes.length] } });
      }
      if (act === 'tag') { this.tag = this.tag === btn.dataset.tag ? null : btn.dataset.tag; return render(); }
      if (act === 'toggle-done') { this.showDone = !this.showDone; ls.set('showDone', this.showDone ? '1' : '0'); return render(); }
      const li = btn.closest('.item');
      const it = li && st.items.get(li.dataset.id);
      if (!it) return;
      if (act === 'take') {
        if (!st.me) return toast('Un momento: sto collegando questo telefono al gruppo');
        return enqueue({ k: 'item.put', id: it.id, data: { assigned_to: st.me.id } });
      }
      if (act === 'toggle') {
        vibrate(10);
        const data = { checked: !it.checked };
        if (it.checked) data.position = topPos(it.list_id);
        enqueue({ k: 'item.put', id: it.id, data });
      } else if (act === 'edit') itemSheet(it);
    });
    this.update();
  },
  update() {
    const list = st.lists.get(this.route.id);
    if (!list) { toast('La lista è stata eliminata'); history.replaceState(null, '', '#/l'); return mount(); }
    $('#lt').innerHTML = `${listTile(list, 'sm')} ${h(list.name)}`;
    $('#lv').innerHTML = viewersHtml(list.id);
    // Lista di un evento: collegamento all'evento.
    const ev = list.event_id && st.events.get(list.event_id);
    $('#lev').innerHTML = ev ? `<a class="event-chip" href="#/e/${ev.id}">${I.cal}<span>${h(ev.title)} · ${h(eventWhen(ev, true))}</span><span class="chev">›</span></a>` : '';
    const pane = $('#pane-lists');
    if (pane) { pane.innerHTML = listsPaneBody(list.id); if (!pane.onclick) bindListsPane(list.id); }
    const type = typeOf(list);
    const mode = SORT_BY_TYPE[type].includes(list.sort_mode) ? list.sort_mode : 'manual';
    let todo = todoOf(list.id);
    const done = doneOf(list.id);
    const tagsHere = [...new Set(todo.flatMap((i) => i.tags || []))].sort();
    if (this.tag && !tagsHere.includes(this.tag)) this.tag = null;
    if (this.tag) todo = todo.filter((i) => (i.tags || []).includes(this.tag));
    const meId = st.me && st.me.id;
    // Filtri propri del tipo: "mie" / "senza nessuno" (da fare), stato (libri, film…).
    const fchip = (f, label) => `<button class="chip tool ${this.filter === f ? 'on' : ''}" data-act="filter" data-f="${f}">${label}</button>`;
    let filters = '';
    if (type === 'todo' && !isPersonal()) {
      const mine = todo.filter((i) => i.assigned_to && i.assigned_to === meId).length;
      const nobody = todo.filter((i) => !i.assigned_to).length;
      filters = fchip('all', 'Tutte') + fchip('mine', `Mie · ${mine}`) + fchip('nobody', `Senza nessuno · ${nobody}`);
      if (this.filter === 'mine') todo = todo.filter((i) => i.assigned_to && i.assigned_to === meId);
      if (this.filter === 'nobody') todo = todo.filter((i) => !i.assigned_to);
    } else if (type === 'collezione') {
      const k = S.kindOf(list.variant);
      const doing = todo.filter((i) => (i.data || {}).status === 1).length;
      filters = fchip('all', 'Tutti') + fchip('s0', `${h(k.states[0])} · ${todo.length - doing}`) + (doing ? fchip('s1', `${h(k.states[1])} · ${doing}`) : '');
      if (this.filter === 's0') todo = todo.filter((i) => (i.data || {}).status !== 1);
      if (this.filter === 's1') todo = todo.filter((i) => (i.data || {}).status === 1);
    } else if (this.filter !== 'all') this.filter = 'all';
    const filtered = this.tag || (this.filter && this.filter !== 'all');

    $('#sg').hidden = type !== 'spesa';
    $('#tb').innerHTML = (type === 'spesa' ? `<button class="chip tool" data-act="favs">${I.star} Abituali</button>` : '') + filters +
      `<button class="chip tool" data-act="sort">${I.sort} ${SORT_LABEL[mode]}</button>
      ${tagsHere.map((t) => `<button class="chip tool ${this.tag === t ? 'on' : ''}" data-act="tag" data-tag="${h(t)}">#${h(t)}</button>`).join('')}`;

    const wrap = $('#todo-wrap');
    if (mode === 'due') {
      const key = (i) => i.due_date || '9999-99-99';
      wrap.innerHTML = `<ul class="items">${todo.sort((a, b) => key(a).localeCompare(key(b)) || b.priority - a.priority || a.position - b.position).map((i) => itemRow(i)).join('')}</ul>`;
    } else if (mode === 'department') {
      const groups = new Map();
      for (const i of todo) {
        const d = S.deptOf(i.department).id;
        if (!groups.has(d)) groups.set(d, []);
        groups.get(d).push(i);
      }
      wrap.innerHTML = `<div class="dept-cols">${S.DEPARTMENTS.filter((d) => groups.has(d.id)).map((d) => `<section class="dept-block"><div class="dept-h">${deptTile(d.id, 'sm')} ${h(d.label)} <small>${groups.get(d.id).length}</small></div>
        <ul class="items">${groups.get(d.id).sort((a, b) => a.name.localeCompare(b.name, 'it')).map((i) => itemRow(i)).join('')}</ul></section>`).join('')}</div>`;
    } else if (mode === 'alpha') {
      wrap.innerHTML = `<ul class="items">${todo.sort((a, b) => a.name.localeCompare(b.name, 'it')).map((i) => itemRow(i, { dept: true })).join('')}</ul>`;
    } else {
      wrap.innerHTML = `<ul class="items" id="todo">${todo.map((i) => itemRow(i, { grip: !filtered })).join('')}</ul>`;
      const ul = $('#todo');
      if (!filtered) {
        sortable(ul, {
          itemSel: '.item', handleSel: '.grip',
          onEnd: (id, ids) => reposition(ids, id, (x) => st.items.get(x).position,
            (x, position) => enqueue({ k: 'item.put', id: x, data: { position } }, { silent: true })),
        });
      }
    }
    const allTodo = todoOf(list.id).length;
    const doneLabel = { spesa: 'Nel carrello', todo: 'Fatte', generica: 'Fatte', collezione: S.kindOf(list.variant).states[2] }[type];
    const emptyText = {
      spesa: 'La lista è vuota.<br>Scrivi qui sopra cosa serve, oppure tocca <b>Abituali</b>.',
      todo: 'Niente da fare.<br>Scrivi qui sopra, anche con la persona e la scadenza: <i>prenotare il campo @Luca venerdì</i>.',
      collezione: 'La lista è vuota.<br>Scrivi un titolo, anche con l\'autore: <i>' + h(S.kindOf(list.variant).example) + '</i>.',
      generica: 'La lista è vuota.<br>Scrivi qui sopra.',
    }[type];
    const doneActions = type === 'spesa' ? `<span><button class="btn ghost" data-act="clear">Svuota</button><button class="btn primary sm" data-act="close">Concludi spesa</button></span>`
      : type === 'collezione' ? '' : `<span><button class="btn ghost" data-act="clear">Svuota</button></span>`;
    $('#done-wrap').innerHTML = (!allTodo && !done.length)
      ? `<div class="empty">${emptyArt(type === 'collezione' ? 'book' : 'list')}${emptyText}</div>`
      : (!allTodo && type !== 'collezione' ? `<div class="empty" style="padding:24px">${emptyArt('done')}${type === 'spesa' ? 'Tutto preso!' : 'Tutto fatto!'}</div>` : '') +
        (done.length ? `<div class="section-h"><button class="btn ghost" data-act="toggle-done">${this.showDone ? '▾' : '▸'} ${h(doneLabel)} (${done.length})</button>
          ${doneActions}</div>
          ${this.showDone ? `<ul class="items">${done.map((i) => itemRow(i)).join('')}</ul>` : ''}` : '');
    flashIds.clear();
    this.suggest();
  },
  suggest() {
    const qi = $('#qi'); if (!qi) return;
    if (typeOf(st.lists.get(this.route.id)) !== 'spesa') { $('#sg').innerHTML = ''; return; }
    const typed = S.normName(S.parseQuick(qi.value).name);
    const inList = new Set(todoOf(this.route.id).map((i) => S.normName(i.name)));
    let cand = [...st.products.values()].filter((x) => !inList.has(x.key));
    if (typed) {
      const starts = [], has = [];
      for (const x of cand) {
        if (x.key === typed) continue;
        if (x.key.startsWith(typed)) starts.push(x); else if (x.key.includes(typed)) has.push(x);
      }
      cand = starts.concat(has);
    } else {
      cand = cand.filter((x) => x.count > 0).sort((a, b) => (b.favorite - a.favorite) || b.count - a.count);
    }
    $('#sg').innerHTML = cand.slice(0, 12).map((x) =>
      `<button type="button" class="chip" data-name="${h(x.name)}">${x.favorite ? icon('starFill', 'fav') + ' ' : ''}${h(x.name)}${x.brand ? `<small>${h(x.brand)}</small>` : ''}</button>`).join('');
  },
  clearDone() {
    const list = st.lists.get(this.route.id);
    const done = doneOf(list.id);
    if (!done.length) return;
    const backup = done.map((i) => ({ ...i }));
    enqueue({ k: 'list.clear', id: list.id });
    toast(`${backup.length} ${backup.length === 1 ? 'elemento rimosso' : 'elementi rimossi'}`, {
      label: 'Annulla',
      run: () => backup.forEach((i) => enqueue({ k: 'item.put', id: i.id, data: { ...pickItem(i), due_date: i.due_date, priority: i.priority, data: i.data, assigned_to: i.assigned_to } })),
    });
  },
};

function itemSheet(it) {
  const own = st.lists.get(it.list_id);
  if (own && typeOf(own) !== 'spesa') return typedSheet(it, own);
  const lists = shoppingLists();
  const prod = productOf(it.name) || {};
  openSheet(`<h2>Dettagli</h2>
    <form id="itf">
      <label class="field"><span>Nome</span><input class="input" name="iname" required maxlength="120" value="${h(it.name)}"></label>
      <div class="row">
        <label class="field"><span>Quantità</span><input class="input" name="qty" inputmode="decimal" placeholder="—" value="${h(S.fmtNum(it.qty))}"></label>
        <label class="field narrow"><span>Unità</span><select class="input" name="unit">${unitOptions(it.unit)}</select></label>
      </div>
      <label class="field"><span>Marca</span><input class="input" name="brand" list="brands" maxlength="80" placeholder="Qualsiasi" value="${h(it.brand)}">${brandDatalist()}</label>
      ${deptPicker('department', it.department)}
      ${tagField('tags', it.tags)}
      <label class="field"><span>Nota</span><input class="input" name="note" maxlength="300" placeholder="es. quello senza lattosio" value="${h(it.note)}"></label>
      ${lists.length > 1 ? `<label class="field"><span>Lista</span><select class="input" name="list_id">${lists.map((l) => listOption(l, it.list_id)).join('')}</select></label>` : ''}
      <label class="switch"><input type="checkbox" name="favorite" ${prod.favorite ? 'checked' : ''}><span>${I.star} Prodotto abituale</span></label>
      <div class="actions"><button type="button" class="btn danger" id="del">Elimina</button><button class="btn primary">Salva</button></div>
    </form>`, (sh) => {
    const f = $('#itf', sh);
    bindTagField(sh, 'tags');
    bindDeptPicker(sh, 'department');
    f.onsubmit = (e) => {
      e.preventDefault();
      const el = f.elements;
      const name = el.iname.value.trim(); if (!name) return;
      const data = {
        name, qty: S.parseNum(el.qty.value), unit: el.unit.value, brand: el.brand.value.trim(), note: el.note.value.trim(),
        department: el.department.value, tags: parseTags(el.tags.value),
      };
      if (el.list_id && el.list_id.value !== it.list_id) { data.list_id = el.list_id.value; data.position = topPos(data.list_id); }
      enqueue({ k: 'item.put', id: it.id, data }, { silent: true });
      const p = productOf(name);
      if (!!el.favorite.checked !== !!(p && p.favorite)) {
        enqueue({ k: 'product.put', id: S.normName(name), data: { name, favorite: el.favorite.checked } }, { silent: true });
      }
      closeSheet();
    };
    $('#del', sh).onclick = () => {
      const backup = { ...it };
      enqueue({ k: 'item.del', id: it.id });
      closeSheet();
      toast(`${backup.name} eliminato`, { label: 'Annulla', run: () => enqueue({ k: 'item.put', id: backup.id, data: pickItem(backup) }) });
    };
  });
}

// --------------------------------------------------------------- abituali
const favorites = () => [...st.products.values()].filter((p) => p.favorite)
  .sort((a, b) => S.DEPARTMENTS.indexOf(S.deptOf(a.department)) - S.DEPARTMENTS.indexOf(S.deptOf(b.department)) || a.name.localeCompare(b.name, 'it'));

function favoritesSheet(listId) {
  if (!listId) return toast('Crea prima una lista');
  const draw = (sh) => {
    const favs = favorites();
    const inList = new Set(todoOf(listId).map((i) => S.normName(i.name)));
    const missing = favs.filter((p) => !inList.has(p.key));
    $('#fav-body', sh).innerHTML = favs.length ? `<ul class="items">${favs.map((p) => {
      const q = S.fmtQty(p.qty, p.unit);
      const there = inList.has(p.key);
      return `<li class="item ${there ? 'done' : ''}" data-key="${h(p.key)}"><button class="tap" type="button">
        <span class="check">${I.check}</span>
        <span class="txt"><span class="name" style="text-decoration:none">${deptTile(p.department, 'sm')} ${h(p.name)}${q ? `<span class="qty">${h(q)}</span>` : ''}</span>
        ${p.brand ? `<span class="meta">${h(p.brand)}</span>` : ''}</span></button></li>`;
    }).join('')}</ul>` : `<div class="empty">${emptyArt('star')}Nessun prodotto abituale.<br>Segnali con la ${icon('star')} dai dettagli di un articolo (⋮) o dal catalogo Prodotti.</div>`;
    const all = $('#fav-all', sh);
    all.hidden = !missing.length;
    all.textContent = `Aggiungi i ${missing.length} mancanti`;
  };
  const list = st.lists.get(listId);
  openSheet(`<h2>${I.star} Abituali</h2>
    <p class="muted">Tocca per aggiungere a <b>${h(list.name)}</b>.</p>
    <div id="fav-body"></div>
    <div class="actions"><a class="btn" href="#/p">Gestisci prodotti</a><button class="btn primary" id="fav-all"></button></div>`, (sh) => {
    draw(sh);
    const add = (p) => addToList(listId, { name: p.name, qty: p.qty, unit: p.unit, brand: p.brand, department: p.department, tags: p.tags });
    $('#fav-body', sh).onclick = (e) => {
      const li = e.target.closest('[data-key]'); if (!li || li.classList.contains('done')) return;
      add(st.products.get(li.dataset.key));
      vibrate(10);
      saveCache(); draw(sh); render();
    };
    $('#fav-all', sh).onclick = () => {
      const inList = new Set(todoOf(listId).map((i) => S.normName(i.name)));
      const missing = favorites().filter((p) => !inList.has(p.key));
      missing.forEach(add);
      closeSheet();
      toast(`${missing.length} prodotti aggiunti`);
    };
  });
}

// --------------------------------------------------------------- concludi spesa
function closeTripSheet(listId) {
  const done = doneOf(listId);
  if (!done.length) return;
  const stores = [...new Set([...st.trips.values()].map((t) => t.store).filter(Boolean))];
  openSheet(`<h2>Concludi spesa</h2>
    <p class="muted">${done.length} ${done.length === 1 ? 'articolo preso verrà salvato' : 'articoli presi verranno salvati'} nelle <b>Spese</b> e tolti dalla lista.</p>
    <form id="ctf">
      <label class="field"><span>Negozio (facoltativo)</span><input class="input" name="store" list="stores" maxlength="80" placeholder="es. Esselunga, Lidl…">
        <datalist id="stores">${stores.map((s) => `<option value="${h(s)}">`).join('')}</datalist></label>
      <label class="field"><span>Totale speso (facoltativo)</span><input class="input" name="total" inputmode="decimal" placeholder="€"></label>
      <div class="actions"><button type="button" class="btn" data-close>Annulla</button><button class="btn primary">Salva spesa</button></div>
    </form>`, (sh) => {
    const f = $('#ctf', sh);
    f.onsubmit = (e) => {
      e.preventDefault();
      const trip = uid();
      enqueue({ k: 'list.close', id: listId, trip, data: { store: f.elements.store.value.trim(), total: S.parseNum(f.elements.total.value) } });
      closeSheet();
      vibrate(30);
      toast('Spesa salvata', { label: 'Vedi', run: () => { location.hash = '#/t/' + trip; } });
    };
  });
}

// --------------------------------------------------------------- catalogo prodotti
Views.products = {
  q: '',
  mount() {
    app.innerHTML = topBar('Prodotti', { back: '#/s', right: `<button class="icon-btn" id="np" aria-label="Nuovo prodotto">${I.plus}</button>` }) +
      `<main class="wide"><input class="input search" id="pq" type="search" placeholder="Cerca prodotto, marca o #tag…" value="${h(this.q)}">
      <p class="muted small">Il catalogo si riempie da solo con quello che aggiungi alle liste e alle ricette. Qui puoi impostare reparto, tag, quantità e marca abituali, e segnare con ${icon('star')} i prodotti abituali.</p>
      <div id="pl"></div></main>` + tabBar('settings');
    $('#pq').oninput = (e) => { this.q = e.target.value; this.update(); };
    $('#np').onclick = () => productSheet(null);
    $('#pl').onclick = (e) => {
      const star = e.target.closest('[data-star]');
      if (star) {
        const p = st.products.get(star.dataset.star);
        return enqueue({ k: 'product.put', id: p.key, data: { name: p.name, favorite: !p.favorite } });
      }
      const row = e.target.closest('[data-key]');
      if (row) productSheet(st.products.get(row.dataset.key));
    };
    this.update();
  },
  update() {
    const q = S.normName(this.q).replace(/^#/, '');
    const all = [...st.products.values()].filter((p) => !q || p.key.includes(q) || S.normName(p.brand).includes(q) || (p.tags || []).some((t) => t.includes(q)));
    const groups = new Map();
    for (const p of all) {
      const d = S.deptOf(p.department).id;
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(p);
    }
    $('#pl').innerHTML = all.length ? '<div class="dept-cols">' + S.DEPARTMENTS.filter((d) => groups.has(d.id)).map((d) => `<section class="dept-block"><div class="dept-h">${deptTile(d.id, 'sm')} ${h(d.label)} <small>${groups.get(d.id).length}</small></div>
      <ul class="items">${groups.get(d.id).sort((a, b) => a.name.localeCompare(b.name, 'it')).map((p) => {
        const q2 = S.fmtQty(p.qty, p.unit);
        const meta = [p.brand && h(p.brand), q2 && h(q2)].filter(Boolean).join(' · ');
        return `<li class="item"><button class="tap" data-key="${h(p.key)}" type="button"><span class="txt"><span class="name">${h(p.name)}</span>
          ${meta || (p.tags || []).length ? `<span class="meta">${meta} <span class="tags">${tagPills(p.tags)}</span></span>` : ''}</span></button>
          <button class="icon-btn star ${p.favorite ? 'on' : ''}" data-star="${h(p.key)}" aria-label="Abituale">${p.favorite ? I.starFill : I.star}</button></li>`;
      }).join('')}</ul></section>`).join('') + '</div>' : `<div class="empty">${emptyArt('tag')}${st.products.size ? 'Nessun prodotto trovato.' : 'Il catalogo è vuoto: inizia ad aggiungere articoli alle liste.'}</div>`;
  },
};

function productSheet(p) {
  const isNew = !p;
  p = p || { key: '', name: '', unit: '', brand: '', department: '', tags: [], favorite: false, qty: null };
  openSheet(`<h2>${isNew ? 'Nuovo prodotto' : h(p.name)}</h2>
    <form id="pf">
      ${isNew ? `<label class="field"><span>Nome</span><input class="input" name="pname" required maxlength="120"></label>` : ''}
      <div class="row">
        <label class="field"><span>Quantità abituale</span><input class="input" name="qty" inputmode="decimal" placeholder="—" value="${h(S.fmtNum(p.qty))}"></label>
        <label class="field narrow"><span>Unità</span><select class="input" name="unit">${unitOptions(p.unit)}</select></label>
      </div>
      <label class="field"><span>Marca preferita</span><input class="input" name="brand" list="brands" maxlength="80" value="${h(p.brand)}">${brandDatalist()}</label>
      ${deptPicker('department', p.department)}
      ${tagField('tags', p.tags)}
      <label class="switch"><input type="checkbox" name="favorite" ${p.favorite ? 'checked' : ''}><span>${I.star} Prodotto abituale</span></label>
      <div class="actions">${isNew ? '<button type="button" class="btn" data-close>Annulla</button>' : '<button type="button" class="btn danger" id="pdel">Elimina</button>'}<button class="btn primary">Salva</button></div>
      ${!isNew && shoppingLists().length ? `<div class="actions"><button type="button" class="btn" id="padd">Aggiungi alla lista</button></div>` : ''}
    </form>`, (sh) => {
    const f = $('#pf', sh);
    bindTagField(sh, 'tags');
    const setDept = bindDeptPicker(sh, 'department');
    if (isNew) {
      const n = f.elements.pname;
      setTimeout(() => n.focus(), 50);
      n.addEventListener('change', () => { if (!f.elements.department.value) setDept(S.guessDepartment(n.value)); });
    }
    const values = () => {
      const el = f.elements;
      return { qty: S.parseNum(el.qty.value), unit: el.unit.value, brand: el.brand.value.trim(), department: el.department.value, tags: parseTags(el.tags.value), favorite: el.favorite.checked };
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      const name = isNew ? f.elements.pname.value.trim() : p.name;
      if (!name) return;
      enqueue({ k: 'product.put', id: S.normName(name), data: { name, ...values() } }, { silent: true });
      closeSheet();
    };
    const del = $('#pdel', sh);
    if (del) del.onclick = () => {
      if (!confirm(`Togliere "${p.name}" dal catalogo? Non verrà più suggerito.`)) return;
      enqueue({ k: 'product.del', id: p.key }, { silent: true });
      closeSheet();
    };
    const add = $('#padd', sh);
    if (add) add.onclick = () => {
      const v = values();
      const listId = lastShoppingListId();
      addToList(listId, { name: p.name, qty: v.qty, unit: v.unit, brand: v.brand, department: v.department, tags: v.tags });
      closeSheet();
      toast(`${p.name} aggiunto a ${st.lists.get(listId).name}`);
    };
  });
}
