// Pianificazione pura degli interventi di un piano (Mappa Operatori → tabella interventi).
// Nessun I/O. L'I/O sta in ensureInterventiForPiano.ts.
import { taskToIntervento, type InterventoDaMappa } from './taskToIntervento';
import type { Task } from '@/utils/routing/types';

export type PianoMeta = { data: string };
export type OperatorePiano = { staff_id: string; tasks: Task[] | null };
export type InterventoEsistente = { id: string; odl: string | null; stato: string };

export type PianoPlanInput = {
  committente?: string;
  piano: PianoMeta;
  pianoId: string;
  operatori: OperatorePiano[];
  esistenti: InterventoEsistente[];
  territorioId: string | null;
  /** odl già presenti in `interventi` su ALTRI piani della stessa data (indice unico globale). */
  odlGiaPresenti?: Set<string>;
};

export type PianoPlan = {
  idDaEliminare: string[];
  daInserire: InterventoDaMappa[];
};

export function planInterventi(input: PianoPlanInput): PianoPlan {
  const committente = input.committente ?? 'acea';
  const isTerminale = (stato: string) => stato === 'completato' || stato === 'annullato';

  const odlTerminali = new Set(
    input.esistenti.filter((e) => isTerminale(e.stato)).map((e) => e.odl).filter((x): x is string => !!x),
  );
  const idDaEliminare = input.esistenti.filter((e) => !isTerminale(e.stato)).map((e) => e.id);

  const odlGiaPresenti = input.odlGiaPresenti ?? new Set<string>();
  const visti = new Set<string>();
  const daInserire: InterventoDaMappa[] = [];

  for (const op of input.operatori) {
    for (const t of op.tasks ?? []) {
      const rec = taskToIntervento(t, {
        committente,
        data: input.piano.data,
        staffId: op.staff_id,
        pianoId: input.pianoId,
        territorioId: input.territorioId,
      });
      if (rec.odl) {
        if (odlTerminali.has(rec.odl)) continue; // già chiuso → preserva, non duplicare
        if (odlGiaPresenti.has(rec.odl)) continue; // esiste su altro piano stessa data
        if (visti.has(rec.odl)) continue; // dedup interno al batch
        visti.add(rec.odl);
      }
      daInserire.push(rec);
    }
  }

  return { idDaEliminare, daInserire };
}
