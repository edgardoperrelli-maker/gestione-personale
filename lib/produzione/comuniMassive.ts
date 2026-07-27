import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { comuniMaster, type FileMaster } from '@/lib/agente/comuni';
import { comuniMassiveDaRegistro, type RigaComune } from '@/lib/acea/comuniMassive';
import { normalizzaAttivita } from './normalizzaAttivita';

// I comuni delle "limitazioni massive" alimentano attivitaCanonica, che decide in modo
// data-driven quali righe acea-senza-testo sono massive (nessun comune hardcoded).
//
// DUE FONTI, UNITE (transizione al modulo ACEA):
//  1. il REGISTRO `acea_ordini` — i comuni con almeno un ordine di famiglia 'massive'.
//     È la fonte nuova e destinata a restare: si aggiorna a ogni import.
//  2. i FILE MASTER scansionati dall'agente (`agente_file_colonne.is_master`) — la fonte
//     storica, che si congela quando l'agente viene spento.
//
// Si uniscono invece di sostituire perché durante la transizione una delle due può essere vuota:
// il registro prima del primo import, i master dopo lo spegnimento dell'agente. Nessun rischio di
// allargare il set: sull'export reale i comuni massive sono ZAGAROLO e LABICO, esattamente i due
// master esistenti. Quando l'agente sarà ritirato, la fonte 2 sparirà da sola (tabella vuota).

/** Comuni massive dal registro degli ordini. Lista vuota se il registro non è ancora popolato. */
async function daRegistro(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('acea_ordini')
    .select('famiglia, comune')
    .eq('famiglia', 'massive');
  // Registro non ancora migrato o non leggibile: si degrada sulla sola fonte storica.
  if (error) return [];
  return comuniMassiveDaRegistro((data ?? []) as RigaComune[]);
}

/** Comuni massive dai file master noti all'agente. Lista vuota se l'agente non gira più. */
async function daMaster(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('agente_file_colonne')
    .select('file, is_master')
    .eq('is_master', true);
  if (error) return [];
  return comuniMaster((data ?? []) as FileMaster[]);
}

/**
 * Insieme delle CHIAVI normalizzate (normalizzaAttivita) dei comuni massive, pronte per il
 * confronto in attivitaCanonica. Set vuoto se entrambe le fonti sono vuote (degrado coerente:
 * nessun comune viene trattato come speciale).
 */
export async function caricaComuniMassive(): Promise<Set<string>> {
  const [registro, master] = await Promise.all([daRegistro(), daMaster()]);
  const set = new Set<string>();
  for (const c of [...registro, ...master]) {
    const k = normalizzaAttivita(c)?.key ?? '';
    if (k) set.add(k);
  }
  return set;
}
