/* Vista del panel de respaldo (debajo de los ajustes) */
import { $ } from '../lib/dom.js';

const BK_HTML = `<div id="backup" class="panel"><h3>Respaldo</h3>
    <p class="hint">Guarda tus favoritos, historial y fuentes en un archivo (por ejemplo en tu Google Drive) y recupéralos en otro teléfono o después de reinstalar.</p>
    <button class="btn ghost wide" data-bk="export">Exportar respaldo</button>
    <button class="btn ghost wide" data-bk="file">Importar desde archivo</button>
    <button class="btn ghost wide" data-bk="text">Importar desde texto pegado</button>
    <textarea id="bk-text" rows="6" hidden placeholder="Pega aquí el respaldo"></textarea>
    <button class="btn wide" id="bk-go" data-bk="go" hidden>Importar</button>
    <input type="file" id="bk-file" accept=".json,application/json,text/plain" hidden></div>`;
export const mountBackupPanel = () => $('#settings').insertAdjacentHTML('afterend', BK_HTML);
export const showTextBox = (text, withImport) => { const t = $('#bk-text'); t.hidden = false; $('#bk-go').hidden = !withImport; t.value = text; t.focus(); if (!withImport) t.select(); };
export const hideTextBox = () => { $('#bk-text').hidden = true; $('#bk-go').hidden = true; $('#bk-text').value = ''; };
export const readTextBox = () => $('#bk-text').value;
export const pickFile = () => $('#bk-file').click();
