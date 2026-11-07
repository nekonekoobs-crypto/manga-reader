/* Detalle de la serie: abrir, favoritos, descripción, orden de capítulos */
import { $ } from '../lib/dom.js';
import { cache } from '../models/state.js';
import { V } from '../models/session.js';
import { startSeries } from '../models/series.model.js';
import { toggleFav } from '../models/library.model.js';
import { toast } from '../views/toast.view.js';
import { renderDetail } from '../views/detail.view.js';
import { showOverlay, goBack, isOpen } from './navigation.controller.js';
import { openReaderWith } from './reader.controller.js';

export async function openDetail(item) {
  const { D, done } = startSeries(item);
  showOverlay('detail');
  renderDetail();
  await done;
  if (V.D !== D) return;
  if (isOpen('detail')) renderDetail();
}

function openDetailRetry() {
  const item = V.D.item;
  goBack();
  setTimeout(() => openDetail(item), 60);
}

export function bindDetail() {
  document.addEventListener('click', e => {
    const t = e.target, D = V.D;
    const card = t.closest('[data-k]');
    if (card && cache[card.dataset.k]) { openDetail(cache[card.dataset.k]); return; }
    if (t.closest('#d-retry')) { openDetailRetry(); return; }
    if (t.closest('#d-more')) { D.full = !D.full; renderDetail(); return; }
    if (t.closest('#d-order')) { D.asc = !D.asc; renderDetail(); return; }
    const op = t.closest('[data-open]');
    if (op && D) openReaderWith(D.item, D.src, D.chapters, +op.dataset.open);
  });
  $('#d-back').addEventListener('click', goBack);
  $('#d-fav').addEventListener('click', () => {
    if (!V.D) return;
    toast(toggleFav(V.D.item) ? 'Añadido a favoritos' : 'Quitado de favoritos');
    renderDetail();
  });
}
