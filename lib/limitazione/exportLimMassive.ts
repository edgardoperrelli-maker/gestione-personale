/** display_name "COGNOME NOME" (maiuscolo) → solo il cognome (primo token), maiuscolo. */
export function cognomeDaDisplayName(displayName: string | null | undefined): string {
  const s = String(displayName ?? '').trim();
  if (!s) return '';
  return s.split(/\s+/)[0].toUpperCase();
}

/** 'eseguito' se positivo, 'No' se lavorato-ma-non-positivo, null se non lavorato. */
export function esitoFileDaIntervento(
  stato: string | null | undefined,
  esito: string | null | undefined,
): 'eseguito' | 'No' | null {
  if (stato !== 'completato') return null;
  return esito === 'eseguito_positivo' ? 'eseguito' : 'No';
}
