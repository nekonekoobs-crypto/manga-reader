/* Asistente para adaptar una página web como fuente, paso a paso, con pruebas en vivo.
   Pide solo lo necesario (direcciones reales del sitio) y deduce lo demás; cada paso se prueba antes de seguir. */
(function () {
  'use strict';
  const M = window.__MR, P = window.MR_PARSERS;
  if (!M || !P) return;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NAMES = ['Sitio', 'Búsqueda', 'Serie', 'Capítulo', 'Guardar'];
  let W = null, step = 0, T = {}, busy = false;

  const blank = () => ({ wiz: 1, name: '', listUrl: '', searchUrl: '', sel: {}, itemPath: '', imgRef: false, adult: false, reverse: false });
  const get = k => k.split('.').reduce((o, p) => (o == null ? '' : o[p]), W) || '';
  const set = (k, v) => { const ps = k.split('.'); let o = W; ps.slice(0, -1).forEach(p => { o = o[p] = o[p] || {}; }); const last = ps[ps.length - 1]; if (v === '' || v === false) delete o[last]; else o[last] = v; };
  const origin = u => { try { return new URL(u).origin; } catch (e) { return ''; } };
  const isUrl = u => /^https?:\/\/[^\s]+\.[^\s]+/i.test(u || '');

  /* ---------- utilidades de análisis ---------- */
  const blocked = html => /just a moment|cf-browser-verification|cf-challenge|attention required|checking your browser|enable javascript and cookies/i.test(html || '');
  async function fetchDoc(url) {
    const doc = await M.getDoc(url);
    if (blocked(doc.__html) && doc.querySelectorAll('a[href]').length < 15) throw new Error('El sitio muestra una verificación anti-bots (Cloudflare). La app no puede leer esa página.');
    return doc;
  }
  const bestCluster = items => {
    const m = new Map();
    items.forEach(it => {
      let segs; try { segs = new URL(it.url).pathname.replace(/\/+$/, '').split('/').filter(Boolean); } catch (e) { return; }
      const key = segs.length + ':' + (segs.length > 1 ? segs[0] : '');
      (m.get(key) || m.set(key, { segs, list: [] }).get(key)).list.push(it);
    });
    let best = null; m.forEach(v => { if (!best || v.list.length > best.list.length) best = v; });
    if (!best || best.list.length < 3) return { items, pattern: '' };
    const s = best.segs;
    const pattern = s.length === 1 ? '^/[^/]+/?$' : '^/' + s[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(/[^/]+){' + (s.length - 1) + '}/?$';
    return { items: best.list, pattern };
  };
  const sig = el => {
    const parts = []; let n = el;
    for (let i = 0; i < 3 && n && n.nodeType === 1 && n.tagName !== 'BODY' && n.tagName !== 'HTML'; i++, n = n.parentElement) {
      const cls = [...n.classList].filter(c => !/\d/.test(c) && c.length < 28 && /^[\w-]+$/.test(c)).slice(0, 2);
      parts.unshift(n.tagName.toLowerCase() + cls.map(c => '.' + c).join(''));
    }
    return parts.join(' ');
  };
  function suggest(doc, els, pick) {
    const m = new Map();
    els.forEach(e => { const s = sig(e); (m.get(s) || m.set(s, []).get(s)).push(e); });
    return [...m].map(([sel, a]) => { let n = 0; try { n = [...doc.querySelectorAll(sel)].filter(pick || (() => true)).length; } catch (e) { /* inválido */ } return { sel, n, sample: a[0] }; })
      .filter(x => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 4);
  }
  const sugHtml = (list, field, textFn) => list.length
    ? '<div class="at-sug"><b>Sugerencias (toca una para usarla):</b>' + list.map(x => `<button class="chip" data-sug="${esc(x.sel)}" data-f="${field}">${esc(x.sel)} · ${x.n}${textFn ? ' · ' + esc(textFn(x.sample)) : ''}</button>`).join('') + '</div>'
    : '<div class="at-bad">No encontré patrones repetidos. Puede que el sitio cargue su contenido con JavaScript y la app solo lee el HTML que envía el servidor.</div>';

  // Plantillas a partir de direcciones reales
  function derivePage(u1, u2) {
    let b; try { b = new URL(u2); } catch (e) { return ''; }
    for (const [k, v] of b.searchParams) if (v === '2') { const x = new URL(b.href); const parts = []; b.searchParams.forEach((vv, kk) => parts.push(encodeURIComponent(kk) + '=' + (kk === k ? '{page}' : encodeURIComponent(vv)))); return b.origin + b.pathname + '?' + parts.join('&').replace('%7Bpage%7D', '{page}'); }
    const p = b.pathname.replace(/\/(page|pagina|p|pag)\/2(\/?)$/i, '/$1/{page}$2');
    if (p !== b.pathname) return b.origin + p + b.search;
    const q = b.pathname.replace(/([-_/])2(\/?)$/, '$1{page}$2');
    if (q !== b.pathname) return b.origin + q + b.search;
    return '';
  }
  function deriveSearch(url, word) {
    let u; try { u = new URL(url); } catch (e) { return ''; }
    const forms = [...new Set([encodeURIComponent(word), word, word.replace(/ /g, '+'), encodeURIComponent(word).replace(/%20/g, '+'), word.replace(/ /g, '-'), word.toLowerCase(), encodeURIComponent(word.toLowerCase())])].filter(Boolean);
    let out = u.href, found = false;
    for (const f of forms) { if (out.includes(f)) { out = out.split(f).join('{q}'); found = true; break; } }
    if (!found) return '';
    out = out.replace(/([?&](?:page|paged|pagina|p|pg|_pg)=)1(?=&|$)/i, '$1{page}').replace(/\/(page|pagina)\/1(\/?)/i, '/$1/{page}$2');
    return out;
  }

  /* ---------- miniaturas ---------- */
  function thumbs(items, attr) {
    return '<div class="at-th">' + items.slice(0, 8).map((it, i) => `<button class="at-card" ${attr ? `data-${attr}="${esc(it.url || it.id)}"` : ''}><span class="at-img"><img data-u="${esc(it.cover || '')}" alt="" referrerpolicy="no-referrer"></span><small>${esc(it.title || '')}</small></button>`).join('') + '</div>';
  }
  function loadThumbs(root) {
    const native = M.capHttp() && W.imgRef && W.name !== undefined && origin(W.listUrl || W.chapterUrl || W.seriesUrl);
    root.querySelectorAll('img[data-u]').forEach(im => {
      const u = im.dataset.u; if (!u) return;
      if (native) M.nativeBlobUrl(u, M.nativeRef(origin(W.listUrl || W.chapterUrl || W.seriesUrl)), new Map()).then(b => { im.src = b; }).catch(() => { im.alt = '✗'; });
      else { im.src = u; im.onerror = () => { im.alt = '✗'; }; }
    });
  }
  const out = html => { const r = $('#at-res'); r.innerHTML = html; loadThumbs(r); r.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  const ok = t => `<div class="at-ok">✓ ${t}</div>`, bad = t => `<div class="at-bad">✗ ${t}</div>`, note = t => `<div class="at-note">${t}</div>`;

  /* ---------- pruebas ---------- */
  async function testList() {
    const url = (get('listUrl') || '').replace(/\{page\}/g, '1');
    if (!isUrl(url)) return out(bad('Escribe una dirección completa, que empiece con https://'));
    out('<div class="spin">Leyendo la página…</div>');
    const doc = await fetchDoc(url);
    const sel = W.sel || {};
    let items = P.parseList(doc, url, { item: sel.item, title: sel.title, cover: sel.cover });
    let pattern = '';
    if (!sel.item) { const c = bestCluster(items); items = c.items; pattern = c.pattern; }
    items = items.filter(it => it.title && it.title.length > 1);
    T.list = items; T.listOk = items.length >= 3;
    if (pattern) set('itemPath', pattern); else set('itemPath', '');
    if (!T.listOk) {
      const withImg = [...doc.querySelectorAll('a[href]')].filter(a => a.querySelector('img'));
      return out(bad(`Solo encontré ${items.length} series.`) + note('Prueba con otra página del sitio (el catálogo o "últimas actualizaciones") o elige un patrón:') + sugHtml(suggest(doc, withImg), 'sel.item', e => (e.getAttribute('title') || (e.querySelector('img') || {}).alt || '').slice(0, 18)));
    }
    out(ok(`Encontré ${items.length} series${pattern ? ' (solo enlaces con la forma de las series, para ignorar menús y anuncios)' : ''}.`) + thumbs(items, 'pick') + note('Si los nombres y portadas son correctos, sigue. Toca una serie para usarla en el paso 3. Si las portadas salen vacías prueba activar el Referer en el paso 4.'));
  }
  async function testPage() {
    const u1 = get('listUrl'), u2 = ($('#at-l2') || {}).value || '';
    if (!isUrl(u2)) return out(bad('Pega la dirección de la página 2 del listado.'));
    const t = derivePage(u1, u2);
    if (!t) return out(bad('No pude ver cómo cambia el número de página. Revisa que sea la dirección de la página 2.'));
    set('listUrl', t); $('#at-listUrl').value = t;
    out(ok('Plantilla de páginas: <code>' + esc(t) + '</code>. "Cargar más" usará esta dirección.'));
  }
  async function testSearch() {
    const word = ($('#at-word').value || '').trim(), paste = ($('#at-paste').value || '').trim();
    let tpl = get('searchUrl');
    if (paste) {
      if (!word) return out(bad('Escribe la palabra que buscaste.'));
      tpl = deriveSearch(paste, word);
      if (!tpl) return out(bad('No encontré la palabra "' + esc(word) + '" dentro de esa dirección. Pega la dirección tal cual salió después de buscar.'));
      set('searchUrl', tpl); $('#at-searchUrl').value = tpl;
    }
    if (!tpl) return out(bad('Primero pega la dirección de una búsqueda real.'));
    if (!tpl.includes('{q}')) return out(bad('La plantilla debe incluir {q} donde va el texto.'));
    const test = word || 'a';
    const url = tpl.replace(/\{q\}/g, encodeURIComponent(test)).replace(/\{page\}/g, '1');
    out('<div class="spin">Probando la búsqueda…</div>');
    const doc = await fetchDoc(url); const sel = W.sel || {};
    let items = P.parseList(doc, url, { item: sel.item, title: sel.title, cover: sel.cover });
    if (W.itemPath) { const re = new RegExp(W.itemPath); items = items.filter(it => { try { return re.test(new URL(it.url).pathname); } catch (e) { return false; } }); }
    items = items.filter(it => it.title && it.title.length > 1);
    T.search = items; T.searchOk = items.length >= 1;
    if (!T.searchOk) return out(bad('La búsqueda no devolvió series reconocibles. Puede que el sitio cargue los resultados con JavaScript.') + note('Alternativa: deja la plantilla de búsqueda vacía y la app buscará por nombre dentro de las primeras páginas del listado.'));
    out(ok(`La búsqueda de "${esc(test)}" devolvió ${items.length} series.`) + thumbs(items, 'pick'));
  }
  async function testSeries() {
    const url = get('seriesUrl');
    if (!isUrl(url)) return out(bad('Pega la dirección de una serie (o toca una en los pasos anteriores).'));
    out('<div class="spin">Leyendo la serie…</div>');
    const doc = await fetchDoc(url); const sel = W.sel || {};
    const gen = M.generic(Object.assign({}, W, { id: 'wiz_test' }));
    const d = await gen.detail({ id: url, title: '', cover: '' });
    T.series = d; T.seriesOk = d.chapters.length >= 1; T.chapters = d.chapters;
    const n = d.chapters.length;
    const ch = d.chapters;
    const first = ch.slice(0, 3).map(c => c.title), last = ch.slice(-2).map(c => c.title);
    let html = (n ? ok(`Título: <b>${esc(d.title)}</b>`) : bad(`Título: ${esc(d.title)}`)) + (d.cover ? thumbs([{ cover: d.cover, title: 'Portada' }]) : note('No encontré portada.'));
    html += d.desc ? note('Sinopsis: ' + esc(d.desc.slice(0, 160)) + (d.desc.length > 160 ? '…' : '')) : note('No encontré sinopsis (opcional).');
    if (!n) {
      const path = (() => { try { return new URL(url).pathname.split('/').filter(Boolean)[0] || ''; } catch (e) { return ''; } })();
      const anchors = [...doc.querySelectorAll('a[href]')].filter(a => { const h = a.getAttribute('href') || ''; return !/^#|javascript:/.test(h) && (!path || h.includes(path)) && a.textContent.trim().length > 0; });
      return out(html + bad('No encontré capítulos.') + sugHtml(suggest(doc, anchors), 'sel.chapter', e => M.tidyTitle(e.textContent).slice(0, 18)));
    }
    html += ok(`${n} capítulos. Orden en la app: <b>${esc(first.join(' · '))}</b> … <b>${esc(last.join(' · '))}</b>`);
    html += note('Debe verse del más nuevo al más antiguo. Si está al revés, marca "Invertir el orden". Si aparecen capítulos de otras series, elige un selector más específico:');
    const anchors = [...doc.querySelectorAll('a[href]')].filter(a => ch.some(c => c.id === P.abs(a.getAttribute('href'), url)));
    html += sugHtml(suggest(doc, anchors), 'sel.chapter', e => M.tidyTitle(e.textContent).slice(0, 18));
    out(html + '<div class="at-chs">' + ch.slice(0, 6).concat(ch.length > 9 ? ch.slice(-3) : ch.slice(6, 9)).map(c => `<button class="chip" data-pickch="${esc(c.id)}">${esc(c.title)}</button>`).join('') + '</div>');
  }
  async function testChapter() {
    const url = get('chapterUrl');
    if (!isUrl(url)) return out(bad('Pega la dirección de un capítulo (o toca uno de la lista del paso 3).'));
    out('<div class="spin">Leyendo el capítulo…</div>');
    const doc = await fetchDoc(url); const sel = W.sel || {};
    const urls = P.readerImages(doc, url, { image: sel.image });
    T.pages = urls; T.chapOk = urls.length >= 1;
    if (!urls.length) {
      const imgs = [...doc.querySelectorAll('img')].filter(i => P.imgSrc(i, url));
      return out(bad('No encontré imágenes del capítulo.') + sugHtml(suggest(doc, imgs), 'sel.image', e => (P.imgSrc(e, url) || '').split('/').pop().slice(0, 16)));
    }
    out(ok(`${urls.length} imágenes. Las primeras:`) + thumbs(urls.slice(0, 4).map((u, i) => ({ cover: u, title: 'Pág. ' + (i + 1) }))) + note('Si salen vacías (✗), activa el Referer y vuelve a probar. Si hay imágenes de más (anuncios, logos) elige un selector:') + sugHtml(suggest(doc, [...doc.querySelectorAll('img')].filter(i => P.imgSrc(i, url)), null), 'sel.image', e => (P.imgSrc(e, url) || '').split('/').pop().slice(0, 16)));
  }

  /* ---------- pantallas ---------- */
  const field = (label, key, ph, help, type) => `<label>${label}${help ? `<small>${help}</small>` : ''}<input id="at-${key.replace('.', '-')}" data-f="${key}" value="${esc(get(key))}" placeholder="${esc(ph || '')}" ${type === 'url' ? 'inputmode="url" autocapitalize="none" autocorrect="off" spellcheck="false"' : ''}></label>`;
  const check = (label, key) => `<label class="tog"><input type="checkbox" data-c="${key}" ${get(key) ? 'checked' : ''}> ${label}</label>`;
  const SCREENS = [
    () => `<p class="hint">Vamos paso a paso. En cada paso la app <b>prueba lo que le das</b> y te muestra qué entendió.</p>
      ${field('Nombre de la página', 'name', 'Mi sitio')}
      ${field('Dirección donde el sitio lista sus series', 'listUrl', 'https://sitio.com/catalogo', 'Abre el sitio en tu navegador, entra al catálogo (o "últimas actualizaciones") y copia la dirección de la barra.', 'url')}
      <div class="row"><button class="btn" id="at-test">Probar listado</button></div>
      <details><summary>¿Tiene varias páginas? (para "Cargar más")</summary>
        <label>Dirección de la página 2 de ese listado<input id="at-l2" inputmode="url" placeholder="https://sitio.com/catalogo?page=2"></label>
        <button class="btn ghost" id="at-test2">Deducir paginación</button></details>
      <details><summary>Selectores CSS (solo si la prueba falla)</summary>
        ${field('Cada resultado', 'sel.item', 'div.card a')}${field('Título (dentro del resultado)', 'sel.title', '.title')}${field('Portada (dentro del resultado)', 'sel.cover', 'img')}</details>
      <details><summary>Importar una configuración guardada</summary>
        <label>Pega el texto copiado desde el paso 5<textarea id="at-imp" rows="3"></textarea></label>
        <button class="btn ghost" id="at-impbtn">Importar</button></details>`,
    () => `<p class="hint">Para que la búsqueda funcione la app necesita ver <b>cómo busca el sitio</b>:</p>
      <ol class="at-ol"><li>En el sitio, busca una palabra, por ejemplo <b>naruto</b>.</li><li>Copia la dirección de la barra del navegador, tal como quedó.</li><li>Pégala abajo y escribe la palabra que usaste.</li></ol>
      <label>Palabra que buscaste<input id="at-word" placeholder="naruto" autocapitalize="none"></label>
      <label>Dirección de los resultados<input id="at-paste" inputmode="url" placeholder="https://sitio.com/?s=naruto" autocapitalize="none"></label>
      <div class="row"><button class="btn" id="at-test">Probar búsqueda</button></div>
      ${field('Plantilla (se rellena sola, puedes editarla)', 'searchUrl', 'https://sitio.com/?s={q}', 'Usa {q} donde va el texto y {page} donde va el número de página.', 'url')}
      <p class="hint small">Si el sitio no tiene búsqueda o no funciona, deja la plantilla vacía: la app filtrará por nombre el listado del paso 1.</p>`,
    () => `<p class="hint">Ahora una serie del sitio: toca una de las que salieron antes o pega su dirección.</p>
      ${field('Dirección de una serie', 'seriesUrl', 'https://sitio.com/manga/mi-serie', '', 'url')}
      <div class="row"><button class="btn" id="at-test">Probar serie</button></div>
      ${check('Invertir el orden de capítulos', 'reverse')}
      <details><summary>Selectores CSS (solo si la prueba falla)</summary>
        ${field('Enlaces de capítulos', 'sel.chapter', '.chapters a')}${field('Sinopsis', 'sel.desc', '.summary')}${field('Título de la serie', 'sel.dTitle', 'h1')}</details>`,
    () => `<p class="hint">Último dato: un capítulo. Toca uno de la lista del paso 3 o pega su dirección.</p>
      ${field('Dirección de un capítulo', 'chapterUrl', 'https://sitio.com/manga/mi-serie/capitulo-1', '', 'url')}
      <div class="row"><button class="btn" id="at-test">Probar capítulo</button></div>
      ${check('Enviar el Referer del sitio al cargar imágenes (actívalo si salen en blanco)', 'imgRef')}
      <details><summary>Selectores CSS (solo si la prueba falla)</summary>${field('Imágenes del capítulo', 'sel.image', '.reader img')}</details>`,
    () => {
      const row = (okf, tt, hint) => `<div class="${okf ? 'at-ok' : 'at-note'}">${okf ? '✓' : '–'} ${tt}${okf ? '' : ' <small>(' + hint + ')</small>'}</div>`;
      return `<p class="hint">Resumen de lo que probaste:</p>
      ${row(T.listOk, 'Listado de series', 'no probado')}${row(T.searchOk || (!get('searchUrl') && T.listOk), 'Búsqueda', 'no probada')}${row(T.seriesOk, 'Serie y capítulos', 'no probado')}${row(T.chapOk, 'Lector (imágenes)', 'no probado')}
      ${field('Nombre de la fuente', 'name', 'Mi sitio')}
      ${check('Contenido para adultos (+18)', 'adult')}
      <div class="row"><button class="btn" id="at-save">Guardar y usar</button><button class="btn ghost" id="at-copy">Copiar configuración</button></div>
      <p class="hint small">"Copiar configuración" te da un texto con todo lo configurado para guardarlo o compartirlo; se importa en el paso 1.</p>`;
    }
  ];
  function render() {
    $('#at-title').textContent = `Paso ${step + 1} de 5 · ${NAMES[step]}`;
    $('#at-bar').style.width = ((step + 1) * 20) + '%';
    $('#at-body').innerHTML = SCREENS[step]() + '<div id="at-res"></div>';
    $('#at-prev').hidden = step === 0; $('#at-next').hidden = step === 4;
  }
  const guard = fn => async () => {
    if (busy) return; busy = true;
    try { await fn(); } catch (e) { out(bad(esc(e.message || e))); } finally { busy = false; }
  };
  function saveW() {
    const name = (get('name') || '').trim();
    if (!name) { M.toast('Ponle un nombre a la fuente'); return false; }
    if (!isUrl(get('listUrl')) && !isUrl(get('searchUrl'))) { M.toast('Falta la dirección del listado (paso 1)'); return false; }
    const cfg = JSON.parse(JSON.stringify(W));
    cfg.name = name; cfg.id = cfg.id || 'c_' + Date.now().toString(36);
    cfg.site = origin(cfg.listUrl || cfg.searchUrl);
    delete cfg.seriesUrl; delete cfg.chapterUrl;
    if (!cfg.adult) delete cfg.adult;
    M.saveCfg(cfg); return true;
  }
  const run = {
    0: () => ({ '#at-test': testList, '#at-test2': testPage }),
    1: () => ({ '#at-test': testSearch }), 2: () => ({ '#at-test': testSeries }), 3: () => ({ '#at-test': testChapter }), 4: () => ({})
  };

  function open(cfg) {
    W = cfg ? Object.assign(blank(), JSON.parse(JSON.stringify(cfg))) : blank();
    step = 0; T = {};
    M.showOverlay('adapt'); render();
  }
  function build() {
    const d = document.createElement('div');
    d.id = 'adapt'; d.className = 'overlay'; d.hidden = true;
    d.innerHTML = `<header class="obar"><button id="at-x" aria-label="Cerrar">‹</button><span id="at-title"></span></header><div class="at-prog"><i id="at-bar"></i></div>
      <div id="at-body" class="obody"></div>
      <footer class="at-foot"><button class="btn ghost" id="at-prev">‹ Atrás</button><button class="btn" id="at-next">Siguiente ›</button></footer>`;
    document.body.appendChild(d);
    $('#at-x').onclick = () => M.goBack();
    $('#at-prev').onclick = () => { step = Math.max(0, step - 1); render(); $('#at-body').scrollTop = 0; };
    $('#at-next').onclick = () => { step = Math.min(4, step + 1); render(); $('#at-body').scrollTop = 0; };
    d.addEventListener('input', e => { const f = e.target.dataset && e.target.dataset.f; if (f) set(f, e.target.value.trim()); });
    d.addEventListener('change', e => { const c = e.target.dataset && e.target.dataset.c; if (c) set(c, e.target.checked); });
    d.addEventListener('click', async e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.sug) { const f = t.dataset.f; if (f) { set(f, t.dataset.sug); const inp = $(`[data-f="${f}"]`); if (inp) { inp.value = t.dataset.sug; const det = inp.closest('details'); if (det) det.open = true; } M.toast('Selector aplicado: vuelve a probar'); } return; }
      if (t.dataset.pick) { set('seriesUrl', t.dataset.pick); M.toast('Serie elegida para el paso 3'); return; }
      if (t.dataset.pickch) { set('chapterUrl', t.dataset.pickch); M.toast('Capítulo elegido para el paso 4'); return; }
      const map = run[step](); const id = '#' + t.id;
      if (map[id]) return guard(map[id])();
      if (t.id === 'at-save') { if (saveW()) { M.toast('Fuente guardada. Búscala en Explorar'); M.goBack(); } return; }
      if (t.id === 'at-copy') {
        const cfg = JSON.parse(JSON.stringify(W)); delete cfg.seriesUrl; delete cfg.chapterUrl; const txt = JSON.stringify(cfg);
        try { await navigator.clipboard.writeText(txt); M.toast('Configuración copiada'); } catch (er) { prompt('Copia este texto:', txt); }
        return;
      }
      if (t.id === 'at-impbtn') {
        try { const o = JSON.parse($('#at-imp').value); if (!o || typeof o !== 'object' || !o.listUrl && !o.searchUrl) throw new Error('x'); W = Object.assign(blank(), o); delete W.id; render(); M.toast('Configuración importada'); }
        catch (er) { M.toast('El texto no es una configuración válida'); }
      }
    });
  }
  build();
  window.MR_ADAPT = { open, _t: { deriveSearch, derivePage, bestCluster } };
})();
