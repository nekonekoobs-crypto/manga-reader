/* Biblioteca: quitar elementos del historial y de favoritos */
import { removeHistory, removeFavorite } from '../models/library.model.js';
import { renderLibrary } from '../views/library.view.js';

export function bindLibrary() {
  document.addEventListener('click', e => {
    const rh = e.target.closest('[data-rmh]');
    if (rh) { if (confirm('¿Quitar de «Continuar leyendo»?')) { removeHistory(rh.dataset.rmh); renderLibrary(); } return; }
    const rf = e.target.closest('[data-rmf]');
    if (rf && confirm('¿Quitar de favoritos?')) { removeFavorite(rf.dataset.rmf); renderLibrary(); }
  });
}
