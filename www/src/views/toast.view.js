/* Aviso breve en pantalla */
import { $ } from '../lib/dom.js';

let toastT = 0;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
}
