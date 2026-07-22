import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { risolviFlussoPerGruppo, templateCollegato } from '@/lib/rapportini/flussiGruppo';
import { committenteEquivalente } from '@/lib/attivita/tassonomia';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export type FlussoRow = {
  id: string;
  nome: string | null;
  campi: TemplateCampo[] | null;
  info_campi?: unknown;
  tipo?: string | null;
  solo_manuale: boolean | null;
  gruppo_committente: string | null;
  gruppi_attivita: string[] | null;
};

/**
 * Carica i template attivi con le colonne di collegamento al gruppo attività (Azioni operatori).
 * Resiliente: se le colonne di collegamento non esistono ancora, ripiega su una select base.
 */
export async function caricaFlussi(db: SupabaseClient): Promise<FlussoRow[]> {
  const q = await db
    .from('rapportino_template')
    .select('id, nome, campi, info_campi, tipo, solo_manuale, gruppo_committente, gruppi_attivita')
    .eq('active', true);
  if (!q.error) return (q.data ?? []) as FlussoRow[];
  const base = await db
    .from('rapportino_template')
    .select('id, nome, campi, info_campi, tipo, solo_manuale')
    .eq('active', true);
  return base.error ? [] : (((base.data ?? []) as unknown) as FlussoRow[]);
}

export type CampiRisolti = {
  templateId: string | null;
  campi: TemplateCampo[];
  infoCampi: unknown;
  tipo: string;
  /** true se un flusso collegato al gruppo è stato trovato (false = fallback). */
  flussoTrovato: boolean;
};

/**
 * Fallback quando un gruppo non ha flusso collegato: primo template attivo non-manuale
 * (ordine nome IT), come sincronizzaRapportini. Garantisce che il "Nuovo ordine" abbia
 * comunque delle azioni da compilare.
 */
export function fallbackFlusso(flussi: FlussoRow[]): FlussoRow | null {
  return flussi
    .filter((f) => !f.solo_manuale)
    .filter((f) => Array.isArray(f.campi) && f.campi.length > 0)
    .sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? '', 'it'))[0] ?? null;
}

/**
 * Risolve le azioni (campi) per un ordine consuntivato dato committente + gruppo attività.
 * Batte il flusso collegato più specifico; in assenza, ripiega sul primo flusso attivo.
 */
export function risolviCampiFlusso(
  committente: string | null | undefined,
  gruppo: string | null | undefined,
  flussi: FlussoRow[],
): CampiRisolti {
  const collegati = flussi.filter((f) => templateCollegato(f));
  const flusso = risolviFlussoPerGruppo(committenteEquivalente(committente), gruppo, collegati);
  if (flusso && Array.isArray(flusso.campi) && flusso.campi.length > 0) {
    return {
      templateId: flusso.id,
      campi: flusso.campi as TemplateCampo[],
      infoCampi: flusso.info_campi ?? [],
      tipo: flusso.tipo ?? 'standard',
      flussoTrovato: true,
    };
  }
  const fb = fallbackFlusso(flussi);
  return {
    templateId: fb?.id ?? null,
    campi: (fb?.campi ?? []) as TemplateCampo[],
    infoCampi: fb?.info_campi ?? [],
    tipo: fb?.tipo ?? 'standard',
    flussoTrovato: false,
  };
}
