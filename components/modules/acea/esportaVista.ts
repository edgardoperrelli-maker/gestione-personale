'use client';

import { valoreCella, type DefColonna, type RigaTabella } from '@/lib/acea/colonneTabella';
import { PER_PAGINA_EXPORT, pagineExport } from '@/lib/acea/exportVista';

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
): Promise<void> {
  const XLSX = await import('xlsx');
  const intestazione = colonne.map((c) => c.intestazione);
  const corpo = righe.map((r) => colonne.map((c) => {
    const v = valoreCella(r, c.chiave);
    return v === '—' ? '' : v;
  }));

  const ws = XLSX.utils.aoa_to_sheet([intestazione, ...corpo]);
  ws['!cols'] = colonne.map((c) => ({ wch: Math.max(10, Math.round(c.larghezza / 8)) }));
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
}
