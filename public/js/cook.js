'use strict';
/* Sporta — "La faccio": il menu condiviso del gruppo. Si scelgono una o più ricette (con le
   persone), si vede l'elenco unico degli ingredienti con le quantità sommate, si segna ognuno
   "Ce l'ho" o "Da comprare" (scelta condivisa con il gruppo) e quello che manca va nella
   lista della spesa con la nota "per <ricetta>". Il menu resta finché qualcuno non lo svuota. */

const RECENT_DAYS = 7;

function menuEntries() {
  return [...st.menuEntries.values()].filter((e) => recipeById(e.recipe_id)).sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
}
const inMenu = (recipeId) => menuEntries().find((e) => e.recipe_id === recipeId);

// Righe degli ingredienti: una per nome quando le unità si possono sommare, altrimenti separate.
function menuRows() {
  const rows = [];
  const byName = new Map();
  for (const e of menuEntries()) {
    const r = recipeById(e.recipe_id);
    for (const i of r.ingredients || []) {
      const name = S.normName(i.name); if (!name) continue;
      const qb = i.unit === 'q.b.';
      const qty = qb ? null : S.scaleQty(i.qty, i.unit, r.servings, e.servings);
      const unit = qb ? '' : (i.unit || '');
      const list = byName.get(name) || [];
      let row = null;
      for (const x of list) {
        if (qty == null && x.qty == null && x.unit === unit) { row = x; break; }
        if (qty == null || x.qty == null) continue;
        const sum = S.addQty(x.qty, x.unit, qty, unit);
        if (sum) { x.qty = sum.qty; x.unit = sum.unit; row = x; break; }
      }
      if (row && qty == null && row.qty != null) row = null;
      if (!row) {
        row = { key: list.length ? `${name}#${unit || (qty == null ? 'qb' : '-')}` : name, norm: name, name: i.name, qty, unit, qb, brand: i.brand || '', recipes: [] };
        list.push(row); rows.push(row); byName.set(name, list);
      }
      if (!row.recipes.includes(r.name)) row.recipes.push(r.name);
    }
  }
  return rows;
}

function rowState(row) {
  const m = st.menuMarks.get(row.key);
  if (m) return m.state;
  const p = st.products.get(row.norm);
  return p && p.pantry ? 'have' : 'buy';
}

// Indizi: già nelle liste della spesa (non spuntato) e comprato negli ultimi giorni.
function rowHints(row) {
  const out = [];
  const open = [...st.items.values()].filter((i) => !i.checked && S.normName(i.name) === row.norm && st.lists.has(i.list_id) && typeOf(st.lists.get(i.list_id)) === 'spesa');
  if (open.length) {
    const q = open.map((i) => S.fmtQty(i.qty, i.unit)).filter(Boolean).join(' + ');
    out.push(`<span class="chint in-list">già in lista${q ? ': ' + h(q) : ''}</span>`);
  }
  const since = Date.now() - RECENT_DAYS * 864e5;
  let last = 0;
  for (const t of st.trips.values()) if ((t.created_at || 0) > since && (t.items || []).some((i) => S.normName(i.name) === row.norm)) last = Math.max(last, t.created_at);
  for (const i of st.items.values()) if (i.checked && i.checked_at > since && S.normName(i.name) === row.norm) last = Math.max(last, i.checked_at);
  if (last) {
    const d = Math.floor((Date.now() - last) / 864e5);
    out.push(`<span class="chint bought">comprato ${d === 0 ? 'oggi' : d === 1 ? 'ieri' : d + ' giorni fa'}</span>`);
  }
  const p = st.products.get(row.norm);
  if (p && p.pantry) out.push(`<span class="chint pantry">sempre in casa</span>`);
  return out.join('');
}

function menuSummary() {
  const rows = menuRows();
  return { recipes: menuEntries().length, buy: rows.filter((r) => rowState(r) === 'buy').length };
}

function addRecipeToMenu(recipeId, servings) {
  const r = recipeById(recipeId); if (!r) return null;
  const ex = inMenu(recipeId);
  if (ex) { if (servings && servings !== ex.servings) enqueue({ k: 'menu.put', id: ex.id, data: { servings } }, { silent: true }); return ex.id; }
  const id = uid();
  // Ricetta pubblica di un altro gruppo: i dati viaggiano con la voce, così il menu funziona subito (anche offline).
  const external = !st.recipes.has(r.id);
  enqueue({ k: 'menu.put', id, data: { recipe_id: r.id, servings: servings || r.servings, ...(external ? { recipe: r } : {}) } }, { silent: true });
  return id;
}

