export type DecideEsecuzioneInput = {
  enabled: boolean;
  giorni: number[];      // ISO 1..7
  ora: string;           // "HH:MM"
  weekday: number;       // ISO 1..7
  oraCorrente: string;   // "HH:MM"
  oggi: string;          // "YYYY-MM-DD"
  ultimaRivendicazione: string | null; // "YYYY-MM-DD" | null
};

/**
 * true sse: abilitato && giorno pianificato && passata l'ora && non già
 * rivendicato oggi. Il confronto orario è lessicografico su "HH:MM" zero-pad.
 */
export function decideEsecuzione(input: DecideEsecuzioneInput): boolean {
  const { enabled, giorni, ora, weekday, oraCorrente, oggi, ultimaRivendicazione } = input;
  return (
    enabled &&
    giorni.includes(weekday) &&
    oraCorrente >= ora &&
    ultimaRivendicazione !== oggi
  );
}
