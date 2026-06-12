/** Righe del modello .xlsx scaricabile per l'estrazione misuratori: intestazioni + 1 riga di esempio.
 *  Le intestazioni combaciano coi pattern di `parseImportMisuratori` → il modello è sempre re-importabile. */
export function righeModelloMisuratori(): string[][] {
  return [
    ['ODS/ODL', 'Matricola', 'PDR', 'Nominativo', 'Indirizzo', 'Civico', 'Comune', 'CAP'],
    ['ODL900', 'MAT123456', '00123456789', 'Rossi Mario', 'Via Roma', '12', 'Firenze', '50100'],
  ];
}
