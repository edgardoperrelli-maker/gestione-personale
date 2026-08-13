import { normMatricola } from './matricoleSimili';

export type VoceMatricola = { id: string; matricola?: string | null; odl?: string | null; via?: string | null; comune?: string | null; approvazione_stato?: string | null };

/** Prima voce con matricola normalizzata uguale a `q` (match esatto), o null. Ignora voci senza matricola. */
export function matchVociMatricola<T extends VoceMatricola>(voci: T[], q: string): T | null {
  const nq = normMatricola(q);
  if (!nq) return null;
  return voci.find((v) => v.matricola != null && normMatricola(v.matricola) === nq) ?? null;
}

/**
 * Prima voce con ODL normalizzato uguale a `q`, o null.
 *
 * Funzione a parte e non un secondo confronto dentro `matchVociMatricola`: quella la usa anche
 * la ricerca ACEA, che è viva in produzione e cerca solo per matricola. Chi vuole tutti e due i
 * versi li chiama in fila, e il verso della matricola resta il primo — è il dato letto sul
 * contatore, l'ODL viene dalla carta.
 *
 * Serve alla commessa AcquaLatina, dove l'operatore digita il numero dell'ordine: senza questo
 * match il suo stesso task, già in rapportino, non verrebbe riconosciuto e la ricerca ne
 * creerebbe un DOPPIONE accanto.
 */
export function matchVociOdl<T extends VoceMatricola>(voci: T[], q: string): T | null {
  const nq = normMatricola(q);
  if (!nq) return null;
  return voci.find((v) => v.odl != null && normMatricola(v.odl) === nq) ?? null;
}
