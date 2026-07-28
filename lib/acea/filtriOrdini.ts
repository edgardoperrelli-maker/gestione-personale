// lib/acea/filtriOrdini.ts
// PURA: dai parametri della query ai criteri applicabili al registro.
//
// La parte che merita test è quella delle scadenze: tradurre "scaduti" e "in scadenza entro N
// giorni" in soglie di data, senza slittamenti di fuso e senza includere le massive (che non
// scadono mai). Il resto dei filtri è passaggio diretto di valori.
//
// Dal 2026-07-27 i filtri vivono nelle intestazioni della tabella, come l'AutoFiltro di Excel:
// - colonne "a elenco" (`COLONNE_ELENCO`): si spuntano più valori, in OR fra loro;
// - colonne "a testo" (`COLONNE_TESTO`): un «contiene» sulla colonna.
// Fra colonne diverse i criteri sono sempre in AND, come in Excel.
//
// I valori delle spunte NON si ricavano dalle righe caricate: la tabella è paginata (300 righe su
// 5.000+), quindi un elenco costruito dal caricato mostrerebbe solo una parte dei comuni e
// filtrerebbe su un insieme che l'utente non vede. Arrivano da `/api/acea/opzioni`, che li legge
// sull'intero registro, e il filtro si applica lato server.

export type StatoFiltro = 'tutti' | 'aperti' | 'chiusi';
export type ScadenzaFiltro = 'tutte' | 'scaduti' | 'in_scadenza' | 'senza_scadenza';

/** Etichette del filtro scadenza. Una sola fonte: le usano il menu, le pill e i test. */
export const ETICHETTE_SCADENZA: Record<ScadenzaFiltro, string> = {
  tutte: 'Qualsiasi scadenza',
  scaduti: 'Oltre la scadenza',
  in_scadenza: 'In scadenza (7 gg)',
  senza_scadenza: 'Senza scadenza',
};

/** Etichette del segmented sopra la tabella. */
export const ETICHETTE_STATO: Record<StatoFiltro, string> = {
  aperti: 'Da lavorare',
  chiusi: 'Chiusi',
  tutti: 'Tutti',
};

/**
 * Colonne filtrabili con un elenco di valori spuntabili.
 *
 * Sono le colonne a bassa cardinalità: i comuni sono ~60, le attività una ventina, gli stati una
 * manciata. Su ODL o matricola un elenco di 5.000 voci sarebbe inutilizzabile — quelle stanno in
 * `COLONNE_TESTO`.
 *
 * Il CAP è a elenco e non a testo benché sia un codice: serve a pianificare per zona, e spuntare
 * i tre CAP confinanti su cui mandare una squadra è il gesto vero. Un «contiene» permetterebbe un
 * CAP alla volta e nasconderebbe quali esistono davvero nel registro.
 */
export const COLONNE_ELENCO = ['comune', 'attivita', 'stato_desc', 'operatore_cognome', 'cap'] as const;
export type ColonnaElenco = (typeof COLONNE_ELENCO)[number];

/** Colonne filtrabili per «contiene». `matricola_norm` e non `matricola`: la ricerca è sul normalizzato. */
export const COLONNE_TESTO = ['odl', 'matricola_norm', 'impianto', 'via'] as const;
export type ColonnaTesto = (typeof COLONNE_TESTO)[number];

/**
 * Elenchi di valori distinti serviti da `/api/acea/opzioni`, uno per colonna a elenco.
 *
 * Sono calcolati sull'INTERO registro, non sulle righe caricate: è la differenza fra un filtro che
 * dice la verità e uno che offre solo i comuni capitati nelle prime 300 righe.
 */
/**
 * `operatori` è l'operatore ACEA scritto nell'export; `esecutori` è il NOSTRO, quello che mandiamo
 * sul posto. Due elenchi diversi che si somigliano nel nome: il primo viene dal registro, il
 * secondo dall'anagrafica del personale.
 */
export type ChiaveOpzioni = 'comuni' | 'attivita' | 'operatori' | 'stati' | 'cap' | 'esecutori';
export type Opzioni = Record<ChiaveOpzioni, string[]>;

export const OPZIONI_VUOTE: Opzioni = {
  comuni: [], attivita: [], operatori: [], stati: [], cap: [], esecutori: [],
};

/**
 * Filtri sulla PIANIFICAZIONE, cioè sulle due colonne che non vengono da ACEA.
 *
 * Esecutore e Data pianificata non stanno nel registro: vivono in `interventi` e si agganciano in
 * lettura. Sono quindi gli unici filtri che il server non può passare direttamente a Postgres su
 * `acea_ordini` — vedi il percorso di incrocio in `app/api/acea/ordini/route.ts`.
 */
export type PianificazioneFiltro = 'tutte' | 'non_pianificati' | 'pianificati';

export const ETICHETTE_PIANIFICAZIONE: Record<PianificazioneFiltro, string> = {
  tutte: 'Qualsiasi',
  non_pianificati: 'Non pianificati',
  pianificati: 'Già pianificati',
};

