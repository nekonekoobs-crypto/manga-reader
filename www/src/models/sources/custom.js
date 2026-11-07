/* Fuentes propias del usuario (formulario manual y asistente de adaptación) */
import { S, save } from '../state.js';

// Crea o reemplaza una fuente propia y la deja como fuente activa
export function saveCustomSource(cfg) {
  const i = S.sources.findIndex(x => x.id === cfg.id);
  if (i >= 0) S.sources[i] = cfg; else S.sources.push(cfg);
  S.current = cfg.id;
  save();
}
export const findCustomSource = id => S.sources.find(s => s.id === id);
export function deleteCustomSource(id) {
  S.sources = S.sources.filter(s => s.id !== id);
  if (S.current === id) S.current = 'mangadex';
  save();
}
export function setCurrentSource(id) { S.current = id; save(); }
