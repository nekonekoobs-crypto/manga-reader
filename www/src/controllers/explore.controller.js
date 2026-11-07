/* Explorar: búsqueda en una fuente, en todas, y con filtro de géneros */
import { S, save, keyOf } from '../models/state.js';
import { SR } from '../models/session.js';
import { ALL } from '../config/constants.js';
import { allSources, srcById } from '../models/sources/index.js';
import { gDef, tagMatch } from '../models/genres/catalog.js';
import { tagsOf } from '../models/genres/tagcache.js';
import { mapLimit } from '../lib/async.js';
import { $, esc } from '../lib/dom.js';
import { toast } from '../views/toast.view.js';
import * as V from '../views/explore.view.js';
import { openUrl } from './link.controller.js';

export const refreshChips = () => V.renderChips(SR.q, S.genres);

export async function runSearch(reset = true, qOverride = null) {
  let q;
  if (qOverride != null) q = String(qOverride).trim();
  else { q = V.readQuery(); if (reset) V.clearQuery(); } // el cuadro se limpia solo tras buscar
  if (/^https?:\/\//i.test(q)) { openUrl(q); return; }
  if (SR.busy && !reset) return;
  if (reset) { SR.page = 0; SR.q = q; SR.seen = new Set(); V.showSearching(); refreshChips(); }
  if (S.current === ALL) { searchAll(); return; }
  const src = srcById(S.current);
  if (src.id === 'web' && !SR.q) {
    V.showEmpty('Pega arriba el enlace de una serie o de un capítulo de cualquier web y la app lo adapta al lector.');
    return;
  }
  if (src.adult && !S.set.adult) {
    V.showEmpty('Esta fuente es para mayores de 18 años. Actívala en Fuentes → Ajustes → «Mostrar contenido para adultos».');
    return;
  }
  const my = ++SR.token;
  SR.busy = true;
  try {
    if (S.genres.length && !src.nativeGenres) { await genreSearch(src, my, reset); return; }
    const r = await src.search(SR.q, SR.page);
    if (my !== SR.token) return;
    if (reset) { V.clearResults(); SR.seen = new Set(); }
    // Si una página repite resultados ya mostrados (el sitio ignoró la paginación), no se vuelven a pintar
    const fresh = r.items.filter(it => { const k = keyOf(it); if (SR.seen.has(k)) return false; SR.seen.add(k); return true; });
    if (!fresh.length && reset) V.showNoResults(SR.q);
    else V.appendCards(fresh);
    V.setMore(r.more && (fresh.length || reset) ? 'Cargar más' : '');
  } catch (e) {
    if (my !== SR.token) return;
    if (reset) V.showError(e.message || String(e));
    else toast('No se pudo cargar más resultados');
  } finally { if (my === SR.token) SR.busy = false; }
}

// Fuente sin filtro propio: se leen las series de cada página y se revisan sus géneros hasta juntar suficientes
async function genreSearch(src, my, reset) {
  const gs = S.genres.map(gDef);
  let scanned = 0, shown = 0, noTags = 0, more = false, lastPage = SR.page;
  const status = () => V.setStatus(`Revisando géneros… ${scanned} series revisadas, ${shown} coinciden`);
  for (let p = SR.page; p < SR.page + 5; p++) {
    status();
    const r = await src.search(SR.q, p);
    if (my !== SR.token) return;
    lastPage = p; more = !!r.more;
    const items = r.items.filter(it => !SR.seen.has(keyOf(it)));
    await mapLimit(items, 5, async it => {
      if (my !== SR.token) return;
      let t = []; try { t = await tagsOf(it); } catch (e) { /* ficha no disponible */ }
      if (my !== SR.token) return;
      scanned++; if (!t.length) noTags++;
      if (gs.every(g => tagMatch(t, g)) && !SR.seen.has(keyOf(it))) {
        SR.seen.add(keyOf(it)); shown++;
        if (shown === 1 && reset) V.clearResults();
        V.appendCards([it]);
      }
      status();
    });
    if (my !== SR.token) return;
    if (shown >= 12 || !more) break;
  }
  SR.page = lastPage;
  const label = S.genres.join(' + ');
  if (!shown && reset) V.showEmpty(`Ninguna de las ${scanned} series revisadas tiene: ${esc(label)}.${noTags >= scanned && scanned ? '<br><br>Esta fuente no publica géneros en la ficha de las series.' : ''}`);
  V.setMore(more ? (shown ? 'Seguir buscando' : 'Revisar más series') : '');
}

// Busca el mismo texto en todas las fuentes a la vez y va mostrando cada una cuando responde
async function searchAll() {
  V.setMore('');
  if (!SR.q && !S.genres.length) { V.showEmpty('Escribe un título (o elige géneros) para buscar en todas las fuentes.'); return; }
  const srcs = allSources().filter(s => s.id !== 'web' && (!s.adult || S.set.adult));
  const my = ++SR.token;
  SR.busy = true;
  V.showSpinner(`Buscando en ${srcs.length} fuentes…`);
  let total = 0, firstShown = false;
  const failed = [];
  const limit = ms => new Promise((_, no) => setTimeout(() => no(new Error('tiempo agotado')), ms));
  const gs = S.genres.map(gDef);
  const run = async s => {
    const r = await s.search(SR.q, 0);
    if (!gs.length || s.nativeGenres) return r;
    const keep = [];
    await mapLimit((r.items || []).slice(0, 20), 4, async it => {
      let t = []; try { t = await tagsOf(it); } catch (e) { /* ficha no disponible */ }
      if (gs.every(g => tagMatch(t, g))) keep.push(it);
    });
    return { items: keep };
  };
  await Promise.all(srcs.map(s => Promise.race([run(s), limit(gs.length ? 60000 : 20000)]).then(r => {
    if (my !== SR.token) return;
    const items = ((r && r.items) || []).slice(0, 12);
    if (!items.length) return;
    if (!firstShown) { V.clearResults(); firstShown = true; }
    total += items.length;
    V.appendGroup(s.name, items);
  }).catch(() => { failed.push(s.name); })));
  if (my !== SR.token) return;
  SR.busy = false;
  if (!total) {
    V.showEmpty(`Sin resultados${SR.q ? ` para “${esc(SR.q)}”` : ''}${gs.length ? ` con ${esc(S.genres.join(' + '))}` : ''} en ninguna fuente.`);
  }
  if (failed.length) V.appendNote('No respondieron: ' + failed.join(', '));
}

export function bindExplore() {
  $('#sf').addEventListener('submit', e => { e.preventDefault(); V.blurQuery(); runSearch(true); });
  $('#srcsel').addEventListener('change', e => { S.current = e.target.value; save(); runSearch(true, SR.q); });
  document.addEventListener('click', e => {
    if (e.target.closest('#loadmore')) { SR.page++; runSearch(false); return; }
    if (e.target.closest('#retry')) runSearch(true, SR.q);
  });
}
