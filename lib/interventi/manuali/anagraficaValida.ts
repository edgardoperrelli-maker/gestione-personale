// PURA: verifica che l'anagrafica di un intervento manuale rispetti i requisiti minimi.
// Regole:
//  1. Almeno uno tra pdr, odl, matricola non vuoto (identificativo intervento).
//  2. Almeno uno tra via, comune non vuoto (indirizzo).
import type { AnagraficaManuale } from './types';

const nv = (s: string | undefined | null): boolean => (s ?? '').trim() !== '';

export function anagraficaValida(a: AnagraficaManuale): boolean {
  const hasId = nv(a.pdr) || nv(a.odl) || nv(a.matricola);
  const hasAddr = nv(a.via) || nv(a.comune);
  return hasId && hasAddr;
}
