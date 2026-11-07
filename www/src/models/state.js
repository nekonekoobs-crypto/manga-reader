/* Estado global de la aplicación y su persistencia */
import { store } from '../lib/storage.js';

export const S = {
  sources: store.get('sources', []),
  fav: store.get('fav', []),
  hist: store.get('hist', {}),
  read: store.get('read', {}),
  current: store.get('current', 'manhwaweb'),
  set: Object.assign({ langs: ['es', 'es-la', 'en'], saver: false, adult: false, gap: false, narrow: false }, store.get('settings', {})),
  genres: [] // géneros marcados en el filtro (solo en memoria)
};
export const save = () => {
  store.set('sources', S.sources); store.set('fav', S.fav); store.set('hist', S.hist);
  store.set('read', S.read); store.set('current', S.current); store.set('settings', S.set);
};
export const keyOf = it => it.src + ':' + it.id;
export const cache = {}; // clave -> serie, para abrirla desde las tarjetas
