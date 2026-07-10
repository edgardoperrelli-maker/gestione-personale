// PURA: SAL ufficiali ACEA (file "SAL N.xlsx" della cartella CONTABILITA'). Ingestione
// (preparaRigheSal), riepilogo per SAL (riepilogoUnSal), e le chiavi di aggancio usate dal
// loader per calcolare Pre-SAL/Fuori SAL (odlPagatiDaSal, chiaveSalEffettiva).
import { dataDaRaw } from './dataDaRaw';

export interface SalRigaGrezza {
  odl?: string;
  docAcquisti?: string;
  posizione?: string;
  valoreAps?: number;
  causa?: string;
  attivita?: string;
  dataCompletamentoRaw?: string;
  dataRegistrazioneRaw?: string;
}

export interface SalRigaDb {
  sal_n: number;
  odl: string;
  doc_acquisti: string;
  posizione: string;
  valore: number;
  causa: string | null;
  attivita: string | null;
  data_completamento: string | null;
  data_registrazione: string | null;
}

/** Mappa le righe grezze lette dall'agente (leggiSal.mjs) alle righe da inserire in acea_sal.
 *  Dedup per (doc_acquisti, posizione) — chiave naturale SAP; scarta le righe senza Ordine. */
export function preparaRigheSal(salN: number, grezze: SalRigaGrezza[]): SalRigaDb[] {
  const seen = new Set<string>();
  const out: SalRigaDb[] = [];
  for (const g of grezze ?? []) {
    const odl = (g.odl ?? '').trim();
    if (!odl) continue;
    const docAcquisti = (g.docAcquisti ?? '').trim();
    const posizione = (g.posizione ?? '').trim();
    const chiave = `${docAcquisti}|${posizione}`;
    if (seen.has(chiave)) continue;
    seen.add(chiave);
    out.push({
      sal_n: salN,
      odl,
      doc_acquisti: docAcquisti,
      posizione,
      valore: Number.isFinite(g.valoreAps) ? Number(g.valoreAps) : 0,
      causa: (g.causa ?? '').trim() || null,
      attivita: (g.attivita ?? '').trim() || null,
      data_completamento: dataDaRaw(g.dataCompletamentoRaw),
      data_registrazione: dataDaRaw(g.dataRegistrazioneRaw),
    });
  }
  return out;
}

export interface SalStorico {
  n: number;
  mese: string; // 'YYYY-MM', '' se nessuna data
  ordini: number;
  valoreAps: number;
  valoreListino: number;
  deltaListino: number;
  odlSconosciuti: number;
}

export interface SalRigaArricchita extends SalRigaDb {
  valoreListino: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Riepiloga un SAL (righe già arricchite col valore-listino). `odlConosciuti`: ODL presenti in
 *  DB, master o portale (conteggio "sconosciuti a noi" — controllo leggero, non un audit per-ODL). */
export function riepilogoUnSal(righe: SalRigaArricchita[], odlConosciuti: Set<string>): SalStorico {
  const n = righe[0]?.sal_n ?? 0;
  const mesi = righe.map((r) => r.data_completamento).filter((d): d is string => !!d).sort();
  const valoreAps = round2(righe.reduce((s, r) => s + r.valore, 0));
  const valoreListino = round2(righe.reduce((s, r) => s + r.valoreListino, 0));
  return {
    n,
    mese: mesi.length > 0 ? mesi[0].slice(0, 7) : '',
    ordini: righe.length,
    valoreAps,
    valoreListino,
    deltaListino: round2(valoreAps - valoreListino),
    odlSconosciuti: righe.filter((r) => !odlConosciuti.has(r.odl)).length,
  };
}

/** Set degli ODL già presenti in almeno un SAL caricato (per il pre-SAL: esitati non ancora pagati). */
export function odlPagatiDaSal(righeSal: Array<{ odl: string }>): Set<string> {
  return new Set(righeSal.map((r) => r.odl.trim()).filter(Boolean));
}

/** Chiave "portale" effettiva di una riga di produzione, per il check pre-SAL/fuori-SAL: le
 *  saracinesche (attivitaKey === saracinescaKey) valgono per l'Odl FIGLIO (quello consuntivato sul
 *  portale), non per l'odl padre della limitazione scritto in riga. '' se non risolvibile
 *  (saracinesca "DA CHIEDERE", mai ordinata). */
export function chiaveSalEffettiva(
  riga: { odl: string; attivitaKey: string },
  saracinescaKey: string,
  saracinescaFiglioByParent: Map<string, string>,
): string {
  if (riga.attivitaKey === saracinescaKey) return saracinescaFiglioByParent.get(riga.odl) ?? '';
  return riga.odl;
}
