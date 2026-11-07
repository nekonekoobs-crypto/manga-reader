/* Utilidades de texto */
export const MES = '(?:ene|feb|mar|abr|may|jun|jul|ago|sep|sept|oct|nov|dic|jan|apr|aug|dec)[a-z]*\\.?';
export const DATE_RE = [new RegExp('\\b\\d{1,2}[\\s/.-]' + MES + '[\\s/.,-]*\\d{2,4}\\b', 'gi'), new RegExp('\\b' + MES + '\\s+\\d{1,2},?\\s+\\d{4}\\b', 'gi'),
  /\b\d{4}-\d{2}-\d{2}\b/g, /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, /\bhace\s+\d+\s+\p{L}+/giu, /\b\d+\s+(?:hours?|days?|weeks?|months?|horas?|d[ií]as?|semanas?|meses)\s+ago\b/gi, /\b(?:new|nuevo|hot|end|fin)\b/gi];
export const tidyTitle = t => {
  let x = String(t || '');
  DATE_RE.forEach(r => { x = x.replace(r, ' '); });
  x = x.replace(/\s+/g, ' ').replace(/^[\s\-–—|·:]+|[\s\-–—|·:]+$/g, '').trim();
  return x || String(t || '').trim();
};
export const nrm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim();
