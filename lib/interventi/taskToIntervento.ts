// Mappa un task della pianificazione (Mappa Operatori) a un record della tabella
// canonica `interventi`. Logica pura: l'I/O (upsert) sta nell'API.
// Parte dell'unificazione mappa = rapportini = torre sullo stesso `interventi`.

import type { Task } from '@/utils/routing/types';

export type InterventoContext = {
  committente: string;
  data: string;
  staffId: string;
  pianoId: string;
  territorioId?: string | null;
};

export type InterventoDaMappa = {
  committente: string;
  odl: string | null;
  pdr: string | null;
  nominativo: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  lat: number | null;
  lng: number | null;
  fascia_oraria: string | null;
  matricola_contatore: string | null;
  intervento_tipo: string | null;
  data: string;
  staff_id: string;
  stato: 'assegnato';
  piano_id: string;
  territorio_id: string | null;
  created_from_mappa: true;
};

export function taskToIntervento(task: Task, ctx: InterventoContext): InterventoDaMappa {
  return {
    committente: ctx.committente,
    odl: (task.odl && task.odl.trim()) || null,
    pdr: task.pdr ?? null,
    nominativo: task.nominativo ?? null,
    indirizzo: task.indirizzo ?? null,
    comune: task.citta ?? null,
    cap: task.cap ?? null,
    lat: task.lat ?? null,
    lng: task.lng ?? null,
    fascia_oraria: task.fascia_oraria ?? null,
    matricola_contatore: task.matricola ?? null,
    intervento_tipo: task.attivita ?? null,
    data: ctx.data,
    staff_id: ctx.staffId,
    stato: 'assegnato',
    piano_id: ctx.pianoId,
    territorio_id: ctx.territorioId ?? null,
    created_from_mappa: true,
  };
}
