// PURA: decide quali slot foto ri-caricare al re-invio idempotente.
// Uno slot va riparato sse il suo file NON è presente nello storage E il re-invio
// porta una foto con la stessa chiave. Generico su F per testabilità senza File.
export type RigaFotoEsistente = { slot_chiave: string; storage_path: string };

export function slotDaRiparare<F>(
  righeEsistenti: RigaFotoEsistente[],
  fotoRicevute: Array<{ chiave: string; file: F }>,
  pathPresenti: Set<string>,
): Array<{ chiave: string; storagePath: string; file: F }> {
  const perChiave = new Map(fotoRicevute.map((f) => [f.chiave, f.file]));
  const out: Array<{ chiave: string; storagePath: string; file: F }> = [];
  for (const r of righeEsistenti) {
    if (pathPresenti.has(r.storage_path)) continue; // file già presente
    const file = perChiave.get(r.slot_chiave);
    if (file === undefined) continue; // non riparabile senza la foto nel re-invio
    out.push({ chiave: r.slot_chiave, storagePath: r.storage_path, file });
  }
  return out;
}
