/* Abrir enlaces pegados: series y capítulos de fuentes conocidas o de cualquier web */
import { S } from '../models/state.js';
import { PRESETS, allSources, srcById, webSource } from '../models/sources/index.js';
import { V } from '../models/session.js';
import { getDoc } from '../lib/http.js';
import * as P from '../lib/parsers.js';
import { toast } from '../views/toast.view.js';
import { openDetail } from './detail.controller.js';
import { openReaderWith } from './reader.controller.js';

// Enlaces de manhwaweb.com: /leer/<serie>-<capítulo> abre la serie directamente en ese capítulo.
async function openManhwaweb(u) {
  const m = u.pathname.match(/\/leer\/([^/?#]+)/);
  let id, slug = null;
  if (m) {
    slug = decodeURIComponent(m[1]);
    const mm = slug.match(/^(.*)-([\d.]+_\d+)$/);
    id = mm ? mm[1] : slug;
  } else {
    id = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
  }
  if (!id) { toast('No reconocí ese enlace de ManhwaWeb'); return; }
  await openDetail({ src: 'manhwaweb', id, title: id, cover: '' });
  const D = V.D;
  if (slug && D && D.chapters.length) {
    const idx = D.chapters.findIndex(c => c.id === slug);
    if (idx >= 0) openReaderWith(D.item, D.src, D.chapters, idx);
  }
}

export async function openUrl(url) {
  let u;
  try { u = new URL(url); } catch (e) { toast('Enlace no válido'); return; }
  if (/(^|\.)manhwaweb\.com$/i.test(u.hostname)) { openManhwaweb(u).catch(e => toast('Error: ' + (e.message || e))); return; }
  const known = PRESETS.find(p => p.hosts.some(h => u.hostname.replace(/^www\./, '') === h || u.hostname.endsWith('.' + h)));
  if (known) {
    if (known.adult && !S.set.adult) { toast('Activa el contenido +18 en Ajustes para abrir este enlace'); return; }
    const kind = known.classify(u);
    if (kind === 'series') { openDetail({ src: known.id, id: known.seriesId ? known.seriesId(u) : u.href, title: 'Cargando…', cover: '' }); return; }
    if (kind === 'chapter') { openReaderWith({ src: known.id, id: u.href, title: u.pathname.split('/').filter(Boolean)[1] || known.name, cover: '' }, known, [{ id: u.href, title: 'Capítulo' }], 0); return; }
  }
  const hostOf = h => String(h || '').replace(/^www\./, '');
  const byHost = allSources().find(s => !s.builtin && s.cfg && s.cfg.site && hostOf(new URL(s.cfg.site).hostname) === hostOf(u.hostname));
  const cur = byHost || srcById(S.current);
  const src = byHost || ((cur.cfg && !cur.builtin && !cur.hosts) || cur.id === 'web' ? cur : webSource);
  toast('Analizando página…');
  try {
    const doc = await getDoc(url);
    const sel = src.cfg.sel || {};
    const chs = P.parseChapters(doc, url, sel);
    const h1 = doc.querySelector('h1');
    const title = (doc.title && P.clean(doc.title)) || (h1 && P.clean(h1.textContent)) || url;
    const urls = P.readerImages(doc, url, sel);
    const asReader = () => {
      const item = { src: src.id, id: url, title, cover: urls[0] };
      openReaderWith(item, src, [{ id: url, title: 'Capítulo', urls }], 0);
    };
    const asDetail = () => openDetail({ src: src.id, id: url, title, cover: '' });
    // ¿Es un capítulo o una serie? Se decide por la URL, los enlaces y la cantidad de imágenes.
    if (P.looksLikeChapterUrl(url) && urls.length >= 2) return asReader();
    if (chs.length >= 8) return asDetail();
    if (urls.length >= 5) return asReader();
    if (chs.length >= 1) return asDetail();
    if (urls.length >= 2) return asReader();
    toast('No encontré capítulos ni imágenes en esa página');
  } catch (e) { toast('Error: ' + (e.message || e)); }
}
