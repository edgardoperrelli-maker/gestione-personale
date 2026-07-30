// lib/acea/fogliExport.ts
// PURA: i due fogli che escono dal modulo — il pianificato del giorno e il master on-demand.
//
// Sono cose diverse e vale la pena dirlo. Il **pianificato** è uno strumento di lavoro: il foglio
// che l'admin tiene aperto mentre assegna a mano sul Cruscotto, ordinato come si assegna, un
// operatore alla volta. Il **master** è una via d'uscita: lo stesso layout del file che stiamo
// spegnendo, rigenerato dal registro, per il giorno in cui serve una verifica manuale o qualcuno
// vuole la rassicurazione di riavere il file com'era.
//
// Le date escono come vere date Excel, non come testo. Non è estetica: `dd/MM/yyyy` scritto come
// stringa viene riletto da `new Date()` all'americana e un 27/07 diventa una data non valida —
// l'agente lo scarterebbe in silenzio.

import type { Famiglia } from './saracinesche';

export type ValoreCella = string | number | Date | null;

/**
 * ISO → data Excel a mezzogiorno locale.
 * Il mezzogiorno evita lo slittamento di giorno quando Excel riconverte per fuso: a mezzanotte
 * un'ora di differenza sposta la data indietro di un giorno.
 */
export function dataExcel(iso: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

const s = (v: string | null | undefined): string => String(v ?? '').trim();

/** Una colonna del foglio: intestazione, larghezza e come si ricava il valore. */
export type Campo<T> = {
  intestazione: string;
  larghezza: number;
  valore: (r: T) => ValoreCella;
};

// ────────────────────────────────────────────────────────────────────────────
// Pianificato del giorno
// ────────────────────────────────────────────────────────────────────────────

export type RigaPianificata = {
  odl: string;
  numero_operazione: string;
  operatore: string | null;
  attivita: string | null;
  comune: string | null;
  indirizzo: string | null;
  cap: string | null;
  impianto: string | null;
  matricola: string | null;
  stato_acea: string | null;
  famiglia: Famiglia | null;
};

export const CAMPI_PIANIFICATO: Campo<RigaPianificata>[] = [
  { intestazione: 'Operatore', larghezza: 24, valore: (r) => s(r.operatore) },
  { intestazione: 'ODL', larghezza: 14, valore: (r) => s(r.odl) },
  { intestazione: 'Operazione', larghezza: 12, valore: (r) => s(r.numero_operazione) },
  { intestazione: 'Attività', larghezza: 32, valore: (r) => s(r.attivita) },
  { intestazione: 'Comune', larghezza: 20, valore: (r) => s(r.comune) },
  { intestazione: 'Indirizzo', larghezza: 34, valore: (r) => s(r.indirizzo) },
  { intestazione: 'CAP', larghezza: 8, valore: (r) => s(r.cap) },
  { intestazione: 'Impianto', larghezza: 14, valore: (r) => s(r.impianto) },
  { intestazione: 'Matricola', larghezza: 18, valore: (r) => s(r.matricola) },
  { intestazione: 'Stato ACEA', larghezza: 12, valore: (r) => s(r.stato_acea) },
  { intestazione: 'Famiglia', larghezza: 12, valore: (r) => s(r.famiglia) },
];

/**
 * Ordine di lavoro del foglio: per operatore, poi comune, poi indirizzo.
 *
 * Non è un dettaglio: sul Cruscotto si assegna una persona alla volta, e un foglio ordinato per
 * ODL costringerebbe a saltare avanti e indietro fra gli operatori a ogni riga.
 */
export function ordinaPianificato(righe: readonly RigaPianificata[]): RigaPianificata[] {
  return [...righe].sort(
    (a, b) =>
      s(a.operatore).localeCompare(s(b.operatore), 'it') ||
      s(a.comune).localeCompare(s(b.comune), 'it') ||
      s(a.indirizzo).localeCompare(s(b.indirizzo), 'it') ||
      a.odl.localeCompare(b.odl) ||
      a.numero_operazione.localeCompare(b.numero_operazione),
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Master on-demand
// ────────────────────────────────────────────────────────────────────────────

export type RigaMaster = {
  odl: string;
  numero_operazione: string;
  impianto: string | null;
  matricola: string | null;
  /** Indirizzo da mostrare: quello verificato dall'ufficio se c'è, altrimenti quello ACEA. */
  indirizzo: string | null;
  via: string | null;
  civico: string | null;
  cap: string | null;
  comune: string | null;
  lat: number | null;
  lng: number | null;
  attivita: string | null;
  stato: string | null;
  /** Cognome dell'esecutore, nella forma che l'agente scrive oggi sul master. */
  esecutore: string | null;
  data_prevista: string | null;
  esito: string | null;
  saracinesca: string | null;
  sigillo: string | null;
  note: string | null;
  /** Derivato dal ciclo saracinesche: era la colonna che l'ufficio compilava a mano. */
  odl_saracinesca: string | null;
  /** true se il valore dell'esito viene dall'app: è ciò che la colonna AUTOMAZIONE significa. */
  automazione: boolean;
};

/**
 * Layout massive: l'unione delle intestazioni realmente presenti su LABICO e ZAGAROLO, lette da
 * `agente_file_colonne` il 27/07.
 *
 * I due file NON coincidono — LABICO ha `PREASSEGNAZIONE`/`ASSEGNATARIO` e non ha `Via`/`N. civico`,
 * e le maiuscole divergono. È la deriva che ha reso i master inaffidabili. Si rigenera l'unione:
 * l'agente risolve le colonne per nome, quindi una colonna in più è innocua mentre una in meno
 * romperebbe la lettura.
 */
export const MASTER_MASSIVE: { foglio: string; campi: Campo<RigaMaster>[] } = {
  foglio: 'Foglio1',
  campi: [
    { intestazione: 'Ordine', larghezza: 14, valore: (r) => s(r.odl) },
    { intestazione: 'Impianto', larghezza: 14, valore: (r) => s(r.impianto) },
    { intestazione: 'Matricola', larghezza: 18, valore: (r) => s(r.matricola) },
    { intestazione: 'Indirizzo', larghezza: 34, valore: (r) => s(r.indirizzo) },
    { intestazione: 'Via', larghezza: 28, valore: (r) => s(r.via) },
    { intestazione: 'N. civico', larghezza: 10, valore: (r) => s(r.civico) },
    { intestazione: 'Long', larghezza: 12, valore: (r) => r.lng ?? '' },
    { intestazione: 'Lat', larghezza: 12, valore: (r) => r.lat ?? '' },
    { intestazione: 'CAP', larghezza: 8, valore: (r) => s(r.cap) },
    { intestazione: 'Località', larghezza: 20, valore: (r) => s(r.comune) },
    { intestazione: 'Esecutore', larghezza: 20, valore: (r) => s(r.esecutore) },
    { intestazione: 'data prevista', larghezza: 14, valore: (r) => dataExcel(r.data_prevista) ?? '' },
    { intestazione: 'esito', larghezza: 14, valore: (r) => s(r.esito) },
    { intestazione: 'saracinesca', larghezza: 12, valore: (r) => s(r.saracinesca) },
    { intestazione: 'Odl saracinesca', larghezza: 16, valore: (r) => s(r.odl_saracinesca) },
    { intestazione: 'note', larghezza: 34, valore: (r) => s(r.note) },
    { intestazione: 'sigillo posato', larghezza: 16, valore: (r) => s(r.sigillo) },
    { intestazione: 'stato odl', larghezza: 12, valore: (r) => s(r.stato) },
    { intestazione: 'AUTOMAZIONE', larghezza: 14, valore: (r) => (r.automazione ? 'SI' : '') },
    { intestazione: 'PREASSEGNAZIONE', larghezza: 16, valore: () => '' },
    { intestazione: 'ASSEGNATARIO', larghezza: 20, valore: () => '' },
  ],
};

/**
 * Layout dunning: le colonne che il config dell'agente nomina per `LIMITAZIONI CON ORDINE.xlsx`.
 *
 * Volutamente NON arricchito. Il master on-demand serve a riavere il file com'era, non a farne uno
 * migliore: le colonne nuove — scadenza, data creazione, impianto — vivono nella tabella dell'app,
 * dove si possono filtrare e ordinare.
 */
export const MASTER_DUNNING: { foglio: string; campi: Campo<RigaMaster>[] } = {
  foglio: 'PIANIFICAZIONE',
  campi: [
    { intestazione: 'Ordine', larghezza: 14, valore: (r) => s(r.odl) },
    { intestazione: 'Operazione testo breve', larghezza: 32, valore: (r) => s(r.attivita) },
    { intestazione: 'Stato Operazione', larghezza: 16, valore: (r) => s(r.stato) },
    { intestazione: 'Esecutore', larghezza: 20, valore: (r) => s(r.esecutore) },
    { intestazione: 'Data', larghezza: 14, valore: (r) => dataExcel(r.data_prevista) ?? '' },
    { intestazione: 'Matricola misuratore', larghezza: 18, valore: (r) => s(r.matricola) },
    { intestazione: 'INDIRIZZO', larghezza: 34, valore: (r) => s(r.indirizzo) },
    { intestazione: 'Località', larghezza: 20, valore: (r) => s(r.comune) },
    { intestazione: 'Saracinesca', larghezza: 12, valore: (r) => s(r.saracinesca) },
    { intestazione: 'Automazione', larghezza: 14, valore: (r) => (r.automazione ? 'SI' : '') },
  ],
};

export function schemaMaster(famiglia: Famiglia): { foglio: string; campi: Campo<RigaMaster>[] } {
  return famiglia === 'massive' ? MASTER_MASSIVE : MASTER_DUNNING;
}

/** Intestazione + corpo di un foglio, pronti per il writer. */
export function costruisciFoglio<T>(
  campi: readonly Campo<T>[],
  righe: readonly T[],
): { intestazione: string[]; corpo: ValoreCella[][] } {
  return {
    intestazione: campi.map((c) => c.intestazione),
    corpo: righe.map((r) => campi.map((c) => c.valore(r))),
  };
}

/** Nome file: comune quando c'è (il master massive è un file per comune), altrimenti la famiglia. */
export function nomeFileMaster(famiglia: Famiglia, comune: string | null, oggi: string): string {
  const suffisso = oggi.replaceAll('-', '');
  const base = comune ? comune.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-') : famiglia;
  return `master-${base}-${suffisso}.xlsx`;
}
