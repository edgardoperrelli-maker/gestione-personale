// lib/acea/colonneTabella.ts
// PURA: definizione delle colonne della tabella ordini e formattazione dei valori.
//
// Le colonne sono quelle del master più la scadenza, come concordato: si guarda la stessa cosa
// che si guardava nel foglio, senza il foglio. Il resto dei ~50 campi del registro resta
// disponibile come colonna attivabile, non a schermo di default.

import {
  ETICHETTE_PIANIFICAZIONE, ETICHETTE_SCADENZA,
  type ChiaveOpzioni, type ColonnaElenco, type ColonnaTesto, type FiltriUI,
} from './filtriOrdini';
import { eRevoca } from './scadenza';

export type RigaTabella = {
  odl: string;
  numero_operazione: string;
  famiglia: string;
  tipo_ordine: string | null;
  attivita: string | null;
  stato: string;
  stato_desc: string | null;
  aperto: boolean;
  data_creazione: string;
  cardine_al: string | null;
  scadenza: string | null;
  data_completamento: string | null;
  operatore_cognome: string | null;
  /** Nome di battesimo del C.I.D. ACEA. Opzionale: il registro c'era prima che si mostrasse. */
  operatore_nome?: string | null;
  /**
   * `true` se Esecutore e Data pianificata vengono da un APPUNTO e non da un intervento.
   *
   * Una riga con solo l'esecutore o solo la data non produce nessun rapportino: il valore si
   * vede, ma va detto che non è ancora pianificazione. Vedi `TabellaOrdini`.
   */
  pianificazione_parziale?: boolean;
  causale: string | null;
  causale_desc: string | null;
  esito_positivo: boolean | null;
  via: string | null;
  civico: string | null;
  cap: string | null;
  comune: string | null;
  /** Numero di microarea dalle coordinate. `null` finché la geocodifica non è passata. */
  microarea: number | null;
  /** `true` se il gruppo e` PRESTATO dal CAP/comune e non calcolato dalle proprie coordinate. */
  microarea_stimata?: boolean;
  impianto: string | null;
  matricola: string | null;
  valore_netto: number | null;
  escludi_consuntivazione: boolean;
  codice_sla: string | null;
  priorita_testo: string | null;
  centro_lavoro: string | null;
  sospetto_troncamento: boolean;
  /**
   * Dal master (`acea_master_snapshot`): 'SI' se su questo ordine e` stata sostituita una
   * saracinesca. Non e` dato ACEA — e` una dichiarazione nostra, e vale 91,12 € l'una.
   */
  saracinesca: string | null;
  /**
   * L'ODL dell'ordine ACEA di SOSTITUZIONE — quello vero, generato da ACEA per quella matricola,
   * non il numero della limitazione su cui si e` intervenuti. Senza, il lavoro non viene pagato.
   */
  odl_saracinesca: string | null;
  /** Lo stato di QUELL'ordine, non della limitazione: dice se la sostituzione e` gia` esitata. */
  stato_saracinesca: string | null;
  /**
   * Nota dell'ufficio. Si scrive qui in tabella e arriva all'operatore dentro il rapportino, nel
   * banner «Nota dall'ufficio» — non e` un promemoria interno, e` un messaggio a chi va sul posto.
   */
  note: string | null;
  // dalla pianificazione (join in lettura, non è dato ACEA)
  pianificato_il: string | null;
  pianificato_a: string | null;
  stato_intervento: string | null;
};

export type ChiaveColonna =
  | 'odl' | 'attivita' | 'matricola' | 'indirizzo' | 'comune' | 'cap' | 'gruppo' | 'stato'
  | 'data_creazione' | 'scadenza' | 'pianificato_a' | 'pianificato_il'
  | 'impianto' | 'famiglia' | 'tipo_ordine' | 'operatore_cognome' | 'data_completamento' | 'esito'
  | 'valore_netto' | 'codice_sla' | 'priorita_testo' | 'centro_lavoro' | 'cardine_al'
  | 'saracinesca' | 'odl_saracinesca' | 'stato_saracinesca' | 'note';

