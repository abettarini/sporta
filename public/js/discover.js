'use strict';
/* Sporta — ricette pubbliche: Scopri (ricerca con filtri tra le ricette pubbliche di tutti),
   ricetta di un altro gruppo in sola lettura (Aggiungi alla lista, Salva una copia, Segnala),
   firma delle ricette pubbliche, revisione delle segnalazioni per l'amministratore. */

const REPORT_REASONS = [['spam', 'Pubblicità o spam'], ['offensiva', 'Contenuto offensivo'], ['copiata', 'Copiata senza permesso'], ['persone', 'Foto di persone'], ['altro', 'Altro']];

const recipeTabs = (on) => `<div class="seg-tabs" role="tablist">
  <a href="#/r" class="${on === 'mine' ? 'on' : ''}" role="tab">Mie</a>
  <a href="#/r/preferite" class="${on === 'favorites' ? 'on' : ''}" role="tab">Preferite</a>
  <a href="#/r/scopri" class="${on === 'discover' ? 'on' : ''}" role="tab">Scopri</a></div>`;

// --------------------------------------------------------------- preferite
const isFav = (id) => st.bookmarks.has(id);
const starBtn = (id, cls = '') => `<button type="button" class="star-btn ${cls} ${isFav(id) ? 'on' : ''}" data-star="${id}" aria-pressed="${isFav(id)}" aria-label="${isFav(id) ? 'Togli dalle preferite' : 'Aggiungi alle preferite'}">${isFav(id) ? I.starFill : I.star}</button>`;
// card: dati della scheda (anche solo quelli brevi della ricerca); i dati completi arrivano dopo.
function toggleBookmark(card) {
  const id = card.id;
  if (isFav(id)) {
    enqueue({ k: 'bm.del', id }, { silent: true });
    toast('Tolta dalle preferite');
  } else {
    const full = card.ingredients ? card : pubCache.get(id) || null;
    enqueue({ k: 'bm.put', id, data: { name: card.name, author_name: card.author_name || '', created_at: Date.now(), recipe: full, gone: '' } }, { silent: true });
    vibrate(10);
    toast('Aggiunta alle preferite');
    if (!full) api('GET', `/api/recipes/${id}/public`).then((j) => { pubCache.set(id, j.recipe); const b = st.bookmarks.get(id); if (b) { b.recipe = j.recipe; saveCache(); } }).catch(() => {});
  }
  render();
}

