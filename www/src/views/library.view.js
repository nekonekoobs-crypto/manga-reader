/* Vista Biblioteca */
import { $, esc } from '../lib/dom.js';
import { S, keyOf, cache } from '../models/state.js';
import { recentHistory } from '../models/library.model.js';
import { coverImg, hydrate } from './images.view.js';
import { cardHtml } from './explore.view.js';

export function renderLibrary() {
  const hist = recentHistory(30);
  let html = '';
  html += '<h2 class="sec">Continuar leyendo</h2>';
  html += hist.length ? hist.map(h => {
    cache[keyOf(h.item)] = h.item;
    return `<div class="lrw"><button class="lrow" data-k="${esc(keyOf(h.item))}"><div class="cv"><span class="ph">${esc((h.item.title || '?').charAt(0).toUpperCase())}</span>${coverImg(h.item.cover, h.item.src)}</div><div><b>${esc(h.item.title)}</b><small>${esc(h.chapterTitle)}</small></div></button><button class="rm" data-rmh="${esc(keyOf(h.item))}" aria-label="Quitar de Continuar leyendo">✕</button></div>`;
  }).join('') : '<p class="hint">Aún no has leído nada.</p>';
  html += '<h2 class="sec">Favoritos</h2>';
  html += S.fav.length ? `<div class="grid">${S.fav.map(f => `<div class="cardw">${cardHtml(f)}<button class="rm" data-rmf="${esc(f.key)}" aria-label="Quitar de favoritos">✕</button></div>`).join('')}</div>` : '<p class="hint">Toca ☆ en una serie para guardarla aquí.</p>';
  $('#library').innerHTML = html;
  hydrate($('#library'));
}
