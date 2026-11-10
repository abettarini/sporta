'use strict';
/* Sporta — database degli alimenti: segnalazioni degli utenti (dal riquadro dei valori nelle
   ricette) e gestione per gli amministratori della piattaforma (Altro → Alimenti): modifica
   degli alimenti e dei nomi alternativi, coda dei nomi non riconosciuti, segnalazioni. */

const FOOD_KINDS = [['', 'Vegetale'], ['carne', 'Carne'], ['pesce', 'Pesce'], ['latte', 'Latte e derivati'], ['uova', 'Uova'], ['miele', 'Miele']];
const NUT_LABELS = [['kcal', 'kcal'], ['prot', 'Proteine g'], ['carb', 'Carboidrati g'], ['sugar', 'di cui zuccheri g'], ['fat', 'Grassi g'], ['sat', 'di cui saturi g'], ['fiber', 'Fibre g'], ['salt', 'Sale g']];
const REPORT_KINDS = [['wrong_food', 'Alimento sbagliato', 'L’ingrediente è stato riconosciuto come un altro alimento'], ['wrong_values', 'Valori sbagliati', 'Calorie o valori non tornano'], ['missing', 'Alimento mancante', 'L’ingrediente non viene riconosciuto'], ['other', 'Altro', '']];
const srcLabel = (src) => (!src ? '' : src === 'zero' ? 'nessun valore (0)' : src === 'manual' ? 'inserito a mano' : src.startsWith('ciqual:') ? 'CIQUAL ' + src.slice(7) : src.startsWith('usda:') ? 'USDA ' + src.slice(5) : src);

// ------------------------------------------------------------ segnalazione (tutti)
function foodReportSheet(r) {
  const ings = (r.ingredients || []).map((i) => { const m = S.foodIndex && S.foodIndex.match(i.name); return { name: i.name, food: m ? m.food : null }; });
  openSheet(`<h2>Segnala un errore</h2>
    <p class="muted">Ci aiuti a correggere il database degli alimenti usato per calorie e valori. La segnalazione arriva agli amministratori di Sporta, senza dati del tuo gruppo.</p>
    <form id="frf">
      <label class="field"><span>Ingrediente</span><select class="input" name="ing">${ings.map((x, k) => `<option value="${k}">${h(x.name)}${x.food ? ` → ${h(x.food.n)}` : ' → non riconosciuto'}</option>`).join('')}</select></label>
      ${REPORT_KINDS.map(([v, l, d], k) => `<label class="radio-row"><input type="radio" name="kind" value="${v}" ${k ? '' : 'checked'}><span><b>${h(l)}</b>${d ? `<small>${h(d)}</small>` : ''}</span></label>`).join('')}
      <label class="field"><span>Dettagli (facoltativi)</span><textarea class="input" name="note" rows="2" maxlength="500" placeholder="es. il guanciale ha molti più grassi"></textarea></label>
      <div class="actions"><button type="button" class="btn" data-close>Annulla</button><button class="btn primary">Invia</button></div>
    </form>`, (sh) => {
    $('#frf', sh).onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target.elements, x = ings[Number(f.ing.value)] || {};
      try {
        await api('POST', '/api/foods/report', { name: x.name, food_id: x.food ? x.food.id : '', kind: f.kind.value, note: f.note.value.trim() });
        closeSheet(); toast('Grazie, segnalazione inviata');
      } catch (err) { toast(err.message); }
    };
  });
}

