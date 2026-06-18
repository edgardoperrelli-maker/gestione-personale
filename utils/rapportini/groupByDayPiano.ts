// utils/rapportini/groupByDayPiano.ts
import type { RapRiepilogo } from './groupByDay';
import { ordinaGiorni } from './giorniRiepilogo';

export type PianoCard = {
  piano_id: string;
  territorio: string | null;
  creato_at: string | null;
  operatori: RapRiepilogo[];
};
export type GiornoPiani = { data: string; piani: PianoCard[] };

const SENZA = '￿'; // ordina sempre per ultimo
const chiaveTerr = (t: string | null) => {
  const n = (t ?? '').trim().toLowerCase();
  return n === '' ? SENZA : n;
};

export function groupByDayPiano(raps: RapRiepilogo[], oggi: string): GiornoPiani[] {
  const byDay = new Map<string, Map<string, PianoCard>>();
  for (const r of raps) {
    if (!byDay.has(r.data)) byDay.set(r.data, new Map());
    const piani = byDay.get(r.data)!;
    if (!piani.has(r.piano_id)) {
      piani.set(r.piano_id, {
        piano_id: r.piano_id,
        territorio: (r.territorio ?? '').trim() || null,
        creato_at: r.piano_creato_at ?? null,
        operatori: [],
      });
    }
    piani.get(r.piano_id)!.operatori.push(r);
  }
  const giorniOrdinati = ordinaGiorni([...byDay.keys()], oggi);
  return giorniOrdinati.map((data) => ({
    data,
    piani: [...byDay.get(data)!.values()].sort((a, b) => {
      const ta = chiaveTerr(a.territorio);
      const tb = chiaveTerr(b.territorio);
      if (ta !== tb) return ta < tb ? -1 : 1;
      return (a.creato_at ?? '').localeCompare(b.creato_at ?? '');
    }),
  }));
}