/**
 * Filtro disponibile nell'intestazione della colonna, come l'AutoFiltro di Excel.
 *
 * `campo` è il nome della colonna nel registro, cioè il parametro della query: il legame fra
 * l'intestazione cliccata e il filtro applicato dal server sta qui e in nessun altro posto.
 *
 * Le colonne SENZA `filtro` non mostrano l'imbuto, e questo resta voluto: un imbuto che filtrasse
 * le sole 300 righe caricate direbbe una bugia sul conteggio.
 *
 * `pianificato_a` e `pianificato_il` sono il caso di confine. Non stanno nel registro — la
 * pianificazione è nostra e vive in `interventi` — quindi a lungo NON hanno avuto l'imbuto, perché
 * l'unico modo di disegnarlo sarebbe stato quello disonesto. Ora ce l'hanno per davvero: la route
 * incrocia registro e interventi e impagina l'incrocio, quindi il conteggio resta quello vero.
 */
export type FiltroColonna =
  | { tipo: 'elenco'; campo: ColonnaElenco; opzioni: ChiaveOpzioni }
  | { tipo: 'testo'; campo: ColonnaTesto }
  | { tipo: 'scadenza' }
  // I due della PIANIFICAZIONE. Non portano un `campo` del registro perché non ne hanno uno: il
  // dato vive in `interventi` e il server lo incrocia (vedi `app/api/acea/ordini/route.ts`).
  | { tipo: 'esecutore' }
  | { tipo: 'data_pianificata' };

export type DefColonna = {
  chiave: ChiaveColonna;
  intestazione: string;
  /** Visibile di default: la vista «come il master». */
  predefinita: boolean;
  /** Allineamento numerico/monospazio per i dati tabellari. */
  mono?: boolean;
  larghezza: number;
  /** Filtro nell'intestazione. Assente = colonna non filtrabile (vedi `FiltroColonna`). */
  filtro?: FiltroColonna;
};

const F = {
  odl: { tipo: 'testo', campo: 'odl' },
  matricola: { tipo: 'testo', campo: 'matricola_norm' },
  indirizzo: { tipo: 'testo', campo: 'via' },
  impianto: { tipo: 'testo', campo: 'impianto' },
  note: { tipo: 'testo', campo: 'note' },
  comune: { tipo: 'elenco', campo: 'comune', opzioni: 'comuni' },
  cap: { tipo: 'elenco', campo: 'cap', opzioni: 'cap' },
  gruppo: { tipo: 'elenco', campo: 'microarea', opzioni: 'gruppi' },
  attivita: { tipo: 'elenco', campo: 'attivita', opzioni: 'attivita' },
  stato: { tipo: 'elenco', campo: 'stato_desc', opzioni: 'stati' },
  operatore: { tipo: 'elenco', campo: 'operatore_cognome', opzioni: 'operatori' },
  scadenza: { tipo: 'scadenza' },
  esecutore: { tipo: 'esecutore' },
  dataPianificata: { tipo: 'data_pianificata' },
} as const satisfies Record<string, FiltroColonna>;

