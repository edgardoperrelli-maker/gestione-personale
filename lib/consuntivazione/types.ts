// Tipi condivisi del modulo Consuntivazione (back office esita interventi come da rapportino,
// assegnando l'esecuzione a uno o più operatori).
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { CommittenteManuale, AnagraficaManuale } from '@/lib/interventi/manuali/types';

/** Un esecutore della squadra: staff_id (convenzione text del progetto) + nome mostrato. */
export type Esecutore = { staff_id: string; staff_name: string | null };

/** Anagrafica di un ordine consuntivato (stessa forma dell'anagrafica manuale). */
export type AnagraficaConsuntivo = AnagraficaManuale;

/** Payload di "Nuovo ordine": anagrafica + attività (→ flusso) + risposte alle azioni + squadra. */
export type NuovoOrdinePayload = {
  committente: CommittenteManuale;
  anagrafica: AnagraficaConsuntivo;
  risposte: Record<string, unknown>;
  esecutori: Esecutore[];
  /** Data di esecuzione (YYYY-MM-DD): giorno lavori dell'ordine. Default = oggi. */
  dataEsecuzione: string;
};

/** Payload di "Ordine presente": intervento esistente + risposte alle sue azioni + squadra. */
export type EsitaPresentePayload = {
  interventoId: string;
  risposte: Record<string, unknown>;
  esecutori: Esecutore[];
  /** Data di esecuzione (YYYY-MM-DD). Default = data dell'intervento. */
  dataEsecuzione: string;
};

/** Esito calcolato dalle azioni compilate. */
export type EsitoVoce = 'positivo' | 'negativo' | 'neutro';

/** Campi (azioni) di una voce/flusso da renderizzare/valutare. */
export type CampiFlusso = TemplateCampo[];
