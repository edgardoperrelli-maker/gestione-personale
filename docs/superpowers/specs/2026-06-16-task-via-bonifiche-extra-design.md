# Task-via "BONIFICHE EXTRA" — affidare interventi a sola via — design (Fase 1)

Data: 2026-06-16
Stato: design approvato → spec di dettaglio (Fase 1)

## Vincoli NON negoziabili

- **Additivo**: non cambiare il comportamento delle voci/interventi esistenti. Tutto il
  nuovo flusso si attiva SOLO per i "task-via" (voci con `attivita === 'BONIFICHE EXTRA'`).
- **Niente perdita dati**: nessuna scrittura distruttiva; la migrazione aggiunge solo una
  colonna nullable; il "+" mantiene il flusso offline-first già esistente (anti-perdita).

## Problema / obiettivo

L'ufficio ha **solo la via** (niente PDR/matricola). Vuole affidare a un operatore una
lista di vie; l'operatore, sul posto, crea per ogni via uno o più interventi col flusso
"+" (mettendo lui la matricola), che vanno in Lista attesa, vengono completati dal
backoffice e approvati.

## Modello

- Il **task-via** è una normale voce di pianificazione con `attivita = 'BONIFICHE EXTRA'`
  e la sola `via` (l'ufficio la crea col proprio template di pianificazione "solo via").
  Discriminante: costante `ATTIVITA_TASK_VIA = 'BONIFICHE EXTRA'` (confronto trim/uppercase).
- Ogni intervento creato col "+" da quel task viene **collegato al task-via padre** tramite
  un nuovo campo `parent_voce_id` su `interventi_manuali` (nullable). Niente parent ⇒
  comportamento attuale identico.

## Flusso (Fase 1)

1. **Operatore** apre dal rapportino un task-via (attività BONIFICHE EXTRA). Invece del
   form esito standard, vede un nuovo schermo **`TaskViaFocus`**: la via in testa, il
   pulsante **"+ Aggiungi intervento"** e la lista degli interventi già creati per quella via.
2. Il "+" si apre **pre-compilato**: committente **Italgas** (template "Italgas mobile" =
   solo_manuale Italgas) + `via` del task. L'operatore aggiunge matricola/dati + foto e invia.
   L'intervento è auto-positivo (logica manuale esistente) e viene **collegato** al task-via.
3. L'operatore può creare **altri** interventi sullo stesso task-via o aprire un altro task.
4. **Backoffice** (Lista attesa) — invariato: apre, aggiunge i dati mancanti, verifica le
   foto, approva.
5. In `TaskViaFocus` l'operatore vede la lista dei suoi interventi per quella via con lo
   **stato** (in sospeso / approvato) e i dati attuali (aggiornati dal backoffice dopo l'approvazione).

## Componenti e modifiche (tutte additive)

- **Migrazione** `interventi_manuali`: `add column if not exists parent_voce_id uuid` (nullable,
  FK soft a `rapportino_voci`). **Passo manuale utente** (no DDL automatico sul prod).
- **`lib/interventi/manuali/taskVia.ts`** (PURO, con test): `ATTIVITA_TASK_VIA`,
  `isTaskVia(voce)` (true se `attivita` normalizzata === costante). Riusato lato operatore.
- **`components/modules/rapportini/RapportinoForm.tsx`**: nella vista `focus`, se la voce
  corrente è un task-via → render `TaskViaFocus`, altrimenti `VoceFocus` (invariato). Branch additivo.
- **`components/modules/rapportini/TaskViaFocus.tsx`** (nuovo): via + "+ Aggiungi intervento"
  (apre `ModaleInterventoManuale` pre-compilato con committente Italgas, via e `parentVoceId =
  voce.taskId ?? voce.id`) + lista interventi del task (fetch dedicata).
- **`components/modules/rapportini/ModaleInterventoManuale.tsx`**: prop **opzionali**
  `committenteIniziale?`, `anagraficaIniziale?`, `parentVoceId?`. Se presenti: pre-seleziona
  committente, pre-compila l'anagrafica (via) e passa `parentVoceId` al submit. Assenti ⇒
  comportamento attuale identico (FAB invariato). Il `parentVoceId` viaggia anche nel payload
  **offline** (`accodaManuale`/sync) per non perdersi.
- **`app/api/r/[token]/intervento-manuale/route.ts`**: legge `parent_voce_id` (FormData) e lo
  salva su `interventi_manuali.parent_voce_id`. Campo opzionale: se assente, insert come ora.
- **`app/api/r/[token]/task-via/[voceId]/route.ts`** (nuovo, GET): per il token, ritorna gli
  `interventi_manuali` con `parent_voce_id = voceId` → `[{ id, stato, matricola, esito, n_foto,
  approvato }]` per la lista in `TaskViaFocus`.
- **Lista attesa / approvazione**: invariate. Il `parent_voce_id` resta sulla richiesta; non
  cambia approvazione né creazione intervento.

## Setup a carico dell'utente (non codice)

- Template di pianificazione "solo via" (per importare i task-via con `attivita = 'BONIFICHE
  EXTRA'` + via + esecutore). Verifica che l'import accetti righe con solo via/attività/esecutore.
- Template "Italgas mobile" (già esistente, solo_manuale Italgas) usato dal "+".
- Lancio della migrazione `parent_voce_id`.

## Gestione errori / non-rottura

- `isTaskVia` è puro e isolato: nessun impatto sulle voci normali.
- Il "+" senza prop iniziali = identico a oggi (la FAB non passa nulla).
- `parent_voce_id` assente ⇒ insert come oggi. Offline: il payload con `parentVoceId` è
  additivo; i payload vecchi (senza) restano validi.
- Le child-voci create dal "+" continuano a comparire anche nella lista principale (come oggi):
  Fase 1 NON le nasconde (additivo). Eventuale "nascondi child dalla lista" → Fase 2.

## Testing

- Unit (vitest): `isTaskVia` (match/normalizzazione/negativi).
- Lint + typecheck mirati su tutti i file toccati; suite `lib/interventi/manuali/`.
- Verifica funzionale post-deploy: creare un task-via in pianificazione → l'operatore apre →
  "+" parte su Italgas + via → invia → arriva in Lista attesa con `parent_voce_id` valorizzato →
  approvazione → compare in `TaskViaFocus`.

## Fuori scope (Fase 2)

- Nascondere le child-voci dalla lista principale (mostrarle solo sotto il task-via).
- Eventuale "chiudi task-via / indirizzo completato".
- Raffinamenti di presentazione (dati backoffice ricchi, ordinamento, badge).
