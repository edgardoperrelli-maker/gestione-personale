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

/** Primo identificativo non vuoto, nell'ordine PDR → matricola → ODL → indirizzo. */
function identificativoFoto(ids: IdentificativiFoto): string {
  const candidati = [ids.pdr, ids.matricola, ids.odl, ids.indirizzo];
  for (const c of candidati) {
    const norm = normalizzaAscii(String(c ?? '').trim());
    if (norm) return norm;
  }
  return 'intervento';
}

/**
 * Nome file logico della foto: `<EtichettaSlotNormalizzata>_<identificativo>.<ext>`.
 * - etichetta normalizzata ASCII (fallback "foto" se vuota dopo normalizzazione);
 * - identificativo = primo non vuoto tra PDR → matricola → ODL → indirizzo (fallback "intervento");
 * - estensione in minuscolo, senza punto iniziale.
 */
export function nomeFotoFile(
  etichettaSlot: string,
  ids: IdentificativiFoto,
  ext: string,
): string {
  const base = normalizzaAscii(etichettaSlot) || 'foto';
  const id = identificativoFoto(ids);
  const estensione = String(ext ?? '').trim().replace(/^\./, '').toLowerCase() || 'jpg';
  return `${base}_${id}.${estensione}`;
}
