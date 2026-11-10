'use strict';
/* Sporta — ricette: elenco, scheda, editor (foto, passaggi, autocompletamento
   ingredienti), condivisione con link privato e pagina della ricetta condivisa. */

const DIFF_LABEL = { facile: 'Facile', media: 'Media', difficile: 'Difficile' };

function recipeMeta(r) {
  const out = [];
  const tot = (r.prep_min || 0) + (r.cook_min || 0);
  if (tot) out.push(S.fmtMinutes(tot));
  if (r.difficulty) out.push(DIFF_LABEL[r.difficulty]);
  out.push(`${r.servings} ${r.servings === 1 ? 'persona' : 'persone'}`);
  return out.join(' · ');
}

// Nomi per l'autocompletamento degli ingredienti: catalogo + ingredienti di tutte le ricette.
function ingredientNames(extra = []) {
  const m = new Map();
  for (const p of st.products.values()) m.set(p.key, p.name);
  for (const r of st.recipes.values()) for (const i of r.ingredients || []) { const k = S.normName(i.name); if (!m.has(k)) m.set(k, i.name); }
  for (const n of extra) { const k = S.normName(n); if (k && !m.has(k)) m.set(k, n); }
  // più i nomi del database centrale degli alimenti
  if (S.foodIndex) for (const n of S.foodIndex.names()) { const k = S.normName(n); if (!m.has(k)) m.set(k, n); }
  return [...m.values()].sort((a, b) => a.localeCompare(b, 'it'));
}

function stepsOf(r) {
  if (r.steps && r.steps.length) return r.steps;
  // Ricette create prima dei passaggi: il vecchio campo note diventa un elenco.
  return String(r.notes || '').split(/\n\s*\n|\n/).map((t) => t.trim()).filter(Boolean).map((text) => ({ text }));
}

// Corpo della ricetta, usato sia dalla scheda interna sia dalla pagina condivisa.
function recipeBodyHtml(r, people, off) {
  const ings = r.ingredients.map((i) => ({ ...i, qty: S.scaleQty(i.qty, i.unit, r.servings, people) }));
  const steps = stepsOf(r);
  const chips = [];
  if (r.prep_min) chips.push(`<span class="meta-chip">${I.clock} Preparazione ${S.fmtMinutes(r.prep_min)}</span>`);
  if (r.cook_min) chips.push(`<span class="meta-chip">${I.flame} Cottura ${S.fmtMinutes(r.cook_min)}</span>`);
  if (r.difficulty) chips.push(`<span class="meta-chip">${I.chart} ${DIFF_LABEL[r.difficulty]}</span>`);
  return `<div class="recipe-layout"><div class="r-main">
    ${r.photos && r.photos.length ? `<div class="gallery">${r.photos.map((p) => `<img src="${photoUrl(p)}" alt="" loading="lazy">`).join('')}</div>` : ''}
    ${r.description ? `<p class="lead">${h(r.description)}</p>` : ''}
    ${chips.length ? `<div class="meta-chips">${chips.join('')}</div>` : ''}
    <div class="servings-box">
      <span class="lbl">Ricetta per ${r.servings}<b>Quante persone?</b></span>
      <div class="stepper"><button type="button" data-d="-1" aria-label="Meno">−</button><output>${people}</output><button type="button" data-d="1" aria-label="Più">+</button></div>
    </div>
    <div class="section-h">Ingredienti</div>
    ${ings.length ? `<ul class="items" id="ings">${ings.map((i, k) => {
      const q = S.fmtQty(i.qty, i.unit);
      return `<li class="item ing ${off.has(k) ? '' : 'done'}" data-k="${k}"><button class="tap" type="button"><span class="check">${I.check}</span>
        <span class="txt"><span class="name">${h(i.name)}${q ? `<span class="qty">${h(q)}</span>` : ''}</span>
        ${i.brand ? `<span class="meta">${h(i.brand)}</span>` : ''}</span></button></li>`;
    }).join('')}</ul>` : '<div class="empty">Nessun ingrediente.</div>'}
    ${allergensHtml(r)}
    ${nutritionHtml(r)}
    </div><div class="r-steps">
    ${steps.length ? `<div class="section-h">Procedimento</div><ol class="steps">${steps.map((s) => `<li>${h(s.text)}</li>`).join('')}</ol>` : ''}
    </div></div>`;
}

// Valori nutrizionali per porzione, dal database centrale degli alimenti (indicativi).
const SOURCE_LABEL = { ciqual: 'CIQUAL 2025 (ANSES)', usda: 'USDA FoodData Central' };
// Allergeni (i 14 UE) dagli alimenti riconosciuti: indicativi, le etichette restano il riferimento.
function allergensHtml(r) {
  if (!S.foodIndex || !S.foodIndex.allergens || !(r.ingredients || []).length) return '';
  nutriRecipe = r;
  const a = S.foodIndex.allergens(r.ingredients);
  // senza valori nutrizionali (nessuna quantità) l'elenco degli alimenti sta qui
  const noNutri = !S.foodIndex.nutrition(r.ingredients, r.servings).counted;
  const unk = a.unknown.length ? `<p class="hint">Non riconosciuti, da controllare: ${a.unknown.slice(0, 5).map(h).join(', ')}${a.unknown.length > 5 ? '…' : ''}.</p>` : '';
  return `<div class="card allerg"><div class="al-h"><b>Allergeni</b>${a.list.length
    ? `<span class="al-list">${a.list.map((x) => `<span class="al-chip" title="${h(x.from.join(', '))}">${h(x.label)}</span>`).join('')}</span>`
    : `<span class="muted">${a.unknown.length ? 'nessuno tra gli ingredienti riconosciuti' : 'nessuno dei 14 principali'}</span>`}</div>
    ${a.list.length ? `<p class="hint">${a.list.map((x) => `<b>${h(x.label)}</b>: ${x.from.map(h).join(', ')}`).join(' · ')}</p>` : ''}${unk}
    <p class="hint">Indicativi, per le preparazioni tipiche: controlla sempre le etichette dei prodotti.</p>${noNutri ? ingFoodsHtml(r) : ''}</div>`;
}

