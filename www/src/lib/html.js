/* Lectura de documentos HTML */
import * as P from './parsers.js';

export const textOf = (doc, sels) => { for (const s of sels) { const e = doc.querySelector(s); const t = e && P.clean(e.textContent); if (t) return t; } return ''; };
export const metaOf = (doc, n) => { const m = doc.querySelector(`meta[property="${n}"],meta[name="${n}"]`); return m ? P.clean(m.getAttribute('content')) : ''; };
