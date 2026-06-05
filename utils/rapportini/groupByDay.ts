import type { RapportinoStato } from './links';

export type RapRiepilogo = RapportinoStato & {
  piano_id: string;
  territorio: string | null;
  piano_creato_at?: string | null;
};

export type GiornoGruppo = {
  data: string;
  piani: { piano_id: string; territorio: string | null; operatori: RapRiepilogo[] }[];
};

export function groupRapportiniByDay(raps: RapRiepilogo[]): GiornoGruppo[] {
  const byDay = new Map<string, Map<string, { piano_id: string; territorio: string | null; operatori: RapRiepilogo[] }>>();
  for (const r of raps) {
    if (!byDay.has(r.data)) byDay.set(r.data, new Map());
    const piani = byDay.get(r.data)!;
    if (!piani.has(r.piano_id)) {
      piani.set(r.piano_id, { piano_id: r.piano_id, territorio: r.territorio, operatori: [] });
    }
    piani.get(r.piano_id)!.operatori.push(r);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([data, pianiMap]) => ({ data, piani: [...pianiMap.values()] }));
}
