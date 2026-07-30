import 'server-only';
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';
import { buildTassonomiaIndex, type TassonomiaRiga } from '@/lib/attivita/tassonomia';

/**
 * L'indice di tassonomia, cachato un minuto.
 *
 * Le due rotte che pianificano (`/pianifica` e `/celle`) lo ricaricavano dal database A OGNI
 * salvataggio di cella: una lettura dell'intera tabella per un dato che cambia quando l'ufficio
 * tocca la tassonomia — cioè quasi mai. Un minuto di ritardo su quel dato non cambia nessuna
 * decisione; una lettura in meno su ogni salvataggio si sente tutta. Stesso schema (e stesso TTL)
 * delle sostituzioni saracinesca nella rotta del registro.
 *
 * Best-effort come prima: senza tassonomia l'intervento nasce con l'attività grezza, quindi un
 * errore di lettura torna `null` e non ferma la scrittura.
 */
const TTL_MS = 60_000;
let cache: { indice: Map<string, TassonomiaRiga>; quando: number } | null = null;

export async function indiceTassonomiaCached(): Promise<Map<string, TassonomiaRiga> | null> {
  const ora = Date.now();
  if (cache && ora - cache.quando < TTL_MS) return cache.indice;
  try {
    const indice = buildTassonomiaIndex(await caricaTassonomia());
    cache = { indice, quando: ora };
    return indice;
  } catch {
    return null;
  }
}
