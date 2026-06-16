// tools/limitazioni-sync/lib/finestra.mjs
// PURE: from/to come 'YYYY-MM-DD', finestra di `giorni` inclusiva che termina a `oggiIso`.
export function finestra(oggiIso, giorni) {
  const to = oggiIso;
  const d = new Date(oggiIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - (giorni - 1));
  const from = d.toISOString().slice(0, 10);
  return { from, to };
}
