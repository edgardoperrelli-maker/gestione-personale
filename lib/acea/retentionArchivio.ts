// lib/acea/retentionArchivio.ts
// PURA: quali xlsx archiviati hanno esaurito il loro compito e possono uscire dal bucket.
//
// L'archivio è la pezza d'appoggio («cosa diceva davvero ACEA quel giorno»), non lo storico:
// lo storico vero sono i metadati di `acea_import` e il change-log per campo di
// `acea_ordini_eventi`, e QUELLI non si toccano mai. Qui si pota solo il file grezzo, che a un
// import al giorno accumula centinaia di MB l'anno per rispondere a domande che dopo qualche
// mese non fa più nessuno.
//
// Due reti, entrambe deliberate:
//  - si tengono comunque gli ULTIMI `minimoTenuti` file, qualunque età abbiano: se gli import
//    si fermano per mesi, la retention a soli giorni svuoterebbe l'archivio proprio mentre è
//    l'unica memoria recente;
//  - la decisione è pura e riceve «oggi» da fuori: si prova a tavolino, non a colpi di bucket.

export type ImportArchiviato = {
  id: string;
  /** ISO timestamp di `caricato_il`. */
  caricato_il: string;
  storage_path: string | null;
};

export type OpzioniRetention = {
  /** Età oltre la quale il file si pota. */
  giorni?: number;
  /** File più recenti da tenere SEMPRE, qualunque età abbiano. */
  minimoTenuti?: number;
};

/** Sei mesi: abbastanza per ogni contestazione pratica, poco abbastanza da non accumulare. */
export const GIORNI_RETENTION = 180;
/** Mai sotto gli ultimi 30 file: un mese di import quotidiani, anche se vecchissimi. */
export const MINIMO_TENUTI = 30;

const GIORNO_MS = 86_400_000;

/**
 * Gli import il cui file va rimosso dal bucket. Non tocca niente: decide soltanto.
 *
 * `oggiIso` è 'YYYY-MM-DD' (fuso deciso dal chiamante). Righe senza `storage_path` non
 * partecipano: il loro file non c'è già più, o non c'è mai stato.
 */
export function daPotare(
  imports: readonly ImportArchiviato[],
  oggiIso: string,
  opzioni: OpzioniRetention = {},
): ImportArchiviato[] {
  const giorni = opzioni.giorni ?? GIORNI_RETENTION;
  const minimoTenuti = opzioni.minimoTenuti ?? MINIMO_TENUTI;

  const soglia = Date.parse(`${oggiIso}T00:00:00Z`) - giorni * GIORNO_MS;
  if (!Number.isFinite(soglia)) return [];

  const archiviati = imports
    .filter((i) => Boolean(i.storage_path))
    .map((i) => ({ ...i, epoca: Date.parse(i.caricato_il) }))
    .filter((i) => Number.isFinite(i.epoca))
    // Più recenti prima: i primi `minimoTenuti` sono intoccabili per posizione.
    .sort((a, b) => b.epoca - a.epoca);

  return archiviati
    .slice(minimoTenuti)
    .filter((i) => i.epoca < soglia)
    .map((i) => ({ id: i.id, caricato_il: i.caricato_il, storage_path: i.storage_path }));
}
