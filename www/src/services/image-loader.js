/* Carga de imágenes con la red nativa (Capacitor) para fuentes que exigen Referer.
   Una etiqueta <img> no permite fijar cabeceras; con Capacitor se descargan con CapacitorHttp y se muestran como blob.
   Sin Capacitor (navegador) o en fuentes sin cabeceras se usa el <img> normal. */
import { srcById } from '../models/sources/index.js';

export const capHttp = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) || null;
export const nativeHeaders = srcId => { const s = srcById(srcId); return (s && s.imgHeaders) || null; };
export const coverBlobs = new Map(); // portadas: duran toda la sesión
export const pageBlobs = new Map();  // páginas del capítulo abierto: se liberan al cambiar de capítulo
export async function nativeBlobUrl(url, headers, cacheMap) {
  if (cacheMap.has(url)) return cacheMap.get(url);
  const r = await capHttp().request({
    url, method: 'GET', responseType: 'blob',
    headers: Object.assign({ Accept: 'image/avif,image/webp,image/*,*/*;q=0.8', 'User-Agent': navigator.userAgent }, headers)
  });
  if (!r || r.status < 200 || r.status >= 300 || !r.data) throw new Error('HTTP ' + (r ? r.status : '?'));
  const bin = atob(r.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const h = r.headers || {};
  const type = h['Content-Type'] || h['content-type'] || 'image/webp';
  const u = URL.createObjectURL(new Blob([bytes], { type }));
  cacheMap.set(url, u);
  return u;
}
export function srcFor(srcId, url, cacheMap) {
  const hd = capHttp() && nativeHeaders(srcId);
  return hd ? nativeBlobUrl(url, hd, cacheMap) : Promise.resolve(url);
}
export const clearPageBlobs = () => { pageBlobs.forEach(u => URL.revokeObjectURL(u)); pageBlobs.clear(); };