export type FiltriPianificazione = {
  /** `display_name` degli operatori spuntati. */
  esecutori: string[];
  /** «Non assegnato»: nessun intervento con un esecutore. */
  senzaEsecutore: boolean;
  pianificazione: PianificazioneFiltro;
  /** Giorno preciso ('YYYY-MM-DD'), o `null`. */
  giorno: string | null;
};

export type FiltriOrdini = {
  famiglia: 'dunning' | 'massive' | null;
  stato: StatoFiltro;
  /** Valori spuntati per colonna. Array vuoto = nessun filtro su quella colonna. */
  elenchi: Record<ColonnaElenco, string[]>;
  /** Termine «contiene» per colonna, già ripulito. `null` = nessun filtro. */
  testi: Record<ColonnaTesto, string | null>;
  scadenza: ScadenzaFiltro;
  /** Finestra per "in scadenza": giorni da oggi (default 7). */
  entroGiorni: number;
  /** Ricerca libera su ODL, matricola, impianto, indirizzo. */
  cerca: string | null;
  pianificazione: FiltriPianificazione;
  pagina: number;
  perPagina: number;
};

/**
 * `true` se almeno un criterio tocca la pianificazione.
 *
 * È l'interruttore che decide quale percorso prende la route: senza, la query resta una sola
 * interrogazione paginata su `acea_ordini`; con, serve incrociare `interventi` e impaginare
 * l'incrocio. Il percorso caro si paga solo quando lo si chiede.
 */
export function filtriPianificazioneAttivi(p: FiltriPianificazione): boolean {
  return (
    p.esecutori.length > 0 || p.senzaEsecutore || p.pianificazione !== 'tutte' || p.giorno !== null
  );
}

/** Criteri di data derivati dal filtro scadenza, pronti per la query. */
export type SoglieScadenza =
  | { tipo: 'nessuna' }
  | { tipo: 'senza_scadenza' }
  | { tipo: 'scaduti'; prima: string }
  | { tipo: 'in_scadenza'; da: string; a: string };

const MAX_PER_PAGINA = 500;
const DEFAULT_PER_PAGINA = 100;
/** Tetto ai valori spuntabili per colonna: oltre, la URL diventa impraticabile. */
const MAX_VALORI_ELENCO = 200;
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

/**
 * Termine per un filtro «contiene», ripulito dai jolly.
 *
 * `*` e `%` sono i jolly di `ilike`: lasciarli passare significherebbe che un utente che cerca il
 * carattere `%` in un indirizzo ottiene invece «qualsiasi cosa». Si sostituiscono con spazio, come
 * già si fa con i caratteri di sintassi nella ricerca libera.
 */
export function terminoContiene(v: string | null | undefined): string | null {
  const s = String(v ?? '').replace(/[%*]/g, ' ').trim();
  return s === '' ? null : s;
}

/** Valori distinti e non vuoti di un parametro ripetuto, nell'ordine di arrivo. */
function elenco(params: URLSearchParams, chiave: string): string[] {
  const visti = new Set<string>();
  for (const grezzo of params.getAll(chiave)) {
    const v = testo(grezzo);
    if (v !== null) visti.add(v);
    if (visti.size >= MAX_VALORI_ELENCO) break;
  }
  return [...visti];
}

/** Data ISO valida, o `null`. Un giorno storto non deve svuotare la tabella in silenzio. */
const giornoIso = (v: string | null | undefined): string | null => {
  const s = testo(v);
  return s !== null && ISO.test(s) ? s : null;
};

/** Legge e normalizza i parametri: valori ignoti cadono sui default, mai errori. */
export function leggiFiltri(params: URLSearchParams): FiltriOrdini {
  const famiglia = params.get('famiglia');
  const stato = params.get('stato');
  const scadenza = params.get('scadenza');
  const pian = params.get('pianificazione');

  const elenchi = {} as Record<ColonnaElenco, string[]>;
  for (const c of COLONNE_ELENCO) elenchi[c] = elenco(params, c);

  const testi = {} as Record<ColonnaTesto, string | null>;
  for (const c of COLONNE_TESTO) testi[c] = terminoContiene(params.get(c));

  return {
    famiglia: famiglia === 'dunning' || famiglia === 'massive' ? famiglia : null,
    stato: stato === 'aperti' || stato === 'chiusi' ? stato : 'tutti',
    elenchi,
    testi,
    scadenza:
      scadenza === 'scaduti' || scadenza === 'in_scadenza' || scadenza === 'senza_scadenza'
        ? scadenza
        : 'tutte',
    entroGiorni: intero(params.get('entroGiorni'), 7, 1, 60),
    cerca: testo(params.get('cerca')),
    pianificazione: {
      esecutori: elenco(params, 'esecutore'),
      senzaEsecutore: params.get('senzaEsecutore') === '1',
      pianificazione:
        pian === 'non_pianificati' || pian === 'pianificati' ? pian : 'tutte',
      giorno: giornoIso(params.get('giornoPianificato')),
    },
    pagina: intero(params.get('pagina'), 1, 1, 100_000),
    perPagina: intero(params.get('perPagina'), DEFAULT_PER_PAGINA, 1, MAX_PER_PAGINA),
  };
}

