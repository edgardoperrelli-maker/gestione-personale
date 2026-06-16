// PURA: formattazione date in formato italiano per il modulo Lista attesa.

/**
 * Formatta una data `YYYY-MM-DD` (o il prefisso data di un timestamp ISO) in
 * formato italiano `GG/MM/AAAA`. Lavora sulle cifre (niente Date/timezone), così
 * una data pura non subisce mai shift di giorno. Stringa vuota se assente,
 * valore grezzo se non riconosciuto.
 */
export function formatDataIt(value: string | null | undefined): string {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

/**
 * Formatta SOLO l'ora di un timestamp ISO in `HH:mm` (ora di Roma).
 * Stringa vuota se assente, valore grezzo se non parsabile.
 */
export function formatOraIt(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
}

/**
 * Formatta un timestamp ISO in `GG/MM/AAAA, HH:mm` con orario di Roma.
 * Stringa vuota se assente, valore grezzo se non parsabile.
 */
export function formatDataOraIt(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  });
}
