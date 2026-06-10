# Risanamento colonne — Fase 4a: UI operatore (card-civico + righe + foto, manuale)

**Data:** 2026-06-09
**Stato:** Design approvato
**Progetto:** Flusso "Risanamento colonne" (multi-fase). Questo documento copre **solo la Fase 4a**.

---

## Contesto

I rapportini di tipo `risanamento` (Fase 3) hanno voci-civico (un palazzo per voce). La Fase 4a dà
all'operatore la UI per compilarli: aprendo il link `/r/[token]` di un rapportino risanamento vede le
card-civico; aprendo un civico trova **3 sezioni** (Misuratori / Fasi / Accessorie). Le righe-misuratore
si aggiungono **manualmente** (matricola/PDR/nominativo digitati) con foto **prima/dopo**; le foto di
fasi e accessorie stanno a livello civico. Lo **scanner** e il lookup arrivano in Fase 4b (riuseranno
l'inserimento manuale di qui come fallback).

Riuso massimo: il rendering passa per `RapportinoForm`; le foto riusano `CampoFoto` + endpoint
`foto-campo`; le foto-civico riusano l'endpoint `voce`. Niente librerie nuove in 4a.

---

## Sezione 1 — Caricamento dati (server)

`app/r/[token]/page.tsx`:
- Aggiungere `tipo` alla select del rapportino e passarlo al client (`RapportinoForm`).
- Quando `tipo='risanamento'`, caricare anche le **righe**: `rapportino_righe` where `rapportino_id`
  (tutte le righe del rapportino), passarle al client raggruppabili per `voce_id`.

## Sezione 2 — Aggancio rendering (client)

`components/modules/rapportini/RapportinoForm.tsx`: riceve `tipo` e `righe`. Quando
`tipo==='risanamento'`, rende un nuovo componente **`RisanamentoView`** invece di lista/focus standard
(il resto del form standard resta invariato per `tipo='standard'`).

## Sezione 3 — Componenti UI (nuovi)

- **`RisanamentoView`** — orchestratore: *lista civici* (riusa lo stile della lista voci) ↔ *dettaglio
  civico*. Tiene lo stato "civico aperto" e la lista righe in memoria (aggiornata dopo ogni save).
- **`RisanamentoCivico`** — dettaglio di un civico: header (via/civico/comune) + 3 sezioni:
  - **Misuratori**: lista righe (`rapportino_righe` della voce) con matricola/nominativo + stato foto
    (prima/dopo ✓/✗); bottone **"+ Aggiungi misuratore"** → form (matricola obbligatoria, PDR/nominativo
    opzionali) → crea riga (`fonte='manuale'`). Tap su una riga → slot foto `scope='misuratore'`.
  - **Fasi**: slot foto `scope='fase'` a livello civico (salvati in `voce.risposte`).
  - **Accessorie**: slot foto `scope='accessoria'`, **opzionali-attivabili** (bottone "+ <etichetta>"
    per attivare lo slot e caricare la foto).
- **`RigaMisuratore`** — una riga: anagrafica + gli slot foto misuratore (prima/dopo) via `CampoFoto`.
- I campi foto delle 3 sezioni si ottengono filtrando `campi_snapshot` per `tipo==='foto'` e
  `scope_foto` (misuratore/fase/accessoria; default 'misuratore' se assente).

## Sezione 4 — Endpoint righe

`POST /api/r/[token]/riga` (nuovo):
- Valida token + rapportino modificabile (come gli altri endpoint `/r/[token]`).
- Body: `{ voceId: string, rigaId?: string, matricola: string, pdr?: string, nominativo?: string, risposte?: Record<string, unknown>, creato_da?: string }`.
- Se `rigaId` assente → **INSERT** nuova riga (`fonte='manuale'`, `ordine` = max(ordine)+1 per quella voce, `risposte` = {}).
- Se `rigaId` presente → **UPDATE** della riga (merge `risposte`, eventuale aggiornamento anagrafica).
- Ritorna la riga salvata (`{ id, voce_id, matricola, pdr, nominativo, risposte, ordine }`).
- Insert atomico → concorrenza multi-operatore sicura (ogni aggiunta è un INSERT indipendente).

## Sezione 5 — Flussi foto

- **Foto-riga (misuratori, prima/dopo):** `CampoFoto` comprime → `POST foto-campo` ritorna `path` →
  `POST /riga` con `risposte[slot]=path` (aggiorna la riga). Riuso totale di `foto-campo` (salva nel
  bucket `interventi-foto`, path `rapportini/{rapportino_id}/{uuid}.ext`).
- **Foto-civico (fasi, accessorie):** `CampoFoto` → `foto-campo` → `path` → `POST /api/r/[token]/voce`
  con `risposte[slot]=path` (la voce-civico). Riuso dell'endpoint `voce` esistente.

## Data flow

```
/r/[token] (tipo='risanamento') → RapportinoView → lista civici → apre civico
   Misuratori: "+ Aggiungi" → /riga (INSERT) → riga; tap riga → CampoFoto → foto-campo → /riga (UPDATE risposte[prima|dopo])
   Fasi/Accessorie: CampoFoto → foto-campo → /voce (risposte[slot])
```

## Error handling

- Token scaduto/inviato → endpoint `/riga` risponde 409 (come gli altri `/r/[token]`).
- `matricola` vuota all'aggiunta riga → 422 (in 4a la matricola è il minimo richiesto per identificare la riga).
- Foto upload fallito → il path non viene salvato; l'UI mostra l'errore (come `CampoFoto` già fa).
- Accessoria non attivata → semplicemente non mostrata/non compilata (è opzionale).

## Testing

- Unit: helper di partizione campi foto per scope (`campiPerScope(campiSnapshot)` → `{misuratore, fase, accessoria}`), puro e testabile.
- Unit: calcolo `ordine` nuova riga (max+1) se isolato in helper.
- Endpoint/UI: verifica via `tsc`/`eslint`/`build` (route e UI non testate in E2E nel progetto). La verifica funzionale reale la fa l'utente dopo la migration.

## Fuori scope (YAGNI / fasi successive)

- **Scanner barcode/QR + lookup matricola + barra di ricerca "dopo"** (Fase 4b): in 4a la matricola si digita e si naviga manualmente (lista righe → tap per completare il "dopo").
- **Vincolo di chiusura** (doppia foto per riga), **conteggio punti gas + conferma**, **spostamento in archivio**, **PDF** (Fase 5).
- Nessuna modifica al rendering dei rapportini `standard`.
