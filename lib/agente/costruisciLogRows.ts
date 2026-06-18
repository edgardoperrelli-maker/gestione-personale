// lib/agente/costruisciLogRows.ts
// PURO: righe da inserire in assegnazione_ai_log, una per operatore pianificato.
import type { OperatorePianoDaCreare } from '@/lib/agente/raggruppaPerPiano';

export function costruisciLogRows(args: {
  data: string;
  comune: string;
  file: string;
  pianoId: string;
  userId: string;
  operatori: OperatorePianoDaCreare[];
}) {
  return args.operatori.map((o) => ({
    data_pianificata: args.data,
    comune: args.comune,
    file: args.file,
    staff_id: o.staffId,
    staff_name: o.staffName,
    n_interventi: o.tasks.length,
    piano_id: args.pianoId,
    creato_da: args.userId,
  }));
}
