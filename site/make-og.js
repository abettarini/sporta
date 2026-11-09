// Immagini di anteprima per i social (1200x630), una per lingua: `node site/make-og.js` (serve Playwright).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const C = require('./site.config');
const pub = path.join(__dirname, '..', 'public');
const img = (f) => 'data:image/' + (f.endsWith('.png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(f).toString('base64');
const TXT = {
  it: ['Le liste di tutti, finalmente nello stesso posto.', 'Spesa, cose da fare ed eventi condivisi in tempo reale.'],
  en: ['Everyone’s lists, finally in one place.', 'Groceries, to-dos and events shared in real time.'],
};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  const logo = fs.readFileSync(path.join(pub, 'icons', 'icon.svg'), 'utf8');
  for (const [l, [title, sub]] of Object.entries(TXT)) {
    await p.setContent(`<style>
      body{margin:0;width:1200px;height:630px;font-family:system-ui,-apple-system,sans-serif;background:radial-gradient(900px 500px at 90% 0%,#cfeedd,transparent 70%),#f4f6f4;color:#16201b;display:flex;align-items:center;overflow:hidden}
      .t{padding:0 0 0 80px;width:640px}.b{display:flex;align-items:center;gap:14px;font-weight:800;font-size:34px;margin-bottom:36px}.b svg{width:56px;height:56px}
      h1{font-size:56px;line-height:1.08;letter-spacing:-.03em;margin:0 0 20px}p{font-size:26px;color:#5d6a63;margin:0}
      .ph{position:absolute;right:70px;top:70px;width:300px;border-radius:40px;padding:10px;background:#121815;transform:rotate(4deg);box-shadow:0 30px 60px -20px rgba(0,0,0,.4)}.ph img{width:100%;border-radius:31px;display:block}
      .ph.b2{right:330px;top:120px;transform:rotate(-6deg);width:260px}
    </style><div class="t"><div class="b">${logo}${C.name}</div><h1>${title}</h1><p>${sub}</p></div>
    <div class="ph b2"><img src="${img(path.join(pub, 'screenshots', 'phone-list.jpg'))}"></div>
    <div class="ph"><img src="${img(path.join(pub, 'screenshots', 'phone-overview.jpg'))}"></div>`);
    await p.screenshot({ path: path.join(__dirname, 'src', `og-${l}.png`) });
  }
  await b.close();
  console.log('Immagini di anteprima generate in site/src');
})();
