/* Fuente LectorXD (la lista de capítulos viene dentro de un componente Astro) */
import * as P from '../../lib/parsers.js';
import { http, getDoc, nativeRef } from '../../lib/http.js';
import { textOf, metaOf } from '../../lib/html.js';

/* ---------------- LectorXD ----------------
   Series: /{tipo}/{slug}; capítulos: /{tipo}/{slug}/leer/{n}; portadas e imágenes en s1.cdnlxd.xyz.
   La lista completa de capítulos viene dentro de un componente de la página (ChapterList) en formato Astro. */
const LX = 'https://lectorxd.com';
const LX_TYPES = 'manga|manhwa|manhua|novela|one_shot';
const LX_SERIES = new RegExp('^/(' + LX_TYPES + ')/([^/]+)/?$');
const lxCover = slug => `https://s1.cdnlxd.xyz/manga/covers/${slug}.webp`;
const lxPretty = slug => slug.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
const LX_STATUS = { en_emision: 'En emisión', publicandose: 'En emisión', finalizado: 'Finalizado', completado: 'Finalizado', pausado: 'En pausa', hiatus: 'En pausa', cancelado: 'Cancelado' };
// Formato de props de Astro: [0, valor] = valor simple, [1, [...]] = lista
const astroDec = v => {
  if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number') return v[0] === 1 ? v[1].map(astroDec) : astroDec(v[1]);
  if (v && typeof v === 'object' && !Array.isArray(v)) { const o = {}; for (const k in v) o[k] = astroDec(v[k]); return o; }
  return v;
};
function lxCards(doc, base) {
  const seen = new Map();
  doc.querySelectorAll('a[href]').forEach(a => {
    let path; try { path = new URL(a.getAttribute('href'), base).pathname; } catch (e) { return; }
    const m = path.match(LX_SERIES); if (!m) return;
    const id = `${LX}/${m[1]}/${m[2]}`;
    const img = a.querySelector('img');
    const title = P.clean((a.querySelector('h3') && (a.querySelector('h3').getAttribute('title') || a.querySelector('h3').textContent)) || a.getAttribute('title') || (img && img.getAttribute('alt')) || a.textContent);
    const prev = seen.get(id);
    if (!prev) seen.set(id, { src: 'lectorxd', id, title: title || '', cover: lxCover(m[2]), slug: m[2] });
    else if (!prev.title && title) prev.title = title;
  });
  return [...seen.values()].map(it => Object.assign(it, { title: it.title || lxPretty(it.slug) }));
}
const lxJsonItems = j => {
  const arr = Array.isArray(j) ? j : (j && (j.data || j.results || j.mangas || j.items || j.series)) || [];
  return (Array.isArray(arr) ? arr : []).map(m => {
    if (!m) return null;
    let type = m.type || m.contentType || m.tipo, slug = m.slug;
    const u = m.url || m.path || m.href;
    if (u) { const mm = String(u).replace(LX, '').match(LX_SERIES); if (mm) { type = mm[1]; slug = mm[2]; } }
    if (!slug) return null;
    return { src: 'lectorxd', id: `${LX}/${String(type || 'manga').toLowerCase()}/${slug}`, title: m.title || m.name || m.titulo || lxPretty(slug), cover: lxCover(slug), slug };
  }).filter(Boolean);
};
let lxSearchMode = null; // se recuerda qué forma de búsqueda funcionó
export const lectorxd = {
  id: 'lectorxd', name: 'LectorXD', builtin: true, cfg: { sel: {} },
  sub: 'lectorxd.com · serie, capítulos y lector probados con su HTML; catálogo y búsqueda por confirmar',
  hosts: ['lectorxd.com', 'www.lectorxd.com'], imgHeaders: nativeRef(LX),
  classify(u) {
    if (new RegExp('^/(' + LX_TYPES + ')/[^/]+/leer/[^/]+').test(u.pathname)) return 'chapter';
    if (LX_SERIES.test(u.pathname)) return 'series';
    return null;
  },
  async search(q, page) {
    if (!q) {
      let items = [];
      try { items = lxCards(await getDoc(`${LX}/catalogo?sort=updated${page ? '&page=' + (page + 1) : ''}`), LX); } catch (e) { /* se prueba la portada */ }
      if (!items.length && !page) items = lxCards(await getDoc(LX + '/'), LX);
      return { items, more: items.length > 0 };
    }
    const enc = encodeURIComponent(q), pg = page + 1;
    const tries = [
      { k: 'api-q', url: `${LX}/api/mangas/search?q=${enc}&page=${pg}`, json: true },
      { k: 'api-query', url: `${LX}/api/mangas/search?query=${enc}&page=${pg}`, json: true },
      { k: 'cat-search', url: `${LX}/catalogo?search=${enc}&page=${pg}` },
      { k: 'cat-q', url: `${LX}/catalogo?q=${enc}&page=${pg}` },
      { k: 'cat-title', url: `${LX}/catalogo?title=${enc}&page=${pg}` }
    ];
    const order = lxSearchMode ? tries.filter(t => t.k === lxSearchMode).concat(tries.filter(t => t.k !== lxSearchMode)) : tries;
    let base = null;
    for (const t of order) {
      try {
        let items;
        if (t.json) items = lxJsonItems(await http(t.url, 'json'));
        else {
          items = lxCards(await getDoc(t.url), LX);
          // Si la página ignora el parámetro devuelve el catálogo normal: se descarta
          if (items.length && lxSearchMode !== t.k) {
            if (!base) base = lxCards(await getDoc(`${LX}/catalogo${page ? '?page=' + pg : ''}`), LX).map(x => x.id).join('|');
            if (items.map(x => x.id).join('|') === base) items = [];
          }
        }
        if (items.length) { lxSearchMode = t.k; return { items, more: items.length >= 12 }; }
        if (lxSearchMode === t.k && page) return { items: [], more: false };
      } catch (e) { /* siguiente intento */ }
    }
    // Último recurso: filtrar por título las primeras páginas del catálogo
    const norm = x => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const words = norm(q).split(/\s+/).filter(Boolean);
    const out = [], seen = new Set();
    for (let p = 1; p <= 3; p++) {
      let list = []; try { list = lxCards(await getDoc(`${LX}/catalogo?sort=updated&page=${p}`), LX); } catch (e) { /* ignorar */ }
      list.forEach(it => { if (!seen.has(it.id) && words.every(w => norm(it.title).includes(w))) { seen.add(it.id); out.push(it); } });
    }
    return { items: page ? [] : out, more: false };
  },
  async detail(item) {
    const doc = await getDoc(item.id);
    const m = new URL(item.id).pathname.match(LX_SERIES) || [];
    const type = m[1] || 'manga', slug = m[2] || '';
    let data = {}, chs = [];
    const isl = doc.querySelector('astro-island[component-url*="ChapterList"]');
    if (isl) { try { data = astroDec(JSON.parse(isl.getAttribute('props'))); chs = data.chapters || []; } catch (e) { /* se usa el respaldo */ } }
    const seen = new Set(), chapters = [];
    chs.forEach(c => {
      if (!c || c.chapter == null || c.isVisible === false || seen.has(String(c.chapter))) return;
      seen.add(String(c.chapter));
      const num = parseFloat(c.chapter);
      chapters.push({ id: `${LX}/${type}/${slug}/leer/${c.chapter}`, num: isNaN(num) ? 0 : num, title: 'Capítulo ' + c.chapter + (c.title ? ' · ' + c.title : '') });
    });
    if (!chapters.length) {
      doc.querySelectorAll('a[href*="/leer/"]').forEach(a => {
        const href = P.abs(a.getAttribute('href'), LX); const n = (href.match(/\/leer\/([^/?#]+)/) || [])[1];
        if (!n || seen.has(n)) return; seen.add(n);
        chapters.push({ id: href, num: parseFloat(n) || 0, title: 'Capítulo ' + n });
      });
    }
    chapters.sort((x, y) => y.num - x.num);
    const title = textOf(doc, ['h1']) || data.mangaTitle || item.title;
    const cover = metaOf(doc, 'og:image') || item.cover || lxCover(slug);
    const md = metaOf(doc, 'description');
    const sm = md.match(/Sinopsis:\s*([\s\S]*?)\s*G[ée]neros:\s*([\s\S]*?)\.\s*Lista de/i);
    const desc = sm ? sm[1].replace(/\.{2,}$/, '…') : '';
    const tags = [type.charAt(0).toUpperCase() + type.slice(1)].concat(sm ? sm[2].split(',').map(t => t.trim()).filter(Boolean) : []);
    const st = String(data.mangaStatus || '');
    return { title, cover, desc, tags, status: LX_STATUS[st] || st.replace(/_/g, ' '), chapters };
  },
  async pages(ch) {
    const doc = await getDoc(ch.id);
    let urls = P.readerImages(doc, ch.id, { image: 'img.page-image' }).filter(u => !/^data:/.test(u));
    if (!urls.length) urls = [...new Set((doc.__html.match(/https?:\/\/[^"'\s<>)]*cdnlxd\.xyz\/\d+\/[^"'\s<>)]+?\.(?:jpe?g|png|webp)/gi) || []))];
    return urls;
  }
};
