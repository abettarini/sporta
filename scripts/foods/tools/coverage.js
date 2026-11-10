// Copertura sulle ricette reali: nomi riconosciuti e ingredienti convertibili in grammi.
const F = require(__dirname + '/../../../public/foods-lib.js');
const ix = F.createIndex(require(__dirname + '/../../../public/foods.json'));
const recipes = require(process.argv[2]).recipes;
let occ = 0, hit = 0, gramsOk = 0, gramsOf = 0; const miss = new Map(), noG = new Map();
let recOk = 0;
for (const r of recipes) {
  const nut = ix.nutrition(r.ingredients, r.servings);
  if (nut.total && nut.counted / nut.total >= 0.8) recOk++;
  for (const i of r.ingredients) {
    occ++;
    const m = ix.match(i.name);
    if (m) hit++; else miss.set(i.name.toLowerCase(), (miss.get(i.name.toLowerCase()) || 0) + 1);
    if (m && i.unit !== 'q.b.' && m.food.src !== 'zero') {
      gramsOf++;
      if (ix.grams(m.food, i.qty, i.unit, m.unit) != null) gramsOk++;
      else { const k = `${m.food.n} [${i.qty ?? '-'} ${i.unit || m.unit || '∅'}]`; noG.set(k, (noG.get(k) || 0) + 1); }
    }
  }
}
console.log(`nomi riconosciuti: ${hit}/${occ} (${(100 * hit / occ).toFixed(1)}%)`);
console.log(`convertiti in grammi: ${gramsOk}/${gramsOf} (${(100 * gramsOk / gramsOf).toFixed(1)}%)`);
console.log(`ricette con almeno l'80% degli ingredienti calcolati: ${recOk}/${recipes.length}`);
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}(${v})`).join(', ');
console.log('\nNON RICONOSCIUTI più frequenti:\n' + top(miss, +process.argv[3] || 150));
console.log('\nSENZA GRAMMI più frequenti:\n' + top(noG, 60));
