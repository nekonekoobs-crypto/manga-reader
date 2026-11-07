/* Serie abierta y su ficha: carga la información y los capítulos desde la fuente */
import { V } from './session.js';
import { keyOf, cache } from './state.js';
import { srcById } from './sources/index.js';

// Crea la serie abierta (V.D) y devuelve la promesa que la completa; `onDone` se llama al terminar
export function startSeries(item) {
  const src = srcById(item.src);
  const D = V.D = { item: Object.assign({}, item), src, info: null, chapters: [], err: null, asc: false, full: false };
  const done = (async () => {
    try {
      const info = await src.detail(D.item);
      if (V.D !== D) return;
      D.info = info; D.chapters = info.chapters || [];
      D.item.title = info.title || D.item.title;
      D.item.cover = info.cover || D.item.cover;
      cache[keyOf(D.item)] = D.item;
    } catch (e) { D.err = e.message || String(e); }
  })();
  return { D, done };
}