/** Colonne della vista Dunning (pianificazione). */
export const COLONNE_DUNNING: DefColonna[] = [
  { chiave: 'odl', intestazione: 'ODL', predefinita: true, mono: true, larghezza: 110, filtro: F.odl },
  { chiave: 'attivita', intestazione: 'Attività', predefinita: true, larghezza: 210, filtro: F.attivita },
  { chiave: 'matricola', intestazione: 'Matricola', predefinita: true, mono: true, larghezza: 130, filtro: F.matricola },
  { chiave: 'indirizzo', intestazione: 'Indirizzo', predefinita: true, larghezza: 220, filtro: F.indirizzo },
  { chiave: 'comune', intestazione: 'Comune', predefinita: true, larghezza: 140, filtro: F.comune },
  // Il CAP è il taglio più fine che ACEA ci dà sul territorio: è la zona su cui si decide dove
  // mandare una squadra. Predefinita perché senza si pianifica per comune, e un comune come Roma
  // non dice nulla su quanto sono distanti due misuratori.
  { chiave: 'cap', intestazione: 'CAP', predefinita: true, mono: true, larghezza: 80, filtro: F.cap },
  // Il gruppo viene dalle COORDINATE, non dal CAP: a Roma un CAP e` largo chilometri, e due
  // misuratori con lo stesso CAP possono essere a mezz'ora l'uno dall'altro. Ordinando per questa
  // colonna le righe da fare nello stesso giro finiscono una sotto l'altra.
  { chiave: 'gruppo', intestazione: 'Gruppo', predefinita: true, mono: true, larghezza: 76, filtro: F.gruppo },
  { chiave: 'stato', intestazione: 'Stato ordine', predefinita: true, larghezza: 130, filtro: F.stato },
  { chiave: 'data_creazione', intestazione: 'Creazione', predefinita: true, mono: true, larghezza: 100 },
  { chiave: 'scadenza', intestazione: 'Scadenza', predefinita: true, mono: true, larghezza: 130, filtro: F.scadenza },
  { chiave: 'pianificato_a', intestazione: 'Esecutore', predefinita: true, larghezza: 140, filtro: F.esecutore },
  { chiave: 'pianificato_il', intestazione: 'Data pianificata', predefinita: true, mono: true, larghezza: 120, filtro: F.dataPianificata },
  /*
    Le due colonne di ACEA, subito accanto alle nostre, e PREDEFINITE.

    Non è un ripensamento estetico: «Esecutore» e «Data pianificata» qui sopra vengono da
    `interventi`, cioè da chi ci abbiamo mandato NOI. Su un ordine che ACEA ha chiuso senza passare
    dalla nostra pianificazione restano vuote per costruzione, e la riga si legge come un import
    che non ha caricato niente — è successo davvero, su un export di riaperture tutte «completato».
    Il dato c'era da sempre nel registro (`Cognome C.I.D.`, `Nome C.I.D.`, `Data Completamento`),
    non aveva una cella dove farsi vedere. Averle affiancate è ciò che rende il registro «lo
    specchio del Cruscotto» invece che «l'elenco di quello che abbiamo assegnato noi».
  */
  { chiave: 'operatore_cognome', intestazione: 'Operatore ACEA', predefinita: true, larghezza: 150, filtro: F.operatore },
  { chiave: 'data_completamento', intestazione: 'Esecuzione ACEA', predefinita: true, mono: true, larghezza: 120 },
  // Saracinesca sostituita, e l'ODL con cui e` stata richiesta ad ACEA. Dove risulta una
  // sostituzione DEVE esistere l'ordine che la registra: senza, il lavoro e` stato fatto e non
  // verra` mai pagato (91,12 € l'una). La colonna esiste per far vedere quel buco.
  // Nota dell'ufficio: si scrive qui e arriva all'operatore nel rapportino.
  { chiave: 'note', intestazione: 'Note', predefinita: true, larghezza: 220, filtro: F.note },
  // Le tre delle saracinesche NON sono predefinite nella vista normale: li` non servono, e tre
  // colonne quasi sempre vuote rubano spazio a quelle che si guardano tutti i giorni. Restano
  // attivabili, e nella scheda «Sostituzione saracinesca» tornano a schermo da sole.
  { chiave: 'saracinesca', intestazione: 'Saracinesca', predefinita: false, larghezza: 100 },
  { chiave: 'odl_saracinesca', intestazione: 'ODL sostituzione', predefinita: false, mono: true, larghezza: 130 },
  { chiave: 'stato_saracinesca', intestazione: 'Stato sostituzione', predefinita: false, larghezza: 140 },
  // attivabili
  { chiave: 'impianto', intestazione: 'Impianto', predefinita: false, mono: true, larghezza: 120, filtro: F.impianto },
  { chiave: 'famiglia', intestazione: 'Famiglia', predefinita: false, larghezza: 100 },
  { chiave: 'tipo_ordine', intestazione: 'Tipo ordine', predefinita: false, mono: true, larghezza: 100 },
  { chiave: 'esito', intestazione: 'Esito ACEA', predefinita: false, larghezza: 200 },
  { chiave: 'valore_netto', intestazione: 'Valore', predefinita: false, mono: true, larghezza: 90 },
  { chiave: 'codice_sla', intestazione: 'SLA', predefinita: false, mono: true, larghezza: 80 },
  { chiave: 'priorita_testo', intestazione: 'Priorità', predefinita: false, larghezza: 140 },
  { chiave: 'centro_lavoro', intestazione: 'Centro di lavoro', predefinita: false, mono: true, larghezza: 130 },
  { chiave: 'cardine_al', intestazione: 'Scadenza ACEA', predefinita: false, mono: true, larghezza: 120 },
];

