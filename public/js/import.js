'use strict';
/* Sporta — importazione di ricette da un file JSON. Accetta il formato di Sporta
   (vedi l'esempio scaricabile) e anche le ricette nel formato schema.org/Recipe
   (recipeIngredient, recipeInstructions, prepTime…) che esportano molti siti e programmi.
   Prima di importare si vede l'anteprima, con gli avvisi, e si scelgono le ricette. */

const IMPORT_MAX = 200;

const IMPORT_EXAMPLE = {
  recipes: [
    {
      name: 'Pasta zucchine e menta',
      description: 'Un primo veloce e fresco.',
      servings: 4, prep_min: 10, cook_min: 15, difficulty: 'facile',
      course: 'primo', traits: ['vegetariana', 'veloce'],
      ingredients: ['320 g spaghetti', '600 g zucchine', '1 mazzo menta', '60 g pecorino', 'sale q.b.'],
      steps: ['Taglia le zucchine a rondelle sottili e saltale in padella con un filo d’olio.', 'Cuoci la pasta in abbondante acqua salata.', 'Manteca con pecorino e menta tritata.'],
    },
    {
      name: 'Frittata di patate',
      servings: 2, prep_min: 15, cook_min: 20, course: 'secondo', traits: ['vegetariana'],
      ingredients: [{ name: 'Uova', qty: 4, unit: 'pz' }, { name: 'Patate', qty: 300, unit: 'g' }, { name: 'Parmigiano', qty: 30, unit: 'g' }],
      steps: [{ text: 'Lessa le patate e tagliale a cubetti.' }, { text: 'Sbatti le uova con il parmigiano, unisci le patate e cuoci in padella.' }],
    },
  ],
};

const hasUrl = (s) => /https?:\/\/|www\.[a-z0-9-]+\.[a-z]{2,}/i.test(String(s || ''));
const fold = (s) => S.foldText(s);

// "PT1H30M", "90", 90, "30 min", "1 ora" -> minuti
function minutesOf(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 0 ? Math.round(v) : null;
  const s = String(v).trim();
  const iso = s.match(/^P(?:T)?(?:(\d+)H)?(?:(\d+)M)?$/i);
  if (iso && (iso[1] || iso[2])) return (Number(iso[1] || 0) * 60) + Number(iso[2] || 0) || null;
  const h = s.match(/(\d+)\s*(?:h|or[ae])/i), m = s.match(/(\d+)\s*(?:m|min)/i);
  if (h || m) return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0) || null;
  const n = parseInt(s, 10);
  return n > 0 ? n : null;
}

const COURSE_WORDS = [
  ['antipasto', ['antipast', 'appetizer', 'starter', 'stuzzichin', 'aperitiv']], ['primo', ['primo', 'primi', 'pasta', 'risott', 'zupp', 'minestr', 'first course']],
  ['secondo', ['secondo', 'secondi', 'main', 'entree', 'piatto principale']], ['contorno', ['contorn', 'side']], ['unico', ['unico', 'piatto unico', 'one dish']],
  ['dolce', ['dolc', 'dessert', 'torta', 'cake', 'biscott']], ['colazione', ['colazion', 'breakfast', 'brunch']], ['salsa', ['sals', 'sugo', 'condiment', 'sauce', 'pesto']],
  ['pane', ['pane', 'lievitat', 'pizza', 'focacc', 'bread']], ['bevanda', ['bevand', 'drink', 'beverage', 'cocktail']],
];
function courseOf(v) {
  const list = (Array.isArray(v) ? v : [v]).map((x) => fold(x)).filter(Boolean);
  for (const s of list) {
    const exact = S.COURSES.find((c) => c.id === s || fold(c.label) === s);
    if (exact) return exact.id;
    for (const [id, words] of COURSE_WORDS) if (words.some((w) => s.includes(w))) return id;
  }
  return '';
}
const DIET_MAP = { vegetariandiet: 'vegetariana', vegandiet: 'vegana', glutenfreediet: 'senza-glutine', lowlactosediet: 'senza-lattosio', lowcaloriediet: 'light' };
function traitsOf(x) {
  const out = new Set();
  for (const t of [].concat(x.traits || x.tags || [])) {
    const s = fold(t);
    const m = S.TRAITS.find((tr) => tr.id === s || fold(tr.label) === s);
    if (m) out.add(m.id);
  }
  for (const d of [].concat(x.suitableForDiet || [])) {
    const k = String(d).split('/').pop().toLowerCase();
    if (DIET_MAP[k]) out.add(DIET_MAP[k]);
  }
  return [...out];
}
function ingredientsOf(v) {
  return [].concat(v || []).map((i) => {
    if (typeof i === 'string') {
      const p = S.parseQuick(i.replace(/\s+/g, ' ').trim());
      return p.name ? { name: p.name.slice(0, 120), qty: p.qty ?? null, unit: p.unit || '', brand: p.brand || '' } : null;
    }
    if (i && typeof i === 'object') {
      const name = String(i.name || i.ingredient || '').trim();
      return name ? { name: name.slice(0, 120), qty: S.parseNum(i.qty ?? i.quantity), unit: S.normUnit(String(i.unit || '')), brand: String(i.brand || '').slice(0, 80) } : null;
    }
    return null;
  }).filter(Boolean).slice(0, 200);
}
function stepsOfImport(v) {
  if (typeof v === 'string') return v.split(/\r?\n+/).map((t) => t.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean).map((text) => ({ text }));
  const out = [];
  for (const s of [].concat(v || [])) {
    if (typeof s === 'string') { if (s.trim()) out.push({ text: s.trim() }); }
    else if (s && s.itemListElement) out.push(...stepsOfImport(s.itemListElement));
    else if (s && (s.text || s.name)) out.push({ text: String(s.text || s.name).trim() });
  }
  return out.slice(0, 100).map((s) => ({ text: s.text.slice(0, 3000) }));
}

