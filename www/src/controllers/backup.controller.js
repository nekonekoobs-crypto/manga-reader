/* Respaldo manual: exportar e importar */
import { $ } from '../lib/dom.js';
import { backupData, mergeBackup } from '../models/backup.model.js';
import { toast } from '../views/toast.view.js';
import { mountBackupPanel, showTextBox, hideTextBox, readTextBox, pickFile } from '../views/backup.view.js';
import { renderLibrary } from '../views/library.view.js';
import { refreshSourceViews } from './sources.controller.js';

function importText(text) {
  let o;
  try { o = JSON.parse(String(text || '').trim()); } catch (e) { toast('El texto no es un respaldo válido'); return; }
  try {
    const r = mergeBackup(o);
    refreshSourceViews(); renderLibrary();
    toast(`Importado: ${r.nf} favoritos, ${r.nh} del historial, ${r.ns} fuentes`);
    hideTextBox();
  } catch (e) { toast(e.message || 'No se pudo importar'); }
}

async function exportBackup() {
  const text = JSON.stringify(backupData());
  const name = 'manga-reader-respaldo-' + new Date().toISOString().slice(0, 10) + '.json';
  try {
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Respaldo de Lector OBS' });
      toast('Respaldo listo');
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  // Sin "compartir archivo": se muestra el texto y se copia al portapapeles
  showTextBox(text, false);
  try { await navigator.clipboard.writeText(text); toast('Respaldo copiado. Pégalo en una nota o en Drive'); }
  catch (e) { toast('Copia el texto del cuadro y guárdalo'); }
}

export function bindBackup() {
  mountBackupPanel();
  $('#backup').addEventListener('click', e => {
    const b = e.target.closest('[data-bk]');
    if (!b) return;
    if (b.dataset.bk === 'export') exportBackup();
    if (b.dataset.bk === 'file') pickFile();
    if (b.dataset.bk === 'text') showTextBox('', true);
    if (b.dataset.bk === 'go') importText(readTextBox());
  });
  $('#bk-file').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { importText(await f.text()); } catch (err) { toast('No se pudo leer el archivo'); }
  });
}
