import { dbLavoro, dbOutbox, indexedDbDisponibile } from './db';
import { applicaUpsert } from './outboxModel';
import { costruisciVoceOutbox } from './voceOutbox';
import { mergeLavoro } from './rehydrate';

/**
 * Salva localmente le risposte di una voce e accoda (coalescente) il salvataggio
 * remoto. Best-effort: se IndexedDB non è disponibile non lancia.
 * Ritorna true se è stato persistito in locale.
 */
export async function persistiVoce(
  token: string,
  voceId: string,
  risposte: Record<string, unknown>,
  now: number,
  taskId?: string,
): Promise<boolean> {
  if (!indexedDbDisponibile()) return false;
  try {
    await dbLavoro.salva({ chiave: `${token}:${voceId}`, token, voceId, taskId, risposte, aggiornatoIl: now });
    const esistenti = await dbOutbox.perToken(token);
    const aggiornata = applicaUpsert(esistenti, costruisciVoceOutbox(token, voceId, risposte, now, taskId));
    const item = aggiornata.find((i) => i.id === `voce:${token}:${voceId}`);
    if (item) await dbOutbox.put(item);
    return true;
  } catch {
    return false;
  }
}

/** Reidrata le voci con le risposte locali salvate per il token. Best-effort. */
export async function reidrataVoci<T extends { id: string; risposte: Record<string, unknown> }>(
  token: string,
  voci: T[],
): Promise<T[]> {
  if (!indexedDbDisponibile()) return voci;
  try {
    const lavori = await dbLavoro.perToken(token);
    return mergeLavoro(voci, lavori);
  } catch {
    return voci;
  }
}
