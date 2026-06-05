// utils/rapportini/groupByDayTerritory.ts
import type { RapRiepilogo } from './groupByDay';

export type PianoGruppo = {
  piano_id: string;
  creato_at: string | null;
  operatori: RapRiepilogo[];
};
export type TerritorioGruppo = {
  chiave: string;        // normalizzata
  etichetta: string;     // visualizzata
  piani: PianoGruppo[];
  nOperatori: number;
};
export type GiornoTerritori = { data: string; territori: TerritorioGruppo[] };

const SENZA = ' senza'; // chiave speciale: ordina sempre per ultima

function chiaveTerritorio(t: string | null): string {
  const n = (t ?? '').trim().toLowerCase();
  return n === '' ? SENZA : n;
}

export function groupByDayTerritory(raps: RapRiepilogo[]): GiornoTerritori[] {
  const byDay = new Map<string, Map<string, TerritorioGruppo>>();

  for (const r of raps) {
    if (!byDay.has(r.data)) byDay.set(r.data, new Map());
    const terrMap = byDay.get(r.data)!;
    const ck = chiaveTerritorio(r.territorio);
    if (!terrMap.has(ck)) {
      terrMap.set(ck, {
        chiave: ck,
        etichetta: ck === SENZA ? 'Senza territorio' : (r.territorio ?? '').trim().toUpperCase(),
        piani: [],
        nOperatori: 0,
      });
    }
    const terr = terrMap.get(ck)!;
    let piano = terr.piani.find((p) => p.piano_id === r.piano_id);
    if (!piano) {
      piano = { piano_id: r.piano_id, creato_at: r.piano_creato_at ?? null, operatori: [] };
      terr.piani.push(piano);
    }
    piano.operatori.push(r);
    terr.nOperatori++;
  }

  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)) // giorni desc
    .map(([data, terrMap]) => ({
      data,
      territori: [...terrMap.values()]
        .map((t) => ({
          ...t,
          piani: t.piani
            .slice()
            .sort((p, q) => (p.creato_at ?? '').localeCompare(q.creato_at ?? '')),
        }))
        .sort((a, b) => {
          if (a.chiave === SENZA) return 1;
          if (b.chiave === SENZA) return -1;
          return a.etichetta.localeCompare(b.etichetta);
        }),
    }));
}
