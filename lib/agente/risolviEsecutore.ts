// PURO: mappa il nome esecutore del file (cognome, es. "CIARALLO" o composto "DE SANTIS") a uno
// staff_id confrontando col cognome di staff.display_name ("COGNOME NOME", particelle incluse).
// Retro-compatibile coi vecchi file dove l'export scriveva solo la particella ("DE"): un
// esecutore MONO-token matcha anche il solo primo token del display. Maiuscolo, case-insensitive.
import { cognomeDaDisplayName } from '@/lib/limitazione/exportLimMassive';

const norm = (s: string): string => (s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
const primoToken = (s: string): string => norm(s).split(' ')[0] ?? '';

export function risolviEsecutore(
  esecutore: string,
  staff: { id: string; display_name: string }[],
): { staffId: string; staffName: string } | { errore: 'non_trovato' | 'ambiguo' } {
  const target = norm(esecutore);
  if (!target) return { errore: 'non_trovato' };
  const monoToken = !target.includes(' ');
  const match = (staff ?? []).filter(
    (s) => cognomeDaDisplayName(s.display_name) === target || (monoToken && primoToken(s.display_name) === target),
  );
  if (match.length === 0) return { errore: 'non_trovato' };
  if (match.length > 1) return { errore: 'ambiguo' };
  return { staffId: match[0].id, staffName: match[0].display_name };
}
