// tools/limitazioni-sync/lib/comuni.mjs
// PURE: il COMUNE di un master delle limitazioni massive È il nome del suo file.
// Un comune nuovo = un file nuovo nella cartella. Nessuna configurazione per comune.
import path from 'node:path';

/** Valore speciale: tutti i comuni (nessun filtro). */
export const TUTTI = 'TUTTI';

/** Comune di un file master: nome del file senza estensione, normalizzato.
 *  `C:\...\LABICO.xlsx` → `LABICO`. Tollerante a estensione maiuscola e spazi.
 *  Usa `path.win32` (che tratta sia `\` sia `/` come separatori) così i path Windows dei
 *  master SharePoint danno il basename corretto anche quando gira su un runner POSIX (CI):
 *  con `path.posix` un `C:\...\LABICO.xlsx` non verrebbe spezzato e ritornerebbe l'intero path. */
export function comuneDaFile(file) {
  const s = String(file ?? '');
  return path.win32.basename(s, path.win32.extname(s)).trim().toUpperCase();
}

/** Normalizza un comune scelto dall'app ('' / null / 'tutti' → TUTTI). */
export function normalizzaComune(comune) {
  const c = String(comune ?? '').trim().toUpperCase();
  return c === '' ? TUTTI : c;
}

/** Filtra i file per comune. TUTTI (o vuoto) → nessun filtro, lista invariata. */
export function filtraFilePerComune(files, comune) {
  const c = normalizzaComune(comune);
  if (c === TUTTI) return [...(files ?? [])];
  return (files ?? []).filter((f) => comuneDaFile(f) === c);
}
