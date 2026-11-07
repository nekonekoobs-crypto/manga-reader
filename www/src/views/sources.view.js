/* Vista Fuentes y ajustes: lista de fuentes, ajustes y formulario manual */
import { $, esc } from '../lib/dom.js';
import { S } from '../models/state.js';
import { LANGS } from '../config/constants.js';
import { allSources } from '../models/sources/index.js';

export function renderSources() {
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

export function fillSrcForm(cfg) {
  const s = (cfg && cfg.sel) || {};
  $('#sf-title').textContent = cfg ? 'Editar fuente' : 'Nueva fuente';
  $('#f-name').value = cfg ? cfg.name : ''; $('#f-search').value = cfg ? cfg.searchUrl || '' : '';
  $('#f-item').value = s.item || ''; $('#f-title').value = s.title || ''; $('#f-cover').value = s.cover || '';
  $('#f-desc').value = s.desc || ''; $('#f-chapter').value = s.chapter || ''; $('#f-image').value = s.image || '';
  $('#srcform').hidden = false;
  $('#srcform').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
export const hideSrcForm = () => { $('#srcform').hidden = true; };
// Lee el formulario; devuelve { name, searchUrl, sel }
export function readSrcForm() {
  const sel = {};
  [['item', 'f-item'], ['title', 'f-title'], ['cover', 'f-cover'], ['desc', 'f-desc'], ['chapter', 'f-chapter'], ['image', 'f-image']]
    .forEach(([k, id]) => { const v = $('#' + id).value.trim(); if (v) sel[k] = v; });
  return { name: $('#f-name').value.trim(), searchUrl: $('#f-search').value.trim(), sel };
}
