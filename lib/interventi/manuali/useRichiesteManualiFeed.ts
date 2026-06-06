'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { mergeRichiesteFeed, type RigaCoda } from './mergeRichiesteFeed';

export type RichiesteManualiFeed = {
  richieste: RigaCoda[];
  count: number;
  live: boolean;
  /** Status HTTP dell'ultima fetch fallita (es. 403); null se ok. */
  error: number | null;
  refresh: () => Promise<void>;
};

/**
 * Feed realtime delle richieste manuali `in_attesa` per gli admin.
 * Fetch iniziale + subscription Realtime (`interventi_manuali`, filtro stato=in_attesa)
 * + polling fallback ogni 60s (in pausa quando la scheda è in background).
 * Modellato su `lib/interventi/useInterventiFeed.ts`; la logica di merge è in `mergeRichiesteFeed`.
 */
export function useRichiesteManualiFeed(): RichiesteManualiFeed {
  const [richieste, setRichieste] = useState<RigaCoda[]>([]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/interventi-manuali?stato=in_attesa', { cache: 'no-store' });
      if (!res.ok) { setError(res.status); return; }
      const json = (await res.json()) as { richieste?: RigaCoda[] };
      setRichieste(json.richieste ?? []);
      setError(null);
    } catch {
      /* errore di rete: ritenta al prossimo polling */
    }
  }, []);

  // Fetch iniziale
  useEffect(() => { void refresh(); }, [refresh]);

  // Realtime su interventi_manuali in_attesa (INSERT/UPDATE/DELETE)
  useEffect(() => {
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel('richieste-manuali-attesa')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'interventi_manuali', filter: 'stato=eq.in_attesa' },
        (payload) => {
          setRichieste((prev) =>
            mergeRichiesteFeed(
              prev,
              payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
              (payload.new as RigaCoda) ?? null,
              (payload.old as { id?: string }) ?? null,
            ),
          );
        },
      )
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => { void supabase.removeChannel(channel); };
  }, []);

  // Polling 60s, in pausa quando la scheda è in background
  useEffect(() => {
    const INTERVAL = 60 * 1000;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => void refresh(), INTERVAL); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => { if (document.hidden) stop(); else { void refresh(); start(); } };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [refresh]);

  return { richieste, count: richieste.length, live, error, refresh };
}
