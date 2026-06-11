// utils/rapportini/territorioEffettivo.ts
// Territorio "effettivo" di un rapportino nel Riepilogo: l'override per-operatore
// vince sul territorio del piano. Stringhe vuote/spazi contano come assenti.
export function territorioEffettivo(
  override: string | null | undefined,
  territorioPiano: string | null | undefined,
): string | null {
  const o = (override ?? '').trim();
  if (o) return o;
  const p = (territorioPiano ?? '').trim();
  return p || null;
}
