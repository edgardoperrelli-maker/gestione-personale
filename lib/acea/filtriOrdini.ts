// lib/acea/filtriOrdini.ts
// PURA: dai parametri della query ai criteri applicabili al registro.
//
// La parte che merita test è quella delle scadenze: tradurre "scaduti" e "in scadenza entro N
// giorni" in soglie di data, senza slittamenti di fuso e senza includere le massive (che non
// scadono mai). Il resto dei filtri è passaggio diretto di valori.

export type StatoFiltro = 'tutti' | 'aperti' | 'chiusi';
export type ScadenzaFiltro = 'tutte' | 'scaduti' | 'in_scadenza' | 'senza_scadenza';

export type FiltriOrdini = {
  famiglia: 'dunning' | 'massive' | null;
  stato: StatoFiltro;
  comune: string | null;
  attivita: string | null;
  operatore: string | null;
  scadenza: ScadenzaFiltro;
  /** Finestra per "in scadenza": giorni da oggi (default 7). */
  entroGiorni: number;
  /** Ricerca libera su ODL, matricola, impianto, indirizzo. */
  cerca: string | null;
  pagina: number;
  perPagina: number;
};

/** Criteri di data derivati dal filtro scadenza, pronti per la query. */
export type SoglieScadenza =
  | { tipo: 'nessuna' }
  | { tipo: 'senza_scadenza' }
  | { tipo: 'scaduti'; prima: string }
  | { tipo: 'in_scadenza'; da: string; a: string };

const MAX_PER_PAGINA = 500;
const DEFAULT_PER_PAGINA = 100;
const GIORNO_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function sposta(iso: string, giorni: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + giorni * GIORNO_MS).toISOString().slice(0, 10);
}

const testo = (v: string | null | undefined): string | null => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

const intero = (v: string | null | undefined, def: number, min: number, max: number): number => {
  const n = Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
};

/** Legge e normalizza i parametri: valori ignoti cadono sui default, mai errori. */
export function leggiFiltri(params: URLSearchParams): FiltriOrdini {
  const famiglia = params.get('famiglia');
  const stato = params.get('stato');
  const scadenza = params.get('scadenza');
  return {
    famiglia: famiglia === 'dunning' || famiglia === 'massive' ? famiglia : null,
    stato: stato === 'aperti' || stato === 'chiusi' ? stato : 'tutti',
    comune: testo(params.get('comune')),
    attivita: testo(params.get('attivita')),
    operatore: testo(params.get('operatore')),
    scadenza:
      scadenza === 'scaduti' || scadenza === 'in_scadenza' || scadenza === 'senza_scadenza'
        ? scadenza
        : 'tutte',
    entroGiorni: intero(params.get('entroGiorni'), 7, 1, 60),
    cerca: testo(params.get('cerca')),
    pagina: intero(params.get('pagina'), 1, 1, 100_000),
    perPagina: intero(params.get('perPagina'), DEFAULT_PER_PAGINA, 1, MAX_PER_PAGINA),
  };
}

/**
 * Soglie di data per il filtro scadenza, rispetto a `oggi` ('YYYY-MM-DD').
 *
 * `scaduti` = scadenza **strettamente precedente** a oggi: un ordine che scade oggi non è ancora
 * in ritardo, e marcarlo come tale farebbe perdere fiducia nel contatore.
 */
export function soglieScadenza(f: FiltriOrdini, oggi: string): SoglieScadenza {
  if (!ISO.test(oggi)) return { tipo: 'nessuna' };
  switch (f.scadenza) {
    case 'scaduti':
      return { tipo: 'scaduti', prima: oggi };
    case 'in_scadenza':
      return { tipo: 'in_scadenza', da: oggi, a: sposta(oggi, f.entroGiorni) };
    case 'senza_scadenza':
      return { tipo: 'senza_scadenza' };
    default:
      return { tipo: 'nessuna' };
  }
}

/** Intervallo di righe per la paginazione (estremi inclusi, come `range` di PostgREST). */
export function intervalloPagina(f: FiltriOrdini): { da: number; a: number } {
  const da = (f.pagina - 1) * f.perPagina;
  return { da, a: da + f.perPagina - 1 };
}

/** Espressione `or` di PostgREST per la ricerca libera. `null` se non c'è nulla da cercare. */
export function espressioneRicerca(f: FiltriOrdini): string | null {
  if (!f.cerca) return null;
  // Le virgole e le parentesi spezzerebbero la sintassi `or=(...)` di PostgREST.
  const q = f.cerca.replace(/[(),*]/g, ' ').trim();
  if (q === '') return null;
  return ['odl', 'matricola_norm', 'impianto', 'via', 'testo_ordine']
    .map((c) => `${c}.ilike.*${q}*`)
    .join(',');
}
