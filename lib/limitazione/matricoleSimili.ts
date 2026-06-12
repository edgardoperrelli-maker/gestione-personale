/** Normalizza una matricola per il confronto: maiuscolo, solo A–Z/0–9. */
export function normMatricola(v: unknown): string {
  return String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export type CandidatoMatricola = { matricola: string };

/** Punteggio di vicinanza: più basso = più simile; -1 = non simile. */
function punteggio(q: string, cand: string): number {
  if (!q || !cand) return -1;
  if (q === cand) return 0;
  if (cand.endsWith(q) || q.endsWith(cand)) return 1;
  if (cand.startsWith(q) || q.startsWith(cand)) return 2;
  if (cand.includes(q) || q.includes(cand)) return 3;
  return -1;
}

/**
 * Fino a `max` candidati simili a `q`, ordinati per vicinanza (esatto > suffisso > prefisso > contenimento;
 * a parità, minore differenza di lunghezza, poi alfabetico). Containment richiede `q` normalizzata ≥ `minLen`.
 */
export function matricoleSimili<T extends CandidatoMatricola>(
  q: string,
  candidati: T[],
  max = 8,
  minLen = 4,
): T[] {
  const nq = normMatricola(q);
  if (nq.length < minLen) return [];
  const scored: Array<{ item: T; p: number; diff: number }> = [];
  for (const c of candidati) {
    const nc = normMatricola(c.matricola);
    const p = punteggio(nq, nc);
    if (p < 0) continue;
    scored.push({ item: c, p, diff: Math.abs(nc.length - nq.length) });
  }
  scored.sort((a, b) => a.p - b.p || a.diff - b.diff || a.item.matricola.localeCompare(b.item.matricola));
  return scored.slice(0, max).map((s) => s.item);
}
