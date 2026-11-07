/* Fuente TMOHentai (+18). Muestra todas las obras sin filtrar por menores */
import * as P from '../../lib/parsers.js';
import { http, getDoc, nativeRef } from '../../lib/http.js';
import { textOf, metaOf } from '../../lib/html.js';

// TMOHentai: el listado viene como HTML (a veces dentro de {"html": ...}); cada obra se identifica por su número.
const TH = 'https://tmohentai.app';
const thId = u => (String(u).match(/\/(?:library\/[^/]+|manga|view_uploads)\/(\d+)/) || [])[1] || '';
export const tmohentai = {
  id: 'tmohentai', name: 'TMOHentai (+18)', builtin: true, adult: true, cfg: { sel: {} },
  sub: 'tmohentai.app · listado, detalle y lector probados con HTML real',
  hosts: ['tmohentai.app'], imgHeaders: nativeRef(TH),
  classify(u) {
    if (/^\/library\/[^/]+\/\d+/.test(u.pathname)) return 'series';
    if (/^\/(manga|view_uploads)\/\d+/.test(u.pathname)) return 'chapter';
    return null;
  },
  async search(q, page) {
    const url = `${TH}/?title=${encodeURIComponent(q || '')}&_=${Date.now()}&page=${page + 1}`;
    const r = await fetch(url, { headers: { Accept: 'application/json, text/html, */*', 'X-Requested-With': 'XMLHttpRequest' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    let body = await r.text();
    try { const j = JSON.parse(body); if (j && j.html) body = j.html; } catch (e) { /* ya era HTML */ }
    const doc = new DOMParser().parseFromString(body, 'text/html');
    const total = parseInt(((doc.querySelector('[data-total]') || {}).dataset || {}).total, 10);
    const items = [];
    for (const a of doc.querySelectorAll('a.manga-card')) {
      const title = P.clean((a.querySelector('.manga-card__title') || {}).textContent || a.getAttribute('title'));
      const pg = parseInt(P.clean(((a.querySelector('.manga-card__stat--chapters span:last-child') || {}).textContent) || ''), 10);
      items.push({ src: 'tmohentai', id: P.abs(a.getAttribute('href'), TH), title, cover: P.imgSrc(a.querySelector('img.manga-card__cover, img'), TH), n: pg || 0 });
    }
    return { items, more: isNaN(total) ? items.length >= 20 : (page + 1) * 24 < total };
  },
  async detail(item) {
    const num = thId(item.id);
    const doc = await getDoc(item.id);
    const tags = [...new Set([...doc.querySelectorAll('a[href*="/tag/"]')].map(a => P.clean(a.textContent)).filter(t => t && t.length < 40))].slice(0, 12);
    const title = textOf(doc, ['#md-title', 'h1']) || item.title;
    const desc = (metaOf(doc, 'og:description') || metaOf(doc, 'description')).replace(/^Lee .*? en línea gratis\.\s*/i, '');
    const cover = P.imgSrc(doc.querySelector('#md-cover'), TH) || item.cover || `https://storage.tmohentai.app/mangas/${num}/1.webp`;
    const total = parseInt(((doc.querySelector('#md-preview-grid') || {}).dataset || {}).total, 10) || parseInt(item.n, 10) || 0;
    // Cada obra se lee como un solo capítulo (/view_uploads/{id}); data-total es su número de páginas
    return { title, cover, desc, tags, status: /ongoing/i.test(doc.body.textContent) ? 'ongoing' : '', chapters: [{ id: `${TH}/view_uploads/${num}`, title: 'Leer' + (total ? ` (${total} páginas)` : ''), num: total }] };
  },
  async pages(ch) {
    const num = thId(ch.id);
    const rx = new RegExp(`https?:\\\\?/\\\\?/storage\\.tmohentai\\.app\\\\?/mangas\\\\?/${num}\\\\?/[^"'\\s<>\\\$$]+?\\.(?:webp|jpe?g|png)`, 'gi');
    const pn = u => { const m = u.match(/\/(\d+)\.\w+$/); return m ? parseInt(m[1], 10) : 0; };
    const norm = t => [...new Set((t.match(rx) || []).map(u => u.replace(/\\\//g, '/')))].sort((a, b) => pn(a) - pn(b));
    let urls = [];
    try { urls = norm(await http(ch.id, 'text')); } catch (e) { /* probar el siguiente método */ }
    if (urls.length < 2) {
      try {
        const all = [];
        for (let off = 0; off < 600; off += 100) {
          const t = await http(`${TH}/api/manga/${num}/preview-pages?offset=${off}&limit=100`, 'text');
          const got = norm(t).filter(u => !all.includes(u));
          if (!got.length) break;
          all.push(...got);
        }
        if (all.length > urls.length) urls = all;
      } catch (e) { /* sin API */ }
    }
    if (urls.length < 2 && ch.num > 1) urls = Array.from({ length: ch.num }, (_, i) => `https://storage.tmohentai.app/mangas/${num}/${i + 1}.webp`);
    return urls;
  }
};