/** Quante colonne hanno un filtro attivo (per il conteggio nella barra e i test). */
export function colonneFiltrate(f: FiltriOrdini): number {
  const conElenco = COLONNE_ELENCO.filter((c) => f.elenchi[c].length > 0).length;
  const conTesto = COLONNE_TESTO.filter((c) => f.testi[c] !== null).length;
  return conElenco + conTesto + (f.scadenza === 'tutte' ? 0 : 1);
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

// ---------------------------------------------------------------------------
// Lato client: stato dei filtri e costruzione della query.
//
// Vive qui e non nel hook perché è la parte che, sbagliata, fa sparire un filtro in SILENZIO — la
// tabella mostrerebbe righe plausibili e nessuno se ne accorgerebbe. Pura, quindi testabile.
// ---------------------------------------------------------------------------

export type FiltriUI = {
  /** Segmented sopra la tabella: si lavora sull'aperto, lo storico è a un click. */
  stato: StatoFiltro;
  /** Filtro dell'intestazione «Scadenza» (semantico, non un intervallo di date). */
  scadenza: ScadenzaFiltro;
  /** Ricerca libera: attraversa più colonne, quindi sta nella barra e non in un'intestazione. */
  cerca: string;
  elenchi: Record<ColonnaElenco, string[]>;
  testi: Record<ColonnaTesto, string>;
  /** Le due colonne che non vengono da ACEA: esecutore e giorno pianificato. */
  pianificazione: FiltriPianificazione;
};

/**
 * Filtri iniziali. È una FUNZIONE e non una costante: `elenchi` e `testi` sono oggetti annidati e
 * una costante condivisa finirebbe mutata da chi la usa come base con lo spread.
 */
export function filtriVuoti(): FiltriUI {
  const elenchi = {} as Record<ColonnaElenco, string[]>;
  for (const c of COLONNE_ELENCO) elenchi[c] = [];
  const testi = {} as Record<ColonnaTesto, string>;
  for (const c of COLONNE_TESTO) testi[c] = '';
  return {
    stato: 'aperti', // si lavora sull'aperto: lo storico è a un click, ma non è la vista di default
    scadenza: 'tutte',
    cerca: '',
    elenchi,
    testi,
    pianificazione: { esecutori: [], senzaEsecutore: false, pianificazione: 'tutte', giorno: null },
  };
}

/** Parametri per `GET /api/acea/ordini`. I valori vuoti non compaiono: URL corte e leggibili. */
export function parametriQuery(
  f: FiltriUI,
  famiglia: 'dunning' | 'massive',
  perPagina: number,
): URLSearchParams {
  const p = new URLSearchParams({ famiglia, perPagina: String(perPagina) });
  if (f.stato !== 'tutti') p.set('stato', f.stato);
  if (f.scadenza !== 'tutte') p.set('scadenza', f.scadenza);
  if (f.cerca.trim()) p.set('cerca', f.cerca.trim());
  for (const c of COLONNE_ELENCO) {
    // `append` e non `set`: è il parametro ripetuto a rappresentare le spunte multiple.
    for (const v of f.elenchi[c]) p.append(c, v);
  }
  for (const c of COLONNE_TESTO) {
    const t = f.testi[c].trim();
    if (t) p.set(c, t);
  }
  const pi = f.pianificazione;
  for (const e of pi.esecutori) p.append('esecutore', e);
  if (pi.senzaEsecutore) p.set('senzaEsecutore', '1');
  if (pi.pianificazione !== 'tutte') p.set('pianificazione', pi.pianificazione);
  if (pi.giorno) p.set('giornoPianificato', pi.giorno);
  return p;
}

/** Quanti filtri di colonna sono attivi (per la barra e il pulsante «azzera»). */
export function contaFiltriColonna(f: FiltriUI): number {
  const pi = f.pianificazione;
  return (
    COLONNE_ELENCO.filter((c) => f.elenchi[c].length > 0).length
    + COLONNE_TESTO.filter((c) => f.testi[c].trim() !== '').length
    + (f.scadenza === 'tutte' ? 0 : 1)
    // Le due colonne della pianificazione contano UNA ciascuna, non una per criterio: nella
    // colonna Esecutore convivono le spunte e «Non assegnato», e sono lo stesso imbuto.
    + (pi.esecutori.length > 0 || pi.senzaEsecutore ? 1 : 0)
    + (pi.pianificazione !== 'tutte' || pi.giorno !== null ? 1 : 0)
  );
}

/** `true` se qualcosa è diverso dallo stato iniziale: decide se mostrare «Azzera». */
export function haFiltriAttivi(f: FiltriUI): boolean {
  const iniziale = filtriVuoti();
  return (
    contaFiltriColonna(f) > 0 || f.cerca.trim() !== '' || f.stato !== iniziale.stato
  );
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
