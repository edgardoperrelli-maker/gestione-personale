// Mappa un task della pianificazione (Mappa Operatori) a un record della tabella
// canonica `interventi`. Logica pura: l'I/O (upsert) sta nell'API.
// Parte dell'unificazione mappa = rapportini = torre sullo stesso `interventi`.

import type { Task } from '@/utils/routing/types';
import { risolviGruppo, type TassonomiaRiga } from '@/lib/attivita/tassonomia';

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
  gruppo_attivita: string | null;
  data: string;
  staff_id: string;
  stato: 'assegnato' | 'annullato';
  piano_id: string;
  territorio_id: string | null;
  created_from_mappa: true;
};

export function taskToIntervento(
  task: Task,
  ctx: InterventoContext,
  indiceTassonomia?: Map<string, TassonomiaRiga>,
): InterventoDaMappa {
  // Derivazione soft: se l'indice risolve l'attività, scrive la forma canonica + il
  // gruppo; se non risolve (o l'indice non è disponibile), comportamento storico
  // invariato (task.attivita così com'è, gruppo null). Mai bloccante (spec §8).
  // Il lookup prova il committente del piano e POI gli altri ('altro' = acea→italgas,
  // la STESSA semantica della validazione import): un giro misto caricato da file con
  // base 'acea' che contiene attività italgas produce interventi ITALGAS col loro
  // gruppo, così ogni voce di rapportino risolve il flusso della SUA attività
  // (Azioni operatori) invece di cadere sul fallback.
  const ris = indiceTassonomia
    ? risolviGruppo(ctx.committente, task.attivita, indiceTassonomia, { allinea: 'scrittura' })
      ?? risolviGruppo('altro', task.attivita, indiceTassonomia, { allinea: 'scrittura' })
    : null;
  return {
    committente: ris?.committente ?? ctx.committente,
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
    intervento_tipo: ris ? ris.descrizione : (task.attivita ?? null),
    gruppo_attivita: ris ? ris.gruppo : null,
    data: ctx.data,
    staff_id: ctx.staffId,
    stato: task.annullato ? 'annullato' : 'assegnato',
    piano_id: ctx.pianoId,
    territorio_id: ctx.territorioId ?? null,
    created_from_mappa: true,
  };
}
