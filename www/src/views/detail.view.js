/* Vista Detalle: ficha de la serie y lista de capítulos */
import { $, esc } from '../lib/dom.js';
import { S, keyOf } from '../models/state.js';
import { V } from '../models/session.js';
import { STATUS } from '../config/constants.js';
import { coverImg, hydrate } from './images.view.js';

export function renderDetail() {
  const D = V.D;
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
