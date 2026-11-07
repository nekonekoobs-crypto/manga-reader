/* Biblioteca: favoritos, historial y capítulos leídos */
import { S, save, keyOf } from './state.js';

export const isFav = key => S.fav.some(f => f.key === key);
export const recentHistory = (n = 30) => Object.values(S.hist).sort((a, b) => b.ts - a.ts).slice(0, n);

// Añade o quita la serie de favoritos; devuelve true si quedó añadida
export function toggleFav(item) {
  const key = keyOf(item);
  const i = S.fav.findIndex(f => f.key === key);
  let added = false;
  if (i >= 0) S.fav.splice(i, 1);
  else { S.fav.unshift({ key, src: item.src, id: item.id, title: item.title, cover: item.cover }); added = true; }
  save();
  return added;
}
export function markRead(item, ch) {
  const k = keyOf(item);
  if (!S.read[k]) S.read[k] = {};
  S.read[k][ch.id] = 1;
  S.hist[k] = { item: { src: item.src, id: item.id, title: item.title, cover: item.cover }, chapterId: ch.id, chapterTitle: ch.title, ts: Date.now() };
  save();
}
export function removeHistory(key) { delete S.hist[key]; save(); }
export function removeFavorite(key) { S.fav = S.fav.filter(f => f.key !== key); save(); }
