// PURA: stato/validità di un link P.I. rispetto alla finestra [valido_dal, valido_al]
// in fuso Europe/Rome. Riusa dataInRoma() (già testata) per il confronto YYYY-MM-DD.
import { dataInRoma } from '@/utils/rapportini/scadenza';
import type { PiTokenStato } from './types';

type TokenFinestra = {
  valido_dal: string;
  valido_al: string;
  revocato_at?: string | null;
};

/** Stato del link al momento `nowIso`. Revoca prevale; poi finestra di date (incl. estremi). */
export function piTokenStato(tok: TokenFinestra, nowIso: string): PiTokenStato {
  if (tok.revocato_at) return 'revocato';
  const oggi = dataInRoma(nowIso); // YYYY-MM-DD in Europe/Rome
  if (oggi < tok.valido_dal) return 'non_attivo';
  if (oggi > tok.valido_al) return 'scaduto';
  return 'valido';
}

/** True se il link è utilizzabile (oggi ∈ [valido_dal, valido_al] e non revocato). */
export function piTokenValido(tok: TokenFinestra, nowIso: string): boolean {
  return piTokenStato(tok, nowIso) === 'valido';
}
