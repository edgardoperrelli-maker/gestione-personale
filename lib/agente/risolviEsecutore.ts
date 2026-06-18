// PURO: mappa il nome esecutore del file (cognome, es. "CIARALLO") a uno staff_id
// confrontando col cognome (primo token) di staff.display_name. Maiuscolo, case-insensitive.
const cognome = (s: string): string => (s ?? '').trim().split(/\s+/)[0].toUpperCase();

export function risolviEsecutore(
  esecutore: string,
  staff: { id: string; display_name: string }[],
): { staffId: string; staffName: string } | { errore: 'non_trovato' | 'ambiguo' } {
  const target = cognome(esecutore);
  if (!target) return { errore: 'non_trovato' };
  const match = (staff ?? []).filter((s) => cognome(s.display_name) === target);
  if (match.length === 0) return { errore: 'non_trovato' };
  if (match.length > 1) return { errore: 'ambiguo' };
  return { staffId: match[0].id, staffName: match[0].display_name };
}
