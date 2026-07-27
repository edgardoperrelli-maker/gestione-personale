// lib/acea/comuniMassive.ts
// PURA: i comuni delle limitazioni massive ricavati dal registro degli ordini.
//
// PERCHÉ ESISTE. Oggi `lib/produzione/comuniMassive.ts` deriva questa lista dai file MASTER
// scansionati dall'agente (`agente_file_colonne.is_master`: LABICO.xlsx → LABICO) e la passa a
// `attivitaCanonica`, che decide se una riga ACEA senza testo attività è massiva o va
// riclassificata Italgas (AGENTS.md §14). Spegnendo l'agente quella fonte si congela: un comune
// nuovo non verrebbe più riconosciuto e la Produzione economica lo classificherebbe male, in
// silenzio.
//
// Il registro sa la stessa cosa e la sa meglio: i comuni delle righe `famiglia = 'massive'`.
// Verificato sull'export reale: ZAGAROLO (2.234 righe) e LABICO (525) — esattamente i due master
// esistenti, nessun allargamento del set e quindi nessuna riclassificazione a sorpresa.

/** Riga del registro ridotta ai campi che servono qui. */
export type RigaComune = { famiglia: string | null; comune: string | null };

/**
 * Comuni distinti con almeno un ordine della famiglia massive.
 * Normalizzati come i nomi dei file master (maiuscolo, senza spazi esterni) e ordinati.
 */
export function comuniMassiveDaRegistro(righe: readonly RigaComune[]): string[] {
  const comuni = new Set<string>();
  for (const r of righe) {
    if (r.famiglia !== 'massive') continue;
    const c = String(r.comune ?? '').trim().toUpperCase();
    if (c !== '') comuni.add(c);
  }
  return [...comuni].sort((a, b) => a.localeCompare(b, 'it'));
}
