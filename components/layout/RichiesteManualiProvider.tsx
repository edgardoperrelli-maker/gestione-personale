'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useRichiesteManualiFeed } from '@/lib/interventi/manuali/useRichiesteManualiFeed';
import { useProntoInterventoCount } from '@/lib/pi/useProntoInterventoCount';

type RichiesteManualiCtx = { count: number; live: boolean; piCount: number };

const RichiesteManualiContext = createContext<RichiesteManualiCtx>({ count: 0, live: false, piCount: 0 });

/** Conteggi richieste in attesa (Lista attesa + Pronto Intervento), condivisi da sidebar e campanello. */
export function useRichiesteManualiContext(): RichiesteManualiCtx {
  return useContext(RichiesteManualiContext);
}

function FeedProvider({ children }: { children: ReactNode }) {
  const { count, live } = useRichiesteManualiFeed();
  const piCount = useProntoInterventoCount();
  return <RichiesteManualiContext.Provider value={{ count, live, piCount }}>{children}</RichiesteManualiContext.Provider>;
}

/** Esegue il feed realtime UNA sola volta (solo se `enabled`) e lo condivide ai consumer (sidebar + campanello). */
export function RichiesteManualiProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return <FeedProvider>{children}</FeedProvider>;
}
