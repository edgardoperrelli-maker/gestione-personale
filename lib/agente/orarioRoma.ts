export type PartiRoma = {
  oggi: string;        // 'YYYY-MM-DD'
  oraCorrente: string; // 'HH:MM'
  weekday: number;     // 1=Lun … 7=Dom (ISO)
};

/**
 * Ricava data, ora e giorno della settimana (ISO 1..7) in fuso Europe/Rome.
 * Usa il locale 'sv-SE' che formatta come 'YYYY-MM-DD HH:MM:SS'.
 */
export function partiRoma(now: Date): PartiRoma {
  // 'sv-SE' → "2026-06-16 21:30:45"
  const s = now.toLocaleString('sv-SE', { timeZone: 'Europe/Rome' });
  const [datePart, timePart] = s.split(' ');
  const oggi = datePart;
  const oraCorrente = timePart.slice(0, 5); // "HH:MM"

  // weekday in inglese abbreviato → ISO 1..7
  const wd = now.toLocaleString('en-US', { timeZone: 'Europe/Rome', weekday: 'short' });
  const mappa: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };
  const weekday = mappa[wd] ?? 1;

  return { oggi, oraCorrente, weekday };
}
