import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { campiObbligatoriMancanti } from '@/lib/interventi/manuali/campiObbligatoriMancanti';
import { attivitaMassiva, campoObbligatorioSoloMassive } from '@/utils/rapportini/attivitaMassiva';
import { campiDiVoce } from '@/utils/rapportini/campiDiVoce';
import { haEsitoNegativo } from '@/utils/rapportini/voceColore';
import { titoloVoce, type VoceInfo, type InfoChiave } from '@/utils/rapportini/infoCampi';

/** Una voce con campi NON-foto obbligatori vuoti: titolo del task + etichette dei campi mancanti. */
export interface CampoMancanteVoce {
  index: number;
  titolo: string;
  campi: string[];
}

/**
 * Dettaglio dei campi NON-foto obbligatori vuoti, per voce (task). Parallelo a
 * `fotoObbligatorieMancantiDettaglio`: salta le voci manuali (create dal "+"). Riusa
 * `campiObbligatoriMancanti`, che filtra già `tipo !== 'foto'`: le foto non entrano mai qui.
 *
 * `fotoSoloMassive` (template "Ibrido acea"): sulle voci NON massive i campi obbligatori
 * "solo massive" (oggi SIGILLO) non sono richiesti — come nel template LIMITAZIONI/SOSPENSIONI.
 * Gli altri obbligatori (es. ESEGUITO) restano richiesti su tutte le voci.
 */
export function campiObbligatoriMancantiVoci(
  voci: Array<VoceInfo & { risposte: Record<string, unknown> | null; manuale?: boolean; campi?: TemplateCampo[] | null }>,
  campi: TemplateCampo[],
  titoloCampi: InfoChiave[] = [],
  fotoSoloMassive = false,
): CampoMancanteVoce[] {
  const out: CampoMancanteVoce[] = [];
  voci.forEach((v, index) => {
    if (v.manuale) return;
    // I campi da valutare sono quelli DELLA voce (flusso del suo gruppo attività, fallback rapportino).
    const base = campiDiVoce(v, campi);
    // Esito negativo → i campi della lavorazione (sigillo, lettura, …) NON sono obbligatori,
    // come già per le foto. La nota obbligatoria sui negativi resta gestita da voceEsitoColore.
    if (haEsitoNegativo(v.risposte ?? {}, base)) return;
    const campiVoce = fotoSoloMassive && !attivitaMassiva(v.attivita)
      ? base.map((c) => (campoObbligatorioSoloMassive(c) && c.obbligatoria ? { ...c, obbligatoria: false } : c))
      : base;
    const mancanti = campiObbligatoriMancanti(campiVoce, v.risposte ?? {});
    if (mancanti.length > 0) out.push({ index, titolo: titoloVoce(v, titoloCampi, index), campi: mancanti });
  });
  return out;
}
