// PURA: voci che BLOCCANO l'invio del rapportino perché prive di un esito valido:
//  - 'senza_esito'  : nessun esito inserito;
//  - 'nota_mancante': esito negativo ("NO") senza la nota obbligatoria col motivo.
// ("NESSUN PASSAGGIO" è auto-esplicativo → valido senza nota; il positivo → valido.)
// Coerente con il gate client `inviabile = daFare === 0`. Esclude:
//  - voci manuali ("+") a cui un esito non è stato proprio chiesto: il loro template può non
//    dichiarare `eseguito` e pretenderlo le bloccherebbe per sempre. Se invece un esito c'è, la
//    voce è soggetta al gate come tutte: un "NO" senza il motivo blocca l'invio anche se la voce
//    è nata dal "+" (su AcquaLatina il "+" è una richiesta di assegnazione, e l'esito arriva dopo);
//  - contenitori task-via (BONIFICHE EXTRA, o TUTTE le voci nei template task-via puri): non hanno
//    esito proprio. `modalita.tutto` = template task-via puro; `modalita.ibrido` per retro-compat.
import { motivoVoceIncompleta, type MotivoIncompleto } from './voceMancante';
import { esitoDichiarato } from './voceColore';
import { contenitoreTaskVia } from '@/lib/interventi/manuali/taskVia';
import type { TemplateCampo } from './buildVoci';

export type VoceGate = {
  risposte: Record<string, unknown> | null;
  campi_snapshot?: unknown;
  attivita?: string | null;
  manuale?: boolean | null;
};
export type VoceIncompleta = { index: number; motivo: MotivoIncompleto };

export function indiciVociIncomplete(
  voci: VoceGate[],
  campiFallback: TemplateCampo[],
  modalita: { tutto?: boolean; ibrido?: boolean } = {},
): VoceIncompleta[] {
  const out: VoceIncompleta[] = [];
  voci.forEach((v, i) => {
    if (contenitoreTaskVia({ attivita: v.attivita ?? null, manuale: v.manuale ?? null }, modalita)) return;
    const campiV = Array.isArray(v.campi_snapshot) && v.campi_snapshot.length > 0
      ? (v.campi_snapshot as TemplateCampo[])
      : campiFallback;
    const risposte = v.risposte ?? {};
    if (v.manuale && esitoDichiarato(risposte, campiV) === 'nessuno') return; // "+" senza esito richiesto
    const motivo = motivoVoceIncompleta(risposte, campiV);
    if (motivo) out.push({ index: i, motivo });
  });
  return out;
}
