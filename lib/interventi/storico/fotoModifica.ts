// lib/interventi/storico/fotoModifica.ts
// PURA: rimozione del riferimento a una foto (storage path) dalle risposte di una
// voce o di una riga-misuratore. Usata dal DELETE foto per allineare DB + storage.
import { comeArrayFoto } from '@/utils/rapportini/comeArrayFoto';

/**
 * Rimuove `path` da qualunque campo-foto delle `risposte` (valore string o string[]).
 * Tocca solo i campi che contengono esattamente quel path; lascia gli altri invariati.
 * Ritorna nuove risposte (copia) e se è stato rimosso almeno un riferimento.
 */
export function rimuoviFotoDaRisposte(
  risposte: Record<string, unknown> | null | undefined,
  path: string,
): { risposte: Record<string, unknown>; rimosso: boolean } {
  const base: Record<string, unknown> = { ...(risposte ?? {}) };
  if (!path) return { risposte: base, rimosso: false };
  let rimosso = false;
  for (const [chiave, valore] of Object.entries(base)) {
    const arr = comeArrayFoto(valore);
    if (!arr.includes(path)) continue;
    base[chiave] = arr.filter((p) => p !== path);
    rimosso = true;
  }
  return { risposte: base, rimosso };
}
