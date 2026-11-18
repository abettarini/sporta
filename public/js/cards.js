'use strict';
/* Sporta — carte fedeltà (Altro → Carte). Sono del gruppo di default (le usa chiunque),
   oppure "solo mie". Si aggiungono inquadrando il codice a barre (lettore del browser o, dove
   manca, ZXing caricato al momento) o scrivendo il numero; in cassa il codice si ridisegna
   grande su fondo bianco, con lo schermo sempre acceso. Funzionano anche senza rete. */

const CARD_COLORS = ['#e4572e', '#d0463f', '#d0569b', '#7a5fc4', '#2f6fb8', '#2fa3c7', '#1f8a5b', '#3d7a3f', '#cf9a12', '#9a6a3f', '#4b5563', '#16201b'];
const CARD_KINDS = [['spesa', 'Spesa'], ['casa', 'Casa'], ['elettronica', 'Elettronica'], ['persona', 'Persona'], ['altro', 'Altro']];

// Catene con logo (public/chains/chains.json, generato da scripts/chains/).
let chainsList = null, chainsLoading = null;
function loadChains() {
  if (chainsList) return Promise.resolve(chainsList);
  if (!chainsLoading) {
    chainsLoading = fetch('/chains/chains.json').then((r) => (r.ok ? r.json() : [])).catch(() => [])
      .then((l) => { chainsList = l; render(); return l; });
  }
  return chainsLoading;
}
const chainOf = (c) => (chainsList || []).find((x) => x.id === c.chain) || null;
const cardHue = (s) => [...String(s)].reduce((hh, c) => (hh * 31 + c.charCodeAt(0)) % 360, 7);
const cardColor = (c) => c.color || `hsl(${cardHue(c.name)} 45% 42%)`;
const cardMask = (code) => (String(code).length > 4 ? '•••• ' + String(code).slice(-4) : String(code));

function cardTile(c) {
  const ch = chainOf(c);
  const logo = ch && ch.logo ? `<img class="cc-logo" src="/chains/${h(ch.logo)}" alt="" loading="lazy">` : `<span class="cc-ini">${h(c.name.trim().charAt(0).toUpperCase())}</span>`;
  return `<a class="cc ${ch && ch.logo ? 'has-logo' : ''}" href="#/carte/${h(c.id)}" style="--cc:${cardColor(c)}">
    ${c.mine ? '<i class="cc-who">solo mia</i>' : ''}${logo}
    <span class="cc-t"><b>${h(c.name)}</b><small>${h(c.holder || cardMask(c.code))}</small></span></a>`;
}

const sortedCards = () => [...st.cards.values()].sort((a, b) => (b.used_at || 0) - (a.used_at || 0) || a.name.localeCompare(b.name, 'it'));

Views.cards = {
  filter: 'all',
  mount() {
    loadChains();
    app.innerHTML = topBar('Carte', { back: '#/s', right: `<a class="icon-btn" href="#/carte/nuova" aria-label="Aggiungi una carta">${I.plus}</a>` })
      + '<main class="wide cards-page"><div id="cards-body"></div></main>' + tabBar('settings');
    $('#cards-body').addEventListener('click', (e) => { const a = e.target.closest('[data-f]'); if (a) { e.preventDefault(); this.filter = a.dataset.f; this.update(); } });
    this.update();
  },
  update() {
    const box = $('#cards-body'); if (!box) return;
    const all = sortedCards();
    const mine = all.filter((c) => c.mine);
    const shown = this.filter === 'mine' ? mine : this.filter === 'group' ? all.filter((c) => !c.mine) : all;
    if (!all.length) {
      box.innerHTML = `<div class="empty">${emptyArt('card')}Nessuna carta fedeltà.<br>Aggiungile inquadrando il codice a barre: in cassa le mostri dal telefono, anche senza rete.</div>
        <div class="actions"><a class="btn primary" href="#/carte/nuova">${icon('scan')} Aggiungi una carta</a></div>`;
      return;
    }
    const last = all.find((c) => c.used_at);
    box.innerHTML = `${mine.length ? `<div class="seg-tabs">${[['all', 'Tutte'], ['group', 'Del gruppo'], ['mine', 'Solo mie']].map(([k, l]) => `<a href="#" data-f="${k}" class="${this.filter === k ? 'on' : ''}">${l}</a>`).join('')}</div>` : ''}
      <div class="cc-grid">${shown.map(cardTile).join('')}<a class="cc add" href="#/carte/nuova">${I.plus}<span>Aggiungi carta</span></a></div>
      ${last ? `<p class="hint">Usata di recente: <b>${h(last.name)}</b>, ${h(fmtAgo(last.used_at))}${last.used_by ? ` da ${h(last.used_by)}` : ''}.</p>` : ''}
      <p class="hint">Le carte del gruppo le vedono e le usano tutti i membri: basta un telefono per la carta di famiglia. Quelle “solo mie” le vedi solo tu, in tutti i tuoi gruppi.</p>`;
  },
};

