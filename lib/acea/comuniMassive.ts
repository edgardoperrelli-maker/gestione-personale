// lib/acea/comuniMassive.ts
// PURA: i comuni delle limitazioni massive ricavati dal registro degli ordini.
//
// PERCHÉ ESISTE. `attivitaCanonica` decide se una riga ACEA senza testo attività è massiva o va
// riclassificata Italgas (AGENTS.md §14), e per farlo ha bisogno dell'elenco dei comuni massive.
// Fino al 04/08/2026 quell'elenco veniva dai file MASTER scansionati dall'agente Playwright
// (`agente_file_colonne.is_master`: LABICO.xlsx → LABICO): una fonte che con l'agente spento si
// sarebbe congelata, e un comune nuovo sarebbe stato classificato male in silenzio.
//
// Il registro sa la stessa cosa e la sa meglio: i comuni delle righe `famiglia = 'massive'`.
// Verificato prima del passaggio: il registro ne conosceva CINQUE contro i DUE master esistenti,
// quindi il cambio di fonte non ha tolto nulla né allargato il set a sorpresa.

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
