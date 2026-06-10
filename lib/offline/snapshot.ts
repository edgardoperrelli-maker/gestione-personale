import { dbSnapshot, indexedDbDisponibile } from './db';
import type { Snapshot } from './types';

/** Salva lo snapshot dei dati del token per la consultazione offline. Best-effort. */
export async function salvaSnapshot(token: string, tipo: 'rapportino' | 'agenda', dati: unknown): Promise<void> {
  if (!indexedDbDisponibile()) return;
  try {
    const snap = { token, tipo, dati, aggiornatoIl: Date.now() } as Snapshot;
    await dbSnapshot.salva(snap);
  } catch {
    /* quota/permessi: non bloccare l'app */
  }
}

/** Legge lo snapshot del token (undefined se assente o IndexedDB non disponibile). */
export async function leggiSnapshot(token: string): Promise<Snapshot | undefined> {
  if (!indexedDbDisponibile()) return undefined;
  try {
    return await dbSnapshot.leggi(token);
  } catch {
    return undefined;
  }
}
