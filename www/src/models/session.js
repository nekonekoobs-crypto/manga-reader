/* Estado de la sesión: búsqueda actual, serie abierta (D) y lector abierto (R) */
export const SR = { q: '', page: 0, busy: false, token: 0, seen: new Set() };
export const V = { D: null, R: null };
