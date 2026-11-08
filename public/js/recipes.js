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
  return `
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
    ${steps.length ? `<div class="section-h">Procedimento</div><ol class="steps">${steps.map((s) => `<li>${h(s.text)}</li>`).join('')}</ol>` : ''}`;
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
    }) + `<main><input class="input search" id="rq" type="search" placeholder="Cerca ricetta o ingrediente…" value="${h(this.q)}"><div class="list-cards" id="rl"></div></main>` + tabBar('recipes');
    $('#rq').oninput = (e) => { this.q = e.target.value; this.update(); };
    this.update();
  },
  update() {
    const q = S.normName(this.q);
    const rs = [...st.recipes.values()]
      .filter((r) => !q || S.normName(r.name).includes(q) || r.ingredients.some((i) => S.normName(i.name).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'it'));
    $('#rl').innerHTML = rs.length ? rs.map((r) => `<a class="card recipe-card" href="#/r/${r.id}">
        ${r.photos && r.photos.length ? `<img class="thumb" src="${photoUrl(r.photos[0])}" alt="" loading="lazy">` : '<span class="thumb ph">🍽️</span>'}
        <span class="t"><b>${h(r.name)}</b><span>${h(recipeMeta(r))}</span></span>
        ${r.share_token ? `<span class="shared-ico" title="Condivisa">${I.share}</span>` : ''}</a>`).join('')
      : `<div class="empty"><div class="big">📖</div>${st.recipes.size ? 'Nessuna ricetta trovata.' : 'Nessuna ricetta.<br>Aggiungine una con il +'}</div>`;
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
    }) + `<main><div id="rbody"></div>
      <div class="sticky-cta"><div class="card">
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
    $('#rshare').onclick = () => shareSheet(r.id);
    this.update();
  },
  update() {
    const r = st.recipes.get(this.route.id);
    if (!r) { history.replaceState(null, '', '#/r'); return mount(); }
    $('#rt').textContent = r.name;
    const y = window.scrollY;
    $('#rbody').innerHTML = recipeBodyHtml(r, this.people, this.off);
    window.scrollTo(0, y);
    const tl = $('#tl'), cur = tl.value || lastListId();
    tl.innerHTML = sortedLists().map((l) => `<option value="${l.id}" ${l.id === cur ? 'selected' : ''}>${h(l.emoji)} ${h(l.name)}</option>`).join('');
    const n = scaledSelected(r, this.people, this.off).length;
    const btn = $('#addr');
    btn.textContent = n ? `Aggiungi ${n}` : 'Aggiungi';
    btn.disabled = !n || !st.lists.size;
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
      $('#rbody').innerHTML = `<div class="empty"><div class="big">🔗</div>${h(e.message || 'Ricetta non disponibile')}</div>`;
      return;
    }
    const r = j.recipe;
    this.r = r;
    this.people = r.servings;
    this.off = new Set();
    document.title = r.name + ' · Sporta';
    $('#rt').textContent = r.name;
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
      this.suggest();
      ingq.focus();
    };
    const ingl = $('#ingl');
    ingl.addEventListener('input', (e) => {
      const row = e.target.closest('.ing-edit'); if (!row) return;
      const d = this.draft.find((x) => x._k === row.dataset.id); if (!d) return;
      const f = e.target.dataset.f;
      d[f] = f === 'qty' ? S.parseNum(e.target.value) : e.target.value;
    });
    ingl.addEventListener('change', (e) => {
      const row = e.target.closest('.ing-edit'); if (!row) return;
      const d = this.draft.find((x) => x._k === row.dataset.id);
      if (d && e.target.dataset.f === 'unit') d.unit = e.target.value;
      if (d && e.target.dataset.f === 'name') this.refreshNames(); // il nuovo nome entra subito nei suggerimenti
    });
    ingl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rm]'); if (!b) return;
      this.draft = this.draft.filter((x) => x._k !== b.dataset.rm);
      this.rows();
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

    // --- salvataggio
    const f = $('#ref');
    f.onsubmit = (e) => {
      e.preventDefault();
      if (this.uploading) return toast('Attendi la fine del caricamento delle foto');
      if (ingq.value.trim()) { addLines(ingq.value); ingq.value = ''; }
      const el = f.elements;
      const name = el.rname.value.trim(); if (!name) return;
      const ingredients = this.draft.filter((d) => String(d.name || '').trim())
        .map((d) => ({ name: d.name.trim(), qty: d.qty ?? null, unit: d.unit || '', brand: (d.brand || '').trim() }));
      const steps = this.steps.map((s) => ({ text: s.text.trim() })).filter((s) => s.text);
      const num = (v) => (v === '' ? null : Math.max(0, parseInt(v, 10) || 0));
      enqueue({
        k: 'recipe.put', id: this.id,
        data: {
          name, servings: Math.max(1, parseInt(el.servings.value, 10) || 1), description: el.description.value.trim(),
          difficulty: el.difficulty.value, prep_min: num(el.prep_min.value), cook_min: num(el.cook_min.value),
          ingredients, steps, notes: '', photos: this.photos,
        },
      }, { silent: true });
      Views.recipe.rid = null;
      history.replaceState(null, '', `#/r/${this.id}`);
      mount();
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