/**
 * Colonne della vista AcquaLatina (sostituzione misuratori, Terracina).
 *
 * La tabella dice quello che il master dice: ODL, matricola, indirizzo — più le NOSTRE tre
 * (esecutore, giorno, note) e lo stato. Niente CAP (nel master di Terracina è vuoto su tutte le
 * 4.196 righe), niente scadenza/SLA/impianto/saracinesche: sono concetti ACEA che qui non
 * esistono, e una colonna sempre vuota si legge come un import rotto.
 *
 * «Chiusa il» è `data_completamento`, ma qui la scrive il NOSTRO motore (rapportino consegnato
 * con esito), non un export del committente: AcquaLatina non ci rimanda indietro lo stato.
 */
export const COLONNE_ACQUALATINA: DefColonna[] = [
  { chiave: 'odl', intestazione: 'ODL', predefinita: true, mono: true, larghezza: 110, filtro: F.odl },
  { chiave: 'matricola', intestazione: 'Matricola', predefinita: true, mono: true, larghezza: 150, filtro: F.matricola },
  { chiave: 'indirizzo', intestazione: 'Indirizzo', predefinita: true, larghezza: 260, filtro: F.indirizzo },
  { chiave: 'stato', intestazione: 'Stato', predefinita: true, larghezza: 130, filtro: F.stato },
  { chiave: 'pianificato_a', intestazione: 'Esecutore', predefinita: true, larghezza: 140, filtro: F.esecutore },
  { chiave: 'pianificato_il', intestazione: 'Data pianificata', predefinita: true, mono: true, larghezza: 120, filtro: F.dataPianificata },
  { chiave: 'note', intestazione: 'Note', predefinita: true, larghezza: 240, filtro: F.note },
  // attivabili
  { chiave: 'data_completamento', intestazione: 'Chiusa il', predefinita: false, mono: true, larghezza: 110 },
  { chiave: 'comune', intestazione: 'Comune', predefinita: false, larghezza: 130, filtro: F.comune },
  { chiave: 'data_creazione', intestazione: 'Caricata il', predefinita: false, mono: true, larghezza: 100 },
];

