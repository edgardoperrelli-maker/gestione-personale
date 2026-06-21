// tools/limitazioni-sync/lib/acea/risolviNomeOperatore.mjs
// PURO: applica l'eventuale mappatura nome-app → grafia-ACEA dal config (acea.operatori).
export function risolviNomeOperatore(nome, operatori) {
  const n = String(nome ?? '').trim();
  if (operatori && Object.prototype.hasOwnProperty.call(operatori, n)) {
    return String(operatori[n] ?? '').trim() || n;
  }
  return n;
}