// ------------------------------------------------------------------ in cassa
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      if (!wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* non supportato o rifiutato: pazienza */ }
}
document.addEventListener('visibilitychange', () => { if (view === Views.card && document.visibilityState === 'visible') keepAwake(true); });

let qrLoading = null;
function loadQr() {
  if (typeof qrcode === 'function') return Promise.resolve();
  if (!qrLoading) qrLoading = loadScript('/vendor/qrcode-generator-2.0.4.js');
  return qrLoading;
}
function loadScript(src) {
  return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('Serve la connessione per caricare ' + src)); document.head.appendChild(s); });
}

Views.card = {
  mount() {
    const c = st.cards.get(this.route.id);
    if (!c) { history.replaceState(null, '', '#/carte'); return mount(); }
    loadChains();
    if (c.format === 'qr') loadQr().then(() => this.update()).catch(() => {});
    this.rot = false;
    app.innerHTML = `<div class="till">${topBar(`<span id="ct"></span>`, { back: '#/carte', right: `<a class="icon-btn" href="#/carte/${h(c.id)}/modifica" aria-label="Modifica">${I.edit}</a>` })}<main id="till-body"></main></div>`;
    $('#till-body').addEventListener('click', (e) => {
      if (e.target.closest('#rot')) { this.rot = !this.rot; this.update(); }
    });
    keepAwake(true);
    // "usata da…" al più ogni 10 minuti
    if (!c.used_at || Date.now() - c.used_at > 6e5 || c.used_by !== st.member) enqueue({ k: 'card.used', id: c.id }, { silent: true });
    this.update();
  },
  leave() { keepAwake(false); },
  update() {
    const c = st.cards.get(this.route.id);
    const body = $('#till-body'); if (!c || !body) return;
    $('#ct').textContent = c.name;
    const ch = chainOf(c);
    const code = Barcode.svg(c.format, c.code);
    const e = c.format === 'qr' ? null : Barcode.encode(c.format, c.code);
    const fallback = c.format !== 'qr' && e && e.format !== c.format;
    body.innerHTML = `<div class="till-hero" style="--cc:${cardColor(c)}">
        ${ch && ch.logo ? `<span class="th-logo"><img src="/chains/${h(ch.logo)}" alt=""></span>` : `<span class="th-ini">${h(c.name.charAt(0).toUpperCase())}</span>`}
        <span><b>${h(c.name)}</b><small>${h(c.holder || (c.mine ? 'Carta personale' : 'Carta del gruppo'))}</small></span></div>
      <div class="till-code ${this.rot ? 'rot' : ''} ${c.format === 'qr' ? 'is-qr' : ''}">${code || (c.format === 'qr' ? '<div class="empty muted">Caricamento del QR…</div>' : '')}
        <div class="till-num">${h(e ? e.text : c.code)}</div></div>
      ${fallback ? '<p class="hint center">Questo formato non si può ridisegnare: se il lettore non legge, il cassiere può digitare il numero.</p>' : ''}
      <p class="hint center">☀ Se il lettore non legge, alza la luminosità dello schermo.</p>
      <div class="till-acts"><button type="button" class="btn" id="rot">↻ ${this.rot ? 'Normale' : 'Ruota'}</button></div>
      ${c.note ? `<p class="till-note">${h(c.note)}</p>` : ''}`;
  },
};

// ------------------------------------------------------------------ fotocamera
const BD_FORMATS = { ean_13: 'ean13', ean_8: 'ean8', upc_a: 'upca', code_128: 'code128', code_39: 'code39', itf: 'itf', codabar: 'codabar', qr_code: 'qr' };
const ZX_FORMATS = { EAN_13: 'ean13', EAN_8: 'ean8', UPC_A: 'upca', CODE_128: 'code128', CODE_39: 'code39', ITF: 'itf', CODABAR: 'codabar', QR_CODE: 'qr' };
let zxingLoading = null;

