// PURA: voci con esito NEGATIVO ma SENZA la nota obbligatoria col motivo — bloccano l'invio del
// rapportino (un "NO" senza motivo non è una chiusura valida; "NESSUN PASSAGGIO" è auto-esplicativo
// e non la richiede). Riusa motivoVoceIncompleta (unica fonte in voceMancante). Esclude:
//  - le voci manuali ("+"): sono sempre interventi veri già completi;
//  - i contenitori task-via (attività BONIFICHE EXTRA, manuale=false): non hanno esito proprio.
import { motivoVoceIncompleta } from './voceMancante';
import { isTaskVia } from '@/lib/interventi/manuali/taskVia';
import type { TemplateCampo } from './buildVoci';

export type VoceGate = {
  risposte: Record<string, unknown> | null;
  campi_snapshot?: unknown;
  attivita?: string | null;
  manuale?: boolean | null;
};

/** Indici (nell'array passato) delle voci con negativo-senza-nota. Vuoto = inviabile per questa regola. */
export function indiciNegativoSenzaNota(voci: VoceGate[], campiFallback: TemplateCampo[]): number[] {
  const out: number[] = [];
  voci.forEach((v, i) => {
    if (v.manuale) return;
    if (isTaskVia({ attivita: v.attivita ?? null })) return; // contenitore task-via: nessun esito proprio
    const campiV = Array.isArray(v.campi_snapshot) && v.campi_snapshot.length > 0
      ? (v.campi_snapshot as TemplateCampo[])
      : campiFallback;
    if (motivoVoceIncompleta(v.risposte ?? {}, campiV) === 'nota_mancante') out.push(i);
  });
  return out;
}
