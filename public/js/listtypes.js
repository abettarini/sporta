'use strict';
/* Sporta — tipi di lista diversi dalla spesa: "Da fare" (scadenza, priorità, persona),
   "Libri, film e desideri" (autore, stato, voto, prezzo, link) e "Generica".
   La spesa resta in lists.js; qui righe, dettagli e inserimento rapido degli altri tipi. */

const typeOf = (l) => (l && l.type) || 'spesa';
const shoppingLists = () => sortedLists().filter((l) => typeOf(l) === 'spesa');
const lastShoppingListId = () => {
  const id = ls.get('lastList.' + st.code);
  const l = st.lists.get(id);
  return l && typeOf(l) === 'spesa' ? id : (shoppingLists()[0] || {}).id;
};
const defaultListIcon = (type, variant) => (type === 'collezione' ? S.kindOf(variant).icon : S.LIST_TYPES[type].icon);

// Riepilogo di una lista per la home e la colonna laterale.
function listSummary(l) {
  const todo = todoOf(l.id), done = doneOf(l.id);
  const type = typeOf(l);
  if (type === 'spesa') {
    return { sub: (todo.length ? `${todo.length} da prendere` : 'Tutto preso') + (done.length ? ` · ${done.length} nel carrello` : ''), badge: todo.length };
  }
  if (type === 'collezione') {
    const k = S.kindOf(l.variant);
    const doing = todo.filter((i) => (i.data || {}).status === 1).length;
    const parts = [];
    if (todo.length - doing) parts.push(`${todo.length - doing} ${k.states[0].toLowerCase()}`);
    if (doing) parts.push(`${doing} ${k.states[1].toLowerCase()}`);
    if (done.length) parts.push(`${done.length} ${k.states[2].toLowerCase()}`);
    return { sub: parts.join(' · ') || 'Vuota', badge: 0 };
  }
  const me = st.me && st.me.id;
  const late = todo.filter((i) => S.fmtDue(i.due_date).state === 'late').length;
  const mine = todo.filter((i) => me && i.assigned_to === me).length;
  const parts = [todo.length ? `${todo.length} da fare` : 'Tutto fatto'];
  if (late) parts.push(`${late} ${late === 1 ? 'scaduta' : 'scadute'}`);
  if (mine) parts.push(`${mine} ${mine === 1 ? 'tua' : 'tue'}`);
  return { sub: parts.join(' · '), badge: todo.length, late: !!late };
}

const activeMembers = () => [...st.members.values()].filter((m) => m.status === 'active');
const memberById = (id) => (id && st.members.get(id)) || null;
const memberLabel = (id) => { const m = memberById(id); return m ? (st.me && m.id === st.me.id ? 'tu' : m.alias) : ''; };
// Trova un membro dal nome scritto dopo "@" (maiuscole indifferenti, basta l'inizio del nome).
function findMember(name) {
  const n = S.normName(name);
  if (!n) return null;
  const all = activeMembers();
  return all.find((m) => S.normName(m.alias) === n) || all.find((m) => S.normName(m.alias).startsWith(n)) || null;
}

function dueChip(due) {
  const d = S.fmtDue(due);
  return d.text ? `<span class="due ${d.state}">${h(d.text)}</span>` : '';
}

// --------------------------------------------------------------- inserimento rapido
function addTyped(list, text) {
  const type = typeOf(list);
  let data;
  if (type === 'todo') {
    const p = S.parseTodo(text);
    if (!p.name) return null;
    data = { name: p.name, due_date: p.due, priority: p.priority };
    if (p.assignee && !isPersonal()) {
      const m = findMember(p.assignee);
      if (m) data.assigned_to = m.id;
      else toast(`Nel gruppo non c'è nessuno di nome "${p.assignee}"`);
    }
  } else if (type === 'collezione') {
    const p = S.parseCollection(text);
    if (!p.name) return null;
    data = { name: p.name, data: p.creator ? { creator: p.creator } : {} };
  } else {
    const name = String(text || '').trim();
    if (!name) return null;
    data = { name: name.charAt(0).toUpperCase() + name.slice(1) };
  }
  const id = uid();
  enqueue({ k: 'item.put', id, data: { list_id: list.id, note: '', tags: [], checked: false, position: topPos(list.id), ...data } }, { silent: true });
  flashIds.add(id);
  return id;
}

