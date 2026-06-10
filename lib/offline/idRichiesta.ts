const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True se `id` è un UUID valido (usato come chiave di idempotenza lato server). */
export function richiestaIdValido(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}
