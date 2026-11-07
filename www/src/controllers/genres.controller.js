/* Filtro de géneros: hoja de selección y chips de filtros activos */
import { $ } from '../lib/dom.js';
import { S } from '../models/state.js';
import { SR } from '../models/session.js';
import { createGenreSheet, genreSheetHtml } from '../views/genres.view.js';
import { showOverlay, goBack } from './navigation.controller.js';
import { runSearch, refreshChips } from './explore.controller.js';

export function bindGenres() {
  const sheet = createGenreSheet();
  let tmp = [];
  const redraw = () => { sheet.innerHTML = genreSheetHtml(tmp); };
  const open = () => { tmp = S.genres.slice(); redraw(); showOverlay('gsheet'); };
  const apply = () => { S.genres = tmp.slice(); goBack(); refreshChips(); runSearch(true, SR.q); };

  sheet.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) { if (e.target === sheet) goBack(); return; }
    if (t.dataset.g) { const n = t.dataset.g; tmp = tmp.includes(n) ? tmp.filter(x => x !== n) : tmp.concat(n); t.classList.toggle('on'); }
    if (t.id === 'g-add') { const v = $('#g-custom').value.trim(); if (v && !tmp.includes(v)) { tmp.push(v); redraw(); } }
    if (t.id === 'g-clear') { tmp = []; redraw(); }
    if (t.id === 'g-apply') apply();
  });
  const gb = $('#gbtn'); if (gb) gb.addEventListener('click', open);
  const gc = $('#gchips');
  if (gc) gc.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.rg) S.genres = S.genres.filter(x => x !== t.dataset.rg);
    else if (t.dataset.rall) { S.genres = []; SR.q = ''; }
    else if (t.dataset.rq) SR.q = '';
    refreshChips(); runSearch(true, SR.q);
  });
  refreshChips();
}
