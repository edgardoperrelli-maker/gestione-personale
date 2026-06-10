import { anagraficaValida } from '@/lib/interventi/manuali/anagraficaValida';
import { validaFotoObbligatorie } from '@/lib/interventi/manuali/validaFotoObbligatorie';
import type { AnagraficaManuale } from '@/lib/interventi/manuali/types';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export type EsitoValidazione = { ok: true } | { ok: false; motivo: string };

/**
 * Pre-validazione lato client dell'intervento manuale, identica alle regole server,
 * così offline accodiamo solo richieste valide (meno rifiuti 422 al sync).
 */
export function validaManualeClient(args: {
  anagrafica: Record<string, unknown>;
  campiTemplate: TemplateCampo[];
  slotFotoPresenti: Record<string, boolean>;
}): EsitoValidazione {
  if (!anagraficaValida(args.anagrafica as AnagraficaManuale)) {
    return { ok: false, motivo: 'Indicare almeno un identificativo (PDR, ODL o matricola) e un campo indirizzo (via o comune).' };
  }
  const esito = validaFotoObbligatorie(args.campiTemplate, args.slotFotoPresenti);
  if (!esito.ok) {
    return { ok: false, motivo: `Foto obbligatorie mancanti: ${esito.mancanti.join(', ')}` };
  }
  return { ok: true };
}
