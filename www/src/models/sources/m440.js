/* Fuente M440 (lista de capítulos cifrada con AES) */
import * as P from '../../lib/parsers.js';
import { http, getDoc, nativeRef } from '../../lib/http.js';
import { textOf, metaOf } from '../../lib/html.js';
import { md5, concatBytes, hexBytes, b64Bytes } from '../../lib/md5.js';

// M440 guarda la lista de capítulos cifrada (CryptoJS AES con contraseña, formato {ct, iv, s}) en la variable UsaPoncho
// y su propio script la descifra con una clave fija. Aquí se repite ese descifrado con WebCrypto.
const M4_PASS = 'X^Ib1O*HLVh%3W2t';
async function m4Decrypt(html) {
  const i = html.indexOf('{\\"ct\\":');
  if (i < 0) return null;
  const j = html.indexOf('";', i);
  const o = JSON.parse(JSON.parse('"' + html.slice(i, j) + '"'));
  const pass = new TextEncoder().encode(M4_PASS), salt = o.s ? hexBytes(o.s) : new Uint8Array(0);
  // EVP_BytesToKey (MD5, 1 vuelta): clave de 32 bytes + IV de 16
  let d = new Uint8Array(0), kd = new Uint8Array(0);
  while (kd.length < 48) { d = md5(concatBytes(d, pass, salt)); kd = concatBytes(kd, d); }
  const key = await crypto.subtle.importKey('raw', kd.slice(0, 32), 'AES-CBC', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: kd.slice(32, 48) }, key, b64Bytes(o.ct));
  let v = new TextDecoder().decode(plain);
  for (let k = 0; k < 3 && typeof v === 'string'; k++) v = JSON.parse(v);
  return Array.isArray(v) ? v : null;
}

// m440.in (lector con búsqueda JSON, series en /manga/{slug} y capítulos en /manga/{slug}/{n}-{id})
const M4 = 'https://m440.in';
export const m440 = {
  id: 'm440', name: 'M440', builtin: true, cfg: { sel: {} },
  sub: 'm440.in · búsqueda, serie, capítulos y lector probados con datos reales',
  hosts: ['m440.in'], imgHeaders: nativeRef(M4),
  classify(u) {
    const seg = u.pathname.split('/').filter(Boolean);
    if (seg[0] !== 'manga') return null;
    return seg.length === 2 ? 'series' : seg.length >= 3 ? 'chapter' : null;
  },
  async search(q, page) {
    const slugOf = h => { const m = String(h).match(/\/manga\/([^/?#]+)\/?$/); return m ? m[1] : ''; };
    const mk = (slug, title) => ({ src: 'm440', id: `${M4}/manga/${slug}`, title: title || slug, cover: `${M4}/uploads/manga/${slug}/cover/cover_250x350.jpg` });
    if (q) {
      // El buscador del sitio es un autocompletado: GET /search?q=texto -> [{value: título, data: slug}]
      if (page) return { items: [], more: false };
      const j = await http(`${M4}/search?q=${encodeURIComponent(q)}`, 'json', { 'X-Requested-With': 'XMLHttpRequest' });
      const arr = Array.isArray(j) ? j : (j.suggestions || j.data || []);
      return { items: arr.filter(x => x && x.data).map(x => mk(x.data, x.value || x.label)), more: false };
    }
    // Sin texto: lista general de mangas (si no hay, la portada)
    let doc;
    try { doc = await getDoc(`${M4}/manga-list${page ? '?page=' + (page + 1) : ''}`); } catch (e) { doc = null; }
    const seen = new Set(), items = [];
    const scan = d => d && d.querySelectorAll('a[href*="/manga/"]').forEach(a => {
      const slug = slugOf(P.abs(a.getAttribute('href'), M4));
      if (!slug || seen.has(slug)) return;
      const t = P.clean(a.getAttribute('title') || a.getAttribute('alt') || a.textContent);
      if (!t) return;
      seen.add(slug); items.push(mk(slug, t));
    });
    scan(doc);
    if (!items.length && !page) scan(await getDoc(M4 + '/'));
    return { items, more: items.length >= 20 };
  },
  async detail(item) {
    const doc = await getDoc(item.id);
    const slug = item.id.split(/[?#]/)[0].replace(/\/$/, '').split('/').pop();
    // El <title> es "Nombre - M440.in"; el h2 de la página dice "Nombre Capítulos:", así que no sirve
    const title = P.clean((doc.title || '').replace(/\s*-\s*M440\.in\s*$/i, '')) || item.title;
    const desc = textOf(doc, ['.well p:not(:empty)', '.well']).replace(/^Sinopsis\s*/i, '') || metaOf(doc, 'og:description');
    const tags = [...doc.querySelectorAll('.tag-links a, a[href*="/manga-list/category/"]')].map(a => P.clean(a.textContent)).filter(Boolean);
    // La lista completa la dibuja el sitio con JavaScript. Se toma de lo que venga en el HTML:
    // enlaces /manga/{slug}/{n}-{id} (botones y lista) y objetos JSON con "slug":"{n}-{id}".
    const found = new Map();
    const add = (cs, num, name) => {
      if (!cs || found.has(cs)) return;
      const n = parseFloat(num != null && num !== '' ? num : cs.replace('_', '.'));
      found.set(cs, { id: `${M4}/manga/${slug}/${cs}`, num: isNaN(n) ? 0 : n, title: 'Cap. ' + (isNaN(n) ? cs : n) + (name && !/^cap[ií]tulo\s*[\d.]+$/i.test(name) ? ' — ' + name : '') });
    };
    doc.querySelectorAll('a[href*="/manga/"]').forEach(a => {
      const m = (a.getAttribute('href') || '').match(new RegExp('/manga/' + slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/(\\d+(?:[._]\\d+)?-[a-z0-9]+)/?$'));
      if (m) add(m[1], null, P.clean((a.querySelector('em') || {}).textContent || ''));
    });
    // La lista completa viene como JSON en una variable del HTML: {"id":..,"slug":"41_6-ueyko","name":"..","number":"41.6",...}
    try {
      const list = await m4Decrypt(doc.__html || '');
      (list || []).forEach(o => add(o.slug, o.number, o.name));
    } catch (e) { /* si cambian el cifrado, se usa lo que traiga el HTML */ }
    for (const m of (doc.__html || '').matchAll(/"slug":"(\d+(?:_\d+)?-[a-z0-9]+)","name":"((?:[^"\\]|\\.)*)","number":"([^"]*)"/g)) {
      let nm = m[2];
      try { nm = JSON.parse('"' + m[2] + '"'); } catch (e) { /* se deja tal cual */ }
      add(m[1], m[3], nm);
    }
    const chapters = [...found.values()].sort((x, y) => y.num - x.num);
    return { title, cover: `${M4}/uploads/manga/${slug}/cover/cover_250x350.jpg`, desc, tags, chapters };
  },
  async pages(ch) {
    // Los enlaces de lectura terminan en /{página}; la página del capítulo trae todas las imágenes
    const url = ch.id.replace(/(\/manga\/[^/]+\/[^/]+)\/\d+$/, '$1');
    const doc = await getDoc(url);
    let urls = P.readerImages(doc, url, { image: '#all img, .viewer-cnt img' });
    if (urls.length < 2) urls = P.readerImages(doc, ch.id, {});
    return urls;
  }
};
