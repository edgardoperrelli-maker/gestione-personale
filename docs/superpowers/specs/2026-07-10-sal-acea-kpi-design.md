# SAL ufficiali ACEA nel KPI Produzione economica (SAL / pre-SAL / fuori SAL)

Data: 2026-07-10

## Contesto e definizioni di business (utente, 2026-07-10)

Il ciclo di fatturazione ACEA: il personale esegue → esita sul nostro rapportino → esita
sull'app ACEA (dunning + massive) → gli ordini esitati entrano nei sistemi ACEA (chi non ha
ordine passa per le richieste di creazione ordine) → ACEA associa il prezzo articolo → nei
primi giorni del mese il deck ACEA valida gli interventi del mese precedente → ci invia il
file degli ordini pagati in quel SAL.

- **SAL N** = file ufficiale ACEA (`SAL N.xlsx` nella cartella CONTABILITA' della commessa):
  ordini approvati in attesa del benestare a fatturare. Perimetro mensile (1° → ultimo giorno).
  Il valore per ordine è il **Valore APS** del file (fonte verità).
- **Pre-SAL N+1** = previsione del prossimo SAL: ordini **esitati a sistema ACEA** (portale
  `COMPLETATO` + causale scostamento `E%`) **non ancora presenti in alcun SAL**. Fotografia
  "viva oggi", indipendente dal range di pagina.
- **Fuori SAL** = lavorato da noi (produzione) **non esitato a sistema ACEA**: interventi con
  ordine non ancora consuntivato sul portale + interventi senza ordine (righe `MAT:`).
- **Esitato non remunerato** = `COMPLETATO` con causale non-E (NMNT/NPRT…): né pre-SAL né
  fuori SAL, a nostro carico. Mostrato come voce separata solo se > 0.

Pipeline concettuale: `Produzione = SAL (pagato) + pre-SAL (in attesa) + fuori SAL (da
esitare) + non remunerato`.

### File SAL 1 verificato (2026-07-10)

`C:\Users\Edgardo\Plenzich s.p.a\Commesse - Documenti\ANNO 2026\CP 20260002_ACEA_GU IDRICHE
L2\8_LAVORI\CONTABILITA'` — export SAP, 1545 righe / 1543 ODL distinti / 284 documenti
d'acquisto. Totale Valore APS **46.191,14 €** (≈ nostro esitato-portale 47.755 e pivot ACEA
47.407 — quadra). Date completamento 03/06→30/06 (SAL 1 = giugno), tutte le causali E
(EIES 1141, EFRE 276, ECE2 99…), 88 saracinesche.

Colonne usate: `Ordine`, `Valore APS`, `Causa scostamento`, `Operazione testo breve`,
`Data completamento lavori`, `Data registrazione`, `Documento acquisti`, `Posizione`.
Sul PC dell'agente il percorso è sotto `C:\Users\Edgardo\...` (il percorso
`edgardo.perrelli` citato in richiesta è il profilo del PC lavoro: stesso SharePoint).

## Decisioni (grilling 2026-07-10)

