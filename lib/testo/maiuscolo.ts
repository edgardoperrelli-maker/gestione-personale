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
