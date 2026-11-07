/* Respaldo: exporta favoritos, historial, capítulos leídos y fuentes propias; importa uniéndolos con lo que ya hay */
import { S, save } from './state.js';

export const backupData = () => ({ app: 'mangareader', v: 1, at: new Date().toISOString(), fav: S.fav, hist: S.hist, read: S.read, sources: S.sources });

// Une un respaldo con los datos actuales; devuelve cuántos elementos nuevos entraron
export function mergeBackup(o) {
  if (!o || o.app !== 'mangareader' || typeof o !== 'object') throw new Error('Este archivo no es un respaldo de Lector OBS');
  let nf = 0, nh = 0, ns = 0;
  (Array.isArray(o.fav) ? o.fav : []).forEach(f => { if (f && f.key && !S.fav.some(x => x.key === f.key)) { S.fav.push(f); nf++; } });
  Object.entries(o.hist && typeof o.hist === 'object' ? o.hist : {}).forEach(([k, h]) => { if (h && h.item && (!S.hist[k] || (h.ts || 0) > (S.hist[k].ts || 0))) { S.hist[k] = h; nh++; } });
  Object.entries(o.read && typeof o.read === 'object' ? o.read : {}).forEach(([k, m]) => { if (m && typeof m === 'object') S.read[k] = Object.assign({}, S.read[k] || {}, m); });
  (Array.isArray(o.sources) ? o.sources : []).forEach(c => { if (c && c.id && c.name && !S.sources.some(x => x.id === c.id)) { S.sources.push(c); ns++; } });
  save();
  return { nf, nh, ns };
}
