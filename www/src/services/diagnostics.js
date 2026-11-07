/* Diagnóstico de imágenes: pide una portada real de ManhwaWeb de cuatro maneras y devuelve lo que responde el servidor */
import { http } from '../lib/http.js';
import { MW, MW_H } from '../models/sources/manhwaweb.js';
import { capHttp } from './image-loader.js';

// `out` recibe cada línea de resultado a medida que aparece
export async function runDiag(log) {
  const cap = capHttp();
  log('Diagnóstico · ' + new Date().toLocaleTimeString());
  log('Red nativa (Capacitor): ' + (cap ? 'sí' : 'NO (estás en un navegador)'));
  log('User-Agent: ' + navigator.userAgent);
  let cover = null;
  try {
    const j = await http(`${MW}/manhwa/library?buscar=&estado=&tipo=&erotico=no&demografia=&order_item=creacion&order_dir=desc&page=0&generes=`, 'json', MW_H);
    cover = j.data && j.data[0] && j.data[0]._imagen;
    log('API del listado: OK (' + ((j.data || []).length) + ' series)');
  } catch (e) { log('API del listado: ERROR ' + (e.message || e)); }
  if (!cover) { log('No hay portada para probar. Fin.'); return; }
  log('Imagen de prueba: ' + cover);

  const probe = async (label, headers) => {
    if (!cap) { log(label + ': (sin red nativa)'); return; }
    try {
      const r = await cap.request({ url: cover, method: 'GET', headers, responseType: 'blob' });
      const h = r.headers || {};
      const g = k => h[k] || h[k.toLowerCase()] || '';
      const ct = String(g('Content-Type'));
      const bytes = r.data ? Math.round(String(r.data).length * 0.75) : 0;
      let extra = '';
      if (/text|html|json/i.test(ct) && r.data) { try { extra = ' · cuerpo: ' + atob(r.data).slice(0, 80).replace(/\s+/g, ' '); } catch (e) { /* no es texto */ } }
      const cf = g('cf-mitigated') ? ' · cf-mitigated=' + g('cf-mitigated') : '';
      log(`${label}: HTTP ${r.status} · ${ct || 'sin tipo'} · ${bytes} bytes · server=${g('Server') || '?'}${cf}${extra}`);
    } catch (e) { log(`${label}: ERROR ${e.message || e}`); }
  };
  await probe('1) Nativo con Referer+Origin+UA (lo que usa el lector)', Object.assign({ 'User-Agent': navigator.userAgent }, MW_H));
  await probe('2) Nativo solo con Referer+Origin', MW_H);
  await probe('3) Nativo sin cabeceras', {});
  await new Promise(res => {
    const im = new Image();
    im.referrerPolicy = 'no-referrer';
    im.onload = () => { log(`4) <img> normal: carga (${im.naturalWidth}×${im.naturalHeight})`); res(); };
    im.onerror = () => { log('4) <img> normal: FALLA'); res(); };
    im.src = cover;
  });
  log('Fin. Envíame una captura de este cuadro.');
}
