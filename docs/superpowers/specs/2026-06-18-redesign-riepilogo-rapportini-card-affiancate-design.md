# Riepilogo rapportini — card affiancate, ordine per giorno e spostamento di giorno

**Data:** 2026-06-18
**Stato:** Design approvato — in sviluppo
**Tipo:** Redesign UX + nuova azione di spostamento (giorno)
**Base:** evolve [`2026-06-05-riepilogo-rapportini-redesign-design.md`](2026-06-05-riepilogo-rapportini-redesign-design.md) (che introdusse il raggruppamento per territorio) e si innesta sullo spostamento territorio già in produzione (`territorio_override`).

---

## 1. Contesto

Il modulo è [`components/modules/mappa/RiepilogoRapportini.tsx`](../../../components/modules/mappa/RiepilogoRapportini.tsx), montato in `/hub/mappa?vista=riepilogo`. Carica da `GET /api/mappa/rapportini/riepilogo` e raggruppa con [`utils/rapportini/groupByDayTerritory.ts`](../../../utils/rapportini/groupByDayTerritory.ts) in **Giorno → Territorio → Piano/i → Operatori**.

### Modello dati rilevante (verificato, nessuna migrazione necessaria)

- **`rapportini.data`** (YYYY-MM-DD) è il **giorno** della pianificazione. Da essa derivano:
  - la **scadenza del link**: `expires_at = scadenzaIso(data)` = mezzanotte Europe/Rome di `data + 2 giorni` ([`utils/rapportini/scadenza.ts`](../../../utils/rapportini/scadenza.ts));
  - lo **stato calcolato** valido/scaduto/inviato ([`utils/rapportini/tokenStatus.ts`](../../../utils/rapportini/tokenStatus.ts)).
- **`mappa_piani.data`** e **`mappa_piani.territorio`**: la testata del piano (normalmente `mappa_piani.data == rapportini.data`).
- **`territorio_override`** sul rapportino: spostamento di territorio per-rapportino già in produzione, risolto da [`territorioEffettivo`](../../../utils/rapportini/territorioEffettivo.ts).
- **`interventi.data`** e `interventi.piano_id`: gli interventi canonici creati dal piano portano anch'essi la data del giorno.
- **`mappa_distribuzioni`** (`staff_id`, `data` → `task_count`): contatori del cronoprogramma, in upsert `onConflict: staff_id,data`.

### Problemi attuali (obiettivi del redesign)

1. **Ordine confuso.** I giorni sono in ordine **decrescente puro** (`groupByDayTerritory` ordina `data` desc): "domani" finisce **sopra** "oggi". L'operativo del giorno non è in evidenza.
2. **Card impilate verticalmente.** Le pianificazioni dello stesso giorno stanno in colonna; manca un colpo d'occhio affiancato.
3. **Annidamento multi-piano.** Quando un territorio ha più piani, compaiono come sotto-blocchi annidati "Piano · creato HH:MM" dentro la card territorio — poco leggibile.
4. **Manca lo spostamento di giorno.** Si può spostare un rapportino solo di **territorio** (`↪`). Una pianificazione creata sul giorno sbagliato (es. *domani* invece di *oggi*) con link **già compilati** non è correggibile senza eliminare e ricreare (perdendo il lavoro compilato).

---

## 2. Obiettivi e non-obiettivi

### Obiettivi
- **Card per pianificazione affiancate**: una card per piano, territorio come etichetta; disposte in **griglia che va a capo** per lo stesso giorno.
- **Ordine con oggi in cima**: giorno corrente primo ed evidenziato, poi futuri (crescente), poi passati (decrescente).
- **Spostamento di giorno**: nuova azione, sia per **singolo operatore** sia per **intera pianificazione** (piano), oltre allo spostamento di territorio già esistente.
- **A livello di pianificazione**: poter spostare **giorno e/o territorio** dell'intero piano in un'unica azione.
- **Tutti i tasti funzione attuali invariati** (copia link, riapri, WhatsApp, vedi, export, foto, sposta, rimuovi; Riapri/Elimina piano).

