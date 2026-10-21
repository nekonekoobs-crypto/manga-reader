(() => {
  'use strict';
  const P = window.MR_PARSERS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- Estado y almacenamiento ---------------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('mr:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('mr:' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  };
  const S = {
    sources: store.get('sources', []),
    fav: store.get('fav', []),
    hist: store.get('hist', {}),
    read: store.get('read', {}),
    current: store.get('current', 'manhwaweb'),
    set: Object.assign({ langs: ['es', 'es-la', 'en'], saver: false, adult: false, gap: false, narrow: false }, store.get('settings', {}))
  };
  const save = () => {
    store.set('sources', S.sources); store.set('fav', S.fav); store.set('hist', S.hist);
    store.set('read', S.read); store.set('current', S.current); store.set('settings', S.set);
  };
  const LANGS = [['es', 'Español (España)'], ['es-la', 'Español (Latam)'], ['en', 'Inglés'], ['pt-br', 'Portugués (BR)'], ['fr', 'Francés'], ['it', 'Italiano'], ['de', 'Alemán']];
  const STATUS = {
    ongoing: 'En emisión', completed: 'Finalizado', hiatus: 'En pausa', cancelled: 'Cancelado',
    publicandose: 'En emisión', finalizado: 'Finalizado', pausado: 'En pausa', cancelado: 'Cancelado'
  };

  const keyOf = it => it.src + ':' + it.id;
  const cache = {}; // key -> item, para abrir desde las tarjetas

  let toastT = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
  }

  /* ---------------- Red ---------------- */
  async function http(url, as, extra) {
    const headers = Object.assign({ Accept: as === 'json' ? 'application/json' : 'text/html,*/*' }, extra || {});
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return as === 'json' ? r.json() : r.text();
  }
  async function getDoc(url) {
    const html = await http(url, 'text');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.__html = html;
    return doc;
  }

  /* ---------------- Fuente: MangaDex ---------------- */
  const MD = 'https://api.mangadex.org';
  const pickLang = o => (o && (o.es || o['es-la'] || o.en || Object.values(o)[0])) || '';
  const ratings = () => ['safe', 'suggestive'].concat(S.set.adult ? ['erotica', 'pornographic'] : []);

  function mdItem(m) {
    const a = m.attributes || {};
    const cov = (m.relationships || []).find(r => r.type === 'cover_art');
    const file = cov && cov.attributes && cov.attributes.fileName;
    const alt = (a.altTitles || []).find(t => t.es);
    const title = (a.title && a.title.es) || (alt && alt.es) || pickLang(a.title) || 'Sin título';
    return {
      src: 'mangadex', id: m.id, title,
      cover: file ? `https://uploads.mangadex.org/covers/${m.id}/${file}.256.jpg` : '',
      coverBig: file ? `https://uploads.mangadex.org/covers/${m.id}/${file}.512.jpg` : '',
      desc: pickLang(a.description), tags: (a.tags || []).map(t => t.attributes && t.attributes.name && t.attributes.name.en).filter(Boolean),
      status: a.status, year: a.year
    };
  }

  const mangadex = {
    id: 'mangadex', name: 'MangaDex', builtin: true,
    async search(q, page) {
      const p = new URLSearchParams();
      p.set('limit', '24'); p.set('offset', String(page * 24));
      if (q) p.set('title', q);
      p.append('includes[]', 'cover_art');
      ratings().forEach(r => p.append('contentRating[]', r));
      p.set(q ? 'order[relevance]' : 'order[followedCount]', 'desc');
      const j = await http(`${MD}/manga?${p}`, 'json');
      return { items: (j.data || []).map(mdItem), more: j.total > (page + 1) * 24 };
    },
    async detail(item) {
      let m = item;
      if (!item.desc || !item.coverBig) {
        const j = await http(`${MD}/manga/${item.id}?includes[]=cover_art`, 'json');
        m = mdItem(j.data);
      }
      const chapters = await this.chapters(item.id);
      return { title: m.title, cover: m.coverBig || m.cover, desc: m.desc, tags: m.tags, status: m.status, year: m.year, chapters };
    },
    async chapters(id) {
      const out = [], seen = new Set();
      let offset = 0, total = 1;
      while (offset < total && offset < 3000) {
        const p = new URLSearchParams({ limit: '500', offset: String(offset), includeExternalUrl: '0' });
        S.set.langs.forEach(l => p.append('translatedLanguage[]', l));
        p.append('order[chapter]', 'desc');
        ratings().forEach(r => p.append('contentRating[]', r));
        const j = await http(`${MD}/manga/${id}/feed?${p}`, 'json');
        total = j.total || 0;
        if (!j.data || !j.data.length) break;
        offset += j.data.length;
        for (const c of j.data) {
          const a = c.attributes;
          if (a.pages === 0 || a.externalUrl) continue;
          const k = a.chapter != null ? `${a.chapter}|${a.translatedLanguage}` : c.id;
          if (seen.has(k)) continue;
          seen.add(k);
          const num = a.chapter != null ? `Cap. ${a.chapter}` : 'Oneshot';
          out.push({ id: c.id, title: num + (a.title ? ` — ${a.title}` : ''), lang: a.translatedLanguage });
        }
      }
      return out;
    },
    async pages(ch) {
      const j = await http(`${MD}/at-home/server/${ch.id}`, 'json');
      const files = S.set.saver ? j.chapter.dataSaver : j.chapter.data;
      const dir = S.set.saver ? 'data-saver' : 'data';
      return files.map(f => `${j.baseUrl}/${dir}/${j.chapter.hash}/${f}`);
    }
  };

  /* ---------------- Fuente: ManhwaWeb ---------------- */
  const MW = 'https://api.manhwaweb.com';
  const MW_H = { Referer: 'https://manhwaweb.com/', Origin: 'https://manhwaweb.com' };
  const NON_ASCII = /[^\x00-\x7F]/;
  const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  // El sitio guarda el título en dos campos; se prefiere el que conserva los acentos.
  const mwTitle = m => {
    const a = m.name_esp || '', b = m.the_real_name || '';
    return (NON_ASCII.test(b) && !NON_ASCII.test(a) ? b : (a || b)) || 'Sin título';
  };
  const mwItem = m => ({ src: 'manhwaweb', id: m._id, title: mwTitle(m), cover: m._imagen || '' });

  const manhwaweb = {
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

  /* ---------------- Fuente genérica (cualquier web) ---------------- */
  function generic(cfg) {
    const sel = cfg.sel || {};
    return {
      id: cfg.id, name: cfg.name, builtin: !!cfg.builtin, cfg,
      async search(q, page) {
        if (!cfg.searchUrl) throw new Error('Esta fuente no tiene búsqueda. Pega el enlace de una serie o capítulo en el buscador.');
        const url = cfg.searchUrl.replace('{q}', encodeURIComponent(q || '')).replace('{page}', String(page + 1));
        const doc = await getDoc(url);
        const items = P.parseList(doc, url, sel).map(it => ({ src: cfg.id, id: it.url, title: it.title, cover: it.cover }));
        return { items, more: false };
      },
      async detail(item) {
        const doc = await getDoc(item.id);
        const meta = n => { const m = doc.querySelector(`meta[property="${n}"],meta[name="${n}"]`); return m ? P.clean(m.getAttribute('content')) : ''; };
        const txt = s => { const e = s && doc.querySelector(s); return e ? P.clean(e.textContent) : ''; };
        const h1 = doc.querySelector('h1');
        const title = meta('og:title') || (h1 && P.clean(h1.textContent)) || item.title;
        const cover = P.abs(meta('og:image'), item.id) || item.cover;
        const desc = txt(sel.desc) || meta('og:description') || meta('description') || '';
        const chapters = P.parseChapters(doc, item.id, sel);
        chapters.forEach(c => { c.title = tidyTitle(c.title); });
        return { title, cover, desc, tags: [], chapters };
      },
      async pages(ch) {
        const doc = await getDoc(ch.id);
        return P.readerImages(doc, ch.id, sel);
      }
    };
  }

  /* ---------------- Fuentes preconfiguradas ----------------
     Cada una declara `hosts` (para reconocer enlaces pegados) y `classify(url)` -> 'series' | 'chapter' | null. */
  // Deja el nombre del capítulo limpio: sin fechas, "hace 3 días" ni etiquetas NEW
  const MES = '(?:ene|feb|mar|abr|may|jun|jul|ago|sep|sept|oct|nov|dic|jan|apr|aug|dec)[a-z]*\\.?';
  const DATE_RE = [new RegExp('\\b\\d{1,2}[\\s/.-]' + MES + '[\\s/.,-]*\\d{2,4}\\b', 'gi'), new RegExp('\\b' + MES + '\\s+\\d{1,2},?\\s+\\d{4}\\b', 'gi'),
    /\b\d{4}-\d{2}-\d{2}\b/g, /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, /\bhace\s+\d+\s+\p{L}+/giu, /\b\d+\s+(?:hours?|days?|weeks?|months?|horas?|d[ií]as?|semanas?|meses)\s+ago\b/gi, /\b(?:new|nuevo|hot|end|fin)\b/gi];
  const tidyTitle = t => {
    let x = String(t || '');
    DATE_RE.forEach(r => { x = x.replace(r, ' '); });
    x = x.replace(/\s+/g, ' ').replace(/^[\s\-–—|·:]+|[\s\-–—|·:]+$/g, '').trim();
    return x || String(t || '').trim();
  };
  const origin = b => b.replace(/\/+$/, '');
  const nativeRef = base => ({ Referer: origin(base) + '/', Origin: origin(base) });
  const textOf = (doc, sels) => { for (const s of sels) { const e = doc.querySelector(s); const t = e && P.clean(e.textContent); if (t) return t; } return ''; };
  const metaOf = (doc, n) => { const m = doc.querySelector(`meta[property="${n}"],meta[name="${n}"]`); return m ? P.clean(m.getAttribute('content')) : ''; };

  // M440 guarda la lista de capítulos cifrada (CryptoJS AES con contraseña, formato {ct, iv, s}) en la variable UsaPoncho
  // y su propio script la descifra con una clave fija. Aquí se repite ese descifrado con WebCrypto.
  const M4_PASS = 'X^Ib1O*HLVh%3W2t';
  function md5(bytes) {
    const K = new Uint32Array(64), S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
    const n = bytes.length, total = ((n + 8) >> 6) * 64 + 64;
    const buf = new Uint8Array(total); buf.set(bytes); buf[n] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, (n * 8) >>> 0, true); dv.setUint32(total - 4, Math.floor(n / 0x20000000), true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let o = 0; o < total; o += 64) {
      const M = new Uint32Array(16); for (let i = 0; i < 16; i++) M[i] = dv.getUint32(o + i * 4, true);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + M[g]) >>> 0;
        A = D; D = C; C = B;
        const r = S[(i >> 4) * 4 + (i % 4)];
        B = (B + ((F << r) | (F >>> (32 - r)))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    const out = new Uint8Array(16), ov = new DataView(out.buffer);
    ov.setUint32(0, a0, true); ov.setUint32(4, b0, true); ov.setUint32(8, c0, true); ov.setUint32(12, d0, true);
    return out;
  }
  const concatBytes = (...p) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let k = 0; p.forEach(x => { o.set(x, k); k += x.length; }); return o; };
  const hexBytes = h => Uint8Array.from((h.match(/../g) || []).map(x => parseInt(x, 16)));
  const b64Bytes = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
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
  const m440 = {
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

  // LeerManhwas: series en /manhwa/{slug}/ y capítulos en /manhwa/{slug}/capitulo-{n}/ (imágenes en cdn01.leermanhwas.com)
  const LM = 'https://leermanhwas.com';
  const leermanhwas = Object.assign(generic({
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

  // TMOHentai: el listado viene como HTML (a veces dentro de {"html": ...}); cada obra se identifica por su número.
  // Oculta y no abre obras cuyo título o etiquetas apunten a menores de edad.
 const TH = 'https://tmohentai.app';
const MINOR_RE = null; // filtro loli/shota DESACTIVADO (pon el regex aquí para reactivar)
const thId = u => (String(u).match(/\/(?:library\/[^/]+|manga|view_uploads)\/(\d+)/) || [])[1] || '';
const tmohentai = {
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
      if (MINOR_RE && MINOR_RE.test(title)) continue;
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
    if (MINOR_RE && (MINOR_RE.test(title) || tags.some(t => MINOR_RE.test(t)))) throw new Error('Contenido bloqueado por la app.');
    const desc = (metaOf(doc, 'og:description') || metaOf(doc, 'description')).replace(/^Lee .*? en línea gratis\.\s*/i, '');
    const cover = P.imgSrc(doc.querySelector('#md-cover'), TH) || item.cover || `https://storage.tmohentai.app/mangas/${num}/1.webp`;
    const total = parseInt(((doc.querySelector('#md-preview-grid') || {}).dataset || {}).total, 10) || parseInt(item.n, 10) || 0;
    return { title, cover, desc, tags, status: /ongoing/i.test(doc.body.textContent) ? 'ongoing' : '', chapters: [{ id: `${TH}/view_uploads/${num}`, title: 'Leer' + (total ? ` (${total} páginas)` : ''), num: total }] };
  },
    async pages(ch) {
      const num = thId(ch.id);
      const rx = new RegExp(`https?:\\\\?/\\\\?/storage\\.tmohentai\\.app\\\\?/mangas\\\\?/${num}\\\\?/[^"'\\s<>\\\\)]+?\\.(?:webp|jpe?g|png)`, 'gi');
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

  // ZonaTMO: series en /library/{tipo}/{id}/{slug}, capítulos en /view_uploads/{id} (imágenes en storage.zonatmo.org)
  const ZT = 'https://zonatmo.org';
  const ztCover = id => (id ? `${ZT}/storage/covers/${id}.webp?v=2` : '');
  const ztNum = u => (String(u).match(/\/library\/[^/]+\/(\d+)\//) || [])[1] || '';
  const zonatmo = {
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

  const webSource = generic({ id: 'web', name: 'Cualquier web (pegar enlace)', builtin: true });
  const PRESETS = [m440, leermanhwas, tmohentai, zonatmo];
  const allSources = () => [manhwaweb, mangadex, ...PRESETS, webSource, ...S.sources.map(generic)];
  const srcById = id => allSources().find(s => s.id === id) || manhwaweb;

  /* ---------------- Imágenes con red nativa ----------------
     Algunos servidores de imágenes solo responden si la petición trae el Referer del sitio.
     Una etiqueta <img> no permite fijarlo, así que dentro de la app (Capacitor) las imágenes de
     esas fuentes se descargan con la red nativa, que sí envía cabeceras, y se muestran como blob.
     Sin Capacitor (navegador) o en fuentes sin cabeceras se usa el <img> normal. */
  manhwaweb.imgHeaders = MW_H;
  const capHttp = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) || null;
  const nativeHeaders = srcId => { const s = srcById(srcId); return (s && s.imgHeaders) || null; };
  const coverBlobs = new Map(); // portadas: duran toda la sesión
  const pageBlobs = new Map();  // páginas del capítulo abierto: se liberan al cambiar de capítulo
  async function nativeBlobUrl(url, headers, cacheMap) {
    if (cacheMap.has(url)) return cacheMap.get(url);
    const r = await capHttp().request({
      url, method: 'GET', responseType: 'blob',
      headers: Object.assign({ Accept: 'image/avif,image/webp,image/*,*/*;q=0.8', 'User-Agent': navigator.userAgent }, headers)
    });
    if (!r || r.status < 200 || r.status >= 300 || !r.data) throw new Error('HTTP ' + (r ? r.status : '?'));
    const bin = atob(r.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const h = r.headers || {};
    const type = h['Content-Type'] || h['content-type'] || 'image/webp';
    const u = URL.createObjectURL(new Blob([bytes], { type }));
    cacheMap.set(url, u);
    return u;
  }
  function srcFor(srcId, url, cacheMap) {
    const hd = capHttp() && nativeHeaders(srcId);
    return hd ? nativeBlobUrl(url, hd, cacheMap) : Promise.resolve(url);
  }
  const clearPageBlobs = () => { pageBlobs.forEach(u => URL.revokeObjectURL(u)); pageBlobs.clear(); };

  // Portada: <img> normal, o marcada para descargarse con la red nativa (ver hydrate)
  const coverImg = (url, srcId) => {
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
  function hydrate(root) {
    $$('img[data-nsrc]', root || document).forEach(im => { if (!im.dataset.q) { im.dataset.q = '1'; hq.push(im); } });
    pump();
  }

  /* ---------------- Navegación con botón atrás ---------------- */
  const stack = [];
  function showOverlay(id) {
    $('#' + id).hidden = false;
    stack.push(id);
    history.pushState({ o: id }, '');
    document.body.classList.add('noscroll');
  }
  window.addEventListener('popstate', () => {
    const id = stack.pop();
    if (!id) { rootBack(); return; }
    $('#' + id).hidden = true;
    if (id === 'reader') { $('#rpanel').hidden = true; $('#rpages').innerHTML = ''; clearPageBlobs(); if (stack.includes('detail')) renderDetail(); }
    if (!stack.length) document.body.classList.remove('noscroll');
  });
  const goBack = () => history.back();
  // Sin pantallas abiertas, "atrás" vuelve a Explorar y nunca cierra la app: siempre queda una entrada de historial por delante.
  function rootBack() {
    const cur = ($('.view.active') || {}).id;
    if (cur && cur !== 'v-explore') setView('explore');
    else toast('Para salir de la app usa el botón de inicio');
    try { history.pushState({ root: 1 }, ''); } catch (e) { /* sin historial */ }
  }
  try { history.replaceState({ base: 1 }, ''); history.pushState({ root: 1 }, ''); } catch (e) { /* sin historial */ }

  function setView(v) {
    $$('.view').forEach(e => e.classList.toggle('active', e.id === 'v-' + v));
    $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    if (v === 'library') renderLibrary();
    if (v === 'sources') renderSources();
    window.scrollTo(0, 0);
  }

  /* ---------------- Explorar ---------------- */
  const ALL = 'all';
  const SR = { q: '', page: 0, busy: false, token: 0, seen: new Set() };

  const cardHtml = it => {
    cache[keyOf(it)] = it;
    return `<button class="card" data-k="${esc(keyOf(it))}"><div class="cv"><span class="ph">${esc((it.title || '?').trim().charAt(0).toUpperCase())}</span>${coverImg(it.cover, it.src)}${S.current === ALL ? `<span class="sb">${esc(srcById(it.src).name.replace(/ \(.*\)$/, ''))}</span>` : ''}</div><div class="ct">${esc(it.title)}</div></button>`;
  };

  function renderSrcSelect() {
    $('#srcsel').innerHTML = `<option value="${ALL}" ${S.current === ALL ? 'selected' : ''}>Todas las fuentes</option>` + allSources().map(s => `<option value="${esc(s.id)}" ${s.id === S.current ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  }

  async function runSearch(reset = true, qOverride = null) {
    let q;
    if (qOverride != null) q = String(qOverride).trim();
    else { q = $('#q').value.trim(); if (reset) $('#q').value = ''; } // el cuadro se limpia solo tras buscar
    if (/^https?:\/\//i.test(q)) { openUrl(q); return; }
    if (SR.busy && !reset) return;
    if (reset) { SR.page = 0; SR.q = q; $('#results').innerHTML = '<div class="spin">Buscando…</div>'; $('#more').innerHTML = ''; }
    if (S.current === ALL) { searchAll(); return; }
    const src = srcById(S.current);
    if (src.id === 'web' && !SR.q) {
      $('#results').innerHTML = '<div class="empty">Pega arriba el enlace de una serie o de un capítulo de cualquier web y la app lo adapta al lector.</div>';
      return;
    }
    if (src.adult && !S.set.adult) {
      $('#results').innerHTML = '<div class="empty">Esta fuente es para mayores de 18 años. Actívala en Fuentes → Ajustes → «Mostrar contenido para adultos».</div>';
      return;
    }
    const my = ++SR.token;
    SR.busy = true;
    try {
      const r = await src.search(SR.q, SR.page);
      if (my !== SR.token) return;
      if (reset) { $('#results').innerHTML = ''; SR.seen = new Set(); }
      // Si una página repite resultados ya mostrados (el sitio ignoró la paginación), no se vuelven a pintar
      const fresh = r.items.filter(it => { const k = keyOf(it); if (SR.seen.has(k)) return false; SR.seen.add(k); return true; });
      if (!fresh.length && reset) {
        $('#results').innerHTML = `<div class="empty">Sin resultados${SR.q ? ` para “${esc(SR.q)}”` : ''}.</div>`;
      } else {
        $('#results').insertAdjacentHTML('beforeend', fresh.map(cardHtml).join(''));
        hydrate($('#results'));
      }
      $('#more').innerHTML = r.more && (fresh.length || reset) ? '<button class="btn ghost" id="loadmore">Cargar más</button>' : '';
    } catch (e) {
      if (my !== SR.token) return;
      if (reset) $('#results').innerHTML = `<div class="err"><b>No se pudo cargar</b>${esc(e.message || e)}<br><br><button class="btn" id="retry">Reintentar</button></div>`;
      else toast('No se pudo cargar más resultados');
    } finally { if (my === SR.token) SR.busy = false; }
  }

  // Busca el mismo texto en todas las fuentes a la vez y va mostrando cada una cuando responde
  async function searchAll() {
    const box = $('#results');
    $('#more').innerHTML = '';
    if (!SR.q) { box.innerHTML = '<div class="empty">Escribe un título para buscarlo en todas las fuentes.</div>'; return; }
    const srcs = allSources().filter(s => s.id !== 'web' && (!s.adult || S.set.adult));
    const my = ++SR.token;
    SR.busy = true;
    box.innerHTML = `<div class="spin">Buscando en ${srcs.length} fuentes…</div>`;
    let total = 0, firstShown = false;
    const failed = [];
    const limit = ms => new Promise((_, no) => setTimeout(() => no(new Error('tiempo agotado')), ms));
    await Promise.all(srcs.map(s => Promise.race([s.search(SR.q, 0), limit(20000)]).then(r => {
      if (my !== SR.token) return;
      const items = ((r && r.items) || []).slice(0, 12);
      if (!items.length) return;
      if (!firstShown) { box.innerHTML = ''; firstShown = true; }
      total += items.length;
      box.insertAdjacentHTML('beforeend', `<div class="rhead">${esc(s.name)}</div>` + items.map(cardHtml).join(''));
      hydrate(box);
    }).catch(() => { failed.push(s.name); })));
    if (my !== SR.token) return;
    SR.busy = false;
    if (!total) box.innerHTML = `<div class="empty">Sin resultados para “${esc(SR.q)}” en ninguna fuente.</div>`;
    if (failed.length) box.insertAdjacentHTML('beforeend', `<div class="rnote">No respondieron: ${esc(failed.join(', '))}</div>`);
  }

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
    if (slug && D && D.chapters.length) {
      const idx = D.chapters.findIndex(c => c.id === slug);
      if (idx >= 0) openReaderWith(D.item, D.src, D.chapters, idx);
    }
  }

  async function openUrl(url) {
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
    const cur = srcById(S.current);
    const src = (cur.cfg && !cur.builtin && !cur.hosts) || cur.id === 'web' ? cur : webSource;
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

  /* ---------------- Detalle ---------------- */
  let D = null;
  async function openDetail(item) {
    const src = srcById(item.src);
    D = { item: Object.assign({}, item), src, info: null, chapters: [], err: null, asc: false, full: false };
    showOverlay('detail');
    renderDetail();
    try {
      const info = await src.detail(D.item);
      if (!D || D.src !== src || D.item.id !== item.id) return;
      D.info = info; D.chapters = info.chapters || [];
      D.item.title = info.title || D.item.title;
      D.item.cover = info.cover || D.item.cover;
      cache[keyOf(D.item)] = D.item;
    } catch (e) { D.err = e.message || String(e); }
    if (stack.includes('detail')) renderDetail();
  }

  function renderDetail() {
    if (!D) return;
    const { item, info, chapters, err } = D;
    const key = keyOf(item);
    const fav = S.fav.some(f => f.key === key);
    const h = S.hist[key];
    const rd = S.read[key] || {};
    $('#d-bar-title').textContent = item.title;
    $('#d-fav').classList.toggle('on', fav);
    $('#d-fav').textContent = fav ? '★' : '☆';

    const status = info && info.status ? STATUS[info.status] || info.status : '';
    const meta = [status, info && info.year].filter(Boolean).join(' · ');
    let html = `<div class="dhead"><div class="dcover">${coverImg(item.cover, item.src)}</div><div class="dmeta"><h1>${esc(item.title)}</h1>`;
    if (meta) html += `<div class="st">${esc(meta)}</div>`;
    if (info && info.tags && info.tags.length) html += `<div class="chips">${info.tags.slice(0, 8).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>`;
    html += '</div></div>';

    if (!info && !err) {
      html += '<div class="spin">Cargando información y capítulos…</div>';
    } else if (err) {
      html += `<div class="err"><b>No se pudo cargar</b>${esc(err)}<br><br><button class="btn" id="d-retry">Reintentar</button></div>`;
    } else {
      if (info.desc) {
        const long = info.desc.length > 260;
        html += `<div class="desc ${long && !D.full ? 'clamp' : ''}">${esc(info.desc)}</div>`;
        if (long) html += `<button class="link" id="d-more">${D.full ? 'Ver menos' : 'Ver más'}</button>`;
      } else html += '<div class="desc">Sin descripción disponible.</div>';

      let ri = -1;
      if (h) ri = chapters.findIndex(c => c.id === h.chapterId);
      const startIdx = chapters.length - 1;
      html += '<div class="acts">';
      if (chapters.length) {
        if (ri >= 0) html += `<button class="btn" data-open="${ri}">Continuar · ${esc(chapters[ri].title.slice(0, 22))}</button>`;
        else html += `<button class="btn" data-open="${startIdx}">Empezar a leer</button>`;
      }
      html += '</div>';

      html += `<div class="chhead"><h3>${chapters.length} capítulo${chapters.length === 1 ? '' : 's'}</h3><button class="link" id="d-order">${D.asc ? '↑ Más antiguo primero' : '↓ Más nuevo primero'}</button></div>`;
      if (!chapters.length) html += '<div class="empty">No se encontraron capítulos (revisa el idioma en Ajustes o los selectores de la fuente).</div>';
      else {
        const idxs = chapters.map((_, i) => i);
        if (D.asc) idxs.reverse();
        html += '<div class="chlist">' + idxs.map(i => {
          const c = chapters[i];
          return `<button class="ch ${rd[c.id] ? 'read' : ''} ${i === ri ? 'cur' : ''}" data-open="${i}"><span>${esc(c.title)}</span>${c.lang ? `<small>${esc(c.lang)}</small>` : ''}</button>`;
        }).join('') + '</div>';
      }
    }
    const body = $('#d-body');
    const top = body.scrollTop;
    body.innerHTML = html;
    body.scrollTop = top;
    hydrate(body);
  }

  function toggleFav() {
    if (!D) return;
    const key = keyOf(D.item);
    const i = S.fav.findIndex(f => f.key === key);
    if (i >= 0) { S.fav.splice(i, 1); toast('Quitado de favoritos'); }
    else { S.fav.unshift({ key, src: D.item.src, id: D.item.id, title: D.item.title, cover: D.item.cover }); toast('Añadido a favoritos'); }
    save(); renderDetail();
  }

  /* ---------------- Lector en cascada ---------------- */
  let R = null;
  function openReaderWith(item, src, chapters, idx) {
    R = { item, src, chapters, idx, token: 0 };
    const rd = $('#reader');
    rd.classList.remove('bars-off');
    applyReaderOpts();
    showOverlay('reader');
    loadChapter(idx);
  }

  function applyReaderOpts() {
    const rd = $('#reader');
    rd.classList.toggle('gap', S.set.gap);
    rd.classList.toggle('narrow', S.set.narrow);
    $('#o-gap').checked = S.set.gap; $('#o-narrow').checked = S.set.narrow; $('#o-saver').checked = S.set.saver;
  }

  function markRead(ch) {
    const k = keyOf(R.item);
    if (!S.read[k]) S.read[k] = {};
    S.read[k][ch.id] = 1;
    S.hist[k] = { item: { src: R.item.src, id: R.item.id, title: R.item.title, cover: R.item.cover }, chapterId: ch.id, chapterTitle: ch.title, ts: Date.now() };
    save();
  }

  async function loadChapter(idx) {
    R.idx = idx;
    const my = ++R.token;
    const ch = R.chapters[idx];
    $('#r-title').textContent = R.item.title;
    $('#r-prog').textContent = ch.title;
    $('#rcount').textContent = '';
    $('#r-prev').disabled = idx + 1 >= R.chapters.length;
    $('#r-next').disabled = idx - 1 < 0;
    $('#rend').innerHTML = '';
    const pg = $('#rpages');
    clearPageBlobs();
    pg.innerHTML = '<div class="spin">Cargando capítulo…</div>';
    $('#rscroll').scrollTop = 0;
    try {
      const urls = ch.urls || await R.src.pages(ch);
      if (my !== R.token) return;
      if (!urls.length) throw new Error('Este capítulo no tiene imágenes disponibles.');
      const native = !!(capHttp() && nativeHeaders(R.item.src));
      pg.innerHTML = urls.map((u, i) => `<img class="pg" data-i="${i}" data-u="${esc(u)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="Página ${i + 1}"${native ? '' : ` src="${esc(u)}"`}>`).join('');
      if (native) loadPages(my);
      renderEnd();
      updateProg();
      markRead(ch);
    } catch (e) {
      if (my !== R.token) return;
      pg.innerHTML = `<div class="err"><b>No se pudo cargar el capítulo</b>${esc(e.message || e)}<br><br><button class="btn" id="r-retry">Reintentar</button></div>`;
    }
  }

  // Descarga las páginas en orden, 4 a la vez, con la red nativa (ver "Imágenes con red nativa")
  function loadPages(my) {
    const imgs = $$('#rpages .pg');
    let next = 0;
    const worker = async () => {
      while (next < imgs.length && R && R.token === my) {
        const im = imgs[next++];
        try { im.src = await srcFor(R.item.src, im.dataset.u, pageBlobs); }
        catch (e) { im.classList.add('bad'); }
      }
    };
    for (let k = 0; k < 4; k++) worker();
  }

  function renderEnd() {
    const hasNext = R.idx - 1 >= 0;
    $('#rend').innerHTML = `<p>Fin de «${esc(R.chapters[R.idx].title)}»</p>` +
      (hasNext ? '<button class="btn" id="e-next">Siguiente capítulo ›</button>' : '<p>Estás al día 🎉</p>') +
      '<button class="btn ghost" id="e-back">Volver a la serie</button>';
  }

  function updateProg() {
    const imgs = $$('#rpages .pg');
    if (!imgs.length) return;
    const lim = window.innerHeight * 0.4;
    let cur = 0;
    for (let i = 0; i < imgs.length; i++) { if (imgs[i].getBoundingClientRect().top <= lim) cur = i; else break; }
    $('#rcount').textContent = `${cur + 1} / ${imgs.length}`;
  }

  function stepChapter(d) {
    const n = R.idx + d;
    if (n < 0 || n >= R.chapters.length) return;
    loadChapter(n);
  }

  /* ---------------- Biblioteca ---------------- */
  function renderLibrary() {
    const hist = Object.values(S.hist).sort((a, b) => b.ts - a.ts).slice(0, 30);
    let html = '';
    html += '<h2 class="sec">Continuar leyendo</h2>';
    html += hist.length ? hist.map(h => {
      cache[keyOf(h.item)] = h.item;
      return `<div class="lrw"><button class="lrow" data-k="${esc(keyOf(h.item))}"><div class="cv"><span class="ph">${esc((h.item.title || '?').charAt(0).toUpperCase())}</span>${coverImg(h.item.cover, h.item.src)}</div><div><b>${esc(h.item.title)}</b><small>${esc(h.chapterTitle)}</small></div></button><button class="rm" data-rmh="${esc(keyOf(h.item))}" aria-label="Quitar de Continuar leyendo">✕</button></div>`;
    }).join('') : '<p class="hint">Aún no has leído nada.</p>';
    html += '<h2 class="sec">Favoritos</h2>';
    html += S.fav.length ? `<div class="grid">${S.fav.map(f => `<div class="cardw">${cardHtml(f)}<button class="rm" data-rmf="${esc(f.key)}" aria-label="Quitar de favoritos">✕</button></div>`).join('')}</div>` : '<p class="hint">Toca ☆ en una serie para guardarla aquí.</p>';
    $('#library').innerHTML = html;
    hydrate($('#library'));
  }

  /* ---------------- Fuentes y ajustes ---------------- */
  let editing = null;
  function renderSources() {
    $('#srclist').innerHTML = allSources().map(s => {
      const sub = s.id === 'manhwaweb' ? 'Catálogo en español: portadas, sinopsis y capítulos'
        : s.id === 'mangadex' ? 'Catálogo con portadas, descripciones y capítulos'
        : s.id === 'web' ? 'Pega el enlace de cualquier serie o capítulo'
        : s.sub ? s.sub
        : (s.cfg.searchUrl || 'Sin búsqueda (usa enlaces)');
      return `<div class="srow ${s.id === S.current ? 'on' : ''}" data-id="${esc(s.id)}"><button class="spick" data-act="pick">${esc(s.name)}<small>${esc(sub)}</small></button>${s.builtin ? '' : '<button data-act="edit">Editar</button><button data-act="del">Borrar</button>'}</div>`;
    }).join('');
    $('#settings').innerHTML = '<label>Idiomas de capítulos (MangaDex)</label>' +
      LANGS.map(([c, n]) => `<label class="tog"><input type="checkbox" data-lang="${c}" ${S.set.langs.includes(c) ? 'checked' : ''}> ${n}</label>`).join('') +
      `<label class="tog"><input type="checkbox" id="s-saver" ${S.set.saver ? 'checked' : ''}> Ahorro de datos (imágenes comprimidas)</label>` +
      `<label class="tog"><input type="checkbox" id="s-adult" ${S.set.adult ? 'checked' : ''}> Mostrar contenido para adultos (+18) en las fuentes que lo tengan</label>`;
  }

  function openSrcForm(cfg) {
    editing = cfg ? cfg.id : null;
    const s = (cfg && cfg.sel) || {};
    $('#sf-title').textContent = cfg ? 'Editar fuente' : 'Nueva fuente';
    $('#f-name').value = cfg ? cfg.name : ''; $('#f-search').value = cfg ? cfg.searchUrl || '' : '';
    $('#f-item').value = s.item || ''; $('#f-title').value = s.title || ''; $('#f-cover').value = s.cover || '';
    $('#f-desc').value = s.desc || ''; $('#f-chapter').value = s.chapter || ''; $('#f-image').value = s.image || '';
    $('#srcform').hidden = false;
    $('#srcform').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function saveSrcForm() {
    const name = $('#f-name').value.trim();
    const searchUrl = $('#f-search').value.trim();
    if (!name) return toast('Ponle un nombre a la fuente');
    if (searchUrl && !/^https?:\/\//i.test(searchUrl)) return toast('La URL debe empezar con http:// o https://');
    if (searchUrl && !searchUrl.includes('{q}')) return toast('La URL de búsqueda debe incluir {q}');
    const sel = {};
    [['item', 'f-item'], ['title', 'f-title'], ['cover', 'f-cover'], ['desc', 'f-desc'], ['chapter', 'f-chapter'], ['image', 'f-image']]
      .forEach(([k, id]) => { const v = $('#' + id).value.trim(); if (v) sel[k] = v; });
    for (const v of Object.values(sel)) {
      try { document.querySelector(v); } catch (e) { return toast('Selector CSS no válido: ' + v); }
    }
    const cfg = { id: editing || 'c_' + Date.now().toString(36), name, searchUrl, sel };
    const i = S.sources.findIndex(x => x.id === cfg.id);
    if (i >= 0) S.sources[i] = cfg; else S.sources.push(cfg);
    S.current = cfg.id;
    save(); $('#srcform').hidden = true; renderSources(); renderSrcSelect();
    toast('Fuente guardada. Búscala en Explorar');
  }

  /* ---------------- Diagnóstico de imágenes ----------------
     Pide una portada real de ManhwaWeb de cuatro maneras y muestra lo que responde el servidor,
     para saber si lo bloquea el Referer, el User-Agent o una verificación anti-bots. */
  async function runDiag() {
    const out = $('#diag');
    out.hidden = false;
    const lines = [];
    const log = s => { lines.push(s); out.textContent = lines.join('\n'); };
    const cap = capHttp();
    log('Diagnóstico · ' + new Date().toLocaleTimeString());
    log('Red nativa (Capacitor): ' + (cap ? 'sí' : 'NO (estás en un navegador)'));
    log('User-Agent: ' + navigator.userAgent);
    let cover = null;
    try {
      const j = await http(`${MW}/manhwa/library?buscar=&estado=&tipo=&erotico=no&demografia=&order_item=creacion&order_dir=desc&page=0&generes=`, 'json', MW_H);
      cover = j.data && j.data[0] && j.data[0]._imagen;
      log('API del listado: OK (' + ((j.data || []).length) + ' series)');
    } catch (e) { log('API del listado: ERROR ' + (e.message || e)); }
    if (!cover) { log('No hay portada para probar. Fin.'); return; }
    log('Imagen de prueba: ' + cover);

    const probe = async (label, headers) => {
      if (!cap) { log(label + ': (sin red nativa)'); return; }
      try {
        const r = await cap.request({ url: cover, method: 'GET', headers, responseType: 'blob' });
        const h = r.headers || {};
        const g = k => h[k] || h[k.toLowerCase()] || '';
        const ct = String(g('Content-Type'));
        const bytes = r.data ? Math.round(String(r.data).length * 0.75) : 0;
        let extra = '';
        if (/text|html|json/i.test(ct) && r.data) { try { extra = ' · cuerpo: ' + atob(r.data).slice(0, 80).replace(/\s+/g, ' '); } catch (e) { /* no es texto */ } }
        const cf = g('cf-mitigated') ? ' · cf-mitigated=' + g('cf-mitigated') : '';
        log(`${label}: HTTP ${r.status} · ${ct || 'sin tipo'} · ${bytes} bytes · server=${g('Server') || '?'}${cf}${extra}`);
      } catch (e) { log(`${label}: ERROR ${e.message || e}`); }
    };
    await probe('1) Nativo con Referer+Origin+UA (lo que usa el lector)', Object.assign({ 'User-Agent': navigator.userAgent }, MW_H));
    await probe('2) Nativo solo con Referer+Origin', MW_H);
    await probe('3) Nativo sin cabeceras', {});
    await new Promise(res => {
      const im = new Image();
      im.referrerPolicy = 'no-referrer';
      im.onload = () => { log(`4) <img> normal: carga (${im.naturalWidth}×${im.naturalHeight})`); res(); };
      im.onerror = () => { log('4) <img> normal: FALLA'); res(); };
      im.src = cover;
    });
    log('Fin. Envíame una captura de este cuadro.');
  }

  /* ---------------- Respaldo manual ----------------
     Exporta favoritos, historial, capítulos leídos y fuentes propias a un archivo/texto, y los importa uniéndolos con lo que ya hay. */
  const BK_HTML = `<div id="backup" class="panel"><h3>Respaldo</h3>
    <p class="hint">Guarda tus favoritos, historial y fuentes en un archivo (por ejemplo en tu Google Drive) y recupéralos en otro teléfono o después de reinstalar.</p>
    <button class="btn ghost wide" data-bk="export">Exportar respaldo</button>
    <button class="btn ghost wide" data-bk="file">Importar desde archivo</button>
    <button class="btn ghost wide" data-bk="text">Importar desde texto pegado</button>
    <textarea id="bk-text" rows="6" hidden placeholder="Pega aquí el respaldo"></textarea>
    <button class="btn wide" id="bk-go" data-bk="go" hidden>Importar</button>
    <input type="file" id="bk-file" accept=".json,application/json,text/plain" hidden></div>`;
  const backupData = () => ({ app: 'mangareader', v: 1, at: new Date().toISOString(), fav: S.fav, hist: S.hist, read: S.read, sources: S.sources });
  function mergeBackup(o) {
    if (!o || o.app !== 'mangareader' || typeof o !== 'object') throw new Error('Este archivo no es un respaldo de Manga Reader');
    let nf = 0, nh = 0, ns = 0;
    (Array.isArray(o.fav) ? o.fav : []).forEach(f => { if (f && f.key && !S.fav.some(x => x.key === f.key)) { S.fav.push(f); nf++; } });
    Object.entries(o.hist && typeof o.hist === 'object' ? o.hist : {}).forEach(([k, h]) => { if (h && h.item && (!S.hist[k] || (h.ts || 0) > (S.hist[k].ts || 0))) { S.hist[k] = h; nh++; } });
    Object.entries(o.read && typeof o.read === 'object' ? o.read : {}).forEach(([k, m]) => { if (m && typeof m === 'object') S.read[k] = Object.assign({}, S.read[k] || {}, m); });
    (Array.isArray(o.sources) ? o.sources : []).forEach(c => { if (c && c.id && c.name && !S.sources.some(x => x.id === c.id)) { S.sources.push(c); ns++; } });
    save(); renderSources(); renderSrcSelect(); renderLibrary();
    return { nf, nh, ns };
  }
  function importText(text) {
    let o;
    try { o = JSON.parse(String(text || '').trim()); } catch (e) { toast('El texto no es un respaldo válido'); return; }
    try {
      const r = mergeBackup(o);
      toast(`Importado: ${r.nf} favoritos, ${r.nh} del historial, ${r.ns} fuentes`);
      $('#bk-text').hidden = true; $('#bk-go').hidden = true; $('#bk-text').value = '';
    } catch (e) { toast(e.message || 'No se pudo importar'); }
  }
  async function exportBackup() {
    const text = JSON.stringify(backupData());
    const name = 'manga-reader-respaldo-' + new Date().toISOString().slice(0, 10) + '.json';
    try {
      const file = new File([text], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Respaldo de Manga Reader' });
        toast('Respaldo listo');
        return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    // Sin "compartir archivo": se muestra el texto y se copia al portapapeles
    const box = $('#bk-text');
    box.hidden = false; $('#bk-go').hidden = true; box.value = text; box.focus(); box.select();
    try { await navigator.clipboard.writeText(text); toast('Respaldo copiado. Pégalo en una nota o en Drive'); }
    catch (e) { toast('Copia el texto del cuadro y guárdalo'); }
  }
  $('#settings').insertAdjacentHTML('afterend', BK_HTML);
  $('#backup').addEventListener('click', e => {
    const b = e.target.closest('[data-bk]');
    if (!b) return;
    if (b.dataset.bk === 'export') exportBackup();
    if (b.dataset.bk === 'file') $('#bk-file').click();
    if (b.dataset.bk === 'text') { const t = $('#bk-text'); t.hidden = false; t.value = ''; $('#bk-go').hidden = false; t.focus(); }
    if (b.dataset.bk === 'go') importText($('#bk-text').value);
  });
  $('#bk-file').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { importText(await f.text()); } catch (err) { toast('No se pudo leer el archivo'); }
  });

  /* ---------------- Eventos ---------------- */
  $('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setView(b.dataset.v); });
  $('#sf').addEventListener('submit', e => { e.preventDefault(); $('#q').blur(); runSearch(true); });
  $('#srcsel').addEventListener('change', e => { S.current = e.target.value; save(); runSearch(true, SR.q); });

  document.addEventListener('click', e => {
    const t = e.target;
    const rh = t.closest('[data-rmh]');
    if (rh) {
      if (confirm('¿Quitar de «Continuar leyendo»?')) { delete S.hist[rh.dataset.rmh]; save(); renderLibrary(); }
      return;
    }
    const rf = t.closest('[data-rmf]');
    if (rf) {
      if (confirm('¿Quitar de favoritos?')) { S.fav = S.fav.filter(f => f.key !== rf.dataset.rmf); save(); renderLibrary(); }
      return;
    }
    const card = t.closest('[data-k]');
    if (card && cache[card.dataset.k]) { openDetail(cache[card.dataset.k]); return; }
    if (t.closest('#loadmore')) { SR.page++; runSearch(false); return; }
    if (t.closest('#retry')) { runSearch(true, SR.q); return; }
    if (t.closest('#d-retry')) { openDetailRetry(); return; }
    if (t.closest('#d-more')) { D.full = !D.full; renderDetail(); return; }
    if (t.closest('#d-order')) { D.asc = !D.asc; renderDetail(); return; }
    const op = t.closest('[data-open]');
    if (op && D) { openReaderWith(D.item, D.src, D.chapters, +op.dataset.open); return; }
    if (t.closest('#r-retry')) { loadChapter(R.idx); return; }
    if (t.closest('#e-next')) { stepChapter(-1); return; }
    if (t.closest('#e-back')) { goBack(); return; }
  });
  function openDetailRetry() {
    const item = D.item;
    goBack();
    setTimeout(() => openDetail(item), 60);
  }

  $('#d-back').addEventListener('click', goBack);
  $('#d-fav').addEventListener('click', toggleFav);
  $('#r-back').addEventListener('click', goBack);
  $('#r-set').addEventListener('click', () => { $('#rpanel').hidden = !$('#rpanel').hidden; });
  $('#r-prev').addEventListener('click', () => stepChapter(1));
  $('#r-next').addEventListener('click', () => stepChapter(-1));
  $('#r-top').addEventListener('click', () => $('#rscroll').scrollTo({ top: 0, behavior: 'smooth' }));

  // Tocar la página muestra/oculta las barras
  $('#rpages').addEventListener('click', e => {
    if (e.target.classList.contains('bad')) return;
    $('#rpanel').hidden = true;
    $('#reader').classList.toggle('bars-off');
  });
  // Cargada / error de cada página
  $('#rpages').addEventListener('load', e => { if (e.target.classList.contains('pg')) { e.target.classList.remove('bad'); e.target.classList.add('ok'); } }, true);
  $('#rpages').addEventListener('error', e => { if (e.target.classList.contains('pg')) e.target.classList.add('bad'); }, true);
  $('#rpages').addEventListener('click', e => {
    const im = e.target;
    if (im.classList && im.classList.contains('bad')) {
      im.classList.remove('bad');
      const u = im.dataset.u || im.getAttribute('src');
      im.removeAttribute('src');
      srcFor(R.item.src, u, pageBlobs)
        .then(s => setTimeout(() => im.setAttribute('src', s), 60))
        .catch(() => im.classList.add('bad'));
    }
  });
  let raf = 0;
  $('#rscroll').addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; updateProg(); });
  }, { passive: true });

  // Portadas rotas: dejar la letra de respaldo
  document.addEventListener('error', e => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.closest('.cv')) t.remove();
  }, true);

  // Opciones del lector
  $('#o-gap').addEventListener('change', e => { S.set.gap = e.target.checked; save(); applyReaderOpts(); });
  $('#o-narrow').addEventListener('change', e => { S.set.narrow = e.target.checked; save(); applyReaderOpts(); });
  $('#o-saver').addEventListener('change', e => {
    S.set.saver = e.target.checked; save(); applyReaderOpts();
    if (R && R.src.id === 'mangadex') loadChapter(R.idx);
  });

  // Fuentes
  $('#srclist').addEventListener('click', e => {
    const row = e.target.closest('.srow'); const b = e.target.closest('button');
    if (!row || !b) return;
    const id = row.dataset.id;
    if (b.dataset.act === 'pick') { S.current = id; save(); renderSources(); renderSrcSelect(); toast('Fuente activa: ' + srcById(id).name); }
    if (b.dataset.act === 'edit') openSrcForm(S.sources.find(s => s.id === id));
    if (b.dataset.act === 'del') {
      if (!confirm('¿Borrar esta fuente?')) return;
      S.sources = S.sources.filter(s => s.id !== id);
      if (S.current === id) S.current = 'mangadex';
      save(); renderSources(); renderSrcSelect();
    }
  });
  $('#addsrc').addEventListener('click', () => openSrcForm(null));
  $('#f-save').addEventListener('click', saveSrcForm);
  $('#f-cancel').addEventListener('click', () => { $('#srcform').hidden = true; });
  // Opcional: si el index.html instalado es una versión anterior sin este botón, no debe detener el arranque.
  const diagBtn = $('#s-diag');
  if (diagBtn) diagBtn.addEventListener('click', runDiag);

  // Ajustes
  $('#settings').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.lang) {
      const set = new Set(S.set.langs);
      t.checked ? set.add(t.dataset.lang) : set.delete(t.dataset.lang);
      if (!set.size) { set.add('en'); toast('Debe haber al menos un idioma'); }
      S.set.langs = [...set];
    }
    if (t.id === 's-saver') S.set.saver = t.checked;
    if (t.id === 's-adult') {
      if (t.checked && !confirm('Esto mostrará contenido para mayores de 18 años. ¿Eres mayor de edad?')) { t.checked = false; return; }
      S.set.adult = t.checked;
    }
    save(); renderSources();
  });

  /* ---------------- Inicio ---------------- */
  renderSrcSelect();
  runSearch(true);
  window.__MR = { S, mangadex, generic, runSearch, openDetail, openUrl };
})();
