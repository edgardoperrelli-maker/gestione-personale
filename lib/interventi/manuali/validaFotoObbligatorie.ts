import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export interface EsitoValidazioneFoto {
  ok: boolean;
  /** Etichette degli slot obbligatori privi di foto. */
  mancanti: string[];
}

/** I soli campi del template di tipo 'foto', preservando l'ordine del template. */
export function campiFoto(campi: TemplateCampo[]): TemplateCampo[] {
  return (campi ?? []).filter((c) => c.tipo === 'foto');
}

/**
 * Verifica che ogni slot foto `obbligatoria === true` abbia una foto presente.
 * @param campi    campi del template (si filtrano i `tipo === 'foto'`)
 * @param presenti mappa `slot_chiave → boolean` (true se per quello slot c'è una foto)
 */
export function validaFotoObbligatorie(
  campi: TemplateCampo[],
  presenti: Record<string, boolean>,
): EsitoValidazioneFoto {
  const mancanti = campiFoto(campi)
    .filter((c) => c.obbligatoria === true && presenti[c.chiave] !== true)
    .map((c) => c.etichetta);
  return { ok: mancanti.length === 0, mancanti };
}
