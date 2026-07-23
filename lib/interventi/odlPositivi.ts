// lib/interventi/odlPositivi.ts
// PURO: invariante "un ODL con esito POSITIVO è definitivamente chiuso".
// - un positivo non può ripetersi (né lo stesso giorno né nei giorni successivi);
// - dopo un positivo l'ODL non è rilavorabile nemmeno come negativo;
// - dopo un esito NEGATIVO la riassegnazione resta permessa.
// Enforcement su tre livelli: pianificazione (planInterventi), generazione voci
// (sincronizzaRapportini), chiusura all'invio (decidiChiusuraConPositivi) + indice
// unico parziale a DB (migration odl_positivo_definitivo).
import { siNo } from './storico/normalizza';

export function normOdl(v: string | null | undefined): string {
  return String(v ?? '').trim().toLowerCase();
}

/** true se le risposte di una voce rappresentano un esito positivo (eseguito = SI). */
export function vocePositiva(risposte: Record<string, unknown> | null | undefined): boolean {
  return siNo((risposte ?? {})['eseguito']) === 'SI';
}

/** Set (normalizzato) degli ODL, scartando i vuoti. */
export function setOdl(odls: Array<string | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const o of odls) {
    const k = normOdl(o);
    if (k) out.add(k);
  }
  return out;
}

export type PositivoOriginale = { id: string; data: string | null };

export function chiavePositivo(committente: string | null | undefined, odl: string | null | undefined): string {
  return `${(committente ?? 'acea').trim().toLowerCase()}|${normOdl(odl)}`;
}

/**
 * Indicizza i positivi esistenti per (committente, odl) tenendo l'ORIGINALE:
 * il più vecchio per data (a parità, id minore per determinismo).
 */
export function indicizzaPositivi(
  rows: Array<{ id: string; odl: string | null; data: string | null; committente?: string | null }>,
): Map<string, PositivoOriginale> {
  const map = new Map<string, PositivoOriginale>();
  for (const r of rows) {
    if (!normOdl(r.odl)) continue;
    const k = chiavePositivo(r.committente, r.odl);
    const cur = map.get(k);
    const dNew = r.data ?? '9999-12-31';
    const dCur = cur ? (cur.data ?? '9999-12-31') : '';
    if (!cur || dNew < dCur || (dNew === dCur && r.id < cur.id)) map.set(k, { id: r.id, data: r.data });
  }
  return map;
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' (input inatteso → stringa originale o '—'). */
export function dataIt(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return (iso ?? '').trim() || '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Dettaglio di un ODL escluso perché già positivo altrove, per i messaggi all'ufficio. */
export type OdlBloccatoDettaglio = { odl: string; data: string | null; esecutore: string | null };

/** "912350341 → già positivo il 21/07/2026 (CIARALLO SIMONE)" (data/esecutore se noti). */
export function labelOdlBloccato(d: OdlBloccatoDettaglio): string {
  const quando = d.data ? ` il ${dataIt(d.data)}` : '';
  const chi = d.esecutore ? ` (${d.esecutore})` : '';
  return `${d.odl} → già positivo${quando}${chi}`;
}

/** Dettagli dei soli odl bloccati (dedup per normOdl), nell'ordine dei bloccati. */
export function dettagliOdlBloccati(
  odlBloccati: string[],
  positiviInfo: ReadonlyMap<string, { data: string | null; esecutore: string | null }>,
): OdlBloccatoDettaglio[] {
  const visti = new Set<string>();
  const out: OdlBloccatoDettaglio[] = [];
  for (const odl of odlBloccati) {
    const k = normOdl(odl);
    if (!k || visti.has(k)) continue;
    visti.add(k);
    const pos = positiviInfo.get(k);
    out.push({ odl: odl.trim(), data: pos?.data ?? null, esecutore: pos?.esecutore ?? null });
  }
  return out;
}

export type DecisioneChiusura =
  | { tipo: 'normale' }
  | { tipo: 'annulla_doppio_positivo'; rifId: string; motivo: string }
  | { tipo: 'chiudi_e_riconcilia'; rifId: string };

/**
 * Decide la chiusura di un intervento quando lo stesso ODL ha già un positivo ALTROVE:
 * - nuova chiusura POSITIVA → l'intervento va ANNULLATO e marcato da_riconciliare
 *   (il doppio positivo non è un flusso reale: l'originale resta l'unico valido);
 * - chiusura NEGATIVA → chiude normalmente ma marca da_riconciliare (visita non
 *   dovuta: l'ODL era già chiuso);
 * - nessun positivo altrove (o il positivo è QUESTO intervento, es. re-invio) → normale.
 */
export function decidiChiusuraConPositivi(args: {
  interventoId: string;
  esitoPositivo: boolean;
  originale: PositivoOriginale | null | undefined;
}): DecisioneChiusura {
  const { interventoId, esitoPositivo, originale } = args;
  if (!originale || originale.id === interventoId) return { tipo: 'normale' };
  if (esitoPositivo) {
    return {
      tipo: 'annulla_doppio_positivo',
      rifId: originale.id,
      motivo: `DOPPIO POSITIVO: ODL già eseguito positivo il ${dataIt(originale.data)}`,
    };
  }
  return { tipo: 'chiudi_e_riconcilia', rifId: originale.id };
}

export type TaskVoce = { id: string; odl?: string | null };

/**
 * Decide quali task del piano NON devono generare la voce di rapportino:
 * - ODL con positivo altrove (`odlGiaPositivi`) → il lavoro non va riproposto all'operatore;
 * - ODL già consumato da un altro task dello stesso piano (`vistiOdl`, condiviso tra
 *   operatori) → doppione interno (es. stesso ODL da import file + da template).
 * Una voce ESISTENTE già compilata non si salta mai: la rigenerazione di un piano
 * storico non deve cancellare il lavoro registrato; consuma comunque il suo ODL.
 */
export function taskDaSaltare(args: {
  tasks: TaskVoce[];
  odlGiaPositivi: ReadonlySet<string>;
  vistiOdl: Set<string>;
  voceCompilata: (taskId: string) => boolean;
}): { salta: Set<string>; odlBloccati: string[] } {
  const { tasks, odlGiaPositivi, vistiOdl, voceCompilata } = args;
  const salta = new Set<string>();
  const odlBloccati: string[] = [];
  // 1ª passata: le voci compilate reclamano il proprio ODL (non si toccano mai).
  for (const t of tasks) {
    if (!voceCompilata(t.id)) continue;
    const k = normOdl(t.odl);
    if (k) vistiOdl.add(k);
  }
  // 2ª passata: le non compilate — bloccate se positivo altrove o ODL già consumato.
  for (const t of tasks) {
    if (voceCompilata(t.id)) continue;
    const k = normOdl(t.odl);
    if (!k) continue;
    if (odlGiaPositivi.has(k)) {
      salta.add(t.id);
      odlBloccati.push((t.odl ?? '').trim());
      continue;
    }
    if (vistiOdl.has(k)) {
      salta.add(t.id);
      continue;
    }
    vistiOdl.add(k);
  }
  return { salta, odlBloccati };
}