// Come ogni ingrediente è stato riconosciuto; nelle ricette del gruppo si può scegliere l'alimento (per esempio la variante).
function ingFoodsHtml(r) {
  const own = st.recipes.get(r.id) === r;
  const rows = r.ingredients.map((i, k) => {
    const m = S.foodIndex.matchIng(i);
    const what = i.food === Foods.NONE ? '<i>non contato</i>' : m ? `${h(m.food.n)}${m.food.v && m.food.v[0] != null ? ` <small>${Math.round(m.food.v[0])} kcal/100 g</small>` : ''}` : '<i>non riconosciuto</i>';
    const fam = m && S.foodIndex.family(m.food).length > 1;
    return `<li><span class="in">${h(i.name)}</span><span class="fd">${what}${i.food && i.food !== Foods.NONE ? ' <small class="chosen">scelto</small>' : ''}</span>
      ${own ? `<button type="button" class="btn ghost small" data-food-pick="${k}">${fam && !i.food ? 'Variante…' : 'Cambia'}</button>` : ''}</li>`;
  }).join('');
  return `<details class="ing-foods"><summary>Come sono contati gli ingredienti</summary><ul>${rows}</ul>
    ${own ? '<p class="hint">Scegli la variante giusta (per esempio latte scremato invece di intero) o correggi un ingrediente riconosciuto male: vale per valori e allergeni di questa ricetta.</p>' : ''}</details>`;
}

function ingFoodSheet(r, k) {
  const ing = r.ingredients[k]; if (!ing) return;
  const auto = S.foodIndex.match(ing.name);
  const cur = S.foodIndex.matchIng(ing);
  const fam = auto ? S.foodIndex.family(auto.food) : [];
  const all = [...S.foodIndex.byId.values()];
  const row = (f) => `<button type="button" class="mp-row ${cur && cur.food.id === f.id && ing.food !== Foods.NONE ? 'on' : ''}" data-id="${h(f.id)}"><span class="t"><b>${h(f.n)}</b>
    <small>${[f.v && f.v[0] != null ? `${Math.round(f.v[0])} kcal/100 g` : '', (f.al || []).map((a) => Foods.ALLERGEN_LABEL[a]).join(', ')].filter(Boolean).map(h).join(' · ')}</small></span></button>`;
  openSheet(`<h2>${h(ing.name)}</h2>
    <p class="muted">${auto ? `Riconosciuto come <b>${h(auto.food.n)}</b>.` : 'Non riconosciuto dal database.'} Scegli l'alimento da usare per valori e allergeni.</p>
    ${fam.length > 1 ? `<div class="section-h">Varianti</div><div class="menu-pick">${fam.map(row).join('')}</div>` : ''}
    <div class="section-h">Altro alimento</div><input class="input search" id="if-q" type="search" placeholder="Cerca nel database…"><div class="menu-pick" id="if-l"></div>
    <div class="actions">${ing.food ? '<button type="button" class="btn" data-set="">Automatico (dal nome)</button>' : ''}<button type="button" class="btn" data-set="${Foods.NONE}">Non contarlo</button></div>`, (sh) => {
    const q = $('#if-q', sh);
    q.oninput = () => {
      const t = S.foldText(q.value);
      $('#if-l', sh).innerHTML = t.length < 2 ? '' : all.filter((f) => S.foldText(f.n).includes(t)).sort((a, b) => a.n.length - b.n.length).slice(0, 20).map(row).join('') || '<div class="empty">Nessun alimento.</div>';
    };
    sh.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id],[data-set]'); if (!b) return;
      const food = b.dataset.id !== undefined ? b.dataset.id : b.dataset.set;
      const ingredients = r.ingredients.map((x, j) => {
        if (j !== k) return x;
        const { food: _, ...rest } = x;
        // l'alimento riconosciuto dal nome non va salvato: resta "automatico"
        return food && !(auto && food === auto.food.id) ? { ...rest, food } : rest;
      });
      enqueue({ k: 'recipe.put', id: r.id, data: { ingredients } }, { silent: true });
      closeSheet(); render();
    });
  });
}

