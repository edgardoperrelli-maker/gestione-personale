// lib/acea/famiglia.ts
// PURA: le famiglie del registro commesse, e la classificazione ACEA da "Tipo di ordine".
//
// `Famiglia` è nata come coppia dunning/massive del registro ACEA; dal 31/07 è la chiave di TUTTO
// il motore del registro (tabella dati, assegnabili, regole, rapportini), e `acqualatina` vi entra
// come terza famiglia: stesso registro, stesse mani, un'altra commessa — la sostituzione
// misuratori di Terracina, alimentata dal master invece che dall'export del Cruscotto.
//
// La classificazione da "Tipo di ordine" resta un fatto SOLO ACEA (verificata sull'export):
//
//   ASTR  Manutenzione Straordinaria   2.759 righe  → massive (Limitazione Massiva + saracinesche)
//   ALIM  Limitazione Flusso           1.423        → dunning
//   AMOR  Interventi per morosità        625        → dunning
//   ARMO  Ripristino da morosità         433        → dunning (attivazioni RIAT/REVO)
//   AVUF  Verifiche da Ufficio            53        → dunning (sigilli manomessi, si consuntivano)

export type Famiglia = 'dunning' | 'massive' | 'acqualatina';

/** Le due famiglie ACEA: le uniche che l'import del Cruscotto può produrre. */
export type FamigliaAcea = 'dunning' | 'massive';

export type EsitoFamiglia = {
  famiglia: FamigliaAcea;
  /** false se il codice non è fra quelli noti: la riga entra comunque, ma va segnalata. */
  riconosciuto: boolean;
};

/**
 * Famiglia da un valore qualunque (colonna di tabella, parametro di query).
 *
 * Il default è `dunning` — la regola piena — per la stessa ragione di `OrdineDaPianificare`:
 * si sbaglia per difetto. Le route la usano al posto dei ternari sparsi, così l'arrivo di una
 * famiglia nuova non lascia narrowing dimenticati che collassano tutto su dunning.
 */
export function parseFamiglia(v: unknown): Famiglia {
  return v === 'massive' || v === 'acqualatina' ? v : 'dunning';
}

const MASSIVE = new Set(['ASTR']);
const DUNNING = new Set(['ALIM', 'AMOR', 'ARMO', 'AVUF']);

/**
 * L'attività di TABELLONE che rende un operatore assegnabile, famiglia per famiglia.
 *
 * Il criterio degli assegnabili è lo stesso per tutt'e due le viste — «chi quel giorno ha in
 * cronoprogramma l'attività di QUESTA commessa» — ma l'attività non è la stessa: il dunning ha
 * «DUNNING», le limitazioni massive hanno «LIMITAZIONI MASSIVE» (verificato in produzione, con
 * righe di tabellone reali su entrambe). Un solo filtro per tutt'e due avrebbe mostrato ai
 * pianificatori delle massive l'elenco di chi fa dunning — cioè nessuno dei loro.
 *
 * `frammenti`: il match è per NOME e mai per uuid (l'id è un dato di produzione, cablarlo
 * legherebbe il codice a un database). Basta che il nome contenga il frammento: «MASSIV» prende
 * «LIMITAZIONI MASSIVE» oggi e un eventuale «ACEA MASSIVE» domani.
 *
 * `etichetta`: come la si nomina nei messaggi («Nessuno su … in tabellone», i motivi di rifiuto
 * del server, la guida). Una sola fonte, così menu, errori e documentazione dicono la stessa cosa.
 */
export const ATTIVITA_TABELLONE: Record<Famiglia, { frammenti: string[]; etichetta: string }> = {
  dunning: { frammenti: ['DUNNING'], etichetta: 'DUNNING' },
  massive: { frammenti: ['MASSIV'], etichetta: 'LIMITAZIONI MASSIVE' },
  /*
    La squadra AcquaLatina sta in tabellone come «CONTATORI» (verificato in produzione: territorio
    ACQUA LATINA, righe reali dal 29/07). Il frammento prende il nome intero; come per le altre
    famiglie il criterio resta l'ATTIVITÀ e non il territorio, quindi chi altrove avesse
    «CONTATORI» in cronoprogramma comparirebbe fra gli assegnabili — è la stessa scelta del
    dunning («chi satura la giornata deve comparire»), non un difetto nuovo.
  */
  acqualatina: { frammenti: ['CONTATORI'], etichetta: 'CONTATORI' },
};

/**
 * Il profilo di COMMESSA di ogni famiglia: dove vivono gli ordini e come si chiamano le sue
 * scritture. È la mappa che permette alle route del registro di servire tre famiglie con lo
 * stesso codice — i valori ACEA sono quelli storici (`vociRapportino` li ri-esporta da qui).
 *
 * `unita` è la differenza di dominio più importante: per ACEA l'unità di lavoro è l'ODL (più
 * operazioni dello stesso ordine sono lo stesso passaggio sul posto), per AcquaLatina è la coppia
 * ODL+matricola — nel master 109 ordini coprono fino a 5 contatori (condomìni), e ogni contatore
 * è un intervento suo: pianificazione, voci di rapportino e chiusura devono distinguerli.
 */
export type ProfiloCommessa = {
  /** La tabella del registro. Due tabelle con la stessa forma: la select condivisa vale su entrambe. */
  tabellaOrdini: 'acea_ordini' | 'acqualatina_ordini';
  /** I committenti degli `interventi` di questa commessa (filtro di lettura). */
  committenti: readonly string[];
  /** Il committente con cui il registro CREA gli interventi. */
  committenteScrittura: string;
  /** Territorio dei piani-contenitore dei rapportini (`mappa_piani.territorio`). */
  territorioPiani: string;
  /** Unità di lavoro per pianificazione e voci: vedi sopra. */
  unita: 'odl' | 'odl_matricola';
};

export const PROFILO_COMMESSA: Record<Famiglia, ProfiloCommessa> = {
  dunning: {
    tabellaOrdini: 'acea_ordini',
    committenti: ['acea', 'lim_massive'],
    committenteScrittura: 'acea',
    territorioPiani: 'ACEA',
    unita: 'odl',
  },
  massive: {
    tabellaOrdini: 'acea_ordini',
    committenti: ['acea', 'lim_massive'],
    committenteScrittura: 'acea',
    territorioPiani: 'ACEA',
    unita: 'odl',
  },
  acqualatina: {
    tabellaOrdini: 'acqualatina_ordini',
    committenti: ['acqualatina'],
    committenteScrittura: 'acqualatina',
    territorioPiani: 'ACQUA LATINA',
    unita: 'odl_matricola',
  },
};

/**
 * Famiglia dal codice "Tipo di ordine".
 *
 * Un codice ignoto NON scarta la riga: cade su `dunning` con `riconosciuto: false`, così l'import
 * la registra e il riepilogo la segnala. Perdere silenziosamente un ordine perché ACEA ha
 * introdotto un codice nuovo sarebbe il modo peggiore di fallire.
 */
export function famigliaDaTipoOrdine(tipo: string | null | undefined): EsitoFamiglia {
  const t = String(tipo ?? '').trim().toUpperCase();
  if (MASSIVE.has(t)) return { famiglia: 'massive', riconosciuto: true };
  if (DUNNING.has(t)) return { famiglia: 'dunning', riconosciuto: true };
  return { famiglia: 'dunning', riconosciuto: false };
}
