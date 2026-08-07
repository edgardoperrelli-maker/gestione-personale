// lib/acea/exportVista.ts
// PURA: quanto scaricare per esportare la vista intera, e che nome dare al file che ne esce.
//
// «Esporta vista» esportava le righe SCESE, non quelle filtrate: con la barra che dice «300 di
// 5.293» ne usciva un xlsx da 300 righe, senza una parola sul troncamento. Un file che sembra
// completo e non lo è è peggio di un export che manca — ci si costruiscono sopra pivot e conteggi,
// e il numero sbagliato non ha nulla che lo denunci.
//
// Quindi l'export ripercorre la query dei filtri fino in fondo. Le due decisioni che vale la pena
// tenere pure e testabili sono queste: quante pagine servono, e come si chiama il file.

import type { ChiaveColonna } from './colonneTabella';
import type { SaraFiltro, StatoFiltro } from './filtriOrdini';
import type { Famiglia } from './famiglia';

/** Righe per richiesta durante l'export: è il tetto che `/api/acea/ordini` accetta. */
export const PER_PAGINA_EXPORT = 500;

/**
 * Tetto di righe per un singolo export.
 *
 * Il foglio si costruisce nel browser, quindi un tetto serve. Il registro oggi ne ha ~5.300 e la
 * soglia non si incontra lavorando; se la si incontra è meglio dirlo e chiedere di restringere i
 * filtri che produrre in silenzio un file mozzato — cioè ricadere nel difetto che si sta correggendo.
 */
export const MAX_RIGHE_EXPORT = 20_000;

/**
 * Toglie dal foglio la stessa riga comparsa due volte, tenendo la PRIMA.
 *
 * Ultima difesa prima della scrittura, e sta qui perché il foglio esce dal browser e vive per
 * conto suo: chi lo riapre fra un mese conta le righe e ci costruisce sopra una pivot, senza
 * niente che lo avverta che due sono la stessa. È lo stesso motivo per cui l'export ripercorre
 * la query fino in fondo — un file che sembra completo e non lo è è peggio di un export che manca.
 *
 * Serve perché una delle due strade dell'export NON ripassa dal server: quando le righe sono già
 * tutte in memoria si scrive quell'array, che «Carica altre» fa crescere per accodamento. Il
 * server l'ho verificato pulito (4.205 righe, 4.205 chiavi distinte, il 07/08/2026); l'array in
 * memoria è l'unico punto in cui una pagina può finirci due volte, e da lì andrebbe dritta nel file.
 *
 * La chiave è la stessa della tabella (`chiaveRiga`: ODL + numero operazione) — un ODL può avere
 * più operazioni, e deduplicare sul solo ODL cancellerebbe lavoro vero.
 *
 * Righe SENZA identità (entrambi i campi vuoti) si tengono tutte: non potendo dire se sono la
 * stessa, scartarle sarebbe esattamente il troncamento silenzioso che questa funzione evita.
 */
export function dedupRigheExport<T extends { odl?: unknown; numero_operazione?: unknown }>(
  righe: readonly T[],
): { righe: T[]; scartate: number } {
  const viste = new Set<string>();
  const tenute: T[] = [];
  for (const r of righe) {
    const chiave = `${String(r?.odl ?? '').trim()}|${String(r?.numero_operazione ?? '').trim()}`;
    if (chiave !== '|') {
      if (viste.has(chiave)) continue;
      viste.add(chiave);
    }
    tenute.push(r);
  }
  return { righe: tenute, scartate: righe.length - tenute.length };
}

/** Numeri di pagina (1-based) da chiedere per coprire `totale` righe. */
export function pagineExport(totale: number, perPagina: number = PER_PAGINA_EXPORT): number[] {
  if (!Number.isFinite(totale) || totale <= 0 || perPagina <= 0) return [];
  const quante = Math.ceil(totale / perPagina);
  return Array.from({ length: quante }, (_, i) => i + 1);
}

// ---------------------------------------------------------------------------
// Le date: numeri, non testo.
// ---------------------------------------------------------------------------

/**
 * Il formato con cui Excel MOSTRA le celle data che scriviamo.
 *
 * Dentro il file la data è un numero (vedi `serialeExcel`), quindi senza un formato si leggerebbe
 * `46240`. Questo lo rimette a 'dd/mm/yyyy', cioè come si legge in tabella: chi apre il foglio non
 * deve accorgersi di niente — deve solo poter ordinare la colonna e ottenere l'ordine giusto.
 */
export const FORMATO_DATA_EXCEL = 'dd/mm/yyyy';

/** Epoca del calendario di Excel: giorno 0. (Il 30/12/1899 e non il 31, per il finto 1900 bisestile.) */
const EPOCA_EXCEL = Date.UTC(1899, 11, 30);

