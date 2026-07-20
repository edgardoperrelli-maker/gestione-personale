// PURA: campi effettivi di una voce nel mondo "azioni per gruppo attività".
// Una voce generata da un task porta lo snapshot del SUO flusso (campi_snapshot per-voce);
// null/vuoto = eredita lo snapshot del rapportino (retro-compat con tutti i rapportini storici).
import type { TemplateCampo } from './buildVoci';

export type VoceConCampi = { campi?: TemplateCampo[] | null };

/** Campi effettivi della voce: i suoi (flusso del gruppo attività) o il fallback del rapportino. */
export function campiDiVoce(
  voce: VoceConCampi | null | undefined,
  fallback: TemplateCampo[],
): TemplateCampo[] {
  const propri = voce?.campi;
  return Array.isArray(propri) && propri.length > 0 ? propri : fallback;
}

/**
 * Unione ordinata dei campi per export/PDF di un rapportino con voci eterogenee:
 * prima i campi del rapportino (ordine loro), poi i campi extra per-voce in ordine di
 * apparizione; dedup per chiave; `ordine` rinumerato sequenziale (stabile per i sort a valle).
 */
export function unioneCampi(
  base: TemplateCampo[],
  perVoce: Array<TemplateCampo[] | null | undefined>,
): TemplateCampo[] {
  const out: TemplateCampo[] = [...base].sort((a, b) => a.ordine - b.ordine);
  const viste = new Set(out.map((c) => c.chiave));
  for (const campi of perVoce) {
    for (const c of [...(campi ?? [])].sort((a, b) => a.ordine - b.ordine)) {
      if (viste.has(c.chiave)) continue;
      viste.add(c.chiave);
      out.push(c);
    }
  }
  return out.map((c, i) => ({ ...c, ordine: i + 1 }));
}
