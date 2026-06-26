// PURA: dai record reperibilità del cronoprogramma (join assignments+calendar_days,
// reperibile=true) costruisce la mappa data→reperibili e calcola l'anomalia.
// Spec §8.1. La query I/O sta nelle route; qui solo logica testabile.
import type { ReperibileRef } from './types';

/** Riga grezza: una assignment reperibile con la sua data di calendario. */
export type RigaReperibile = {
  data: string; // YYYY-MM-DD (calendar_days.day)
  staff_id: string;
  staff_name?: string | null;
};

/** Mappa data (YYYY-MM-DD) → elenco reperibili (deduplicato per staffId). */
export function reperibiliPerData(righe: RigaReperibile[]): Record<string, ReperibileRef[]> {
  const out: Record<string, ReperibileRef[]> = {};
  const visti = new Set<string>(); // `${data}|${staffId}`
  for (const r of righe) {
    if (!r.data || !r.staff_id) continue;
    const k = `${r.data}|${r.staff_id}`;
    if (visti.has(k)) continue;
    visti.add(k);
    (out[r.data] ??= []).push({ staffId: r.staff_id, nome: (r.staff_name ?? '').trim() || r.staff_id });
  }
  return out;
}

/** True se `staffId` risulta reperibile in `data` secondo la mappa. */
export function isReperibile(
  staffId: string,
  data: string,
  mappa: Record<string, ReperibileRef[]>,
): boolean {
  return (mappa[data] ?? []).some((r) => r.staffId === staffId);
}

/**
 * Anomalia reperibilità: true se l'esecutore scelto NON risulta reperibile nella
 * data della chiamata (incluso il caso "nessun reperibile in cronoprogramma" o
 * input mancante). Non bloccante — vedi §8.1/§11.
 */
export function calcolaAnomaliaReperibilita(
  staffId: string,
  data: string,
  mappa: Record<string, ReperibileRef[]>,
): boolean {
  if (!staffId || !data) return true;
  return !isReperibile(staffId, data, mappa);
}
