/* Vista Explorar: tarjetas, selector de fuente, resultados y chips de filtro */
import { $, esc } from '../lib/dom.js';
import { S, keyOf, cache } from '../models/state.js';
import { ALL } from '../config/constants.js';
import { allSources, srcById } from '../models/sources/index.js';
import { coverImg, hydrate } from './images.view.js';

export const cardHtml = it => {
  cache[keyOf(it)] = it;
  return `<button class="card" data-k="${esc(keyOf(it))}"><div class="cv"><span class="ph">${esc((it.title || '?').trim().charAt(0).toUpperCase())}</span>${coverImg(it.cover, it.src)}${S.current === ALL ? `<span class="sb">${esc(srcById(it.src).name.replace(/ \(.*\)$/, ''))}</span>` : ''}</div><div class="ct">${esc(it.title)}</div></button>`;
};

export function renderSrcSelect() {
  $('#srcsel').innerHTML = `<option value="${ALL}" ${S.current === ALL ? 'selected' : ''}>Todas las fuentes</option>` + allSources().map(s => `<option value="${esc(s.id)}" ${s.id === S.current ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}

export const readQuery = () => $('#q').value.trim();
export const clearQuery = () => { $('#q').value = ''; };
export const blurQuery = () => $('#q').blur();

const results = () => $('#results');
export const showSearching = () => { results().innerHTML = '<div class="spin">Buscando…</div>'; $('#more').innerHTML = ''; };
export const showSpinner = html => { results().innerHTML = `<div class="spin">${html}</div>`; };
export const showEmpty = html => { results().innerHTML = `<div class="empty">${html}</div>`; };
export const showNoResults = q => showEmpty(`Sin resultados${q ? ` para “${esc(q)}”` : ''}.`);
export const showError = msg => { results().innerHTML = `<div class="err"><b>No se pudo cargar</b>${esc(msg)}<br><br><button class="btn" id="retry">Reintentar</button></div>`; };
export const clearResults = () => { results().innerHTML = ''; };
export function appendCards(items) { results().insertAdjacentHTML('beforeend', items.map(cardHtml).join('')); hydrate(results()); }
export function appendGroup(title, items) { results().insertAdjacentHTML('beforeend', `<div class="rhead">${esc(title)}</div>` + items.map(cardHtml).join('')); hydrate(results()); }
export const appendNote = text => results().insertAdjacentHTML('beforeend', `<div class="rnote">${esc(text)}</div>`);
export const setStatus = html => { $('#more').innerHTML = `<div class="spin">${html}</div>`; };
export const setMore = label => { $('#more').innerHTML = label ? `<button class="btn ghost" id="loadmore">${label}</button>` : ''; };

export function renderChips(q, genres) {
  const box = $('#gchips'); if (!box) return;
  box.innerHTML = (q ? `<button class="gchip" data-rq="1">“${esc(q)}” ✕</button>` : '') + genres.map(g => `<button class="gchip on" data-rg="${esc(g)}">${esc(g)} ✕</button>`).join('')
    + (genres.length ? '<button class="gchip" data-rall="1">Quitar filtros</button>' : '');
  const b = $('#gbtn'); if (b) b.textContent = genres.length ? `🏷 Géneros (${genres.length})` : '🏷 Géneros';
}
