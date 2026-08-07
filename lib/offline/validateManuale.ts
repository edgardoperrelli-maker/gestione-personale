import { anagraficaValida, dettaglioAnagraficaMancante } from '@/lib/interventi/manuali/anagraficaValida';
import { validaFotoObbligatorie } from '@/lib/interventi/manuali/validaFotoObbligatorie';
import { isSoloRichiesta } from '@/lib/interventi/manuali/soloRichiesta';
import type { AnagraficaManuale } from '@/lib/interventi/manuali/types';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { haEsitoNegativo } from '@/utils/rapportini/voceColore';

export type EsitoValidazione = { ok: true } | { ok: false; motivo: string };

/**
 * Pre-validazione lato client dell'intervento manuale, con le STESSE regole del server, così
 * offline si accoda solo ciò che al sync verrà accettato.
 *
 * Perché conta: un "+" accodato e poi respinto non torna indietro da solo. `sincronizzaToken`
 * esclude per sempre gli elementi bloccati, quindi la richiesta resta ferma nel cassetto «da
 * risolvere» e l'operatore — che nel frattempo se n'è andato dal posto — può solo rifarla.
 * Fermarsi qui, con la modale ancora aperta e i campi sotto mano, costa un tocco; accorgersene
 * dopo costa un viaggio.
 *
 * Le regole non sono riscritte: `anagraficaValida` e `dettaglioAnagraficaMancante` sono le stesse
 * funzioni che decidono e spiegano lato route, e `isSoloRichiesta` è lo stesso predicato che
 * spegne il cancello delle foto. Una copia locale sarebbe destinata a divergere, ed è la
 * divergenza — non il controllo mancante — a produrre i blocchi insanabili.
 */
export function validaManualeClient(args: {
  anagrafica: Record<string, unknown>;
  campiTemplate: TemplateCampo[];
  slotFotoPresenti: Record<string, boolean>;
  risposte?: Record<string, unknown>;
  committente?: string;
}): EsitoValidazione {
  if (!anagraficaValida(args.anagrafica as AnagraficaManuale, args.committente)) {
    return { ok: false, motivo: dettaglioAnagraficaMancante(args.committente) };
  }
  // Committenti "solo richiesta" (AcquaLatina): la modale non mostra il passo foto, quindi non
  // c'è nulla da pretendere. Il server fa lo stesso salto, sullo stesso predicato.
  if (isSoloRichiesta(args.committente)) return { ok: true };
  const esito = haEsitoNegativo(args.risposte ?? {}, args.campiTemplate)
    ? { ok: true as const, mancanti: [] as string[] }
    : validaFotoObbligatorie(args.campiTemplate, args.slotFotoPresenti, args.risposte ?? {});
  if (!esito.ok) {
    return { ok: false, motivo: `Foto obbligatorie mancanti: ${esito.mancanti.join(', ')}` };
  }
  return { ok: true };
}
