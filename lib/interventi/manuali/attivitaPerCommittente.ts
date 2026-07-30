// PURA: attività (gruppo) di default per committente nella modale "+".
// Selezionando il committente, l'attività si precompila così il personale non la scrive.
import type { CommittenteManuale } from './types';
import { ATTIVITA_SOSTITUZIONE_MISURATORE } from '@/lib/acqualatina/contratto';

// ATTENZIONE: qui va la DESCRIZIONE canonica di tassonomia, non il gruppo. Il valore finisce
// in `anagrafica.attivita` e il POST lo passa a `risolviGruppo`, che cerca fra le descrizioni:
// un gruppo qui dentro fa rispondere `attivita_sconosciuta` a ogni "+" di quel committente.
// Su ACEA non si nota perché «LIMITAZIONI MASSIVE» è insieme gruppo e descrizione; su
// AcquaLatina il gruppo è al plurale e la descrizione al singolare, e la differenza morde.
const ATTIVITA: Partial<Record<CommittenteManuale, string>> = {
  lim_massive: 'LIMITAZIONI MASSIVE',
  acqualatina: ATTIVITA_SOSTITUZIONE_MISURATORE,
};

/** Attività di default per il committente, o undefined se non prevista. */
export function attivitaDefaultManuale(committente: CommittenteManuale): string | undefined {
  return ATTIVITA[committente];
}
