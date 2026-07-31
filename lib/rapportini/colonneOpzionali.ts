/**
 * Resilienza all'ordine deploy → migration.
 *
 * Le colonne aggiunte da una migration recente possono non esistere ancora quando il codice
 * è già in produzione: una select che le nomina fallisce INTERA e spegne la pagina. Qui la
 * lettura degrada colonna per colonna (dalla più recente alla più vecchia) e la scrittura
 * ritenta senza la colonna mancante, invece di perdere il salvataggio.
 */

type ErroreDb = { code?: string; message?: string } | null;
type Risposta<T> = { data: T | null; error: ErroreDb };
/** Ciò che torna il client Supabase: `data` resta opaco perché la select è una stringa
 *  dinamica e il tipo delle colonne non è deducibile a compile-time. */
type RispostaDb = PromiseLike<{ data: unknown; error: ErroreDb }>;

/**
 * Colonne di `rapportino_template` nate da migration recenti, dalla più vecchia alla più
 * nuova: si tolgono da destra man mano che la select fallisce.
 */
export const COLONNE_TEMPLATE_OPZIONALI = ['riservato_pi', 'lista_campi'] as const;

/**
 * Esegue la select con tutte le colonne opzionali e, a ogni errore, ne toglie una (dalla
 * fine: le più recenti sono le più a rischio) finché non resta la sola `base`.
 */
export async function selectDegradante<T = unknown>(
  base: string,
  opzionali: readonly string[],
  esegui: (colonne: string) => RispostaDb,
): Promise<Risposta<T>> {
  let ultima = await esegui([base, ...opzionali].join(', '));
  for (let n = opzionali.length - 1; n >= 0 && ultima.error; n -= 1) {
    ultima = await esegui([base, ...opzionali.slice(0, n)].join(', '));
  }
  return { data: (ultima.data ?? null) as T | null, error: ultima.error };
}

/**
 * True se l'errore dice "questa colonna non esiste" per `colonna`.
 * PostgREST usa `42703` (Postgres, in select) o `PGRST204` (schema cache, in insert/update);
 * in entrambi i casi il nome della colonna è nel messaggio.
 */
export function erroreColonnaMancante(
  error: { code?: string; message?: string } | null | undefined,
  colonna: string,
): boolean {
  if (!error) return false;
  const codice = error.code === '42703' || error.code === 'PGRST204';
  return codice && (error.message ?? '').includes(colonna);
}

/**
 * Esegue una scrittura che include `colonna` e, se quella colonna non esiste ancora,
 * ritenta senza: il resto delle modifiche si salva comunque.
 */
export async function scriviSenzaColonnaMancante<T = unknown>(
  valori: Record<string, unknown>,
  colonna: string,
  esegui: (valori: Record<string, unknown>) => RispostaDb,
): Promise<Risposta<T>> {
  let res = await esegui(valori);
  if (erroreColonnaMancante(res.error, colonna)) {
    const senza = { ...valori };
    delete senza[colonna];
    res = await esegui(senza);
  }
  return { data: (res.data ?? null) as T | null, error: res.error };
}
