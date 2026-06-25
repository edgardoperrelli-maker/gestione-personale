import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { slotFotoCondizionali, fotoSlotObbligatorio } from '@/utils/rapportini/fotoCondizionali';

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
 * Verifica che ogni slot foto obbligatorio abbia una foto presente. Uno slot è obbligatorio
 * se ha `obbligatoria === true` oppure se una condizione lo rende tale (es. "Sostituzione
 * valvola" = SI → foto "Sost. Valvola"): per questo serve anche `risposte`.
 * @param campi    campi del template (si filtrano i `tipo === 'foto'`)
 * @param presenti mappa `slot_chiave → boolean` (true se per quello slot c'è una foto)
 * @param risposte risposte compilate della voce (per le foto obbligatorie su condizione)
 */
export function validaFotoObbligatorie(
  campi: TemplateCampo[],
  presenti: Record<string, boolean>,
  risposte: Record<string, unknown> = {},
): EsitoValidazioneFoto {
  const condizionali = slotFotoCondizionali(campi, risposte);
  const mancanti = campiFoto(campi)
    .filter((c) => fotoSlotObbligatorio(c, condizionali) && presenti[c.chiave] !== true)
    .map((c) => c.etichetta);
  return { ok: mancanti.length === 0, mancanti };
}
