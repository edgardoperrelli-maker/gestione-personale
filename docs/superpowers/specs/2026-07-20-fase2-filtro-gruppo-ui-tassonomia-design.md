# Fase 2 — Filtro agente su gruppo_attivita + UI Tassonomia attività

Data: 2026-07-20 · Stato: **approvato dall'utente in sessione** · Prosegue la fase 1
(`2026-07-20-motore-gruppo-attivita-design.md`, in produzione dal 20/07).

## 1. Contesto

Il motore tassonomia è in produzione: `attivita_tassonomia` (69 righe) governa import,
manuali e pianificazione, e `interventi.gruppo_attivita` è popolato (8.682 righe). Ma
l'endpoint export che alimenta l'agente lim-sync identifica ancora le limitazioni massive
col match testuale (`committente='lim_massive' OR intervento_tipo ILIKE '%limitaz%'/'%massiv%'`).

Misurato sui dati reali: il match testuale include per omonimia **~257 righe DUNNING in
finestra** ("Limitazione flusso idrico", "Revoca limitazione Flusso"…) che non c'entrano
coi master per-comune e possono al limite scrivere un esito su una riga massiva per
**collisione di matricola**. Il passaggio al gruppo chiude la fragilità testo E la
contaminazione. Verificato: 0 righe massive vere perse dal nuovo filtro (1061 vs 1318,
differenza = tutta contaminazione).

## 2. Scope (deciso con l'utente)

- **A. Filtro export su gruppo** (questa fase).
- **B. UI "Tassonomia attività"** in Impostazioni (questa fase).
- **NO riclassificazione `lim_massive`→`acea`**: tocca ~20 file con semantiche utili
  (anagrafica leggera del "+", cerca-matricola, blocco duplicati, produzione); col filtro
  su gruppo non compra nulla — `attivitaCanonica` già riclassifica per i KPI. Resta un
  marcatore di canale documentato.

## 3. A — Filtro export

- `app/api/export/limitazioni-massive/route.ts` (~riga 56): la `.or(...)` testuale diventa
  `.eq('gruppo_attivita', 'LIMITAZIONI MASSIVE')`. Nient'altro cambia nell'endpoint.
- **Pre-requisito dati**: fix one-shot della riga orfana (id `77e8d39b-…`, "+" del
  15/06/2026, Zagarolo, tipo vuoto, committente lim_massive): set
  `intervento_tipo='LIMITAZIONI MASSIVE'`, `gruppo_attivita='LIMITAZIONI MASSIVE'`
  (SQL in sessione principale, non migration: singola riga già identificata).
