export type RigaRicercabile = { matricola?: string | null; via?: string | null; odl?: string | null };

const low = (s: unknown): string => String(s ?? '').toLowerCase();
const normMat = (s: unknown): string => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** True se la riga matcha la ricerca su via / ODS-ODL (substring) o matricola (normalizzata). Query vuota → true. */
export function rigaMatchRicerca(riga: RigaRicercabile, q: string): boolean {
  const t = q.trim();
  if (!t) return true;
  const lq = low(t);
  if (low(riga.via).includes(lq)) return true;
  if (low(riga.odl).includes(lq)) return true;
  const mq = normMat(t);
  if (mq && normMat(riga.matricola).includes(mq)) return true;
  return false;
}