// --------------------------------------------------------------- righe
function typedRow(i, list, { grip = false } = {}) {
  const type = typeOf(list);
  const tags = tagPills(i.tags);
  const flash = flashIds.has(i.id) ? 'flash' : '';
  const more = `<button class="icon-btn more" data-act="edit" aria-label="Dettagli">${I.more}</button>${grip ? `<span class="grip" aria-label="Trascina per riordinare">${I.grip}</span>` : ''}`;
  if (type === 'todo') {
    const m = memberById(i.assigned_to);
    const meta = [i.note && h(i.note), i.checked && i.checked_by ? 'fatto da ' + h(i.checked_by === st.member ? 'te' : i.checked_by) : '',
      !i.checked && i.created_by && i.created_by !== st.member ? 'da ' + h(i.created_by) : ''].filter(Boolean).join(' · ');
    // La scadenza va nella riga dei dettagli, sotto il nome: sul telefono il nome ha tutto lo spazio.
    const due = i.checked ? '' : dueChip(i.due_date);
    return `<li class="item todo-item ${i.checked ? 'done' : ''} ${i.priority > 0 && !i.checked ? 'prio-high' : ''} ${flash}" data-id="${i.id}">
      <button class="tap" data-act="toggle" aria-pressed="${i.checked}"><span class="check">${I.check}</span>
        <span class="txt"><span class="name">${h(i.name)}</span>${meta || tags || due ? `<span class="meta">${due}${meta}${tags ? ` <span class="tags">${tags}</span>` : ''}</span>` : ''}</span></button>
      ${isPersonal() ? '' : m ? `<span class="assignee" title="${h(m.alias)}">${avatar(m, 'sm')}</span>` : !i.checked ? '<button class="mini" data-act="take">Prendo io</button>' : ''}
      ${more}</li>`;
  }
  if (type === 'collezione') {
    const d = i.data || {};
    const k = S.kindOf(list.variant);
    const status = i.checked ? 2 : d.status === 1 ? 1 : 0;
    const meta = [
      `<span class="st s${status}">${h(k.states[status])}</span>`,
      d.rating ? `<span class="stars">${'★'.repeat(d.rating)}<i>${'★'.repeat(5 - d.rating)}</i></span>` : '',
      d.price != null ? h(S.fmtMoney(d.price)) : '',
      d.link ? `<a href="${h(d.link)}" target="_blank" rel="noopener" class="lnk">link</a>` : '',
      i.note ? h(i.note) : '',
    ].filter(Boolean).join(' · ');
    return `<li class="item coll-item ${i.checked ? 'done' : ''} ${flash}" data-id="${i.id}">
      <button class="tap" data-act="toggle" aria-pressed="${i.checked}"><span class="check">${I.check}</span>
        <span class="txt"><span class="name">${h(i.name)}</span>${d.creator ? `<span class="creator">${h(d.creator)}</span>` : ''}
        <span class="meta">${meta}${tags ? ` <span class="tags">${tags}</span>` : ''}</span></span></button>
      ${more}</li>`;
  }
  const meta = [i.note && h(i.note), !i.checked && i.created_by && i.created_by !== st.member ? 'da ' + h(i.created_by) : ''].filter(Boolean).join(' · ');
  return `<li class="item ${i.checked ? 'done' : ''} ${flash}" data-id="${i.id}">
    <button class="tap" data-act="toggle" aria-pressed="${i.checked}"><span class="check">${I.check}</span>
      <span class="txt"><span class="name">${h(i.name)}</span>${meta || tags ? `<span class="meta">${meta}${tags ? ` <span class="tags">${tags}</span>` : ''}</span>` : ''}</span></button>
    ${more}</li>`;
}

