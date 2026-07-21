// PURA: colonne del template import UFFICIALE + riconoscimento del suo header.
// Estratto da templateImport.ts (che le riesporta) così il riconoscimento è importabile
// dal parser client (utils/routing) senza trascinare ExcelJS nel bundle.

export const COLONNE_TEMPLATE = [
  'CO', 'MATRICOLA', 'ODS/ODL', 'Indirizzo', 'CAP', 'COMUNE',
  'DESCRIZIONE ATTIVITÀ', "GRUPPO ATTIVITA'", 'COMMITTENTE',
  'Esecutore', 'Fascia Appuntamento/Blocco', 'PdR / Impianto', 'Nominativo',
  'Tempo Esecuzione', 'Num Risorse', 'Lat', 'Long', 'Note per operatore',
] as const;

/** Nome del foglio dati del template ufficiale. */
export const FOGLIO_TEMPLATE = 'Interventi';

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * True se la riga header è ESATTAMENTE quella del template ufficiale (quello scaricato
 * da /api/interventi/template): stesse colonne, stesso ordine, nessuna in più — il
 * confronto tollera maiuscole/spazi e celle vuote in coda. Un template vecchio (senza
 * COMMITTENTE) o un formato storico (ATTGIORN, Massiva, Export Dati) NON passa.
 */
export function isHeaderTemplateUfficiale(headerRow: unknown[]): boolean {
  const presenti = (headerRow ?? []).map(norm);
  while (presenti.length > 0 && presenti[presenti.length - 1] === '') presenti.pop();
  if (presenti.length !== COLONNE_TEMPLATE.length) return false;
  return COLONNE_TEMPLATE.every((attesa, i) => norm(attesa) === presenti[i]);
}
