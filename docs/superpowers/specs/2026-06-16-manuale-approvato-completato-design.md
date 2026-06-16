# Richiesta manuale "+" — Parte B: no doppio lavoro — design

Data: 2026-06-16
Stato: design approvato (durante il brainstorming) → spec di dettaglio

## Problema

Oggi l'operatore, per una richiesta manuale "+", carica foto e dati e la manda in
approvazione. All'approvazione, `richiestaToIntervento` crea l'intervento con
`stato='assegnato'` ed esito nullo → l'intervento finisce nell'agenda come "da fare"
finché un sync (`sincronizzaRapportini`/`esitoInterventoDaVoce`) non lo completa.
È la finestra in cui nasce il **doppio lavoro**: l'operatore rischia di dover "ri-esitare"
l'intervento (ricaricando foto/dati) dopo averlo già fatto in fase di richiesta.

In produzione: 52 interventi `origine='manuale'` sono già `completato/eseguito_positivo`,
ma 20 sono ancora `assegnato/null`.

## Obiettivo

Il processo deve essere **una sola volta**: l'operatore carica foto + compila i campi
azione (resi **obbligatori**) → invia → approvazione → **completato**. Niente passaggio
in agenda, niente ri-esitazione, niente ri-caricamento foto.

Premessa confermata: il "+" manuale è **sempre a esito positivo**.

## Design

### 1. Campi azione obbligatori bloccanti (client)

In `ModaleInterventoManuale.handleInvia` la validazione dei campi obbligatori
(`campiObbligatoriMancanti`) oggi è un `window.confirm("…Inviare comunque?")`
(by-passabile). Diventa **bloccante**: se mancano campi obbligatori, mostra un errore
e **non** invia.

I campi "azione" obbligatori sono quelli marcati `obbligatoria` nel template (li imposta
l'ufficio nell'editor). Le foto obbligatorie restano già bloccanti come oggi.

### 2. Approvazione crea l'intervento già completato (helper puro)

`richiestaToIntervento` (PURA) cambia il record prodotto:
- `stato: 'assegnato'` → `stato: 'completato'`
- aggiunge `esito: 'eseguito_positivo'` (il "+" è sempre positivo)

Effetto: all'approvazione l'intervento nasce **completato/eseguito_positivo**, coerente
con i 52 già così e con quanto produce il sync `esitoInterventoDaVoce` (verde →
`eseguito_positivo`). Non entra in agenda, non va ri-esitato. Il sync esistente resta
idempotente (ri-settare completato è innocuo).

`taskToIntervento` (interventi pianificati, che l'operatore esita davvero) resta
`'assegnato'`: cambia **solo** il flusso manuale.

### 3. Foto: nessun lavoro

Le foto della richiesta restano in `interventi_manuali_foto` (collegate a `richiesta_id`),
già lette dal backoffice (pannello revisione, foto-zip). L'intervento completato non
richiede un secondo caricamento. Nessuna migrazione, nessuna copia.

## Componenti e modifiche

- **`components/modules/rapportini/ModaleInterventoManuale.tsx`** (`handleInvia`):
  sostituire il `window.confirm` dei campi obbligatori con un blocco (errore + return).
- **`lib/interventi/manuali/richiestaToIntervento.ts`** (PURA):
  `stato: 'completato'` + `esito: 'eseguito_positivo'` nel record e nel tipo
  `InterventoManualeRecord`.
- **`lib/interventi/manuali/richiestaToIntervento.test.ts`**: aggiornare le asserzioni
  (stato/esito) + caso che verifica `esito='eseguito_positivo'`.
- Nessuna migration.

## Gestione errori / compatibilità

- Offline: il payload manuale ri-giocato dal server è invariato; il blocco obbligatori
  è lato modale (l'invio offline parte solo da una modale già validata).
- Idempotenza approvazione (check-and-set `stato='in_attesa'`) invariata.
- I 20 interventi manuali già `assegnato/null` non sono toccati dal codice; eventuale
  allineamento è un fix dati separato (opzionale) — il sync li completa comunque.

## Testing

- Unit (vitest) su `richiestaToIntervento`: record con `stato='completato'` e
  `esito='eseguito_positivo'`.
- Verifica mirata: lint + typecheck sui file toccati; suite `lib/interventi/`.
- Manuale (post-deploy): approvare una richiesta "+" → l'intervento risulta
  `completato/eseguito_positivo` e non compare come "da fare"; le foto sono quelle
  della richiesta (nessun ri-caricamento).

## Fuori scope

- Tool di recupero foto in Lista attesa (Parte 3, spec separata).
- Backfill dei 20 interventi manuali `assegnato` esistenti (fix dati opzionale).
- Enforcement server-side dei campi azione obbligatori (possibile hardening futuro;
  oggi il blocco è nella modale, le foto obbligatorie restano server-side).
