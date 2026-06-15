// PURA: verifica che l'anagrafica di un intervento manuale rispetti i requisiti minimi.
// Regole:
//  1. Almeno uno tra pdr, odl, matricola non vuoto (identificativo intervento).
//  2. Indirizzo:
//     - `lim_massive`: la VIA è obbligatoria; comune e CAP facoltativi (li completa l'ufficio).
//     - altri committenti: almeno uno tra via, comune non vuoto.
import type { AnagraficaManuale } from './types';

const nv = (s: string | undefined | null): boolean => (s ?? '').trim() !== '';

export function anagraficaValida(a: AnagraficaManuale, committente?: string): boolean {
  const hasId = nv(a.pdr) || nv(a.odl) || nv(a.matricola);
  if (committente === 'lim_massive') return hasId && nv(a.via);
  const hasAddr = nv(a.via) || nv(a.comune);
  return hasId && hasAddr;
}
