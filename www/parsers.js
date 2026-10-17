/* Detección automática de portadas, capítulos y páginas en cualquier sitio.
   Funciona en el navegador (window.MR_PARSERS) y en Node (para pruebas). */
(function (root) {
  'use strict';

  const SRC_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-cfsrc', 'data-url', 'data-echo', 'src'];
  const BAD_IMG = /(logo|banner|avatar|icon|sprite|emoji|loading|placeholder|gravatar|favicon|pixel|[\/_.-]ads?[\/_.-])/i;
  const CH_RE = /(chapter|chap\b|cap[ií]tulo|cap[\s._-]?\d|\bch[\s._-]?\d|episode|episodio|\bep[\s._-]?\d|\/c\d+|\/ch\d+)/i;

  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();

  function abs(u, base) {
    if (!u) return '';
    u = String(u).trim();
    if (!u || /^(javascript:|#|mailto:|tel:|data:)/i.test(u)) return '';
    try { return new URL(u, base).href; } catch (e) { return ''; }
  }

  function bgImage(el) {
    const st = el && el.getAttribute && el.getAttribute('style');
    const m = st && st.match(/url\((['"]?)(.*?)\1\)/i);
    return m ? m[2] : '';
  }

  function imgSrc(img, base) {
    if (!img || !img.getAttribute) return '';
    for (const a of SRC_ATTRS) {
      const v = img.getAttribute(a);
      if (v && v.trim()) {
        const u = abs(v.trim().split(/\s+/)[0], base);
        if (u) return u;
      }
    }
    const ss = img.getAttribute('data-srcset') || img.getAttribute('srcset');
    if (ss) {
      const u = abs(ss.split(',')[0].trim().split(/\s+/)[0], base);
      if (u) return u;
    }
    return abs(bgImage(img), base);
  }

  function sameHost(a, b) {
    try { return new URL(a).host === new URL(b).host; } catch (e) { return false; }
  }

  /* Lista de resultados de búsqueda: [{title, cover, url}] */
  function parseList(doc, base, sel) {
    sel = sel || {};
    const nodes = sel.item
      ? [...doc.querySelectorAll(sel.item)]
      : [...doc.querySelectorAll('a[href]')].filter(a => a.querySelector('img'));
    const seen = new Set();
    const out = [];
    for (const n of nodes) {
      const a = n.matches && n.matches('a[href]') ? n : n.querySelector('a[href]');
      if (!a) continue;
      const href = abs(a.getAttribute('href'), base);
      if (!href || seen.has(href) || href === base) continue;
      if (!sel.item && !sameHost(href, base)) continue;
      const img = sel.cover ? n.querySelector(sel.cover) : n.querySelector('img');
      const cover = imgSrc(img, base) || bgImage(n) && abs(bgImage(n), base) || '';
      const tEl = sel.title ? n.querySelector(sel.title) : null;
      const title = clean(
        (tEl && tEl.textContent) || a.getAttribute('title') || (img && img.getAttribute('alt')) || a.textContent
      );
      if (!title && !sel.item) continue;
      seen.add(href);
      out.push({ title: title || href, cover, url: href });
    }
    return out;
  }

  function chapterNum(t) {
    t = String(t || '');
    const m = t.match(/(?:cap[ií]tulo|chapter|chap|cap|ch|episode|episodio|ep)\.?\s*(\d+(?:\.\d+)?)/i) || t.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  }

  /* Capítulos de una serie: [{id (url), title}] del más nuevo al más antiguo */
  function parseChapters(doc, base, sel) {
    sel = sel || {};
    let links;
    if (sel.chapter) {
      links = [...doc.querySelectorAll(sel.chapter)]
        .map(el => (el.matches && el.matches('a[href]') ? el : el.querySelector('a[href]')))
        .filter(Boolean);
    } else {
      links = [...doc.querySelectorAll('a[href]')]
        .filter(a => CH_RE.test(a.getAttribute('href') || '') || CH_RE.test(a.textContent || ''));
    }
    const seen = new Set();
    let out = [];
    for (const a of links) {
      const href = abs(a.getAttribute('href'), base);
      if (!href || href === base || seen.has(href)) continue;
      if (!sel.chapter && !sameHost(href, base)) continue;
      seen.add(href);
      let t = clean(a.textContent);
      if (!t || t.length > 90) {
        t = clean(a.getAttribute('title'));
        if (!t) {
          let last = href.split(/[?#]/)[0].split('/').filter(Boolean).pop() || '';
          try { last = decodeURIComponent(last); } catch (e) { /* ignore */ }
          t = last.replace(/[-_]+/g, ' ');
        }
      }
      out.push({ id: href, title: t });
    }
    if (out.length > 1) {
      const a = chapterNum(out[0].title);
      const b = chapterNum(out[out.length - 1].title);
      if (a != null && b != null && a < b) out.reverse();
    }
    return out;
  }

  function scriptImages(html, base) {
    const t = String(html || '').replace(/\\\//g, '/');
    const re = /https?:\/\/[^"'\s<>\\)]+?\.(?:jpe?g|png|webp)(?:\?[^"'\s<>\\)]*)?/gi;
    const found = t.match(re) || [];
    return [...new Set(found)].filter(u => !BAD_IMG.test(u));
  }

  /* Páginas de un capítulo: lista de URLs de imagen en orden */
  function readerImages(doc, base, sel) {
    sel = sel || {};
    let imgs;
    if (sel.image) {
      imgs = [...doc.querySelectorAll(sel.image)];
    } else {
      imgs = [...doc.querySelectorAll('img')].filter(i => {
        const s = imgSrc(i, base);
        return s && !BAD_IMG.test(s) && !/\.(svg|gif)(\?|$)/i.test(s);
      });
      const counts = new Map();
      imgs.forEach(i => {
        let p = i.parentElement, d = 0;
        while (p && d < 4) { counts.set(p, (counts.get(p) || 0) + 1); p = p.parentElement; d++; }
      });
      let best = null, bc = 0;
      counts.forEach((c, el) => {
        if (c > bc || (c === bc && best && best.contains(el))) { best = el; bc = c; }
      });
      if (best && bc >= 2) imgs = imgs.filter(i => best.contains(i));
    }
    let urls = [...new Set(imgs.map(i => imgSrc(i, base)).filter(Boolean))];
    if (urls.length < 2 && doc.__html) {
      const alt = scriptImages(doc.__html, base);
      if (alt.length > urls.length) urls = alt;
    }
    return urls;
  }

  function looksLikeChapterUrl(u) {
    try { return CH_RE.test(new URL(u).pathname); } catch (e) { return false; }
  }

  const api = { abs, imgSrc, parseList, parseChapters, readerImages, scriptImages, chapterNum, clean, looksLikeChapterUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MR_PARSERS = api;
})(typeof window !== 'undefined' ? window : globalThis);
