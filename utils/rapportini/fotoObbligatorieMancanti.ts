import { isPlaceholderFoto } from '@/lib/offline/fotoPlaceholder';
import { comeArrayFoto } from '@/utils/rapportini/comeArrayFoto';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { campiDiVoce } from '@/utils/rapportini/campiDiVoce';
import { slotFotoCondizionali, fotoSlotObbligatorio } from '@/utils/rapportini/fotoCondizionali';
import { attivitaMassiva } from '@/utils/rapportini/attivitaMassiva';
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
 *
 * `fotoSoloMassive` (template "Ibrido acea"): le foto sono obbligatorie SOLO per le voci
 * di limitazione massiva; per le altre attività (sospensioni/limitazioni) non lo sono.
 */
export function contaFotoObbligatorieMancanti(
  voci: Array<{ risposte: Record<string, unknown> | null; manuale?: boolean; attivita?: string | null; campi?: TemplateCampo[] | null }>,
  campi: TemplateCampo[],
  fotoSoloMassive = false,
): number {
  let n = 0;
  for (const v of voci) {
    if (v.manuale) continue; // creata dal "+": le foto sono già nella richiesta, non nel template pianificato
    if (fotoSoloMassive && !attivitaMassiva(v.attivita)) continue; // ibrido: solo le massive richiedono foto
    // I campi da valutare sono quelli DELLA voce (flusso del suo gruppo attività, fallback rapportino).
    const base = campiDiVoce(v, campi);
    const campiFotoTpl = base.filter((c) => c.tipo === 'foto');
    if (campiFotoTpl.length === 0) continue;
    const risposte = v.risposte ?? {};
    if (haEsitoNegativo(risposte, base)) continue; // esito negativo → foto non obbligatorie
    // L'obbligo può dipendere dalle risposte (es. "Sostituzione valvola" = SI → foto valvola).
    const condizionali = slotFotoCondizionali(base, risposte);
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
 * Stessa logica di `contaFotoObbligatorieMancanti` (salta manuali, esiti negativi e — con
 * `fotoSoloMassive` — le voci non massive), ma ritorna QUALI task e QUALI tipologie di foto
 * mancano, per mostrarlo all'operatore.
 */
export function fotoObbligatorieMancantiDettaglio(
  voci: Array<VoceInfo & { risposte: Record<string, unknown> | null; manuale?: boolean; campi?: TemplateCampo[] | null }>,
  campi: TemplateCampo[],
  titoloCampi: InfoChiave[] = [],
  fotoSoloMassive = false,
): FotoMancanteVoce[] {
  const out: FotoMancanteVoce[] = [];
  voci.forEach((v, index) => {
    if (v.manuale) return;
    if (fotoSoloMassive && !attivitaMassiva(v.attivita)) return; // ibrido: solo le massive richiedono foto
    // I campi da valutare sono quelli DELLA voce (flusso del suo gruppo attività, fallback rapportino).
    const base = campiDiVoce(v, campi);
    const campiFotoTpl = base.filter((c) => c.tipo === 'foto');
    if (campiFotoTpl.length === 0) return;
    const risposte = v.risposte ?? {};
    if (haEsitoNegativo(risposte, base)) return;
    const condizionali = slotFotoCondizionali(base, risposte);
    const tipi = campiFotoTpl
      .filter((c) => fotoSlotObbligatorio(c, condizionali) && fotoVuota(risposte[c.chiave]))
      .map((c) => c.etichetta);
    if (tipi.length > 0) out.push({ index, titolo: titoloVoce(v, titoloCampi, index), tipi });
  });
  return out;
}
