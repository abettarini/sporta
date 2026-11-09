'use strict';
/* Pagine web pubbliche, generate sul server perché i motori di ricerca le leggano:
   /ricetta/<slug> (con i dati strutturati Recipe di schema.org), /ricettario/<slug>,
   /sitemap.xml e /robots.txt. Mostrano solo ricette pubbliche e non nascoste, e dei
   gruppi solo il nome dei ricettari; mai membri, email o altri dati. */

const Shared = require('../public/shared.js');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parseJson = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const iso = (m) => (m ? `PT${Math.round(m)}M` : undefined);
const DIFF = { facile: 'Facile', media: 'Media', difficile: 'Difficile' };
const DIETS = { vegetariana: 'https://schema.org/VegetarianDiet', vegana: 'https://schema.org/VeganDiet', 'senza-glutine': 'https://schema.org/GlutenFreeDiet', 'senza-lattosio': 'https://schema.org/LowLactoseDiet', light: 'https://schema.org/LowCalorieDiet' };

const CSS = `
:root{--bg:#f4f6f4;--surface:#fff;--surface-2:#eef2ef;--text:#16201b;--muted:#5d6a63;--line:#dde4df;--accent:#1f8a5b;--accent-ink:#fff;--accent-soft:#dff1e7;--shadow:0 1px 2px rgba(16,32,24,.06),0 8px 28px rgba(16,32,24,.08);color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#0d1310;--surface:#161e1a;--surface-2:#1d2722;--text:#e8eee9;--muted:#9aa9a0;--line:#29352f;--accent:#3fb47e;--accent-ink:#06130c;--accent-soft:#19362a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}img{max-width:100%;display:block}
.top{background:var(--surface);border-bottom:1px solid var(--line)}.bar{max-width:1080px;margin:0 auto;padding:12px 16px;display:flex;align-items:center;gap:12px}
.brand{font-weight:800;font-size:19px;color:var(--text);text-decoration:none;display:flex;align-items:center;gap:8px}.brand img{width:30px;height:30px;border-radius:8px}
.btn{display:inline-flex;align-items:center;gap:6px;background:var(--accent);color:var(--accent-ink);text-decoration:none;font-weight:700;padding:10px 16px;border-radius:12px;font-size:15px}
.btn.ghost{background:var(--surface-2);color:var(--text)}.bar .btn{margin-left:auto}
main{max-width:1080px;margin:0 auto;padding:22px 16px 60px}
h1{font-size:clamp(28px,5vw,42px);line-height:1.15;margin:0 0 8px;letter-spacing:-.02em}h2{font-size:20px;margin:28px 0 10px}
.meta{color:var(--muted);margin:0 0 10px}.lead{font-size:18px;color:var(--muted);margin:10px 0 0}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0;padding:0;list-style:none}.tags li{background:var(--accent-soft);color:var(--accent);font-weight:700;font-size:13px;border-radius:999px;padding:2px 10px}
.grid{display:grid;grid-template-columns:1.1fr .9fr;gap:6px 28px;align-items:start}.g-photo,.g-steps{grid-column:1}.g-side{grid-column:2;grid-row:1/span 2}.g-steps h2{margin-top:6px}
.photo{border-radius:18px;overflow:hidden;box-shadow:var(--shadow);aspect-ratio:4/3;background:var(--surface-2)}.photo img{width:100%;height:100%;object-fit:cover}
.thumbs{display:flex;gap:8px;margin-top:8px;overflow-x:auto}.thumbs img{width:84px;height:64px;object-fit:cover;border-radius:10px}
.card{background:var(--surface);border-radius:16px;box-shadow:var(--shadow);padding:6px 18px}
.ing{list-style:none;margin:0;padding:0}.ing li{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}.ing li:last-child{border:0}.ing span{color:var(--muted);white-space:nowrap}
.steps{margin:0;padding-left:22px}.steps li{margin-bottom:12px}
.cta{margin-top:22px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}.cta p{color:var(--muted);font-size:14px;margin:0;flex-basis:100%}
.more{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-top:10px}
.rc{display:block;background:var(--surface);border-radius:14px;box-shadow:var(--shadow);overflow:hidden;color:inherit;text-decoration:none}
.rc .im{aspect-ratio:4/3;background:var(--surface-2);display:grid;place-items:center;color:var(--muted);font-size:34px}.rc .im img{width:100%;height:100%;object-fit:cover}
.rc b{display:block;padding:10px 12px 0}.rc small{display:block;padding:0 12px 12px;color:var(--muted)}
footer{color:var(--muted);font-size:14px;text-align:center;padding:20px}
@media (max-width:760px){.grid{grid-template-columns:1fr}.g-photo,.g-side,.g-steps{grid-column:1;grid-row:auto}.g-steps h2{margin-top:28px}}
`;