// --------------------------------------------------------------- dettagli
function typedSheet(it, list) {
  const type = typeOf(list);
  const same = sortedLists().filter((l) => typeOf(l) === type);
  const d = it.data || {};
  const k = S.kindOf(list.variant);
  const meId = st.me && st.me.id;
  const declinable = type === 'todo' && meId && it.assigned_to === meId && it.assigned_by && it.assigned_by !== meId;
  const today = new Date();
  const quickDates = [['', 'Nessuna'], [S.ymd(today), 'Oggi'], [S.ymd(S.addDays(today, 1)), 'Domani'], [S.ymd(S.addDays(today, 7)), 'Tra una settimana']];
  const fields = type === 'todo' ? `${isPersonal() ? '' : `
      <div class="field"><span>Chi se ne occupa</span><input type="hidden" name="assigned_to" value="${h(it.assigned_to || '')}">
        <div class="chips who-pick"><button type="button" class="chip ${!it.assigned_to ? 'on' : ''}" data-who="">Nessuno</button>
        ${activeMembers().sort((a, b) => (b.id === meId) - (a.id === meId) || a.alias.localeCompare(b.alias, 'it')).map((m) => `<button type="button" class="chip ${it.assigned_to === m.id ? 'on' : ''}" data-who="${m.id}">${h(m.id === meId ? m.alias + ' (io)' : m.alias)}</button>`).join('')}</div></div>`}
      <div class="field"><span>Scadenza</span>
        <div class="chips due-pick">${quickDates.map(([v, l]) => `<button type="button" class="chip ${it.due_date === v ? 'on' : ''}" data-due="${v}">${l}</button>`).join('')}</div>
        <input class="input" type="date" name="due_date" value="${h(it.due_date || '')}" style="margin-top:8px"></div>
      <div class="field"><span>Priorità</span><input type="hidden" name="priority" value="${it.priority || 0}"><div class="seg" data-for="priority">
        <button type="button" data-v="-1" class="${it.priority < 0 ? 'on' : ''}">Bassa</button><button type="button" data-v="0" class="${!it.priority ? 'on' : ''}">Normale</button><button type="button" data-v="1" class="${it.priority > 0 ? 'on' : ''}">Alta</button></div></div>`
    : type === 'collezione' ? `
      <label class="field"><span>${h(k.creator)}</span><input class="input" name="creator" maxlength="120" value="${h(d.creator || '')}"></label>
      <div class="field"><span>Stato</span><input type="hidden" name="status" value="${it.checked ? 2 : d.status === 1 ? 1 : 0}"><div class="seg" data-for="status">
        ${k.states.map((s, n) => `<button type="button" data-v="${n}" class="${(it.checked ? 2 : d.status === 1 ? 1 : 0) === n ? 'on' : ''}">${h(s)}</button>`).join('')}</div></div>
      <div class="field"><span>Voto</span><input type="hidden" name="rating" value="${d.rating || 0}"><div class="rate">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-r="${n}" class="${(d.rating || 0) >= n ? 'on' : ''}" aria-label="${n} stelle">★</button>`).join('')}</div></div>
      <div class="row"><label class="field"><span>Prezzo</span><input class="input" name="price" inputmode="decimal" placeholder="€" value="${h(S.fmtNum(d.price))}"></label>
        <label class="field"><span>Link</span><input class="input" name="link" type="url" inputmode="url" placeholder="https://…" value="${h(d.link || '')}"></label></div>` : '';
  openSheet(`<h2>Dettagli</h2>
    <form id="tyf">
      <label class="field"><span>${type === 'collezione' ? 'Titolo' : 'Cosa'}</span><input class="input" name="iname" required maxlength="120" value="${h(it.name)}"></label>
      ${fields}
      ${tagField('tags', it.tags)}
      <label class="field"><span>Nota</span><input class="input" name="note" maxlength="300" value="${h(it.note)}"></label>
      ${same.length > 1 ? `<label class="field"><span>Lista</span><select class="input" name="list_id">${same.map((l) => listOption(l, it.list_id)).join('')}</select></label>` : ''}
      ${declinable ? `<div class="decline"><span>${h(memberLabel(it.assigned_by) || 'Qualcuno')} l'ha assegnato a te.</span><button type="button" class="btn" id="decline">Non posso</button></div>` : ''}
      <div class="actions"><button type="button" class="btn danger" id="del">Elimina</button><button class="btn primary">Salva</button></div>
    </form>`, (sh) => {
    const f = $('#tyf', sh);
    bindTagField(sh, 'tags');
    sh.querySelectorAll('.seg[data-for]').forEach((seg) => bindSeg(sh, seg.dataset.for));
    const who = $('.who-pick', sh);
    if (who) who.onclick = (e) => {
      const b = e.target.closest('[data-who]'); if (!b) return;
      f.elements.assigned_to.value = b.dataset.who;
      who.querySelectorAll('[data-who]').forEach((x) => x.classList.toggle('on', x === b));
    };
    const dueP = $('.due-pick', sh);
    if (dueP) {
      const sync = () => dueP.querySelectorAll('[data-due]').forEach((x) => x.classList.toggle('on', x.dataset.due === f.elements.due_date.value));
      dueP.onclick = (e) => { const b = e.target.closest('[data-due]'); if (!b) return; f.elements.due_date.value = b.dataset.due; sync(); };
      f.elements.due_date.oninput = sync;
    }
    const rate = $('.rate', sh);
    if (rate) rate.onclick = (e) => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      const v = Number(b.dataset.r) === Number(f.elements.rating.value) ? 0 : Number(b.dataset.r);
      f.elements.rating.value = v;
      rate.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', Number(x.dataset.r) <= v));
    };
    const dec = $('#decline', sh);
    if (dec) dec.onclick = () => {
      enqueue({ k: 'item.put', id: it.id, data: { assigned_to: null } }, { silent: true });
      closeSheet();
      toast('Ok, non è più assegnato a te');
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      const el = f.elements;
      const name = el.iname.value.trim(); if (!name) return;
      const data = { name, note: el.note.value.trim(), tags: parseTags(el.tags.value) };
      if (type === 'todo') Object.assign(data, { assigned_to: el.assigned_to.value || null, due_date: el.due_date.value, priority: Number(el.priority.value) });
      if (type === 'collezione') {
        const status = Number(el.status.value);
        Object.assign(data, {
          checked: status === 2,
          data: { creator: el.creator.value.trim(), status: status === 1 ? 1 : 0, rating: Number(el.rating.value) || undefined, price: S.parseNum(el.price.value), link: el.link.value.trim() },
        });
      }
      if (el.list_id && el.list_id.value !== it.list_id) { data.list_id = el.list_id.value; data.position = topPos(data.list_id); }
      enqueue({ k: 'item.put', id: it.id, data }, { silent: true });
      closeSheet();
    };
    $('#del', sh).onclick = () => {
      const backup = { ...it };
      enqueue({ k: 'item.del', id: it.id });
      closeSheet();
      toast(`${backup.name} eliminato`, { label: 'Annulla', run: () => enqueue({ k: 'item.put', id: backup.id, data: { ...pickItem(backup), due_date: backup.due_date, priority: backup.priority, data: backup.data, assigned_to: backup.assigned_to } }) });
    };
  });
}
