/* Persistencia local (localStorage con prefijo «mr:») */
export const store = {
  get(k, d) { try { const v = localStorage.getItem('mr:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('mr:' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
};