1. **Nome file**: `SAL N.xlsx` (l'utente ha rinominato "PRE-SAL 1" → "SAL 1"). Parser
   tollerante: numero da `/SAL\s*(\d+)/i`, esclusi i temporanei `~$`.
2. **Pre-SAL = differenza per ODL** (non per data): esitati E% − ODL già in un SAL. Robusto
   ai ritardi di validazione; quando arriva SAL 2 il pre-SAL 3 si aggiorna da solo.
3. **Valori €**: SAL = somma Valore APS dal file (ufficiale). Pre-SAL e fuori SAL = nostro
   listino (stima). Lo scarto APS-vs-listino diventa un controllo di taratura prezzi.
4. **Ingestione: bottone su /hub/agente** (flag one-shot in `agente_config`, stesso pattern
   di "Richiedi stato ACEA"). Niente lettura automatica al giro serale, niente upload UI.
5. **UI: 3 card + storico SAL + presentazione** (vista direzione inclusa).
6. **La card "SAL" attuale viene SOSTITUITA** dal blocco nuovo. Il trend e la tabella per
   voce restano ma rietichettati "Esitato ACEA" (la cifra portale-E% non si chiama più SAL).
7. **Controllo leggero** (no audit per-ODL): per ogni SAL, Δ tra APS e valorizzazione a
   listino degli stessi ODL + contatore "ODL nel SAL sconosciuti a noi".
8. **Fix saracinesche DUNNING incluso** (deciso 2026-07-10 dopo verifica): il ramo
   produzione-saracinesca di `load.ts` oggi scarta le righe DUNNING scritte dalla PR #73
   (vedi "Fix incluso" sotto). Viaggia con questa feature, non come PR separata.

## Architettura

```
Cartella CONTABILITA' (SAL N.xlsx)
  → agente: lib/acea/leggiSal.mjs (nuovo, lettura per NOME colonna)
  → tick: flag one-shot forza_acea_sal (bottone /hub/agente → POST /api/admin/agente/acea-sal)
  → report tipo 'acea-sal' { salFiles: [{ n, file, righe: [...] }] }
  → /api/agente/report → tabella acea_sal (delete per sal_n + insert = idempotente)
  → lib/produzione/load.ts → salUfficiali[] + preSal + fuoriSal + nonRemunerato
  → UI: KpiDirezione (card) + SalStorico + presentazione + export Excel
```

### 1. Migration (additiva)

- Tabella `acea_sal`: `sal_n int`, `odl text`, `doc_acquisti text`, `posizione text`,
  `valore numeric`, `causa text`, `attivita text`, `data_completamento date`,
  `data_registrazione date`, `raccolto_at timestamptz`, `run_id uuid`.
  Unique `(sal_n, doc_acquisti, posizione)` (chiave naturale SAP; un ODL può avere 2
  posizioni → il valore si somma, il set ODL non cambia). Index su `odl`. RLS come le altre
  tabelle snapshot (solo service role).
- `agente_config`: colonna `forza_acea_sal boolean not null default false`.

### 2. Agente (⚠️ file BLINDATI guard-acea: serve conferma alle edit)

- `tools/limitazioni-sync/lib/acea/leggiSal.mjs` (nuovo, logica pura testabile): lista i
  `.xlsx` di `acea.salPath` che matchano `/SAL\s*(\d+)/i`, legge per NOME header (robusto
  all'ordine colonne), ritorna `[{ n, file, righe }]`. Righe senza `Ordine` scartate.
- `config.json` / `config.example.json`: nuova chiave `acea.salPath` (cartella CONTABILITA').
- `agente.mjs`: ramo `if (ris.aceaSal)` → `leggiSal` + `inviaReport` tipo `'acea-sal'`.
  Best-effort, indipendente da `eseguiOra` (come i giri ACEA). Nessun Playwright.
- Niente riavvio agente: ogni tick ricarica il codice; dopo il merge basta `git pull` nel
  repo principale (a carico di Claude, da memoria di progetto).

### 3. API

- `POST /api/admin/agente/acea-sal` (nuovo, `requireAdmin`): setta `forza_acea_sal=true`
  (fotocopia di `acea-stato/route.ts`, senza target).
- `tick/route.ts`: legge+consuma il flag, risponde `aceaSal: boolean`.
- `report/route.ts`: se il body porta `salFiles` → per ogni file `delete from acea_sal where
  sal_n = n` + insert righe (con `raccolto_at`, `run_id`). Best-effort come gli snapshot.

### 4. Loader (`lib/produzione/load.ts` + logica pura nuova `lib/produzione/salUfficiale.ts`)

- Carica `acea_sal` (paginato come gli snapshot).
- `salUfficiali[]` (per la tabella storico): per `sal_n` → `{ n, mese (da min
  data_completamento), ordini, valoreAps, valoreListino (attività file → attivitaCanonica →
  listino), deltaListino, odlSconosciuti (odl assenti da DB, master e portale) }`.
- `odlPagati` = set ODL di tutti i SAL.
- `preSal` = le attuali `salRighe` (COMPLETATO+E%, valorizzate a listino) filtrate
  `odl ∉ odlPagati` → `{ n: maxSalN+1, totale, conteggio }`. Fotografia, non dipende dal range.
- `fuoriSal` = righe produzione (post-dedup) il cui ODL non è COMPLETATO sul portale
  (qualsiasi causale) oppure senza ODL reale (`MAT:`) → `{ totale, conteggio }`.
- `nonRemunerato` = COMPLETATO con causale non-E valorizzato a listino → `{ totale,
  conteggio }` (UI: visibile solo se > 0).
- Il campo `sal` esistente nel payload NON si rinomina (lo usano trend, per-voce, export,
  presentazione): cambiano solo le etichette UI. Nuovi campi additivi nel payload.
- La card attuale "scarto" sparisce dalla UI, sostituita da `fuoriSal` (calcolo per-ODL più
  preciso del sottraendo aggregato).

#### Fix incluso: saracinesche DUNNING nel KPI (verificato 2026-07-10)

La PR #73 scrive "SI" nella colonna Saracinesca del master DUNNING e la catena
config→snapshot→`acea_master_snapshot` trasporta già il campo (config dunning ha
`masterColonnaSaracinesca`). Ma il ramo produzione-saracinesca (`load.ts` ~r.288) richiede
`esito === 'eseguito'`, colonna che esiste SOLO per ZAGAROLO: le righe DUNNING arrivano con
`esito=''` → scartate sempre. Prod verificato: 1.283 righe `saracinesca=SI`, tutte
ZAGAROLO (`esito='eseguito'`), zero DUNNING (giro post-#73 mai girato).

Fix (1 riga): la fonte verità della saracinesca DUNNING è il nostro DB (è da lì che #73
scrive), già in mano al loader:

```ts
sara === 'SI' && (esito === 'eseguito' || dbAudit.get(odl)?.esitoOk === true)
```

ZAGAROLO invariato (esito master, incluse le righe `MAT:`/`DA CHIEDERE` fuori da
`dbAudit`); DUNNING passa se l'ODL è positivo nel DB (~196 attesi, numeri spec #73).
Le saracinesche DUNNING entrano così anche in pre-SAL/fuori-SAL. Post-deploy serve un giro
«Allinea Dunning» per scrivere il file e ripopolare lo snapshot.

### 5. UI

- `KpiDirezione.tsx`: via le card "SAL"/"scarto" → **«SAL N (pagato)»** (€ APS + mese),
  **«Pre-SAL N+1»** (€ listino, vivo oggi), **«Fuori SAL»** (€ listino). Badge/riga
  "non remunerato" se > 0.
- Nuovo `economica/SalStorico.tsx`: tabella `SAL | mese | ordini | € APS | Δ listino | ODL
  sconosciuti` (una riga per SAL).
- `TrendProduzioneSal.tsx` + tabella "Produzione vs SAL per voce": etichette → "Esitato ACEA".
- Presentazione `/presentazione/produzione-acea`: stesse card + storico.
- Export Excel: nuovo foglio "SAL" via `aggiungiFogli` (append-only, grafici nativi
  preservati); etichette dei fogli esistenti aggiornate dove banale.

### 6. Test

- `leggiSal.mjs`: parser nome file + lettura header (pattern `agente.test.ts`).
- `salUfficiale.ts`: aggregazione/differenza pura (preSal, fuoriSal, delta) con vitest.
- Endpoint/tick: come i rami gemelli già testati (verificare in fase piano).
- Fix saracinesca DUNNING: caso `saracinesca=SI, esito='', ODL positivo in DB` → contata;
  `esito=''` + ODL negativo/assente in DB → scartata; ZAGAROLO invariato.

## Fuori scope (YAGNI)

Upload manuale UI, audit per-ODL sul SAL, multi-commessa (una sola `salPath`), stima APS sul
pre-SAL, numerazione SAL non sequenziale.

## Rischi / note

- ODL come stringa normalizzata (trim); nel file sono numerici a 10 cifre, coerenti col portale.
- File SAL ricaricato/corretto da ACEA → delete+insert per `sal_n` lo assorbe.
- Il follow-up aperto "% consuntivato >100% su range parziali" viene assorbito: le card nuove
  sono fotografie cumulative, il range resta solo su produzione/trend.
- OneDrive: la cartella CONTABILITA' deve essere sincronizzata sul PC dell'agente (stessa
  cautela di [fix-acea-sync-refresh-data]: file chiuso in Excel, OneDrive attivo).
