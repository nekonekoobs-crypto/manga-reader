/* Vista Lector en cascada: pintado de páginas, barras y progreso */
import { $, $$, esc } from '../lib/dom.js';
import { S } from '../models/state.js';
import { V } from '../models/session.js';
import { capHttp, nativeHeaders, srcFor, pageBlobs, clearPageBlobs } from '../services/image-loader.js';

export function applyReaderOpts() {
  const rd = $('#reader');
  rd.classList.toggle('gap', S.set.gap);
  rd.classList.toggle('narrow', S.set.narrow);
  $('#o-gap').checked = S.set.gap; $('#o-narrow').checked = S.set.narrow; $('#o-saver').checked = S.set.saver;
}
export const showBars = () => $('#reader').classList.remove('bars-off');
export const toggleBars = () => $('#reader').classList.toggle('bars-off');
export const togglePanel = () => { $('#rpanel').hidden = !$('#rpanel').hidden; };
export const hidePanel = () => { $('#rpanel').hidden = true; };
export const scrollTop = smooth => $('#rscroll').scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });

// Cabecera y estado inicial de un capítulo
export function showChapterStart(R, ch, idx) {
  $('#r-title').textContent = R.item.title;
  $('#r-prog').textContent = ch.title;
  $('#rcount').textContent = '';
  $('#r-prev').disabled = idx + 1 >= R.chapters.length;
  $('#r-next').disabled = idx - 1 < 0;
  $('#rend').innerHTML = '';
  clearPageBlobs();
  $('#rpages').innerHTML = '<div class="spin">Cargando capítulo…</div>';
  $('#rscroll').scrollTop = 0;
}
export const showChapterError = msg => { $('#rpages').innerHTML = `<div class="err"><b>No se pudo cargar el capítulo</b>${esc(msg)}<br><br><button class="btn" id="r-retry">Reintentar</button></div>`; };
export function renderPages(R, urls) {
  const native = !!(capHttp() && nativeHeaders(R.item.src));
  $('#rpages').innerHTML = urls.map((u, i) => `<img class="pg" data-i="${i}" data-u="${esc(u)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="Página ${i + 1}"${native ? '' : ` src="${esc(u)}"`}>`).join('');
  return native;
}
// Descarga las páginas en orden, 4 a la vez, con la red nativa
export function loadPagesNative(R, my) {
  const imgs = $$('#rpages .pg');
  let next = 0;
  const worker = async () => {
    while (next < imgs.length && V.R && V.R.token === my) {
      const im = imgs[next++];
      try { im.src = await srcFor(R.item.src, im.dataset.u, pageBlobs); }
      catch (e) { im.classList.add('bad'); }
    }
  };
  for (let k = 0; k < 4; k++) worker();
}
export function retryPage(im, srcId) {
  im.classList.remove('bad');
  const u = im.dataset.u || im.getAttribute('src');
  im.removeAttribute('src');
  srcFor(srcId, u, pageBlobs)
    .then(s => setTimeout(() => im.setAttribute('src', s), 60))
    .catch(() => im.classList.add('bad'));
}
export function renderEnd(R) {
  const hasNext = R.idx - 1 >= 0;
  $('#rend').innerHTML = `<p>Fin de «${esc(R.chapters[R.idx].title)}»</p>` +
    (hasNext ? '<button class="btn" id="e-next">Siguiente capítulo ›</button>' : '<p>Estás al día 🎉</p>') +
    '<button class="btn ghost" id="e-back">Volver a la serie</button>';
}
export function updateProg() {
  const imgs = $$('#rpages .pg');
  if (!imgs.length) return;
  const lim = window.innerHeight * 0.4;
  let cur = 0;
  for (let i = 0; i < imgs.length; i++) { if (imgs[i].getBoundingClientRect().top <= lim) cur = i; else break; }
  $('#rcount').textContent = `${cur + 1} / ${imgs.length}`;
}
export function closeReaderView() { $('#rpanel').hidden = true; $('#rpages').innerHTML = ''; clearPageBlobs(); }