// ------------------------------------------------------------ amministratori
Views.foodsAdmin = {
  tab: 'foods', q: '', all: false,
  async mount() {
    app.innerHTML = topBar('Alimenti', { back: '#/s', right: `<button class="icon-btn" id="fa-new" aria-label="Nuovo alimento">${I.plus}</button>` }) + `<main class="wide foods-admin">
      <div class="seg-tabs" id="fa-tabs"></div><div id="fa-body"><div class="empty muted">Caricamento…</div></div></main>` + tabBar('settings');
    $('#fa-new').onclick = () => foodEditSheet(null);
    $('#fa-tabs').onclick = (e) => { const a = e.target.closest('[data-tab]'); if (!a) return; e.preventDefault(); this.tab = a.dataset.tab; this.draw(); };
    await this.load();
  },
  async load() {
    try { this.data = await api('GET', '/api/admin/foods'); } catch (e) { $('#fa-body').innerHTML = `<div class="empty">${h(e.message)}</div>`; return; }
    useFoods(this.data); // l'indice dell'app segue subito le modifiche
    this.byId = new Map(this.data.foods.map((f) => [f.id, f]));
    this.aliases = new Map();
    for (const [a, id] of Object.entries(this.data.aliases)) { if (!this.aliases.has(id)) this.aliases.set(id, []); this.aliases.get(id).push(a); }
    if (view === this) this.draw();
  },
  update() {},
  draw() {
    const c = this.data.counts || {};
    $('#fa-tabs').innerHTML = [['foods', `Alimenti <small>${this.data.foods.length}</small>`], ['misses', `Da riconoscere${c.misses ? ` <b class="cnt">${c.misses}</b>` : ''}`], ['reports', `Segnalazioni${c.reports ? ` <b class="cnt">${c.reports}</b>` : ''}`]]
      .map(([k, l]) => `<a href="#" data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${l}</a>`).join('');
    if (this.tab === 'foods') this.drawFoods();
    else if (this.tab === 'misses') this.drawMisses();
    else this.drawReports();
  },
  drawFoods() {
    const box = $('#fa-body');
    box.innerHTML = `<div class="disc-search"><input class="input search" id="fa-q" type="search" placeholder="Cerca alimento o nome alternativo…" value="${h(this.q)}">
      <button class="btn" id="fa-dl" type="button">Scarica</button></div><div id="fa-list"></div>
      <p class="hint">Le modifiche valgono subito per tutti. “Scarica” salva il database completo (foods.json) da conservare nel repository.</p>`;
    const list = () => {
      const q = S.foldText(this.q);
      const rows = this.data.foods.filter((f) => !q || S.foldText(f.n).includes(q) || (this.aliases.get(f.id) || []).some((a) => a.includes(q)))
        .sort((a, b) => a.n.localeCompare(b.n, 'it')).slice(0, 300);
      $('#fa-list').innerHTML = rows.length ? `<ul class="items card fa-rows">${rows.map((f) => `<li class="item"><button class="tap" type="button" data-id="${h(f.id)}"><span class="txt">
          <span class="name">${h(f.n)}${f.p && this.byId.get(f.p) ? ` <small class="muted">variante di ${h(this.byId.get(f.p).n)}</small>` : ''}</span>
          <span class="meta">${[S.deptOf(f.d).label, f.v && f.v[0] != null ? `${Math.round(f.v[0])} kcal` : 'senza valori', srcLabel(f.src)].filter(Boolean).map(h).join(' · ')}
          ${f.a ? '<i class="rtag t-senza-glutine">stimato</i>' : ''}${f.edited ? '<i class="rtag t-vegana">modificato</i>' : ''}</span></span></button></li>`).join('')}</ul>`
        : '<div class="empty">Nessun alimento trovato.</div>';
    };
    $('#fa-q').oninput = (e) => { this.q = e.target.value; list(); };
    $('#fa-list').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) foodEditSheet(this.byId.get(b.dataset.id)); };
    $('#fa-dl').onclick = () => {
      const { counts, ...data } = this.data;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      a.download = 'foods.json'; document.body.appendChild(a); a.click(); a.remove();
    };
    list();
  },
  async drawMisses() {
    const box = $('#fa-body');
    box.innerHTML = '<div class="empty muted">Caricamento…</div>';
    let j;
    try { j = await api('GET', '/api/admin/foods/misses' + (this.all ? '?all=1' : '')); } catch (e) { box.innerHTML = `<div class="empty">${h(e.message)}</div>`; return; }
    if (view !== this || this.tab !== 'misses') return;
    box.innerHTML = `<p class="muted">Nomi di articoli e ingredienti che il database non riconosce, con quante volte e in quanti gruppi sono stati usati (senza dire quali). Collegali a un alimento come nome alternativo, crea un alimento nuovo o ignorali.</p>
      <label class="switch"><input type="checkbox" id="fa-all" ${this.all ? 'checked' : ''}><span>Mostra anche quelli usati in un solo gruppo${j.hidden ? ` (${j.hidden})` : ''}</span></label>
      ${j.misses.length ? `<ul class="items card fa-rows">${j.misses.map((x) => `<li class="item miss-row" data-key="${h(x.key)}" data-name="${h(x.name)}"><span class="txt"><span class="name">${h(x.name)}</span>
          <span class="meta">${x.uses} ${x.uses === 1 ? 'volta' : 'volte'} · ${x.groups} ${x.groups === 1 ? 'gruppo' : 'gruppi'}</span></span>
          <span class="miss-act"><button class="btn small" data-act="alias">Collega…</button><button class="btn small" data-act="new">Nuovo</button><button class="btn small ghost" data-act="ignore">Ignora</button></span></li>`).join('')}</ul>`
        : `<div class="empty">Niente da riconoscere.</div>`}`;
    $('#fa-all').onchange = (e) => { this.all = e.target.checked; this.drawMisses(); };
    box.onclick = async (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const row = b.closest('[data-key]'), key = row.dataset.key, name = row.dataset.name;
      try {
        if (b.dataset.act === 'ignore') { await api('POST', '/api/admin/foods/misses/' + encodeURIComponent(key), { action: 'ignore' }); row.remove(); return; }
        if (b.dataset.act === 'new') return foodEditSheet(null, { n: name.charAt(0).toUpperCase() + name.slice(1) });
        foodPickSheet(`Collega “${name}” a…`, name, async (food) => {
          await api('POST', '/api/admin/foods/misses/' + encodeURIComponent(key), { action: 'alias', food_id: food.id });
          toast(`“${name}” ora è riconosciuto come ${food.n}`);
          await this.load(); this.tab = 'misses'; this.draw();
        });
      } catch (err) { toast(err.message); }
    };
  },
  async drawReports() {
    const box = $('#fa-body');
    box.innerHTML = '<div class="empty muted">Caricamento…</div>';
    let j;
    try { j = await api('GET', '/api/admin/foods/reports'); } catch (e) { box.innerHTML = `<div class="empty">${h(e.message)}</div>`; return; }
    if (view !== this || this.tab !== 'reports') return;
    box.innerHTML = j.reports.length ? j.reports.map((r) => `<div class="card report-card" data-id="${h(r.id)}">
        <div class="rc-h"><span class="t"><b>${h(r.kind_label || r.kind)}</b><span>${h(r.name || '')}${r.food ? ` → ${h(r.food)}` : ''} · ${new Date(r.created_at).toLocaleDateString('it')}</span></span></div>
        ${r.note ? `<p>${h(r.note)}</p>` : ''}
        <div class="actions">${r.food_id ? `<button class="btn" data-open="${h(r.food_id)}">Apri l'alimento</button>` : `<button class="btn" data-newname="${h(r.name)}">Nuovo alimento</button>`}<button class="btn primary" data-close-report="${h(r.id)}">Risolta</button></div></div>`).join('')
      : `<div class="empty">Nessuna segnalazione aperta.</div>`;
    box.onclick = async (e) => {
      const o = e.target.closest('[data-open]'); if (o) return foodEditSheet(this.byId.get(o.dataset.open));
      const n = e.target.closest('[data-newname]'); if (n) return foodEditSheet(null, { n: n.dataset.newname });
      const c = e.target.closest('[data-close-report]');
      if (c) { try { await api('POST', '/api/admin/foods/reports/' + c.dataset.closeReport, {}); c.closest('.report-card').remove(); } catch (err) { toast(err.message); } }
    };
  },
};

