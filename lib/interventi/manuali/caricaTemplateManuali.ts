// Template SOLO-MANUALE per il "+" operatore e le revisioni, con l'esclusione dei
// modelli RISERVATI a moduli dedicati (oggi: riservato_pi → modulo Pronto Intervento).
// Un modello riservato non alimenta il "+" né la Lista attesa: il suo committente
// serve solo a collocarlo nell'albero di Azioni operatori.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';

export type TemplateManualeRow = {
  id: string;
  committente: string | null;
  active: boolean;
  solo_manuale?: boolean | null;
  campi: TemplateCampo[] | null;
  info_campi?: TemplateInfoCampo[] | null;
  foto_id_priority?: string[] | null;
  riservato_pi?: boolean | null;
};

/** PURA: esclude i modelli riservati a moduli dedicati dal pool del "+". */
export function escludiRiservati<T extends { riservato_pi?: boolean | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.riservato_pi);
}

const COLONNE = 'id, committente, active, solo_manuale, campi, info_campi, foto_id_priority';

/**
 * Carica i template solo_manuale (opzionalmente solo attivi) escludendo i riservati.
 * Resiliente: se la colonna riservato_pi non esiste ancora (migration non applicata)
 * ripiega sulla select senza colonna → nessuna esclusione, comportamento precedente.
 */
export async function caricaTemplateManuali(
  db: SupabaseClient,
  opts: { soloAttivi?: boolean } = {},
): Promise<TemplateManualeRow[]> {
  const costruisci = (cols: string) => {
    let q = db.from('rapportino_template').select(cols).eq('solo_manuale', true);
    if (opts.soloAttivi) q = q.eq('active', true);
    return q;
  };
  const conFlag = await costruisci(`${COLONNE}, riservato_pi`);
  if (!conFlag.error) {
    return escludiRiservati(((conFlag.data ?? []) as unknown) as TemplateManualeRow[]);
  }
  const base = await costruisci(COLONNE);
  return base.error ? [] : (((base.data ?? []) as unknown) as TemplateManualeRow[]);
}