/** Colonne della vista Limitazioni massive: nessuna scadenza, questi ordini non scadono. */
export const COLONNE_MASSIVE: DefColonna[] = [
  { chiave: 'odl', intestazione: 'ODL', predefinita: true, mono: true, larghezza: 110, filtro: F.odl },
  { chiave: 'impianto', intestazione: 'Impianto', predefinita: true, mono: true, larghezza: 120, filtro: F.impianto },
  /*
    175 e non 140: le matricole SETA delle massive sono 15-16 caratteri mono più il triangolo
    del sospetto troncamento — a 140 si leggeva «SETA0712240…», che sembrava un dato rotto due
    volte. La cifra che manca DAVVERO (vedi il tooltip del triangolo) non si recupera
    allargando, ma quello che abbiamo si mostra intero.
  */
  { chiave: 'matricola', intestazione: 'Matricola', predefinita: true, mono: true, larghezza: 175, filtro: F.matricola },
  { chiave: 'indirizzo', intestazione: 'Indirizzo', predefinita: true, larghezza: 220, filtro: F.indirizzo },
  { chiave: 'comune', intestazione: 'Comune', predefinita: true, larghezza: 130, filtro: F.comune },
  { chiave: 'cap', intestazione: 'CAP', predefinita: true, mono: true, larghezza: 80, filtro: F.cap },
  { chiave: 'gruppo', intestazione: 'Gruppo', predefinita: true, mono: true, larghezza: 76, filtro: F.gruppo },
  { chiave: 'stato', intestazione: 'Stato ordine', predefinita: true, larghezza: 130, filtro: F.stato },
  /*
    «Data pianificata», non «Data esecuzione»: questa colonna è `pianificato_il`, cioè il giorno
    a cui l'abbiamo messa NOI. Chiamarla «Data esecuzione» accanto a un ordine che ACEA ha già
    chiuso la fa leggere come la data in cui il lavoro è stato fatto, e su una riga mai pianificata
    da noi la cella vuota diventa «l'import non ha caricato l'esecuzione». La data vera di ACEA è
    la colonna qui sotto.
  */
  { chiave: 'pianificato_a', intestazione: 'Esecutore', predefinita: true, larghezza: 140, filtro: F.esecutore },
  { chiave: 'pianificato_il', intestazione: 'Data pianificata', predefinita: true, mono: true, larghezza: 120, filtro: F.dataPianificata },
  { chiave: 'operatore_cognome', intestazione: 'Operatore ACEA', predefinita: true, larghezza: 150, filtro: F.operatore },
  { chiave: 'data_completamento', intestazione: 'Esecuzione ACEA', predefinita: true, mono: true, larghezza: 120 },
  { chiave: 'esito', intestazione: 'Esito', predefinita: true, larghezza: 200 },
  { chiave: 'attivita', intestazione: 'Attività', predefinita: false, larghezza: 210, filtro: F.attivita },
  { chiave: 'valore_netto', intestazione: 'Valore', predefinita: false, mono: true, larghezza: 90 },
  { chiave: 'data_creazione', intestazione: 'Creazione', predefinita: false, mono: true, larghezza: 100 },
];

export type PillFiltro = {
  chiave: ChiaveColonna;
  intestazione: string;
  /** Cosa sta filtrando, in chiaro: «ROMA, TIVOLI», «contiene GARIBALDI», «Oltre la scadenza». */
  descrizione: string;
};

/** Oltre questo numero di valori spuntati la pill dice «N valori» invece di elencarli. */
const MAX_VALORI_IN_PILL = 3;

/**
 * I filtri di colonna attivi, in chiaro, per le pill sopra la tabella.
 *
 * Scorre TUTTE le colonne della vista, comprese quelle nascoste dal menu Colonne: un filtro su una
 * colonna che non si vede è esattamente il caso in cui la tabella sembra sbagliata senza motivo
 * apparente, e la pill è l'unico posto in cui quel filtro resta visibile e removibile.
 */
