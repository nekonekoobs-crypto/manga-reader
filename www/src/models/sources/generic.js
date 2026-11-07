/* Fábrica de fuentes configurables: cualquier web descrita por selectores CSS y plantillas de URL */
import * as P from '../../lib/parsers.js';
import { getDoc, nativeRef } from '../../lib/http.js';
import { tidyTitle } from '../../lib/text.js';

export function generic(cfg) {
  const sel = cfg.sel || {};
  const normT = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const listOf = async (url, mk) => {
    const doc = await getDoc(url);
    let items = P.parseList(doc, url, sel);
    if (cfg.itemPath) { const re = new RegExp(cfg.itemPath); items = items.filter(it => { try { return re.test(new URL(it.url).pathname); } catch (e) { return false; } }); }
    return items.map(it => ({ src: cfg.id, id: it.url, title: it.title, cover: it.cover }));
  };
  const fill = (tpl, q, page) => tpl.replace(/\{q\}/g, encodeURIComponent(q || '')).replace(/\{page\}/g, String(page + 1));
  return {
    id: cfg.id, name: cfg.name, builtin: !!cfg.builtin, cfg, adult: !!cfg.adult,
    imgHeaders: cfg.imgRef && cfg.site ? nativeRef(cfg.site) : undefined,
    async search(q, page) {
      if (q && cfg.searchUrl) {
        const items = await listOf(fill(cfg.searchUrl, q, page));
        return { items, more: /\{page\}/.test(cfg.searchUrl) && items.length > 0 };
      }
      if (!q && cfg.listUrl) {
        const items = await listOf(fill(cfg.listUrl, '', page));
        return { items, more: /\{page\}/.test(cfg.listUrl) && items.length > 0 };
      }
      if (q && cfg.listUrl) {
        // Sin búsqueda por dirección: se filtra por título el listado (primeras páginas)
        if (page) return { items: [], more: false };
        const words = normT(q).split(/\s+/).filter(Boolean), out = [], seen = new Set();
        const n = /\{page\}/.test(cfg.listUrl) ? 3 : 1;
        for (let p = 0; p < n; p++) {
          let l = []; try { l = await listOf(fill(cfg.listUrl, '', p)); } catch (e) { /* ignorar */ }
          l.forEach(it => { if (!seen.has(it.id) && words.every(w => normT(it.title).includes(w))) { seen.add(it.id); out.push(it); } });
        }
        return { items: out, more: false };
      }
      if (!cfg.searchUrl) throw new Error('Esta fuente no tiene búsqueda. Pega el enlace de una serie o capítulo en el buscador.');
      const items = await listOf(fill(cfg.searchUrl, q, page));
      return { items, more: /\{page\}/.test(cfg.searchUrl) && items.length > 0 };
    },
    async detail(item) {
      const doc = await getDoc(item.id);
      const meta = n => { const m = doc.querySelector(`meta[property="${n}"],meta[name="${n}"]`); return m ? P.clean(m.getAttribute('content')) : ''; };
      const txt = s => { const e = s && doc.querySelector(s); return e ? P.clean(e.textContent) : ''; };
      const h1 = doc.querySelector('h1');
      const title = txt(sel.dTitle) || meta('og:title') || (h1 && P.clean(h1.textContent)) || item.title;
      const cover = P.abs(meta('og:image'), item.id) || item.cover;
      const desc = txt(sel.desc) || meta('og:description') || meta('description') || '';
      const chapters = P.parseChapters(doc, item.id, sel);
      chapters.forEach(c => { c.title = tidyTitle(c.title); });
      if (cfg.reverse) chapters.reverse();
      const tags = [];
      doc.querySelectorAll('a[href]').forEach(a => {
        if (!/(genre|genero|g[eé]nero|\/tags?\/|categor|etiqueta)/i.test(a.getAttribute('href') || '')) return;
        const t = P.clean(a.textContent);
        if (t && t.length <= 30 && !tags.includes(t)) tags.push(t);
      });
      return { title, cover, desc, tags: tags.slice(0, 40), chapters };
    },
    async pages(ch) {
      const doc = await getDoc(ch.id);
      return P.readerImages(doc, ch.id, sel);
    }
  };
}
