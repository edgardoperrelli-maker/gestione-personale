import type { Task } from '@/utils/routing/types';
import type { InterventoRow } from '@/lib/interventi/interventiView';

/**
 * Riga della tabella `interventi` arricchita dei campi geo/extra necessari a
 * costruire un Task per la mappa. Estende InterventoRow (sola lettura) senza
 * modificarne la forma: interventiView.ts resta intatto (file caldo WP3c).
 */
export type InterventoGeoRow = InterventoRow & {
  lat: number | null;
  lng: number | null;
  cap: string | null;
  pdr: string | null;
  matricola_contatore: string | null;
  intervento_tipo: string | null;
  codice_servizio: string | null;
  richiede_due_operatori: boolean | null;
  durata_stimata_min: number | null;
  data: string;
};

/**
 * Mappa una riga `interventi` geocodificata nel tipo Task prodotto da
 * parseExcelToTasks, così che il codice di distribuzione della mappa funzioni
 * senza modifiche. Inverso di taskToIntervento (comune→citta,
 * matricola_contatore→matricola, intervento_tipo→attivita, codice_servizio→codice).
 */
export function mapInterventoToTask(row: InterventoGeoRow): Task {
  return {
    id: row.id,
    odl: row.odl ?? '',
    pdr: row.pdr ?? undefined,
    indirizzo: row.indirizzo ?? '',
    cap: row.cap ?? '',
    citta: row.comune ?? '',
    priorita: 0,
    fascia_oraria: row.fascia_oraria ?? '',
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    requiresTwoOperators: row.richiede_due_operatori ?? undefined,
    nominativo: row.nominativo ?? undefined,
    matricola: row.matricola_contatore ?? undefined,
    attivita: row.intervento_tipo ?? undefined,
    codice: row.codice_servizio ?? undefined,
    durata_min: row.durata_stimata_min ?? undefined,
  };
}

/** Una entry del piano: un operatore con i suoi task ordinati. */
export type PianoEntry = { staffId: string; tasks: Array<{ id: string }> };

/** Riga del payload verso POST /api/interventi/distribuzione. */
export type DistribuzioneRiga = { intervento_id: string; staff_id: string; ordine: number };

/**
 * Costruisce il payload di assegnazione dalla distribuzione mappa→operatori.
 * `ordine` è 1-based per operatore (posizione nel giro). Flatten su tutte le entry.
 */
export function buildDistribuzionePayload(piano: PianoEntry[]): DistribuzioneRiga[] {
  return piano.flatMap((entry) =>
    entry.tasks.map((task, i) => ({
      intervento_id: task.id,
      staff_id: entry.staffId,
      ordine: i + 1,
    })),
  );
}
