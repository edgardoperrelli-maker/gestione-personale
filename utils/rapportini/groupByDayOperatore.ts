// utils/rapportini/groupByDayOperatore.ts
import type { RapRiepilogo } from './groupByDay';
import { ordinaGiorni } from './giorniRiepilogo';

export type OperatoreGruppo = {
  staff_id: string;
  staff_name: string | null;
  /** Rapportini dell'operatore in quel giorno (uno per piano/comune), ordinati per comune. */
  rapportini: RapRiepilogo[];
  /** Somma degli interventi su tutti i suoi rapportini del giorno. */
  nInterventi: number;
  /** Comuni distinti in cui lavora quel giorno (etichette, "Senza territorio" per ultimo). */
  comuni: string[];
  /** true se TUTTI i suoi rapportini del giorno provengono da piani AI (Assegnazione AI). */
  aiCreato: boolean;
};
export type GiornoOperatori = { data: string; operatori: OperatoreGruppo[] };

const SENZA = '￿'; // ordina sempre per ultimo
const chiaveTerr = (t: string | null) => {
  const n = (t ?? '').trim().toLowerCase();
  return n === '' ? SENZA : n;
};
const etichettaTerr = (t: string | null) => {
  const n = (t ?? '').trim().toUpperCase();
  return n === '' ? 'Senza territorio' : n;
};
const ordineComune = (a: string, b: string) => {
  if (a === SENZA && b !== SENZA) return 1;
  if (b === SENZA && a !== SENZA) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
};

export function groupByDayOperatore(raps: RapRiepilogo[], oggi: string): GiornoOperatori[] {
  // data → staff_id → rapportini
  const byDay = new Map<string, Map<string, RapRiepilogo[]>>();

  for (const r of raps) {
    if (!byDay.has(r.data)) byDay.set(r.data, new Map());
    const byOp = byDay.get(r.data)!;
    if (!byOp.has(r.staff_id)) byOp.set(r.staff_id, []);
    byOp.get(r.staff_id)!.push(r);
  }

  const giorniOrdinati = ordinaGiorni([...byDay.keys()], oggi);

  return giorniOrdinati.map((data) => {
    const byOp = byDay.get(data)!;

    const operatori: OperatoreGruppo[] = [...byOp.entries()]
      .map(([staff_id, rs]) => {
        const rapportini = [...rs].sort((a, b) =>
          ordineComune(chiaveTerr(a.territorio ?? null), chiaveTerr(b.territorio ?? null)),
        );
        const comuni = [...new Set(rapportini.map((r) => etichettaTerr(r.territorio ?? null)))]
          .sort((a, b) =>
            ordineComune(a === 'Senza territorio' ? SENZA : a.toLowerCase(), b === 'Senza territorio' ? SENZA : b.toLowerCase()),
          );
        return {
          staff_id,
          staff_name: rapportini[0]?.staff_name ?? null,
          rapportini,
          nInterventi: rapportini.reduce((s, r) => s + (r.nVoci ?? 0), 0),
          comuni,
          aiCreato: rapportini.length > 0 && rapportini.every((r) => r.aiCreato ?? false),
        };
      })
      .sort((a, b) => (a.staff_name ?? '').localeCompare(b.staff_name ?? ''));

    return { data, operatori };
  });
}
