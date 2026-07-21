import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { comuniMaster, type FileMaster } from '@/lib/agente/comuni';
import { normalizzaAttivita } from './normalizzaAttivita';

// I comuni delle "limitazioni massive" = i file MASTER noti all'agente (LABICO.xlsx → LABICO):
// unica fonte di verità, la stessa di comuniMaster()/opzioniAceaTarget. Fornita ad attivitaCanonica
// per decidere, in modo data-driven, quali righe acea-senza-testo sono massive (nessun comune
// hardcoded: aggiungere un master aggiunge il comune, senza toccare il codice).

/**
 * Insieme delle CHIAVI normalizzate (normalizzaAttivita) dei comuni con un master massive, pronte
 * per il confronto in attivitaCanonica. Set vuoto se non c'è alcun master (degrado coerente:
 * nessun comune viene trattato come speciale).
 */
export async function caricaComuniMassive(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from('agente_file_colonne')
    .select('file, is_master')
    .eq('is_master', true);
  if (error) throw error;
  const set = new Set<string>();
  for (const c of comuniMaster((data ?? []) as FileMaster[])) {
    const k = normalizzaAttivita(c)?.key ?? '';
    if (k) set.add(k);
  }
  return set;
}
