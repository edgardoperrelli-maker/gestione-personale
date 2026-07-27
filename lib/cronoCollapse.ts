const KEY = 'crono:collapsedTerritori';

/**
 * Separatore fra il giorno e il territorio dentro la chiave di una corsia.
 * Non compare né in una data ISO (`YYYY-MM-DD`) né in un UUID, quindi la prima
 * occorrenza divide sempre la chiave nei due pezzi giusti.
 */
const SEP = '|';

/** Corsia delle card senza territorio assegnato. */
export const SENZA_TERRITORIO = '__none__';

/** Corsia degli operatori senza assegnazione (collocamento di default in magazzino). */
export const MAGAZZINO = '__magazzino__';

/** Giorni di storico oltre i quali la preferenza su una corsia non serve più a nessuno. */
export const GIORNI_MEMORIA = 60;

/**
 * Chiave riservata dentro lo STESSO insieme persistito dei territori.
 * Semantica invertita rispetto alle altre: se è presente, il blocco assenze è
 * APERTO. Serve così perché le assenze nascono riassunte (default = assente
 * dall'insieme = riassunto), mentre i territori nascono espansi.
 * Vale per l'intera settimana: è una preferenza di vista, non di giornata.
 */
export const ASSENZE_APERTE_KEY = '__assenze:aperte__';

/**
 * Chiave riservata: presente = sabato e domenica ESTESI come gli altri giorni.
 * Semantica invertita come le assenze: il weekend nasce ridotto a una striscia
 * (all'accesso la settimana lavorativa si prende tutta la piega) e chi ci lavora
 * lo riapre, con la scelta persistita.
 */
export const WEEKEND_APERTO_KEY = '__weekend:aperto__';

const RISERVATE = new Set<string>([ASSENZE_APERTE_KEY, WEEKEND_APERTO_KEY]);

/**
 * Chiave di una corsia territorio: è legata al GIORNO, non al solo territorio.
 * Comprimere PERUGIA di martedì non deve toccare PERUGIA di mercoledì — sono due
 * celle diverse con dentro persone diverse. Prima la chiave era il solo id del
 * territorio, quindi un clic si propagava a tutti e sette i giorni della griglia.
 */
export function chiaveTerritorio(iso: string, territorioId: string | null): string {
  return `${iso}${SEP}${territorioId ?? SENZA_TERRITORIO}`;
}

/** Parsing puro e robusto del valore localStorage → array di chiavi territorio. */
export function parseCollapsed(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

/**
 * Toglie le chiavi che non valgono più: le corsie di giorni ormai passati (le
 * chiavi ora nascono per giornata, quindi senza potatura l'insieme crescerebbe
 * a ogni settimana) e il formato vecchio, quello per solo id territorio, che
 * valeva su tutta la settimana e proprio per questo va dimenticato.
 * Le chiavi riservate (assenze, weekend) sono preferenze di vista e restano.
 * Le date ISO si confrontano bene da stringhe: l'ordine lessicografico è quello
 * cronologico.
 */
export function potaChiavi(keys: string[], dalIso: string): string[] {
  return keys.filter((k) => {
    if (RISERVATE.has(k)) return true;
    const i = k.indexOf(SEP);
    if (i < 0) return false;
    return k.slice(0, i) >= dalIso;
  });
}

/** ISO di `giorni` prima di `iso`, in aritmetica di calendario (niente fusi). */
export function isoMeno(iso: string, giorni: number): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() - giorni);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function oggiIso(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

export function loadCollapsed(todayIso: string = oggiIso()): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const tutte = parseCollapsed(window.localStorage.getItem(KEY));
    const vive = potaChiavi(tutte, isoMeno(todayIso, GIORNI_MEMORIA));
    if (vive.length !== tutte.length) saveCollapsed(vive);
    return vive;
  } catch {
    return [];
  }
}

export function saveCollapsed(keys: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(keys));
  } catch {
    /* ignora errori quota/privacy */
  }
}
