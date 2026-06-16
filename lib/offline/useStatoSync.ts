'use client';

import { useCallback, useEffect, useState } from 'react';
import { dbOutbox, indexedDbDisponibile } from './db';
import { registraBackgroundSync } from './backgroundSync';
import { sincronizzaToken } from './sync';
import type { OutboxItem } from './types';

export type StatoSync = {
  inAttesa: number;
  bloccati: number;
  bloccatiItems: OutboxItem[];
  perVoce: Record<string, OutboxItem>;
  online: boolean;
};

/**
 * Stato della coda per un token: conteggi + mappa per-voce + online/offline.
 * Si aggiorna a intervallo, agli eventi online/offline, e al ritorno in primo piano.
 * Espone `sincronizzaOra` per il pulsante manuale.
 */
export function useStatoSync(token: string): StatoSync & { sincronizzaOra: () => Promise<void> } {
  const [stato, setStato] = useState<StatoSync>({ inAttesa: 0, bloccati: 0, bloccatiItems: [], perVoce: {}, online: true });

  const aggiorna = useCallback(async () => {
    if (!indexedDbDisponibile()) return;
    try {
      const items = await dbOutbox.perToken(token);
      const perVoce: Record<string, OutboxItem> = {};
      const bloccatiItems: OutboxItem[] = [];
      let inAttesa = 0;
      let bloccati = 0;
      for (const it of items) {
        if (it.type === 'voce') perVoce[it.payload.voceId] = it;
        if (it.stato === 'bloccato') { bloccati += 1; bloccatiItems.push(it); }
        else inAttesa += 1;
      }
      setStato({ inAttesa, bloccati, bloccatiItems, perVoce, online: typeof navigator === 'undefined' ? true : navigator.onLine });
      if (inAttesa > 0) void registraBackgroundSync();
    } catch {
      /* best-effort */
    }
  }, [token]);

  const sincronizzaOra = useCallback(
    () => sincronizzaToken(token).then(() => aggiorna()),
    [token, aggiorna],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    void aggiorna();
    const id = window.setInterval(aggiorna, 3000);
    const onOnline = () => { sincronizzaOra(); };
    const onVis = () => { if (document.visibilityState === 'visible') void aggiorna(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', aggiorna);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', aggiorna);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [aggiorna, sincronizzaOra]);

  return { ...stato, sincronizzaOra };
}