// Aggiunge le righe "Da comprare" alla lista, con la nota "per …". Restituisce la funzione per annullare.
function addMenuToList(listId, rows) {
  const list = st.lists.get(listId); if (!list) return null;
  const keys = new Set(rows.map((r) => r.norm));
  const before = new Map(itemsOf(listId).filter((i) => keys.has(S.normName(i.name)))
    .map((i) => [i.id, { qty: i.qty, unit: i.unit, note: i.note || '', checked: !!i.checked, brand: i.brand || '', position: i.position }]));
  for (const row of rows) {
    const note = 'per ' + row.recipes.join(', ');
    const res = addToList(listId, { name: row.name, qty: row.qty, unit: row.unit, brand: row.brand || undefined, note });
    if (res && before.has(res.id)) {
      const it = st.items.get(res.id);
      const cur = it.checked === false && before.get(res.id).checked ? '' : (it.note || '');
      const parts = cur.split(' · ').filter(Boolean);
      if (!parts.includes(note)) enqueue({ k: 'item.put', id: res.id, data: { note: [...parts, note].join(' · ').slice(0, 200) } }, { silent: true });
    }
  }
  ls.set('lastList.' + st.code, listId);
  return () => {
    for (const it of itemsOf(listId).filter((i) => keys.has(S.normName(i.name)))) {
      const b = before.get(it.id);
      if (!b) enqueue({ k: 'item.del', id: it.id }, { silent: true });
      else enqueue({ k: 'item.put', id: it.id, data: b }, { silent: true });
    }
    render();
  };
}

function addToMenuSheet() {
  let q = '';
  openSheet(`<h2>Aggiungi una ricetta</h2><input class="input search" id="mq" type="search" placeholder="Cerca ricetta o ingrediente…"><div class="menu-pick" id="ml"></div>`, (sh) => {
    const draw = () => {
      const n = S.normName(q);
      const match = (r) => !inMenu(r.id) && (!n || S.normName(r.name).includes(n) || r.ingredients.some((i) => S.normName(i.name).includes(n)));
      const byName = (a, b) => a.name.localeCompare(b.name, 'it');
      const row = (r, sub) => `<button type="button" class="mp-row" data-add="${r.id}">
          ${r.photos && r.photos.length ? `<img class="pthumb" src="${photoUrl(r.photos[0])}" alt="" loading="lazy">` : `<span class="pthumb ph">${icon('dish')}</span>`}
          <span class="t"><b>${h(r.name)}</b><small>${h(sub)}</small></span><span class="add-ico">${I.plus}</span></button>`;
      const mine = [...st.recipes.values()].filter(match).sort(byName);
      const favs = [...st.bookmarks.values()].map((b) => b.recipe).filter((r) => r && !st.recipes.has(r.id) && match(r)).sort(byName);
      $('#ml', sh).innerHTML = (mine.length ? `<div class="section-h">Le tue ricette</div>${mine.map((r) => row(r, recipeMeta(r))).join('')}` : '')
        + (favs.length ? `<div class="section-h">${I.starFill} Preferite</div>${favs.map((r) => row(r, 'di ' + authorLabel(r.author_name))).join('')}` : '')
        || `<div class="empty">${st.recipes.size || st.bookmarks.size ? 'Nessuna altra ricetta.' : 'Nessuna ricetta.'}</div>`;
    };
    $('#mq', sh).oninput = (e) => { q = e.target.value; draw(); };
    $('#ml', sh).onclick = (e) => {
      const b = e.target.closest('[data-add]'); if (!b) return;
      addRecipeToMenu(b.dataset.add);
      closeSheet();
      render();
    };
    draw();
  });
}

// Valori del menu: a persona (una porzione di ogni ricetta) e per tutti (le porzioni scelte), più gli allergeni.
const kcalOf = (r) => {
  if (!S.foodIndex) return '';
  const n = S.foodIndex.nutrition(r.ingredients, r.servings);
  return n.counted ? `${n.counted < n.total ? '≈ ' : ''}${Math.round(n.per.kcal)} kcal a porzione` : '';
};
function menuNutrition(entries) {
  if (!S.foodIndex) return null;
  const NUT = Foods.NUT;
  const per = Object.fromEntries(NUT.map((k) => [k, 0])), all = Object.fromEntries(NUT.map((k) => [k, 0]));
  const counted = [], partial = [], none = [], approx = [];
  const al = new Map(), unknown = new Set();
  const byRecipe = new Map();
  for (const en of entries) {
    const r = recipeById(en.recipe_id); if (!r) continue;
    const n = S.foodIndex.nutrition(r.ingredients, r.servings);
    byRecipe.set(r.id, n);
    if (!n.counted) none.push(r.name);
    else {
      counted.push(r.name);
      if (n.counted < n.total) partial.push(r.name);
      if (n.approx) approx.push(r.name);
      for (const k of NUT) { per[k] += n.per[k]; all[k] += n.per[k] * en.servings; }
    }
    const a = S.foodIndex.allergens(r.ingredients);
    for (const x of a.list) { if (!al.has(x.id)) al.set(x.id, { label: x.label, recipes: [] }); al.get(x.id).recipes.push(r.name); }
    for (const u of a.unknown) unknown.add(u);
  }
  const people = new Set(entries.map((e) => e.servings));
  return { per, all, counted, partial, none, approx, al: [...al.values()], unknown: [...unknown], byRecipe, people: people.size === 1 ? [...people][0] : null };
}

