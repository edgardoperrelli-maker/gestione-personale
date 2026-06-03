// Aggrega gli interventi reali nei conteggi per KPI premialità Acea.
// Logica pura: il calcolo finale (efficienza, banda prezzo, premio) sta in
// lib/premialita/acea.ts (valutaKpi). Qui si producono solo i contatori.
//
// Mapping voce → KPI (Disciplinare Tecnico Acea):
//   10 = EL  (Limitazione erogazione)
//   11 = ES  (Sospensione erogazione)
//   12 = ERC (Rimozione contatore)
//    6 = ERA (Rimozione abusi)
//
// REGOLA business (confermata dall'utente 2026-06-03):
// - `assegnatiDovuti` (denominatore) = interventi del KPI NON annullati, INCLUSI
//   quelli ancora aperti/non chiusi: così l'arretrato che si accumula penalizza
//   l'efficienza. Gli annullati non sono "dovuti".
// - Gli accessi a vuoto restano nel denominatore ma non nel numeratore (premio ES≥80%).
// - FINESTRA temporale: un intervento appartiene al bimestre per la sua DATA DI
//   ASSEGNAZIONE (`assegnato_at`), applicata dalla query chiamante (non in questo modulo).

import type { KpiCode } from '@/lib/premialita/acea';

export const VOCE_KPI: Record<number, KpiCode> = { 10: 'EL', 11: 'ES', 12: 'ERC', 6: 'ERA' };

export type ConteggioKpi = {
  code: KpiCode;
  eseguitiPositivi: number;
  accessiAVuoto: number;
  assegnatiDovuti: number;
};

type InterventoKpi = { voce: number | null; esito: string | null; stato: string };

const ORDINE: KpiCode[] = ['EL', 'ES', 'ERC', 'ERA'];

export function aggregaConteggiKpi(interventi: InterventoKpi[]): ConteggioKpi[] {
  const acc: Record<KpiCode, ConteggioKpi> = {
    EL: { code: 'EL', eseguitiPositivi: 0, accessiAVuoto: 0, assegnatiDovuti: 0 },
    ES: { code: 'ES', eseguitiPositivi: 0, accessiAVuoto: 0, assegnatiDovuti: 0 },
    ERC: { code: 'ERC', eseguitiPositivi: 0, accessiAVuoto: 0, assegnatiDovuti: 0 },
    ERA: { code: 'ERA', eseguitiPositivi: 0, accessiAVuoto: 0, assegnatiDovuti: 0 },
  };

  for (const it of interventi) {
    if (it.voce == null) continue;
    const code = VOCE_KPI[it.voce];
    if (!code) continue;
    if (it.stato === 'annullato') continue;
    acc[code].assegnatiDovuti += 1;
    if (it.esito === 'eseguito_positivo') acc[code].eseguitiPositivi += 1;
    else if (it.esito === 'accesso_a_vuoto') acc[code].accessiAVuoto += 1;
  }

  return ORDINE.map((c) => acc[c]);
}
