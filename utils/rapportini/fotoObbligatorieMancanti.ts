import { isPlaceholderFoto } from '@/lib/offline/fotoPlaceholder';
import { comeArrayFoto } from '@/utils/rapportini/comeArrayFoto';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { slotFotoCondizionali, fotoSlotObbligatorio } from '@/utils/rapportini/fotoCondizionali';
import { haEsitoNegativo } from '@/utils/rapportini/voceColore';
import { titoloVoce, type VoceInfo, type InfoChiave } from '@/utils/rapportini/infoCampi';

/** True se il campo foto è "vuoto": nessun path reale e nessun segnaposto. */
function fotoVuota(valore: unknown): boolean {
  if (isPlaceholderFoto(valore)) return false;
  if (Array.isArray(valore) && valore.some(isPlaceholderFoto)) return false;
  return comeArrayFoto(valore).length === 0;
}

/**
 * Conta, su tutte le voci, le foto OBBLIGATORIE mai scattate (campo vuoto).
 * I segnaposto `blob-locale:` NON contano: la foto c'è, sta solo salendo.
 */
export function contaFotoObbligatorieMancanti(
  voci: Array<{ risposte: Record<string, unknown> | null; manuale?: boolean }>,
  campi: TemplateCampo[],
): number {
  const campiFotoTpl = campi.filter((c) => c.tipo === 'foto');
  if (campiFotoTpl.length === 0) return 0;
  let n = 0;
  for (const v of voci) {
    if (v.manuale) continue; // creata dal "+": le foto sono già nella richiesta, non nel template pianificato
    const risposte = v.risposte ?? {};
    if (haEsitoNegativo(risposte, campi)) continue; // esito negativo → foto non obbligatorie
    // L'obbligo può dipendere dalle risposte (es. "Sostituzione valvola" = SI → foto valvola).
    const condizionali = slotFotoCondizionali(campi, risposte);
    for (const c of campiFotoTpl) {
      if (!fotoSlotObbligatorio(c, condizionali)) continue;
      if (fotoVuota(risposte[c.chiave])) n += 1;
    }
  }
  return n;
}

/** Una voce con foto obbligatorie mancanti: titolo del task + tipologie di foto mancanti. */
export interface FotoMancanteVoce {
  index: number;
  titolo: string;
  tipi: string[];
}

/**
 * Dettaglio delle foto obbligatorie mancanti, raggruppato per voce (task).
 * Stessa logica di `contaFotoObbligatorieMancanti` (salta manuali ed esiti negativi),
 * ma ritorna QUALI task e QUALI tipologie di foto mancano, per mostrarlo all'operatore.
 */
export function fotoObbligatorieMancantiDettaglio(
  voci: Array<VoceInfo & { risposte: Record<string, unknown> | null; manuale?: boolean }>,
  campi: TemplateCampo[],
  titoloCampi: InfoChiave[] = [],
): FotoMancanteVoce[] {
  const campiFotoTpl = campi.filter((c) => c.tipo === 'foto');
  if (campiFotoTpl.length === 0) return [];
  const out: FotoMancanteVoce[] = [];
  voci.forEach((v, index) => {
    if (v.manuale) return;
    const risposte = v.risposte ?? {};
    if (haEsitoNegativo(risposte, campi)) return;
    const condizionali = slotFotoCondizionali(campi, risposte);
    const tipi = campiFotoTpl
      .filter((c) => fotoSlotObbligatorio(c, condizionali) && fotoVuota(risposte[c.chiave]))
      .map((c) => c.etichetta);
    if (tipi.length > 0) out.push({ index, titolo: titoloVoce(v, titoloCampi, index), tipi });
  });
  return out;
}