let nutriRecipe = null;
function nutritionHtml(r) {
  nutriRecipe = r;
  if (!S.foodIndex || !(r.ingredients || []).length) return '';
  const n = S.foodIndex.nutrition(r.ingredients, r.servings);
  if (!n.counted) return '';
  const p = n.per, fmt = (v, d = 1) => (v >= 10 ? Math.round(v) : (Math.round(v * 10 ** d) / 10 ** d)).toLocaleString('it');
  const partial = n.counted < n.total;
  const notes = [];
  if (partial) notes.push(`Calcolati su ${n.counted} ingredienti su ${n.total}: mancano ${n.missing.slice(0, 4).map(h).join(', ')}${n.missing.length > 4 ? '…' : ''}.`);
  if (n.noQty.length) notes.push(`Senza quantità, non contati: ${n.noQty.slice(0, 4).map(h).join(', ')}${n.noQty.length > 4 ? '…' : ''}.`);
  if (n.approx) notes.push('Alcuni valori sono stimati da alimenti simili.');
  return `<details class="card nutri" ${ls.get('nutriOpen') === '1' ? 'open' : ''}>
    <summary><span class="nk"><b>${partial ? '≈ ' : ''}${fmt(p.kcal, 0)}</b> kcal</span><span class="nl">a porzione${partial ? ` · ${Math.round((100 * n.counted) / n.total)}% degli ingredienti` : ''}</span></summary>
    <table class="nt">
      <tr><td>Proteine</td><td>${fmt(p.prot)} g</td></tr>
      <tr><td>Carboidrati</td><td>${fmt(p.carb)} g</td></tr><tr class="sub"><td>di cui zuccheri</td><td>${fmt(p.sugar)} g</td></tr>
      <tr><td>Grassi</td><td>${fmt(p.fat)} g</td></tr><tr class="sub"><td>di cui saturi</td><td>${fmt(p.sat)} g</td></tr>
      <tr><td>Fibre</td><td>${fmt(p.fiber)} g</td></tr><tr><td>Sale</td><td>${fmt(p.salt, 2)} g</td></tr>
    </table>
    ${notes.map((t) => `<p class="hint">${t}</p>`).join('')}
    ${ingFoodsHtml(r)}
    <p class="hint">Valori indicativi per una porzione (ricetta per ${r.servings}), calcolati sugli ingredienti crudi. Fonte: ${n.sources.map((s) => SOURCE_LABEL[s] || s).join(', ')}.</p>
    ${st.code ? '<button type="button" class="btn ghost small" data-food-report>Segnala un errore</button>' : ''}
  </details>`;
}

function scaledSelected(r, people, off) {
  return r.ingredients.map((i) => ({ ...i, qty: S.scaleQty(i.qty, i.unit, r.servings, people) })).filter((_, k) => !off.has(k));
}

// --------------------------------------------------------------- elenco
Views.recipes = {
  q: '',
  mount() {
    app.innerHTML = topBar('Ricette', {
      right: `<a class="icon-btn" href="#/r/new/edit" aria-label="Nuova ricetta">${I.plus}</a>`,
    }) + `<main class="wide">${recipeTabs('mine')}<input class="input search" id="rq" type="search" placeholder="Cerca ricetta o ingrediente…" value="${h(this.q)}"><div id="rbanner"></div><div class="list-cards recipe-grid" id="rl"></div></main>` + tabBar('recipes');
    $('#rq').oninput = (e) => { this.q = e.target.value; this.update(); };
    this.update();
  },
  update() {
    const q = S.normName(this.q);
    const rs = [...st.recipes.values()]
      .filter((r) => !q || S.normName(r.name).includes(q) || r.ingredients.some((i) => S.normName(i.name).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'it'));
    const sum = menuSummary();
    $('#rbanner').innerHTML = sum.recipes ? `<a class="card menu-banner" href="#/cook">${icon('dish')}<span class="t"><b>Preparo: ${sum.recipes} ${sum.recipes === 1 ? 'ricetta' : 'ricette'}</b><span>${sum.buy ? `${sum.buy} da comprare` : 'Hai tutto'}</span></span><span class="btn small">Apri</span></a>` : '';
    $('#rl').innerHTML = rs.length ? rs.map((r) => `<a class="card recipe-card" href="#/r/${r.id}">
        ${r.photos && r.photos.length ? `<img class="thumb" src="${photoUrl(r.photos[0])}" alt="" loading="lazy">` : `<span class="thumb ph">${icon('dish')}</span>`}
        <span class="t"><b>${h(r.name)}</b><span>${h(recipeMeta(r))}</span><span class="badges">${publicOn() ? `<i class="vis ${r.visibility === 'public' ? 'pub' : 'prv'}">${r.visibility === 'public' ? (r.hidden ? 'Pubblica · nascosta' : 'Pubblica') + (r.saves ? ` · ★ ${r.saves}` : '') : 'Privata'}</i>` : ''}${inMenu(r.id) ? '<i class="in-menu">nel menu</i>' : ''}</span></span>
        ${r.share_token ? `<span class="shared-ico" title="Condivisa">${I.share}</span>` : ''}</a>`).join('')
      : `<div class="empty">${emptyArt('book')}${st.recipes.size ? 'Nessuna ricetta trovata.' : 'Nessuna ricetta.<br>Aggiungine una con il +'}</div>`;
  },
};

