/** Identificativi disponibili per nominare la foto, in ordine di priorità. */
export interface IdentificativiFoto {
  pdr?: string | null;
  matricola?: string | null;
  odl?: string | null;
  indirizzo?: string | null;
}

/**
 * Normalizza una stringa in ASCII "file-safe" con CamelCase sugli spazi:
 * 1. Decompone accenti (NFD) e rimuove i diacritici combining.
 * 2. Capitalizza il primo carattere alfabetico dopo ogni spazio (CamelCase).
 * 3. Rimuove ogni carattere che non sia [A-Za-z0-9].
 * Es. "Foto contatore" → "FotoContatore"; "Via D'Annunzio, 12/B" → "ViaDAnnunzio12B".
 */
export function normalizzaAscii(input: string): string {
  return (input ?? '')
    .normalize('NFD')                          // separa lettera + diacritico
    .replace(/[̀-ͯ]/g, '')           // rimuove i diacritici (combining marks)
    .replace(/\s+([A-Za-z])/g, (_, c: string) => c.toUpperCase()) // CamelCase spazi
    .replace(/[^A-Za-z0-9]/g, '');            // rimuove tutto il non-alfanumerico residuo
}

/** Le 4 chiavi identificativo selezionabili come priorità nome foto. */
export type FotoIdCampo = 'pdr' | 'matricola' | 'odl' | 'indirizzo';

/** Etichette UI dei 4 identificativi (unica fonte di verità per l'editor template). */
export const FOTO_ID_CAMPI: { chiave: FotoIdCampo; etichetta: string }[] = [
  { chiave: 'pdr', etichetta: 'PDR' },
  { chiave: 'matricola', etichetta: 'Matricola' },
  { chiave: 'odl', etichetta: 'ODS/ODL' },
  { chiave: 'indirizzo', etichetta: 'Indirizzo' },
];

/** Ordine storico, usato quando la priorità del template è vuota/assente. */
export const FOTO_ID_PRIORITY_DEFAULT: FotoIdCampo[] = ['pdr', 'matricola', 'odl', 'indirizzo'];

/**
 * Primo identificativo non vuoto secondo `priority`. Se `priority` è vuota o assente,
 * usa l'ordine storico PDR → matricola → ODL → indirizzo. Fallback finale: "intervento".
 */
export function identificativoFoto(
  ids: IdentificativiFoto,
  priority?: FotoIdCampo[] | null,
): string {
  const ordine = priority && priority.length > 0 ? priority : FOTO_ID_PRIORITY_DEFAULT;
  for (const chiave of ordine) {
    const norm = normalizzaAscii(String(ids[chiave] ?? '').trim());
    if (norm) return norm;
  }
  return 'intervento';
}

/**
 * Nome file logico della foto: `<identificativo>_<EtichettaSlotNormalizzata>.<ext>`.
 * - identificativo = primo non vuoto secondo `priority` (default PDR → matricola → ODL → indirizzo,
 *   fallback "intervento");
 * - etichetta normalizzata ASCII (fallback "foto" se vuota dopo normalizzazione);
 * - estensione in minuscolo, senza punto iniziale.
 * Esempio: ODL9001 + "Foto contatore" → "ODL9001_FotoContatore.jpg"
 */
export function nomeFotoFile(
  etichettaSlot: string,
  ids: IdentificativiFoto,
  ext: string,
  priority?: FotoIdCampo[] | null,
): string {
  const id = identificativoFoto(ids, priority);
  const base = normalizzaAscii(etichettaSlot) || 'foto';
  const estensione = String(ext ?? '').trim().replace(/^\./, '').toLowerCase() || 'jpg';
  return `${id}_${base}.${estensione}`;
}
