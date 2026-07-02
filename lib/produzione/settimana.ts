// PURA: helper condivisi per calcoli "settimana lunedì–domenica" (ISO). Estratta perché usata da
// TRE consumatori indipendenti: serieTrend.ts (raggruppamento settimanale del trend), PersonaleImpegno
// (impegno nel tempo settimanale) e aggregaCandele/loadCandele (candele settimanali per operatore,
// design 2026-07-02) — terzo consumatore che ha motivato l'estrazione (già segnalata come follow-up
// nella review finale della PR #68).

/** Lunedì (ISO) della settimana di un giorno 'YYYY-MM-DD', calcolato in UTC. */
export function lunediSettimana(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const g = (d.getUTCDay() + 6) % 7; // 0=lunedì
  d.setUTCDate(d.getUTCDate() - g);
  return d.toISOString().slice(0, 10);
}

/** Le 7 date ISO da `lunedi` a `lunedi+6` (settimana lunedì–domenica). */
export function giorniSettimana(lunedi: string): string[] {
  const d = new Date(`${lunedi}T00:00:00Z`);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
