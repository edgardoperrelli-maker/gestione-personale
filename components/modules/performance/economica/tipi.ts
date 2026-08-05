// Tipo del payload /api/admin/acea/produzione + helper di formattazione condivisi
// tra la tab in-app (PerformanceEconomica) e la vista presentazione.

import type { Aggregato, ProduzioneAggregata } from '@/lib/produzione/aggregaProduzione';
import type { ProduzionePersonale } from '@/lib/produzione/aggregaPersonale';
import type { EsitoOperatore } from '@/lib/produzione/aggregaEsiti';
import type { ClasseDiscrepanza, Discrepanza, Totale } from '@/lib/produzione/riconciliazione';
import type { SalStorico } from '@/lib/produzione/salUfficiale';
import type { ConfrontoSal } from '@/lib/produzione/confrontoSal';
import type { VistaCommittente } from '@/lib/produzione/committente';

export interface DatiProduzione {
  from: string;
  to: string;
  /** Di quale committente parla questo payload. */
  vista: VistaCommittente;
  /**
   * `false` sulla vista AcquaLatina: SAL, pre-SAL, fuori-SAL, scarto e audit sono a zero perché
   * non esiste un portale che li produca — non perché non ci abbiano pagato.
   */
  conContabilizzazione: boolean;
  produzione: ProduzioneAggregata;
  /** La sola quota ACEA: l'unica confrontabile col SAL (vedi `load.ts`). */
  produzioneAcea: { totale: Totale; perGiorno: Aggregato[] };
  sal: { totale: Totale; perVoce: Aggregato[]; perGiorno: Aggregato[] };
  scarto: Totale;
  salStorico: SalStorico[];
  /** Presente solo quando la barra periodo ha un SAL selezionato nella tendina. */
  confrontoSal: ConfrontoSal | null;
  preSal: { n: number; totale: Totale };
  fuoriSal: Totale;
  /** Prodotto positivo senza un ordine ACEA dietro: conta solo in produzione, mai nel SAL. */
  senzaOrdine: { totale: Totale; perAttivita: Aggregato[]; perGiorno: Aggregato[] };
  personale: ProduzionePersonale;
  esiti: EsitoOperatore[];
  audit: Discrepanza[];
  auditSummary: Record<ClasseDiscrepanza, number>;
  auditTotale: number;
  auditTruncated: boolean;
  registroPopolato: boolean;
  portalePopolato: boolean;
}

export const eur = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
export const num = (n: number) => n.toLocaleString('it-IT');
/** 'YYYY-MM-DD' → 'dd/MM' (assi dei grafici). */
export const giornoIT = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
