// PURA: applica un evento realtime (postgres_changes) alla lista della coda
// mantenendo solo le richieste in stato 'in_attesa', ordinate per created_at desc.
import type { RigaRichiesta } from './types';

/** Riga della coda: RigaRichiesta + campi di presa in carico (informativi). */
export type RigaCoda = RigaRichiesta & {
  preso_in_carico_da: string | null;
  preso_in_carico_at: string | null;
};

export type EventoFeed = 'INSERT' | 'UPDATE' | 'DELETE';

function ordina(list: RigaCoda[]): RigaCoda[] {
  return list.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

/**
 * Restituisce la nuova lista coda dopo l'evento.
 * - DELETE: rimuove per `old.id`.
 * - INSERT/UPDATE con `stato !== 'in_attesa'`: la riga esce dalla coda (rimossa se presente).
 * - INSERT/UPDATE con `stato === 'in_attesa'`: upsert + riordino per created_at desc.
 */
export function mergeRichiesteFeed(
  prev: RigaCoda[],
  evento: EventoFeed,
  nuova: RigaCoda | null,
  old: { id?: string } | null,
): RigaCoda[] {
  if (evento === 'DELETE') {
    const oldId = old?.id;
    return oldId ? prev.filter((r) => r.id !== oldId) : prev;
  }
  if (!nuova?.id) return prev;
  const senza = prev.filter((r) => r.id !== nuova.id);
  if (nuova.stato !== 'in_attesa') return senza; // uscita dalla coda
  return ordina([...senza, nuova]);
}