// Scelta di un alimento (con ricerca): per collegare un nome o indicare "variante di".
function foodPickSheet(title, query, done) {
  const foods = (Views.foodsAdmin.data || {}).foods || [];
  openSheet(`<h2>${h(title)}</h2><input class="input search" id="fp-q" type="search" placeholder="Cerca alimento…" value="${h(query || '')}"><div class="menu-pick" id="fp-l"></div>`, (sh) => {
    const draw = () => {
      const q = S.foldText($('#fp-q', sh).value);
      const words = q.split(' ').filter((w) => w.length > 1);
      const score = (f) => { const n = S.foldText(f.n); return n === q ? 0 : n.startsWith(q) ? 1 : words.some((w) => n.includes(w)) ? 2 : 9; };
      const rows = foods.map((f) => [score(f), f]).filter(([s]) => s < 9 || !q).sort((a, b) => a[0] - b[0] || a[1].n.localeCompare(b[1].n, 'it')).slice(0, 40);
      $('#fp-l', sh).innerHTML = rows.map(([, f]) => `<button type="button" class="mp-row" data-id="${h(f.id)}"><span class="t"><b>${h(f.n)}</b><small>${h(S.deptOf(f.d).label)}${f.v && f.v[0] != null ? ` · ${Math.round(f.v[0])} kcal` : ''}</small></span></button>`).join('') || '<div class="empty">Nessun alimento.</div>';
    };
    $('#fp-q', sh).oninput = draw;
    $('#fp-l', sh).onclick = async (e) => { const b = e.target.closest('[data-id]'); if (!b) return; const f = foods.find((x) => x.id === b.dataset.id); closeSheet(true); try { await done(f); } catch (err) { toast(err.message); } };
    draw();
  });
}

