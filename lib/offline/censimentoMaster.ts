// Lettura TIPIZZATA della cache del censimento AcquaLatina.
//
// Il download e la scrittura stanno in `censimentoCache.ts`, che è generico e memorizza
// `unknown[]` perché serve due committenti con righe di forma diversa. Qui si dà un nome al
// tipo per chi consuma: la ricerca per matricola offline, che passa le righe a `lookupMaster`
// e dev'essere sicura di cosa sta guardando.
import { leggiCensimentoLocalePer } from './censimentoCache';
import type { RigaMaster } from '@/lib/acqualatina/lookupMaster';

export type CensimentoMasterLocale = { versione: string; righe: RigaMaster[]; scaricatoIl: number };

/** Censimento AcquaLatina in cache, o undefined se non è mai stato scaricato.
 *  `undefined` NON significa «nessun misuratore»: significa «non lo so», ed è la differenza
 *  su cui si regge il blocco offline (decisione 5 del piano). */
export async function leggiCensimentoMasterLocale(): Promise<CensimentoMasterLocale | undefined> {
  const rec = await leggiCensimentoLocalePer('acqualatina');
  return rec ? { versione: rec.versione, righe: rec.righe as RigaMaster[], scaricatoIl: rec.scaricatoIl } : undefined;
}
