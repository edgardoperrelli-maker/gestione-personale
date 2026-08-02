// lib/acea/vociRapportino.ts
// PURA: le due decisioni del motore rapportini ACEA — a quale rapportino attaccarsi e quali voci
// aggiungere.
//
// La regola di casa è «un rapportino per operatore per giorno». Il motore ACEA non possiede il
// rapportino: lo trova già lì (creato dalla pianificazione Italgas) e vi aggiunge il proprio
// lavoro, oppure lo crea lui se l'operatore quel giorno ha solo ACEA. Nessuna cancellazione, mai:
// le voci altrui non sono sue.

import { normOdl } from '@/lib/interventi/odlPositivi';
import { PROFILO_COMMESSA } from '@/lib/acea/famiglia';

/** Territorio dei piani-contenitore creati dal motore. Vive solo per soddisfare la FK dei rapportini. */
export const TERRITORIO_ACEA = PROFILO_COMMESSA.dunning.territorioPiani;

/** I due marcatori di canale della commessa ACEA: in tassonomia sono lo stesso committente. */
export const COMMITTENTI_ACEA = PROFILO_COMMESSA.dunning.committenti;

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
  /**
   * Recapito dell'utente. Opzionale: la colonna su `interventi` è nata dopo il motore (2026-08-02,
   * commessa AcquaLatina), e una lettura che non la seleziona non deve far cadere il tipo.
   */
  recapito?: string | null;
};

export type VoceEsistente = {
  task_id: string | null;
  intervento_id: string | null;
  odl: string | null;
  ordine: number | null;
  /** Matricola della voce: serve al confronto quando l'unità è `odl_matricola` (AcquaLatina). */
  matricola?: string | null;
};

export type EsitoVoci = {
  daAggiungere: InterventoDaVoce[];
  /** Interventi che una voce ce l'hanno già: la misura dell'idempotenza. */
  giaPresenti: number;
  /** Primo `ordine` libero: le voci ACEA si accodano, non si infilano in mezzo al giro. */
  ordineIniziale: number;
};

/** Unità di confronto delle voci: l'ODL (ACEA) o la coppia ODL+matricola (AcquaLatina). */
export type UnitaVoce = 'odl' | 'odl_matricola';

/** Matricola normalizzata per il confronto: maiuscola, senza separatori. '' se assente. */
const normMatricola = (m: string | null | undefined): string =>
  String(m ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Quali interventi non hanno ancora una voce nel rapportino.
 *
 * Tre chiavi di confronto, in ordine di robustezza:
 *  - `intervento_id`, il collegamento diretto;
 *  - `task_id`, che sopravvive all'azzeramento della FK;
 *  - **l'unità di lavoro, su qualunque origine** — per ACEA è l'ODL, ed è la chiave più
 *    importante nel periodo di transizione: finché il vecchio flusso da master genera voci
 *    `origine='task'` per gli stessi ODL, senza questo controllo l'operatore si troverebbe lo
 *    stesso intervento due volte nel rapportino. Per AcquaLatina l'unità è ODL+matricola: un
 *    ordine copre fino a cinque contatori dello stesso stabile, e ognuno è una voce SUA — la
 *    chiave sul solo ODL ne farebbe sparire quattro come «già presenti».
 */
export function vociDaAggiungere(
  interventi: readonly InterventoDaVoce[],
  esistenti: readonly VoceEsistente[],
  unita: UnitaVoce = 'odl',
): EsitoVoci {
  const perId = new Set<string>();
  const perTask = new Set<string>();
  const perUnita = new Set<string>();
  // '' se la chiave non è calcolabile (ODL assente): il confronto per unità non si applica.
  const chiaveUnita = (odl: string | null, matricola: string | null | undefined): string => {
    const o = normOdl(odl);
    if (o === '') return '';
    return unita === 'odl_matricola' ? `${o}#${normMatricola(matricola)}` : o;
  };
  let maxOrdine = 0;
  for (const v of esistenti) {
    if (v.intervento_id) perId.add(v.intervento_id);
    if (v.task_id) perTask.add(v.task_id);
    const k = chiaveUnita(v.odl, v.matricola);
    if (k) perUnita.add(k);
    if (typeof v.ordine === 'number' && v.ordine > maxOrdine) maxOrdine = v.ordine;
  }

  const daAggiungere: InterventoDaVoce[] = [];
  let giaPresenti = 0;
  for (const i of interventi) {
    const k = chiaveUnita(i.odl, i.matricola_contatore);
    const gia = perId.has(i.id) || perTask.has(taskIdAcea(i.id)) || (k !== '' && perUnita.has(k));
    if (gia) {
      giaPresenti++;
      continue;
    }
    // Segna subito: due interventi aperti sulla stessa unità non dovrebbero esistere, ma se
    // esistessero produrrebbero due voci identiche nello stesso giro.
    perId.add(i.id);
    if (k !== '') perUnita.add(k);
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
