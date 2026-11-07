/* Registro de fuentes: integradas, propias (S.sources) y búsqueda por identificador */
import { S } from '../state.js';
import { manhwaweb } from './manhwaweb.js';
import { mangadex } from './mangadex.js';
import { generic } from './generic.js';
import { m440 } from './m440.js';
import { leermanhwas } from './leermanhwas.js';
import { tmohentai } from './tmohentai.js';
import { zonatmo } from './zonatmo.js';
import { lectorxd } from './lectorxd.js';

export { manhwaweb, mangadex, generic };
export const webSource = generic({ id: 'web', name: 'Cualquier web (pegar enlace)', builtin: true });
export const PRESETS = [m440, leermanhwas, tmohentai, zonatmo, lectorxd];
export const allSources = () => [manhwaweb, mangadex, ...PRESETS, webSource, ...S.sources.map(generic)];
export const srcById = id => allSources().find(s => s.id === id) || manhwaweb;
