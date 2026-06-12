import type { CommittenteManuale } from './types';

const ETICHETTE: Record<CommittenteManuale, string> = {
  acea: 'Acea',
  italgas: 'Italgas',
  altro: 'Altro',
  lim_massive: 'Limitazioni massive',
};

/** Etichetta leggibile del committente; fallback al valore grezzo se sconosciuto. */
export function etichettaCommittente(c: CommittenteManuale | string | null | undefined): string {
  return (c != null && (ETICHETTE as Record<string, string>)[c]) || String(c ?? '');
}
