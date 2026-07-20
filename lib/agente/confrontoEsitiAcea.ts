// lib/agente/confrontoEsitiAcea.ts
// PURO: confronto bidirezionale tra i positivi del nostro DB e lo stato del portale ACEA
// (acea_portale_snapshot, consegnato dall'agente a ogni "Aggiorna stato ODL").
// Solo report, nessuna scrittura. Decisioni (grigliata 20/07):
// - positivo ACEA = stato COMPLETATO + causa di scostamento remunerata (inizia per E),
//   riusando isCompletato/scostamentoPagato della produzione economica;
// - COMPLETATO con causale VUOTA = "ok_causale_assente" (non silenziosamente pagata);
// - positivo DB = intervento eseguito_positivo OPPURE voce rapportino SI (il chiamante
//   costruisce l'elenco: vedi API confronto-esiti);
// - default sulla finestra corrente dell'agente, con modalità storico completo.
import { normalizzaStatoPortale, scostamentoPagato } from '@/lib/produzione/statoPortale';
import { normOdl } from '@/lib/interventi/odlPositivi';

export type SnapshotRow = {
  odl: string | null;
  stato_norm: string | null;
  causa_scostamento: string | null;
  run_id: string | null;
  raccolto_at: string | null;
  operatore?: string | null;
};

export type PositivoDb = { odl: string; data: string | null };

export type EsitoConfrontoAcea =
  | 'ok'
  | 'ok_causale_assente'
  | 'nostro_carico'
  | 'non_consuntivato'
  | 'non_in_export';

export type RigaDbVersoAcea = {
  odl: string;
  dataDb: string | null;
  esito: EsitoConfrontoAcea;
  statoAcea: string | null;
  causa: string | null;
};

export type RigaAceaVersoDb = { odl: string; operatore: string | null };

export type ConfrontoEsiti = {
  dbVersoAcea: {
    totale: number;
    conteggi: Record<EsitoConfrontoAcea, number>;
    /** solo le righe NON allineate (gli 'ok' restano un conteggio). */
    righe: RigaDbVersoAcea[];
  };
  aceaVersoDb: {
    totale: number;
    ok: number;
    /** ACEA positivo, noi l'abbiamo lavorato ma senza positivo. */
    mancanti: RigaAceaVersoDb[];
    /** ACEA positivo, ODL mai comparso nell'app (lavori pre-app / mai pianificati qui). */
    maiVisti: RigaAceaVersoDb[];
  };
};

/** Classifica un positivo DB rispetto alla riga snapshot del suo ODL (4 esiti + causale assente). */
export function classificaPositivoDb(snap: SnapshotRow | undefined): EsitoConfrontoAcea {
  if (!snap) return 'non_in_export';
  if (normalizzaStatoPortale(snap.stato_norm) !== 'COMPLETATO') return 'non_consuntivato';
  const causa = String(snap.causa_scostamento ?? '').trim();
  if (causa === '') return 'ok_causale_assente';
  return scostamentoPagato(causa) ? 'ok' : 'nostro_carico';
}

/** true se la riga snapshot rappresenta un positivo ACEA (COMPLETATO + causale remunerata E). */
export function aceaPositiva(snap: SnapshotRow): boolean {
  if (normalizzaStatoPortale(snap.stato_norm) !== 'COMPLETATO') return false;
  const causa = String(snap.causa_scostamento ?? '').trim();
  return causa !== '' && scostamentoPagato(causa);
}

/** Indice odl(norm) → riga snapshot. In caso di doppioni (non dovrebbero: PK odl) vince la prima. */
export function indicizzaSnapshot(rows: SnapshotRow[]): Map<string, SnapshotRow> {
  const m = new Map<string, SnapshotRow>();
  for (const r of rows) {
    const k = normOdl(r.odl);
    if (k && !m.has(k)) m.set(k, r);
  }
  return m;
}

/** run_id dell'ultimo giro (la riga con raccolto_at massimo); null se snapshot vuoto. */
export function runIdUltimoGiro(rows: SnapshotRow[]): string | null {
  let best: SnapshotRow | null = null;
  for (const r of rows) {
    if (!best || String(r.raccolto_at ?? '') > String(best.raccolto_at ?? '')) best = r;
  }
  return best?.run_id ?? null;
}

export function confrontaEsiti(args: {
  /** positivi DB (odl grezzo + data più recente), GIÀ filtrati per finestra dal chiamante se richiesto. */
  positiviDb: PositivoDb[];
  /** intero snapshot portale. */
  snapshot: SnapshotRow[];
  /** odl (norm) di TUTTI i positivi DB senza filtro finestra: evita falsi "mancanti" su lavori vecchi. */
  positiviDbTutti: ReadonlySet<string>;
  /** odl (norm) conosciuti dall'app (interventi/voci, qualsiasi esito): separa "mancante" da "mai visto". */
  odlConosciuti: ReadonlySet<string>;
}): ConfrontoEsiti {
  const { positiviDb, snapshot, positiviDbTutti, odlConosciuti } = args;
  const byOdl = indicizzaSnapshot(snapshot);
  const ultimoRun = runIdUltimoGiro(snapshot);

  const conteggi: Record<EsitoConfrontoAcea, number> = {
    ok: 0, ok_causale_assente: 0, nostro_carico: 0, non_consuntivato: 0, non_in_export: 0,
  };
  const righe: RigaDbVersoAcea[] = [];
  const vistiDb = new Set<string>();
  for (const p of positiviDb) {
    const k = normOdl(p.odl);
    if (!k || vistiDb.has(k)) continue;
    vistiDb.add(k);
    const snap = byOdl.get(k);
    const esito = classificaPositivoDb(snap);
    conteggi[esito] += 1;
    if (esito !== 'ok') {
      righe.push({
        odl: p.odl.trim(),
        dataDb: p.data,
        esito,
        statoAcea: snap?.stato_norm ?? null,
        causa: snap ? (String(snap.causa_scostamento ?? '').trim() || null) : null,
      });
    }
  }
  righe.sort((a, b) => (b.dataDb ?? '').localeCompare(a.dataDb ?? '') || a.odl.localeCompare(b.odl));

  // ACEA → DB: solo le righe dell'ULTIMO giro (le stale di giri vecchi non sono più verificabili).
  let ok = 0;
  const mancanti: RigaAceaVersoDb[] = [];
  const maiVisti: RigaAceaVersoDb[] = [];
  const vistiAcea = new Set<string>();
  for (const s of snapshot) {
    if (ultimoRun != null && s.run_id !== ultimoRun) continue;
    if (!aceaPositiva(s)) continue;
    const k = normOdl(s.odl);
    if (!k || vistiAcea.has(k)) continue;
    vistiAcea.add(k);
    if (positiviDbTutti.has(k)) { ok += 1; continue; }
    const riga: RigaAceaVersoDb = { odl: String(s.odl ?? '').trim(), operatore: s.operatore ?? null };
    if (odlConosciuti.has(k)) mancanti.push(riga);
    else maiVisti.push(riga);
  }
  mancanti.sort((a, b) => a.odl.localeCompare(b.odl));
  maiVisti.sort((a, b) => a.odl.localeCompare(b.odl));

  return {
    dbVersoAcea: { totale: vistiDb.size, conteggi, righe },
    aceaVersoDb: { totale: vistiAcea.size, ok, mancanti, maiVisti },
  };
}