function foodEditSheet(food, preset = {}) {
  const v = Views.foodsAdmin;
  const f = food || { id: '', n: '', d: '', k: '', v: [], src: 'manual', ...preset };
  const aliases = food ? (v.aliases.get(food.id) || []).filter((a) => a !== Foods.key(food.n)) : [];
  const parents = v.data.foods.filter((x) => x.id !== f.id && !x.p).sort((a, b) => a.n.localeCompare(b.n, 'it'));
  const num = (x) => (x == null ? '' : String(x).replace('.', ','));
  openSheet(`<h2>${food ? h(food.n) : 'Nuovo alimento'}</h2>
    <form id="fe" class="fe-form">
      <label class="field"><span>Nome</span><input class="input" name="n" required maxlength="80" value="${h(f.n)}"></label>
      <div class="row">
        <label class="field"><span>Reparto</span><select class="input" name="d">${S.DEPARTMENTS.map((d) => `<option value="${d.id}" ${d.id === (f.d || '') ? 'selected' : ''}>${h(d.label)}</option>`).join('')}</select></label>
        <label class="field"><span>Tipo</span><select class="input" name="k">${FOOD_KINDS.map(([k, l]) => `<option value="${k}" ${k === (f.k || '') ? 'selected' : ''}>${h(l)}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Variante di</span><select class="input" name="p"><option value="">— nessuno (alimento generico) —</option>${parents.map((x) => `<option value="${h(x.id)}" ${x.id === f.p ? 'selected' : ''}>${h(x.n)}</option>`).join('')}</select></label>
      <div class="section-h">Valori per 100 g ${f.src ? `<small class="muted">· ${h(srcLabel(f.src))}</small>` : ''}</div>
      <div class="nut-grid">${NUT_LABELS.map(([k, l], i) => `<label class="field"><span>${h(l)}</span><input class="input" name="v_${k}" inputmode="decimal" value="${h(num((f.v || [])[i]))}"></label>`).join('')}</div>
      <label class="switch"><input type="checkbox" name="a" ${f.a ? 'checked' : ''}><span>Valori stimati da un alimento simile</span></label>
      <div class="row">
        <label class="field"><span>Peso di un pezzo (g)</span><input class="input" name="pz" inputmode="decimal" value="${h(num(f.pz))}" placeholder="—"></label>
        <label class="field"><span>Densità (g/ml)</span><input class="input" name="den" inputmode="decimal" value="${h(num(f.den))}" placeholder="1"></label>
      </div>
      <label class="field"><span>Misure (unità: grammi)</span><input class="input" name="u" value="${h(Object.entries(f.u || {}).map(([k, g]) => `${k}: ${num(g)}`).join(', '))}" placeholder="es. spicchi: 5, foglie: 0,5"></label>
      <label class="field"><span>Nomi alternativi (uno per riga)</span><textarea class="input" name="aliases" rows="5" placeholder="plurali, sinonimi, scritture diverse">${h(aliases.join('\n'))}</textarea></label>
      <p class="err" id="fe-err"></p>
      <div class="actions">${food ? '<button type="button" class="btn danger" id="fe-del">Elimina</button>' : '<button type="button" class="btn" data-close>Annulla</button>'}<button class="btn primary">Salva</button></div>
    </form>`, (sh) => {
    const form = $('#fe', sh);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const el = form.elements;
      const vals = NUT_LABELS.map(([k]) => el['v_' + k].value.trim());
      const changedValues = !food || vals.some((x, i) => x !== num((f.v || [])[i]));
      const u = {};
      for (const part of el.u.value.split(',')) { const [k, g] = part.split(':').map((s) => s && s.trim()); if (k && g) u[k] = g; }
      const body = {
        n: el.n.value.trim(), d: el.d.value, k: el.k.value, p: el.p.value, a: el.a.checked, pz: el.pz.value, den: el.den.value, u,
        v: vals, src: changedValues ? 'manual' : f.src, aliases: el.aliases.value.split('\n').map((s) => s.trim()).filter(Boolean),
      };
      try {
        await api('PUT', '/api/admin/foods/item/' + encodeURIComponent(food ? food.id : 'new'), body);
        closeSheet(); toast('Alimento salvato');
        await v.load();
      } catch (err) { $('#fe-err', sh).textContent = err.message; }
    };
    const del = $('#fe-del', sh);
    if (del) del.onclick = async () => {
      if (!confirm(`Eliminare “${food.n}” dal database degli alimenti? Gli ingredienti con questo nome non verranno più riconosciuti.`)) return;
      try { await api('DELETE', '/api/admin/foods/item/' + encodeURIComponent(food.id)); closeSheet(); toast('Alimento eliminato'); await v.load(); }
      catch (err) { $('#fe-err', sh).textContent = err.message; }
    };
  });
}