export function pillFiltri(colonne: DefColonna[], f: FiltriUI): PillFiltro[] {
  const pill: PillFiltro[] = [];
  for (const c of colonne) {
    if (!c.filtro) continue;
    if (c.filtro.tipo === 'elenco') {
      const v = f.elenchi[c.filtro.campo];
      if (v.length === 0) continue;
      pill.push({
        chiave: c.chiave,
        intestazione: c.intestazione,
        descrizione: v.length > MAX_VALORI_IN_PILL ? `${v.length} valori` : v.join(', '),
      });
    } else if (c.filtro.tipo === 'testo') {
      const t = f.testi[c.filtro.campo].trim();
      if (t === '') continue;
      pill.push({ chiave: c.chiave, intestazione: c.intestazione, descrizione: `contiene ${t}` });
    } else if (c.filtro.tipo === 'esecutore') {
      const { esecutori, senzaEsecutore } = f.pianificazione;
      if (esecutori.length === 0 && !senzaEsecutore) continue;
      const parti = senzaEsecutore ? ['non assegnato'] : [];
      if (esecutori.length > MAX_VALORI_IN_PILL) parti.push(`${esecutori.length} operatori`);
      else parti.push(...esecutori);
      pill.push({ chiave: c.chiave, intestazione: c.intestazione, descrizione: parti.join(', ') });
    } else if (c.filtro.tipo === 'data_pianificata') {
      const { pianificazione, giorno } = f.pianificazione;
      if (pianificazione === 'tutte' && !giorno) continue;
      const parti: string[] = [];
      if (pianificazione !== 'tutte') parti.push(ETICHETTE_PIANIFICAZIONE[pianificazione].toLowerCase());
      if (giorno) parti.push(`il ${dataIt(giorno)}`);
      pill.push({ chiave: c.chiave, intestazione: c.intestazione, descrizione: parti.join(', ') });
    } else if (c.filtro.tipo === 'scadenza' && f.scadenza !== 'tutte') {
      pill.push({
        chiave: c.chiave,
        intestazione: c.intestazione,
        descrizione: ETICHETTE_SCADENZA[f.scadenza],
      });
    }
  }
  return pill;
}

/** Toglie il filtro di una colonna, restituendo filtri nuovi (nessuna mutazione). */
export function senzaFiltroColonna(colonne: DefColonna[], f: FiltriUI, chiave: ChiaveColonna): FiltriUI {
  const c = colonne.find((x) => x.chiave === chiave);
  if (!c?.filtro) return f;
  const agg: FiltriUI = {
    ...f,
    elenchi: { ...f.elenchi },
    testi: { ...f.testi },
    pianificazione: { ...f.pianificazione },
  };
  if (c.filtro.tipo === 'elenco') agg.elenchi[c.filtro.campo] = [];
  else if (c.filtro.tipo === 'testo') agg.testi[c.filtro.campo] = '';
  else if (c.filtro.tipo === 'esecutore') {
    agg.pianificazione.esecutori = [];
    agg.pianificazione.senzaEsecutore = false;
  } else if (c.filtro.tipo === 'data_pianificata') {
    agg.pianificazione.pianificazione = 'tutte';
    agg.pianificazione.giorno = null;
  } else agg.scadenza = 'tutte';
  return agg;
}