// --------------------------------------------------------------- scheda
Views.recipe = {
  mount() {
    const r = st.recipes.get(this.route.id);
    if (!r) { history.replaceState(null, '', '#/r'); return mount(); }
    if (this.rid !== r.id) {
      this.rid = r.id;
      this.people = r.servings;
      this.off = new Set(r.ingredients.map((i, k) => (i.unit === 'q.b.' ? k : -1)).filter((k) => k >= 0));
    }
    app.innerHTML = topBar(`<span id="rt"></span>`, {
      back: '#/r',
      right: `<button class="icon-btn" id="rshare" aria-label="Condividi">${I.share}</button><a class="icon-btn" href="#/r/${r.id}/edit" aria-label="Modifica">${I.edit}</a>`,
    }) + (hasPane() ? `<aside class="pane" id="pane-recipes"></aside>` : '') + `<main class="wide"><div id="rmeta"></div><div id="rbody"></div>
      <div class="sticky-cta"><div class="card">
        <button class="btn cook-btn" id="rcook">${icon('dish')} La faccio</button>
        <select class="input" id="tl"></select>
        <button class="btn primary" id="addr">Aggiungi</button>
      </div></div></main>` + tabBar('recipes');
    $('#rbody').addEventListener('click', (e) => {
      const b = e.target.closest('.stepper button');
      if (b) { this.people = Math.max(1, Math.min(99, this.people + Number(b.dataset.d))); return this.update(); }
      const li = e.target.closest('.ing');
      if (li) { const k = Number(li.dataset.k); this.off.has(k) ? this.off.delete(k) : this.off.add(k); this.update(); }
    });
    $('#addr').onclick = () => this.addToList();
    $('#rcook').onclick = () => { addRecipeToMenu(r.id, this.people); location.hash = '#/cook'; };
    $('#rshare').onclick = () => shareSheet(r.id);
    this.update();
  },
  update() {
    const r = st.recipes.get(this.route.id);
    if (!r) { history.replaceState(null, '', '#/r'); return mount(); }
    $('#rt').textContent = r.name;
    const pane = $('#pane-recipes');
    if (pane) {
      pane.innerHTML = `<div class="pane-h"><b>Ricette</b><a class="icon-btn" href="#/r/new/edit" aria-label="Nuova ricetta">${I.plus}</a></div>` +
        [...st.recipes.values()].sort((a, b) => a.name.localeCompare(b.name, 'it')).map((x) => `<a class="pane-row ${x.id === r.id ? 'on' : ''}" href="#/r/${x.id}">
          ${x.photos && x.photos.length ? `<img class="pthumb" src="${photoUrl(x.photos[0])}" alt="" loading="lazy">` : `<span class="pthumb ph">${icon('dish')}</span>`}
          <span class="t"><b>${h(x.name)}</b><small>${h(recipeMeta(x))}</small></span></a>`).join('');
    }
    const y = window.scrollY;
    $('#rbody').innerHTML = recipeBodyHtml(r, this.people, this.off);
    $('#rmeta').innerHTML = `<div class="pub-head">${tagsHtml(r)}
      ${!publicOn() ? '' : `<span class="vis-line">${r.visibility === 'public'
        ? `<i class="vis pub">Pubblica</i> firmata <b>${h(authorLabel(r.author_name))}</b>${r.hidden ? ' · <b class="warn">nascosta per segnalazioni</b>' : ''}${r.slug && !r.hidden ? ` · <a href="/ricetta/${h(r.slug)}" target="_blank" rel="noopener">pagina web ↗</a>` : ''}`
        : '<i class="vis prv">Privata</i> la vede solo il gruppo'}</span>`}
      ${r.origin ? `<span class="origin">${h(r.origin)}</span>` : ''}</div>`;
    window.scrollTo(0, y);
    const tl = $('#tl'), cur = tl.value || lastShoppingListId();
    tl.innerHTML = shoppingLists().map((l) => listOption(l, cur)).join('');
    const n = scaledSelected(r, this.people, this.off).length;
    const btn = $('#addr');
    btn.textContent = n ? `Aggiungi ${n}` : 'Aggiungi';
    btn.disabled = !n || !shoppingLists().length;
    const en = inMenu(r.id);
    $('#rcook').innerHTML = `${icon('dish')} ${en ? 'Nel menu' : 'La faccio'}`;
    $('#rcook').classList.toggle('on', !!en);
  },
  addToList() {
    const r = st.recipes.get(this.rid);
    const listId = $('#tl').value;
    const list = st.lists.get(listId); if (!list) return;
    const ings = scaledSelected(r, this.people, this.off);
    for (const i of ings) addToList(listId, { name: i.name, qty: i.qty, unit: i.unit === 'q.b.' ? '' : i.unit, brand: i.brand || undefined });
    ls.set('lastList.' + st.code, listId);
    render();
    vibrate(20);
    toast(`${ings.length} ingredienti aggiunti a ${list.name}`, { label: 'Apri', run: () => { location.hash = '#/l/' + listId; } });
  },
};

// --------------------------------------------------------------- condivisione
const shareLink = (token) => `${location.origin}/r/${token}`;

function shareSheet(recipeId) {
  const draw = (sh) => {
    const r = st.recipes.get(recipeId);
    const others = st.groups.filter((g) => g.code !== st.code);
    $('#sh-body', sh).innerHTML = r.share_token ? `
      <p class="muted">Chi ha il link vede la ricetta (anche senza Sporta) e, se usa Sporta, può salvarla nelle sue ricette. Il link non è pubblicato da nessuna parte.</p>
      <div class="code small-code">${h(shareLink(r.share_token))}</div>
      <div class="actions"><button class="btn" id="sh-copy">Copia link</button><button class="btn primary" id="sh-send">Condividi</button></div>
      <div class="actions"><button class="btn danger" id="sh-stop">Smetti di condividere</button></div>`
      : `<p class="muted">Crea un link privato per inviare la ricetta a chi vuoi. Potrai disattivarlo quando vuoi.</p>
      <div class="actions"><button class="btn primary" id="sh-make">Crea link</button></div>`;
    $('#sh-copy-group', sh).hidden = !others.length;
    const bind = (id, fn) => { const b = $(id, sh); if (b) b.onclick = fn; };
    const run = async (fn) => { try { await fn(); draw(sh); } catch (e) { toast(e.message); } };
    bind('#sh-make', () => run(() => api('POST', `/api/recipes/${recipeId}/share`)));
    bind('#sh-stop', () => run(() => api('DELETE', `/api/recipes/${recipeId}/share`)));
    bind('#sh-copy', async () => {
      try { await navigator.clipboard.writeText(shareLink(r.share_token)); toast('Link copiato'); } catch { prompt('Copia il link:', shareLink(r.share_token)); }
    });
    bind('#sh-send', async () => {
      const data = { title: r.name, text: `Ricetta: ${r.name}`, url: shareLink(r.share_token) };
      if (navigator.share) { try { await navigator.share(data); } catch { /* annullato */ } } else $('#sh-copy', sh).click();
    });
  };
  openSheet(`<h2>Condividi ricetta</h2><div id="sh-body"></div>
    <div id="sh-copy-group"><div class="section-h">Copia in un altro tuo gruppo</div>
      <div class="actions">${st.groups.filter((g) => g.code !== st.code).map((g) => `<button class="btn" data-copy="${h(g.code)}">${h(g.name)}</button>`).join('')}</div></div>`, (sh) => {
    draw(sh);
    sh.querySelectorAll('[data-copy]').forEach((b) => {
      b.onclick = async () => {
        try {
          await copyRecipeToGroup(recipeId, b.dataset.copy);
          toast(`Ricetta copiata in "${b.textContent}"`);
        } catch (e) { toast(e.message); }
      };
    });
  });
}

