/* Fuente ZonaTMO */
import * as P from '../../lib/parsers.js';
import { http, getDoc, nativeRef } from '../../lib/http.js';
import { textOf, metaOf } from '../../lib/html.js';
import { tidyTitle } from '../../lib/text.js';

// ZonaTMO: series en /library/{tipo}/{id}/{slug}, capítulos en /view_uploads/{id} (imágenes en storage.zonatmo.org)
const ZT = 'https://zonatmo.org';
const ztCover = id => (id ? `${ZT}/storage/covers/${id}.webp?v=2` : '');
const ztNum = u => (String(u).match(/\/library\/[^/]+\/(\d+)\//) || [])[1] || '';
export const zonatmo = {
  id: 'zonatmo', name: 'ZonaTMO', builtin: true, cfg: { sel: {} },
  sub: 'zonatmo.org · serie, capítulos y lector probados con su HTML; la búsqueda no',
  hosts: ['zonatmo.org'], imgHeaders: nativeRef(ZT),
  classify(u) {
    if (/^\/view_uploads\/\d+/.test(u.pathname)) return 'chapter';
    if (/^\/library\/[^/]+\/\d+/.test(u.pathname)) return 'series';
    return null;
  },
  async search(q, page) {
    // Como en TMO original: _pg=1 fijo y page=N para la página (la primera va sin page)
    const url = `${ZT}/biblioteca?_pg=1${q ? '&title=' + encodeURIComponent(q) : ''}${page ? '&page=' + (page + 1) : ''}`;
    let items = [];
    try {
      const doc = await getDoc(url);
      items = P.parseList(doc, url, {}).filter(it => /\/library\/[^/]+\/\d+\//.test(it.url))
        .map(it => ({ src: 'zonatmo', id: it.url, title: it.title, cover: ztCover(ztNum(it.url)) || it.cover }));
    } catch (e) { if (!q) throw e; }
    if (!items.length && q && !page) {
      // Si la página de resultados no se pudo leer, se usan las sugerencias del buscador del sitio
      const j = await http(`${ZT}/api/search/suggest?q=${encodeURIComponent(q)}`, 'json');
      items = (Array.isArray(j) ? j : []).filter(m => m && m.type !== 'author' && /\/library\/[^/]+\/\d+\//.test(m.url || ''))
        .map(m => ({ src: 'zonatmo', id: P.abs(m.url, ZT), title: m.title, cover: m.cover || ztCover(ztNum(m.url)) }));
      return { items, more: false };
    }
    return { items, more: items.length > 0 };
  },
  async detail(item) {
    const doc = await getDoc(item.id);
    const title = textOf(doc, ['h1.element-title', 'h1:not(.book-type)']) || item.title;
    const cover = P.imgSrc(doc.querySelector('img.book-thumbnail'), ZT) || item.cover;
    const desc = textOf(doc, ['#manga-synopsis', '.element-description']) || metaOf(doc, 'og:description');
    const type = textOf(doc, ['h1.book-type']);
    const tags = type ? [type.charAt(0) + type.slice(1).toLowerCase()] : [];
    doc.querySelectorAll('a[href*="/tag/"]').forEach(a => { const t = P.clean(a.textContent); if (t && t.length <= 30 && !tags.includes(t)) tags.push(t); });
    const status = textOf(doc, ['.book-status']);
    const seen = new Set(), chapters = [];
    doc.querySelectorAll('li.upload-link').forEach(li => {
      const a = li.querySelector('a[href*="/view_uploads/"]');
      if (!a) return;
      const id = P.abs(a.getAttribute('href'), ZT);
      const numTxt = li.getAttribute('data-chapter-number') || '';
      const num = parseFloat(numTxt);
      if (!id || seen.has(id)) return;
      seen.add(id);
      chapters.push({ id, num: isNaN(num) ? 0 : num, title: numTxt !== '' ? 'Capítulo ' + numTxt : tidyTitle(textOf(li, ['.chapter-number']) || 'Capítulo') });
    });
    chapters.sort((x, y) => y.num - x.num);
    return { title, cover, desc, tags, status, chapters };
  },
  async pages(ch) {
    const doc = await getDoc(ch.id);
    let urls = P.readerImages(doc, ch.id, { image: 'img.reader-image, #reader-wrap img' });
    if (!urls.length) urls = [...new Set((doc.__html.match(/https?:\/\/storage\.zonatmo\.org\/chapters\/[^"'\s<>)]+/g) || []))];
    return urls;
  }
};
