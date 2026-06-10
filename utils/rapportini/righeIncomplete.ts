import { campiPerScope } from './campiScope';
import { comeArrayFoto } from './comeArrayFoto';
import type { TemplateCampo } from './buildVoci';

export type VoceLite = { id: string; via?: string | null; risposte: Record<string, unknown> | null };
export type RigaLite = { id: string; voce_id: string; matricola: string | null; risposte: Record<string, unknown> | null };
export type DettaglioIncompleto = { tipo: 'riga' | 'civico'; civico: string; matricola?: string; campiMancanti: string[] };

/** Verifica i campi foto OBBLIGATORI: misuratore→per riga, fase→per civico con righe; accessorie ignorate. */
export function righeIncomplete(
  voci: VoceLite[],
  righe: RigaLite[],
  campiSnapshot: TemplateCampo[],
): { ok: boolean; dettagli: DettaglioIncompleto[] } {
  const scope = campiPerScope(campiSnapshot);
  const misObb = scope.misuratore.filter((c) => c.obbligatoria === true);
  const faseObb = scope.fase.filter((c) => c.obbligatoria === true);
  const dettagli: DettaglioIncompleto[] = [];
  const voceById = new Map(voci.map((v) => [v.id, v]));

  for (const r of righe) {
    const mancanti = misObb.filter((c) => comeArrayFoto(r.risposte?.[c.chiave]).length === 0).map((c) => c.etichetta);
    if (mancanti.length) {
      const v = voceById.get(r.voce_id);
      dettagli.push({ tipo: 'riga', civico: v?.via ?? '', matricola: r.matricola ?? '', campiMancanti: mancanti });
    }
  }
  if (faseObb.length) {
    const vociConRighe = new Set(righe.map((r) => r.voce_id));
    for (const v of voci) {
      if (!vociConRighe.has(v.id)) continue;
      const mancanti = faseObb.filter((c) => comeArrayFoto(v.risposte?.[c.chiave]).length === 0).map((c) => c.etichetta);
      if (mancanti.length) dettagli.push({ tipo: 'civico', civico: v.via ?? '', campiMancanti: mancanti });
    }
  }
  return { ok: dettagli.length === 0, dettagli };
}
