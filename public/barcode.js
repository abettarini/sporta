// Codici a barre delle carte fedeltà: dal numero alle barre, per mostrarli in cassa.
// Formati: EAN-13, EAN-8, UPC-A, Code 128, Code 39, ITF, Codabar (i QR con la libreria in /vendor).
// Condiviso tra l'app (window.Barcode) e i test (require).
(function (root) {
  // ---------------------------------------------------------------- EAN / UPC
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  // cifra di controllo EAN/UPC (pesi 3 e 1 da destra)
  function check(digits) {
    let s = 0;
    for (let i = digits.length - 1, w = 3; i >= 0; i--, w = 4 - w) s += Number(digits[i]) * w;
    return String((10 - (s % 10)) % 10);
  }
  function ean13(code) {
    let d = String(code);
    if (d.length === 12) d += check(d);
    if (!/^\d{13}$/.test(d)) return null;
    let bits = '101';
    const p = PARITY[Number(d[0])];
    for (let i = 1; i <= 6; i++) bits += (p[i - 1] === 'L' ? L : G)[Number(d[i])];
    bits += '01010';
    for (let i = 7; i <= 12; i++) bits += R[Number(d[i])];
    return { bits: bits + '101', text: `${d[0]} ${d.slice(1, 7)} ${d.slice(7)}` };
  }
  function ean8(code) {
    let d = String(code);
    if (d.length === 7) d += check(d);
    if (!/^\d{8}$/.test(d)) return null;
    let bits = '101';
    for (let i = 0; i < 4; i++) bits += L[Number(d[i])];
    bits += '01010';
    for (let i = 4; i < 8; i++) bits += R[Number(d[i])];
    return { bits: bits + '101', text: `${d.slice(0, 4)} ${d.slice(4)}` };
  }
  // UPC-A ha le stesse barre di un EAN-13 che inizia con 0
  function upca(code) {
    let d = String(code);
    if (d.length === 11) d += check(d);
    if (!/^\d{12}$/.test(d)) return null;
    const e = ean13('0' + d);
    return e && { bits: e.bits, text: `${d[0]} ${d.slice(1, 6)} ${d.slice(6, 11)} ${d[11]}` };
  }

  // ---------------------------------------------------------------- Code 128
  const C128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 ' +
    '123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 ' +
    '111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 ' +
    '231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 ' +
    '141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 ' +
    '124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 ' +
    '311141 411131 211412 211214 211232').split(' ');
  const STOP = '2331112';
  const widthsToBits = (w) => { let s = ''; for (let i = 0; i < w.length; i++) s += (i % 2 ? '0' : '1').repeat(Number(w[i])); return s; };
  // Set C (coppie di cifre) dove conviene, set B per il resto.
  function code128(code) {
    const s = String(code);
    if (!s || /[^\x20-\x7e]/.test(s)) return null;
    const vals = [];
    const digitsAt = (i) => { let n = 0; while (i + n < s.length && /\d/.test(s[i + n])) n++; return n; };
    let set = null, i = 0;
    while (i < s.length) {
      const run = digitsAt(i);
      // set C per tratti di cifre pari e abbastanza lunghi (all'inizio o alla fine bastano 4)
      const useC = run >= 4 && (run >= 6 || i === 0 || i + run === s.length);
      if (useC) {
        const n = run - (run % 2);
        if (set !== 'C') { vals.push(set ? 99 : 105); set = 'C'; }
        for (let k = 0; k < n; k += 2) vals.push(Number(s.slice(i + k, i + k + 2)));
        i += n;
      } else {
        if (set !== 'B') { vals.push(set ? 100 : 104); set = 'B'; }
        vals.push(s.charCodeAt(i) - 32);
        i++;
      }
    }
    let sum = vals[0];
    for (let k = 1; k < vals.length; k++) sum += vals[k] * k;
    vals.push(sum % 103);
    return { bits: vals.map((v) => widthsToBits(C128[v])).join('') + widthsToBits(STOP), text: s };
  }

  // ---------------------------------------------------------------- Code 39, ITF, Codabar (larghe = 3)
  const nw = (p, first) => { let s = ''; for (let i = 0; i < p.length; i++) s += ((i % 2 === 0) === first ? '1' : '0').repeat(p[i] === 'w' ? 3 : 1); return s; };
  const C39 = {
    0: 'nnnwwnwnn', 1: 'wnnwnnnnw', 2: 'nnwwnnnnw', 3: 'wnwwnnnnn', 4: 'nnnwwnnnw', 5: 'wnnwwnnnn', 6: 'nnwwwnnnn', 7: 'nnnwnnwnw', 8: 'wnnwnnwnn', 9: 'nnwwnnwnn',
    A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
    K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
    U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn',
    $: 'nwnwnwnnn', '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn',
  };
  function code39(code) {
    const s = String(code).toUpperCase();
    if (!s || [...s].some((c) => !C39[c] || c === '*')) return null;
    return { bits: ['*', ...s, '*'].map((c) => nw(C39[c], true)).join('0'), text: s };
  }
  const ITF = ['nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw', 'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn'];
  function itf(code) {
    let d = String(code);
    if (!/^\d+$/.test(d)) return null;
    if (d.length % 2) d = '0' + d;
    let bits = '1010';
    for (let i = 0; i < d.length; i += 2) {
      const a = ITF[Number(d[i])], b = ITF[Number(d[i + 1])];
      for (let k = 0; k < 5; k++) bits += '1'.repeat(a[k] === 'w' ? 3 : 1) + '0'.repeat(b[k] === 'w' ? 3 : 1);
    }
    return { bits: bits + '11101', text: d };
  }
  const CODABAR = {
    0: 'nnnnnww', 1: 'nnnnwwn', 2: 'nnnwnnw', 3: 'wwnnnnn', 4: 'nnwnnwn', 5: 'wnnnnwn', 6: 'nwnnnnw', 7: 'nwnnwnn', 8: 'nwwnnnn', 9: 'wnnwnnn',
    '-': 'nnnwwnn', $: 'nnwwnnn', ':': 'wnnnwnw', '/': 'wnwnnnw', '.': 'wnwnwnn', '+': 'nnwnwnw',
    A: 'nnwwnwn', B: 'nwnwnnw', C: 'nnnwnww', D: 'nnnwwwn',
  };
  function codabar(code) {
    let s = String(code).toUpperCase();
    if (!/^[ABCD]/.test(s)) s = 'A' + s;
    if (!/[ABCD]$/.test(s.slice(1))) s += s[0];
    if ([...s.slice(1, -1)].some((c) => !CODABAR[c] || /[ABCD]/.test(c))) return null;
    return { bits: [...s].map((c) => nw(CODABAR[c], true)).join('0'), text: s.slice(1, -1) };
  }

  const ENC = { ean13, ean8, upca, code128, code39, itf, codabar };
  const LABELS = { ean13: 'EAN-13', ean8: 'EAN-8', upca: 'UPC-A', code128: 'Code 128', code39: 'Code 39', itf: 'ITF', codabar: 'Codabar', qr: 'QR', other: 'Altro' };

  // Barre di un codice: { bits, text, format } (il formato usato davvero: se non si può, Code 128).
  function encode(format, code) {
    const f = ENC[format];
    const r = f && f(code);
    if (r) return { ...r, format };
    const c = code128(code);
    return c && { ...c, format: 'code128' };
  }

  // Formato più probabile per un numero scritto a mano.
  function guessFormat(code) {
    const s = String(code || '').trim();
    if (/^\d{13}$/.test(s) && check(s.slice(0, 12)) === s[12]) return 'ean13';
    if (/^\d{8}$/.test(s) && check(s.slice(0, 7)) === s[7]) return 'ean8';
    if (/^\d{12}$/.test(s) && check(s.slice(0, 11)) === s[11]) return 'upca';
    return 'code128';
  }

  // SVG con le barre (zona di rispetto inclusa); per i QR serve window.qrcode.
  function svg(format, code) {
    if (format === 'qr') {
      if (typeof root.qrcode !== 'function') return '';
      const q = root.qrcode(0, 'M');
      q.addData(String(code)); q.make();
      const n = q.getModuleCount();
      let path = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) path += `M${c + 4} ${r + 4}h1v1h-1z`;
      return `<svg class="qr" viewBox="0 0 ${n + 8} ${n + 8}" shape-rendering="crispEdges" role="img" aria-label="Codice QR"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
    }
    const e = encode(format, code);
    if (!e) return '';
    const q = 10, w = e.bits.length + 2 * q;
    let path = '';
    for (let i = 0; i < e.bits.length;) {
      if (e.bits[i] !== '1') { i++; continue; }
      let j = i; while (e.bits[j] === '1') j++;
      path += `M${i + q} 0h${j - i}v50h-${j - i}z`;
      i = j;
    }
    return `<svg class="bars" viewBox="0 0 ${w} 50" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Codice a barre ${LABELS[e.format]}"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  }

  const api = { encode, svg, guessFormat, check, LABELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Barcode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
