/* Red: peticiones, documentos HTML y cabeceras de Referer */
export async function http(url, as, extra) {
  const headers = Object.assign({ Accept: as === 'json' ? 'application/json' : 'text/html,*/*' }, extra || {});
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return as === 'json' ? r.json() : r.text();
}
export async function getDoc(url) {
  const html = await http(url, 'text');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.__html = html;
  return doc;
}
export const origin = b => b.replace(/\/+$/, '');
export const nativeRef = base => ({ Referer: origin(base) + '/', Origin: origin(base) });