Views.favorites = {
  q: '',
  mount() {
    app.innerHTML = topBar('Ricette', {
      right: `<a class="icon-btn" href="#/r/new/edit" aria-label="Nuova ricetta">${I.plus}</a>`,
    }) + `<main class="wide">${recipeTabs('favorites')}
      <input class="input search" id="fq" type="search" placeholder="Cerca nelle preferite…" value="${h(this.q)}">
      <div class="list-cards recipe-grid" id="fl"></div></main>` + tabBar('recipes');
    $('#fq').oninput = (e) => { this.q = e.target.value; this.update(); };
    $('#fl').addEventListener('click', (e) => {
      const s = e.target.closest('[data-star]');
      if (s) { e.preventDefault(); const b = st.bookmarks.get(s.dataset.star); if (b) toggleBookmark({ id: b.recipe_id, ...(b.recipe || {}), name: b.name }); return; }
      const rm = e.target.closest('[data-unfav]');
      if (rm) { e.preventDefault(); enqueue({ k: 'bm.del', id: rm.dataset.unfav }, { silent: true }); render(); }
    });
    this.update();
  },
  update() {
    const box = $('#fl'); if (!box) return;
    const q = S.normName(this.q);
    const all = [...st.bookmarks.values()].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    const shown = all.filter((b) => !q || S.normName(b.name).includes(q) || (b.recipe && b.recipe.ingredients.some((i) => S.normName(i.name).includes(q))));
    const ok = shown.filter((b) => b.recipe), gone = shown.filter((b) => !b.recipe && b.gone);
    const pending = shown.filter((b) => !b.recipe && !b.gone);
    const goneText = { private: 'l’autore l’ha resa privata', deleted: 'l’autore l’ha eliminata', hidden: 'nascosta dopo alcune segnalazioni' };
    box.innerHTML = all.length ? [
      ...ok.map((b) => { const r = b.recipe; return `<a class="card recipe-card pub-card" href="${r.mine ? `#/r/${r.id}` : `#/r/pub/${r.id}`}">
        ${thumbHtml(r)}<span class="t"><b>${h(r.name)}</b><span>${h(pubMeta(r))}</span>${tagsHtml({ traits: r.traits })}${inMenu(r.id) ? '<i class="in-menu">nel menu</i>' : ''}</span>${starBtn(r.id)}</a>`; }),
      ...pending.map((b) => `<a class="card recipe-card pub-card" href="#/r/pub/${b.recipe_id}"><span class="thumb ph">${icon('dish')}</span><span class="t"><b>${h(b.name)}</b><span>di ${h(authorLabel(b.author_name))}</span></span>${starBtn(b.recipe_id)}</a>`),
      ...gone.map((b) => `<div class="card recipe-card gone"><span class="thumb ph">${icon('dish')}</span><span class="t"><b>${h(b.name)}</b><span>Non più disponibile: ${goneText[b.gone] || 'non è più pubblica'}</span></span><button type="button" class="btn danger-text" data-unfav="${b.recipe_id}">Togli</button></div>`),
    ].join('') || `<div class="empty">Nessuna preferita trovata.</div>`
      : `<div class="empty">${emptyArt('book')}Nessuna preferita.<br>In <a href="#/r/scopri">Scopri</a> tocca ${I.star} sulle ricette che ti piacciono: le ritrovi qui in tutti i tuoi gruppi.</div>`;
  },
};

const authorLabel = (a) => (a ? a : 'Anonimo');
const defaultAuthor = () => (isPersonal() ? (st.me && st.me.alias) || '' : `${(st.me && st.me.alias) || ''} da ${groupName()}`).slice(0, 80);
// Firma che verrà usata alla prossima pubblicazione: quella scelta nel gruppo o quella proposta.
const myAuthor = () => (st.me && st.me.author_name != null ? st.me.author_name : defaultAuthor());

function tagsHtml(r) {
  const out = [];
  if (r.course) out.push(`<span class="rtag course">${h(S.courseLabel(r.course))}</span>`);
  for (const t of r.traits || []) out.push(`<span class="rtag t-${h(t)}">${h(S.traitLabel(t))}</span>`);
  return out.length ? `<span class="rtags">${out.join('')}</span>` : '';
}
function pubMeta(r) {
  const out = [];
  if (r.course) out.push(S.courseLabel(r.course));
  const tot = (r.prep_min || 0) + (r.cook_min || 0);
  if (tot) out.push(S.fmtMinutes(tot));
  out.push('di ' + authorLabel(r.author_name));
  return out.join(' · ');
}
const thumbHtml = (r, cls = 'thumb') => (r.photos && r.photos.length ? `<img class="${cls}" src="${photoUrl(r.photos[0])}" alt="" loading="lazy">` : `<span class="${cls} ph">${icon('dish')}</span>`);

// --------------------------------------------------------------- Scopri
Views.discover = {
  q: '', course: '', traits: new Set(), with: [], without: [], maxMin: 0, sort: '',
  results: null, total: 0, loading: false, seq: 0,
  mount() {
    app.innerHTML = topBar('Ricette', {
      right: `<a class="icon-btn" href="#/r/new/edit" aria-label="Nuova ricetta">${I.plus}</a>`,
    }) + `<main class="wide discover">${recipeTabs('discover')}
      <div class="disc-search"><input class="input search" id="dq" type="search" placeholder="Cerca per nome o ingrediente…" value="${h(this.q)}">
        <button class="btn" id="dflt" type="button">Filtri</button></div>
      <div class="chip-row" id="dcourse"></div><div class="chip-row" id="dtraits"></div><div id="dactive"></div>
      <div class="disc-h" id="dh"></div><div class="list-cards recipe-grid" id="dres"></div><div id="dmore"></div></main>` + tabBar('recipes');
    let timer;
    $('#dq').oninput = (e) => { this.q = e.target.value; clearTimeout(timer); timer = setTimeout(() => this.search(), 280); };
    $('#dflt').onclick = () => discoverFilters();
    $('#dcourse').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; this.course = this.course === b.dataset.c ? '' : b.dataset.c; this.search(); };
    $('#dtraits').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; const t = b.dataset.t; this.traits.has(t) ? this.traits.delete(t) : this.traits.add(t); this.search(); };
    $('#dactive').onclick = (e) => {
      const b = e.target.closest('[data-rmw],[data-rmo],[data-rmt]'); if (!b) return;
      if (b.dataset.rmw) this.with = this.with.filter((x) => x !== b.dataset.rmw);
      if (b.dataset.rmo) this.without = this.without.filter((x) => x !== b.dataset.rmo);
      if (b.dataset.rmt) this.maxMin = 0;
      this.search();
    };
    $('#dmore').onclick = (e) => { if (e.target.closest('button')) this.search(true); };
    $('#dres').addEventListener('click', (e) => {
      const s = e.target.closest('[data-star]'); if (!s) return;
      e.preventDefault();
      const r = (this.results || []).find((x) => x.id === s.dataset.star);
      if (r) toggleBookmark(r);
    });
    this.search();
  },
  filterCount() { return this.with.length + this.without.length + (this.maxMin ? 1 : 0) + (this.sort ? 1 : 0); },
  params(more) {
    const p = { limit: 30, offset: more ? (this.results || []).length : 0 };
    if (this.q.trim()) p.q = this.q.trim();
    if (this.course) p.course = this.course;
    if (this.traits.size) p.traits = [...this.traits].join(',');
    if (this.with.length) p.with = this.with.join(',');
    if (this.without.length) p.without = this.without.join(',');
    if (this.maxMin) p.max_min = this.maxMin;
    if (this.sort) p.sort = this.sort;
    return new URLSearchParams(p).toString();
  },
  async search(more = false) {
    const seq = ++this.seq;
    this.loading = true;
    if (!more) this.update();
    try {
      const j = await api('GET', '/api/recipes/search?' + this.params(more));
      if (seq !== this.seq) return;
      this.results = more ? [...(this.results || []), ...j.recipes] : j.recipes;
      this.total = j.total;
      this.error = '';
    } catch (e) {
      if (seq !== this.seq) return;
      this.error = e.message;
      if (!more) this.results = null;
    }
    this.loading = false;
    if (view === this) this.update();
  },
  update() {
    if (!$('#dres')) return;
    $('#dcourse').innerHTML = S.COURSES.map((c) => `<button type="button" class="chip ${this.course === c.id ? 'on' : ''}" data-c="${c.id}">${h(c.label)}</button>`).join('');
    $('#dtraits').innerHTML = S.TRAITS.map((t) => `<button type="button" class="chip ${this.traits.has(t.id) ? 'on' : ''}" data-t="${t.id}">${h(t.label)}</button>`).join('');
    const n = this.filterCount();
    $('#dflt').innerHTML = `${icon('tag')} Filtri${n ? ` <b class="cnt">${n}</b>` : ''}`;
    $('#dactive').innerHTML = this.with.length || this.without.length || this.maxMin ? `<div class="chip-row wrap">${
      this.with.map((w) => `<button type="button" class="chip with" data-rmw="${h(w)}">con ${h(w)} ✕</button>`).join('')}${
      this.without.map((w) => `<button type="button" class="chip without" data-rmo="${h(w)}">senza ${h(w)} ✕</button>`).join('')}${
      this.maxMin ? `<button type="button" class="chip with" data-rmt="1">fino a ${S.fmtMinutes(this.maxMin)} ✕</button>` : ''}</div>` : '';
    const res = this.results;
    $('#dh').innerHTML = this.error ? '' : res ? `<b>${this.total} ${this.total === 1 ? 'ricetta' : 'ricette'}</b>` : '';
    if (this.error && !res) {
      $('#dres').innerHTML = `<div class="empty">${emptyArt('book')}${h(this.error)}</div>`;
    } else if (!res) {
      $('#dres').innerHTML = `<div class="empty muted">Cerco…</div>`;
    } else if (!res.length) {
      $('#dres').innerHTML = `<div class="empty">${emptyArt('book')}Nessuna ricetta trovata.<br>Prova a togliere qualche filtro.</div>`;
    } else {
      $('#dres').innerHTML = res.map((r) => `<a class="card recipe-card pub-card" href="${r.mine ? `#/r/${r.id}` : `#/r/pub/${r.id}`}">
        ${thumbHtml(r)}<span class="t"><b>${h(r.name)}</b><span>${h(pubMeta(r))}</span>${tagsHtml({ traits: r.traits })}${r.mine ? '<i class="in-menu">tua</i>' : ''}</span>${r.mine ? '' : starBtn(r.id)}</a>`).join('');
    }
    $('#dmore').innerHTML = res && res.length < this.total ? `<div class="actions"><button class="btn" type="button" ${this.loading ? 'disabled' : ''}>Mostra altre</button></div>` : '';
  },
};

function discoverFilters() {
  const v = Views.discover;
  const draft = { with: [...v.with], without: [...v.without], maxMin: v.maxMin, sort: v.sort };
  const names = ingredientNames();
  openSheet(`<h2>Filtri</h2>
    <datalist id="ingnames">${names.map((n) => `<option value="${h(n)}">`).join('')}</datalist>
    <div class="field"><span>Con questi ingredienti (tutti)</span><div class="chip-row wrap" id="fw"></div>
      <input class="input" id="fwi" list="ingnames" placeholder="es. zucchine (Invio)" enterkeyhint="done"></div>
    <div class="field"><span>Senza</span><div class="chip-row wrap" id="fo"></div>
      <input class="input" id="foi" list="ingnames" placeholder="es. panna (Invio)" enterkeyhint="done"></div>
    <div class="field"><span>Tempo massimo</span><div class="seg" id="ft">${[[15, '15′'], [30, '30′'], [60, '1 h'], [0, 'Qualsiasi']].map(([m, l]) => `<button type="button" data-m="${m}">${l}</button>`).join('')}</div></div>
    <label class="field"><span>Ordine</span><select class="input" id="fs">
      <option value="">Più salvate</option><option value="recenti">Più recenti</option><option value="veloci">Più veloci</option><option value="nome">Per nome</option></select></label>
    <div class="actions"><button type="button" class="btn" id="fz">Azzera</button><button type="button" class="btn primary" id="fok">Mostra</button></div>`, (sh) => {
    const draw = () => {
      $('#fw', sh).innerHTML = draft.with.map((w) => `<button type="button" class="chip with" data-w="${h(w)}">${h(w)} ✕</button>`).join('');
      $('#fo', sh).innerHTML = draft.without.map((w) => `<button type="button" class="chip without" data-o="${h(w)}">${h(w)} ✕</button>`).join('');
      sh.querySelectorAll('#ft button').forEach((b) => b.classList.toggle('on', Number(b.dataset.m) === draft.maxMin));
      $('#fs', sh).value = draft.sort;
    };
    const bindInput = (sel, key) => {
      const inp = $(sel, sh);
      const add = () => {
        for (const part of inp.value.split(',')) {
          const w = S.normName(part);
          if (w && !draft[key].includes(w) && draft[key].length < 10) draft[key].push(w);
        }
        inp.value = '';
        draw();
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      inp.addEventListener('change', () => { if (inp.value.trim()) add(); });
    };
    bindInput('#fwi', 'with');
    bindInput('#foi', 'without');
    $('#fw', sh).onclick = (e) => { const b = e.target.closest('[data-w]'); if (b) { draft.with = draft.with.filter((x) => x !== b.dataset.w); draw(); } };
    $('#fo', sh).onclick = (e) => { const b = e.target.closest('[data-o]'); if (b) { draft.without = draft.without.filter((x) => x !== b.dataset.o); draw(); } };
    $('#ft', sh).onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) { draft.maxMin = Number(b.dataset.m); draw(); } };
    $('#fs', sh).onchange = (e) => { draft.sort = e.target.value; };
    $('#fz', sh).onclick = () => { Object.assign(draft, { with: [], without: [], maxMin: 0, sort: '' }); draw(); };
    $('#fok', sh).onclick = () => {
      for (const [sel, key] of [['#fwi', 'with'], ['#foi', 'without']]) {
        const w = S.normName($(sel, sh).value);
        if (w && !draft[key].includes(w)) draft[key].push(w);
      }
      Object.assign(v, draft);
      closeSheet();
      v.search();
    };
    draw();
  });
}

// --------------------------------------------------------------- ricetta pubblica di un altro gruppo
const pubCache = new Map();

Views.pubRecipe = {
  async mount() {
    const id = this.route.id;
    const own = st.recipes.get(id);
    if (own) { history.replaceState(null, '', '#/r/' + id); return mount(); }
    app.innerHTML = topBar('<span id="rt">Ricetta</span>', {
      back: '#/r/scopri',
      right: `<span id="pstar"></span><button class="icon-btn" id="pmore" aria-label="Altre azioni">${I.more}</button>`,
    }) + `<main class="wide"><div id="rbody"><div class="empty muted">Caricamento…</div></div>
      <div class="sticky-cta" id="pcta" hidden><div class="card">
        <button class="btn cook-btn" id="rcook">${icon('dish')} La faccio</button>
        <select class="input" id="tl"></select><button class="btn primary" id="addr">Aggiungi</button></div></div></main>` + tabBar('recipes');
    let r = pubCache.get(id);
    if (!r) {
      try { r = (await api('GET', `/api/recipes/${id}/public`)).recipe; pubCache.set(id, r); } catch (e) {
        if (view !== this) return;
        // Senza rete si usano i dati salvati con le preferite o con il menu.
        r = e.status ? null : recipeById(id);
        if (!r) {
          const fav = st.bookmarks.get(id);
          $('#rbody').innerHTML = `<div class="empty">${emptyArt('book')}${h(e.message)}${fav && e.status === 404 ? `<div class="actions"><button class="btn" id="punfav">Togli dalle preferite</button></div>` : ''}</div>`;
          const u = $('#punfav');
          if (u) u.onclick = () => { enqueue({ k: 'bm.del', id }, { silent: true }); location.hash = '#/r/preferite'; };
          if (fav && e.status === 404) { fav.recipe = null; fav.gone = fav.gone || 'private'; }
          return;
        }
      }
    }
    if (view !== this || this.route.id !== id) return;
    if (r.mine) { history.replaceState(null, '', '#/r/' + id); return mount(); }
    this.r = r;
    if (this.rid !== r.id) {
      this.rid = r.id;
      this.people = r.servings;
      this.off = new Set(r.ingredients.map((i, k) => (i.unit === 'q.b.' ? k : -1)).filter((k) => k >= 0));
    }
    $('#rt').textContent = r.name;
    $('#pcta').hidden = false;
    $('#rbody').addEventListener('click', (e) => {
      const b = e.target.closest('.stepper button');
      if (b) { this.people = Math.max(1, Math.min(99, this.people + Number(b.dataset.d))); return this.update(); }
      const li = e.target.closest('.ing');
      if (li) { const k = Number(li.dataset.k); this.off.has(k) ? this.off.delete(k) : this.off.add(k); this.update(); }
    });
    $('#addr').onclick = () => {
      const listId = $('#tl').value, list = st.lists.get(listId); if (!list) return;
      const ings = scaledSelected(r, this.people, this.off);
      for (const i of ings) addToList(listId, { name: i.name, qty: i.qty, unit: i.unit === 'q.b.' ? '' : i.unit, brand: i.brand || undefined, note: 'per ' + r.name });
      ls.set('lastList.' + st.code, listId);
      render();
      vibrate(20);
      toast(`${ings.length} ingredienti aggiunti a ${list.name}`, { label: 'Apri', run: () => { location.hash = '#/l/' + listId; } });
    };
    $('#pmore').onclick = () => pubActions(r);
    $('#pstar').onclick = (e) => { if (e.target.closest('[data-star]')) toggleBookmark(r); };
    $('#rcook').onclick = () => { addRecipeToMenu(r.id, this.people); location.hash = '#/cook'; };
    // Le preferite tengono i dati aggiornati (servono offline e in "La faccio").
    const fav = st.bookmarks.get(r.id);
    if (fav) { fav.recipe = r; fav.name = r.name; fav.gone = ''; saveCache(); }
    this.update();
  },
  update() {
    const r = this.r; if (!r || !$('#rbody')) return;
    const y = window.scrollY;
    $('#rbody').innerHTML = `<div class="pub-head"><span class="by">di <b>${h(authorLabel(r.author_name))}</b></span>${tagsHtml(r)}
      <p class="ro-note">${icon('book')} <span>Ricetta pubblica di un altro gruppo: la vedi e la usi, ma non la modifichi. Con <b>Salva una copia</b> (menu in alto) la puoi cambiare.</span></p></div>`
      + recipeBodyHtml(r, this.people, this.off);
    window.scrollTo(0, y);
    const tl = $('#tl'), cur = tl.value || lastShoppingListId();
    tl.innerHTML = shoppingLists().map((l) => listOption(l, cur)).join('');
    const n = scaledSelected(r, this.people, this.off).length;
    $('#addr').textContent = n ? `Aggiungi ${n}` : 'Aggiungi';
    $('#addr').disabled = !n || !shoppingLists().length;
    $('#pstar').innerHTML = starBtn(r.id, 'icon-btn');
    const en = inMenu(r.id);
    $('#rcook').innerHTML = `${icon('dish')} ${en ? 'Nel menu' : 'La faccio'}`;
    $('#rcook').classList.toggle('on', !!en);
  },
};

function pubActions(r) {
  openSheet(`<h2>${h(r.name)}</h2>
    <div class="menu-actions">
      <button type="button" class="btn block" id="pa-copy">${I.plus} Salva una copia nelle mie ricette</button>
      <button type="button" class="btn block" id="pa-share">${I.share} Condividi</button>
      <button type="button" class="btn block danger" id="pa-report">Segnala</button>
    </div>`, (sh) => {
    $('#pa-copy', sh).onclick = async () => {
      try {
        const j = await api('POST', '/api/recipes/import', { recipe_id: r.id });
        const nid = j.events[0].data.id;
        toast('Copia salvata nelle tue ricette');
        closeSheetAndGo('#/r/' + nid);
      } catch (e) { toast(e.message); }
    };
    $('#pa-share', sh).onclick = async () => {
      const text = `${r.name} — ricetta su Sporta`;
      const url = r.slug ? `${location.origin}/ricetta/${r.slug}` : `${location.origin}/#/r/pub/${r.id}`;
      if (navigator.share) { try { await navigator.share({ title: r.name, text, url }); } catch { /* annullato */ } }
      else { try { await navigator.clipboard.writeText(url); toast('Link copiato'); } catch { prompt('Copia il link:', url); } }
    };
    $('#pa-report', sh).onclick = () => reportSheet(r);
  });
}

function reportSheet(r) {
  openSheet(`<h2>Segnala la ricetta</h2>
    <p class="muted">“${h(r.name)}”. La segnalazione è anonima per chi l’ha scritta. Dopo alcune segnalazioni la ricetta viene nascosta finché non la controlliamo.</p>
    <form id="rpf">${REPORT_REASONS.map(([k, l], i) => `<label class="radio-row"><input type="radio" name="reason" value="${k}" ${i ? '' : 'checked'}><span>${h(l)}</span></label>`).join('')}
      <label class="field"><span>Dettagli (facoltativi)</span><textarea class="input" name="note" rows="2" maxlength="500"></textarea></label>
      <div class="actions"><button type="button" class="btn" data-close>Annulla</button><button class="btn primary">Invia segnalazione</button></div></form>`, (sh) => {
    $('#rpf', sh).onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target.elements;
      try {
        await api('POST', `/api/recipes/${r.id}/report`, { reason: f.reason.value, note: f.note.value.trim() });
        closeSheet();
        toast('Grazie, abbiamo ricevuto la segnalazione');
      } catch (err) { toast(err.message); }
    };
  });
}

