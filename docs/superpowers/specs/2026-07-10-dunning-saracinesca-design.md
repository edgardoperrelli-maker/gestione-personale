# Popola colonna "Saracinesca" nel master DUNNING

Data: 2026-07-10

## Contesto

Il file ZAGAROLO.xlsx (limitazioni massive) ha già la colonna "saracinesca" popolata
dall'agente: il giro cartella (`eseguiGiro` / `agente.mjs`) legge `l.saracinesca` da
`/api/export/limitazioni-massive` e la scrive riga per riga.

Il master DUNNING ("LIMITAZIONI CON ORDINE.xlsx", foglio PIANIFICAZIONE) ha già una
colonna "Saracinesca" nel file ma NON viene mai scritta: il giro che tocca quel file
(`eseguiGiroAcea` → `aggiornaStatoXlsx`) legge SOLO l'export del Cruscotto ACEA
(Ordine + Stato Operazione), che non contiene l'informazione saracinesca. Il dato
saracinesca esiste solo nel nostro DB (rapportino_voci, template a checkbox/testo).

Verifica sul DB prod (2026-07-10): 196 interventi `committente='acea'` completati con
saracinesca "SI". Di questi, 173 hanno `intervento_tipo` che contiene "limitaz"/"massiv"
(passerebbero l'endpoint lim-massive esistente), 23 hanno altri tipi (Sospensione
fornitura, Rimozione misuratore per morosità, Regolarizzazione flusso idrico, ecc.) e
non passerebbero quel filtro.

## Obiettivo

Far scrivere all'agente "SI" nella colonna "Saracinesca" del master DUNNING, per ogni
Ordine per cui il nostro DB registra una saracinesca sostituita — copertura completa
(tutti i 196, non solo i 173 con tipo "limitazione").

## Decisioni

- **Righe target**: tutte le righe del master con quell'Ordine (come ZAGAROLO),
  indipendentemente dal fatto che lo Stato Operazione cambi in quel giro.
- **Chiave di aggancio**: solo Ordine (non Ordine+Matricola). Se il DB ha saracinesca
  "SI" per un ODL, tutte le righe master con quell'Ordine vengono marcate.
- **Colonna master**: "Saracinesca" (nome esatto, già presente nel file).
- **Copertura dati**: TUTTI gli interventi completati con odl+saracinesca valorizzati,
  nessun filtro per `intervento_tipo`, nessuna finestra data (storico completo) — non il
  riuso dell'endpoint lim-massive esistente.
- **Marcatore Automazione**: le righe toccate SOLO per la saracinesca (stato non
  cambiato in quel giro) devono comunque integrare la colonna "Automazione" con
  "Saracinesca" (es. "SI + Saracinesca"), non lasciarla invariata.

## Architettura

```
DB (interventi + rapportino_voci)
  → GET /api/export/acea-saracinesche   (nuovo endpoint app)
  → fetchSaracinesche (agente, apiAgente.mjs)
  → eseguiGiroAcea (solo target 'dunning')
  → aggiornaStatoXlsx (scrive colonna Saracinesca + integra Automazione)
  → master DUNNING xlsx
```

### 1. Endpoint `GET /api/export/acea-saracinesche` (app)

