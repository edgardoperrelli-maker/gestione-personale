// PURA: attività (gruppo) di default per committente nella modale "+".
// Selezionando il committente, l'attività si precompila così il personale non la scrive.
import type { CommittenteManuale } from './types';

const ATTIVITA: Partial<Record<CommittenteManuale, string>> = {
  lim_massive: 'LIMITAZIONI MASSIVE',
};

/** Attività di default per il committente, o undefined se non prevista. */
export function attivitaDefaultManuale(committente: CommittenteManuale): string | undefined {
  return ATTIVITA[committente];
}