/** 'YYYY-MM-DD' → 'dd/MM/yyyy' (convenzione di casa per il display). */
export function dataIt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Valore di una cella come testo, per rendering ed export. */
export function valoreCella(r: RigaTabella, c: ChiaveColonna): string {
  switch (c) {
    case 'odl':
      /*
        L'ODL NUDO, sempre. Il numero operazione non gli si concatena mai.

        È il numero con cui l'ordine si cerca su ACEA, si copia, si legge al telefono: qualunque
        cosa gli si attacchi va poi tolta a mano. `912215286/0190` non è un ODL, è un ODL più
        un'altra informazione — e chi lo incolla altrove si porta dietro anche quella.

        Il numero operazione resta nel dato (`numero_operazione`) e resta la seconda metà della
        chiave di riga: è solo la VISTA che non lo appiccica.
      */
      return r.odl;
    case 'indirizzo':
      return [r.via, r.civico].filter(Boolean).join(' ') || '—';
    case 'stato':
      return r.stato_desc ?? r.stato;
    /*
      Chi ha eseguito SU ACEA, e quando.

      Sono le due colonne che venivano scambiate per un import mancato: «Esecutore» e «Data
      pianificata» sono NOSTRE — vengono da `interventi`, cioè da chi ci abbiamo mandato noi — e
      su un ordine che ACEA ha chiuso senza passare dalla nostra pianificazione restano vuote per
      costruzione. Il dato ACEA c'era da sempre nel registro (`Cognome C.I.D.`, `Nome C.I.D.`,
      `Data Completamento`), ma non aveva una cella dove farsi vedere.
    */
    case 'operatore_cognome':
      return [r.operatore_cognome, r.operatore_nome].filter(Boolean).join(' ') || '—';
    case 'data_completamento':
      return r.data_completamento ? dataIt(r.data_completamento) : '—';
    case 'esito': {
      if (r.esito_positivo === null) return '—';
      return r.causale_desc ?? r.causale ?? (r.esito_positivo ? 'Eseguito' : 'Non eseguito');
    }
    case 'gruppo':
      // Un trattino e non uno zero: «non ancora geocodificato» non e` un gruppo, e uno zero
      // finirebbe ordinato insieme ai gruppi veri come se fosse una zona.
      /*
        Il numero NUDO, come l'ODL. La tilde davanti ai gruppi stimati sporcava il valore: un
        numero che si legge, si cerca e si detta non deve portarsi dietro un segno che poi va
        tolto a mano.

        La distinzione fra gruppo misurato e gruppo prestato non sparisce, cambia canale: la cella
        stimata si disegna smorzata, con la spiegazione nel tooltip (vedi `TabellaOrdini`). Lo
        stile dice «attenzione» senza entrare nel dato.
      */
      return r.microarea === null || r.microarea === undefined ? '—' : String(r.microarea);
    case 'note':
      return r.note || '';
    case 'saracinesca':
      // Solo il «SI» si scrive: il «NO» e il vuoto dicono la stessa cosa a chi guarda la colonna
      // (nessuna saracinesca da fatturare), e riempirla di NO renderebbe illeggibile l'unico
      // valore che conta.
      return (r.saracinesca ?? '').toUpperCase() === 'SI' ? 'SI' : '—';
    case 'odl_saracinesca':
      return r.odl_saracinesca || '—';
    case 'stato_saracinesca':
      // Lo stato dell'ordine di SOSTITUZIONE. Senza ordine non c'e` stato: il trattino qui vuol
      // dire «ACEA non l'ha ancora generato», che e` un'informazione, non un buco.
      return r.stato_saracinesca || '—';
    case 'valore_netto':
      return r.valore_netto === null ? '—' : r.valore_netto.toFixed(2);
    case 'data_creazione':
      return dataIt(r.data_creazione);
    case 'scadenza':
      return dataIt(r.scadenza);
    case 'cardine_al':
      return dataIt(r.cardine_al);
    case 'pianificato_il':
      return dataIt(r.pianificato_il);
    default: {
      const v = r[c as keyof RigaTabella];
      return v === null || v === undefined || v === '' ? '—' : String(v);
    }
  }
}

/**
 * `true` se la riga è una REVOCA APERTA, da evidenziare in tabella.
 *
 * Le revoche (`REVO`) arrivano fra le attivazioni con la stessa attività scritta delle RIAT, ma
 * vanno controllate a mano sul sistema ACEA: possono essere riattivazioni o regolarizzazioni
 * etichettate male, e lavorarle come revoche è l'intervento sbagliato. La riga si colora finché
 * l'ordine è APERTO — è lì che la verifica serve; colorare anche lo storico (60 REVO chiuse
 * contro 1 aperta, sui numeri veri) seppellirebbe l'unica riga che conta.
 */
export function eRevocaDaVerificare(r: Pick<RigaTabella, 'aperto' | 'codice_sla'>): boolean {
  return r.aperto && eRevoca(r.codice_sla);
}

