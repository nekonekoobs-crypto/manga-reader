entListener('load', e => { if (e.target.classList.contains('pg')) { e.target.classList.remove('bad'); e.target.classList.add('ok'); } }, true);
  $('#rpages').addEventListener('error', e => { if (e.target.classList.contains('pg')) e.target.classList.add('bad'); }, true);
  $('#rpages').addEventListener('click', e => {
    const im = e.target;
    if (im.classList && im.classList.contains('bad')) {
      const u = im.getAttribute('src'); im.removeAttribute('src');
      setTimeout(() => im.setAttribute('src', u), 60);
    }
  });
  let raf = 0;
  $('#rscroll').addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; updateProg(); });
  }, { passive: true });

  // Portadas rotas: dejar la letra de respaldo
  document.addEventListener('error', e => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.closest('.cv')) t.remove();
  }, true);

  // Opciones del lector
  $('#o-gap').addEventListener('change', e => { S.set.gap = e.target.checked; save(); applyReaderOpts(); });
  $('#o-narrow').addEventListener('change', e => { S.set.narrow = e.target.checked; save(); applyReaderOpts(); });
  $('#o-saver').addEventListener('change', e => {
    S.set.saver = e.target.checked; save(); applyReaderOpts();
    if (R && R.src.id === 'mangadex') loadChapter(R.idx);
  });

  // Fuentes
  $('#srclist').addEventListener('click', e => {
    const row = e.target.closest('.srow'); const b = e.target.closest('button');
    if (!row || !b) return;
    const id = row.dataset.id;
    if (b.dataset.act === 'pick') { S.current = id; save(); renderSources(); renderSrcSelect(); toast('Fuente activa: ' + srcById(id).name); }
    if (b.dataset.act === 'edit') openSrcForm(S.sources.find(s => s.id === id));
    if (b.dataset.act === 'del') {
      if (!confirm('¿Borrar esta fuente?')) return;
      S.sources = S.sources.filter(s => s.id !== id);
      if (S.current === id) S.current = 'mangadex';
      save(); renderSources(); renderSrcSelect();
    }
  });
  $('#addsrc').addEventListener('click', () => openSrcForm(null));
  $('#f-save').addEventListener('click', saveSrcForm);
  $('#f-cancel').addEventListener('click', () => { $('#srcform').hidden = true; });

  // Ajustes
  $('#settings').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.lang) {
      const set = new Set(S.set.langs);
      t.checked ? set.add(t.dataset.lang) : set.delete(t.dataset.lang);
      if (!set.size) { set.add('en'); toast('Debe haber al menos un idioma'); }
      S.set.langs = [...set];
    }
    if (t.id === 's-saver') S.set.saver = t.checked;
    if (t.id === 's-adult') {
      if (t.checked && !confirm('Esto mostrará contenido para mayores de 18 años. ¿Eres mayor de edad?')) { t.checked = false; return; }
      S.set.adult = t.checked;
    }
    save(); renderSources();
  });

  /* ---------------- Inicio ---------------- */
  renderSrcSelect();
  runSearch(true);
  window.__MR = { S, mangadex, generic, runSearch, openDetail, openUrl };
})();
