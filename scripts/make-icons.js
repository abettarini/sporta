// Genera le icone PNG dall'SVG usando Playwright (solo per sviluppo).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const svg = fs.readFileSync(path.join(__dirname, '../public/icons/icon.svg'), 'utf8');
const out = (f) => path.join(__dirname, '../public/icons', f);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const shot = async (file, size, maskable) => {
    await p.setViewportSize({ width: size, height: size });
    const inner = maskable
      ? `<div style="width:${size}px;height:${size}px;background:#1f8a5b;display:grid;place-items:center"><div style="width:${size * 0.8}px;height:${size * 0.8}px">${svg.replace('rx="112"', 'rx="0"')}</div></div>`
      : svg;
    await p.setContent(`<style>html,body{margin:0;background:transparent}svg{width:100%;height:100%;display:block}</style>${inner}`);
    await p.screenshot({ path: out(file), omitBackground: true });
  };
  await shot('icon-192.png', 192);
  await shot('icon-512.png', 512);
  await shot('icon-maskable-512.png', 512, true);
  await shot('apple-touch-icon.png', 180, true);
  await b.close();
})();
