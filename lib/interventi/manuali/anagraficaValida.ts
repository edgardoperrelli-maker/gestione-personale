// PURA: verifica che l'anagrafica di un intervento manuale rispetti i requisiti minimi.
// Regole:
//  1. Almeno uno tra pdr, odl, matricola non vuoto (identificativo intervento).
//  2. Indirizzo:
//     - `lim_massive` e `acqualatina`: NON obbligatorio — la matricola basta, l'ufficio
//       completa l'indirizzo. Su AcquaLatina serve davvero: `template_master_righe.indirizzo`
//       e `comune` sono nullable, quindi una riga di master con matricola e ODL ma senza
//       indirizzo passerebbe il blocco della ricerca per poi essere respinta qui.
//     - altri committenti: almeno uno tra via, comune non vuoto.
import type { AnagraficaManuale } from './types';

const nv = (s: string | undefined | null): boolean => (s ?? '').trim() !== '';

export function anagraficaValida(a: AnagraficaManuale, committente?: string): boolean {
  const hasId = nv(a.pdr) || nv(a.odl) || nv(a.matricola);
  if (committente === 'lim_massive' || committente === 'acqualatina') return hasId;
  const hasAddr = nv(a.via) || nv(a.comune);
  return hasId && hasAddr;
}

/**
 * Cosa manca, detto all'operatore. Sta accanto alla regola che decide, e non in ognuno dei due
 * chiamanti, perché la frase deve descrivere la regola APPLICATA: su `lim_massive` e
 * `acqualatina` l'indirizzo non serve, e nominarlo manderebbe l'operatore a cercare un campo che
 * nessuno gli sta chiedendo (il messaggio del client lo faceva).
 */
export function dettaglioAnagraficaMancante(committente?: string): string {
  return committente === 'lim_massive' || committente === 'acqualatina'
    ? 'Indicare almeno un identificativo (matricola, PDR o ODL).'
    : 'Indicare almeno un identificativo (PDR, ODL o matricola) e almeno un campo indirizzo (via o comune).';
}
