/* Utilidades asíncronas */
// Ejecuta fn sobre la lista con a lo sumo n peticiones a la vez
export async function mapLimit(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const it = list[i++]; await fn(it); } }));
}
