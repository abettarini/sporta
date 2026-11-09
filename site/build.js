'use strict';
// Genera il sito di presentazione in site/dist (italiano in /, inglese in /en/).
// Nessuna dipendenza: `node site/build.js`. Nome e indirizzi in site/site.config.js.
const fs = require('fs');
const path = require('path');
const C = require('./site.config');
const STR = require('./src/strings');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const APP_PUBLIC = path.join(ROOT, '..', 'public');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fill = (s) => String(s).replace(/\{name\}/g, C.name);
const t = (s) => esc(fill(s));          // testo semplice
const th = (s) => fill(s);              // testo con HTML voluto (es. <span> nel titolo)

// Icone (stile dell'app: tratto, angoli arrotondati).
const ICON = {
  home: '<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/><path d="M12 3v4M16 10l4.5-1.5M14.5 14.5l2.5 4M9.5 14.5l-2.5 4M8 10L3.5 8.5"/>',
  me: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  live: '<path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6"/><path d="M18 2.5v4h-4M6 21.5v-4h4"/>',
  offline: '<path d="M2 8.8a15 15 0 0 1 20 0M5 12.6a10 10 0 0 1 14 0M8.5 16.2a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1.2"/>',
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  todo: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  event: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  recipe: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  phone: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  laptop: '<rect x="4" y="4.5" width="16" height="11" rx="1.5"/><path d="M2 19.5h20"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const icon = (k, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ''}</svg>`;
const LOGO = fs.readFileSync(path.join(APP_PUBLIC, 'icons', 'icon.svg'), 'utf8').replace('<svg ', '<svg class="logo" aria-hidden="true" ');

const SHOTS = ['phone-overview.jpg', 'phone-list.jpg', 'phone-todo.jpg', 'phone-event.jpg'];

function page(L, other) {
  const S = STR[L];
  const base = L === 'it' ? '' : '/' + L;
  const app = C.appUrl.replace(/\/$/, '');
  const abs = (p) => (C.siteUrl ? C.siteUrl.replace(/\/$/, '') + p : p);
  const otherHref = other === 'it' ? '/' : '/' + other + '/';
  const canonical = C.siteUrl ? `<link rel="canonical" href="${abs(base + '/')}">` : '';
  const alt = ['it', 'en'].map((l) => `<link rel="alternate" hreflang="${l}" href="${abs(l === 'it' ? '/' : '/en/')}">`).join('\n  ');
  const ld = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: C.name, applicationCategory: 'LifestyleApplication',
    operatingSystem: 'Web, Android, iOS, Windows, macOS', description: fill(S.description), url: C.siteUrl || undefined, inLanguage: L,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  };
  return `<!doctype html>
<html lang="${S.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${t(S.title)}</title>
  <meta name="description" content="${t(S.description)}">
  <meta name="theme-color" content="${C.themeColor}">
  ${canonical}
  ${alt}
  <link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${t(S.title)}">
  <meta property="og:description" content="${t(S.description)}">
  <meta property="og:image" content="${abs('/assets/og-' + L + '.png')}">
  <meta property="og:locale" content="${L === 'it' ? 'it_IT' : 'en_US'}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="stylesheet" href="/assets/site.css">
  <script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<header class="top">
  <div class="wrap bar">
    <a class="brand" href="${base}/">${LOGO}<span>${esc(C.name)}</span></a>
    <nav class="nav" aria-label="${L === 'it' ? 'Sezioni' : 'Sections'}">
      <a href="#funzioni">${t(S.nav.features)}</a><a href="#come">${t(S.nav.how)}</a><a href="#domande">${t(S.nav.faq)}</a>
    </nav>
    <a class="lang" href="${otherHref}" hreflang="${other}" lang="${other}">${t(S.langSwitch)}</a>
    <a class="btn small" href="${app}/">${t(S.nav.open)}</a>
  </div>
</header>

<main>
  <section class="hero">
    <div class="wrap hero-grid">
      <div class="hero-text">
        <p class="kicker">${t(S.hero.kicker)}</p>
        <h1>${th(S.hero.title)}</h1>
        <p class="lead">${t(S.hero.text)}</p>
        <div class="ctas"><a class="btn" href="${app}/">${t(S.hero.cta)} ${icon('arrow')}</a><a class="btn ghost" href="#come">${t(S.hero.cta2)}</a></div>
        <p class="note">${t(S.hero.note)}</p>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="phone back"><img src="/assets/shots/phone-list.jpg" alt="" width="780" height="1688"></div>
        <div class="phone front"><img src="/assets/shots/phone-overview.jpg" alt="" width="780" height="1688"></div>
      </div>
    </div>
  </section>

  <section class="audiences">
    <div class="wrap">
      <h2>${t(S.audiences.title)}</h2>
      <div class="cards three">
        ${S.audiences.items.map((a) => `<article class="card aud"><span class="tile">${icon(a.icon)}</span><h3>${t(a.title)}</h3><p>${t(a.text)}</p></article>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="features" id="funzioni">
    <div class="wrap">
      <h2>${t(S.features.title)}</h2>
      <div class="cards four">
        ${S.features.items.map(([k, title, text]) => `<article class="feat"><span class="tile small">${icon(k)}</span><h3>${t(title)}</h3><p>${t(text)}</p></article>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="how" id="come">
    <div class="wrap">
      <h2>${t(S.how.title)}</h2>
      <ol class="steps">
        ${S.how.steps.map(([title, text], k) => `<li><span class="num">${k + 1}</span><h3>${t(title)}</h3><p>${t(text)}</p></li>`).join('\n        ')}
      </ol>
    </div>
  </section>

  <section class="gallery">
    <div class="wrap">
      <h2>${t(S.gallery.title)}</h2>
      <div class="shots">
        ${SHOTS.map((f, k) => `<figure><div class="phone"><img src="/assets/shots/${f}" alt="${t(S.gallery.shots[k])}" width="780" height="1688" loading="lazy"></div><figcaption>${t(S.gallery.shots[k])}</figcaption></figure>`).join('\n        ')}
      </div>
      <div class="desk"><img src="/assets/shots/desktop-overview.jpg" alt="${t(S.gallery.shots[0])}" width="1920" height="1200" loading="lazy"></div>
    </div>
  </section>

  <section class="install">
    <div class="wrap install-grid">
      <div><h2>${t(S.install.title)}</h2><p class="lead">${t(S.install.text)}</p></div>
      <ul class="cards">
        ${S.install.items.map(([title, text], k) => `<li class="card inst"><span class="tile small">${icon(k === 2 ? 'laptop' : 'phone')}</span><div><h3>${t(title)}</h3><p>${t(text)}</p></div></li>`).join('\n        ')}
      </ul>
    </div>
  </section>

  <section class="trust">
    <div class="wrap trust-box">
      <span class="tile">${icon('shield')}</span>
      <div><h2>${t(S.trust.title)}</h2><ul>${S.trust.items.map((x) => `<li>${icon('check')}${t(x)}</li>`).join('')}</ul></div>
    </div>
  </section>

  <section class="faq" id="domande">
    <div class="wrap narrow">
      <h2>${t(S.faq.title)}</h2>
      ${S.faq.items.map(([q, a]) => `<details><summary>${t(q)}</summary><p>${t(a)}</p></details>`).join('\n      ')}
    </div>
  </section>

  <section class="final">
    <div class="wrap"><h2>${t(S.final.title)}</h2><a class="btn big" href="${app}/">${t(S.final.cta)} ${icon('arrow')}</a></div>
  </section>
</main>

<footer class="foot">
  <div class="wrap foot-bar">
    <a class="brand" href="${base}/">${LOGO}<span>${esc(C.name)}</span></a>
    <nav><a href="${app}/privacy.html">${t(S.footer.privacy)}</a><a href="${app}/termini.html">${t(S.footer.terms)}</a>${C.contactEmail ? `<a href="mailto:${esc(C.contactEmail)}">${t(S.footer.contact)}</a>` : ''}<a href="${otherHref}" hreflang="${other}">${t(S.langSwitch)}</a></nav>
    <p>© ${new Date().getFullYear()} ${esc(C.name)} · ${t(S.footer.made)}</p>
  </div>
</footer>
</body>
</html>
`;
}

// ------------------------------------------------------------------ uscita
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'en'), { recursive: true });
fs.mkdirSync(path.join(DIST, 'assets', 'shots'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'index.html'), page('it', 'en'));
fs.writeFileSync(path.join(DIST, 'en', 'index.html'), page('en', 'it'));
fs.copyFileSync(path.join(ROOT, 'src', 'site.css'), path.join(DIST, 'assets', 'site.css'));
for (const f of fs.readdirSync(path.join(APP_PUBLIC, 'screenshots'))) fs.copyFileSync(path.join(APP_PUBLIC, 'screenshots', f), path.join(DIST, 'assets', 'shots', f));
for (const f of ['icon.svg', 'apple-touch-icon.png']) fs.copyFileSync(path.join(APP_PUBLIC, 'icons', f), path.join(DIST, 'assets', f));
for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter((x) => /^og-.*\.png$/.test(x))) fs.copyFileSync(path.join(ROOT, 'src', f), path.join(DIST, 'assets', f));
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n${C.siteUrl ? `Sitemap: ${C.siteUrl.replace(/\/$/, '')}/sitemap.xml\n` : ''}`);
if (C.siteUrl) {
  const u = C.siteUrl.replace(/\/$/, '');
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${['/', '/en/'].map((p) => `  <url><loc>${u}${p}</loc><xhtml:link rel="alternate" hreflang="it" href="${u}/"/><xhtml:link rel="alternate" hreflang="en" href="${u}/en/"/></url>`).join('\n')}\n</urlset>\n`);
}
console.log(`Sito generato in ${path.relative(process.cwd(), DIST) || DIST} (${C.name})`);
