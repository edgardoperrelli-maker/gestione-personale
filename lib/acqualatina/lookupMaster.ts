// PURA: verdetto del lookup di un codice letto in campo → riga di censimento AcquaLatina, a
// CINQUE gradini con la cascata sull'ODL. La stessa funzione decide online (route /cerca-master)
// e offline (cache IndexedDB): il blocco deve essere identico nei due mondi, altrimenti «non
// censito» significherebbe due cose diverse a seconda della rete.
//
// Gradini:
//   1. 'letterale'  — matricola identica carattere per carattere → si procede senza chiedere.
//   2/3. 'conferma' (motivo 'matricola') — normalizzata uguale, oppure solo simile (prefisso
//        variabile del catalogo: si cerca A023041 e c'è 99A023041). L'operatore DEVE confermare
//        la matricola (doppio tocco). Uno o più candidati: stesso gesto, arità diversa.
//   4. 'conferma' (motivo 'odl') — nessuna matricola combacia, ma il codice È un ODL a registro.
//        L'operatore ha in mano il battente e ha digitato il numero dell'ORDINE, che è il primo
//        dato della lista dell'ufficio: rispondergli «non censito» era il difetto del 13/08 sull'ODL
//        12386221. Mai 'letterale', anche con un solo candidato: chi cerca per ordine non ha
//        ancora detto niente sul contatore, e la matricola resta da confermare a vista.
//   5. 'assente'    — nessun candidato → blocco «contatta l'ufficio».
//   + 'ambiguo'     — più ODL sulla stessa matricola con indirizzi indistinguibili. Se il
//        censimento non distingue le righe nessuno in campo può distinguerle: è un dato rotto e
//        va sistemato in ufficio, non indovinato sul posto. Nel flusso nuovo l'ODL diventa
//        l'ordine di assegnazione sul sistema del committente, e quello sbagliato costa.
//
// L'ordine dei gradini non è di comodo: la matricola vince sull'ODL perché è il dato che
// l'operatore ha LETTO SUL CONTATORE, mentre l'ODL viene dalla carta. E l'ODL esatto viene prima
// dei «simili», perché un ordine che combacia in pieno è una prova più forte di una matricola che
// si assomiglia.
import { normMatricola, matricoleSimili } from '@/lib/limitazione/matricoleSimili';

/** Riga di censimento: la proiezione del registro `acqualatina_ordini` che serve al lookup.
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
  /** `motivo` dice su COSA ha agganciato: la schermata di scelta cambia domanda (fra più ordini
   *  si sceglie l'indirizzo, fra più misuratori dello stesso ordine si sceglie la matricola). */
  | { esito: 'conferma'; motivo: 'matricola' | 'odl'; candidati: RigaMaster[] }
  | { esito: 'ambiguo'; odl: string[] }
  | { esito: 'assente' };

const t = (v: unknown): string => String(v ?? '').trim();

/**
 * Lunghezza minima perché una matricola possa fare da CANDIDATO "simile".
 *
 * `matricoleSimili` impone il suo `minLen` solo alla QUERY, non ai candidati, e fa match
 * per prefisso/suffisso/contenimento. Il censimento AcquaLatina contiene matricole degeneri
 * (al 30/07: `1`, `6`, `51`, `55`, `60`, `64`, `490`, `922`) e su matricole numeriche corte
 * questo è un disastro: la query `987651`, che NON è a catalogo e deve bloccare, finisce
 * `q.endsWith('1')` → punteggio 1, il secondo migliore → la riga spazzatura diventa il
 * primo suggerimento, col suo ODL. Un blocco si trasformerebbe in una conferma su un ordine
 * che non ha niente a che vedere col contatore.
 *
 * Il filtro sta QUI e non in `matricoleSimili` perché quella funzione la usa anche la
 * ricerca ACEA in produzione: cambiarne la semantica muoverebbe un comportamento vivo.
 * Vale solo per il ramo "simili": una matricola corta trovata per match ESATTO resta
 * valida (se il censimento dice `1` e l'operatore legge `1`, è quel misuratore).
 */