function menuNutritionHtml(entries) {
  const m = menuNutrition(entries);
  if (!m || (!m.counted.length && !m.al.length)) return '';
  const fmt = (v) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString('it');
  const rough = m.partial.length || m.none.length ? '≈ ' : '';
  const notes = [];
  if (m.partial.length) notes.push(`Calcolati in parte (mancano alcuni ingredienti) per: ${m.partial.map(h).join(', ')}.`);
  if (m.none.length) notes.push(`Senza valori, non contate: ${m.none.map(h).join(', ')}.`);
  if (m.approx.length) notes.push('Alcuni valori sono stimati da alimenti simili.');
  return `<div class="card menu-nutri">
    ${m.counted.length ? `<div class="mn-top"><span class="mn-k"><b>${rough}${fmt(m.per.kcal)}</b> kcal</span><span class="mn-l">a persona<small>una porzione di ogni ricetta</small></span></div>
    <div class="mn-macro"><span><b>${fmt(m.per.prot)} g</b>proteine</span><span><b>${fmt(m.per.carb)} g</b>carboidrati</span><span><b>${fmt(m.per.fat)} g</b>grassi</span><span><b>${fmt(m.per.fiber)} g</b>fibre</span><span><b>${fmt(m.per.salt)} g</b>sale</span></div>
    <p class="hint">Tutto il menu${m.people ? ` per ${m.people} ${m.people === 1 ? 'persona' : 'persone'}` : ', con le porzioni scelte'}: <b>${rough}${fmt(m.all.kcal)} kcal</b>.</p>` : ''}
    ${m.al.length ? `<div class="al-h"><b>Allergeni</b><span class="al-list">${m.al.map((x) => `<span class="al-chip" title="${h(x.recipes.join(', '))}">${h(x.label)}</span>`).join('')}</span></div>
      ${entries.length > 1 ? `<p class="hint">${m.al.map((x) => `<b>${h(x.label)}</b>: ${x.recipes.map(h).join(', ')}`).join(' · ')}</p>` : ''}` : ''}
    ${m.unknown.length ? `<p class="hint">Non riconosciuti, da controllare: ${m.unknown.slice(0, 5).map(h).join(', ')}${m.unknown.length > 5 ? '…' : ''}.</p>` : ''}
    ${notes.map((t) => `<p class="hint">${t}</p>`).join('')}
    <p class="hint">Valori indicativi calcolati sugli ingredienti crudi; per gli allergeni controlla le etichette.</p>
  </div>`;
}

