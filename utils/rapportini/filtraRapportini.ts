// utils/rapportini/filtraRapportini.ts
import type { RapRiepilogo } from './groupByDay';

export type FiltriRiepilogo = {
  territorio: string;                  // '' = tutti
  operatore: string;                   // '' = tutti (match su staff_id o nome)
  stati: Array<'valido' | 'scaduto' | 'inviato'>; // [] = tutti
  q: string;                           // ricerca testuale libera
};

export function filtraRapportini(list: RapRiepilogo[], f: FiltriRiepilogo): RapRiepilogo[] {
  const terr = f.territorio.trim().toLowerCase();
  const op = f.operatore.trim().toLowerCase();
  const q = f.q.trim().toLowerCase();
  return list.filter((r) => {
    if (terr && (r.territorio ?? '').trim().toLowerCase() !== terr) return false;
    if (op && (r.staff_name ?? '').trim().toLowerCase() !== op && r.staff_id.toLowerCase() !== op) return false;
    if (f.stati.length && !f.stati.includes(r.statoCalcolato)) return false;
    if (q) {
      const hay = `${r.staff_name ?? ''} ${r.territorio ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
