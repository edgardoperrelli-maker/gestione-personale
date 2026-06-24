// utils/rapportini/ordineVoci.ts
// Il rapportino deve elencare gli interventi nell'ordine del file MASTER (ordine di
// pianificazione), non nell'ordine della rotta ottimizzata. L'ordine-file viaggia su
// `task.ordine` (impostato all'import) o, in fallback, è codificato nell'id (`row-N`,
// `tpl-<ts>-<idx>`). Questo helper assegna a ogni task il suo RANGO 1..N per operatore,
// con i task senza chiave-file (manuali aggiunti dopo) in coda. Puro.

/** Chiave d'ordine del task dal file: `ordine` esplicito, altrimenti il numero nell'id. null se assente. */
function chiaveFile(t: { id: string; ordine?: number }): number | null {
  if (typeof t.ordine === 'number' && Number.isFinite(t.ordine)) return t.ordine;
  const m = /^(?:row|tpl-\d+)-(\d+)$/.exec(t?.id ?? '');
  return m ? Number(m[1]) : null;
}

/** { taskId → rango 1..N } ordinando per chiave-file; i task senza chiave vanno in coda (stabile). */
export function rankOrdineDaFile(tasks: Array<{ id: string; ordine?: number }>): Record<string, number> {
  const withIdx = (tasks ?? []).map((t, i) => ({ t, i, key: chiaveFile(t) }));
  const sorted = withIdx.slice().sort((a, b) => {
    if (a.key == null && b.key == null) return a.i - b.i; // entrambi senza chiave → ordine originale
    if (a.key == null) return 1;                          // senza chiave → in coda
    if (b.key == null) return -1;
    if (a.key !== b.key) return a.key - b.key;
    return a.i - b.i;                                     // pari chiave → ordine originale (stabile)
  });
  const out: Record<string, number> = {};
  sorted.forEach((x, rank) => { if (x.t?.id) out[x.t.id] = rank + 1; });
  return out;
}