// Elenco delle ricette contenute nel file (formato Sporta, array, schema.org con @graph).
function recipesIn(j) {
  if (Array.isArray(j)) return j.flatMap((x) => (x && (x['@graph'] || x.recipes) ? recipesIn(x) : [x]));
  if (j && Array.isArray(j.recipes)) return j.recipes;
  if (j && Array.isArray(j['@graph'])) return j['@graph'].filter((x) => [].concat(x['@type'] || []).includes('Recipe'));
  if (j && typeof j === 'object') return [j];
  return [];
}

function parseImport(text) {
  let j;
  try { j = JSON.parse(text); } catch { throw new Error('Il file non è un JSON valido'); }
  const cook = isCookbook();
  const existing = new Set([...st.recipes.values()].map((r) => fold(r.name)));
  const items = recipesIn(j);
  if (!items.length) throw new Error('Nel file non ho trovato ricette');
  return items.slice(0, IMPORT_MAX).map((x, k) => {
    const warn = [], err = [];
    const name = String((x && (x.name || x.title)) || '').trim().slice(0, 120);
    if (!name) err.push('manca il nome');
    const yieldN = parseInt([].concat(x.servings ?? x.recipeYield ?? '')[0], 10);
    const total = minutesOf(x.totalTime);
    let prep = minutesOf(x.prep_min ?? x.prepTime), cookMin = minutesOf(x.cook_min ?? x.cookTime);
    if (prep == null && cookMin == null && total) prep = total;
    const ingredients = ingredientsOf(x.ingredients || x.recipeIngredient);
    const steps = stepsOfImport(x.steps || x.recipeInstructions);
    const diff = { facile: 'facile', easy: 'facile', media: 'media', medium: 'media', difficile: 'difficile', hard: 'difficile' }[fold(x.difficulty)] || '';
    const description = String(x.description || '').trim().slice(0, 2000);
    let visibility = cook ? 'public' : (x.visibility === 'public' || x.public === true ? 'public' : 'private');
    if (!ingredients.length) warn.push('nessun ingrediente');
    if (existing.has(fold(name))) warn.push('c’è già una ricetta con questo nome');
    // Foto dentro il file: "photos_data" (o "image") come data URL base64; gli indirizzi web non si scaricano.
    const DATA_IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
    const photosData = [...[].concat(x.photos_data || []), ...[].concat(x.image || [])].filter((d) => typeof d === 'string' && DATA_IMG.test(d)).slice(0, 4);
    if (!photosData.length && (x.image || x.photos)) warn.push('le foto da indirizzi web non vengono importate: aggiungile dopo');
    const texts = [name, description, ...steps.map((s) => s.text), ...ingredients.map((i) => i.name)];
    if (visibility === 'public' && texts.some(hasUrl)) {
      if (cook) err.push('contiene indirizzi web: le ricette pubbliche non possono averne');
      else { visibility = 'private'; warn.push('contiene indirizzi web: resterà privata'); }
    }
    return {
      k, ok: !err.length, warn, err, dup: existing.has(fold(name)), photosData,
      data: {
        name, description, servings: Math.max(1, Math.min(100, yieldN || 4)), prep_min: prep, cook_min: cookMin, difficulty: diff,
        course: courseOf(x.course ?? x.recipeCategory), traits: traitsOf(x), ingredients, steps, notes: '', photos: [], visibility,
      },
    };
  });
}