- **Il blocco duplicati matricola NON si tocca** (`app/api/admin/interventi-manuali/[id]/approva/route.ts`
  ~riga 100 conserva l'OR largo): lì la larghezza è protezione — un contatore già limitato
  dal DUNNING deve continuare a bloccare un doppio "+" massivo.
- Lato agente: zero modifiche (consuma l'endpoint). Rete di sicurezza: Guard 2 già attiva.
- Verifica: conteggio finestra pre/post deploy (atteso: nuovo ≈ 1061 al 20/07, nessuna
  massiva vera persa: query di confronto `esclusi`/`nuovi_inclusi`, quest'ultima = 0).

## 4. B — UI Tassonomia attività (Impostazioni)

Pattern di riferimento: pagina "Gruppo Attivita" dei sopralluoghi
(`app/impostazioni/gruppo-attivita/` + `app/api/admin/attivita/`) — che gestisce la tabella
`activities`, NON la tassonomia. La nuova pagina è distinta.

### 4.1 API `app/api/admin/attivita-tassonomia/route.ts`

Guard: `requireAdmin` (pattern esistente con `resolveUserRole`; ruolo `admin`).

- **GET** → `{ righe: [{ id, committente, descrizione, gruppo, attivo, utilizzo }] }`,
  con `utilizzo` = count di `interventi` per riga (match: `committente` equivalente +
  `attivita_norm(intervento_tipo) = descrizione_norm` — in pratica: count per
  `gruppo_attivita`+`intervento_tipo=descrizione` basta, lo storico è canonicalizzato).
- **POST** `{ committente, descrizione, gruppo }` → insert. Validazioni: committente ∈
  (acea|italgas|altro); descrizione non vuota (trim/spazi collassati, MAI uppercase forzato:
  la descrizione È la forma canonica che finirà su `interventi`); gruppo non vuoto (uppercase
  forzato: i gruppi sono maiuscoli per convenzione); duplicato su `(committente, descrizione_norm)`
  → 409 (il DB ha già l'unique + trigger che calcola `descrizione_norm`).
- **PATCH** `{ id, attivo }` → toggle SOLO di `attivo`. **Niente rename** di descrizione/gruppo/
  committente: la descrizione canonica è referenziata dallo storico; rinominare = POST nuova
  riga + PATCH attivo=false sulla vecchia (la UI lo spiega).
- **DELETE** `?id=` → solo se `utilizzo === 0`, altrimenti 409 con messaggio
  "già utilizzata: disattivala".

### 4.2 Pagina `app/impostazioni/attivita-tassonomia/`

`page.tsx` (wrapper `force-dynamic`) + `AttivitaTassonomiaClient.tsx` sul modello del
client sopralluoghi: lista ordinata per committente→gruppo→descrizione, ricerca testuale,
filtro stato (tutte/attive/disattive), contatori in testa (totale/attive/in uso), form di
aggiunta (committente select, descrizione input, gruppo = select dei gruppi esistenti con
opzione "Nuovo gruppo…" → input libero), toggle attivo per riga, elimina (con conferma)
solo se utilizzo=0. Feedback success/error come il pattern. Copy chiave nella UI: "Le
descrizioni non si rinominano: crea la nuova voce e disattiva la vecchia" e "Le nuove
attività sono subito valide per import mappa, template e manuali".

### 4.3 Menu

Voce in `app/impostazioni/page.tsx`:
`{ href: '/impostazioni/attivita-tassonomia', title: 'Tassonomia attività', description:
'Descrizioni e gruppi attività validi per import, template e inserimenti manuali (motore tassonomia).' }`.
Per evitare confusione con l'esistente "Gruppo Attivita" (sopralluoghi), la description di
QUELLA voce viene precisata in "…condiviso da cronoprogramma, mappa e sopralluoghi (non è
la tassonomia import)".

## 5. Effetti collaterali attesi e non-effetti

- La leggenda del template, le select dei manuali e la validazione mappa leggono la
  tassonomia dal DB: una voce aggiunta/disattivata dalla UI è **subito efficace ovunque**
  senza deploy (comportamento già vero, la UI lo rende self-service).
- Disattivare una voce NON tocca lo storico (`gruppo_attivita` resta sulle righe); blocca
  solo l'uso futuro (validazione import, select manuali).
- L'export dell'agente non cambia formato: cambia solo il criterio di selezione righe.

## 6. Test

- Validazioni input API in modulo puro testato (`lib/attivita/validaTassonomiaInput.ts`):
  normalizzazione descrizione (trim/spazi, case conservato), gruppo uppercase, committente
  ammesso, messaggi errore.
- Route filtro export: la modifica è una riga di query — verifica con confronto SQL
  pre/post (finestra) + suite completa (nessun test di route esistente da aggiornare;
  `exportLimMassive` puro resta invariato).
- Suite intera verde + tsc pulito al termine.

## 7. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Il nuovo filtro perde righe massive impreviste | Query `nuovi_inclusi/esclusi` pre-merge (già: 0 perse) + Guard 2 attiva + finestra 15gg recuperabile con un giro |
| Voce tassonomia aggiunta col gruppo sbagliato dalla UI | Gruppo a select dai valori esistenti (il testo libero è per gruppi davvero nuovi); descrizioni non rinominabili → errori correggibili con disattiva+ricrea |
| Confusione con la pagina "Gruppo Attivita" esistente | Titoli e description distinti (vedi §4.3) |
