/* Cuadro de texto del diagnóstico */
import { $ } from '../lib/dom.js';

export function createDiagLog() {
  const out = $('#diag');
  out.hidden = false;
  const lines = [];
  return s => { lines.push(s); out.textContent = lines.join('\n'); };
}
