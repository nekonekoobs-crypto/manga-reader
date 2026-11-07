/* Caché de géneros por serie: se averiguan leyendo la ficha de cada serie y se guardan en el dispositivo */
import { keyOf } from '../state.js';
import { srcById } from '../sources/index.js';

export const TAGC = (() => { try { return JSON.parse(localStorage.getItem('mr:tagc') || '{}') || {}; } catch (e) { return {}; } })();
let tagcT;
export const tagcSave = () => { clearTimeout(tagcT); tagcT = setTimeout(() => { const ks = Object.keys(TAGC); if (ks.length > 3000) ks.slice(0, ks.length - 3000).forEach(k => delete TAGC[k]); try { localStorage.setItem('mr:tagc', JSON.stringify(TAGC)); } catch (e) { /* sin espacio */ } }, 800); };
export async function tagsOf(it) {
  const k = keyOf(it);
  if (TAGC[k]) return TAGC[k];
  const src = srcById(it.src);
  const d = await src.detail(it);
  const t = (d && d.tags) || [];
  if (t.length) { TAGC[k] = t; tagcSave(); }
  return t;
}
