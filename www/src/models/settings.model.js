/* Ajustes del usuario */
import { S, save } from './state.js';

// Marca o desmarca un idioma de capítulos; devuelve false si se intentó dejar la lista vacía
export function setLang(code, on) {
  const set = new Set(S.set.langs);
  on ? set.add(code) : set.delete(code);
  let ok = true;
  if (!set.size) { set.add('en'); ok = false; }
  S.set.langs = [...set];
  save();
  return ok;
}
export function setOption(name, value) { S.set[name] = value; save(); }
