import { isPlaceholderFoto } from '@/lib/offline/fotoPlaceholder';

/** True se il valore è un path di storage reale (foto già caricata su bucket). */
export function eStoragePath(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('rapportini/');
}

/**
 * Unisce le risposte esistenti con quelle in arrivo SENZA cancellare le chiavi
 * non inviate (l'opposto della vecchia sovrascrittura totale).
 *
 * - `soloCompletamentoFoto: false` (rapportino modificabile): le chiavi in arrivo
 *   vincono; le chiavi assenti restano invariate; un `null` esplicito cancella.
 *   Unica eccezione: un segnaposto (`blob-locale:…`) NON sovrascrive mai un path
 *   reale già salvato — protegge dalla riapertura con una copia locale stale sul
 *   telefono, che altrimenti riscriverebbe un segnaposto su una foto già caricata.
 * - `soloCompletamentoFoto: true` (rapportino già inviato): applica SOLO le
 *   transizioni segnaposto → path reale (`blob-locale:…` → `rapportini/…`); ogni
 *   altra modifica è ignorata (un inviato non può essere alterato).
 */
export function mergeRisposte(
  esistenti: Record<string, unknown>,
  inArrivo: Record<string, unknown>,
  opts: { soloCompletamentoFoto: boolean },
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...esistenti };
  for (const [chiave, valore] of Object.entries(inArrivo)) {
    if (opts.soloCompletamentoFoto) {
      // Rapportino inviato: solo segnaposto → path reale.
      if (isPlaceholderFoto(esistenti[chiave]) && eStoragePath(valore)) {
        out[chiave] = valore;
      }
      continue;
    }
    // Modalità normale: un segnaposto non scalza mai un path reale già salvato.
    if (isPlaceholderFoto(valore) && eStoragePath(esistenti[chiave])) {
      continue;
    }
    out[chiave] = valore;
  }
  return out;
}