// --------------------------------------------------------------- firma delle ricette pubbliche
// first: prima pubblicazione (con "Tienila privata"). done(author | null): null = resta privata.
function authorSheet({ first = false, done } = {}) {
  const def = defaultAuthor();
  const cur = st.me && st.me.author_name != null ? st.me.author_name : def;
  const mode = cur === '' ? 'anon' : cur === def ? 'def' : 'other';
  openSheet(`<h2>${first ? 'Pubblichi la tua prima ricetta' : 'Firma delle ricette pubbliche'}</h2>
    <p class="muted">${first ? 'Tutti potranno trovarla in Scopri e su internet, salvarla e usarla. ' : ''}La firma è visibile a tutti, anche sul web: non mostriamo mai la tua email.</p>
    <form id="auf">
      <label class="radio-row"><input type="radio" name="m" value="def" ${mode === 'def' ? 'checked' : ''}><span><b>${h(def)}</b><small>proposta</small></span></label>
      <label class="radio-row"><input type="radio" name="m" value="other" ${mode === 'other' ? 'checked' : ''}><span><b>Un altro nome</b>
        <input class="input" name="other" maxlength="80" placeholder="es. La cucina di ${h((st.me && st.me.alias) || 'Ada')}" value="${mode === 'other' ? h(cur) : ''}"></span></label>
      <label class="radio-row"><input type="radio" name="m" value="anon" ${mode === 'anon' ? 'checked' : ''}><span><b>Anonimo</b><small>nessun nome sulla ricetta</small></span></label>
      <p class="hint">Non pubblicare foto di persone senza il loro permesso. ${first ? 'Puoi cambiare la firma da Altro.' : 'Vale per le prossime pubblicazioni.'}</p>
      <div class="actions">${first ? '<button type="button" class="btn" id="au-priv">Tienila privata</button>' : '<button type="button" class="btn" data-close>Annulla</button>'}<button class="btn primary">${first ? 'Pubblica' : 'Salva'}</button></div>
    </form>`, (sh) => {
    const f = $('#auf', sh);
    f.elements.other.addEventListener('focus', () => { f.querySelector('[value=other]').checked = true; });
    f.onsubmit = (e) => {
      e.preventDefault();
      const m = f.elements.m.value;
      const author = m === 'anon' ? '' : m === 'other' ? f.elements.other.value.trim() : def;
      if (m === 'other' && !author) return toast('Scrivi il nome con cui firmare');
      if (st.me) st.me.author_name = author;
      closeSheet(first); // alla prima pubblicazione segue il salvataggio (cambia pagina): niente history.back()
      done(author);
    };
    const priv = $('#au-priv', sh);
    if (priv) priv.onclick = () => { closeSheet(true); done(null); };
  });
}

