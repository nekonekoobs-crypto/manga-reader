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
        return { title, cover, desc, tags: [], chapters };
      },
      async pages(ch) {
        const doc = await getDoc(ch.id);
        return P.readerImages(doc, ch.id, sel);
      }
    };
  }
  const webSource = generic({ id: 'web', name: 'Cualquier web (pegar enlace)', builtin: true });
  const allSources = () => [manhwaweb, mangadex, webSource, ...S.sources.map(generic)];
  const srcById = id => allSources().find(s => s.id === id) || manhwaweb;

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
    if (!id) return;
    $('#' + id).hidden = true;
    if (id === 'reader') { $('#rpanel').hidden = true; $('#rpages').innerHTML = ''; if (stack.includes('detail')) renderDetail(); }
    if (!stack.length) document.body.classList.remove('noscroll');
  });
  const goBack = () => history.back();

  function setView(v) {
    $$('.view').forEach(e => e.classList.toggle('active', e.id === 'v-' + v));
    $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    if (v === 'library') renderLibrary();
    if (v === 'sources') renderSources();
    window.scrollTo(0, 0);
  }

  /* ---------------- Explorar ---------------- */
  const SR = { q: '', page: 0, busy: false, token: 0 };

  const cardHtml = it => {
    cache[keyOf(it)] = it;
    return `<button class="card" data-k="${esc(keyOf(it))}"><div class="cv"><span class="ph">${esc((it.title || '?').trim().charAt(0).toUpperCase())}</span>${it.cover ? `<img loading="lazy" referrerpolicy="no-referrer" src="${esc(it.cover)}" alt="">` : ''}</div><div class="ct">${esc(it.title)}</div></button>`;
  };

  function renderSrcSelect() {
    $('#srcsel').innerHTML = allSources().map(s => `<option value="${esc(s.id)}" ${s.id === S.current ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  }

  async function runSearch(reset = true) {
    const q = $('#q').value.trim();
    if (/^https?:\/\//i.test(q)) { openUrl(q); return; }
    if (SR.busy && !reset) return;
    if (reset) { SR.page = 0; SR.q = q; $('#results').innerHTML = '<div class="spin">Buscando…</div>'; $('#more').innerHTML = ''; }
    const src = srcById(S.current);
    if (src.id === 'web' && !q) {
      $('#results').innerHTML = '<div class="empty">Pega arriba el enlace de una serie o de un capítulo de cualquier web y la app lo adapta al lector.</div>';
      return;
    }
    const my = ++SR.token;
    SR.busy = true;
    try {
      const r = await src.search(SR.q, SR.page);
      if (my !== SR.token) return;
      if (reset) $('#results').innerHTML = '';
      if (!r.items.length && reset) {
        $('#results').innerHTML = `<div class="empty">Sin resultados${SR.q ? ` para “${esc(SR.q)}”` : ''}.</div>`;
      } else {
        $('#results').insertAdjacentHTML('beforeend', r.items.map(cardHtml).join(''));
      }
      $('#more').innerHTML = r.more ? '<button class="btn ghost" id="loadmore">Cargar más</button>' : '';
    } catch (e) {
      if (my !== SR.token) return;
      if (reset) $('#results').innerHTML = `<div class="err"><b>No se pudo cargar</b>${esc(e.message || e)}<br><br><button class="btn" id="retry">Reintentar</button></div>`;
      else toast('No se pudo cargar más resultados');
    } finally { if (my === SR.token) SR.busy = false; }
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
    const src = (S.current === 'mangadex' || S.current === 'manhwaweb') ? webSource : srcById(S.current);
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
    let html = `<div class="dhead"><div class="dcover">${item.cover ? `<img referrerpolicy="no-referrer" src="${esc(item.cover)}" alt="Portada">` : ''}</div><div class="dmeta"><h1>${esc(item.title)}</h1>`;
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
    pg.innerHTML = '<div class="spin">Cargando capítulo…</div>';
    $('#rscroll').scrollTop = 0;
    try {
      const urls = ch.urls || await R.src.pages(ch);
      if (my !== R.token) return;
      if (!urls.length) throw new Error('Este capítulo no tiene imágenes disponibles.');
      pg.innerHTML = urls.map((u, i) => `<img class="pg" data-i="${i}" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="Página ${i + 1}" src="${esc(u)}">`).join('');
      renderEnd();
      updateProg();
      markRead(ch);
    } catch (e) {
      if (my !== R.token) return;
      pg.innerHTML = `<div class="err"><b>No se pudo cargar el capítulo</b>${esc(e.message || e)}<br><br><button class="btn" id="r-retry">Reintentar</button></div>`;
    }
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
      return `<button class="lrow" data-k="${esc(keyOf(h.item))}"><div class="cv"><span class="ph">${esc((h.item.title || '?').charAt(0).toUpperCase())}</span>${h.item.cover ? `<img loading="lazy" referrerpolicy="no-referrer" src="${esc(h.item.cover)}" alt="">` : ''}</div><div><b>${esc(h.item.title)}</b><small>${esc(h.chapterTitle)}</small></div></button>`;
    }).join('') : '<p class="hint">Aún no has leído nada.</p>';
    html += '<h2 class="sec">Favoritos</h2>';
    html += S.fav.length ? `<div class="grid">${S.fav.map(f => cardHtml(f)).join('')}</div>` : '<p class="hint">Toca ☆ en una serie para guardarla aquí.</p>';
    $('#library').innerHTML = html;
  }

  /* ---------------- Fuentes y ajustes ---------------- */
  let editing = null;
  function renderSources() {
    $('#srclist').innerHTML = allSources().map(s => {
      const sub = s.id === 'manhwaweb' ? 'Catálogo en español: portadas, sinopsis y capítulos'
        : s.id === 'mangadex' ? 'Catálogo con portadas, descripciones y capítulos'
        : s.id === 'web' ? 'Pega el enlace de cualquier serie o capítulo'
        : (s.cfg.searchUrl || 'Sin búsqueda (usa enlaces)');
      return `<div class="srow ${s.id === S.current ? 'on' : ''}" data-id="${esc(s.id)}"><button class="spick" data-act="pick">${esc(s.name)}<small>${esc(sub)}</small></button>${s.builtin ? '' : '<button data-act="edit">Editar</button><button data-act="del">Borrar</button>'}</div>`;
    }).join('');
    $('#settings').innerHTML = '<label>Idiomas de capítulos (MangaDex)</label>' +
      LANGS.map(([c, n]) => `<label class="tog"><input type="checkbox" data-lang="${c}" ${S.set.langs.includes(c) ? 'checked' : ''}> ${n}</label>`).join('') +
      `<label class="tog"><input type="checkbox" id="s-saver" ${S.set.saver ? 'checked' : ''}> Ahorro de datos (imágenes comprimidas)</label>` +
      `<label class="tog"><input type="checkbox" id="s-adult" ${S.set.adult ? 'checked' : ''}> Mostrar contenido para adultos (+18) en ManhwaWeb y MangaDex</label>`;
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

  /* ---------------- Eventos ---------------- */
  $('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setView(b.dataset.v); });
  $('#sf').addEventListener('submit', e => { e.preventDefault(); $('#q').blur(); runSearch(true); });
  $('#srcsel').addEventListener('change', e => { S.current = e.target.value; save(); runSearch(true); });

  document.addEventListener('click', e => {
    const t = e.target;
    const card = t.closest('[data-k]');
    if (card && cache[card.dataset.k]) { openDetail(cache[card.dataset.k]); return; }
    if (t.closest('#loadmore')) { SR.page++; runSearch(false); return; }
    if (t.closest('#retry')) { runSearch(true); return; }
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
      const u = im.getAttribute('src'); im.removeAttribute('src');
      setTimeout(() => im.setAttribute('src', u), 60);
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
