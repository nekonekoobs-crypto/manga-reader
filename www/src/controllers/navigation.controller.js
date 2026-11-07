/* Navegación: pantallas superpuestas con botón atrás, y cambio entre vistas */
import { $, $$ } from '../lib/dom.js';
import { toast } from '../views/toast.view.js';
import { renderDetail } from '../views/detail.view.js';
import { closeReaderView } from '../views/reader.view.js';
import { renderLibrary } from '../views/library.view.js';
import { renderSources } from '../views/sources.view.js';

const stack = [];
export const isOpen = id => stack.includes(id);

export function showOverlay(id) {
  $('#' + id).hidden = false;
  stack.push(id);
  history.pushState({ o: id }, '');
  document.body.classList.add('noscroll');
}
export const goBack = () => history.back();

export function setView(v) {
  $$('.view').forEach(e => e.classList.toggle('active', e.id === 'v-' + v));
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'library') renderLibrary();
  if (v === 'sources') renderSources();
  window.scrollTo(0, 0);
}

// Sin pantallas abiertas, "atrás" vuelve a Explorar y nunca cierra la app: siempre queda una entrada de historial por delante.
function rootBack() {
  const cur = ($('.view.active') || {}).id;
  if (cur && cur !== 'v-explore') setView('explore');
  else toast('Para salir de la app usa el botón de inicio');
  try { history.pushState({ root: 1 }, ''); } catch (e) { /* sin historial */ }
}

export function bindNavigation() {
  window.addEventListener('popstate', () => {
    const id = stack.pop();
    if (!id) { rootBack(); return; }
    $('#' + id).hidden = true;
    if (id === 'reader') { closeReaderView(); if (stack.includes('detail')) renderDetail(); }
    if (!stack.length) document.body.classList.remove('noscroll');
  });
  try { history.replaceState({ base: 1 }, ''); history.pushState({ root: 1 }, ''); } catch (e) { /* sin historial */ }
  $('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setView(b.dataset.v); });
}
