'use strict';
/* Sporta — set di icone dell'app (originali, SVG a tratto su griglia 24×24).
   Sostituiscono le emoji: reparti, icone delle liste, stati vuoti e segnaposto.
   Ogni icona di reparto ha un colore proprio, usato per la "piastrella" di sfondo. */

const ICONS = {
  // ------------------------------------------------ reparti
  frutta: '<path d="M12 7.5c-1.6-1.3-4.3-1.4-5.8.3-1.9 2-1.6 6 .3 9.1 1.4 2.3 3.5 3.9 5.5 2.9 2 1 4.1-.6 5.5-2.9 1.9-3.1 2.2-7.1.3-9.1-1.5-1.7-4.2-1.6-5.8-.3z"/><path d="M12 7.5c0-1.7.5-3 1.6-4"/><path d="M12.8 5.6c1.1-1.7 3.2-2.2 4.6-1.6-.5 1.7-2.5 2.7-4.6 1.6z"/>',
  pane: '<path d="M5.2 13.5C3.6 13 3 11.6 3.6 10.3 4.9 7.6 8.2 6 12 6s7.1 1.6 8.4 4.3c.6 1.3 0 2.7-1.6 3.2V19a1 1 0 0 1-1 1H6.2a1 1 0 0 1-1-1z"/><path d="M9 9.2l1.2 2.3M12.4 8.8l1.2 2.3M15.6 9.4l.9 1.8"/>',
  carne: '<path d="M14.2 4.2c3.2-.8 6.3 2.3 5.5 5.5-.6 2.7-3.5 4.3-6.1 3.6l-3.4 3.4a2 2 0 1 1-2.7 2.7 2 2 0 1 1-2.7-2.7 2 2 0 1 1 2.7-2.7l3.4-3.4c-.7-2.6.9-5.5 3.3-6.4z"/><path d="M14.5 7.5c1-.4 2 .1 2.4 1"/>',
  pesce: '<path d="M2.5 12c2.8-4.2 7.6-5.8 11.8-3.6L19.5 5v14l-5.2-3.4C10.1 17.8 5.3 16.2 2.5 12z"/><circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none"/><path d="M11 9.5c.6 1.6.6 3.4 0 5"/>',
  salumi: '<path d="M3 16.5 14.5 6.5l6.5 4v6H3z"/><path d="M3 16.5h18v2.3a.7.7 0 0 1-.7.7H3.7a.7.7 0 0 1-.7-.7z"/><circle cx="13.5" cy="12.3" r="1.1"/><circle cx="17.3" cy="13.6" r=".8"/><circle cx="9.3" cy="14.4" r=".8"/>',
  latticini: '<path d="M7 9.5 9 5h6l2 4.5V20a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z"/><path d="M9 5V3h6v2"/><path d="M7 9.5h10"/><path d="M10 14.5c1.3-.8 2.7-.8 4 0"/>',
  pasta: '<path d="M12 21V7"/><path d="M12 10.5c-2 0-3.6-1.5-3.6-3.5 2 0 3.6 1.5 3.6 3.5zM12 10.5c2 0 3.6-1.5 3.6-3.5-2 0-3.6 1.5-3.6 3.5zM12 15c-2 0-3.6-1.5-3.6-3.5 2 0 3.6 1.5 3.6 3.5zM12 15c2 0 3.6-1.5 3.6-3.5-2 0-3.6 1.5-3.6 3.5zM12 19.5c-2 0-3.6-1.5-3.6-3.5 2 0 3.6 1.5 3.6 3.5zM12 19.5c2 0 3.6-1.5 3.6-3.5-2 0-3.6 1.5-3.6 3.5z"/><path d="M12 7c0-1.6.4-2.8 1.2-3.8"/>',
  dispensa: '<rect x="7.5" y="3" width="9" height="3" rx=".8"/><path d="M7 6h10a1.5 1.5 0 0 1 1.5 1.5V19a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V7.5A1.5 1.5 0 0 1 7 6z"/><path d="M5.5 11h13M5.5 16.5h13"/>',
  colazione: '<path d="M4 10h12.5v3.5A5.5 5.5 0 0 1 11 19H9.5A5.5 5.5 0 0 1 4 13.5z"/><path d="M16.5 11.2H18a2.4 2.4 0 0 1 0 4.8h-1.8"/><path d="M8 3.5c-.8 1 .8 2 0 3M12 3.5c-.8 1 .8 2 0 3"/><path d="M3.5 21h14"/>',
  surgelati: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.6 4.6 12 6.2l2.4-1.6M9.6 19.4 12 17.8l2.4 1.6M4.5 10.5l2.6-.6-.9-2.6M19.5 13.5l-2.6.6.9 2.6M4.5 13.5l2.6.6-.9 2.6M19.5 10.5l-2.6-.6.9-2.6"/>',
  bevande: '<path d="M10 2.5h4V6l1.7 2.6c.3.5.5 1 .5 1.6V20a1.5 1.5 0 0 1-1.5 1.5H9.3A1.5 1.5 0 0 1 7.8 20v-9.8c0-.6.2-1.1.5-1.6L10 6z"/><path d="M7.8 12.5h8.4v4.5H7.8z"/>',
  persona: '<path d="M8.8 9.5h6.4a2 2 0 0 1 2 2V20a1 1 0 0 1-1 1H7.8a1 1 0 0 1-1-1v-8.5a2 2 0 0 1 2-2z"/><path d="M11 9.5V6.5h2v3"/><path d="M12 6.5V4.5h4.5"/><path d="M9.5 14.5c1.5 1 3.5 1 5 0"/>',
  casa: '<path d="M7.5 9H13l1.3 3.2V20a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-7.8z"/><path d="M8.5 9V5.5h4.2l3.3 1.7"/><path d="M8.5 7h-3"/><path d="M18.5 4.5v.01M20.5 6.8v.01M18.5 9v.01" stroke-width="2.4"/>',
  animali: '<ellipse cx="6.6" cy="10.4" rx="1.6" ry="2"/><ellipse cx="10" cy="6.4" rx="1.6" ry="2"/><ellipse cx="14" cy="6.4" rx="1.6" ry="2"/><ellipse cx="17.4" cy="10.4" rx="1.6" ry="2"/><path d="M12 12.2c-2.6 0-5 3-5 5.2 0 1.7 1.3 2.6 2.8 2.1 1-.3 1.4-.6 2.2-.6s1.2.3 2.2.6c1.5.5 2.8-.4 2.8-2.1 0-2.2-2.4-5.2-5-5.2z"/>',
  bimbi: '<path d="M10 2.8h4l.6 3.2H9.4z"/><path d="M8.5 6h7"/><path d="M9.3 6 8 9.2V19a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9.2L14.7 6"/><path d="M8 12.5h3.2M8 15.8h3.2"/>',
  altro: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/><path d="M7.7 5.3l8.6 4.5"/>',
  // ------------------------------------------------ liste e gruppi
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.6l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.2l1.7-7.3H6.1"/>',
  basket: '<path d="M3 10h18l-2.1 9a2 2 0 0 1-1.9 1.5H7A2 2 0 0 1 5.1 19z"/><path d="M7.5 10 11 4M16.5 10 13 4"/><path d="M9 13.5v3.5M12 13.5v3.5M15 13.5v3.5"/>',
  pharmacy: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M12 8v8M8 12h8"/>',
  home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.2V20h12V9.2"/><path d="M10 20v-5.5h4V20"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 8.3l3.3 2.4-1.3 3.9h-4l-1.3-3.9z"/><path d="M12 3v5.3M15.3 10.7l5.3-1.8M14 14.6l3.4 4.7M10 14.6l-3.4 4.7M8.7 10.7 3.4 8.9"/>',
  party: '<path d="M12 3a6 6 0 0 1 6 6c0 3.6-3 7-6 7s-6-3.4-6-7a6 6 0 0 1 6-6z"/><path d="M11 16l-.6 1.6h3.2L13 16"/><path d="M12 17.6c0 1.6-2 2.1-1 3.9"/><path d="M9.3 7.2c.6-.9 1.5-1.4 2.5-1.5"/>',
  gift: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v7.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V12M12 8v12.5"/><path d="M12 8C10.6 5 7 4.4 7 6.5 7 8 10 8 12 8zM12 8c1.4-3 5-3.6 5-1.5C17 8 14 8 12 8z"/>',
  tree: '<path d="M12 2.8 7 9.4h2.6L5.4 15h4.1L6 20.3h12L14.5 15h4.1l-4.2-5.6H17z"/><path d="M12 20.3V22"/>',
  wine: '<path d="M7.8 3h8.4l-.4 5.4a3.8 3.8 0 0 1-7.6 0z"/><path d="M8 7h8"/><path d="M12 12.2V20M8.5 20.5h7"/>',
  beer: '<path d="M5 8.5h10V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M15 10.5h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/><path d="M5 8.5A2.5 2.5 0 0 1 7 4.3a3 3 0 0 1 5.2-.2A2.5 2.5 0 0 1 15 8.5"/><path d="M8.5 12v5.5M11.5 12v5.5"/>',
  cake: '<path d="M4 13h16v7.5H4z"/><path d="M4 16.3c2 1.4 4 1.4 6 0s4-1.4 6 0 3 1.4 4 0"/><path d="M8 13v-3M12 13v-3M16 13v-3"/><path d="M8 6.5c-.6.6-.6 1.3 0 1.8.6-.5.6-1.2 0-1.8zM12 6.5c-.6.6-.6 1.3 0 1.8.6-.5.6-1.2 0-1.8zM16 6.5c-.6.6-.6 1.3 0 1.8.6-.5.6-1.2 0-1.8z"/>',
  tent: '<path d="M2.5 20.5 12 4l9.5 16.5z"/><path d="M12 4v16.5M12 13l-3.5 7.5M12 13l3.5 7.5"/>',
  leaf: '<path d="M5 19c-.5-7 4-13 15-14-.5 10-6 15-13 14.5"/><path d="M5 19c3-4 6-7 10-9"/>',
  // ------------------------------------------------ interfaccia e stati vuoti
  list: '<rect x="5" y="3.8" width="14" height="17.2" rx="2"/><path d="M9 3.8V2.8h6v1"/><path d="M8.5 9.5h7M8.5 13.5h7M8.5 17.5h4"/>',
  done: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8 5.7-5.8"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/><path d="M9 7.5h6"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.1 6.1a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  dish: '<path d="M4 17a8 8 0 0 1 16 0"/><path d="M2.5 17h19"/><path d="M12 9V7.3M10.3 7.3h3.4"/><path d="M8 13.2c.7-1 1.6-1.6 2.6-1.9"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  starFill: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor"/>',
};