/**
 * 'YYYY-MM-DD' → il numero con cui Excel rappresenta quel giorno; `null` se non è una data.
 *
 * Tutto in UTC di proposito: il fuso qui non c'entra e farlo entrare è il modo classico di
 * sbagliare di un giorno. Una data di calendario non ha un'ora, e passando da `new Date(iso)` —
 * che è mezzanotte UTC — a un seriale calcolato sull'ora locale, ogni fuso a ovest di Greenwich
 * scala l'intero export al giorno prima.
 */
export function serialeExcel(iso: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return null;
  const giorni = (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - EPOCA_EXCEL) / 86_400_000;
  return Number.isFinite(giorni) ? giorni : null;
}

export type NomeExport = {
  famiglia: Famiglia;
  /** Stato del segmented: è parte di cosa c'è dentro il file, non un dettaglio della vista. */
  stato: StatoFiltro;
  /** Scheda-comune attiva (massive): restringe il contenuto quanto lo stato, e il nome lo dice. */
  comune?: string | null;
  /** Giorno del registro ('YYYY-MM-DD'), preso dal server. */
  oggi: string;
  /** Almeno un filtro di colonna o una ricerca libera attiva. */
  filtrato: boolean;
  /**
   * Dentro ci sono le righe SPUNTATE A MANO, non la vista.
   *
   * È la stessa preoccupazione del resto del file — un xlsx sopravvive alla schermata da cui è
   * uscito — spinta un passo più in là: un file di quindici righe chiamato come l'export dei
   * «Chiusi» di ZAGAROLO dice che quelli SONO i chiusi di ZAGAROLO. Chi lo riapre fra un mese non
   * ha modo di sapere che qualcuno, quel giorno, ne aveva spuntate quindici.
   */
  selezione?: boolean;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** 'RIGNANO FLAMINIO' → 'rignano-flaminio': nel nome di un file gli spazi sono guai. */
function fettaComune(comune: string | null | undefined): string | null {
  const pulito = String(comune ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return pulito === '' ? null : pulito;
}

/**
 * Nome del file: dice cosa restringe il contenuto.
 *
 * Un xlsx sopravvive alla schermata da cui è uscito — finisce in una cartella, viene riaperto a
 * distanza di settimane, girato a qualcun altro. Il nome è l'unica cosa che si porta dietro: se il
 * file contiene i soli ordini aperti del dunning, deve dirlo, altrimenti chi lo riapre conta 1.800
 * righe e crede sia tutto il registro.
 *
 * `filtrato` non elenca i filtri (diventerebbe illeggibile e non entrerebbe in un nome di file):
 * dice che ce n'erano, cioè che quel totale non è il totale della famiglia.
 */
export function nomeFileExport({
  famiglia, stato, comune, oggi, filtrato, selezione,
}: NomeExport): string {
  // Le famiglie ACEA stanno sotto il prefisso della commessa; acqualatina È la commessa, e
  // «acea-acqualatina-…» direbbe il committente sbagliato a chi ritrova il file fra mesi.
  const parti: string[] = famiglia === 'acqualatina' ? ['acqualatina'] : ['acea', famiglia];
  const c = fettaComune(comune);
  if (c) parti.push(c);
  parti.push(stato);
  if (ISO.test(oggi)) parti.push(oggi.replaceAll('-', ''));
  /*
    `selezione` COPRE `filtrato`, non gli si somma: chi ha spuntato le righe a mano ha ristretto il
    contenuto più di qualunque filtro, e «filtrato-selezione» allungherebbe il nome per dire due
    volte la stessa cosa — che dentro non c'è tutto.
  */
  if (selezione) parti.push('selezione');
  else if (filtrato) parti.push('filtrato');
  return `${parti.join('-')}.xlsx`;
}

/**
 * Nome del FOGLIO dentro il file (la tab di Excel), non del file.
 *
 * `RegistroAcea` è condiviso dalle tre famiglie, ma il foglio interno restava scritto 'ACEA' anche
 * per l'export di AcquaLatina: chi apriva il file vedeva la tab «ACEA» sopra righe di
 * `acqualatina_ordini` — lo stesso errore di categorizzazione che `nomeFileExport` evita già nel
 * nome del file, qui riapparso dentro.
 */
export function nomeFoglioExport(famiglia: Famiglia): string {
  return famiglia === 'acqualatina' ? 'AcquaLatina' : 'ACEA';
}

// ---------------------------------------------------------------------------
// La richiesta ad ACEA: il foglio che esce dall'azienda.
// ---------------------------------------------------------------------------

/**
 * Il tracciato della richiesta di apertura ordini di sostituzione saracinesca.
 *
 * FISSO, e non «le colonne visibili» come l'export della vista. Sono due cose diverse: l'export
 * della vista è uno strumento interno — si esporta quello che si sta guardando, per farci una
 * pivot — mentre questo è un documento che esce dall'azienda e arriva al committente.
 *
 * Da lì discendono le due scelte che contano:
 *
 * - **niente dati di lavorazione interna.** L'export della vista porterebbe le Note (testo libero
 *   che l'ufficio scrive per l'operatore: «citofonare», «cane in giardino») e il gruppo di giro.
 *   Non riguardano ACEA e non c'è motivo di mandarglieli. L'ESECUTORE invece sì, dal 06/08/2026:
 *   è chi ha fatto il lavoro che stiamo dichiarando, non un appunto di reparto (vedi il commento
 *   sulla sua riga in `tracciatoRichiesta`).
 * - **forma stabile.** Costruito sulle colonne visibili, il file cambierebbe tracciato ogni volta
 *   che qualcuno tocca il menu Colonne, e ACEA riceverebbe un file diverso a ogni giro.
 *
 * L'IMPIANTO viene dall'ordine su cui la saracinesca è stata comunicata: è quello a tramandarlo.
 * Sulle limitazioni massive aperte a mano dal «+» un ordine non c'è, e la cella resta vuota —
 * quelle righe si identificano con matricola e indirizzo.
 */
export type CampoRichiesta = {
  intestazione: string;
  larghezza: number;
  chiave: ChiaveColonna;
};

const BASE_RICHIESTA: CampoRichiesta[] = [
  { intestazione: 'Impianto', larghezza: 120, chiave: 'impianto' },
  { intestazione: 'Matricola', larghezza: 140, chiave: 'matricola' },
  { intestazione: 'Indirizzo', larghezza: 220, chiave: 'indirizzo' },
  { intestazione: 'CAP', larghezza: 80, chiave: 'cap' },
  { intestazione: 'Località', larghezza: 140, chiave: 'comune' },
];

/**
 * Il tracciato dell'estrazione, per il passo del ciclo che si sta guardando.
 *
 * I primi cinque campi sono gli stessi — è il PUNTO, e il punto non cambia — mentre le ultime tre
 * colonne seguono la popolazione, perché le due schede parlano di cose diverse:
 *
 * - su «Ordini per ACEA» la riga è la limitazione su cui la saracinesca è stata dichiarata, e
 *   l'ODL è il riferimento con cui ACEA ritrova quel lavoro. La data è quando ci siamo stati:
 *   è da lì che il lavoro è a credito.
 * - su «Da esitare» la riga È l'ordine di sostituzione. Chiamare «ODL intervento» quel numero
 *   sarebbe l'etichetta sbagliata sul numero giusto — esattamente l'inganno che questa scheda è
 *   nata per togliere — e la data che conta è quando ACEA l'ha aperto, cioè da quanto aspetta.
 */
export function tracciatoRichiesta(sara: SaraFiltro): CampoRichiesta[] {
  if (sara === 'da_esitare') {
    return [
      ...BASE_RICHIESTA,
      { intestazione: 'ODL sostituzione', larghezza: 120, chiave: 'odl' },
      { intestazione: 'Creato il', larghezza: 120, chiave: 'data_creazione' },
      { intestazione: 'Stato ordine', larghezza: 190, chiave: 'stato' },
    ];
  }
  return [
    ...BASE_RICHIESTA,
    { intestazione: 'ODL intervento', larghezza: 120, chiave: 'odl' },
    { intestazione: 'Data intervento', larghezza: 120, chiave: 'pianificato_il' },
    /*
      CHI c'è stato, accanto a quando (richiesta dell'ufficio, 06/08/2026).

      È l'unica riga di questo tracciato che porta un dato nostro, e il commento qui sopra dice
      che i nomi dei nostri operatori non ci vanno. La regola non è caduta, si è ristretta: vale
      per le Note — testo libero che l'ufficio scrive per l'operatore — mentre l'esecutore è
      l'altra metà di «Data intervento», che nel file c'era già. Un file che dice quando ci siamo
      stati ma non chi, se ACEA contesta la saracinesca costringe a ricostruirlo da noi.
    */
    { intestazione: 'Esecutore', larghezza: 160, chiave: 'pianificato_a' },
    { intestazione: 'Attività', larghezza: 210, chiave: 'attivita' },
  ];
}

/** Nome del file: dice quale dei due passi contiene, e di quando. */
export function nomeFileRichiesta(famiglia: Famiglia, oggi: string, sara: SaraFiltro): string {
  const parti = [
    'acea', famiglia,
    sara === 'da_esitare' ? 'saracinesche-da-esitare' : 'richiesta-saracinesche',
  ];
  if (ISO.test(oggi)) parti.push(oggi.replaceAll('-', ''));
  return `${parti.join('-')}.xlsx`;
}
