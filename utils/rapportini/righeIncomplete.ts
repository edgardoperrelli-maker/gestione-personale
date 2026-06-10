import { campiPerScope } from './campiScope';
import type { TemplateCampo } from './buildVoci';

export type VoceLite = { id: string; via?: string | null; risposte: Record<string, unknown> | null };
export type RigaLite = { id: string; voce_id: string; matricola: string | null; risposte: Record<string, unknown> | null };
export type DettaglioIncompleto = { tipo: 'riga' | 'civico'; civico: string; matricola?: string; campiMancanti: string[] };

function fotoPresente(risposte: Record<string, unknown> | null, chiave: string): boolean {
  const v = risposte?.[chiave];
  return typeof v === 'string' && v.trim().length > 0;
}

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
    const mancanti = misObb.filter((c) => !fotoPresente(r.risposte, c.chiave)).map((c) => c.etichetta);
    if (mancanti.length) {
      const v = voceById.get(r.voce_id);
      dettagli.push({ tipo: 'riga', civico: v?.via ?? '', matricola: r.matricola ?? '', campiMancanti: mancanti });
    }
  }
  if (faseObb.length) {
    const vociConRighe = new Set(righe.map((r) => r.voce_id));
    for (const v of voci) {
      if (!vociConRighe.has(v.id)) continue;
      const mancanti = faseObb.filter((c) => !fotoPresente(v.risposte, c.chiave)).map((c) => c.etichetta);
      if (mancanti.length) dettagli.push({ tipo: 'civico', civico: v.via ?? '', campiMancanti: mancanti });
    }
  }
  return { ok: dettagli.length === 0, dettagli };
}
