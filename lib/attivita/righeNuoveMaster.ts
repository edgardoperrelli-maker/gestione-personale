// PURA: quali righe di un file master sono DAVVERO nuove.
//
// Ogni caricamento creava un master nuovo e ne inseriva tutte le righe, senza guardare cosa
// c'era già. Ricaricare lo stesso file — la cosa più normale quando si corregge una cella —
// raddoppiava il censimento: due master attivi, ogni matricola doppia, e il campo costretto a
// riscaricare il doppio dei dati perché la versione della cache cambia.
//
// La chiave è la COPPIA (ODL, matricola), non l'ODL da solo.
//
// L'ODL sembra la chiave naturale — è NOT NULL a schema e l'impianto è nato come lookup
// ODL → riga — ma su AcquaLatina non identifica una riga: i CONDOMÌNI mettono da 2 a 5
// contatori sotto lo stesso ordine. Misurato sul master attivo in produzione:
//
//   4.196 righe · 4.063 ODL distinti  →  133 righe scartate da una dedup sul solo ODL
//   109 ODL multi-contatore, e tutti e 109 hanno matricole DIVERSE
//
// Quelle 133 non sono ripetizioni: sono contatori veri, a indirizzi veri. Scartarle le
// toglie dal censimento, e l'operatore che cerca una di quelle matricole si vede
// «non censito → contatta l'ufficio», bloccato sul posto. Il caso non è teorico: scatta
// ogni volta che il file entra in un catalogo vuoto — cioè proprio nella procedura che
// questo modulo prescrive per correggere una riga già a catalogo (spegni e ricarica).
//
// È anche l'identità che il resto del dominio usa già: `ordiniDaMaster.ts` la dichiara
// («l'ODL da solo non identifica niente») e `acqualatina_ordini_odl_matricola_idx` la
// protegge con un indice unico.
//
// Dove il master non porta la matricola (committenti i cui file non ce l'hanno) la chiave
// degenera in «ODL|» e si comporta esattamente come l'ODL da solo: per loro non cambia
// nulla. Il confronto è normalizzato perché lo stesso valore arriva da Excel a volte come
// testo, a volte con spazi, a volte con zeri davanti.

export type RigaConOdl = { odl: string; matricola?: string | null };

/** Chiave di confronto dell'ODL: maiuscolo, senza spazi. Gli zeri iniziali NON si tolgono —
 *  su alcuni committenti sono significativi e due ordini diversi differirebbero solo per
 *  quelli. Meglio un duplicato in più che due ordini fusi per errore. */
export function chiaveOdl(v: unknown): string {
  return String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

/** Chiave d'identità della riga master: «ODL|matricola», entrambi normalizzati come sopra.
 *  Senza matricola resta «ODL|», che equivale a confrontare il solo ODL. */
export function chiaveRiga(r: { odl?: unknown; matricola?: unknown }): string {
  return `${chiaveOdl(r?.odl)}|${chiaveOdl(r?.matricola)}`;
}

export type EsitoFiltro<T> = {
  /** Righe da inserire: coppia (ODL, matricola) non a catalogo e non ripetuta nel file. */
  nuove: T[];
  /** Quante scartate perché la coppia è già nel censimento attivo del committente. */
  giaPresenti: number;
  /** Quante scartate perché ripetute DENTRO il file caricato. */
  doppieNelFile: number;
};

/**
 * Divide le righe del file fra nuove e già note.
 *
 * `chiaviEsistenti` sono le coppie (ODL, matricola) — vedi `chiaveRiga` — già presenti nei
 * master **attivi** dello stesso committente: un master spento è fuori dal lookup, quindi
 * ricaricarne le righe è legittimo.
 *
 * Le righe già a catalogo si scartano e basta: NON si aggiornano. È una scelta —
 * significa che correggere l'indirizzo di un ordine già caricato non passa da qui, e va fatto
 * spegnendo il master vecchio e ricaricando. In cambio, un file ricaricato per sbaglio non
 * può sovrascrivere in silenzio dati che qualcuno aveva già sistemato a mano.
 */
export function righeNuoveMaster<T extends RigaConOdl>(
  righe: T[],
  chiaviEsistenti: Set<string>,
): EsitoFiltro<T> {
  const nuove: T[] = [];
  const vistiNelFile = new Set<string>();
  let giaPresenti = 0;
  let doppieNelFile = 0;

  for (const r of righe ?? []) {
    // Il controllo di riga indicizzabile resta sull'ODL, non sulla chiave composta: quella
    // è sempre non vuota (contiene il separatore) e lascerebbe passare una riga senza ODL.
    if (chiaveOdl(r.odl) === '') continue; // la scarta già il parser
    const k = chiaveRiga(r);
    if (chiaviEsistenti.has(k)) { giaPresenti++; continue; }
    if (vistiNelFile.has(k)) { doppieNelFile++; continue; }
    vistiNelFile.add(k);
    nuove.push(r);
  }

  return { nuove, giaPresenti, doppieNelFile };
}
