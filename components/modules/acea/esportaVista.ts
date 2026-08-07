'use client';

import {
  dataIsoCella, eColonnaData, valoreCella, type DefColonna, type RigaTabella,
} from '@/lib/acea/colonneTabella';
import {
  FORMATO_DATA_EXCEL, PER_PAGINA_EXPORT, dedupRigheExport, pagineExport, serialeExcel,
  tracciatoRichiesta, type CampoRichiesta,
} from '@/lib/acea/exportVista';
import type { SaraFiltro } from '@/lib/acea/filtriOrdini';

/**
 * Scarica **tutte** le righe che la query dei filtri seleziona, non solo quelle già scese.
 *
 * La tabella pagina a 300 righe su un registro da 5.000+, e chi esporta ha davanti la barra che
 * dice «300 di 5.293». Costruire il foglio con le righe in memoria dava un file da 300 righe senza
 * un avviso: un troncamento invisibile, dentro un file che poi vive per conto suo.
 *
 * Le richieste sono sequenziali di proposito: l'ordinamento del server è totale
 * (scadenza, creazione, ODL, operazione), quindi le pagine si incastrano, e in fila non si scarica
 * addosso al database undici query in parallelo per un comando che parte da un click.
 *
 * Se una pagina fallisce l'errore RISALE: meglio nessun file che un file a cui mancano in silenzio
 * 500 righe di mezzo.
 */
export async function caricaTutteLeRighe(
  query: string,
  totale: number,
  onProgresso?: (scaricate: number) => void,
): Promise<RigaTabella[]> {
  const tutte: RigaTabella[] = [];
  for (const pagina of pagineExport(totale)) {
    const p = new URLSearchParams(query);
    p.set('pagina', String(pagina));
    p.set('perPagina', String(PER_PAGINA_EXPORT));
    const res = await fetch(`/api/acea/ordini?${p.toString()}`);
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(b.error ?? `Export interrotto alla pagina ${pagina}: registro non disponibile.`);
    }
    const dati = (await res.json()) as { righe?: RigaTabella[] };
    const righe = dati.righe ?? [];
    tutte.push(...righe);
    onProgresso?.(tutte.length);
    // Pagina vuota prima del previsto: il registro è cambiato sotto (un import in corso). Ci si
    // ferma su quello che c'è invece di ciclare a vuoto fino all'ultima pagina calcolata.
    if (righe.length === 0) break;
  }
  return tutte;
}

/**
 * Esporta in xlsx **quello che si vede**: le righe filtrate e le colonne visibili, nell'ordine
 * corrente della tabella.
 *
 * È la contropartita dello spegnimento del master: quando serve una formula o una pivot ad hoc,
 * si esporta la vista invece di tenere in vita un file che si disallinea. `xlsx` è già una
 * dipendenza del progetto, e si carica dinamicamente perché serve solo al click.
 */
export async function esportaVista(
  righe: readonly RigaTabella[],
  colonne: readonly DefColonna[],
  nomeFile: string,
  nomeFoglio: string,
): Promise<EsitoExport> {
  return scriviXlsx(righe, colonne, nomeFile, nomeFoglio);
}

/**
 * Esporta la RICHIESTA ad ACEA: tracciato fisso, solo i campi che servono ad aprire gli ordini.
 *
 * Deliberatamente NON «quello che si vede». Questo file esce dall'azienda e arriva al committente,
 * quindi non porta le note dell'ufficio né i nomi dei nostri operatori, e ha la stessa forma a
 * ogni giro invece di seguire il menu Colonne. Il tracciato sta in `RICHIESTA_ACEA`, dove si legge
 * tutto insieme e si cambia in un posto solo.
 */
export async function esportaRichiestaAcea(
  righe: readonly RigaTabella[],
  nomeFile: string,
  sara: SaraFiltro,
): Promise<EsitoExport> {
  return scriviXlsx(
    righe,
    tracciatoRichiesta(sara),
    nomeFile,
    sara === 'da_esitare' ? 'Da esitare' : 'Richiesta saracinesche',
  );
}

/**
 * Cosa è finito nel file.
 *
 * `scartate` esiste per essere DETTO: la deduplica è una rete di sicurezza, e una rete che scatta
 * senza farlo sapere trasforma un difetto in un file più corto di quello che ci si aspetta, senza
 * niente da cui accorgersene. Se è > 0 il chiamante lo mostra.
 */
export type EsitoExport = { scritte: number; scartate: number };

/**
 * Il pezzo comune a tutti gli export: dalle righe al file scaricato.
 *
 * Le DATE escono come date, non come testo. `valoreCella` dà 'dd/MM/yyyy' — giusto a schermo,
 * inservibile in un foglio: quel testo si ordina per carattere, e la colonna Scadenza ordinata
 * mette gennaio 2027 prima di dicembre 2026. Chi esporta lo fa quasi sempre per ordinare o
 * filtrare per data, cioè proprio la cosa che non funzionava. Qui la cella diventa il NUMERO di
 * Excel col suo formato: si legge identica e si ordina per davvero.
 */
async function scriviXlsx(
  righe: readonly RigaTabella[],
  colonne: ReadonlyArray<CampoRichiesta | DefColonna>,
  nomeFile: string,
  nomeFoglio: string,
): Promise<EsitoExport> {
  const XLSX = await import('xlsx');
  // Ultima difesa prima della scrittura: la stessa riga non finisce due volte nel foglio, da
  // qualunque delle due strade arrivi (righe riscaricate o array già in memoria).
  const { righe: uniche, scartate } = dedupRigheExport(righe);
  const intestazione = colonne.map((c) => c.intestazione);
  const corpo = uniche.map((r) => colonne.map((c) => {
    const seriale = serialeExcel(dataIsoCella(r, c.chiave));
    if (seriale !== null) return seriale;
    const v = valoreCella(r, c.chiave);
    // Il trattino è il segnaposto della TABELLA, che deve mostrare una cella occupata. In un
    // foglio è un valore: una cella vuota si filtra e si somma, «—» no.
    return v === '—' ? '' : v;
  }));

  const ws = XLSX.utils.aoa_to_sheet([intestazione, ...corpo]);
  ws['!cols'] = colonne.map((c) => ({ wch: Math.max(10, Math.round(c.larghezza / 8)) }));

  /*
    Il formato si applica CELLA PER CELLA e non alla colonna: `!cols` in xlsx porta la larghezza,
    non il formato numerico, e senza `z` un seriale si legge `46240`.

    Si tocca solo quello che è davvero un numero: una data mancante è rimasta stringa vuota (il
    trattino qui sopra), e darle un formato data la trasformerebbe nel 30/12/1899 — cioè un buco
    travestito da giorno.
  */
  const intervallo = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  colonne.forEach((c, indice) => {
    if (!eColonnaData(c.chiave)) return;
    for (let riga = 1; riga <= intervallo.e.r; riga++) {
      const cella = ws[XLSX.utils.encode_cell({ r: riga, c: indice })];
      if (cella && cella.t === 'n') cella.z = FORMATO_DATA_EXCEL;
    }
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nomeFoglio);

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { scritte: uniche.length, scartate };
}
