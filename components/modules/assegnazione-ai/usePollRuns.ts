'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/** Polling leggero post-tick: 4 colpi a 15/35/60/90s, poi si ferma.
 *  Chiama router.refresh() + il callback onTick ad ogni scatto.
 *  Si attiva/disattiva via `attivo`.
 */
export function usePollRuns(onTick: () => void, attivo: boolean) {
  const router = useRouter();
  const timerIds = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // pulisce eventuali timer precedenti
    for (const id of timerIds.current) clearTimeout(id);
    timerIds.current = [];

    if (!attivo) return;

    for (const ms of [15_000, 35_000, 60_000, 90_000]) {
      const id = setTimeout(() => {
        router.refresh();
        onTick();
      }, ms);
      timerIds.current.push(id);
    }

    return () => {
      for (const id of timerIds.current) clearTimeout(id);
      timerIds.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attivo]);
}
