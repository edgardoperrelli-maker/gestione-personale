import { dbCensimento, indexedDbDisponibile } from './db';
import type { CensitoMisuratore } from '@/lib/limitazione/autofillAnagrafica';

/** Chiave STABILE della cache (non il token del giorno → riuso cross-giorno). */
const CHIAVE = 'acea';

export async function leggiCensimentoLocale(): Promise<{ versione: string; righe: CensitoMisuratore[] } | undefined> {
  if (!indexedDbDisponibile()) return undefined;
  try {
    const rec = await dbCensimento.leggi(CHIAVE);
    if (!rec) return undefined;
    return { versione: rec.versione, righe: rec.righe as CensitoMisuratore[] };
  } catch {
    return undefined;
  }
}

export async function salvaCensimentoLocale(versione: string, righe: CensitoMisuratore[], now: number): Promise<void> {
  if (!indexedDbDisponibile()) return;
  try {
    await dbCensimento.salva({ chiave: CHIAVE, versione, righe, scaricatoIl: now });
  } catch {
    /* best-effort */
  }
}

/**
 * Allinea la cache locale col server (best-effort, solo ONLINE): manda la versione locale;
 * se invariata non scarica nulla, altrimenti salva la nuova proiezione. No-op offline /
 * senza IndexedDB / su errore. NON lancia mai.
 */
export async function aggiornaCensimento(token: string): Promise<void> {
  if (!indexedDbDisponibile()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    const locale = await leggiCensimentoLocale();
    const v = locale?.versione ?? '';
    const res = await fetch(`/api/r/${token}/censimento?v=${encodeURIComponent(v)}`);
    if (!res.ok) return;
    const j = (await res.json()) as
      | { unchanged: true; versione: string }
      | { unchanged: false; versione: string; righe: CensitoMisuratore[] };
    if (j.unchanged) return;
    await salvaCensimentoLocale(j.versione, j.righe, Date.now());
  } catch {
    /* best-effort */
  }
}
