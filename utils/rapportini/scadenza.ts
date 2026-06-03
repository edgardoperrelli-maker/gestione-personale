/** Giorni di calendario di validità dalla mezzanotte del giorno lavori (48h = 2). */
export const GIORNI_VALIDITA = 2;

/** Data (YYYY-MM-DD) in fuso Europe/Rome per un dato istante ISO. */
export function dataInRoma(nowIso: string): string {
  return new Date(nowIso).toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

/** Somma `n` giorni a una data YYYY-MM-DD (aritmetica in UTC → immune all'ora legale). */
export function addGiorni(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Istante ISO (UTC) della mezzanotte Europe/Rome di un dato YYYY-MM-DD. */
export function mezzanotteRomaIso(ymd: string): string {
  // Offset di Roma per quel giorno, misurato a mezzogiorno UTC (lontano dai bordi DST).
  const t = Date.parse(`${ymd}T12:00:00Z`);
  const wallRoma = new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Rome' });
  const wallUtc = new Date(t).toLocaleString('sv-SE', { timeZone: 'UTC' });
  const offsetMs = Date.parse(`${wallRoma.replace(' ', 'T')}Z`) - Date.parse(`${wallUtc.replace(' ', 'T')}Z`);
  return new Date(Date.parse(`${ymd}T00:00:00Z`) - offsetMs).toISOString();
}

/** true se, all'istante `nowIso`, il link per il giorno lavori `data` è scaduto. */
export function isScaduto(data: string, nowIso: string): boolean {
  const ultimoValido = addGiorni(data, GIORNI_VALIDITA - 1); // data + 1
  return dataInRoma(nowIso) > ultimoValido;                  // confronto lessicografico YYYY-MM-DD
}

/** Istante ISO di scadenza (00:00 Europe/Rome del giorno lavori + 48h) per `expires_at`. */
export function scadenzaIso(data: string): string {
  return mezzanotteRomaIso(addGiorni(data, GIORNI_VALIDITA)); // mezzanotte di data + 2
}
