// PURA: estrae la matricola (normalizzata) dall'anagrafica di una richiesta manuale.
// La matricola vive in `dati.anagrafica.matricola` (vedi dati_correnti/dati_operatore).
import type { DatiInterventoManuale } from './types';

/** Matricola trimmata da `dati.anagrafica.matricola`; stringa vuota se assente. */
export function estraiMatricola(
  dati: Pick<DatiInterventoManuale, 'anagrafica'> | null | undefined,
): string {
  const anag = dati?.anagrafica as Record<string, unknown> | undefined;
  const raw = anag?.matricola;
  if (raw == null) return '';
  return String(raw).trim();
}
