// lib/agente/raggruppaPerPiano.ts
// PURO: trasforma le righe risolte in una lista di piani (uno per data+TERRITORIO),
// ciascuno con gli operatori e i loro Task. Riusato dall'endpoint /assegna.
// Il territorio (macro: ACEA, LAZIO CENTRO, …) è scelto dall'utente al momento
// dell'assegnazione: i comuni vengono ACCORPATI sotto quel territorio, così ogni
// operatore ha UN solo piano/rapportino per (giorno, territorio). Il comune resta
// come indirizzo (citta) del singolo task, non più come chiave del piano.
import type { Task } from '@/utils/routing/types';

export type RigaRisolta = {
  id: string; odl: string | null; matricola: string | null; indirizzo: string | null;
  comune: string | null; data: string; staffId: string; staffName: string;
  /** Attività specifica della riga (dal file ACEA, colonna "Operazione testo breve").
   *  Se assente/vuota si usa il fallback per-file (cfg.attivita, es. DUNNING). */
  attivita?: string | null;
};
export type OperatorePianoDaCreare = { staffId: string; staffName: string; tasks: Task[] };
export type PianoDaCreare = { data: string; territorio: string; operatori: OperatorePianoDaCreare[] };

function rigaToTask(r: RigaRisolta, attivitaFallback: string): Task {
  return {
    id: r.id,
    odl: r.odl ?? '',
    indirizzo: r.indirizzo ?? '',
    cap: '',
    citta: r.comune ?? '',
    priorita: 0,
    fascia_oraria: '',
    matricola: r.matricola ?? undefined,
    // l'attività specifica della riga (es. "SOSPENSIONE") vince; se assente/vuota → fallback per-file
    attivita: (r.attivita ?? '').trim() || attivitaFallback,
  };
}

export function raggruppaPerPiano(righe: RigaRisolta[], attivita: string, territorio: string): PianoDaCreare[] {
  const piani = new Map<string, PianoDaCreare>();
  for (const r of righe ?? []) {
    const keyP = `${r.data}|${territorio}`;
    let piano = piani.get(keyP);
    if (!piano) { piano = { data: r.data, territorio, operatori: [] }; piani.set(keyP, piano); }
    let op = piano.operatori.find((o) => o.staffId === r.staffId);
    if (!op) { op = { staffId: r.staffId, staffName: r.staffName, tasks: [] }; piano.operatori.push(op); }
    op.tasks.push(rigaToTask(r, attivita));
  }
  return [...piani.values()];
}
