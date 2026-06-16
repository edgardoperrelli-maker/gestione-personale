/** display_name "COGNOME NOME" (maiuscolo) → solo il cognome (primo token), maiuscolo. */
export function cognomeDaDisplayName(displayName: string | null | undefined): string {
  const s = String(displayName ?? '').trim();
  if (!s) return '';
  return s.split(/\s+/)[0].toUpperCase();
}