const MIN_LEN_CANDIDATO = 4;

/** Chiave di confronto dell'indirizzo: maiuscolo, spazi compattati — l'anagrafica arriva da
 *  Excel e porta doppi spazi e minuscole. Serve solo a decidere se due righe con ODL
 *  diverso sono distinguibili da chi è sul posto. */
const chiaveIndirizzo = (r: RigaMaster): string =>
  [r.indirizzo, r.comune, r.cap].map((v) => t(v).toUpperCase().replace(/\s+/g, ' ')).join('|');

/** Righe raggruppate per `chiaveDi`, con fusione DIFENSIVA dei campi: due righe con la stessa
 *  chiave sono un duplicato da doppio import, e i campi vuoti dell'una si riempiono dall'altra
 *  (mai sovrascritti i pieni). Stesso criterio di `costruisciMasterOdl`. */
function fondi(righe: RigaMaster[], chiaveDi: (r: RigaMaster) => string): Map<string, RigaMaster> {
  const m = new Map<string, RigaMaster>();
  for (const r of righe) {
    const k = chiaveDi(r);
    const prima = m.get(k);
    m.set(k, prima
      ? {
          odl: prima.odl || t(r.odl),
          matricola: prima.matricola || t(r.matricola),
          indirizzo: prima.indirizzo || t(r.indirizzo),
          comune: prima.comune || t(r.comune),
          cap: prima.cap || t(r.cap),
        }
      : { odl: t(r.odl), matricola: t(r.matricola), indirizzo: t(r.indirizzo), comune: t(r.comune), cap: t(r.cap) });
  }
  return m;
}

/** Una riga per ODL: è l'identità del match per matricola (l'ordine è ciò che si assegna). */
const perOdl = (righe: RigaMaster[]): Map<string, RigaMaster> => fondi(righe, (r) => t(r.odl));

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
    return letterale
      ? { esito: 'letterale', riga }
      : { esito: 'conferma', motivo: 'matricola', candidati: [riga] };
  }

  // Più ODL: il controllo viene PRIMA di quello letterale — una matricola scritta identica
  // non dice quale dei due ordini sia il lavoro di oggi.
  if (gruppi.size > 1) {
    const candidati = [...gruppi.values()];
    if (new Set(candidati.map(chiaveIndirizzo)).size === 1) {
      return { esito: 'ambiguo', odl: candidati.map((r) => r.odl) };
    }
    return { esito: 'conferma', motivo: 'matricola', candidati };
  }

  // Gradino 4 — l'ODL. Qui NON si raggruppa per ordine: un ODL può coprire più contatori (nel
  // file di Terracina 109 ne coprono da 2 a 5, i condomìni), e sono misuratori diversi, non
  // duplicati da fondere. L'identità della riga è la coppia ordine+matricola, e la scelta la fa
  // l'operatore sulla matricola che legge.
  const suOdl = [...fondi(
    conMatricola.filter((r) => normMatricola(r.odl) === nq),
    (r) => `${t(r.odl)}|${normMatricola(r.matricola)}`,
  ).values()].sort((a, b) => a.matricola.localeCompare(b.matricola));
  if (suOdl.length > 0) return { esito: 'conferma', motivo: 'odl', candidati: suOdl };

  // Nessun match normalizzato e nessun ordine → simili: è qui che entra il prefisso variabile.
  // Solo candidati di lunghezza significativa (vedi MIN_LEN_CANDIDATO).
  const perSimili = conMatricola.filter((r) => normMatricola(r.matricola).length >= MIN_LEN_CANDIDATO);
  const simili = [...perOdl(matricoleSimili(query, perSimili, 8)).values()];
  return simili.length === 0
    ? { esito: 'assente' }
    : { esito: 'conferma', motivo: 'matricola', candidati: simili };
}
