/* Fuente LeerManhwas (sobre la fábrica genérica) */
import * as P from '../../lib/parsers.js';
import { getDoc, nativeRef } from '../../lib/http.js';
import { generic } from './generic.js';

// LeerManhwas: series en /manhwa/{slug}/ y capítulos en /manhwa/{slug}/capitulo-{n}/ (imágenes en cdn01.leermanhwas.com)
const LM = 'https://leermanhwas.com';
export const leermanhwas = Object.assign(generic({
  id: 'leermanhwas', name: 'LeerManhwas', builtin: true,
  searchUrl: LM + '/buscar?q={q}', sel: { chapter: 'a[href*="/capitulo-"]' }
}), {
  sub: 'leermanhwas.com · la búsqueda no está verificada; pegar enlaces sí funciona',
  hosts: ['leermanhwas.com'], imgHeaders: nativeRef(LM),
  classify(u) {
    if (/^\/manhwa\/[^/]+\/capitulo-/i.test(u.pathname)) return 'chapter';
    if (/^\/manhwa\/[^/]+\/?$/i.test(u.pathname)) return 'series';
    return null;
  }
});
{
  // Los capítulos se ordenan por el número que lleva su enlace (capitulo-20-5 = 20.5) y se descartan los enlaces de otras series
  const gd = leermanhwas.detail;
  leermanhwas.detail = async function (item) {
    const info = await gd.call(this, item);
    let base = '';
    try { base = new URL(item.id).pathname.replace(/\/?$/, '/'); } catch (e) { /* sin ruta */ }
    const seen = new Set(), out = [];
    for (const c of info.chapters || []) {
      let path = '';
      try { path = new URL(c.id).pathname; } catch (e) { continue; }
      const m = path.match(/\/capitulo-(\d+(?:-\d+)?)\/?$/i);
      if (!m || (base && !path.startsWith(base)) || seen.has(path)) continue;
      seen.add(path);
      const num = parseFloat(m[1].replace('-', '.'));
      out.push({ id: c.id, num, title: 'Capítulo ' + num });
    }
    out.sort((a, b) => b.num - a.num);
    info.chapters = out;
    // El título de la página trae el nombre del sitio: "Obra +18 - Manhwa Erótico en Español - LeerManhwas.COM"
    info.title = String(info.title || '').replace(/\s*\+18\s*[-–|].*$/i, '').replace(/\s*[-–|]\s*(?:Manhwa|LeerManhwas).*$/i, '').trim() || info.title;
    return info;
  };
}
{
  const g = leermanhwas.search;
  leermanhwas.search = async (q, page) => {
    if (!q) { // sin texto: lo último publicado en la portada
      const doc = await getDoc(LM + '/');
      const items = P.parseList(doc, LM + '/', {}).filter(it => /\/manhwa\/[^/]+\/?$/.test(it.url)).map(it => ({ src: 'leermanhwas', id: it.url, title: it.title, cover: it.cover }));
      return { items, more: false };
    }
    return g(q, page);
  };
}