function downloadExample() {
  const blob = new Blob([JSON.stringify(IMPORT_EXAMPLE, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ricette-esempio.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importRecipesSheet() {
  const cook = isCookbook();
  openSheet(`<h2>Importa ricette</h2><div id="imp-body"></div>`, (sh) => {
    const body = $('#imp-body', sh);
    let items = [];
    const pick = () => {
      body.innerHTML = `<p class="muted">Scegli un file <b>.json</b> con una o più ricette (al massimo ${IMPORT_MAX}). Va bene il formato di Sporta (scarica l’esempio) e anche quello <i>schema.org/Recipe</i> usato da molti siti e programmi di ricette.</p>
        <p class="muted">${cook ? `Nel ricettario le ricette diventano subito <b>pubbliche</b>, firmate “${h(groupName())}”.` : 'Le ricette importate restano <b>private</b>, salvo quelle con <code>"visibility": "public"</code> nel file.'} Le foto si importano solo se sono dentro il file (<code>photos_data</code>).</p>
        <input type="file" id="imp-file" accept=".json,application/json" hidden>
        <div class="actions"><button type="button" class="btn" id="imp-ex">Scarica un esempio</button><button type="button" class="btn primary" id="imp-pick">Scegli il file</button></div>
        <p class="err" id="imp-err"></p>`;
      const file = $('#imp-file', sh);
      $('#imp-ex', sh).onclick = downloadExample;
      $('#imp-pick', sh).onclick = () => file.click();
      file.onchange = async () => {
        const f = file.files[0]; if (!f) return;
        if (f.size > 40e6) { $('#imp-err', sh).textContent = 'Il file è troppo grande (massimo 40 MB): dividilo in più file'; return; }
        try { items = parseImport(await f.text()); preview(f.name); } catch (e) { $('#imp-err', sh).textContent = e.message; }
      };
    };
    const preview = (fname) => {
      const sel = items.filter((x) => x.ok && x.on !== false);
      body.innerHTML = `<p class="muted">${h(fname)}: ${items.length} ${items.length === 1 ? 'ricetta' : 'ricette'}${items.some((x) => !x.ok) ? `, ${items.filter((x) => !x.ok).length} da correggere` : ''}. Togli la spunta a quelle che non vuoi importare.</p>
        <ul class="items card imp-list">${items.map((x) => `<li class="item ${x.ok && x.on !== false ? 'done' : ''} ${x.ok ? '' : 'bad'}" data-k="${x.k}"><button class="tap" type="button" ${x.ok ? '' : 'disabled'}><span class="check">${I.check}</span>
          <span class="txt"><span class="name">${h(x.data.name || 'Senza nome')}</span>
          <span class="meta">${[S.courseLabel(x.data.course), `${x.data.ingredients.length} ingredienti`, `${x.data.steps.length} passaggi`, x.photosData.length ? `${x.photosData.length} ${x.photosData.length === 1 ? 'foto' : 'foto'}` : '', x.data.visibility === 'public' ? 'pubblica' : 'privata'].filter(Boolean).join(' · ')}</span>
          ${[...x.err.map((e) => `<span class="imp-msg err">${h(e)}</span>`), ...x.warn.map((w) => `<span class="imp-msg">${h(w)}</span>`)].join('')}</span></button></li>`).join('')}</ul>
        <div class="actions"><button type="button" class="btn" id="imp-back">Altro file</button><button type="button" class="btn primary" id="imp-go" ${sel.length ? '' : 'disabled'}>Importa ${sel.length} ${sel.length === 1 ? 'ricetta' : 'ricette'}</button></div>`;
      $('.imp-list', sh).onclick = (e) => {
        const li = e.target.closest('[data-k]'); if (!li) return;
        const x = items[Number(li.dataset.k)]; if (!x.ok) return;
        x.on = x.on === false;
        preview(fname);
      };
      $('#imp-back', sh).onclick = pick;
      $('#imp-go', sh).onclick = () => {
        const chosen = items.filter((x) => x.ok && x.on !== false);
        const run = async (author) => {
          const go = $('#imp-go', sh), back = $('#imp-back', sh);
          if (go) go.disabled = true;
          if (back) back.disabled = true;
          let photoFails = 0, n = 0;
          for (const x of chosen) {
            n++;
            const id = uid();
            const data = { ...x.data, photos: [] };
            if (data.visibility === 'public' && author === null) data.visibility = 'private';
            if (data.visibility === 'public' && author !== undefined && author !== null) data.author_name = author;
            // Le foto vanno caricate prima (serve la rete); se una non riesce, la ricetta arriva senza.
            for (const d of x.photosData) {
              if (go) go.textContent = `Importo ${n} di ${chosen.length}…`;
              const [, mime, b64] = d.match(/^data:(image\/[a-z]+);base64,(.*)$/);
              try { data.photos.push((await api('POST', '/api/photos', { recipe_id: id, mime, data: b64 })).id); } catch { photoFails++; }
            }
            enqueue({ k: 'recipe.put', id, data }, { silent: true });
          }
          render();
          toast(`${chosen.length} ${chosen.length === 1 ? 'ricetta importata' : 'ricette importate'}${photoFails ? ` (${photoFails} foto non caricate)` : ''}`);
          closeSheetAndGo('#/r');
        };
        const needSig = !cook && chosen.some((x) => x.data.visibility === 'public') && (!st.me || st.me.author_name == null);
        if (needSig) return authorSheet({ first: true, done: (a) => run(a) });
        run(undefined);
      };
    };
    pick();
  });
}
