// Codici delle carte fedeltà disegnati come SVG, per mostrarli in cassa.
// Barre con JsBarcode (/vendor/jsbarcode, MIT), QR con qrcode-generator (/vendor, MIT): le due
// librerie si caricano al momento con load(). check e guessFormat non le richiedono.
// Condiviso tra l'app (window.Barcode) e gli script Node (require).
(function (root) {
  const LIBS = { bars: '/vendor/jsbarcode-3.12.3.min.js', qr: '/vendor/qrcode-generator-2.0.4.js' };
  const JSB = { ean13: 'EAN13', ean8: 'EAN8', upca: 'UPC', code128: 'CODE128', code39: 'CODE39', itf: 'ITF', codabar: 'codabar' };
  const LABELS = { ean13: 'EAN-13', ean8: 'EAN-8', upca: 'UPC-A', code128: 'Code 128', code39: 'Code 39', itf: 'ITF', codabar: 'Codabar', qr: 'QR', other: 'Altro' };
  // EAN e UPC: il numero si scrive dentro il codice, come sull'etichetta (cifre tra le barre lunghe)
  const LABELLED = new Set(['ean13', 'ean8', 'upca']);

  // cifra di controllo EAN/UPC (pesi 3 e 1 da destra)
  function check(digits) {
    let s = 0;
    for (let i = digits.length - 1, w = 3; i >= 0; i--, w = 4 - w) s += Number(digits[i]) * w;
    return String((10 - (s % 10)) % 10);
  }

  // Formato più probabile per un numero scritto a mano.
  function guessFormat(code) {
    const s = String(code || '').trim();
    if (/^\d{13}$/.test(s) && check(s.slice(0, 12)) === s[12]) return 'ean13';
    if (/^\d{8}$/.test(s) && check(s.slice(0, 7)) === s[7]) return 'ean8';
    if (/^\d{12}$/.test(s) && check(s.slice(0, 11)) === s[11]) return 'upca';
    return 'code128';
  }

  // ---------------------------------------------------------------- caricamento librerie
  const loading = {};
  const libOf = (format) => (format === 'qr' ? 'qr' : 'bars');
  const ready = (format) => (libOf(format) === 'qr' ? typeof root.qrcode === 'function' : typeof root.JsBarcode === 'function');
  function load(format) {
    if (ready(format)) return Promise.resolve();
    const k = libOf(format);
    if (!loading[k]) {
      loading[k] = new Promise((ok, ko) => {
        const s = root.document.createElement('script');
        s.src = LIBS[k]; s.onload = ok;
        s.onerror = () => { loading[k] = null; ko(new Error('Serve la connessione per caricare ' + LIBS[k])); };
        root.document.head.appendChild(s);
      });
    }
    return loading[k];
  }

  // ---------------------------------------------------------------- barre
  // ITF vuole cifre a coppie, Code 39 solo maiuscole: si sistemano qui come faceva il lettore.
  function normalize(format, code) {
    let s = String(code).trim();
    if (format === 'itf' && /^\d+$/.test(s) && s.length % 2) s = '0' + s;
    if (format === 'code39') s = s.toUpperCase();
    return s;
  }
  // <svg> disegnato da JsBarcode, o null se il numero non va bene per il formato.
  function draw(format, code) {
    if (!JSB[format] || typeof root.JsBarcode !== 'function') return null;
    const el = root.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    let ok = true;
    try {
      root.JsBarcode(el, normalize(format, code), {
        // a destra tanto spazio quanto la prima cifra a sinistra, così le barre restano al centro
        format: JSB[format], width: 2, height: 100, margin: 10, marginRight: LABELLED.has(format) ? 24 : 10, fontSize: 20, textMargin: 2,
        font: 'ui-monospace, Menlo, Consolas, monospace', fontOptions: 'bold',
        displayValue: LABELLED.has(format), background: '#ffffff', lineColor: '#000000',
        valid: (v) => { ok = v; },
      });
    } catch { return null; }
    return ok ? el : null;
  }
  // Formato con cui il codice si disegna davvero: quello chiesto o, se il numero non va, Code 128.
  // Serve JsBarcode caricato (load).
  function usable(format, code) {
    if (format === 'qr') return String(code).length ? 'qr' : null;
    if (draw(format, code)) return format;
    return draw('code128', code) ? 'code128' : null;
  }
  // true se il numero va scritto sotto il codice (non è già dentro l'SVG).
  const needsNumber = (format, code) => !LABELLED.has(usable(format, code));

  // SVG come stringa; '' finché la libreria che serve non è caricata.
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
    const f = usable(format, code);
    const el = f && draw(f, code);
    if (!el) return '';
    // dimensioni dal CSS: le barre si allungano in altezza, ma se c'è il numero le proporzioni restano
    const w = el.getAttribute('width'), hgt = el.getAttribute('height');
    el.removeAttribute('width'); el.removeAttribute('height'); el.removeAttribute('style');
    el.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(hgt)}`);
    el.setAttribute('class', LABELLED.has(f) ? 'bars labelled' : 'bars');
    if (!LABELLED.has(f)) el.setAttribute('preserveAspectRatio', 'none');
    el.setAttribute('shape-rendering', 'crispEdges');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `Codice a barre ${LABELS[f]}`);
    return el.outerHTML || new root.XMLSerializer().serializeToString(el);
  }

  const api = { load, ready, usable, needsNumber, svg, guessFormat, check, LABELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Barcode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