Views.cook = {
  mount() {
    app.innerHTML = topBar('Preparo', {
      back: '#/r',
      right: `<button class="icon-btn" id="mclear" aria-label="Svuota il menu">${I.x}</button>`,
    }) + `<main class="wide cook"><div id="cbody"></div></main>` + tabBar('recipes');
    $('#mclear').onclick = () => {
      if (!st.menuEntries.size || !confirm('Svuotare il menu? Le ricette restano tra le ricette; si azzerano le scelte “Ce l’ho / Da comprare”.')) return;
      enqueue({ k: 'menu.clear', id: 'menu' }, { silent: true });
      render();
    };
    $('#cbody').addEventListener('click', (e) => this.click(e));
    $('#cbody').addEventListener('change', (e) => { if (e.target.id === 'ctl') this.listId = e.target.value; });
    this.update();
  },
  click(e) {
    const t = (sel) => e.target.closest(sel);
    let b;
    if ((b = t('[data-step]'))) {
      const en = st.menuEntries.get(b.dataset.step);
      if (en) enqueue({ k: 'menu.put', id: en.id, data: { servings: Math.max(1, Math.min(99, en.servings + Number(b.dataset.d))) } }, { silent: true });
      return render();
    }
    if ((b = t('[data-rm]'))) { enqueue({ k: 'menu.del', id: b.dataset.rm }, { silent: true }); return render(); }
    if ((b = t('[data-mark]'))) {
      enqueue({ k: 'mark.put', id: b.dataset.key, data: { state: b.dataset.mark } }, { silent: true });
      vibrate(10);
      return render();
    }
    if ((b = t('[data-all]'))) {
      for (const row of menuRows()) if (rowState(row) !== b.dataset.all) enqueue({ k: 'mark.put', id: row.key, data: { state: b.dataset.all } }, { silent: true });
      return render();
    }
    if (t('#cadd-r')) return addToMenuSheet();
    if (t('#cgo')) return this.add();
  },
  update() {
    const box = $('#cbody'); if (!box) return;
    const entries = menuEntries();
    if (!entries.length) {
      box.innerHTML = `<div class="empty">${emptyArt('dish')}Il menu è vuoto.<br>Apri una ricetta e tocca “La faccio”, oppure aggiungine una qui.</div>
        <div class="actions"><button class="btn primary" id="cadd-r">${I.plus} Aggiungi una ricetta</button></div>`;
      return;
    }
    const rows = menuRows();
    const buy = rows.filter((r) => rowState(r) === 'buy');
    const lists = shoppingLists();
    if (!this.listId || !st.lists.has(this.listId)) this.listId = lastShoppingListId() || (lists[0] || {}).id || '';
    const y = window.scrollY;
    box.innerHTML = `<div class="cook-grid"><section class="cook-recipes">
        <div class="section-h">Ricette</div>
        <ul class="card menu-recipes">${entries.map((en) => {
          const r = recipeById(en.recipe_id), own = st.recipes.has(r.id);
          return `<li>${r.photos && r.photos.length ? `<img class="pthumb" src="${photoUrl(r.photos[0])}" alt="" loading="lazy">` : `<span class="pthumb ph">${icon('dish')}</span>`}
            <a class="t" href="${own ? `#/r/${r.id}` : `#/r/pub/${r.id}`}"><b>${h(r.name)}</b><small>${[kcalOf(r), !own && 'di ' + authorLabel(r.author_name), en.added_by && 'aggiunta da ' + en.added_by].filter(Boolean).map(h).join(' · ')}</small></a>
            <div class="stepper sm"><button type="button" data-step="${en.id}" data-d="-1" aria-label="Meno persone">−</button><output>${en.servings}</output><button type="button" data-step="${en.id}" data-d="1" aria-label="Più persone">+</button></div>
            <button type="button" class="icon-btn" data-rm="${en.id}" aria-label="Togli ${h(r.name)} dal menu">${I.x}</button></li>`;
        }).join('')}</ul>
        <button type="button" class="btn ghost-add" id="cadd-r">${I.plus} Aggiungi una ricetta</button>
        ${menuNutritionHtml(entries)}
      </section><section class="cook-ings">
        <div class="section-h row-h"><span>Cosa serve <small>${rows.length}</small></span>
          <span class="all-btns"><button type="button" class="link" data-all="have">Ho tutto</button> · <button type="button" class="link" data-all="buy">Compra tutto</button></span></div>
        ${rows.length ? `<ul class="card cook-rows">${rows.map((row) => {
          const s = rowState(row), q = row.qb ? 'q.b.' : S.fmtQty(row.qty, row.unit);
          return `<li class="cook-row ${s}"><div class="txt"><span class="name">${h(row.name)}${q ? `<span class="qty">${h(q)}</span>` : ''}</span>
              <span class="meta">${entries.length > 1 ? `<span class="per">per ${h(row.recipes.join(', '))}</span>` : ''}${rowHints(row)}</span></div>
            <div class="seg" role="group" aria-label="${h(row.name)}">
              <button type="button" class="${s === 'have' ? 'on' : ''}" data-mark="have" data-key="${h(row.key)}" aria-pressed="${s === 'have'}">Ce l’ho</button>
              <button type="button" class="${s === 'buy' ? 'on' : ''}" data-mark="buy" data-key="${h(row.key)}" aria-pressed="${s === 'buy'}">Da comprare</button></div></li>`;
        }).join('')}</ul>` : '<div class="empty">Le ricette del menu non hanno ingredienti.</div>'}
      </section></div>
      <div class="sticky-cta"><div class="card cook-cta">
        <span class="cnt">Da comprare: <b>${buy.length}</b></span>
        ${lists.length ? `<select class="input" id="ctl">${lists.map((l) => listOption(l, this.listId)).join('')}</select>` : ''}
        <button class="btn primary" id="cgo" ${buy.length && lists.length ? '' : 'disabled'}>Aggiungi</button></div></div>`;
    window.scrollTo(0, y);
  },
  add() {
    const rows = menuRows().filter((r) => rowState(r) === 'buy');
    const list = st.lists.get(this.listId);
    if (!rows.length || !list) return;
    const undo = addMenuToList(list.id, rows);
    render();
    vibrate(20);
    toast(`${rows.length} ${rows.length === 1 ? 'voce aggiunta' : 'voci aggiunte'} a ${list.name}`, { label: 'Annulla', run: undo });
  },
};
