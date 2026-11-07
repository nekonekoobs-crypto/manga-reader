/* Fuentes y ajustes: elegir, crear, editar y borrar fuentes; ajustes generales */
import { $ } from '../lib/dom.js';
import { save } from '../models/state.js';
import { srcById } from '../models/sources/index.js';
import { saveCustomSource, findCustomSource, deleteCustomSource, setCurrentSource } from '../models/sources/custom.js';
import { setLang, setOption } from '../models/settings.model.js';
import { toast } from '../views/toast.view.js';
import { renderSources, fillSrcForm, hideSrcForm, readSrcForm } from '../views/sources.view.js';
import { renderSrcSelect } from '../views/explore.view.js';
import { openAdapt } from '../features/adapt/adapt.js';
import { runDiagnostics } from './diagnostics.controller.js';

let editing = null;

function saveSrcForm() {
  const { name, searchUrl, sel } = readSrcForm();
  if (!name) return toast('Ponle un nombre a la fuente');
  if (searchUrl && !/^https?:\/\//i.test(searchUrl)) return toast('La URL debe empezar con http:// o https://');
  if (searchUrl && !searchUrl.includes('{q}')) return toast('La URL de búsqueda debe incluir {q}');
  for (const v of Object.values(sel)) {
    try { document.querySelector(v); } catch (e) { return toast('Selector CSS no válido: ' + v); }
  }
  const prev = findCustomSource(editing) || {};
  saveCustomSource(Object.assign({}, prev, { id: editing || 'c_' + Date.now().toString(36), name, searchUrl, sel }));
  hideSrcForm(); renderSources(); renderSrcSelect();
  toast('Fuente guardada. Búscala en Explorar');
}

// Guarda una fuente creada por el asistente y refresca las listas
export function installSource(cfg) { saveCustomSource(cfg); renderSources(); renderSrcSelect(); }
export function refreshSourceViews() { renderSources(); renderSrcSelect(); }

export function bindSources() {
  $('#srclist').addEventListener('click', e => {
    const row = e.target.closest('.srow'); const b = e.target.closest('button');
    if (!row || !b) return;
    const id = row.dataset.id;
    if (b.dataset.act === 'pick') { setCurrentSource(id); renderSources(); renderSrcSelect(); toast('Fuente activa: ' + srcById(id).name); }
    if (b.dataset.act === 'edit') {
      const c = findCustomSource(id);
      if (c && c.wiz) openAdapt(c); else { editing = c ? c.id : null; fillSrcForm(c); }
    }
    if (b.dataset.act === 'del') {
      if (!confirm('¿Borrar esta fuente?')) return;
      deleteCustomSource(id); renderSources(); renderSrcSelect();
    }
  });
  $('#addsrc').addEventListener('click', () => { editing = null; fillSrcForm(null); });
  const adaptBtn = $('#adaptbtn');
  if (adaptBtn) adaptBtn.addEventListener('click', () => openAdapt(null));
  $('#f-save').addEventListener('click', saveSrcForm);
  $('#f-cancel').addEventListener('click', hideSrcForm);
  // Opcional: si el index.html instalado es una versión anterior sin este botón, no debe detener el arranque.
  const diagBtn = $('#s-diag');
  if (diagBtn) diagBtn.addEventListener('click', runDiagnostics);

  $('#settings').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.lang && !setLang(t.dataset.lang, t.checked)) toast('Debe haber al menos un idioma');
    if (t.id === 's-saver') setOption('saver', t.checked);
    if (t.id === 's-adult') {
      if (t.checked && !confirm('Esto mostrará contenido para mayores de 18 años. ¿Eres mayor de edad?')) { t.checked = false; return; }
      setOption('adult', t.checked);
    }
    save(); renderSources();
  });
}