### Non-obiettivi (YAGNI)
- Nessuna **fusione/merge** automatica di pianificazioni: due piani sullo stesso territorio/giorno restano **due card separate**.
- Nessuna modifica al flusso di compilazione operatore (`/r/[token]`), ai token, alle voci compilate.
- Nessuna modifica di schema / **nessuna migrazione SQL** (tutti i campi necessari esistono).
- Nessun nuovo filtro oltre a quelli attuali (Periodo, Territorio, Operatore, Stato, ricerca restano com'è).

---

## 3. Decisioni di design (confermate con l'utente)

| Tema | Decisione |
|------|-----------|
| Unità della card | **Una card per pianificazione** (piano); territorio = etichetta in testa |
| Multi-piano stesso territorio/giorno | **Due card affiancate** distinte (ora di creazione per distinguerle); niente più annidamento |
| Ordine dei giorni | **Oggi in cima** ed evidenziato → futuri (asc) → passati (desc) |
| Disposizione card nel giorno | **Griglia responsive `auto-fit`** che va a capo (scroll verticale) |
| Spostamento di giorno — granularità | **Piano intero** (azione principale) **+ singolo operatore** |
| Azione "Sposta piano" | Offre **giorno e/o territorio** dell'intero piano |
| Conflitto allo spostamento | Blocca/avvisa **solo** se crea un **duplicato dello stesso operatore** nello stesso `territorio + giorno`. Stesso territorio con operatori diversi → consentito (card separate) |
| Spostamento nel passato | Consentito; **avviso non bloccante** se il link risulterà scaduto (riapribile con 🔒) |
| Rapportini inviati | Restano **inviati**; cambia solo la data di competenza e la scadenza |

---

## 4. Architettura — UI

### Ordinamento e raggruppamento

- Nuovo helper puro **`utils/rapportini/ordinaGiorni.ts`**: dato l'elenco di giorni (`YYYY-MM-DD`) e `oggi`, ritorna l'ordine **oggi → futuri (asc) → passati (desc)**.
- Raggruppamento **Giorno → Pianificazione (piano)**: si riusa la struttura già presente in [`utils/rapportini/groupByDay.ts`](../../../utils/rapportini/groupByDay.ts) (`groupRapportiniByDay` produce già `Giorno → piani[]`), estesa per portare **etichetta territorio effettivo**, **`piano_creato_at`** e ordinamento interno. La card è identificata da `(data, piano_id)`.
- Ordinamento interno a un giorno: per **territorio** (etichetta, asc), poi per **ora di creazione** del piano.
- `groupByDayTerritory.ts` viene **dismesso** dal riepilogo (è usato solo qui → rimovibile con il suo test).

### Componenti (refactor di `RiepilogoRapportini.tsx` in unità piccole)

- **`RiepilogoRapportini`** — contenitore: caricamento dati (invariato), stato filtri (invariato), nuovo ordine/raggruppamento, handler `onSpostaData` (operatore) e `onSpostaPiano` (piano), gestione conflitti/avvisi.
- **`IntestazioneGiorno`** — data estesa + badge relativo (`Oggi` evidenziato / `Domani` / `Ieri` / nessuno) + conteggi `N piani · N operatori · N interventi`.
- **`CardPianificazione`** (sostituisce [`CardTerritorio`](../../../components/modules/mappa/riepilogo/CardTerritorio.tsx)) — header: etichetta territorio + ora di creazione + azioni di piano (`↗ Riapri`, `Sposta piano ▾`, `🗑 Elimina`); corpo: righe operatore con **tutti i tasti attuali invariati** + menu sposta esteso.
- **`MenuSposta`** — menu condiviso tra riga-operatore (territorio | giorno) e header-piano (giorno | territorio | entrambi); apre il `DatePicker` per il giorno e un select per il territorio. Riusa [`components/ui/DatePicker.tsx`](../../../components/ui/DatePicker.tsx) (tema mappa).
- Layout giorno: `display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))`.

---

## 5. Architettura — Spostamento

### 5.1 Spostamento di un singolo operatore (rapportino)

- **Giorno** → nuovo endpoint **`PATCH /api/mappa/rapportini/data`** (`requireAdmin`), body `{ rapportinoId, data }`. Aggiorna **solo** `rapportini.data` + ricalcola `expires_at = scadenzaIso(data)`. **Non** tocca token, voci, `mappa_piani`, interventi. Speculare a [`/api/mappa/rapportini/territorio`](../../../app/api/mappa/rapportini/territorio/route.ts).
- **Territorio** → invariato (`/territorio`, `territorio_override`).
- Modello "leggero": come l'override territorio, il singolo rapportino può divergere dalla testata del suo piano.

### 5.2 Spostamento di un'intera pianificazione (piano)

- Nuovo endpoint **`PATCH /api/mappa/piani/sposta`** (`requireAdmin`), body `{ pianoId, data?, territorio? }` (almeno uno presente). In un'unica operazione orchestrata (helper `lib/interventi/spostaPiano.ts`, parte pura testabile):
  - **`data`** presente → aggiorna `mappa_piani.data`; per **ogni** rapportino del piano: `rapportini.data` + `expires_at`; `interventi.data` (per `piano_id`); riallinea `mappa_distribuzioni` (sposta `task_count` da `(staff_id, vecchiaData)` a `(staff_id, nuovaData)`).
  - **`territorio`** presente → aggiorna `mappa_piani.territorio` (default: azzera eventuali `territorio_override` divergenti dei suoi rapportini, così la card riflette il nuovo territorio del piano).
- Token e voci compilate **intatti** → risolve il caso "domani→oggi" con un click.

### 5.3 Regola di conflitto (duplicato operatore)

Vincolo invariante: **nessun doppio rapportino dello stesso `staff_id` sullo stesso `territorio + data`**.

- Prima di applicare lo spostamento, si calcola se la destinazione `(territorio effettivo, data)` contiene **già** un rapportino di uno degli operatori coinvolti, su un **piano diverso**. Si riusa la logica di [`utils/rapportini/rilevaConflitti.ts`](../../../utils/rapportini/rilevaConflitti.ts) (già lavora su `territorio + data + staff`).
- **Nessun conflitto** → applica.
- **Conflitto** → **non scrive**, risponde `409 { conflicts: [{ staff_id, staff_name, territorio, data }] }`. La UI mostra un avviso che elenca gli operatori in conflitto.
- Spostamento di **piano** con conflitto su anche un solo operatore → **blocca l'intero spostamento** (non si spezza il piano) ed elenca i conflitti; l'admin risolve (rimuove/sposta l'operatore o sceglie altro giorno) e riprova.
- Stesso territorio, operatori **diversi** → **non** è conflitto: due card separate.

---

## 6. Contratti dati / API

- `GET /api/mappa/rapportini/riepilogo` — **invariato** (restituisce già `piano_creato_at`, `territorio` effettivo, `nVoci`, stato calcolato).
- `PATCH /api/mappa/rapportini/data` — **nuovo**. In: `{ rapportinoId, data }`. Out ok: `{ ok: true }`. Out conflitto: `409 { conflicts }`.
- `PATCH /api/mappa/piani/sposta` — **nuovo**. In: `{ pianoId, data?, territorio? }`. Out ok: `{ ok: true }`. Out conflitto: `409 { conflicts }`.
- `PATCH /api/mappa/rapportini/territorio` — **invariato**.
- Nessuna modifica di schema; nessuna migrazione SQL.

---

## 7. Gestione errori / casi limite

- **Link già compilato/inviato** (scenario tipico): cambia solo data e scadenza; gli inviati restano inviati, gli in corso conservano token e dati.
- **Spostamento nel passato**: se `scadenzaIso(nuovaData)` è già trascorsa, **avviso non bloccante** prima di confermare ("il link risulterà scaduto, riapribile con 🔒").
- **Conflitto operatore**: bloccato con elenco operatori (vedi §5.3).
- **`territorio_override` divergente** durante uno spostamento: lo spostamento di **giorno** lo preserva (cambia solo la data). Lo spostamento di **territorio di piano** lo normalizza al nuovo territorio.
- **`mappa_distribuzioni`**: contatori sempre coerenti dopo lo spostamento di un piano (decremento sorgente, incremento destinazione).
- **Filtri che azzerano i risultati**: stato vuoto invariato.

---

## 8. Testing

Unità pure (coerenti con il TDD del progetto):
- `ordinaGiorni`: oggi in cima; futuri ascendenti; passati discendenti; assenza di "oggi" nei dati.
- raggruppamento per piano: una card per `(data, piano_id)`; etichetta territorio effettivo; ordinamento interno territorio→ora.
- ricalcolo scadenza: `expires_at` corretto dopo cambio data (riusa/estende [`scadenza.test.ts`](../../../utils/rapportini/scadenza.test.ts)).
- conflitto operatore: duplicato `staff+territorio+data` cross-piano rilevato; stesso territorio operatori diversi → nessun conflitto; territorio null → nessun conflitto.

Verifica manuale: ordine giorni (oggi in cima); card affiancate in griglia; sposta singolo operatore di giorno (link e scadenza aggiornati, voci intatte); sposta piano "domani→oggi" (tutti gli operatori + interventi + contatori); blocco su conflitto operatore; avviso su spostamento nel passato.

> Nota lint/test: baseline di `npm run lint` e `npx vitest run` è già rossa su main (problemi preesistenti). Il gate è "nessun nuovo problema dai file toccati" — verificare con `npx eslint <path>` e `npx vitest run <file>`.

---

## 9. File toccati (stima)

**Nuovi**
- `app/api/mappa/rapportini/data/route.ts` (PATCH giorno per rapportino)
- `app/api/mappa/piani/sposta/route.ts` (PATCH giorno e/o territorio per piano)
- `lib/interventi/spostaPiano.ts` (+ test) — orchestrazione + parte pura (righe da aggiornare, scadenze, distribuzioni)
- `utils/rapportini/ordinaGiorni.ts` (+ test)
- `utils/rapportini/groupByDayPiano.ts` (+ test) *(o estensione di `groupByDay.ts`)*
- `components/modules/mappa/riepilogo/CardPianificazione.tsx`
- `components/modules/mappa/riepilogo/IntestazioneGiorno.tsx`
- `components/modules/mappa/riepilogo/MenuSposta.tsx`

**Modificati**
- `components/modules/mappa/RiepilogoRapportini.tsx` (ordine/raggruppamento nuovi, handler sposta-giorno/piano, avvisi)
- `components/modules/mappa/riepilogo/CardTerritorio.tsx` → sostituito da `CardPianificazione`
- *(eventuale)* `utils/rapportini/groupByDayTerritory.ts` (dismesso dal riepilogo, rimosso se non più usato)

---

## 10. Aperti / da decidere in fase di piano
- Etichetta badge giorno per i giorni lontani: solo `Oggi/Domani/Ieri` o anche distanze relative ("tra 3 giorni")? (default: solo i tre vicini).
- `DatePicker` inline nel menu vs popover dedicato (default: riuso `components/ui/DatePicker.tsx`).

---

## 11. Revisione 2026-06-18 (post-deploy) — card unica per territorio con piani evidenziati

Dopo il deploy iniziale (una card per pianificazione), l'utente ha richiesto di **unire le card dello stesso territorio** in un'unica card e dare **evidenza interna** che le pianificazioni sono state fatte in momenti diversi.

Nuova decisione (sostituisce "una card per pianificazione"):
- **Una card per territorio** (raggruppamento Giorno → Territorio → Piani); ordine giorni invariato (oggi in cima via `ordinaGiorni`).
- **Un solo piano nel territorio**: card semplice, azioni piano (↗ Riapri / Sposta piano ▾ / 🗑 Elimina) nell'header del territorio.
- **Più piani**: header territorio con etichetta + badge "N pianificazioni" + N operatori; poi, per ogni piano, una **fascia evidenziata** `Pianificazione N · creata HH:MM` (icona orologio, sfondo soft) con le azioni di quel piano, gli operatori sotto, e un **divisore netto** tra una pianificazione e l'altra. Piani ordinati per `creato_at` asc (Pianificazione 1 = più vecchia).
- Invariati: `MenuSposta` (territorio | giorno) per operatore e per piano, tutti i tasti funzione, blocco conflitti, avviso passato.

File: ripristino `utils/rapportini/groupByDayTerritory.ts` (ora basato su `ordinaGiorni`) e `components/modules/mappa/riepilogo/CardTerritorio.tsx` (con fasce-piano); `IntestazioneGiorno` passa al tipo `GiornoTerritori`; `RiepilogoRapportini` usa il raggruppamento per territorio. Rimossi `groupByDayPiano.ts` e `CardPianificazione.tsx`.
