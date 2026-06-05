# Riepilogo rapportini — filtro periodo con range personalizzato

**Data:** 2026-06-05
**Tipo:** Piccola estensione UI (filtro)

## Contesto
La vista riepilogo ([RiepilogoRapportini.tsx](../../../components/modules/mappa/RiepilogoRapportini.tsx)) ha un `<select>` periodo con preset (7/30/90 gg) che imposta `from`/`to` del fetch `/api/mappa/rapportini/riepilogo`. Manca la possibilità di scegliere un **range di date arbitrario**.

## Obiettivo
Aggiungere al menu periodo la voce **"Personalizzato"** che mostra due campi data **Dal / Al** (`<input type="date">` nativi), stilizzati come gli altri filtri, per filtrare su un range scelto dall'utente.

## Design

**UX:**
- Nuova opzione "Personalizzato…" nel menu periodo. Selezionandola compaiono accanto due `<input type="date">` (Dal / Al) con la stessa classe degli altri filtri; il pop-up calendario è quello nativo del browser.
- Passando a "Personalizzato" i campi si **prepopolano** col range corrente (continuità). Tornando a un preset, i campi spariscono.
- Ricarica sul range scelto: `from = Dal`, `to = Al` (date esatte, senza il `+14gg` dei preset). Si ricarica solo se entrambe valorizzate e `Dal ≤ Al`; altrimenti i risultati restano invariati.
- Vincoli UI: `max` su Dal = Al, `min` su Al = Dal (impedisce range invertiti già nel widget).

**Codice (logica isolata e testabile):**
- Nuova utility pura `utils/rapportini/rangePeriodo.ts`: esporta `PERIODI` (preset spostati qui), `GIORNI_FUTURO`, e `calcolaRange(periodo, { dataDa, dataA }, oggiIso) → { from, to } | null`.
  - **Calcolo in UTC** (`new Date(\`${oggiIso}T00:00:00Z\`)`) per evitare slittamenti di fuso quando si fa `toISOString().slice(0,10)`.
  - `custom` incompleto o invertito → `null` (nessuna ricarica).
- `RiepilogoRapportini.tsx`: stato `dataDa`/`dataA`, opzione "Personalizzato", input condizionali, `carica()` usa `calcolaRange`.

## Test
`calcolaRange` (vitest): preset → `from/to` corretti in UTC; preset sconosciuto → default 30; custom valido → date esatte; custom incompleto → null; custom invertito → null. Input nei componenti: verifica manuale.

## Scope / non-obiettivi
- Nessuna modifica API (usa già `from`/`to`).
- Nessuna dipendenza nuova, nessun calendario custom, nessuna migrazione.