// Copia tra gruppi: usa un link di condivisione temporaneo, poi lo ritira se non c'era.
async function copyRecipeToGroup(recipeId, targetCode) {
  const r = st.recipes.get(recipeId);
  const hadToken = !!r.share_token;
  let token = r.share_token;
  if (!token) {
    const j = await api('POST', `/api/recipes/${recipeId}/share`);
    token = j.events[0].data.share_token;
  }
  try {
    await api('POST', '/api/recipes/import', { token }, targetCode);
  } finally {
    if (!hadToken) await api('DELETE', `/api/recipes/${recipeId}/share`).catch(() => {});
  }
}

// --------------------------------------------------------------- pagina ricetta condivisa (/r/<token>)
Views.shared = {
  async mount() {
    const token = this.route.token;
    app.innerHTML = `<header class="top"><a class="icon-btn" href="/" aria-label="Sporta">${I.back}</a><h1 id="rt">Ricetta condivisa</h1></header>
      <main><div id="rbody"><div class="empty">Caricamento…</div></div><div id="rcta"></div></main>`;
    let j;
    try {
      const res = await fetch('/api/shared/' + encodeURIComponent(token));
      j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Ricetta non trovata');
    } catch (e) {
      $('#rbody').innerHTML = `<div class="empty">${emptyArt('link')}${h(e.message || 'Ricetta non disponibile')}</div>`;
      return;
    }
    const r = j.recipe;
    this.r = r;
    this.people = r.servings;
    this.off = new Set();
    document.title = r.name + ' · Sporta';
    $('#rt').textContent = r.name;
    const pane = $('#pane-recipes');
    if (pane) {
      pane.innerHTML = `<div class="pane-h"><b>Ricette</b><a class="icon-btn" href="#/r/new/edit" aria-label="Nuova ricetta">${I.plus}</a></div>` +
        [...st.recipes.values()].sort((a, b) => a.name.localeCompare(b.name, 'it')).map((x) => `<a class="pane-row ${x.id === r.id ? 'on' : ''}" href="#/r/${x.id}">
          ${x.photos && x.photos.length ? `<img class="pthumb" src="${photoUrl(x.photos[0])}" alt="" loading="lazy">` : `<span class="pthumb ph">${icon('dish')}</span>`}
          <span class="t"><b>${h(x.name)}</b><small>${h(recipeMeta(x))}</small></span></a>`).join('');
    }
    const draw = () => { $('#rbody').innerHTML = recipeBodyHtml(r, this.people, this.off); };
    draw();
    $('#rbody').addEventListener('click', (e) => {
      const b = e.target.closest('.stepper button');
      if (b) { this.people = Math.max(1, Math.min(99, this.people + Number(b.dataset.d))); return draw(); }
      const li = e.target.closest('.ing');
      if (li) { const k = Number(li.dataset.k); this.off.has(k) ? this.off.delete(k) : this.off.add(k); draw(); }
    });
    const cta = $('#rcta');
    if (!st.groups.length) {
      cta.innerHTML = `<div class="card pad center"><p>Con <b>Sporta</b> puoi salvare questa ricetta e aggiungere gli ingredienti alla lista della spesa condivisa.</p>
        <a class="btn primary" href="/">Prova Sporta</a></div>`;
      return;
    }
    cta.innerHTML = `<div class="sticky-cta"><div class="card">
      ${st.groups.length > 1 ? `<select class="input" id="sg-group">${st.groups.map((g) => `<option value="${h(g.code)}" ${g.code === st.code ? 'selected' : ''}>${h(g.name)}</option>`).join('')}</select>` : ''}
      <button class="btn primary" id="simport" ${st.groups.length > 1 ? '' : 'style="flex:1"'}>Salva nelle mie ricette</button></div></div>`;
    $('#simport').onclick = async () => {
      const code = $('#sg-group') ? $('#sg-group').value : st.code;
      try {
        const res = await fetch('/api/recipes/import', { method: 'POST', headers: authHeaders(code), body: JSON.stringify({ token }) });
        const out = await res.json();
        if (!res.ok) throw new Error(out.error || 'Operazione non riuscita');
        const id = out.events[0].data.id;
        toast('Ricetta salvata');
        history.replaceState(null, '', '/#/r/' + id);
        if (code !== st.code) switchGroup(code, '#/r/' + id);
        else { applyEvents(out.events); mount(); }
      } catch (e) { toast(e.message === 'Failed to fetch' ? 'Serve la connessione a internet' : e.message); }
    };
  },
};

// --------------------------------------------------------------- foto
// Le foto vengono ridimensionate sul telefono (max 1600 px, JPEG) prima del caricamento.
async function resizeImage(file, max = 1600, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Immagine non leggibile'));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', quality));
    const data = await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1]);
      fr.readAsDataURL(blob);
    });
    return { mime: 'image/jpeg', data };
  } finally { URL.revokeObjectURL(url); }
}