// --------------------------------------------------------------- segnalazioni (amministratore)
Views.reports = {
  async mount() {
    app.innerHTML = topBar('Segnalazioni', { back: '#/s' }) + `<main class="wide"><div id="rpl"><div class="empty muted">Caricamento…</div></div></main>` + tabBar('settings');
    $('#rpl').onclick = async (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      try { await api('POST', `/api/recipes/${b.dataset.id}/review`, { action: b.dataset.act }); toast(b.dataset.act === 'hide' ? 'Ricetta nascosta' : 'Ricetta ripristinata'); this.load(); } catch (err) { toast(err.message); }
    };
    this.load();
  },
  async load() {
    let j;
    try { j = await api('GET', '/api/recipes/reports'); } catch (e) { $('#rpl').innerHTML = `<div class="empty">${h(e.message)}</div>`; return; }
    if (view !== this) return;
    $('#rpl').innerHTML = j.recipes.length ? j.recipes.map((r) => `<div class="card report-card">
        <div class="rc-h">${thumbHtml(r)}<span class="t"><a href="#/r/pub/${r.id}"><b>${h(r.name)}</b></a><span>${h(pubMeta(r))}</span></span>
          <span class="vis ${r.hidden ? 'prv' : 'pub'}">${r.hidden ? 'Nascosta' : 'Visibile'}</span></div>
        <ul class="rep-list">${r.reports.map((x) => `<li><b>${h(x.reason)}</b>${x.note ? ` — ${h(x.note)}` : ''} <small>${new Date(x.created_at).toLocaleDateString('it')}</small></li>`).join('')}</ul>
        <div class="actions">${r.hidden ? `<button class="btn primary" data-act="restore" data-id="${r.id}">Ripristina</button>` : `<button class="btn danger" data-act="hide" data-id="${r.id}">Nascondi</button>`}</div></div>`).join('')
      : `<div class="empty">${emptyArt('done')}Nessuna segnalazione.</div>`;
  },
};