// Colore di ogni icona (reparti e liste): usato per tratto e sfondo della piastrella.
const ICON_COLORS = {
  frutta: '#3f9a4a', pane: '#c4822a', carne: '#c8504a', pesce: '#2f86b8', salumi: '#cf9a12', latticini: '#4f86d6',
  pasta: '#b0892c', dispensa: '#9a6a3f', colazione: '#8a5a3c', surgelati: '#2fa3c7', bevande: '#7a5fc4',
  persona: '#c45fa0', casa: '#2a9d8f', animali: '#a0703c', bimbi: '#e07a86', altro: '#7b8794',
  cart: '#1f8a5b', basket: '#1f8a5b', pharmacy: '#d0463f', home: '#4f86d6', ball: '#3d7a3f', party: '#d0569b',
  gift: '#c8504a', tree: '#2f8a4a', wine: '#8e3b5a', beer: '#cf9a12', cake: '#d0569b', tent: '#3d7a3f', leaf: '#3f9a4a',
};

// Icone tra cui scegliere per una lista.
const LIST_ICONS = ['cart', 'basket', 'frutta', 'pane', 'carne', 'pesce', 'salumi', 'pasta', 'bevande', 'wine', 'beer',
  'pharmacy', 'persona', 'casa', 'animali', 'bimbi', 'home', 'ball', 'party', 'cake', 'gift', 'tree', 'tent', 'leaf'];

