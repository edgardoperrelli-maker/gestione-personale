import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

/**
 * Normalizzazione "DB pulito": il testo inserito da operatori e backoffice viene
 * salvato sempre in MAIUSCOLO. Si applica SOLO ai dati operativi liberi (nomi,
 * indirizzi, codici, note, risposte di testo).
 *
 * NON va usata su campi tecnici case-sensitive — email, password, token, id/uuid,
 * percorsi/URL, nomi file, chiavi JSON (`chiave`), enum di stato: quelli restano intatti.
 */

/** MAIUSCOLO di una stringa; lascia invariati i valori non-stringa (numeri, booleani, null/undefined). */
export function maiuscolo<T>(v: T): T {
  return typeof v === 'string' ? (v.toUpperCase() as unknown as T) : v;
}

/**
 * MAIUSCOLO "IME-safe" per gli input controllati, da usare nell'`onChange`.
 *
 * Bug Android (GBoard): un input controllato React che fa `value.toUpperCase()` ad OGNI
 * tasto muta il testo sotto la tastiera mentre questa tiene la parola corrente "in
 * composizione". Al primo SPAZIO la composizione viene committata su un range ormai sfasato
 * e l'intero campo si svuota (i tecnici: «scrivo "Via", premo spazio e si cancella tutto»,
 * solo su smartphone Android).
 *
 * Fix: durante la composizione IME (`isComposing`) NON trasformiamo — restituiamo il testo
 * grezzo, così il `value` controllato combacia col DOM e React non tocca la regione in
 * composizione. Il MAIUSCOLO resta visivamente garantito dal CSS `uppercase` sull'input e,
 * in modo definitivo, dalla normalizzazione lato server prima della scrittura su DB.
 * Fuori composizione (PC, incolla, autofill, fine parola) maiuscoliamo subito; da abbinare
 * a `onCompositionEnd` per maiuscolare l'ultima parola appena conclusa.
 */
export function maiuscoloDigitando(e: { target: { value: string }; nativeEvent: unknown }): string {
  const grezzo = e.target.value;
  const inComposizione = (e.nativeEvent as { isComposing?: boolean } | null)?.isComposing === true;
  return inComposizione ? grezzo : grezzo.toUpperCase();
}

/**
 * Copia dell'oggetto con TUTTI i valori stringa di primo livello in MAIUSCOLO.
 * Da usare solo su oggetti di soli dati umani (es. anagrafica): nessuna chiave tecnica.
 */
export function maiuscolaStringhe<T extends Record<string, unknown>>(obj: T | null | undefined): T {
  const out: Record<string, unknown> = { ...(obj ?? {}) };
  for (const k of Object.keys(out)) {
    if (typeof out[k] === 'string') out[k] = (out[k] as string).toUpperCase();
  }
  return out as T;
}

/**
 * Copia delle risposte con i SOLI valori dei campi `tipo === 'testo'` portati in MAIUSCOLO.
 * Select / crocetta / numero / foto restano intatti: opzioni fisse, booleani, numeri e
 * percorsi foto (case-sensitive) non vanno toccati.
 */
export function maiuscolaRisposteTesto(
  risposte: Record<string, unknown> | null | undefined,
  campi: TemplateCampo[] | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(risposte ?? {}) };
  const chiaviTesto = new Set((campi ?? []).filter((c) => c.tipo === 'testo').map((c) => c.chiave));
  for (const k of chiaviTesto) {
    if (typeof out[k] === 'string') out[k] = (out[k] as string).toUpperCase();
  }
  return out;
}

/**
 * Copia di una lista di campi/colonne template con la sola `etichetta` in MAIUSCOLO.
 * `chiave`, `tipo`, `opzioni` restano INTATTI: sono identificatori e opzioni fisse usati dal
 * codice e devono combaciare con le risposte già salvate.
 */
export function maiuscolaEtichette<T extends { etichetta?: unknown }>(campi: T[] | null | undefined): T[] {
  return (campi ?? []).map((c) =>
    typeof c?.etichetta === 'string' ? { ...c, etichetta: c.etichetta.toUpperCase() } : c,
  );
}