/** Il perché della riga rossastra, per il tooltip: cosa controllare e dove. */
export const AVVISO_REVOCA =
  'Revoca (REVO): verifica sul sistema ACEA se è davvero una revoca o se va trasformata in Riattivazione o Regolarizzazione.';

/**
 * Il perché del triangolo sulla matricola: cosa manca davvero, e con che cosa si lavora.
 *
 * Non un generico «da verificare»: la verifica è stata FATTA, sui dati. Il testo ordine ACEA si
 * ferma a 40 caratteri e sulle massive taglia l'ultima cifra della matricola (le SETA sono 16
 * caratteri: le tronche sono tutte 15, al limite esatto del campo). La cifra mancante non è in
 * nessun file che riceviamo — master compreso — quindi non c'è import che la sistemi: il
 * riferimento completo è l'Impianto, e la matricola intera si legge sul Cruscotto o sul
 * misuratore stesso.
 */
export const AVVISO_MATRICOLA_TRONCA =
  'Matricola quasi certamente incompleta: il testo ordine ACEA si ferma a 40 caratteri e taglia '
  + 'l\'ultima cifra (il dato completo non arriva in nessun file). Identifica il punto con '
  + 'l\'Impianto, che è completo; la matricola intera si legge sul Cruscotto o sul misuratore.';

export type TonoScadenza = 'scaduto' | 'oggi' | 'vicino' | 'lontano' | 'nessuna';

/**
 * Urgenza della riga, per l'evidenziazione.
 *
 * `scaduto` solo per gli ordini ANCORA APERTI: una riga già completata in ritardo non è un
 * problema da segnalare oggi, e colorarla di rosso renderebbe illeggibile la tabella dello storico.
 */
export function tonoScadenza(r: RigaTabella, oggi: string): TonoScadenza {
  if (!r.scadenza || !r.aperto) return 'nessuna';
  if (r.scadenza < oggi) return 'scaduto';
  if (r.scadenza === oggi) return 'oggi';
  const giorni = Math.round(
    (Date.parse(`${r.scadenza}T00:00:00Z`) - Date.parse(`${oggi}T00:00:00Z`)) / 86_400_000,
  );
  return giorni <= 3 ? 'vicino' : 'lontano';
}

/**
 * Le colonne adattate alla scheda che si sta guardando.
 *
 * Nella scheda «Sostituzione saracinesca» l'ODL che conta è quello dell'ordine di SOSTITUZIONE:
 * è il numero che si cerca su ACEA per sapere se la richiesta è partita e a che punto sta. Il
 * numero della limitazione resta a schermo — serve a ritrovare la riga e il lavoro su cui la
 * saracinesca è stata cambiata — ma smette di chiamarsi «ODL», perché era quello a ingannare: si
 * leggeva la prima colonna credendo di leggere la sostituzione.
 *
 * Cambiano SOLO ordine ed etichette: le chiavi restano quelle: le larghezze e l'ordine salvati
 * dall'utente continuano a corrispondere invece di azzerarsi cambiando scheda.
 */
export function colonnePerStato(colonne: DefColonna[], saracinesche: boolean): DefColonna[] {
  if (!saracinesche) return colonne;

  const sostituzione = colonne.find((c) => c.chiave === 'odl_saracinesca');
  if (!sostituzione) return colonne;

  const resto = colonne
    .filter((c) => c.chiave !== 'odl_saracinesca')
    .map((c) => (c.chiave === 'odl' ? { ...c, intestazione: 'ODL limitazione' } : c));

  return [
    { ...sostituzione, intestazione: 'ODL', predefinita: true },
    // Nella loro scheda le colonne della saracinesca tornano a schermo: e` l'unico posto in cui
    // sono il motivo per cui si sta guardando la tabella.
    ...resto.map((c) => (c.chiave === 'saracinesca' || c.chiave === 'stato_saracinesca'
      ? { ...c, predefinita: true }
      : c)),
  ];
}
