import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { TassonomiaRiga } from './tassonomia';

/** Carica le righe di tassonomia (anche non attive: filtra buildTassonomiaIndex). */
export async function caricaTassonomia(): Promise<TassonomiaRiga[]> {
  const { data, error } = await supabaseAdmin
    .from('attivita_tassonomia')
    .select('committente, descrizione, descrizione_norm, gruppo, attivo');
  if (error) throw error;
  return ((data ?? []) as Array<{ committente: string; descrizione: string; descrizione_norm: string; gruppo: string; attivo: boolean }>)
    .map((r) => ({
      committente: r.committente,
      descrizione: r.descrizione,
      descrizioneNorm: r.descrizione_norm,
      gruppo: r.gruppo,
      attivo: r.attivo,
    }));
}
