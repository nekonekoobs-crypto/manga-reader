/* Lector en cascada: abrir capítulo, avanzar, opciones y eventos de las páginas */
import { $ } from '../lib/dom.js';
import { V } from '../models/session.js';
import { markRead } from '../models/library.model.js';
import { setOption } from '../models/settings.model.js';
import * as R_ from '../views/reader.view.js';
import { showOverlay, goBack } from './navigation.controller.js';

export function openReaderWith(item, src, chapters, idx) {
  V.R = { item, src, chapters, idx, token: 0 };
  R_.showBars();
  R_.applyReaderOpts();
  showOverlay('reader');
  loadChapter(idx);
}

export async function loadChapter(idx) {
  const R = V.R;
  R.idx = idx;
  const my = ++R.token;
  const ch = R.chapters[idx];
  R_.showChapterStart(R, ch, idx);
  try {
    const urls = ch.urls || await R.src.pages(ch);
    if (my !== R.token) return;
    if (!urls.length) throw new Error('Este capítulo no tiene imágenes disponibles.');
    const native = R_.renderPages(R, urls);
    if (native) R_.loadPagesNative(R, my);
    R_.renderEnd(R);
    R_.updateProg();
    markRead(R.item, ch);
  } catch (e) {
    if (my !== R.token) return;
    R_.showChapterError(e.message || String(e));
  }
}

function stepChapter(d) {
  const R = V.R, n = R.idx + d;
  if (n < 0 || n >= R.chapters.length) return;
  loadChapter(n);
}

export function bindReader() {
  document.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('#r-retry')) { loadChapter(V.R.idx); return; }
    if (t.closest('#e-next')) { stepChapter(-1); return; }
    if (t.closest('#e-back')) goBack();
  });
  $('#r-back').addEventListener('click', goBack);
  $('#r-set').addEventListener('click', R_.togglePanel);
  $('#r-prev').addEventListener('click', () => stepChapter(1));
  $('#r-next').addEventListener('click', () => stepChapter(-1));
  $('#r-top').addEventListener('click', () => R_.scrollTop(true));

  const pages = $('#rpages');
  // Tocar la página muestra/oculta las barras
  pages.addEventListener('click', e => {
    if (e.target.classList.contains('bad')) return;
    R_.hidePanel();
    R_.toggleBars();
  });
  // Cargada / error de cada página
  pages.addEventListener('load', e => { if (e.target.classList.contains('pg')) { e.target.classList.remove('bad'); e.target.classList.add('ok'); } }, true);
  pages.addEventListener('error', e => { if (e.target.classList.contains('pg')) e.target.classList.add('bad'); }, true);
  // Tocar una página rota la reintenta
  pages.addEventListener('click', e => {
    const im = e.target;
    if (im.classList && im.classList.contains('bad')) R_.retryPage(im, V.R.item.src);
  });
  let raf = 0;
  $('#rscroll').addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; R_.updateProg(); });
  }, { passive: true });

  // Opciones del lector
  $('#o-gap').addEventListener('change', e => { setOption('gap', e.target.checked); R_.applyReaderOpts(); });
  $('#o-narrow').addEventListener('change', e => { setOption('narrow', e.target.checked); R_.applyReaderOpts(); });
  $('#o-saver').addEventListener('change', e => {
    setOption('saver', e.target.checked); R_.applyReaderOpts();
    if (V.R && V.R.src.id === 'mangadex') loadChapter(V.R.idx);
  });
}
