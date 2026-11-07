/* Fuente MangaDex (API oficial) */
import { S } from '../state.js';
import { http } from '../../lib/http.js';
import { nrm } from '../../lib/text.js';
import { gDef } from '../genres/catalog.js';

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

export const mangadex = {
  id: 'mangadex', name: 'MangaDex', builtin: true, nativeGenres: true,
  async search(q, page) {
    const p = new URLSearchParams();
    p.set('limit', '24'); p.set('offset', String(page * 24));
    if (q) p.set('title', q);
    p.append('includes[]', 'cover_art');
    ratings().forEach(r => p.append('contentRating[]', r));
    if (S.genres.length) { for (const g of S.genres) { const id = await mdTagId(g); if (id) p.append('includedTags[]', id); } p.set('includedTagsMode', 'AND'); }
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
let mdTags = null;
async function mdTagId(name) {
  if (!mdTags) { const j = await http(`${MD}/manga/tag`, 'json'); mdTags = new Map(); (j.data || []).forEach(t => mdTags.set(nrm((t.attributes.name || {}).en), t.id)); }
  for (const k of gDef(name).keys) { const id = mdTags.get(k); if (id) return id; }
  return null;
}
