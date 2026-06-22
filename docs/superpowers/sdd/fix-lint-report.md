# Fix lint — assegnazione-ai (2026-06-22)

## STATUS: OK — 0 errori eslint, tsc OK

## File modificati

### `foglie/AggiornaStatoOdl.tsx`
- Righe 87-88: escapati 3 apostrofi JSX (`all'agente`, `L'operazione`, `dell'agente`) → `&rsquo;`

### `foglie/AssegnaOdl.tsx`
- Riga 3: rimosso `type ReactNode` dall'import (inutilizzato)
- Righe 22-28: rimossa funzione `attivitaNavToConfig` (inutilizzata)
- Riga 206 (ex 214): rimossa direttiva `// eslint-disable-next-line react-hooks/exhaustive-deps` (superflua)
- Riga 338: escapato apostrofo JSX `L'assegnazione` → `L&rsquo;assegnazione`

### `foglie/SincronizzaRapportini.tsx`
- Righe 79-80: escapati 2 apostrofi JSX (`dell'agente`, `dell'agente`) → `&rsquo;`

### `useAceaNav.ts`
- Aggiunto `useMemo` nell'import
- Avvolto l'oggetto `nav` in `useMemo(() => ({...}), [sp])` per stabilizzare il riferimento e togliere i warning "makes dependencies change every render"

## Verifica
```
npx eslint components/modules/assegnazione-ai  → (nessun output = 0 errori, 0 warning)
npx tsc --noEmit | grep assegnazione-ai        → tsc OK
```
