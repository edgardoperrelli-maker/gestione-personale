// PURA: dato l'insieme delle attività GREZZE presenti nei dati (committente + intervento_tipo) e le
// chiavi alias GIÀ presenti, calcola le NUOVE righe alias da inserire come "Da classificare".
// Serve alla riconciliazione on-demand: le attività nuove non ancora mappate emergono nell'alias
// (mai perse in silenzio, mai ri-frammentate) pronte per essere classificate/prezzate dall'utente.
import { normalizzaAttivita } from './normalizzaAttivita';
import { voceDaAttivita } from './voceDaAttivita';
import { aliasKey } from './attivitaCanonica';

export const MACRO_DA_CLASSIFICARE = 'Da classificare';

export interface AttivitaGrezza {
  committente: string | null;
  intervento_tipo: string | null;
}

export interface NuovaAliasRiga {
  committente_orig: string;
  chiave: string;
  committente_eff: string; // default = committente grezzo (l'utente riclassifica)
  macrogruppo: string; // 'Da classificare'
  attivita_pulita: string; // etichetta leggibile
  voce: number | null;
  attivo: boolean;
}

/**
 * Righe alias mancanti (una per (committente_orig, chiave) non ancora presente), come "Da classificare".
 * Ignora i testi vuoti (le righe senza attività sono gestite dalle regole per comune, non aliasabili).
 */
export function attivitaDaClassificare(
  grezze: AttivitaGrezza[],
  chiaviEsistenti: Set<string>,
): NuovaAliasRiga[] {
  const nuove = new Map<string, NuovaAliasRiga>();
  for (const g of grezze) {
    const norm = normalizzaAttivita(g.intervento_tipo);
    if (!norm) continue;
    const co = (g.committente ?? '').trim().toLowerCase();
    if (!co) continue;
    const k = aliasKey(co, norm.key);
    if (chiaviEsistenti.has(k) || nuove.has(k)) continue;
    nuove.set(k, {
      committente_orig: co,
      chiave: norm.key,
      committente_eff: co,
      macrogruppo: MACRO_DA_CLASSIFICARE,
      attivita_pulita: norm.etichetta,
      voce: voceDaAttivita(norm.etichetta),
      attivo: true,
    });
  }
  return [...nuove.values()];
}
