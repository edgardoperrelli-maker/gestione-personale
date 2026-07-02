// Tipo del payload /api/admin/acea/produzione + helper di formattazione condivisi
// tra la tab in-app (PerformanceEconomica) e la vista presentazione.

import type { Aggregato, ProduzioneAggregata } from '@/lib/produzione/aggregaProduzione';
import type { ProduzionePersonale } from '@/lib/produzione/aggregaPersonale';
import type { ClasseDiscrepanza, Discrepanza, Totale } from '@/lib/produzione/riconciliazione';

export interface DatiProduzione {
  from: string;
  to: string;
  produzione: ProduzioneAggregata;
  sal: { totale: Totale; perVoce: Aggregato[]; perGiorno: Aggregato[] };
  scarto: Totale;
  personale: ProduzionePersonale;
  audit: Discrepanza[];
  auditSummary: Record<ClasseDiscrepanza, number>;
  auditTotale: number;
  auditTruncated: boolean;
  masterPopolato: boolean;
  portalePopolato: boolean;
}

export const eur = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
export const num = (n: number) => n.toLocaleString('it-IT');
/** 'YYYY-MM-DD' → 'dd/MM' (assi dei grafici). */
export const giornoIT = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