function createScanner(video, onFound) {
  let stream = null, timer = null, stopped = false, detect = null;
  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Questo browser non può usare la fotocamera: scrivi il numero a mano.');
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (stopped) return stop();
    video.srcObject = stream;
    await video.play().catch(() => {});
    detect = await makeDetector();
    loop();
  }
  async function makeDetector() {
    if ('BarcodeDetector' in window) {
      try {
        const sup = await BarcodeDetector.getSupportedFormats();
        const formats = sup.filter((f) => BD_FORMATS[f] || ['upc_e', 'code_93', 'data_matrix', 'pdf417', 'aztec'].includes(f));
        if (formats.length) {
          const bd = new BarcodeDetector({ formats });
          return async () => { const r = await bd.detect(video); return r.length ? { code: r[0].rawValue, format: BD_FORMATS[r[0].format] || 'other' } : null; };
        }
      } catch { /* si passa a ZXing */ }
    }
    if (!zxingLoading) zxingLoading = loadScript('/vendor/zxing-0.23.0.min.js');
    await zxingLoading;
    const Z = window.ZXing;
    const reader = new Z.MultiFormatReader();
    reader.setHints(new Map([[Z.DecodeHintType.TRY_HARDER, true], [Z.DecodeHintType.POSSIBLE_FORMATS, Object.keys(ZX_FORMATS).map((k) => Z.BarcodeFormat[k])]]));
    const canvas = document.createElement('canvas');
    return async () => {
      const w = video.videoWidth, hgt = video.videoHeight; if (!w) return null;
      // si legge la parte centrale, dove sta il riquadro
      const cw = Math.round(w * 0.85), chh = Math.round(hgt * 0.6);
      canvas.width = cw; canvas.height = chh;
      canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, (w - cw) / 2, (hgt - chh) / 2, cw, chh, 0, 0, cw, chh);
      try {
        const res = reader.decodeWithState(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas))));
        return { code: res.getText(), format: ZX_FORMATS[Z.BarcodeFormat[res.getBarcodeFormat()]] || 'other' };
      } catch { return null; }
    };
  }
  async function loop() {
    if (stopped) return;
    let r = null;
    try { r = await detect(); } catch { /* fotogramma non pronto */ }
    if (stopped) return;
    if (r && r.code) { vibrate(30); stop(); onFound(r); return; }
    timer = setTimeout(loop, 120);
  }
  function stop() {
    stopped = true; clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    try { video.srcObject = null; } catch { /* */ }
  }
  async function torch(on) {
    const t = stream && stream.getVideoTracks()[0];
    if (!t || !t.getCapabilities || !t.getCapabilities().torch) return false;
    await t.applyConstraints({ advanced: [{ torch: on }] });
    return true;
  }
  return { start, stop, torch };
}

