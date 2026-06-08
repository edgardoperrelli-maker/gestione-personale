// Pianificazione pura degli interventi di un piano (Mappa Operatori → tabella interventi).
// Nessun I/O. L'I/O sta in ensureInterventiForPiano.ts.
import { taskToIntervento, type InterventoDaMappa } from './taskToIntervento';
import type { Task } from '@/utils/routing/types';

export type PianoMeta = { data: string };
export type OperatorePiano = { staff_id: string; tasks: Task[] | null };
export type InterventoEsistente = {
  id: string;
  odl: string | null;
  stato: string;
  matricola_contatore?: string | null;
  indirizzo?: string | null;
  intervento_tipo?: string | null;
};

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

/**
 * Identità robusta di un intervento per il dedup in rigenerazione.
 * ODL se presente; altrimenti (ACEA ha spesso ODL null) identità composta
 * indirizzo+matricola(+attività). Serve a NON ricreare/duplicare un intervento
 * già presente quando si rigenera dai task del piano.
 */
function identitaIntervento(r: {
  odl: string | null;
  matricola_contatore?: string | null;
  indirizzo?: string | null;
  intervento_tipo?: string | null;
}): string | null {
  const odl = (r.odl ?? '').trim().toLowerCase();
  if (odl) return `odl:${odl}`;
  const matr = (r.matricola_contatore ?? '').trim().toLowerCase();
  const ind = (r.indirizzo ?? '').trim().toLowerCase();
  const tipo = (r.intervento_tipo ?? '').trim().toLowerCase();
  if (matr || ind) return `c:${matr}|${ind}|${tipo}`;
  return null;
}

export function planInterventi(input: PianoPlanInput): PianoPlan {
  const committente = input.committente ?? 'acea';
  // Solo i 'completato' sono esiti reali da preservare. Gli 'annullato' dei piani arrivano
  // dall'ufficio (in pianificazione) e devono seguire i task → reversibili.
  const isTerminale = (stato: string) => stato === 'completato';

  // Identità degli interventi GIÀ TERMINALI (completati): sono preservati,
  // quindi i task corrispondenti NON vanno re-inseriti (sennò si duplicano — caso
  // ACEA con ODL null, dove il dedup per solo ODL non bastava).
  const keyTerminali = new Set(
    input.esistenti.filter((e) => isTerminale(e.stato)).map(identitaIntervento).filter((x): x is string => !!x),
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
      // Già chiuso (per ODL o per identità composta indirizzo+matricola) → preserva, non duplicare.
      const key = identitaIntervento(rec);
      if (key && keyTerminali.has(key)) continue;
      if (rec.odl) {
        if (odlGiaPresenti.has(rec.odl)) continue; // esiste su altro piano stessa data
        if (visti.has(rec.odl)) continue; // dedup interno al batch
        visti.add(rec.odl);
      }
      daInserire.push(rec);
    }
  }

  return { idDaEliminare, daInserire };
}
