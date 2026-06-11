/**
 * True se l'esito dell'invio (`/api/r/[token]/invia`) è temporaneo e va RITENTATO,
 * non bloccato: caso `409 { error: 'voci_in_sospeso' }` (un intervento manuale è in
 * attesa di approvazione → l'invio diventerà possibile, non è un errore definitivo).
 */
export function inviaRitentabile(status: number, corpo: unknown): boolean {
  return status === 409 && (corpo as { error?: string } | null)?.error === 'voci_in_sospeso';
}
