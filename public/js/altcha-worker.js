'use strict';
/* Sporta — prova di lavoro ALTCHA, in background: trova il numero n tale che
   SHA-256(salt + n) sia uguale all'impronta ricevuta dal server. */
self.onmessage = async (e) => {
  const { challenge, salt, algorithm, maxnumber } = e.data;
  const enc = new TextEncoder();
  const want = new Uint8Array(challenge.match(/../g).map((x) => parseInt(x, 16)));
  const alg = algorithm || 'SHA-256';
  for (let n = 0; n <= maxnumber; n++) {
    const got = new Uint8Array(await crypto.subtle.digest(alg, enc.encode(salt + n)));
    let same = got.length === want.length;
    for (let k = 0; same && k < got.length; k++) same = got[k] === want[k];
    if (same) { self.postMessage({ number: n }); return; }
  }
  self.postMessage({ number: null });
};