// --------------------------------------------------------------- editor
Views.recipeEdit = {
  mount() {
    const isNew = this.route.id === 'new';
    const r = isNew ? null : st.recipes.get(this.route.id);
    if (!isNew && !r) { history.replaceState(null, '', '#/r'); return mount(); }
    this.id = r ? r.id : uid();
    this.draft = r ? r.ingredients.map((i) => ({ ...i, _k: uid() })) : [];
    this.steps = r ? stepsOf(r).map((s) => ({ text: s.text, _k: uid() })) : [];
    this.photos = r ? [...(r.photos || [])] : [];
    this.course = r ? r.course || '' : '';
    this.traits = new Set(r ? r.traits || [] : []);
    this.uploading = 0;
    app.innerHTML = topBar(isNew ? 'Nuova ricetta' : 'Modifica ricetta', { back: r ? `#/r/${r.id}` : '#/r' }) + `<main>
      <form id="ref" autocomplete="off">
        <div class="field"><span>Foto</span><div class="photo-grid" id="photos"></div>
          <input type="file" id="pfile" accept="image/*" multiple hidden></div>
        <label class="field"><span>Nome</span><input class="input" name="rname" required maxlength="120" value="${h(r ? r.name : '')}" placeholder="es. Carbonara"></label>
        <label class="field"><span>Descrizione (facoltativa)</span><textarea class="input" name="description" rows="2" maxlength="2000" placeholder="Due righe per raccontarla">${h(r ? r.description : '')}</textarea></label>
        <div class="row">
          <label class="field"><span>Persone</span><input class="input" name="servings" type="number" min="1" max="100" inputmode="numeric" value="${r ? r.servings : 4}"></label>
          <label class="field"><span>Difficoltà</span><select class="input" name="difficulty">
            ${['', 'facile', 'media', 'difficile'].map((d) => `<option value="${d}" ${r && r.difficulty === d ? 'selected' : ''}>${d ? DIFF_LABEL[d] : '—'}</option>`).join('')}</select></label>
        </div>
        <div class="row">
          <label class="field"><span>Preparazione (min)</span><input class="input" name="prep_min" type="number" min="0" inputmode="numeric" value="${r && r.prep_min != null ? r.prep_min : ''}"></label>
          <label class="field"><span>Cottura (min)</span><input class="input" name="cook_min" type="number" min="0" inputmode="numeric" value="${r && r.cook_min != null ? r.cook_min : ''}"></label>
        </div>
        <div class="field"><span>Portata</span><div class="chip-row wrap" id="rcourse"></div></div>
        <div class="field"><span>Caratteristiche</span><div class="chip-row wrap" id="rtraits"></div>
          <div class="hint" id="rtraits-h"></div></div>
        <div class="field"><span>Ingredienti</span>
          <div id="ingl"></div>
          <textarea class="input" id="ingq" rows="1" style="min-height:0" placeholder="Aggiungi: es. 320 g spaghetti (Invio). Puoi incollarne più righe."></textarea>
          <div class="suggest" id="ingsg"></div>
          <div class="hint">Formato: quantità, unità, nome e @marca facoltativa. Es. «4 uova», «150 g guanciale», «pecorino 50 g @Locatelli», «pepe q.b.»</div>
        </div>
        <div class="field"><span>Procedimento</span>
          <ol class="steps-edit" id="stepl"></ol>
          <button type="button" class="btn block" id="addstep">${I.plus} Aggiungi passaggio</button>
        </div>
        <div class="card pub-toggle"${isCookbook() || !publicOn() ? ' hidden' : ''}><label class="switch"><input type="checkbox" name="public" ${(r ? r.visibility === 'public' : true) || isCookbook() ? 'checked' : ''}>
          <span><b>Pubblica</b><small id="pub-h"></small></span></label></div>
        ${isCookbook() && publicOn() ? `<p class="hint">${icon('book')} In un ricettario ogni ricetta è pubblica, firmata “${h(groupName())}”.</p>` : ''}
        <div class="actions">${r ? '<button type="button" class="btn danger" id="rdel">Elimina</button>' : ''}<button class="btn primary" id="rsave">Salva ricetta</button></div>
      </form></main>` + tabBar('recipes');

    // --- ingredienti
    const ingq = $('#ingq');
    const addLines = (text) => {
      const lines = text.split(/\r?\n/).map((s) => s.replace(/^[-*•\s]+/, '').trim()).filter(Boolean);
      for (const line of lines) {
        const p = S.parseQuick(line);
        if (p.name) this.draft.push({ name: p.name, qty: p.qty, unit: p.unit, brand: p.brand, _k: uid() });
      }
      this.rows();
      this.tagRows();
    };
    ingq.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addLines(ingq.value); ingq.value = ''; this.suggest(); }
    });
    ingq.addEventListener('input', () => {
      if (ingq.value.includes('\n')) { addLines(ingq.value); ingq.value = ''; }
      this.suggest();
    });
    // Autocompletamento: tocco su un suggerimento = ingrediente con quel nome e la quantità scritta.
    $('#ingsg').onclick = (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      const p = S.parseQuick(ingq.value);
      const prod = productOf(b.dataset.name);
      const unit = p.unit || (p.qty != null && prod ? prod.unit : '');
      this.draft.push({ name: b.dataset.name, qty: p.qty, unit, brand: p.brand, _k: uid() });
      ingq.value = '';
      this.rows();
      this.tagRows();
      this.suggest();
      ingq.focus();
    };
    const ingl = $('#ingl');
    ingl.addEventListener('input', (e) => {
      const row = e.target.closest('.ing-edit'); if (!row) return;
      const d = this.draft.find((x) => x._k === row.dataset.id); if (!d) return;
      const f = e.target.dataset.f;
      d[f] = f === 'qty' ? S.parseNum(e.target.value) : e.target.value;
      if (f === 'name') delete d.food; // nome cambiato: l'alimento scelto prima non vale più
    });
    ingl.addEventListener('change', (e) => {
      const row = e.target.closest('.ing-edit'); if (!row) return;
      const d = this.draft.find((x) => x._k === row.dataset.id);
      if (d && e.target.dataset.f === 'unit') d.unit = e.target.value;
      if (d && e.target.dataset.f === 'name') { this.refreshNames(); this.tagRows(); } // il nuovo nome entra subito nei suggerimenti
    });
    ingl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rm]'); if (!b) return;
      this.draft = this.draft.filter((x) => x._k !== b.dataset.rm);
      this.rows();
      this.tagRows();
    });
    sortable(ingl, {
      itemSel: '.ing-edit', handleSel: '.grip',
      onEnd: (_, ids) => {
        const by = new Map(this.draft.map((d) => [d._k, d]));
        this.draft = ids.map((k) => by.get(k));
        this.rows();
      },
    });

    // --- passaggi
    const stepl = $('#stepl');
    $('#addstep').onclick = () => {
      this.steps.push({ text: '', _k: uid() });
      this.stepRows();
      const all = stepl.querySelectorAll('textarea');
      all[all.length - 1].focus();
    };
    stepl.addEventListener('input', (e) => {
      const li = e.target.closest('[data-id]'); if (!li) return;
      const s = this.steps.find((x) => x._k === li.dataset.id); if (s) s.text = e.target.value;
      autoGrow(e.target);
    });
    stepl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rm]'); if (!b) return;
      this.steps = this.steps.filter((x) => x._k !== b.dataset.rm);
      this.stepRows();
    });
    sortable(stepl, {
      itemSel: '.step-edit', handleSel: '.grip',
      onEnd: (_, ids) => {
        const by = new Map(this.steps.map((s) => [s._k, s]));
        this.steps = ids.map((k) => by.get(k));
        this.stepRows();
      },
    });

    // --- foto
    const pfile = $('#pfile');
    $('#photos').addEventListener('click', (e) => {
      const rm = e.target.closest('[data-rmphoto]');
      if (rm) { this.photos = this.photos.filter((p) => p !== rm.dataset.rmphoto); return this.photoRows(); }
      if (e.target.closest('#addphoto')) pfile.click();
    });
    pfile.onchange = async () => {
      const files = [...pfile.files].slice(0, 12 - this.photos.length);
      pfile.value = '';
      for (const file of files) {
        this.uploading++;
        this.photoRows();
        try {
          const img = await resizeImage(file);
          const j = await api('POST', '/api/photos', { recipe_id: this.id, ...img });
          this.photos.push(j.id);
        } catch (e) { toast(e.message || 'Caricamento non riuscito'); }
        this.uploading--;
        this.photoRows();
      }
    };

    // --- portata, caratteristiche (con i suggerimenti) e pubblicazione
    const f = $('#ref');
    $('#rcourse').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; this.course = this.course === b.dataset.c ? '' : b.dataset.c; this.tagRows(); };
    $('#rtraits').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; const t = b.dataset.t; this.traits.has(t) ? this.traits.delete(t) : this.traits.add(t); this.tagRows(); };
    for (const n of ['prep_min', 'cook_min']) f.elements[n].addEventListener('input', () => this.tagRows());
    const pubHint = () => {
      $('#pub-h').innerHTML = f.elements.public.checked
        ? `La trovano tutti in Scopri, firmata “${h(authorLabel(myAuthor()))}”. Foto, ingredienti e passaggi diventano visibili. <button type="button" class="link" id="pub-sig">Cambia firma</button>`
        : 'La vede solo questo gruppo.';
      const sig = $('#pub-sig');
      if (sig) sig.onclick = () => authorSheet({ done: (a) => { this.author = a; api('PATCH', '/api/me', { author_name: a }).catch(() => {}); pubHint(); } });
    };
    f.elements.public.onchange = pubHint;
    pubHint();
    this.tagRows();

    // --- salvataggio
    f.onsubmit = (e) => {
      e.preventDefault();
      if (this.uploading) return toast('Attendi la fine del caricamento delle foto');
      if (ingq.value.trim()) { addLines(ingq.value); ingq.value = ''; }
      const el = f.elements;
      const name = el.rname.value.trim(); if (!name) return;
      const ingredients = this.draft.filter((d) => String(d.name || '').trim())
        .map((d) => ({ name: d.name.trim(), qty: d.qty ?? null, unit: d.unit || '', brand: (d.brand || '').trim(), ...(d.food ? { food: d.food } : {}) }));
      const steps = this.steps.map((s) => ({ text: s.text.trim() })).filter((s) => s.text);
      const num = (v) => (v === '' ? null : Math.max(0, parseInt(v, 10) || 0));
      const data = {
        name, servings: Math.max(1, parseInt(el.servings.value, 10) || 1), description: el.description.value.trim(),
        difficulty: el.difficulty.value, prep_min: num(el.prep_min.value), cook_min: num(el.cook_min.value),
        ingredients, steps, notes: '', photos: this.photos, course: this.course, traits: [...this.traits],
      };
      const save = (visibility, author) => {
        data.visibility = visibility;
        if (visibility === 'public') {
          if (author !== undefined) data.author_name = author;
          // Firma mostrata subito (il server conferma); una ricetta già pubblica tiene la sua.
          if (!r || r.visibility !== 'public' || author !== undefined) data.author_name_shown = author !== undefined ? author : myAuthor();
        }
        const shown = data.author_name_shown; delete data.author_name_shown;
        enqueue({ k: 'recipe.put', id: this.id, data }, { silent: true });
        if (shown !== undefined) { const x = st.recipes.get(this.id); if (x) x.author_name = shown; }
        Views.recipe.rid = null;
        history.replaceState(null, '', `#/r/${this.id}`);
        mount();
      };
      if (!publicOn()) return save(r ? undefined : 'private'); // parte pubblica spenta: la visibilità non si tocca
      if (isCookbook()) return save('public');
      if (!el.public.checked) return save('private');
      const firstTime = !st.me || st.me.author_name == null;
      if (firstTime && (!r || r.visibility !== 'public')) return authorSheet({ first: true, done: (a) => (a === null ? save('private') : save('public', a)) });
      save('public', this.author);
    };
    const del = $('#rdel');
    if (del) del.onclick = () => {
      if (!confirm(`Eliminare la ricetta "${r.name}"?`)) return;
      enqueue({ k: 'recipe.del', id: r.id }, { silent: true });
      history.replaceState(null, '', '#/r');
      mount();
    };
    this.rows();
    this.stepRows();
    this.photoRows();
    this.suggest();
  },
  tagRows() {
    const f = $('#ref'); if (!f) return;
    const el = f.elements;
    const mins = (parseInt(el.prep_min.value, 10) || 0) + (parseInt(el.cook_min.value, 10) || 0);
    const sug = new Set(S.suggestTraits(this.draft, mins).filter((t) => !this.traits.has(t)));
    $('#rcourse').innerHTML = S.COURSES.map((c) => `<button type="button" class="chip ${this.course === c.id ? 'on' : ''}" data-c="${c.id}">${h(c.label)}</button>`).join('');
    $('#rtraits').innerHTML = S.TRAITS.map((t) => `<button type="button" class="chip ${this.traits.has(t.id) ? 'on' : ''} ${sug.has(t.id) ? 'sug' : ''}" data-t="${t.id}">${sug.has(t.id) ? '✦ ' : ''}${h(t.label)}</button>`).join('');
    $('#rtraits-h').textContent = sug.size ? '✦ suggerite dagli ingredienti e dai tempi: tocca per confermare.' : '';
  },
  refreshNames() {
    const dl = $('#ing-names');
    if (dl) dl.innerHTML = ingredientNames(this.draft.map((d) => d.name)).map((n) => `<option value="${h(n)}">`).join('');
  },
  suggest() {
    const typed = S.normName(S.parseQuick($('#ingq').value).name);
    const used = new Set(this.draft.map((d) => S.normName(d.name)));
    let names = ingredientNames().filter((n) => !used.has(S.normName(n)));
    if (typed) {
      const starts = names.filter((n) => S.normName(n).startsWith(typed));
      const has = names.filter((n) => !S.normName(n).startsWith(typed) && S.normName(n).includes(typed));
      names = starts.concat(has).filter((n) => S.normName(n) !== typed);
    } else names = [];
    $('#ingsg').innerHTML = names.slice(0, 10).map((n) => `<button type="button" class="chip" data-name="${h(n)}">${h(n)}</button>`).join('');
  },
  rows() {
    $('#ingl').innerHTML = this.draft.map((d) => `<div class="ing-edit" data-id="${d._k}">
      <span class="grip" aria-label="Trascina">${I.grip}</span>
      <input class="input" data-f="name" value="${h(d.name)}" placeholder="Ingrediente" aria-label="Ingrediente" list="ing-names">
      <input class="input" data-f="qty" inputmode="decimal" value="${h(S.fmtNum(d.qty))}" placeholder="Qtà" aria-label="Quantità">
      <select class="input" data-f="unit" aria-label="Unità">${unitOptions(d.unit)}</select>
      <button type="button" class="icon-btn" data-rm="${d._k}" aria-label="Rimuovi">${I.x}</button>
      <input class="input brand" data-f="brand" value="${h(d.brand)}" placeholder="Marca (facoltativa)" aria-label="Marca" list="brands">
    </div>`).join('') + brandDatalist() + '<datalist id="ing-names"></datalist>';
    this.refreshNames();
  },
  stepRows() {
    const stepl = $('#stepl');
    stepl.innerHTML = this.steps.map((s, k) => `<li class="step-edit" data-id="${s._k}">
      <span class="grip" aria-label="Trascina">${I.grip}</span>
      <span class="num">${k + 1}</span>
      <textarea class="input" rows="2" placeholder="Descrivi il passaggio…" aria-label="Passaggio ${k + 1}">${h(s.text)}</textarea>
      <button type="button" class="icon-btn" data-rm="${s._k}" aria-label="Rimuovi">${I.x}</button></li>`).join('');
    stepl.querySelectorAll('textarea').forEach(autoGrow);
  },
  photoRows() {
    $('#photos').innerHTML = this.photos.map((p) => `<div class="ph-item"><img src="${photoUrl(p)}" alt=""><button type="button" data-rmphoto="${h(p)}" aria-label="Rimuovi foto">${I.x}</button></div>`).join('') +
      Array.from({ length: this.uploading }, () => '<div class="ph-item loading"><span class="spinner"></span></div>').join('') +
      (this.photos.length + this.uploading < 12 ? `<button type="button" class="ph-add" id="addphoto">${I.camera}<span>Aggiungi</span></button>` : '');
  },
  update() { /* durante la modifica non ridisegniamo per non perdere l'input */ },
};

function autoGrow(t) {
  t.style.height = 'auto';
  t.style.height = Math.max(60, t.scrollHeight + 2) + 'px';
}

// Il riquadro dei valori nutrizionali resta aperto o chiuso come l'ha lasciato la persona.
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-food-report]') && nutriRecipe) foodReportSheet(nutriRecipe);
  const p = e.target.closest('[data-food-pick]');
  if (p && nutriRecipe) ingFoodSheet(nutriRecipe, Number(p.dataset.foodPick));
});
document.addEventListener('toggle', (e) => { if (e.target.classList && e.target.classList.contains('nutri')) ls.set('nutriOpen', e.target.open ? '1' : '0'); }, true);
