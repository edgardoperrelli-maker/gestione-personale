import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { comuniMassiveDaRegistro, type RigaComune } from './comuniMassive';

const PAGINA = 1000;

/**
 * I comuni delle limitazioni massive con almeno un ordine APERTO: sono le schede della vista.
 *
 * La selezione la fa Postgres (`famiglia='massive' AND aperto=true`, oggi ~900 righe di una
 * colonna sola), la normalizzazione e l'ordine la funzione pura già provata. Solo gli APERTI, di
 * proposito: la scheda di un comune è la sua coda di lavoro — un comune finito sparisce dalla
 * fila da solo, e la sua storia resta in «Chiusi». Un comune nuovo compare al primo import che lo
 * contiene, senza toccare il codice.
 *
 * Lancia sull'errore: la degradazione (null/[]) la decide chi chiama — la route la vuole
 * best-effort, la pagina server ha il suo ripiego.
 */
export async function comuniMassiveAperti(db: SupabaseClient): Promise<string[]> {
  const righe: RigaComune[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await db
      .from('acea_ordini')
      .select('comune, famiglia')
      .eq('famiglia', 'massive')
      .eq('aperto', true)
      .range(offset, offset + PAGINA - 1);
    if (error) throw error;
    const blocco = (data ?? []) as RigaComune[];
    righe.push(...blocco);
    if (blocco.length < PAGINA) break;
  }
  return comuniMassiveDaRegistro(righe);
}
