// lib/acea/censitiMassive.ts
// PURA: il registro `acea_ordini` letto come CENSIMENTO dei misuratori delle limitazioni massive —
// la fonte con cui il "+" del rapportino riconosce un contatore in campo.
//
// PERCHÉ ESISTE. Il "+" cerca il misuratore per matricola, e fino a oggi lo cercava SOLO in
// `limitazione_misuratori_ref`: la tabella che l'agente riempiva dai master SharePoint, ferma a
// ZAGAROLO e LABICO. Un paese importato nel registro nuovo — RIANO, 1.106 ordini — lì non c'è: la
// ricerca non trovava niente, l'operatore inseriva a mano la sola matricola, e l'intervento nasceva
// SENZA ODL. Senza ODL il modulo Limitazioni massive non ha nulla a cui agganciarlo, perché
// registro e interventi si incrociano per ODL e basta (`app/api/acea/ordini/route.ts`).
//
// Il 31/07 a RIANO sono stati 19 eseguiti su 20, invisibili tutti e 19: il lavoro c'era, il numero
// con cui riconoscerlo no. Il registro quel numero ce l'ha, e si aggiorna a ogni import.

import type { CensitoMisuratore } from '@/lib/limitazione/autofillAnagrafica';
import { normMatricola } from '@/lib/limitazione/matricoleSimili';

/** Riga del registro ridotta ai campi che il censimento usa. */
export type OrdineCensito = {
  odl: string;
  matricola: string | null;
  /** Il PDR con l'altro nome: sul master storico `pdr` e qui `impianto` sono lo stesso codice
   *  (verificato riga per riga sull'incrocio ZAGAROLO/LABICO fra le due tabelle). */
  impianto: string | null;
  via: string | null;
  civico: string | null;
  cap: string | null;
  comune: string | null;
  nominativo: string | null;
};

/**
 * Il CAP a cinque cifre.
 *
 * L'export del Cruscotto perde gli zeri iniziali: RIANO arriva come «60», non «00060» (il master
 * storico invece scriveva «00039» per ZAGAROLO — la forma giusta). Un CAP di due cifre non è un
 * CAP, e finirebbe scritto così sull'anagrafica dell'intervento. Si ripristina solo quando il
 * valore è tutto numerico e più corto di cinque: qualunque altra cosa passa com'è, senza inventare.
 */
export function capCinqueCifre(cap: string | null | undefined): string | null {
  const s = String(cap ?? '').trim();
  if (s === '') return null;
  return /^\d{1,4}$/.test(s) ? s.padStart(5, '0') : s;
}

/** Una riga del registro nella forma che il "+" sa compilare (`autofillAnagrafica`). */
export function censitoDaOrdine(o: OrdineCensito): CensitoMisuratore {
  return {
    matricola: String(o.matricola ?? '').trim(),
    pdr: o.impianto,
    nominativo: o.nominativo,
    indirizzo: o.via,
    civico: o.civico,
    comune: o.comune,
    cap: capCinqueCifre(o.cap),
    odl: o.odl,
  };
}

/**
 * Lunghezza minima di un prefisso cercato: vedi `prefissiMatricola`.
 *
 * Otto e non sei (il minimo che il registro contiene davvero): il troncamento reale toglie una
 * cifra, non otto, e un prefisso corto rischia di collidere con la matricola INTERA di un altro
 * misuratore — che comparirebbe fra i suggerimenti come se c'entrasse qualcosa.
 */
export const MIN_PREFISSO_MATRICOLA = 8;

/**
 * I prefissi con cui cercare una matricola TRONCATA nel registro.
 *
 * L'export ACEA tronca le matricole lunghe: le SETA sono 16 caratteri sul contatore e 15 nel
 * registro (233 righe di RIANO portano `sospetto_troncamento`). L'operatore legge il numero
 * intero, il registro ne ha un pezzo: un confronto per uguaglianza non li fa incontrare mai.
 *
 * Il pezzo mancante è sempre in CODA — quindi il valore del registro è un prefisso di quello letto,
 * e cercarlo significa interrogare i prefissi progressivi di ciò che si è letto. Restano un `in`
 * solo (una decina di valori) e non una scansione, e il confronto resta sull'uguaglianza di una
 * colonna indicizzata. Dal più lungo al più corto: il primo è la matricola stessa.
 */
export function prefissiMatricola(q: string, minLen = MIN_PREFISSO_MATRICOLA): string[] {
  const n = normMatricola(q);
  if (n.length < minLen) return n === '' ? [] : [n];
  const out: string[] = [];
  for (let len = n.length; len >= minLen; len -= 1) out.push(n.slice(0, len));
  return out;
}
