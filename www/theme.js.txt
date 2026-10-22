/* Logo y menú de personalización (color, fondo, logo) protegido con contraseña.
   Todo se guarda en el dispositivo (localStorage). Es un bloqueo "de cortesía": evita que otra
   persona cambie el aspecto sin querer, no es seguridad fuerte. */
(function () {
  'use strict';
  const KEY = 'mr:theme', PW = 'mr:themepw';
  const $ = s => document.querySelector(s);
  const rd = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const toast = m => { const t = $('#toast'); if (!t) return; t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2600); };

  const LOGO = '<img src="logo.png" alt="OBS">';

  const ACCENTS = ['#ff5a4e', '#ff8a3d', '#ffb347', '#3ecf8e', '#2ec5e6', '#4e8cff', '#a06bff', '#ff5fa2'];
  const BGS = ['#0d0d11', '#0b1020', '#1a0b12', '#0a1612', '#1b1b1b', '#f3f3f6'];

  // ---- utilidades de color ----
  const hex2rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = h.replace(/./g, c => c + c); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgb2hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const lum = c => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;

  let T = Object.assign({ acc: '#ff5a4e', bg: '#0d0d11', bgImg: '', dim: 35, logo: '' }, rd(KEY, {}));

  function apply() {
    const r = document.documentElement.style;
    const bg = hex2rgb(T.bg), light = lum(bg) > 0.6;
    const edge = light ? [0, 0, 0] : [255, 255, 255];
    const acc = hex2rgb(T.acc);
    r.setProperty('--bg', T.bg);
    r.setProperty('--sf', rgb2hex(mix(bg, edge, light ? 0.05 : 0.05)));
    r.setProperty('--sf2', rgb2hex(mix(bg, edge, light ? 0.09 : 0.10)));
    r.setProperty('--ln', rgb2hex(mix(bg, edge, light ? 0.16 : 0.16)));
    r.setProperty('--tx', light ? '#17171c' : '#ececf1');
    r.setProperty('--mt', light ? '#5d5d6b' : '#8d8d9c');
    r.setProperty('--ac', T.acc);
    r.setProperty('--ac2', rgb2hex(mix(acc, light ? [0, 0, 0] : [255, 255, 255], light ? 0.15 : 0.25)));
    r.setProperty('--navbg', `rgba(${bg.map(Math.round).join(',')},.94)`);
    r.setProperty('--topbg', `rgba(${bg.map(Math.round).join(',')},.78)`);
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = T.bg;
    let fx = $('#bgfx');
    if (T.bgImg) {
      if (!fx) { fx = document.createElement('div'); fx.id = 'bgfx'; document.body.prepend(fx); }
      const d = Math.max(0, Math.min(85, +T.dim || 0)) / 100, c = light ? '255,255,255' : '0,0,0';
      fx.style.backgroundImage = `linear-gradient(rgba(${c},${d}),rgba(${c},${d})),url("${T.bgImg}")`;
      document.body.classList.add('hasbg');
    } else { if (fx) fx.remove(); document.body.classList.remove('hasbg'); }
    const lg = $('#logo');
    if (lg) {
      lg.innerHTML = T.logo ? '' : LOGO;
      if (T.logo) { const i = document.createElement('img'); i.alt = 'Logo'; i.src = T.logo; lg.appendChild(i); }
    }
  }
  const save = () => { if (!wr(KEY, T)) toast('No hay espacio para guardar la imagen; usa una más pequeña'); };

  // ---- imágenes: se reducen antes de guardarlas ----
  function shrink(file, max, type) {
    return new Promise((ok, no) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); ok(c.toDataURL(type, 0.82));
      };
      im.onerror = () => { URL.revokeObjectURL(url); no(new Error('imagen no válida')); };
      im.src = url;
    });
  }
  function pick(cb) {
    const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*';
    f.onchange = () => f.files[0] && cb(f.files[0]); f.click();
  }

  // ---- contraseña ----
  async function hash(p) {
    const salt = 'mr-obs-v1:';
    try {
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + p));
      return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    } catch (e) { let h = 5381; for (const ch of salt + p) h = ((h << 5) + h + ch.charCodeAt(0)) | 0; return 'x' + h; }
  }

  // ---- menú ----
  function modal(html) {
    let m = $('#theme');
    if (!m) { m = document.createElement('div'); m.id = 'theme'; document.body.appendChild(m); m.addEventListener('mousedown', e => { if (e.target === m) close(); }); }
    m.hidden = false; m.innerHTML = '<div class="tbox">' + html + '</div>'; return m;
  }
  function close() { const m = $('#theme'); if (m) { m.hidden = true; m.innerHTML = ''; } }
  const err = (m, msg) => { const e = m.querySelector('.terr'); if (e) e.textContent = msg; const b = m.querySelector('.tbox'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); };

  function open() {
    const stored = rd(PW, '');
    if (!stored) return setup();
    const m = modal(`<h3>Menú protegido</h3><p class="hint">Escribe la contraseña para personalizar la app.</p>
      <input id="t-pw" type="password" placeholder="Contraseña" autocomplete="off">
      <div class="terr"></div>
      <div class="trow"><button class="btn" id="t-ok">Entrar</button><button class="btn ghost" id="t-x">Cancelar</button></div>`);
    const go = async () => { if (await hash($('#t-pw').value) === stored) panel(); else { err(m, 'Contraseña incorrecta'); $('#t-pw').value = ''; } };
    $('#t-ok').onclick = go; $('#t-x').onclick = close;
    $('#t-pw').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    setTimeout(() => $('#t-pw').focus(), 50);
  }
  function setup(change) {
    const m = modal(`<h3>${change ? 'Cambiar contraseña' : 'Crea una contraseña'}</h3>
      <p class="hint">${change ? '' : 'Es la primera vez: elige una contraseña para proteger este menú. '}Mínimo 4 caracteres. Si la olvidas, solo se recupera borrando los datos de la app.</p>
      <label>Contraseña<input id="t-p1" type="password" autocomplete="off"></label>
      <label>Repítela<input id="t-p2" type="password" autocomplete="off"></label>
      <div class="terr"></div>
      <div class="trow"><button class="btn" id="t-ok">Guardar</button><button class="btn ghost" id="t-x">Cancelar</button></div>`);
    $('#t-x').onclick = () => change ? panel() : close();
    $('#t-ok').onclick = async () => {
      const a = $('#t-p1').value, b = $('#t-p2').value;
      if (a.length < 4) return err(m, 'Usa al menos 4 caracteres');
      if (a !== b) return err(m, 'No coinciden');
      wr(PW, await hash(a)); toast('Contraseña guardada'); panel();
    };
    setTimeout(() => $('#t-p1').focus(), 50);
  }
  function panel() {
    const sw = (list, cur, attr) => list.map(c => `<button style="background:${c}" class="${c.toLowerCase() === cur.toLowerCase() ? 'on' : ''}" data-${attr}="${c}" aria-label="${c}"></button>`).join('');
    const m = modal(`<h3>Personalizar</h3><p class="hint">Los cambios se ven al instante y se guardan en este dispositivo.</p>
      <h4>Color de la interfaz</h4>
      <div class="sw" id="t-acc">${sw(ACCENTS, T.acc, 'a')}<input type="color" id="t-acc-c" value="${T.acc}"></div>
      <h4>Color de fondo</h4>
      <div class="sw" id="t-bg">${sw(BGS, T.bg, 'b')}<input type="color" id="t-bg-c" value="${T.bg}"></div>
      <h4>Imagen de fondo</h4>
      <div class="trow"><button class="btn" id="t-img">Elegir imagen</button><button class="btn ghost" id="t-img-x">Quitar</button></div>
      <label>Oscurecer imagen <input type="range" id="t-dim" min="0" max="85" value="${T.dim}"></label>
      <h4>Logo</h4>
      <div class="logoprev"><span class="logo" id="t-prev"></span>
        <div class="trow" style="margin:0"><button class="btn" id="t-logo">Cambiar logo</button><button class="btn ghost" id="t-logo-x">Restaurar cuervo</button></div></div>
      <h4>Seguridad</h4>
      <div class="trow"><button class="btn ghost" id="t-pw">Cambiar contraseña</button><button class="btn ghost" id="t-reset">Restablecer aspecto</button></div>
      <div class="trow"><button class="btn" id="t-done" style="width:100%">Listo</button></div>`);
    const prev = () => { const p = $('#t-prev'); p.innerHTML = T.logo ? `<img src="${T.logo}" alt="">` : LOGO; };
    const refresh = () => { apply(); prev(); save(); };
    prev();
    m.querySelector('#t-acc').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) { T.acc = b.dataset.a; $('#t-acc-c').value = T.acc; refresh(); panel(); } });
    $('#t-acc-c').oninput = e => { T.acc = e.target.value; apply(); };
    $('#t-acc-c').onchange = () => { save(); };
    m.querySelector('#t-bg').addEventListener('click', e => { const b = e.target.closest('[data-b]'); if (b) { T.bg = b.dataset.b; refresh(); panel(); } });
    $('#t-bg-c').oninput = e => { T.bg = e.target.value; apply(); };
    $('#t-bg-c').onchange = () => { save(); };
    $('#t-img').onclick = () => pick(async f => { try { T.bgImg = await shrink(f, 1280, 'image/jpeg'); refresh(); } catch (e) { toast('No se pudo leer la imagen'); } });
    $('#t-img-x').onclick = () => { T.bgImg = ''; refresh(); };
    $('#t-dim').oninput = e => { T.dim = +e.target.value; apply(); };
    $('#t-dim').onchange = save;
    $('#t-logo').onclick = () => pick(async f => { try { T.logo = await shrink(f, 256, 'image/png'); refresh(); } catch (e) { toast('No se pudo leer la imagen'); } });
    $('#t-logo-x').onclick = () => { T.logo = ''; refresh(); };
    $('#t-pw').onclick = () => setup(true);
    $('#t-reset').onclick = () => { T = { acc: '#ff5a4e', bg: '#0d0d11', bgImg: '', dim: 35, logo: '' }; refresh(); panel(); };
    $('#t-done').onclick = close;
  }

  apply();
  const b = $('#themebtn'); if (b) b.addEventListener('click', open);
  window.MR_THEME = { open, apply, get: () => T };
})();
