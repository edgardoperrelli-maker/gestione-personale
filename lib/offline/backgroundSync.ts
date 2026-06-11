import { dbOutbox, indexedDbDisponibile } from './db';
import { sincronizzaToken } from './sync';
import type { OutboxItem } from './types';

export const TAG_BACKGROUND_SYNC = 'rapportini-sync';

/** Token distinti presenti negli elementi della coda. */
export function tokenDistinti(items: OutboxItem[]): string[] {
  return [...new Set(items.map((i) => i.token))];
}

/**
 * Drena la coda di TUTTI i token. SW-safe (solo IndexedDB + fetch + navigator.onLine):
 * usata dal service worker nell'handler `sync` (background sync, app chiusa).
 */
export async function drenaTuttiIToken(): Promise<void> {
  if (!indexedDbDisponibile()) return;
  try {
    const items = await dbOutbox.tutti();
    for (const token of tokenDistinti(items)) {
      await sincronizzaToken(token);
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Registra (client-only) un background sync, così alla prossima connettività il SW
 * riceve l'evento `sync` e drena la coda anche ad app chiusa. No-op se non supportato
 * (es. iOS Safari) o fuori dal browser. Idempotente sul tag.
 */
export async function registraBackgroundSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (typeof self !== 'undefined' && !('SyncManager' in self)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sync = (reg as unknown as { sync?: { register(tag: string): Promise<void> } }).sync;
    if (sync) await sync.register(TAG_BACKGROUND_SYNC);
  } catch {
    /* non supportato / negato: i trigger ad-app-aperta restano comunque attivi */
  }
}
