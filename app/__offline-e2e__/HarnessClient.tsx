'use client';

import { useEffect, useState } from 'react';
import { persistiVoce, reidrataVoci } from '@/lib/offline/persistVoce';
import { sincronizzaToken } from '@/lib/offline/sync';
import { dbOutbox } from '@/lib/offline/db';

declare global {
  interface Window {
    __offline?: {
      persistiVoce: typeof persistiVoce;
      reidrataVoci: typeof reidrataVoci;
      sincronizzaToken: typeof sincronizzaToken;
      codaPerToken: (token: string) => Promise<Array<{ id: string; type: string; stato: string }>>;
    };
  }
}

/** Espone il data layer offline su window per i test e2e (solo dev). */
export default function HarnessClient() {
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    window.__offline = {
      persistiVoce,
      reidrataVoci,
      sincronizzaToken,
      codaPerToken: async (token: string) =>
        (await dbOutbox.perToken(token)).map((i) => ({ id: i.id, type: i.type, stato: i.stato })),
    };
    setPronto(true);
  }, []);
  return <div data-testid="harness">{pronto ? 'pronto' : 'caricamento'}</div>;
}
