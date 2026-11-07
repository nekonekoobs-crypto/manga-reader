/* Vista del selector de géneros (hoja inferior) */
import { esc } from '../lib/dom.js';
import { GENRES } from '../models/genres/catalog.js';

export function createGenreSheet() {
  const el = document.createElement('div');
  el.id = 'gsheet'; el.className = 'tsheet'; el.hidden = true;
  document.body.appendChild(el);
  return el;
}
export const genreSheetHtml = sel => `<div class="tbox"><h3>Filtrar por géneros</h3>
    <p class="hint">Se muestran las series que tengan <b>todos</b> los géneros marcados. MangaDex filtra directo; en las demás fuentes la app revisa la ficha de cada serie (la primera vez tarda más; luego queda guardado).</p>
    <div class="gwrap">${GENRES.map(g => g[0]).concat(sel.filter(x => !GENRES.some(g => g[0] === x))).map(n => `<button class="gchip gc ${sel.includes(n) ? 'on' : ''}" data-g="${esc(n)}">${esc(n)}</button>`).join('')}</div>
    <div class="row"><input id="g-custom" placeholder="Otra etiqueta o género…" autocapitalize="none"><button class="btn ghost" id="g-add" type="button">Añadir</button></div>
    <div class="trow"><button class="btn" id="g-apply">Aplicar</button><button class="btn ghost" id="g-clear">Limpiar</button></div></div>`;
