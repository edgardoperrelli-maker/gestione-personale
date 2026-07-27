// lib/acea/scadenza.ts
// PURA: scadenza NOSTRA di un ordine ACEA, dalla data di creazione.
//
// Non è la scadenza contrattuale di ACEA (`Data fine cardine`, conservata a parte nel registro):
// è la soglia con cui governiamo il lavoro. Regole decise:
//
//   massive          → nessuna scadenza. Anche quando una data c'è, questi ordini non scadono
//                      (l'SLA ACEA è 157 giorni mediani: non governa niente).
//   RIAT / REVO      → creazione + 1 giorno. Sono le attivazioni con cardine contrattuale a
//                      1 giorno: vanno chiuse entro le 23:59 del giorno successivo.
//   resto del dunning→ creazione + 14 giorni. Copre l'SLA reale (10-11 giorni) con margine.
//
// Nell'export "Data documento" e "Data pubblicazione lavoro" coincidono su tutte le righe:
// la data di creazione è univoca e non serve sceglierne una.

import type { Famiglia } from './famiglia';

/** Giorni concessi alle attivazioni (cardine contrattuale ACEA). */
const GIORNI_ATTIVAZIONE = 1;
/** Giorni concessi al resto del dunning (soglia interna). */
const GIORNI_DUNNING = 14;
/** Codici SLA delle attivazioni. */
const SLA_ATTIVAZIONE = new Set(['RIAT', 'REVO']);

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' → epoch UTC di mezzanotte. NaN se la stringa non è una data ISO valida. */
function epochUtc(iso: string): number {
  if (!ISO.test(iso)) return NaN;
  return Date.parse(`${iso}T00:00:00Z`);
}

/** epoch UTC → 'YYYY-MM-DD'. */
function isoDa(epoch: number): string {
  return new Date(epoch).toISOString().slice(0, 10);
}

const GIORNO_MS = 86_400_000;

export type ArgomentiScadenza = {
  famiglia: Famiglia;
  codiceSla: string | null | undefined;
  dataCreazione: string | null | undefined;
};

/**
 * Scadenza dell'ordine come 'YYYY-MM-DD', oppure `null` se non ne ha una
 * (massive, o data di creazione assente/malformata).
 */
export function scadenzaOrdine({ famiglia, codiceSla, dataCreazione }: ArgomentiScadenza): string | null {
  if (famiglia === 'massive') return null;
  const base = epochUtc(String(dataCreazione ?? '').trim());
  if (Number.isNaN(base)) return null;
  const sla = String(codiceSla ?? '').trim().toUpperCase();
  const giorni = SLA_ATTIVAZIONE.has(sla) ? GIORNI_ATTIVAZIONE : GIORNI_DUNNING;
  return isoDa(base + giorni * GIORNO_MS);
}

/**
 * Giorni che mancano alla scadenza rispetto a `oggi`: positivi prima, 0 il giorno stesso,
 * negativi dopo. `null` se l'ordine non ha scadenza.
 *
 * Aritmetica interamente in UTC: con le date locali il passaggio all'ora legale sposterebbe il
 * conteggio di un giorno due volte l'anno, proprio sui filtri "scaduti".
 */
export function giorniResidui(
  scadenza: string | null | undefined,
  oggi: string,
): number | null {
  const s = epochUtc(String(scadenza ?? '').trim());
  const o = epochUtc(String(oggi ?? '').trim());
  if (Number.isNaN(s) || Number.isNaN(o)) return null;
  return Math.round((s - o) / GIORNO_MS);
}
