import { valoreInfo, type TemplateInfoCampo, type VoceInfo } from './infoCampi';
import type { TemplateCampo } from './buildVoci';

/** true se il valore di un campo template è "popolato" (le crocette contano solo se true). */
export function campoHaValore(tipo: string, val: unknown): boolean {
  if (tipo === 'crocetta') return val === true;
  return val != null && String(val).trim() !== '';
}

export type VoceColonne = VoceInfo & { risposte?: Record<string, unknown> | null };

/** Filtra info e campi mantenendo solo le colonne popolate in almeno una voce. */
export function colonneVisibili(
  info: TemplateInfoCampo[],
  campi: TemplateCampo[],
  voci: VoceColonne[],
): { info: TemplateInfoCampo[]; campi: TemplateCampo[] } {
  const infoVis = info.filter((c) => voci.some((v) => valoreInfo(v, c.chiave) !== ''));
  const campiVis = campi.filter((c) =>
    voci.some((v) => campoHaValore(c.tipo, (v.risposte ?? {})[c.chiave])),
  );
  return { info: infoVis, campi: campiVis };
}