// ------------------------------------------------------------------ nuova / modifica
Views.cardEdit = {
  mount() {
    const c = this.route.id ? st.cards.get(this.route.id) : null;
    if (this.route.id && !c) { history.replaceState(null, '', '#/carte'); return mount(); }
    loadChains();
    this.card = c;
    this.d = c ? { ...c } : { name: '', chain: '', color: '', format: '', code: '', holder: '', note: '', mine: false };
    this.step = c ? 'form' : 'scan';
    app.innerHTML = topBar(c ? 'Modifica carta' : 'Nuova carta', { back: c ? `#/carte/${c.id}` : '#/carte' })
      + '<main class="wide card-edit"><div id="ce-body"></div></main>' + tabBar('settings');
    this.draw();
  },
  leave() { if (this.scanner) this.scanner.stop(); this.scanner = null; },
  update() { if (this.step === 'form' && chainsList && !$('#ce-chains-ready')) this.drawChainList(); },
  draw() {
    this.leave();
    const box = $('#ce-body');
    if (this.step === 'scan') {
      box.innerHTML = `<div class="cam"><video id="ce-video" playsinline muted></video>
          <div class="cam-frame"><i></i><i></i><i></i><i></i><span class="laser"></span></div>
          <button type="button" class="cam-torch" id="ce-torch" aria-label="Torcia" hidden>⚡</button>
          <p class="cam-cap" id="ce-cap">Inquadra il codice a barre della carta</p></div>
        <div class="actions"><button type="button" class="btn" id="ce-manual">Scrivi il numero a mano</button></div>`;
      $('#ce-manual').onclick = () => { this.step = 'form'; this.draw(); };
      const video = $('#ce-video');
      this.scanner = createScanner(video, (r) => {
        this.d.code = r.code; this.d.format = r.format;
        this.scanned = true;
        this.step = 'form'; this.draw();
      });
      this.scanner.start().then(async () => {
        const tb = $('#ce-torch');
        if (tb && this.scanner && await this.scanner.torch(false).catch(() => false)) {
          let on = false; tb.hidden = false;
          tb.onclick = async () => { on = !on; await this.scanner.torch(on).catch(() => {}); tb.classList.toggle('on', on); };
        }
      }).catch((e) => {
        const cap = $('#ce-cap');
        if (cap) cap.textContent = /NotAllowed|Permission/i.test(e.name || e.message) ? 'Permesso per la fotocamera negato: puoi scrivere il numero a mano.' : e.message || 'Fotocamera non disponibile.';
      });
      return;
    }
    const d = this.d;
    box.innerHTML = `<form id="ce-form" autocomplete="off">
      ${this.scanned ? `<div class="ce-found">✓ Letto: ${h(Barcode.LABELS[d.format] || d.format)} · <b>${h(d.code)}</b></div>` : ''}
      <label class="field"><span>Negozio</span><input class="input" name="name" required maxlength="60" value="${h(d.name)}" placeholder="Cerca una catena o scrivi il nome"></label>
      <div class="ce-chains" id="ce-chains"></div>
      <div class="field"><span>Colore</span><div class="ce-colors">${CARD_COLORS.map((col) => `<button type="button" class="ce-col ${d.color === col ? 'on' : ''}" data-col="${col}" style="--c:${col}" aria-label="Colore"></button>`).join('')}</div></div>
      <div class="row2">
        <label class="field"><span>Numero della carta</span><input class="input mono" name="code" required maxlength="500" value="${h(d.code)}" inputmode="${/^\d*$/.test(d.code) ? 'numeric' : 'text'}"></label>
        <label class="field"><span>Formato</span><select class="input" name="format">${['', 'ean13', 'ean8', 'upca', 'code128', 'code39', 'itf', 'codabar', 'qr'].map((f) => `<option value="${f}" ${f === (d.format === 'other' ? '' : d.format) ? 'selected' : ''}>${f ? Barcode.LABELS[f] : 'Automatico'}</option>`).join('')}</select></label>
      </div>
      <div class="ce-preview" id="ce-preview"></div>
      ${this.card || this.scanned ? '' : '<button type="button" class="btn ghost" id="ce-rescan">' + icon('scan') + ' Inquadra il codice</button>'}
      <label class="field"><span>Intestatario (facoltativo)</span><input class="input" name="holder" maxlength="60" value="${h(d.holder)}" placeholder="es. Famiglia Rossi"></label>
      <label class="field"><span>Nota (facoltativa)</span><input class="input" name="note" maxlength="300" value="${h(d.note)}" placeholder="es. PIN 1234 per il saldo punti"></label>
      ${typeof acct !== 'undefined' && acct && acct.token ? `<label class="switch"><input type="checkbox" name="mine" ${d.mine ? 'checked' : ''}><span>Solo per me <small class="muted">(non la vedono gli altri del gruppo)</small></span></label>` : ''}
      <p class="err" id="ce-err"></p>
      <div class="actions">${this.card ? '<button type="button" class="btn danger" id="ce-del">Elimina</button>' : ''}<button class="btn primary">Salva la carta</button></div>
    </form>`;
    const f = $('#ce-form');
    const preview = () => {
      const code = f.elements.code.value.trim();
      const fmt = f.elements.format.value || Barcode.guessFormat(code);
      if (fmt === 'qr') { loadQr().then(() => { $('#ce-preview').innerHTML = code ? Barcode.svg('qr', code) : ''; }).catch(() => {}); return; }
      $('#ce-preview').innerHTML = code ? Barcode.svg(fmt, code) : '';
    };
    f.addEventListener('input', (e) => {
      if (e.target.name === 'code' || e.target.name === 'format') preview();
      if (e.target.name === 'name') { this.d.name = e.target.value; this.d.chain = ''; this.drawChainList(); }
    });
    f.addEventListener('change', (e) => { if (e.target.name === 'format') preview(); });
    $('.ce-colors', f).onclick = (e) => {
      const b = e.target.closest('[data-col]'); if (!b) return;
      this.d.color = this.d.color === b.dataset.col ? '' : b.dataset.col;
      f.querySelectorAll('.ce-col').forEach((x) => x.classList.toggle('on', x.dataset.col === this.d.color));
    };
    const rs = $('#ce-rescan'); if (rs) rs.onclick = () => { this.collect(); this.step = 'scan'; this.draw(); };
    f.onsubmit = (e) => { e.preventDefault(); this.save(); };
    const del = $('#ce-del');
    if (del) del.onclick = () => {
      if (!confirm(`Eliminare la carta ${this.card.name}?${this.card.mine ? '' : ' Sparisce per tutto il gruppo.'}`)) return;
      enqueue({ k: 'card.del', id: this.card.id }, { silent: true });
      toast('Carta eliminata'); location.hash = '#/carte';
    };
    preview();
    this.drawChainList();
    if (!d.name) setTimeout(() => f.elements.name.focus(), 50);
  },
  drawChainList() {
    const box = $('#ce-chains'); if (!box) return;
    if (!chainsList) { box.innerHTML = ''; return; }
    const q = S.foldText(this.d.name);
    const sel = this.d.chain;
    const hits = q ? chainsList.filter((c) => S.foldText(c.name).includes(q)).slice(0, 8)
      : chainsList.filter((c) => c.kind === (this.kind || 'spesa'));
    box.innerHTML = `<span id="ce-chains-ready"></span>${q ? '' : `<div class="seg-tabs sm">${CARD_KINDS.map(([k, l]) => `<a href="#" data-kind="${k}" class="${(this.kind || 'spesa') === k ? 'on' : ''}">${l}</a>`).join('')}</div>`}
      <div class="ce-chain-grid">${hits.map((c) => `<button type="button" class="ce-chain ${sel === c.id ? 'on' : ''}" data-chain="${h(c.id)}">
        ${c.logo ? `<img src="/chains/${h(c.logo)}" alt="" loading="lazy">` : `<span class="ini" style="background:hsl(${cardHue(c.name)} 45% 42%)">${h(c.name.charAt(0))}</span>`}<small>${h(c.name)}</small></button>`).join('')}</div>`;
    box.onclick = (e) => {
      const k = e.target.closest('[data-kind]');
      if (k) { e.preventDefault(); this.kind = k.dataset.kind; return this.drawChainList(); }
      const b = e.target.closest('[data-chain]'); if (!b) return;
      const c = chainsList.find((x) => x.id === b.dataset.chain);
      this.d.chain = c.id; this.d.name = c.name;
      $('#ce-form').elements.name.value = c.name;
      box.querySelectorAll('.ce-chain').forEach((x) => x.classList.toggle('on', x.dataset.chain === c.id));
    };
  },
  collect() {
    const f = $('#ce-form'); if (!f) return;
    const el = f.elements;
    Object.assign(this.d, { name: el.name.value.trim(), code: el.code.value.trim(), format: el.format.value, holder: el.holder.value.trim(), note: el.note.value.trim(), mine: !!(el.mine && el.mine.checked) });
  },
  save() {
    this.collect();
    const d = this.d;
    if (!d.name || !d.code) { $('#ce-err').textContent = 'Servono il negozio e il numero della carta.'; return; }
    const format = d.format || Barcode.guessFormat(d.code);
    if (format !== 'qr' && !Barcode.encode(format, d.code)) { $('#ce-err').textContent = `Il numero non va bene per il formato ${Barcode.LABELS[format]}.`; return; }
    if (format !== 'qr' && Barcode.encode(format, d.code).format !== format) { $('#ce-err').textContent = `Il numero non va bene per il formato ${Barcode.LABELS[format]}.`; return; }
    const id = this.card ? this.card.id : uid();
    const data = { name: d.name, chain: d.chain || '', color: d.color || '', format, code: d.code, holder: d.holder, note: d.note, mine: d.mine };
    enqueue({ k: 'card.put', id, data }, { silent: true });
    toast(this.card ? 'Carta aggiornata' : 'Carta salvata');
    location.hash = '#/carte/' + id;
  },
};
