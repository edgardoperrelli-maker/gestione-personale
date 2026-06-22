'use client';

import type { NavState } from '@/lib/agente/aceaNav';
import type { AgenteRunRow } from '@/lib/agente/uiTypes';
import type { RigaPianificabile, FileConfig } from '../tipi';
import { AssegnaOdl } from './AssegnaOdl';
import { AggiornaStatoOdl } from './AggiornaStatoOdl';
import { SincronizzaRapportini } from './SincronizzaRapportini';

// ─── Props ───────────────────────────────────────────────────────────────────

export type FogliaProps = {
  nav: NavState;
  righe: RigaPianificabile[];
  fileConfig: FileConfig[];
  pianificaData: string | null;
  runs: AgenteRunRow[];
  online: { minutiDaContatto: number | null };
};

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export function Foglia({ nav, ...rest }: FogliaProps) {
  switch (nav.azione) {
    case 'aggiorna-odl':
    case 'aggiorna-stato':
      return <AggiornaStatoOdl nav={nav} runs={rest.runs} online={rest.online} />;
    case 'assegna':
    case 'assegna-interventi':
      return <AssegnaOdl nav={nav} righe={rest.righe} fileConfig={rest.fileConfig} pianificaData={rest.pianificaData} />;
    case 'sincronizza':
      return <SincronizzaRapportini runs={rest.runs} online={rest.online} />;
    default:
      return null;
  }
}
