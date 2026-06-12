import type { AnagraficaManuale } from '@/lib/interventi/manuali/types';

/** Misuratore censito come ritornato dall'endpoint di ricerca. */
export type CensitoMisuratore = {
  matricola: string;
  pdr?: string | null;
  nominativo?: string | null;
  indirizzo?: string | null;
  civico?: string | null;
  comune?: string | null;
  cap?: string | null;
  odl?: string | null;
};

const s = (v: unknown): string => String(v ?? '').trim();

/** Mappa un censito nei campi anagrafica della modale manuale.
 *  Non esiste una chiave 'civico' tra gli InfoChiave: il civico si concatena alla via. */
export function autofillAnagrafica(m: CensitoMisuratore): AnagraficaManuale {
  const via = [s(m.indirizzo), s(m.civico)].filter(Boolean).join(' ');
  const out: AnagraficaManuale = {};
  if (s(m.matricola)) out.matricola = s(m.matricola);
  if (s(m.odl)) out.odl = s(m.odl);
  if (s(m.pdr)) out.pdr = s(m.pdr);
  if (s(m.nominativo)) out.nominativo = s(m.nominativo);
  if (via) out.via = via;
  if (s(m.comune)) out.comune = s(m.comune);
  if (s(m.cap)) out.cap = s(m.cap);
  return out;
}
