// lib/acea/tassonomiaAcea.ts
// PURA: attività ACEA → descrizione canonica e gruppo di tassonomia.
//
// Le attività dell'export ACEA non sono le descrizioni canoniche del progetto. Il caso che conta:
//
//   ACEA dice     "Limitazione Massiva su Impianto"
//   canonica è    "LIMITAZIONI MASSIVE"     (gruppo LIMITAZIONI MASSIVE)
//
// e la corrispondenza NON sta nel database: è un alias di scrittura in `aliasAttivita.ts`. Per
// questo serve `allinea: 'scrittura'` — senza, l'attività non risolve, l'intervento nasce senza
// gruppo e sparisce dall'export limitazioni massive, che è ancorato a
// `gruppo_attivita = 'LIMITAZIONI MASSIVE'` (AGENTS.md §14).

import { risolviGruppo, type TassonomiaRiga } from '@/lib/attivita/tassonomia';

/** `lim_massive` è un marcatore di canale, non un committente: in tassonomia equivale ad acea. */
export const COMMITTENTE_ACEA = 'acea';

export type EsitoTassonomia = {
  /** Descrizione da scrivere su `interventi.intervento_tipo`: canonica se risolta. */
  tipo: string | null;
  /** Gruppo di tassonomia, `null` se l'attività non è a catalogo. */
  gruppo: string | null;
  /** false se l'attività non è stata riconosciuta: la riga passa comunque, ma è segnalabile. */
  risolta: boolean;
};

/**
 * Risolve un'attività ACEA sulla tassonomia.
 *
 * Se non risolve non blocca nulla: si scrive l'attività grezza e il gruppo resta null. Perdere un
 * intervento perché ACEA ha introdotto un'attività nuova sarebbe peggio di un gruppo mancante.
 */
export function tassonomiaAttivitaAcea(
  attivita: string | null | undefined,
  indice: Map<string, TassonomiaRiga> | null,
): EsitoTassonomia {
  const grezza = String(attivita ?? '').trim() || null;
  if (!indice || !grezza) return { tipo: grezza, gruppo: null, risolta: false };
  const riga = risolviGruppo(COMMITTENTE_ACEA, grezza, indice, { allinea: 'scrittura' });
  if (!riga) return { tipo: grezza, gruppo: null, risolta: false };
  return { tipo: riga.descrizione, gruppo: riga.gruppo, risolta: true };
}
