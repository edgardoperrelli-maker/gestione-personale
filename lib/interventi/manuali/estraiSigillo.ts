// PURA: estrae/normalizza il sigillo di una richiesta manuale.
// Il sigillo vive nelle `risposte` del template (chiave 'sigillo'), ed è il valore che
// il file master legge da rapportino_voci.risposte->>'sigillo'. Speculare a estraiMatricola.
import type { DatiInterventoManuale } from './types';

/** Sigillo trimmato da `dati.risposte.sigillo`; stringa vuota se assente. */
export function estraiSigillo(
  dati: Pick<DatiInterventoManuale, 'risposte'> | null | undefined,
): string {
  const risposte = dati?.risposte as Record<string, unknown> | undefined;
  const raw = risposte?.sigillo;
  if (raw == null) return '';
  return String(raw).trim();
}

/** Forma di confronto del sigillo: stringa, senza spazi ai bordi, maiuscolo. */
export function normSigillo(v: unknown): string {
  return String(v ?? '').trim().toUpperCase();
}

/** True se `sigillo` (normalizzato) compare tra i `candidati` (lista di sigilli grezzi). */
export function sigilloDuplicato(sigillo: string, candidati: Array<unknown>): boolean {
  const target = normSigillo(sigillo);
  if (target === '') return false;
  return (candidati ?? []).some((c) => normSigillo(c) === target);
}
