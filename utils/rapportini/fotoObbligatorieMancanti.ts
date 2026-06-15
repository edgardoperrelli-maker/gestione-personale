import { isPlaceholderFoto } from '@/lib/offline/fotoPlaceholder';
import { comeArrayFoto } from '@/utils/rapportini/comeArrayFoto';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { haEsitoNegativo } from '@/utils/rapportini/voceColore';

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
  const obbligatorie = campi.filter(
    (c) => c.tipo === 'foto' && (c as { obbligatoria?: boolean }).obbligatoria === true,
  );
  if (obbligatorie.length === 0) return 0;
  let n = 0;
  for (const v of voci) {
    if (v.manuale) continue; // creata dal "+": le foto sono già nella richiesta, non nel template pianificato
    const risposte = v.risposte ?? {};
    if (haEsitoNegativo(risposte, campi)) continue; // esito negativo → foto non obbligatorie
    for (const c of obbligatorie) {
      if (fotoVuota(risposte[c.chiave])) n += 1;
    }
  }
  return n;
}
