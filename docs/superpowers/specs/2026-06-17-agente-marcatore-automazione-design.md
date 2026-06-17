# Modulo Agente — marcatore "AUTOMAZIONE = SI" sulle righe lavorate

**Data:** 2026-06-17
**Stato:** Design approvato (scelta righe confermata dall'utente)

## Contesto
Aggiunta al modulo Agente (estende `2026-06-16-modulo-agente-design.md` / [[modulo-agente]]): un nuovo **campo mappabile `automazione`** che scrive un marcatore fisso **`SI`** in una colonna scelta (l'utente ha aggiunto l'intestazione `AUTOMAZIONE` in coda ai file ACEA), così l'ufficio vede a colpo d'occhio **quali righe ha lavorato l'agente**. Riusa l'infrastruttura esistente (mappa per nome, policy di scrittura prudente, report conflitti). Nessuna modifica all'architettura, **nessuna migration**.

## Scelta confermata
`SI` va scritto **solo sulle righe che l'agente modifica davvero** in quel giro (righe pianificate dove scrive almeno una cella mappata) **più le righe nuove che aggiunge** (extra). Una riga agganciata ma già compilata, dove l'agente non scrive nulla, **NON** viene segnata. (Fedele a "le righe che tocca".)

## Comportamento

### 1. Campo `automazione` (app)
- `CAMPI_MAPPABILI` (in `lib/agente/decisione.ts`) guadagna **`'automazione'`** in coda (dopo `'marcatore'`). Off di default, colonna **per nome** (nessun `auto`: cade nel ramo generico di `colonneView.ts`, nessuna modifica lì). `validaMappatura` lo accetta perché è nella lista.
- È **distinto** da `marcatore` (che resta = `'AGGIUNTA APP'` scritto **solo** sulle righe extra aggiunte). I due coesistono su colonne diverse.

### 2. Etichette editor (app)
- In `components/modules/agente/ColonneCard.tsx`, mappa `ETICHETTA_CAMPO`: aggiungere **`automazione: 'Automazione'`** e — fix del gap del deploy precedente — **`saracinesca: 'Saracinesca'`** (oggi mostra la chiave grezza per via del fallback `?? r.campo`). L'editor mostra già il campo da sé (`mappaturaCompleta` itera `CAMPI_MAPPABILI`).

### 3. Agente (`eseguiGiro`, `tools/limitazioni-sync/agente.mjs`)
- Costante `export const MARKER_AUTOMAZIONE = 'SI';`.
- Per ogni file: estrarre la regola `automazione` dalle `regole` (come si fa con `marcatore`), risolvere la **colonna per nome** (`risolviColonna(header, regola.colonna)`); se assente → `colonneAssenti` (come gli altri campi).
- Helper `scriviAutomazione(row)`: se la colonna esiste, `decidiScrittura(cell.value, 'SI')` → `scrivi` (cella vuota) scrive `SI`; `salta` (già `SI`, idempotente) non fa nulla; `conflitto` (valore diverso) → push in `fileReport.conflitti` con `campo:'automazione'`.
- **Righe pianificate:** dopo il loop `regoleScrittura`, se `toccata === true` (ha scritto ≥1 cella) → `scriviAutomazione(row)`. `aggiornate++` resta basato sulle sole `regoleScrittura` (il marcatore è una conseguenza, non cambia il conteggio).
- **Righe extra:** sempre `scriviAutomazione(row)` (sono righe nuove e scritte per definizione).

## Fuori scope
- Valore del marcatore configurabile (fisso `SI`; estendibile in futuro).
- Auto-creazione della colonna (l'utente l'ha già aggiunta a mano; mappatura per nome).
- Allineamento template `sost_valvola`/`sostituzione_valvola` (resta la spec separata già nota).

## Deploy
- **App:** push a `main` → Vercel (CAMPI_MAPPABILI + etichette). **Nessuna migration.**
- **Agente:** ricopiare **solo** `tools/limitazioni-sync/agente.mjs` sul PC.
- **Utente:** in `/hub/agente` abilitare **Automazione**, scegliere la colonna `AUTOMAZIONE`, testare con **Esegui ora** (in Prova: il report mostra le righe; in Reale scrive `SI`).

## Testing
- **Agente e2e** (`agente.test.ts`): fixture con colonna `AUTOMAZIONE` + regola `{campo:'automazione', colonna:'AUTOMAZIONE', abilitato:true}`. Asserire: riga lavorata → `SI`; riga extra aggiunta → `SI`; riga **non** lavorata / non agganciata → cella vuota. Mantenere gli assert esistenti (saracinesca, esito).
- **`decisione.test.ts`**: aggiornare l'array atteso esatto di `CAMPI_MAPPABILI` (aggiunge `'automazione'`); test `validaMappatura` accetta una regola `automazione`.
- **`colonneView.test.ts`**: gli assert sono derivati da `CAMPI_MAPPABILI` (lunghezza/ordine) → passano da soli.
- Gate **mirati** sui file del WP (baseline repo rossa).
