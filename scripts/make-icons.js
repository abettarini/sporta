// Genera le immagini dell'app dall'SVG usando Playwright (solo per sviluppo):
// icone (normali, adattive, monocrome), icone delle scorciatoie, schermate di avvio iOS.
// Uso: npm run icons
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const svg = fs.readFileSync(path.join(__dirname, '../public/icons/icon.svg'), 'utf8');
const out = (f) => path.join(__dirname, '../public/icons', f);
const GREEN = '#1f8a5b';

// Solo il disegno (carrello con la spunta), senza il riquadro verde: per l'icona monocroma.
const glyph = (color) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <g fill="none" stroke="${color}" stroke-width="34" stroke-linecap="round" stroke-linejoin="round">
    <path d="M104 128h44l40 188a24 24 0 0 0 24 19h146a24 24 0 0 0 23-18l30-124H164"/>
    <path d="M232 238l36 34 70-74"/>
  </g>
  <circle cx="222" cy="392" r="28" fill="${color}"/>
  <circle cx="350" cy="392" r="28" fill="${color}"/>
</svg>`;

// Icone delle scorciatoie (stessi disegni dell'interfaccia), bianche su riquadro verde.
const SHORTCUTS = {
  lists: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.6l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.2l1.7-7.3H6.1"/>',
  events: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  notifs: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  recipes: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
};
const shortcutSvg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="${GREEN}"/>
  <g transform="translate(24 24) scale(2)" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;

// Schermate di avvio iOS (verticale): [larghezza, altezza, densità] in pixel del dispositivo.
const SPLASH = [
  [1290, 2796, 3], // iPhone 14/15/16 Pro Max, 15/16 Plus
  [1179, 2556, 3], // iPhone 14/15/16 Pro, 15/16
  [1170, 2532, 3], // iPhone 12/13/14
  [1284, 2778, 3], // iPhone 12/13 Pro Max, 14 Plus
  [1125, 2436, 3], // iPhone X/XS/11 Pro, 12/13 mini
  [828, 1792, 2], // iPhone XR/11
  [750, 1334, 2], // iPhone SE, 8
  [1640, 2360, 2], // iPad Air 10.9"
  [1668, 2388, 2], // iPad Pro 11"
  [2048, 2732, 2], // iPad Pro 12.9"
];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const render = async (file, w, h, html) => {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<style>html,body{margin:0;background:transparent}svg{width:100%;height:100%;display:block}</style>${html}`);
    await p.screenshot({ path: out(file), omitBackground: true });
  };
  const maskable = (size) => `<div style="width:${size}px;height:${size}px;background:${GREEN};display:grid;place-items:center"><div style="width:${size * 0.8}px;height:${size * 0.8}px">${svg.replace('rx="112"', 'rx="0"')}</div></div>`;

  await render('icon-192.png', 192, 192, svg);
  await render('icon-512.png', 512, 512, svg);
  await render('icon-maskable-192.png', 192, 192, maskable(192));
  await render('icon-maskable-512.png', 512, 512, maskable(512));
  await render('apple-touch-icon.png', 180, 180, maskable(180));
  // Monocroma: sagoma bianca su trasparente (barra di stato di Android, icone a tema).
  await render('icon-monochrome-512.png', 512, 512, glyph('#fff'));
  await render('badge-96.png', 96, 96, glyph('#fff'));
  for (const [k, body] of Object.entries(SHORTCUTS)) await render(`shortcut-${k}.png`, 96, 96, shortcutSvg(body));

  // Schermate di avvio: logo e nome al centro, su sfondo chiaro o scuro.
  fs.mkdirSync(out('splash'), { recursive: true });
  for (const [w, h, dpr] of SPLASH) {
    for (const [mode, bg, fg] of [['light', '#f4f6f4', '#16201b'], ['dark', '#0d1310', '#e8eee9']]) {
      const cw = Math.round(w / dpr), ch = Math.round(h / dpr);
      const ctx = await b.newContext({ viewport: { width: cw, height: ch }, deviceScaleFactor: dpr });
      const page = await ctx.newPage();
      await page.setContent(`<style>html,body{margin:0;height:100%;background:${bg}}
        main{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;font:700 30px system-ui,-apple-system,sans-serif;color:${fg}}
        .i{width:${Math.round(Math.min(cw, ch) * 0.28)}px;height:${Math.round(Math.min(cw, ch) * 0.28)}px}svg{width:100%;height:100%}</style>
        <main><div class="i">${svg}</div><span>Sporta</span></main>`);
      await page.screenshot({ path: out(`splash/splash-${w}x${h}-${mode}.png`) });
      await ctx.close();
    }
  }
  await b.close();
  console.log('Icone generate in public/icons');
})();

