// utils/rapportini/rilevaConflitti.ts
export type RapEsistente = {
  id: string; staff_id: string; piano_id: string;
  territorio: string | null; data: string;
  stato: string; submitted_at: string | null;
};
export type Conflitto = {
  staff_id: string; staff_name: string | null;
  territorio: string | null; data: string;
  rapportino_id: string; piano_id_esistente: string; submitted: boolean;
};

const norm = (t: string | null) => (t ?? '').trim().toLowerCase();

export function rilevaConflitti(args: {
  pianoId: string;
  territorio: string | null;
  data: string;
  operatori: { staff_id: string; staff_name: string | null }[];
  esistenti: RapEsistente[];
}): Conflitto[] {
  const terr = norm(args.territorio);
  if (terr === '') return []; // territorio mancante non genera conflitti
  const out: Conflitto[] = [];
  for (const op of args.operatori) {
    const hit = args.esistenti.find(
      (e) => e.piano_id !== args.pianoId && e.staff_id === op.staff_id && e.data === args.data && norm(e.territorio) === terr,
    );
    if (hit) {
      out.push({
        staff_id: op.staff_id, staff_name: op.staff_name,
        territorio: args.territorio, data: args.data,
        rapportino_id: hit.id, piano_id_esistente: hit.piano_id,
        submitted: hit.stato === 'inviato' || hit.submitted_at != null,
      });
    }
  }
  return out;
}
