# Modello "Scarica modello" — Estrazione misuratori (risanamento)

**Data:** 2026-06-10
**Stato:** Design approvato

## Contesto
Nella pagina "Estrazione misuratori" (`/impostazioni/risanamento-misuratori`) si importa un Excel/CSV con le colonne
misuratore. L'utente non sa il formato esatto. Aggiungiamo un bottone **"Scarica modello"** che genera un `.xlsx`
con le intestazioni corrette + 1 riga di esempio.

## Componenti

### 1. Helper `lib/risanamento/righeModelloMisuratori.ts` (puro, testabile)
`righeModelloMisuratori(): string[][]` → due righe:
- intestazioni: `['Matricola', 'PDR', 'Nominativo', 'Indirizzo', 'Civico', 'Comune', 'CAP']` (combaciano coi pattern di `parseImportMisuratori`).
- esempio: `['MAT123456', '00123456789', 'Rossi Mario', 'Via Roma', '12', 'Firenze', '50100']`.

### 2. Bottone in `ImportMisuratoriClient.tsx`
"⬇ Scarica modello" accanto a "Importa". Al click: `import('xlsx')` dinamico → `aoa_to_sheet(righeModelloMisuratori())`
→ workbook (foglio "Misuratori") → `XLSX.write({type:'array', bookType:'xlsx'})` → Blob → download
`modello-estrazione-misuratori.xlsx` (pattern `<a download>`).

## Testing
- Unit: `parseImportMisuratori(righeModelloMisuratori())` → 1 record con tutte le 7 colonne mappate (round-trip
  modello↔parser, garantisce che il modello sia sempre importabile senza errori).
- Generazione xlsx + download: lato client, gate `tsc`/`eslint`/`build`.

## Fuori scope
- Nessuna riga multipla di esempio; nessun formato CSV (solo xlsx); nessuna validazione extra.
