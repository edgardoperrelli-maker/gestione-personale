// lib/acea/vociRapportino.ts
// PURA: le due decisioni del motore rapportini ACEA — a quale rapportino attaccarsi e quali voci
// aggiungere.
//
// La regola di casa è «un rapportino per operatore per giorno». Il motore ACEA non possiede il
// rapportino: lo trova già lì (creato dalla pianificazione Italgas) e vi aggiunge il proprio
// lavoro, oppure lo crea lui se l'operatore quel giorno ha solo ACEA. Nessuna cancellazione, mai:
// le voci altrui non sono sue.

import { normOdl } from '@/lib/interventi/odlPositivi';

/** Territorio dei piani-contenitore creati dal motore. Vive solo per soddisfare la FK dei rapportini. */
export const TERRITORIO_ACEA = 'ACEA';

/** I due marcatori di canale della commessa: in tassonomia sono lo stesso committente. */
export const COMMITTENTI_ACEA = ['acea', 'lim_massive'] as const;

/**
 * `task_id` della voce ACEA: funzione deterministica del suo intervento.
 *
 * È ciò che rende il motore idempotente — un secondo giro sullo stesso giorno ritrova le voci che
 * ha già scritto invece di duplicarle — e resta valido anche se `intervento_id` si azzera
 * (la FK è `on delete set null`).
 */
export function taskIdAcea(interventoId: string): string {
  return `acea:${interventoId}`;
}

export type InterventoDaVoce = {
  id: string;
  odl: string | null;
  staff_id: string;
  intervento_tipo: string | null;
  gruppo_attivita: string | null;
  committente: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  matricola_contatore: string | null;
  nominativo: string | null;
  pdr: string | null;
};

export type VoceEsistente = {
  task_id: string | null;
  intervento_id: string | null;
  odl: string | null;
  ordine: number | null;
};

export type EsitoVoci = {
  daAggiungere: InterventoDaVoce[];
  /** Interventi che una voce ce l'hanno già: la misura dell'idempotenza. */
  giaPresenti: number;
  /** Primo `ordine` libero: le voci ACEA si accodano, non si infilano in mezzo al giro. */
  ordineIniziale: number;
};

/**
 * Quali interventi non hanno ancora una voce nel rapportino.
 *
 * Tre chiavi di confronto, in ordine di robustezza:
 *  - `intervento_id`, il collegamento diretto;
 *  - `task_id`, che sopravvive all'azzeramento della FK;
 *  - **l'ODL, su qualunque origine** — ed è la più importante nel periodo di transizione: finché
 *    il vecchio flusso da master genera voci `origine='task'` per gli stessi ODL ACEA, senza
 *    questo controllo l'operatore si troverebbe lo stesso intervento due volte nel rapportino.
 */
export function vociDaAggiungere(
  interventi: readonly InterventoDaVoce[],
  esistenti: readonly VoceEsistente[],
): EsitoVoci {
  const perId = new Set<string>();
  const perTask = new Set<string>();
  const perOdl = new Set<string>();
  let maxOrdine = 0;
  for (const v of esistenti) {
    if (v.intervento_id) perId.add(v.intervento_id);
    if (v.task_id) perTask.add(v.task_id);
    const k = normOdl(v.odl);
    if (k) perOdl.add(k);
    if (typeof v.ordine === 'number' && v.ordine > maxOrdine) maxOrdine = v.ordine;
  }

  const daAggiungere: InterventoDaVoce[] = [];
  let giaPresenti = 0;
  for (const i of interventi) {
    const odl = normOdl(i.odl);
    const gia = perId.has(i.id) || perTask.has(taskIdAcea(i.id)) || (odl !== '' && perOdl.has(odl));
    if (gia) {
      giaPresenti++;
      continue;
    }
    // Segna subito: due interventi aperti sullo stesso ODL non dovrebbero esistere, ma se
    // esistessero produrrebbero due voci identiche nello stesso giro.
    perId.add(i.id);
    if (odl !== '') perOdl.add(odl);
    daAggiungere.push(i);
  }

  return { daAggiungere, giaPresenti, ordineIniziale: maxOrdine + 1 };
}

export type RapportinoCandidato = {
  id: string;
  stato: string;
  created_at: string | null;
  /** Vero se il rapportino ospita già voci del motore ACEA. */
  conVociAcea: boolean;
};

/**
 * A quale rapportino attaccarsi quando l'operatore ne ha più d'uno per quel giorno.
 *
 * Precedenza: **prima quello ancora aperto** — aggiungere lavoro dove l'operatore può ancora
 * scrivere è sempre meglio che pretendere una riapertura; poi quello che ospita già voci ACEA,
 * per non spargere la commessa su due rapportini; poi il più vecchio, e l'id come spareggio
 * perché la scelta dev'essere la stessa a ogni giro.
 */
export function scegliRapportino(
  candidati: readonly RapportinoCandidato[],
): RapportinoCandidato | null {
  if (candidati.length === 0) return null;
  const punteggio = (c: RapportinoCandidato) => (c.stato !== 'inviato' ? 0 : 1);
  return [...candidati].sort(
    (a, b) =>
      punteggio(a) - punteggio(b) ||
      Number(b.conVociAcea) - Number(a.conVociAcea) ||
      String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) ||
      a.id.localeCompare(b.id),
  )[0];
}

/** Cosa è successo a un operatore. Nessun esito è silenzioso: anche «nulla da fare» si dice. */
export type TipoEsito = 'creato' | 'aggiunto' | 'richiede_riapertura' | 'nessuna_modifica';

export type EsitoOperatore = {
  staff_id: string;
  staff_name: string | null;
  esito: TipoEsito;
  rapportino_id: string | null;
  url: string | null;
  interventi: number;
  voci_aggiunte: number;
  voci_gia_presenti: number;
};

/** Riassunto per la UI: quante righe per ciascun esito. */
export function riepilogoEsiti(esiti: readonly EsitoOperatore[]): Record<TipoEsito, number> {
  const out: Record<TipoEsito, number> = {
    creato: 0, aggiunto: 0, richiede_riapertura: 0, nessuna_modifica: 0,
  };
  for (const e of esiti) out[e.esito]++;
  return out;
}
