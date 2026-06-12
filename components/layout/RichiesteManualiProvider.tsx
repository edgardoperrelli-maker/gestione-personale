'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useRichiesteManualiFeed } from '@/lib/interventi/manuali/useRichiesteManualiFeed';

type RichiesteManualiCtx = { count: number; live: boolean };

const RichiesteManualiContext = createContext<RichiesteManualiCtx>({ count: 0, live: false });

/** Conteggio richieste manuali in attesa, condiviso da sidebar e campanello (0 fuori dal provider). */
export function useRichiesteManualiContext(): RichiesteManualiCtx {
  return useContext(RichiesteManualiContext);
}

function FeedProvider({ children }: { children: ReactNode }) {
  const { count, live } = useRichiesteManualiFeed();
  return <RichiesteManualiContext.Provider value={{ count, live }}>{children}</RichiesteManualiContext.Provider>;
}

/** Esegue il feed realtime UNA sola volta (solo se `enabled`) e lo condivide ai consumer (sidebar + campanello). */
export function RichiesteManualiProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return <FeedProvider>{children}</FeedProvider>;
}
