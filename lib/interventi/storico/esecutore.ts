// lib/interventi/storico/esecutore.ts
// PURE: helper per il cambio esecutore di una voce dello storico (admin_plus).
//
// Nello storico l'esecutore NON è una colonna della voce: è lo staff del rapportino PADRE
// (vedi lib/interventi/storico/normalizza.ts). Cambiarlo significa quindi spostare la voce nel
// rapportino che il nuovo operatore ha per la STESSA data, e riallineare `interventi.staff_id`.
import type { Esecutore } from '@/lib/consuntivazione/types';

/** Rapportino dell'operatore di destinazione per la data della voce. */
export type RapportinoCandidato = {
  id: string;
  piano_id: string | null;
  tipo: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `staff.id` preso dal body: uuid valido, altrimenti null (chiave assente o spazzatura). */
export function esecutoreIdValido(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return UUID.test(s) ? s : null;
}

/**
 * Rapportino di destinazione fra quelli dell'operatore per quella data.
 * Il `tipo` deve coincidere (standard e risanamento hanno campi diversi, una voce non può
 * attraversarli); a parità di tipo vince il rapportino dello stesso piano dell'origine, poi
 * uno legato a un piano, poi il primo. `null` = nessun candidato: il chiamante crea il
 * rapportino contenitore.
 */
export function scegliRapportinoDestinazione(
  candidati: readonly RapportinoCandidato[],
  origine: { piano_id: string | null; tipo: string | null },
): string | null {
  const tipo = origine.tipo ?? 'standard';
  const compatibili = candidati.filter((c) => (c.tipo ?? 'standard') === tipo);
  if (compatibili.length === 0) return null;
  const stessoPiano = origine.piano_id ? compatibili.find((c) => c.piano_id === origine.piano_id) : undefined;
  return (stessoPiano ?? compatibili.find((c) => c.piano_id !== null) ?? compatibili[0]).id;
}

/** Coda del rapportino di destinazione: max(ordine) + 1, 1 se non ha voci. */
export function prossimoOrdine(ordini: readonly (number | null)[]): number {
  return ordini.reduce<number>((m, o) => (typeof o === 'number' && o > m ? o : m), 0) + 1;
}

/**
 * `interventi.esecutori` con il nuovo primario al posto del vecchio; il resto della squadra
 * resta (deduplicato, se il nuovo era già un comprimario). Lista vuota → `null`: la popola
 * solo la consuntivazione e non va inventata qui.
 */
export function esecutoriConNuovoPrimario(attuali: unknown, nuovo: Esecutore): Esecutore[] | null {
  if (!Array.isArray(attuali) || attuali.length === 0) return null;
  const resto = (attuali as Esecutore[]).slice(1).filter((e) => e?.staff_id && e.staff_id !== nuovo.staff_id);
  return [nuovo, ...resto];
}
