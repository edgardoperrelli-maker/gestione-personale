// utils/rapportini/groupByDayTerritory.ts
import type { RapRiepilogo } from './groupByDay';
import { ordinaGiorni } from './giorniRiepilogo';

export type PianoGruppo = { piano_id: string; creato_at: string | null; operatori: RapRiepilogo[] };
export type TerritorioGruppo = { chiave: string; etichetta: string; piani: PianoGruppo[]; nOperatori: number };
export type GiornoTerritori = { data: string; territori: TerritorioGruppo[] };

const SENZA = '￿'; // ordina sempre per ultimo
const chiaveTerr = (t: string | null) => {
  const n = (t ?? '').trim().toLowerCase();
  return n === '' ? SENZA : n;
};
const etichettaTerr = (t: string | null) => {
  const n = (t ?? '').trim().toUpperCase();
  return n === '' ? 'Senza territorio' : n;
};

export function groupByDayTerritory(raps: RapRiepilogo[], oggi: string): GiornoTerritori[] {
  // data → territorio-chiave → piano_id → PianoGruppo
  const byDay = new Map<string, Map<string, Map<string, PianoGruppo>>>();

  for (const r of raps) {
    if (!byDay.has(r.data)) byDay.set(r.data, new Map());
    const byTerr = byDay.get(r.data)!;
    const tk = chiaveTerr(r.territorio ?? null);
    if (!byTerr.has(tk)) byTerr.set(tk, new Map());
    const byPiano = byTerr.get(tk)!;
    if (!byPiano.has(r.piano_id)) {
      byPiano.set(r.piano_id, {
        piano_id: r.piano_id,
        creato_at: r.piano_creato_at ?? null,
        operatori: [],
      });
    }
    byPiano.get(r.piano_id)!.operatori.push(r);
  }

  const giorniOrdinati = ordinaGiorni([...byDay.keys()], oggi);

  return giorniOrdinati.map((data) => {
    const byTerr = byDay.get(data)!;

    const territori: TerritorioGruppo[] = [...byTerr.entries()]
      .sort(([ka], [kb]) => {
        if (ka === SENZA && kb !== SENZA) return 1;
        if (kb === SENZA && ka !== SENZA) return -1;
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      })
      .map(([chiave, byPiano]) => {
        const piani = [...byPiano.values()].sort((a, b) =>
          (a.creato_at ?? '').localeCompare(b.creato_at ?? ''),
        );
        const nOperatori = piani.reduce((s, p) => s + p.operatori.length, 0);
        // recupera il territorio originale dal primo operatore del primo piano
        const primoOp = piani[0]?.operatori[0];
        const terrOriginale = primoOp?.territorio ?? null;
        return {
          chiave,
          etichetta: chiave === SENZA ? 'Senza territorio' : etichettaTerr(terrOriginale ?? chiave),
          piani,
          nOperatori,
        };
      });

    return { data, territori };
  });
}
