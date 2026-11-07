/* Fuente ManhwaWeb (API propia del sitio) */
import { S } from '../state.js';
import { http } from '../../lib/http.js';

export const MW = 'https://api.manhwaweb.com';
export const MW_H = { Referer: 'https://manhwaweb.com/', Origin: 'https://manhwaweb.com' };
const NON_ASCII = /[^\x00-\x7F]/;
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
// El sitio guarda el título en dos campos; se prefiere el que conserva los acentos.
const mwTitle = m => {
  const a = m.name_esp || '', b = m.the_real_name || '';
  return (NON_ASCII.test(b) && !NON_ASCII.test(a) ? b : (a || b)) || 'Sin título';
};
const mwItem = m => ({ src: 'manhwaweb', id: m._id, title: mwTitle(m), cover: m._imagen || '' });

export const manhwaweb = {
  id: 'manhwaweb', name: 'ManhwaWeb', builtin: true,
  async search(q, page) {
    const p = new URLSearchParams({
      buscar: q || '', estado: '', tipo: '', erotico: S.set.adult ? '' : 'no', demografia: '',
      order_item: q ? 'alfabetico' : 'creacion', order_dir: 'desc', page: String(page), generes: ''
    });
    const j = await http(`${MW}/manhwa/library?${p}`, 'json', MW_H);
    return { items: (j.data || []).map(mwItem), more: !!j.next };
  },
  async detail(item) {
    const j = await http(`${MW}/manhwa/see/${encodeURIComponent(item.id)}`, 'json', MW_H);
    const genres = (j._categoris || []).map(o => Object.values(o || {})[0]).filter(Boolean);
    const tags = [cap(j._tipo), cap(j._demografi)].concat(genres).filter(Boolean);
    if (j._erotico === 'si') tags.push('+18');
    const chapters = [];
    for (const c of j.chapters || []) {
      for (const v of c.versions || []) {
        // El enlace termina en /leer/{id-del-capítulo}; ese id es el que pide la API de páginas.
        const id = String(v.link || '').split('/leer/')[1];
        if (!id) continue;
        const group = v.joint && v.joint[0] && v.joint[0].name;
        chapters.push({ id, num: parseFloat(c.chapter), title: `Cap. ${c.chapter}`, lang: group || '' });
      }
    }
    chapters.sort((a, b) => (b.num || 0) - (a.num || 0));
    return {
      title: mwTitle(j), cover: j._imagen || item.cover, tags, status: j._status, chapters,
      desc: String(j._sinopsis || '').replace(/<[^>]*>/g, '').trim()
    };
  },
  async pages(ch) {
    const j = await http(`${MW}/chapters/see/${encodeURIComponent(ch.id)}`, 'json', MW_H);
    return (j.chapter && j.chapter.img) || [];
  }
};
// Las imágenes de este sitio exigen Referer y Origin
manhwaweb.imgHeaders = MW_H;
