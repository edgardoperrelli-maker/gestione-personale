'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

/**
 * Conteggio richieste P.I. in attesa (tutte le foglie) per il badge in sidebar.
 * Fetch iniziale + realtime su interventi_manuali in_attesa + polling 60s.
 */
export function useProntoInterventoCount(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pi/coda', { cache: 'no-store' });
      if (res.ok) {
        const j = (await res.json()) as { righe?: unknown[] };
        setCount(Array.isArray(j.righe) ? j.righe.length : 0);
      }
    } catch {
      /* errore di rete: ritenta al prossimo polling */
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Realtime: qualunque variazione su interventi_manuali in_attesa → ricalcola.
  useEffect(() => {
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel('pi-attesa-sidebar')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'interventi_manuali', filter: 'stato=eq.in_attesa' },
        () => { void refresh(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh]);

  // Polling 60s, in pausa quando la scheda è in background.
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

  return count;
}
