/** Traduce la risposta d'errore del server (intervento manuale) in un messaggio leggibile per l'operatore. */
export function messaggioErroreManuale(
  j: { error?: string; dettaglio?: string; mancanti?: string[] },
  status: number,
): string {
  if (j.dettaglio && j.dettaglio.trim()) return j.dettaglio;
  if (j.mancanti && j.mancanti.length > 0) return `Foto obbligatorie mancanti: ${j.mancanti.join(', ')}`;
  const map: Record<string, string> = {
    campi_mancanti: 'Indica almeno un identificativo (PDR, ODL o matricola) e un campo indirizzo (via o comune).',
    committente_non_valido: 'Committente non valido.',
    template_mancante: 'Template non configurato per questo committente.',
    non_modificabile: 'Rapportino non più modificabile (scaduto o già inviato).',
    not_found: 'Rapportino non trovato.',
    tipo_file_non_valido: "Una delle foto non è un'immagine valida.",
    upload_foto_fallito: 'Caricamento foto non riuscito, riprova.',
  };
  if (j.error && map[j.error]) return map[j.error];
  return j.error && j.error.trim() ? j.error : `Errore ${status}`;
}
