/* Portadas: <img> normal o marcada para descargarse con la red nativa (hydrate) */
import { $$, esc } from '../lib/dom.js';
import { capHttp, nativeHeaders, srcFor, coverBlobs } from '../services/image-loader.js';

export const coverImg = (url, srcId) => {
  if (!url) return '';
  const native = capHttp() && nativeHeaders(srcId);
  return `<img loading="lazy" referrerpolicy="no-referrer" alt="" ${native ? `data-nsrc="${esc(url)}" data-nsrcid="${esc(srcId)}"` : `src="${esc(url)}"`}>`;
};
const hq = []; let hActive = 0;
function pump() {
  while (hActive < 4 && hq.length) {
    const im = hq.shift(); hActive++;
    srcFor(im.dataset.nsrcid, im.dataset.nsrc, coverBlobs)
      .then(u => { if (im.isConnected) im.src = u; })
      .catch(() => { if (im.isConnected) im.remove(); })
      .finally(() => { hActive--; pump(); });
  }
}
export function hydrate(root) {
  $$('img[data-nsrc]', root || document).forEach(im => { if (!im.dataset.q) { im.dataset.q = '1'; hq.push(im); } });
  pump();
}

// Portadas rotas: se quita la imagen y queda la letra de respaldo
export function bindCoverFallback() {
  document.addEventListener('error', e => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.closest('.cv')) t.remove();
  }, true);
}
