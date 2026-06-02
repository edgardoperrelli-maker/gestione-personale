import { nonConsegnati } from '@/utils/rapportini/nonConsegnati';

export type RapportinoKpiRow = {
  data: string;
  stato: string;
  statoCalcolato: 'valido' | 'scaduto' | 'inviato';
  staff_name?: string | null;
};

export type RapportiniKpi = {
  total: number;
  inviato: number;
  valido: number;
  scaduto: number;
  /** Non inviati di giorni passati (vanno sollecitati). */
  nonConsegnati: number;
};

/**
 * Aggrega gli stati dei rapportini per la Dashboard.
 * Riusa `nonConsegnati` (utils/rapportini) per coerenza con il resto dell'app.
 */
export function aggregateRapportiniKpi(rows: RapportinoKpiRow[], todayIso: string): RapportiniKpi {
  const kpi: RapportiniKpi = { total: rows.length, inviato: 0, valido: 0, scaduto: 0, nonConsegnati: 0 };

  for (const r of rows) {
    if (r.statoCalcolato === 'inviato') kpi.inviato += 1;
    else if (r.statoCalcolato === 'scaduto') kpi.scaduto += 1;
    else kpi.valido += 1;
  }

  kpi.nonConsegnati = nonConsegnati(
    rows.map((r) => ({ data: r.data, stato: r.stato, staff_name: r.staff_name ?? undefined })),
    todayIso,
  ).length;

  return kpi;
}
