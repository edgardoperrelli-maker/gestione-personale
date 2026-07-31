// PURA: quali righe di un file master sono DAVVERO nuove.
//
// Ogni caricamento creava un master nuovo e ne inseriva tutte le righe, senza guardare cosa
// c'era già. Ricaricare lo stesso file — la cosa più normale quando si corregge una cella —
// raddoppiava il censimento: due master attivi, ogni matricola doppia, e il campo costretto a
// riscaricare il doppio dei dati perché la versione della cache cambia.
//
// La chiave è l'ODL: è NOT NULL a schema, ed è la chiave naturale del master (l'intero
// impianto è nato come lookup ODL → riga). Il confronto è normalizzato perché lo stesso ODL
// arriva da Excel a volte come testo, a volte con spazi, a volte con zeri davanti.

export type RigaConOdl = { odl: string };

/** Chiave di confronto dell'ODL: maiuscolo, senza spazi. Gli zeri iniziali NON si tolgono —
 *  su alcuni committenti sono significativi e due ordini diversi differirebbero solo per
 *  quelli. Meglio un duplicato in più che due ordini fusi per errore. */
export function chiaveOdl(v: unknown): string {
  return String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export type EsitoFiltro<T> = {
  /** Righe da inserire: ODL non presente a catalogo e non ripetuto nel file stesso. */
  nuove: T[];
  /** Quante scartate perché l'ODL è già nel censimento attivo del committente. */
  giaPresenti: number;
  /** Quante scartate perché ripetute DENTRO il file caricato. */
  doppieNelFile: number;
};

/**
 * Divide le righe del file fra nuove e già note.
 *
 * `odlEsistenti` sono gli ODL già presenti nei master **attivi** dello stesso committente: un
 * master spento è fuori dal lookup, quindi ricaricarne le righe è legittimo.
 *
 * Le righe con ODL già a catalogo si scartano e basta: NON si aggiornano. È una scelta —
 * significa che correggere l'indirizzo di un ordine già caricato non passa da qui, e va fatto
 * spegnendo il master vecchio e ricaricando. In cambio, un file ricaricato per sbaglio non
 * può sovrascrivere in silenzio dati che qualcuno aveva già sistemato a mano.
 */
export function righeNuoveMaster<T extends RigaConOdl>(
  righe: T[],
  odlEsistenti: Set<string>,
): EsitoFiltro<T> {
  const nuove: T[] = [];
  const vistiNelFile = new Set<string>();
  let giaPresenti = 0;
  let doppieNelFile = 0;

  for (const r of righe ?? []) {
    const k = chiaveOdl(r.odl);
    if (!k) continue; // senza ODL la riga non è indicizzabile: la scarta già il parser
    if (odlEsistenti.has(k)) { giaPresenti++; continue; }
    if (vistiNelFile.has(k)) { doppieNelFile++; continue; }
    vistiNelFile.add(k);
    nuove.push(r);
  }

  return { nuove, giaPresenti, doppieNelFile };
}
