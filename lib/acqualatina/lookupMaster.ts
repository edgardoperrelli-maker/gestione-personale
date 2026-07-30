// PURA: verdetto del lookup matricola → riga di master AcquaLatina, a QUATTRO gradini
// con la cascata sull'ODL. La stessa funzione decide online (route /cerca-master) e offline
// (cache IndexedDB): il blocco deve essere identico nei due mondi, altrimenti «non censito»
// significherebbe due cose diverse a seconda della rete.
//
// Gradini:
//   1. 'letterale'  — matricola identica carattere per carattere → si procede senza chiedere.
//   2/3. 'conferma' — normalizzata uguale, oppure solo simile (prefisso variabile del master:
//        si cerca A023041 e a catalogo c'è 99A023041). L'operatore DEVE confermare la
//        matricola (doppio tocco). Uno o più candidati: stesso gesto, arità diversa.
//   4. 'assente'    — nessun candidato → blocco «contatta l'ufficio».
//   + 'ambiguo'     — più ODL sulla stessa matricola con indirizzi indistinguibili. Se il
//        master non distingue le righe nessuno in campo può distinguerle: è un dato rotto e
//        va sistemato in ufficio, non indovinato sul posto. Nel flusso nuovo l'ODL diventa
//        l'ordine di assegnazione sul sistema del committente, e quello sbagliato costa.
import { normMatricola, matricoleSimili } from '@/lib/limitazione/matricoleSimili';

/** Riga di censimento: la proiezione di `template_master_righe` che serve al lookup.
 *  `odl` è NOT NULL a schema; `matricola` no, e le righe senza matricola non sono censimento. */
export type RigaMaster = {
  odl: string;
  matricola: string;
  indirizzo: string;
  comune: string;
  cap: string;
};

export type VerdettoMaster =
  | { esito: 'letterale'; riga: RigaMaster }
  | { esito: 'conferma'; candidati: RigaMaster[] }
  | { esito: 'ambiguo'; odl: string[] }
  | { esito: 'assente' };

const t = (v: unknown): string => String(v ?? '').trim();

/** Chiave di confronto dell'indirizzo: maiuscolo, spazi compattati — il master arriva da
 *  Excel e porta doppi spazi e minuscole. Serve solo a decidere se due righe con ODL
 *  diverso sono distinguibili da chi è sul posto. */
const chiaveIndirizzo = (r: RigaMaster): string =>
  [r.indirizzo, r.comune, r.cap].map((v) => t(v).toUpperCase().replace(/\s+/g, ' ')).join('|');

/** Righe raggruppate per ODL, con fusione DIFENSIVA dei campi: due righe dello stesso ODL
 *  sono un duplicato da doppio import, e i campi vuoti dell'una si riempiono dall'altra
 *  (mai sovrascritti i pieni). Stesso criterio di `costruisciMasterOdl`. */
function perOdl(righe: RigaMaster[]): Map<string, RigaMaster> {
  const m = new Map<string, RigaMaster>();
  for (const r of righe) {
    const odl = t(r.odl);
    const prima = m.get(odl);
    m.set(odl, prima
      ? {
          odl,
          matricola: prima.matricola || t(r.matricola),
          indirizzo: prima.indirizzo || t(r.indirizzo),
          comune: prima.comune || t(r.comune),
          cap: prima.cap || t(r.cap),
        }
      : { odl, matricola: t(r.matricola), indirizzo: t(r.indirizzo), comune: t(r.comune), cap: t(r.cap) });
  }
  return m;
}

export function lookupMaster(q: string, righe: RigaMaster[]): VerdettoMaster {
  const query = t(q);
  const nq = normMatricola(query);
  if (!nq) return { esito: 'assente' };

  const conMatricola = (righe ?? []).filter((r) => t(r.matricola) !== '');

  const norm = conMatricola.filter((r) => normMatricola(r.matricola) === nq);
  const gruppi = perOdl(norm);

  // Un solo ODL: nessuna ambiguità. Letterale ⇒ liscio, altrimenti conferma.
  if (gruppi.size === 1) {
    const riga = [...gruppi.values()][0];
    const letterale = norm.some((r) => t(r.matricola) === query);
    return letterale ? { esito: 'letterale', riga } : { esito: 'conferma', candidati: [riga] };
  }

  // Più ODL: il controllo viene PRIMA di quello letterale — una matricola scritta identica
  // non dice quale dei due ordini sia il lavoro di oggi.
  if (gruppi.size > 1) {
    const candidati = [...gruppi.values()];
    if (new Set(candidati.map(chiaveIndirizzo)).size === 1) {
      return { esito: 'ambiguo', odl: candidati.map((r) => r.odl) };
    }
    return { esito: 'conferma', candidati };
  }

  // Nessun match normalizzato → simili: è qui che entra il prefisso variabile del master.
  const simili = [...perOdl(matricoleSimili(query, conMatricola, 8)).values()];
  return simili.length === 0 ? { esito: 'assente' } : { esito: 'conferma', candidati: simili };
}
