'use client';

import { useEffect, useState } from 'react';
import { persistiVoce, reidrataVoci } from '@/lib/offline/persistVoce';
import { accodaFoto } from '@/lib/offline/persistFoto';
import { accodaManuale } from '@/lib/offline/persistManuale';
import { sincronizzaToken } from '@/lib/offline/sync';
import { aggiornaCensimento, leggiCensimentoLocale } from '@/lib/offline/censimento';
import { dbLavoro, dbOutbox } from '@/lib/offline/db';

declare global {
  interface Window {
    __offline?: {
      persistiVoce: typeof persistiVoce;
      reidrataVoci: typeof reidrataVoci;
      accodaFoto: typeof accodaFoto;
      accodaManuale: typeof accodaManuale;
      sincronizzaToken: typeof sincronizzaToken;
      aggiornaCensimento: typeof aggiornaCensimento;
      leggiCensimentoLocale: typeof leggiCensimentoLocale;
      codaPerToken: (token: string) => Promise<Array<{ id: string; type: string; stato: string }>>;
      risposteLavoro: (token: string, voceId: string) => Promise<Record<string, unknown> | undefined>;
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
      accodaFoto,
      accodaManuale,
      sincronizzaToken,
      aggiornaCensimento,
      leggiCensimentoLocale,
      codaPerToken: async (token: string) =>
        (await dbOutbox.perToken(token)).map((i) => ({ id: i.id, type: i.type, stato: i.stato })),
      risposteLavoro: async (token: string, voceId: string) =>
        (await dbLavoro.perToken(token)).find((l) => l.voceId === voceId)?.risposte,
    };
    setPronto(true);
  }, []);
  return <div data-testid="harness">{pronto ? 'pronto' : 'caricamento'}</div>;
}
