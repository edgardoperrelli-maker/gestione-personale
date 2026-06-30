// Deriva la "voce" ACEA (10=EL, 11=ES, 12=ERC, 6=ERA) dal testo dell'attività
// ("Operazione testo breve" del master DUNNING / interventi.intervento_tipo).
//
// Serve perché `interventi.voce` NON è popolata in modo affidabile dall'import: la voce va dedotta
// dal testo. Le attività non classificabili tornano `null` → l'audit le segnala come VOCE_NON_RISOLTA
// (mai conteggio silenzioso). Euristiche modellate su lib/performance/shape.ts (normalizeMacroAttivita).
import { VOCE_KPI } from '@/lib/interventi/kpiAggregation';
import type { KpiCode } from '@/lib/premialita/acea';

export type Voce = 10 | 11 | 12 | 6;

/** Normalizza: maiuscolo, senza accenti, spazi collassati. */
function norm(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // rimuove i diacritici
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function voceDaAttivita(testo: string | null | undefined): Voce | null {
  const t = norm(String(testo ?? ''));
  if (!t) return null;
  // ABUSIVO prima di tutto: "RIMOZIONE CONTATORE ABUSIVO" è ERA, non ERC.
  if (t.includes('ABUSIV')) return 6; // ERA
  if (t.includes('LIMITAZ')) return 10; // EL
  if (t.includes('SOSPENS')) return 11; // ES
  if (
    (t.includes('RIMOZ') || t.includes('RIMOSS')) &&
    (t.includes('CONTATORE') || t.includes('MISURATORE'))
  ) {
    return 12; // ERC
  }
  return null; // non classificabile → VOCE_NON_RISOLTA
}

/** Codice KPI (EL/ES/ERC/ERA) per una voce numerica. */
export function kpiCode(voce: Voce): KpiCode {
  return VOCE_KPI[voce];
}
