import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { comuniMassiveDaRegistro, type RigaComune } from '@/lib/acea/comuniMassive';
import { normalizzaAttivita } from './normalizzaAttivita';

// I comuni delle "limitazioni massive" alimentano attivitaCanonica, che decide in modo
// data-driven quali righe acea-senza-testo sono massive (nessun comune hardcoded).
//
// UNA fonte: il REGISTRO `acea_ordini`, i comuni con almeno un ordine di famiglia 'massive'.
// Si aggiorna a ogni import del modulo ACEA.
//
// C'era una seconda fonte — i file master scansionati dall'agente Playwright
// (`agente_file_colonne.is_master`) — ed è sparita col ritiro dell'agente (2026-08-04). Non ha
// portato via niente: sui dati veri il registro conosceva CINQUE comuni massive contro i DUE
// master esistenti.

/** Comuni massive dal registro degli ordini. Lista vuota se il registro non è leggibile. */
async function daRegistro(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('acea_ordini')
    .select('famiglia, comune')
    .eq('famiglia', 'massive');
  // Registro non leggibile: degrado coerente, nessun comune trattato come speciale.
  if (error) return [];
  return comuniMassiveDaRegistro((data ?? []) as RigaComune[]);
}

/**
 * Insieme delle CHIAVI normalizzate (normalizzaAttivita) dei comuni massive, pronte per il
 * confronto in attivitaCanonica. Set vuoto se il registro è vuoto.
 */
export async function caricaComuniMassive(): Promise<Set<string>> {
  const set = new Set<string>();
  for (const c of await daRegistro()) {
    const k = normalizzaAttivita(c)?.key ?? '';
    if (k) set.add(k);
  }
  return set;
}