- File: `app/api/export/acea-saracinesche/route.ts`.
- Auth: `chiaveValida` (stessa x-export-key degli altri export). `runtime = 'nodejs'`.
- Nessun parametro data richiesto (storico completo). Query:
  `interventi` con `stato='completato' AND odl IS NOT NULL`, join `rapportino_voci`
  per leggere `sostituzione_valvola` / `sost_valvola`, tradotti con
  `valoreSaracinesca` (riuso da `lib/limitazione/exportLimMassive.ts`: gestisce già
  booleano→"SI" e scarta path-foto). Paginazione 1000 righe (come l'endpoint esistente).
  NIENTE filtro su `committente`/`intervento_tipo`.
- Aggregazione pura e testabile in `lib/limitazione/aceaSaracinesche.ts`:
  `aggregaSaracinescaPerOdl(righe: {odl, saracinesca}[]): {odl, saracinesca}[]`
  — dedup per odl (norm), "SI" vince su vuoto, odl vuoto scartato.
- Risposta: `{ count, righe: [{ odl, saracinesca }] }`.

### 2. Client agente — `fetchSaracinesche` (`tools/limitazioni-sync/lib/apiAgente.mjs`)

- `GET {baseUrl}/api/export/acea-saracinesche` con header `x-export-key`.
- **Best-effort**: qualunque errore (rete, 5xx, JSON) → ritorna `[]` e logga; NON deve
  mai bloccare o far fallire la scrittura dello Stato Operazione.

### 3. `eseguiGiroAcea` — wiring

- Il fetch saracinesche avviene SOLO quando `target === 'dunning'` e la config ha
  `masterColonnaSaracinesca` valorizzata.
- Costruisce una `Map(norm(odl) → 'SI')` e la passa a `aggiornaStatoXlsx` insieme al
  nome colonna.
- Target `zagarolo`: invariato, nessuna chiamata al nuovo endpoint (la saracinesca di
  ZAGAROLO arriva già dal giro cartella).

### 4. `aggiornaStatoXlsx` — scrittura colonna Saracinesca

- Nuovi parametri opzionali: `masterColonnaSaracinesca`, `saracinescaMap`.
- Risolve `colSaracinesca` dall'header con lo stesso meccanismo tollerante già usato
  per Ordine/Stato/Automazione. Se la colonna non si trova: soft-skip (nessun errore
  globale), la scrittura stato prosegue normalmente.
- Per ogni riga dati (stessa scansione già esistente, righe > rigaHeader) con un
  Ordine agganciato nella `saracinescaMap`:
  - cella vuota → scrive "SI" (cella inline-string, stile preservato, stessa tecnica
    chirurgica già usata per Stato/Automazione);
  - cella già "SI" → salta (idempotente, nessuna scrittura);
  - cella con altro valore non vuoto → **conflitto** (aggiunto al report), MAI
    sovrascritta.
- Questo controllo gira indipendentemente dal fatto che la riga abbia anche un
  cambiamento di Stato Operazione in questo giro (unione, non condizionato).
- **Automazione**: nuovo helper puro `componiAutomazione(valoreEsistente, tagsDaAggiungere: string[])`
  che integra i tag mancanti senza duplicarli (es. esistente `""` + `["Saracinesca"]`
  → `"SI + Saracinesca"`; esistente `"SI + Stato Operazione"` + `["Saracinesca"]` →
  `"SI + Stato Operazione + Saracinesca"`; se il tag è già presente, invariato).
  Usato per comporre il marcatore quando la riga cambia stato E/O saracinesca in questo
  giro.
- Le sostituzioni saracinesca entrano nello stesso array `sostituzioni` esistente:
  se una riga cambia SOLO la saracinesca, il file viene comunque scritto (il file non
  viene più saltato quando `sostituzioni.length === 0`, perché ora può essere non-zero
  per sola saracinesca).
- Report: nuovo contatore `saracinescaScritte`; righe con `tipo: 'acea-saracinesca'`
  aggiunte a `righe` per lo storico quando la riga è toccata solo per questo; i
  conflitti saracinesca finiscono nella lista conflitti esistente con `campo:
  'saracinesca'`.

### 5. Config

- Aggiungere `masterColonnaSaracinesca: "Saracinesca"` a livello radice `acea` in
  `tools/limitazioni-sync/config.example.json` (accanto a `masterColonnaAutomazione`).
- Aggiornare anche il `config.json` reale su questo PC (l'agente gira da qui, non è nel
  repo — vedi promemoria "Aggiorna sempre tu l'agente su questo PC").

### 6. Test

- `lib/limitazione/aceaSaracinesche.test.ts`: SI vince su vuoto, booleano→SI (via
  `valoreSaracinesca` già testato), path-foto scartato, dedup per odl, odl vuoto
  ignorato.
- `componiAutomazione` (funzione pura, co-locata con `aggiornaStatoXlsx.mjs` o in un
  file separato testabile): composizione senza doppioni, idempotenza.
- `aggiornaStatoXlsx.test.ts` (estensione dei test esistenti): riempi cella vuota,
  salta se già "SI", conflitto se valore diverso, scrittura quando SOLO la saracinesca
  cambia (nessun cambio stato), integrazione del marcatore Automazione, AutoFiltro e
  stile del foglio preservati dopo la scrittura.

### 7. Error handling

- Fetch saracinesche best-effort (mai blocca lo stato).
- Colonna "Saracinesca" assente dal master → soft-skip, nessun errore globale.
- Conflitto (valore diverso già presente) → mai sovrascritto, riportato per revisione
  manuale, coerente con la policy "riempi-vuote + segnala conflitti" già usata ovunque
  nell'agente.
- Idempotente: rilanciare il giro sulle stesse righe non produce nuove scritture né
  falsi conflitti.

## Scope escluso (YAGNI)

- Nessuna colonna "Odl saracinesca" (figlio) per il DUNNING — solo la colonna
  "Saracinesca" già esistente nel file.
- Nessun aggancio per matricola: solo Ordine, come deciso.
- Nessuna modifica al flusso ZAGAROLO/lim-massive (già funzionante).

## Rilascio

- `aggiornaStatoXlsx.mjs` e `eseguiGiroAcea.mjs` sono file automazione ACEA BLINDATI
  (hook `guard-acea.mjs`): modifiche solo su richiesta/conferma esplicita (già data per
  questa feature).
- Lavoro in worktree da `origin/main` → PR (pattern standard per modifiche APP).
- Dopo merge: `git pull` nel repo principale su questo PC (l'agente gira da qui, non
  dai worktree) + **riavvio dell'agente** (il driver/giro ACEA è in cache ES) +
  aggiornamento del `config.json` reale con `masterColonnaSaracinesca`.
- L'endpoint nuovo va live su Vercel al merge (deploy automatico).