function layout({ base, title, description, canonical, image, body, jsonld, type = 'article' }) {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="${type}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<meta property="og:site_name" content="Sporta"><link rel="icon" href="/icons/icon-192.png"><meta name="theme-color" content="#1f8a5b">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
<style>${CSS}</style></head><body>
<header class="top"><div class="bar"><a class="brand" href="${esc(base)}/"><img src="/icons/icon-192.png" alt="">Sporta</a><a class="btn" href="${esc(base)}/">Apri Sporta</a></div></header>
<main>${body}</main><footer>Ricette condivise su <a href="${esc(base)}/">Sporta</a> · <a href="/privacy.html">Privacy</a></footer></body></html>`;
}

function createPages({ db }) {
  const photo = (base, id) => `${base}/api/photos/${id}`;
  const timeOf = (r) => (Number(r.prep_min) || 0) + (Number(r.cook_min) || 0);
  const card = (base, r) => {
    const ph = parseJson(r.photos, []);
    const meta = [Shared.courseLabel(r.course), timeOf(r) ? Shared.fmtMinutes(timeOf(r)) : ''].filter(Boolean).join(' · ');
    return `<a class="rc" href="${esc(base)}/ricetta/${esc(r.slug)}"><span class="im">${ph.length ? `<img src="${esc(photo(base, ph[0]))}" alt="" loading="lazy">` : '🍽'}</span><b>${esc(r.name)}</b><small>${esc(meta || ' ')}</small></a>`;
  };
  const notFound = (base) => ({
    status: 404, type: 'text/html; charset=utf-8', robots: 'noindex',
    text: layout({ base, title: 'Ricetta non disponibile · Sporta', description: 'Questa ricetta non è più pubblica.', canonical: base + '/', body: `<h1>Ricetta non disponibile</h1><p class="lead">Chi l'ha scritta l'ha resa privata o l'ha eliminata.</p><p class="cta"><a class="btn" href="${esc(base)}/">Scopri Sporta</a></p>` }),
  });

  async function recipePage(base, slug) {
    let r = await db.get(`SELECT * FROM recipes WHERE slug = ? AND visibility = 'public' AND hidden = 0`, [slug]);
    if (!r) {
      // Nome cambiato: lo slug finisce sempre con l'inizio dell'identificativo.
      const m = String(slug).match(/-([0-9a-f]{8})$/);
      const old = m && await db.get(`SELECT slug FROM recipes WHERE id LIKE ? AND visibility = 'public' AND hidden = 0`, [`${m[1].slice(0, 8)}-%`]);
      if (old && old.slug && old.slug !== slug) return { status: 301, headers: { Location: `${base}/ricetta/${old.slug}` }, text: '', type: 'text/plain' };
      return notFound(base);
    }
    const ings = parseJson(r.ingredients, []), steps = parseJson(r.steps, []), photos = parseJson(r.photos, []), traits = parseJson(r.traits, []);
    const hh = await db.get('SELECT * FROM households WHERE id = ?', [r.household_id]);
    const cookbook = hh && hh.kind === 'cookbook' ? hh : null;
    const author = r.author_name || 'Anonimo';
    const canonical = `${base}/ricetta/${r.slug}`;
    const qtyText = (i) => (i.unit === 'q.b.' ? 'q.b.' : Shared.fmtQty(i.qty, i.unit));
    const course = Shared.courseLabel(r.course);
    const meta = [course, timeOf(r) ? Shared.fmtMinutes(timeOf(r)) : '', DIFF[r.difficulty] || '', `${r.servings} ${Number(r.servings) === 1 ? 'persona' : 'persone'}`].filter(Boolean).join(' · ');
    const description = r.description || `${r.name}: ingredienti per ${r.servings} persone e procedimento${course ? ` (${course.toLowerCase()})` : ''}. Ricetta di ${author} su Sporta.`;
    const more = await db.all(`SELECT * FROM recipes WHERE household_id = ? AND id <> ? AND visibility = 'public' AND hidden = 0 ORDER BY saves DESC, published_at DESC LIMIT 6`, [r.household_id, r.id]);
    const jsonld = {
      '@context': 'https://schema.org', '@type': 'Recipe', name: r.name, description,
      image: photos.map((p) => photo(base, p)), url: canonical,
      author: { '@type': cookbook ? 'Organization' : 'Person', name: author, ...(cookbook && cookbook.slug ? { url: `${base}/ricettario/${cookbook.slug}` } : {}) },
      datePublished: r.published_at ? new Date(Number(r.published_at)).toISOString().slice(0, 10) : undefined,
      prepTime: iso(r.prep_min), cookTime: iso(r.cook_min), totalTime: iso(timeOf(r)),
      recipeYield: `${r.servings} persone`, recipeCategory: course || undefined, recipeCuisine: 'Italiana',
      keywords: traits.map(Shared.traitLabel).join(', ') || undefined,
      suitableForDiet: traits.filter((t) => DIETS[t]).map((t) => DIETS[t]),
      recipeIngredient: ings.map((i) => (i.unit === 'q.b.' ? `${i.name} q.b.` : [qtyText(i), i.name].filter(Boolean).join(' '))),
      recipeInstructions: steps.map((s, k) => ({ '@type': 'HowToStep', position: k + 1, text: s.text })),
      aggregateRating: undefined,
    };
    if (!jsonld.suitableForDiet.length) delete jsonld.suitableForDiet;
    const body = `<div class="grid">
      ${photos.length ? `<div class="g-photo"><div class="photo"><img src="${esc(photo(base, photos[0]))}" alt="${esc(r.name)}"></div>
        ${photos.length > 1 ? `<div class="thumbs">${photos.slice(1).map((p) => `<img src="${esc(photo(base, p))}" alt="" loading="lazy">`).join('')}</div>` : ''}</div>` : ''}
      <div class="g-side">
        <h1>${esc(r.name)}</h1>
        <p class="meta">${esc(meta)} · di ${cookbook && cookbook.slug ? `<a href="${esc(base)}/ricettario/${esc(cookbook.slug)}">${esc(author)}</a>` : esc(author)}</p>
        ${traits.length ? `<ul class="tags">${traits.map((t) => `<li>${esc(Shared.traitLabel(t))}</li>`).join('')}</ul>` : ''}
        ${r.description ? `<p class="lead">${esc(r.description)}</p>` : ''}
        <h2>Ingredienti per ${esc(r.servings)}</h2>
        <div class="card"><ul class="ing">${ings.map((i) => `<li><b>${esc(i.name)}</b><span>${esc(qtyText(i))}</span></li>`).join('')}</ul></div>
        <div class="cta"><a class="btn" href="${esc(base)}/#/r/pub/${esc(r.id)}">Salva in Sporta</a><a class="btn ghost" href="${esc(base)}/#/r/pub/${esc(r.id)}">Metti gli ingredienti in lista</a>
          <p>Con Sporta scegli per quante persone cucinare e gli ingredienti finiscono nella lista della spesa condivisa.</p></div>
      </div>
      <div class="g-steps"><h2>Procedimento</h2>${steps.length ? `<ol class="steps">${steps.map((s) => `<li>${esc(s.text)}</li>`).join('')}</ol>` : '<p class="meta">Nessun passaggio indicato.</p>'}</div>
      </div>
      ${more.length ? `<h2>Altre ricette di ${esc(author)}</h2><div class="more">${more.map((x) => card(base, x)).join('')}</div>` : ''}`;
    return {
      status: 200, type: 'text/html; charset=utf-8',
      text: layout({ base, title: `${r.name} – ricetta di ${author} · Sporta`, description: description.slice(0, 300), canonical, image: photos.length ? photo(base, photos[0]) : null, body, jsonld }),
    };
  }

  async function cookbookPage(base, slug) {
    const hh = await db.get(`SELECT * FROM households WHERE slug = ? AND kind = 'cookbook'`, [slug]);
    if (!hh) return notFound(base);
    const rows = await db.all(`SELECT * FROM recipes WHERE household_id = ? AND visibility = 'public' AND hidden = 0 ORDER BY course, lower(name) LIMIT 2000`, [hh.id]);
    const canonical = `${base}/ricettario/${hh.slug}`;
    const byCourse = new Map();
    for (const r of rows) { const c = Shared.courseLabel(r.course) || 'Altre ricette'; if (!byCourse.has(c)) byCourse.set(c, []); byCourse.get(c).push(r); }
    const order = [...Shared.COURSES.map((c) => c.label), 'Altre ricette'];
    const sections = order.filter((c) => byCourse.has(c)).map((c) => `<h2>${esc(c)}</h2><div class="more">${byCourse.get(c).map((r) => card(base, r)).join('')}</div>`).join('');
    const description = hh.description || `Le ricette di ${hh.name} su Sporta: ${rows.length} ricette con ingredienti e procedimento.`;
    const firstPhoto = rows.map((r) => parseJson(r.photos, [])[0]).find(Boolean);
    return {
      status: 200, type: 'text/html; charset=utf-8',
      text: layout({
        base, type: 'website', title: `${hh.name} · Ricettario su Sporta`, description: description.slice(0, 300), canonical,
        image: firstPhoto ? photo(base, firstPhoto) : null,
        jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: hh.name, description, url: canonical, hasPart: rows.slice(0, 200).map((r) => ({ '@type': 'Recipe', name: r.name, url: `${base}/ricetta/${r.slug}` })) },
        body: `<h1>${esc(hh.name)}</h1><p class="lead">${esc(description)}</p><p class="meta">${rows.length} ${rows.length === 1 ? 'ricetta' : 'ricette'}</p>${sections || '<p class="meta">Ancora nessuna ricetta.</p>'}`,
      }),
    };
  }

  async function sitemap(base) {
    const rows = await db.all(`SELECT slug, updated_at FROM recipes WHERE visibility = 'public' AND hidden = 0 AND slug <> '' ORDER BY published_at DESC LIMIT 45000`, []);
    const books = await db.all(`SELECT slug FROM households WHERE kind = 'cookbook' AND slug <> ''`, []);
    const url = (loc, t) => `<url><loc>${esc(loc)}</loc>${t ? `<lastmod>${new Date(Number(t)).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`;
    return {
      status: 200, type: 'application/xml; charset=utf-8',
      text: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${books.map((b) => url(`${base}/ricettario/${b.slug}`)).join('')}${rows.map((r) => url(`${base}/ricetta/${r.slug}`, r.updated_at)).join('')}</urlset>`,
    };
  }

  const robots = (base) => ({
    status: 200, type: 'text/plain; charset=utf-8',
    text: `User-agent: *\nAllow: /ricetta/\nAllow: /ricettario/\nAllow: /api/photos/\nAllow: /icons/\nDisallow: /\n\nSitemap: ${base}/sitemap.xml\n`,
  });

  // parts: ['ricetta', slug] | ['ricettario', slug] | ['sitemap.xml'] | ['robots.txt']
  async function route(parts, base) {
    const [what, slug] = parts;
    const okSlug = (s) => typeof s === 'string' && /^[a-z0-9-]{1,90}$/.test(s);
    if (what === 'ricetta' && okSlug(slug) && parts.length === 2) return recipePage(base, slug);
    if (what === 'ricettario' && okSlug(slug) && parts.length === 2) return cookbookPage(base, slug);
    if (what === 'sitemap.xml' && parts.length === 1) return sitemap(base);
    if (what === 'robots.txt' && parts.length === 1) return robots(base);
    return notFound(base);
  }
  return { route };
}

module.exports = { createPages };
