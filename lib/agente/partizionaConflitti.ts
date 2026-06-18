// lib/agente/partizionaConflitti.ts
// PURO: partiziona gli operatori di un piano-da-creare in liberi / in conflitto,
// riusando rilevaConflitti (nessuna logica duplicata). Il nuovo piano non esiste
// ancora: pianoId='' così rilevaConflitti non esclude nulla per pianoId.
import { rilevaConflitti, type RapEsistente, type Conflitto } from '@/utils/rapportini/rilevaConflitti';

export type OperatoreConflitto = { staff_id: string; staff_name: string | null };

export function partizionaConflitti(args: {
  operatori: OperatoreConflitto[];
  data: string;
  comune: string;
  esistenti: RapEsistente[];
}): { liberi: OperatoreConflitto[]; inConflitto: Conflitto[] } {
  const inConflitto = rilevaConflitti({
    pianoId: '',
    territorio: args.comune,
    data: args.data,
    operatori: args.operatori,
    esistenti: args.esistenti,
  });
  const idsKO = new Set(inConflitto.map((c) => c.staff_id));
  const liberi = args.operatori.filter((o) => !idsKO.has(o.staff_id));
  return { liberi, inConflitto };
}
