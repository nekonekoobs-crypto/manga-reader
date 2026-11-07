/* Catálogo de géneros y comparación de etiquetas */
import { nrm } from '../../lib/text.js';

export const GENRES = [['Acción', 'action'], ['Aventura', 'adventure'], ['Comedia', 'comedy'], ['Drama', 'drama'], ['Fantasía', 'fantasy|magia'], ['Romance', 'romance'],
  ['Terror', 'horror'], ['Misterio', 'mystery'], ['Sobrenatural', 'supernatural'], ['Ciencia ficción', 'sci-fi|science fiction|sci fi'], ['Slice of life', 'slice of life|vida cotidiana'],
  ['Deportes', 'sports|sport|deporte'], ['Escolar', 'school life|school|vida escolar|colegial'], ['Isekai', 'isekai'], ['Harem', 'harem'], ['Ecchi', 'ecchi'],
  ['Histórico', 'historical|historico'], ['Psicológico', 'psychological'], ['Tragedia', 'tragedy'], ['Artes marciales', 'martial arts'], ['Mecha', 'mecha'], ['Gore', 'gore'],
  ['Música', 'music'], ['Superhéroes', 'superhero'], ['Shounen', 'shounen|shonen'], ['Seinen', 'seinen'], ['Shoujo', 'shoujo|shojo'], ['Josei', 'josei'], ['Yuri', 'yuri|girls love'], ['Yaoi', 'yaoi|boys love']];
export const gDef = name => { const f = GENRES.find(g => nrm(g[0]) === nrm(name)); return { n: name, keys: [nrm(name)].concat(f ? f[1].split('|').map(nrm) : []).filter(Boolean) }; };
export const tagMatch = (tags, g) => { const T = (tags || []).map(nrm); return g.keys.some(k => T.some(t => t === k || t.includes(k))); };
