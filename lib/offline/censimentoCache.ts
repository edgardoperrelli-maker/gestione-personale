// Cache locale dei censimenti consultabili dal campo, per committente.
//
// Le due fonti hanno tabelle diverse ma le route rispondono con la stessa forma, quindi il
// client di download è UNO solo, parametrizzato. Lo store IndexedDB è `dbCensimento`, che è
// indicizzato per chiave arbitraria: i due censimenti convivono sullo stesso dispositivo.
//
// La chiave 'acea' è deliberatamente la STESSA che usa `lib/offline/censimento.ts`: quel
// modulo resta in piedi come rete di sicurezza (parte al passo «Cerca matricola») e legge
// il record che questo scrive. Scrivono la stessa forma, sono lo stesso dato.
//
// La cache è ciò che decide se si può lavorare offline: quando c'è, «non censito» è una
// prova; quando manca, è ignoranza. Per questo si scrive SOLO a download completo.
import { dbCensimento, indexedDbDisponibile } from './db';
import type { CommittenteCensimento } from '@/lib/rapportini/perimetroCensimento';

/** Righe per pagina del download. Allineata al taglio di PostgREST (1000). */
export const PAGINA_CENSIMENTO = 1000;

type Fonte = { chiave: string; endpoint: string; etichetta: string };

const FONTI: Record<CommittenteCensimento, Fonte> = {
  acea: { chiave: 'acea', endpoint: 'censimento', etichetta: 'ACEA' },
  acqualatina: { chiave: 'acqualatina', endpoint: 'censimento-master', etichetta: 'AcquaLatina' },
};

/** Nome del committente come va scritto all'operatore. */
export function etichettaCensimento(committente: CommittenteCensimento): string {
  return FONTI[committente].etichetta;
}

export type CensimentoLocale = { versione: string; righe: unknown[]; scaricatoIl: number };

export async function leggiCensimentoLocalePer(
  committente: CommittenteCensimento,
): Promise<CensimentoLocale | undefined> {
  if (!indexedDbDisponibile()) return undefined;
  try {
    const rec = await dbCensimento.leggi(FONTI[committente].chiave);
    return rec ? { versione: rec.versione, righe: rec.righe, scaricatoIl: rec.scaricatoIl } : undefined;
  } catch {
    return undefined;
  }
}

export type MetaCensimento = { unchanged: boolean; versione: string; totale: number };

/**
 * Quanto c'è da scaricare, senza scaricarlo: due query e ~40 byte di risposta. Si chiama a
 * OGNI apertura del link, ed è per questo che può restare silenzioso — la modale la si apre
 * solo quando questo dice che c'è del lavoro.
 * null = non si sa (offline, errore, IndexedDB assente) → nessuna modale.
 */
export async function metaCensimento(
  token: string,
  committente: CommittenteCensimento,
): Promise<MetaCensimento | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  try {
    const locale = await leggiCensimentoLocalePer(committente);
    const url = `/api/r/${token}/${FONTI[committente].endpoint}?meta=1&v=${encodeURIComponent(locale?.versione ?? '')}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as MetaCensimento;
  } catch {
    return null;
  }
}

export type EsitoScarico =
  | { ok: true; righe: number }
  | { ok: false; scaricate: number; motivo: 'rete' | 'versione_cambiata' };

/**
 * Scarica il censimento pagina per pagina, riportando l'avanzamento a ogni pagina.
 *
 * Pagine SEQUENZIALI, non parallele: su 4G in campo il parallelismo peggiora la latenza
 * percepita e fa avanzare la barra a strappi.
 *
 * Il salvataggio avviene SOLO a ciclo completo. Una cache parziale sarebbe la cosa peggiore
 * possibile: il blocco «misuratore non censito» si fida della cache quando c'è, quindi mezzo
 * censimento bloccherebbe misuratori regolarmente a catalogo — e l'operatore non avrebbe
 * modo di accorgersene.
 */
export async function scaricaCensimento(
  token: string,
  committente: CommittenteCensimento,
  versione: string,
  totale: number,
  onProgresso: (fatte: number) => void,
): Promise<EsitoScarico> {
  const fonte = FONTI[committente];
  const righe: unknown[] = [];
  const v = encodeURIComponent(versione);
  for (let from = 0; from < totale; from += PAGINA_CENSIMENTO) {
    const to = Math.min(from + PAGINA_CENSIMENTO, totale) - 1;
    let res: Response;
    try {
      res = await fetch(`/api/r/${token}/${fonte.endpoint}?from=${from}&to=${to}&v=${v}`);
    } catch {
      return { ok: false, scaricate: righe.length, motivo: 'rete' };
    }
    // 409 = un import è atterrato mentre scaricavamo: le pagine sarebbero di due dataset
    // diversi. Meglio ripartire che cucire insieme due censimenti.
    if (res.status === 409) return { ok: false, scaricate: righe.length, motivo: 'versione_cambiata' };
    if (!res.ok) return { ok: false, scaricate: righe.length, motivo: 'rete' };
    const j = (await res.json()) as { righe?: unknown[] };
    righe.push(...(j.righe ?? []));
    onProgresso(righe.length);
    // Pagina più corta del previsto: il dataset è finito prima del `totale` annunciato.
    if ((j.righe?.length ?? 0) < to - from + 1) break;
  }
  if (!indexedDbDisponibile()) return { ok: true, righe: righe.length };
  try {
    await dbCensimento.salva({ chiave: fonte.chiave, versione, righe, scaricatoIl: Date.now() });
  } catch {
    /* best-effort: la ricerca online funziona comunque */
  }
  return { ok: true, righe: righe.length };
}
