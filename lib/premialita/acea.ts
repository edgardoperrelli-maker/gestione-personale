/**
 * Regola di premialità del contratto Acea ATO2 "Gestione Utenze Morose".
 *
 * KPI di efficienza (EL = Limitazioni, ES = Sospensioni, ERC = Rimozioni
 * Contatori, ERA = Rimozioni Abusi):
 *   efficienza% = (interventi eseguiti e andati a buon fine, esitati positivi,
 *                  al netto degli accessi a vuoto) / (assegnati che si sarebbero
 *                  dovuti eseguire nel tempo predefinito)   (§4 Disciplinare Tecnico)
 *
 * - Standard minimo per ciascun KPI: 65%.
 * - Prezzo variabile delle attività: da −35% (a 65%) a +30% (≥85%) rispetto al
 *   prezzo dichiarato in gara per l'efficienza dichiarata (punto "X" = 0%).
 * - Valutazione ogni 2 mesi solari; risoluzione se efficienza < 65% per 3 mesi.
 * - Premio: se ES ≥ 80% → compenso accessi a vuoto = 20% del prezzo sospensione.
 */

export const SOGLIA_MINIMA = 65;
export const SOGLIA_PREMIO_ES = 80;
export const EFFICIENZA_PIENA = 85; // oltre questa soglia scatta il +30%
export const PREZZO_VARIAZIONE_MIN = -35;
export const PREZZO_VARIAZIONE_MAX = 30;
export const PREMIO_ES_PERC = 20; // % del prezzo sospensione
export const MESI_VALUTAZIONE = 2;

export type KpiCode = 'EL' | 'ES' | 'ERC' | 'ERA';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  const r = Math.round(value * 10) / 10;
  return r === 0 ? 0 : r; // normalizza -0 → 0
}

/**
 * Calcola l'efficienza % (arrotondata al primo decimale).
 * `eseguitiPositivi` è già al netto degli accessi a vuoto.
 */
export function efficienza(eseguitiPositivi: number, assegnatiDovuti: number): number {
  if (assegnatiDovuti <= 0) return 0;
  return round1((eseguitiPositivi / assegnatiDovuti) * 100);
}

/** True se il KPI rispetta lo standard minimo del 65%. */
export function rispettaSoglia(efficienzaPct: number): boolean {
  return efficienzaPct >= SOGLIA_MINIMA;
}

/** True se ES dà diritto al premio sugli accessi a vuoto (ES ≥ 80%). */
export function premioAccessiAVuoto(esPct: number): boolean {
  return esPct >= SOGLIA_PREMIO_ES;
}

/**
 * Variazione di prezzo (%) in funzione dell'efficienza, rispetto al prezzo
 * dichiarato in gara (0% all'efficienza dichiarata).
 * Curva lineare a tratti: 65% → −35%, dichiarata → 0%, ≥85% → +30%.
 */
export function variazionePrezzo(efficienzaPct: number, efficienzaDichiarata: number): number {
  const dichiarata = clamp(efficienzaDichiarata, SOGLIA_MINIMA, EFFICIENZA_PIENA);
  const pct = clamp(efficienzaPct, SOGLIA_MINIMA, 100);

  if (pct <= dichiarata) {
    if (dichiarata === SOGLIA_MINIMA) return 0;
    const t = (pct - SOGLIA_MINIMA) / (dichiarata - SOGLIA_MINIMA);
    return round1(PREZZO_VARIAZIONE_MIN * (1 - t));
  }

  if (EFFICIENZA_PIENA === dichiarata) return PREZZO_VARIAZIONE_MAX;
  const t = (Math.min(pct, EFFICIENZA_PIENA) - dichiarata) / (EFFICIENZA_PIENA - dichiarata);
  return round1(PREZZO_VARIAZIONE_MAX * t);
}

export type KpiInput = {
  code: KpiCode;
  eseguitiPositivi: number;
  assegnatiDovuti: number;
  /** Efficienza dichiarata in gara per questo KPI (65–85). */
  efficienzaDichiarata: number;
};

export type KpiResult = {
  code: KpiCode;
  efficienza: number;
  sogliaOk: boolean;
  variazionePrezzo: number;
  /** Solo per ES: diritto al premio accessi a vuoto. */
  premio: boolean;
};

/** Valuta un singolo KPI producendo efficienza, rispetto soglia, banda prezzo e premio. */
export function valutaKpi(input: KpiInput): KpiResult {
  const eff = efficienza(input.eseguitiPositivi, input.assegnatiDovuti);
  return {
    code: input.code,
    efficienza: eff,
    sogliaOk: rispettaSoglia(eff),
    variazionePrezzo: variazionePrezzo(eff, input.efficienzaDichiarata),
    premio: input.code === 'ES' && premioAccessiAVuoto(eff),
  };
}

export const KPI_LABELS: Record<KpiCode, string> = {
  EL: 'Efficienza Limitazioni',
  ES: 'Efficienza Sospensioni',
  ERC: 'Efficienza Rimozioni Contatori',
  ERA: 'Efficienza Rimozioni Abusi',
};