// Le liste create con le versioni precedenti avevano un'emoji: la convertiamo nell'icona equivalente.
const LEGACY_EMOJI = {
  '🛒': 'cart', '🥦': 'frutta', '🍎': 'frutta', '🥩': 'carne', '🐟': 'pesce', '🧀': 'salumi', '🍞': 'pane',
  '🍝': 'pasta', '🍷': 'wine', '🍺': 'beer', '⚽': 'ball', '🎉': 'party', '🧴': 'persona', '🧻': 'casa',
  '🐶': 'animali', '💊': 'pharmacy', '🏠': 'home', '🎄': 'tree',
};

const listIconId = (v) => (ICONS[v] ? v : LEGACY_EMOJI[v] || 'cart');
const deptIconId = (dept) => (dept && ICONS[dept] ? dept : 'altro');

// Icona semplice (eredita il colore del testo).
function icon(id, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ICONS.altro}</svg>`;
}
// Icona su piastrella colorata (reparti, liste). size: 'sm' | 'md' | 'lg'.
function iconTile(id, size = 'md', title = '') {
  const c = ICON_COLORS[id] || ICON_COLORS.altro;
  return `<span class="ico-tile ${size}" style="--c:${c}"${title ? ` title="${title}"` : ''}>${icon(id)}</span>`;
}
const deptTile = (dept, size) => iconTile(deptIconId(dept), size, S.deptOf(dept).label);
const listTile = (list, size) => iconTile(listIconId(list && list.emoji), size);
// Illustrazione per gli stati vuoti.
const emptyArt = (id) => `<div class="empty-art">${icon(id)}</div>`;
