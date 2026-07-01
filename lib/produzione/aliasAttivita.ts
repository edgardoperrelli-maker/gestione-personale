import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { aliasKey, type AliasRiga } from './attivitaCanonica';

interface AliasRow {
  committente_orig: string;
  chiave: string;
  committente_eff: string;
  macrogruppo: string;
  attivita_pulita: string;
  voce: number | null;
  attivo: boolean;
}

/** Carica la tabella alias `acea_attivita_alias` in una mappa pronta per attivitaCanonica(). */
export async function caricaAliasAttivita(): Promise<Map<string, AliasRiga>> {
  const { data, error } = await supabaseAdmin
    .from('acea_attivita_alias')
    .select('committente_orig, chiave, committente_eff, macrogruppo, attivita_pulita, voce, attivo');
  if (error) throw error;
  const m = new Map<string, AliasRiga>();
  for (const r of (data ?? []) as AliasRow[]) {
    m.set(aliasKey(r.committente_orig, r.chiave), {
      committenteOrig: r.committente_orig,
      chiave: r.chiave,
      committenteEff: r.committente_eff,
      macrogruppo: r.macrogruppo,
      attivitaPulita: r.attivita_pulita,
      voce: r.voce,
      attivo: r.attivo,
    });
  }
  return m;
}
