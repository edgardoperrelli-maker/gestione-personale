/** Normalizza una matricola per il confronto: maiuscolo, solo A–Z/0–9. */
export function normMatricola(v: unknown): string {
  return String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Toglie il suffisso «ENT»/«ENTE» che certe estrazioni per comune incollano in coda alla matricola.
 *
 * Non è una matricola diversa: è la STESSA matricola con due o tre lettere attaccate all'origine.
 * Entrata così non combacia più con niente — né con l'ordine ACEA, né col censito che l'operatore
 * cerca — e il misuratore risulta sconosciuto pur essendo in anagrafica. Il 07/08/2026 ne sono
 * state bonificate 161 su sei tabelle: senza questo taglio all'ingresso, il primo import successivo
 * le riscrive e la bonifica non è servita a niente.
 *
 * Si applica all'INGRESSO e non al confronto: `normMatricola` qui non basta, perché toglie i
 * separatori ma «14223205ENT» e «14223205» restano due stringhe diverse anche normalizzate.
 *
 * `ENTE` prima di `ENT`, e non è un dettaglio di stile: su «124381AENTE» tagliare `ENT`
 * lascerebbe «124381AE», cioè una matricola nuova di zecca che non esiste da nessuna parte.
 *
 * Se dopo il taglio non resta niente il valore si tiene com'era: una cella che vale esattamente
 * «ENTE» è quasi sempre un'intestazione finita in mezzo ai dati, e ridurla a stringa vuota la
 * farebbe scartare in silenzio invece di lasciarla vedere e correggere.
 */
export function matricolaSenzaEnte(v: unknown): string {
  const grezza = String(v ?? '').trim();
  const tagliata = grezza.replace(/(?:ENTE|ENT)$/i, '');
  return tagliata === '' ? grezza : tagliata;
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
