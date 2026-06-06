// PURA: badge e blocco compilazione per una voce manuale, da approvazione_stato.
// in_attesa → "Sospeso" (compilazione bloccata fino alla decisione torre).
// rifiutato → "Rifiutato" (resta visibile col motivo; non bloccata).
// approvato/null → nessun badge.
export type BadgeVoce = { label: string; tono: 'attesa' | 'rifiutato'; bloccata: boolean };

export function badgeVoceManuale(approvazioneStato: string | null): BadgeVoce | null {
  if (approvazioneStato === 'in_attesa') return { label: '⏳ Sospeso', tono: 'attesa', bloccata: true };
  if (approvazioneStato === 'rifiutato') return { label: '✗ Rifiutato', tono: 'rifiutato', bloccata: false };
  return null;
}
