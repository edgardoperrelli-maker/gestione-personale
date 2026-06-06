// PURA: il FAB "+" è attivo solo quando il rapportino è ancora compilabile.
export function fabAbilitato(s: { readOnly: boolean; bloccato: boolean; inviato: boolean }): boolean {
  return !s.readOnly && !s.bloccato && !s.inviato;
}
