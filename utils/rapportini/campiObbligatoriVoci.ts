import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { campiObbligatoriMancanti } from '@/lib/interventi/manuali/campiObbligatoriMancanti';
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
 */
export function campiObbligatoriMancantiVoci(
  voci: Array<VoceInfo & { risposte: Record<string, unknown> | null; manuale?: boolean }>,
  campi: TemplateCampo[],
  titoloCampi: InfoChiave[] = [],
): CampoMancanteVoce[] {
  const out: CampoMancanteVoce[] = [];
  voci.forEach((v, index) => {
    if (v.manuale) return;
    // Esito negativo → i campi della lavorazione (sigillo, lettura, …) NON sono obbligatori,
    // come già per le foto. La nota obbligatoria sui negativi resta gestita da voceEsitoColore.
    if (haEsitoNegativo(v.risposte ?? {}, campi)) return;
    const mancanti = campiObbligatoriMancanti(campi, v.risposte ?? {});
    if (mancanti.length > 0) out.push({ index, titolo: titoloVoce(v, titoloCampi, index), campi: mancanti });
  });
  return out;
}
