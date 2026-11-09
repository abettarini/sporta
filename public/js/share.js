'use strict';
/* Sporta — "Condividi con Sporta" (share_target del manifest): un testo condiviso da un'altra
   app (una lista ricevuta in chat, gli ingredienti copiati da un sito…) diventa voci da
   aggiungere a una lista. Ogni riga è una voce; si scelgono gruppo, lista e righe da tenere.
   Il contenuto aspetta sul dispositivo (ls "share") anche se prima bisogna entrare in Sporta. */

// Righe del testo condiviso, ripulite da elenchi puntati, numeri, caselle e link.
function shareLines(share) {
  let text = String(share.text || '').trim();
  if (!text && share.title) text = String(share.title);
  let lines = text.split(/\r?\n/);
  // Una sola riga con le virgole ("latte, pane, uova"): una voce per ogni elemento.
  if (lines.length === 1 && /[,;]/.test(lines[0])) lines = lines[0].split(/[,;]/);
  lines = lines
    .map((l) => l.replace(/^\s*(?:[-*•·◦▪–—>]+|\d+[.)]|\[[ xX✓]?\]|[☐☑✓✔])\s*/, '').replace(/\s+/g, ' ').trim())
    .filter((l) => l && !/^https?:\/\/\S+$/i.test(l) && l.length <= 120);
  if (!lines.length && share.url) lines = [String(share.title || share.url).slice(0, 120)];
  return [...new Set(lines)].slice(0, 100);
}

Views.shareIn = {
  mount() {
    const share = ls.json('share', null);
    if (!share) { history.replaceState(null, '', '#/'); return mount(); }
    this.lines = shareLines(share);
    this.off = new Set();
    const lists = sortedLists();
    if (!this.listId || !st.lists.has(this.listId)) this.listId = (lists.find((l) => l.id === lastShoppingListId()) || lists[0] || {}).id || '';
    app.innerHTML = topBar('Aggiungi a Sporta', { back: '#/' }) + `<main class="wide share-in"><div id="sh"></div></main>`;
    this.update();
  },
  update() {
    const box = $('#sh'); if (!box) return;
    const groups = orderedGroups().filter((g) => g.token && g.status !== 'pending');
    const lists = sortedLists();
    const n = this.lines.length - this.off.size;
    if (!this.lines.length) {
      box.innerHTML = `<div class="empty">${emptyArt('note')}Nel contenuto condiviso non ho trovato righe da aggiungere.</div>
        <div class="actions"><button class="btn" id="sh-cancel">Chiudi</button></div>`;
      $('#sh-cancel').onclick = () => this.done();
      return;
    }
    box.innerHTML = `<p class="muted">Ogni riga diventa una voce: togli la spunta a quelle che non vuoi aggiungere.</p>
      <div class="share-pick">
        <label class="field"><span>Gruppo</span><select class="input" id="sh-g">${groups.map((g) => `<option value="${h(g.code)}" ${g.code === st.code ? 'selected' : ''}>${h(g.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Lista</span><select class="input" id="sh-l">${lists.map((l) => listOption(l, this.listId)).join('')}<option value="_new">+ Nuova lista…</option></select></label>
      </div>
      <ul class="items card share-lines">${this.lines.map((l, k) => `<li class="item ${this.off.has(k) ? '' : 'done'}" data-k="${k}"><button class="tap" type="button"><span class="check">${I.check}</span><span class="txt"><span class="name">${h(l)}</span></span></button></li>`).join('')}</ul>
      <div class="sticky-cta"><div class="card"><button class="btn" id="sh-cancel">Annulla</button><button class="btn primary" id="sh-add" ${n ? '' : 'disabled'}>Aggiungi ${n} ${n === 1 ? 'voce' : 'voci'}</button></div></div>`;
    $('#sh-g').onchange = (e) => switchGroup(e.target.value, '#/share');
    $('#sh-l').onchange = (e) => {
      if (e.target.value !== '_new') { this.listId = e.target.value; return; }
      const name = (prompt('Nome della nuova lista:', ls.json('share', {}).title || 'Lista condivisa') || '').trim();
      if (!name) { e.target.value = this.listId; return; }
      const id = uid();
      enqueue({ k: 'list.put', id, data: { name, emoji: 'cart', type: 'spesa', variant: '', position: Math.max(0, ...lists.map((l) => l.position)) + 1, sort_mode: 'manual' } }, { silent: true });
      this.listId = id;
      this.update();
    };
    $('.share-lines').onclick = (e) => {
      const li = e.target.closest('[data-k]'); if (!li) return;
      const k = Number(li.dataset.k);
      this.off.has(k) ? this.off.delete(k) : this.off.add(k);
      this.update();
    };
    $('#sh-cancel').onclick = () => this.done();
    $('#sh-add').onclick = () => this.add();
  },
  add() {
    const list = st.lists.get(this.listId);
    if (!list) return toast('Scegli una lista');
    const lines = this.lines.filter((_, k) => !this.off.has(k));
    for (const line of lines) {
      if (typeOf(list) === 'spesa') { const p = S.parseQuick(line); if (p.name) addToList(list.id, p); }
      else addTyped(list, line);
    }
    render();
    vibrate(20);
    this.done('#/l/' + list.id);
    toast(`${lines.length} ${lines.length === 1 ? 'voce aggiunta' : 'voci aggiunte'} a ${list.name}`);
  },
  done(hash = '#/') {
    ls.set('share', null);
    this.listId = null;
    history.replaceState(null, '', hash);
    mount();
  },
};
