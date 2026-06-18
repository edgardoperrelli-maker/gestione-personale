// lib/agente/raggruppaPerPiano.ts
// PURO: trasforma le righe risolte in una lista di piani (uno per data+comune),
// ciascuno con gli operatori e i loro Task. Riusato dall'endpoint /assegna.
import type { Task } from '@/utils/routing/types';

export type RigaRisolta = {
  id: string; odl: string | null; matricola: string | null; indirizzo: string | null;
  comune: string | null; data: string; staffId: string; staffName: string;
};
export type OperatorePianoDaCreare = { staffId: string; staffName: string; tasks: Task[] };
export type PianoDaCreare = { data: string; comune: string; operatori: OperatorePianoDaCreare[] };

function rigaToTask(r: RigaRisolta, attivita: string): Task {
  return {
    id: r.id,
    odl: r.odl ?? '',
    indirizzo: r.indirizzo ?? '',
    cap: '',
    citta: r.comune ?? '',
    priorita: 0,
    fascia_oraria: '',
    matricola: r.matricola ?? undefined,
    attivita,
  };
}

export function raggruppaPerPiano(righe: RigaRisolta[], attivita: string): PianoDaCreare[] {
  const piani = new Map<string, PianoDaCreare>();
  for (const r of righe ?? []) {
    const comune = r.comune ?? '';
    const keyP = `${r.data}|${comune}`;
    let piano = piani.get(keyP);
    if (!piano) { piano = { data: r.data, comune, operatori: [] }; piani.set(keyP, piano); }
    let op = piano.operatori.find((o) => o.staffId === r.staffId);
    if (!op) { op = { staffId: r.staffId, staffName: r.staffName, tasks: [] }; piano.operatori.push(op); }
    op.tasks.push(rigaToTask(r, attivita));
  }
  return [...piani.values()];
}
