// lib/acea/matricolaCella.ts
// PURA: la correzione della MATRICOLA di una riga di registro fatta in griglia.
//
// Sta in un modulo suo, e non fra le colonne di `anagraficaCelle.ts`, perché non è anagrafica
// del punto: è l'IDENTITÀ della riga, e ha tre regole che le altre colonne non hanno.
//
//  1. NON SI SVUOTA. Un indirizzo cancellato è un indirizzo che non sappiamo; una matricola
//     cancellata è una riga che non identifica più niente — e su AcquaLatina è anche la riga
//     che l'operatore non riesce più a censire, quindi non esegue.
//  2. VIAGGIA IN COPPIA con `matricola_norm`. È lei la metà che conta: l'indice unico di
//     `acqualatina_ordini` è `(odl, matricola_norm)`, e l'aggancio fra registro e interventi
//     passa dal normalizzato. Scrivere la sola `matricola` lascerebbe la riga con due verità.
//  3. PUÒ ESSERE RIFIUTATA DAL DATABASE. Su AcquaLatina quell'indice unico è una regola di
//     dominio — un contatore per ODL una volta sola — e una correzione che ci finisce contro
//     non è un errore del programma: è il registro che dice «quella matricola su questo ODL
//     c'è già». Va detto all'ufficio con quelle parole, non con un 500.
//
// ⚠️ Resta vero quello che `ordiniDaMaster` e `anagraficaPatchRegistro` dicono da sempre: per
// il SYNC «una matricola diversa non è una correzione, è un'altra riga», e il file del
// committente non la sovrascrive mai. Questa porta è l'eccezione voluta, e va nell'altro verso:
// non è un file che decide, è l'ufficio che ha in mano il dato giusto — tipicamente una
// matricola arrivata TRONCA dall'export (vedi `AVVISO_MATRICOLA_TRONCA`), dove il registro non
// ha nessun modo di ripararsi da solo perché la cifra mancante non sta in nessun file che
// riceviamo.

import { normMatricola } from '@/lib/acqualatina/ordiniDaMaster';
import { testoPulito } from '@/lib/testo/maiuscolo';

/** Quanto può essere lunga una matricola: una serigrafia di misuratore, non un testo libero. */
export const MAX_MATRICOLA = 60;

export type EsitoMatricola =
  | { ok: true; matricola: string; norm: string }
  | { ok: false; motivo: string };

/**
 * La matricola come va scritta, o il motivo per cui non si scrive.
 *
 * MAIUSCOLO come ogni altro testo di casa, e per una ragione in più rispetto alle anagrafiche:
 * la matricola si confronta (col registro, col censimento, col master), e «a12b» e «A12B» sono
 * lo stesso misuratore — è la stessa scelta di `maiuscolaRisposteTesto`, che maiuscola i campi
 * di tipo `matricola` e non gli altri.
 *
 * Il VUOTO è l'unico rifiuto, ed è un rifiuto di dominio: la cella non è un campo che si può
 * lasciare in bianco, è il nome della riga. Vale anche per un valore fatto di soli separatori
 * («---»), che normalizzato non lascia niente con cui identificare il punto.
 */
export function valoreMatricolaCella(v: unknown): EsitoMatricola {
  const grezzo = typeof v === 'string' ? v : v == null ? '' : String(v);
  const matricola = testoPulito(grezzo.slice(0, MAX_MATRICOLA));
  if (matricola === null) {
    return { ok: false, motivo: 'la matricola non si può svuotare: è l’identità della riga' };
  }
  const norm = normMatricola(matricola);
  if (norm === '') {
    return { ok: false, motivo: `"${grezzo.trim()}" non è una matricola: nessuna lettera o cifra` };
  }
  return { ok: true, matricola, norm };
}

/**
 * Le colonne da riscrivere sulla riga di registro.
 *
 * `sospetto_troncamento` si SPEGNE, e non è un di più: quel flag dice «questa matricola è quasi
 * certamente incompleta, il testo ordine ACEA si ferma a 40 caratteri» — è l'avviso che manda
 * l'ufficio a cercare il dato vero. Una volta che il dato vero è stato scritto a mano, il
 * triangolo giallo accanto alla cella diventerebbe una bugia che nessun import può più togliere.
 */
export function patchRegistroMatricola(e: { matricola: string; norm: string }): Record<string, unknown> {
  return { matricola: e.matricola, matricola_norm: e.norm, sospetto_troncamento: false };
}

/**
 * `true` se l'errore del database è una violazione di UNICITÀ (SQLSTATE 23505).
 *
 * È la sola classe di errore che qui non è un guasto ma una risposta: il registro che rifiuta
 * due volte lo stesso contatore sullo stesso ODL, o `interventi` che rifiuta due uscite
 * identiche. Distinguerla dal resto è ciò che permette di rispondere «quella matricola su
 * questo ODL c'è già» invece di «Errore modifica celle».
 */
export function eConflittoUnicita(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && (error as { code?: unknown }).code === '23505';
}

/** Il rifiuto del registro, detto come lo capisce chi sta correggendo la cella. */
export function motivoMatricolaDuplicata(matricola: string): string {
  return `matricola ${matricola} già presente su questo ODL: sarebbe la stessa riga due volte`;
}
