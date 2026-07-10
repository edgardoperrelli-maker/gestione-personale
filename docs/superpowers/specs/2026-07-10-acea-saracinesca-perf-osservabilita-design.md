# Ottimizzazione query + osservabilità sync Saracinesca DUNNING

Data: 2026-07-10

## Contesto

La PR #73 (mergiata) ha aggiunto `GET /api/export/acea-saracinesche`, che alimenta la
scrittura della colonna "Saracinesca" nel master DUNNING. La revisione finale
whole-branch di quella PR ha segnalato due problemi Important (non bloccanti, tracciati
come follow-up):

1. **Query non scalabile**: l'endpoint legge PRIMA tutti gli `interventi` con
   `stato='completato' AND odl IS NOT NULL` (nessun filtro tipo/committente/data, per
   design — deve coprire anche interventi non "limitazione"), poi interroga
   `rapportino_voci` in blocchi da 200 id per TUTTI quegli interventi. Il costo scala
   con l'intero storico completato, non con quanti record hanno effettivamente la
   saracinesca valorizzata (oggi ~241 su una storia molto più ampia). Con la crescita
   dei dati rischia di avvicinarsi al timeout delle function Vercel.

2. **Fetch best-effort silenzioso**: `caricaSaracinescaMap` (in `eseguiGiroAcea.mjs`)
   ingoia qualunque errore/timeout con un `console.error` locale sul PC dell'agente e
   ritorna `null` — la scrittura saracinesca smette semplicemente di succedere, senza
   segnale visibile lato app. Inoltre il contatore `saracinescaScritte`, già calcolato e
   già nel report, non è quasi mai visibile: assente dal `console.log` del giro ACEA in
   `agente.mjs`, e la colonna SARACINESCA del run-export (`Righe modificate`) resta
   sempre vuota perché `aggiornaStatoXlsx.mjs` non valorizza il campo `saracinesca`
   sulle righe che push-a nell'array `righe`.

## Obiettivo

- Far scalare il costo della query con "quanti record hanno la saracinesca valorizzata",
  non con "quanto storico completato esiste".
- Rendere visibile quando la scrittura saracinesca funziona (e quando smette di
  funzionare) senza dover leggere i log locali del PC-agente.

## Decisioni

### 1. Query guidata da `rapportino_voci`, non da `interventi`

Verificato che il pattern `colonna-con-freccia-JSON` come argomento diretto a un filtro
Supabase è già usato e funzionante in questo repo
(`app/api/admin/interventi-manuali/[id]/approva/route.ts:58-59`: `.not('intervento_id',
'is', null)` su colonna piatta + `.ilike('risposte->>sigillo', sigillo)` su colonna
JSON — stesso meccanismo sottostante). Si riusa lo stesso meccanismo con `.not()`:

```ts
.from('rapportino_voci')
  .select('intervento_id, risposte')
  .not('risposte->>sostituzione_valvola', 'is', null)  // query A
// e separatamente:
.not('risposte->>sost_valvola', 'is', null)             // query B
```

Due query separate (una per chiave) invece di un `.or()` composito: evita di introdurre
una sintassi PostgREST (`.or()` + `not.is.null` composito) senza precedenti verificati
in questo repo, a fronte di un costo aggiuntivo trascurabile (ognuna delle due query è
comunque piccola e quasi sempre una sola pagina).

Nuovo ordine delle operazioni nell'endpoint:

1. Fetch `rapportino_voci` con `sostituzione_valvola` valorizzato (paginato, 1000/pagina).
2. Fetch `rapportino_voci` con `sost_valvola` valorizzato (stesso, chiave diversa).
3. Unione dei due risultati, id `intervento_id` distinti.
4. Fetch `interventi` filtrati per `id IN (…) AND stato='completato' AND odl IS NOT
   NULL` — SOLO per gli id trovati sopra (chunk da 200, come oggi), non per tutto lo
   storico.
5. Mappa alla shape `RigaSaracinescaDb` esistente (invariata) e passa a
   `aggregaSaracinescaPerOdl` (funzione pura, INVARIATA — nessuna modifica alla logica
   di aggregazione, solo a come le righe grezze arrivano).

Comportamento osservabile identico a prima (stesso output, stessa copertura — tutti gli
odl con saracinesca "SI" indipendentemente da committente/tipo/data): cambia solo COME
viene costruito l'insieme di righe grezze da aggregare, non IL RISULTATO.

### 2. Osservabilità

**a) `aggiornaStatoXlsx.mjs`** — le righe pushate nell'array `righe` con `tipo:
'acea-stato'` (quando la riga cambia stato E la saracinesca in questo giro) e `tipo:
'acea-saracinesca'` (quando cambia SOLO la saracinesca) devono valorizzare il campo
`saracinesca: 'SI'` quando `toccataSaracinesca` è vero per quella riga (oggi il campo
non è mai settato, resta sempre `''` di default lato `storicoExport.ts`). Nessuna
modifica alla logica di scrittura xlsx, solo al contenuto dell'oggetto riga riportato.

**b) `agente.mjs`** — il `console.log` del giro ACEA (riga con `[lim-sync] giro ACEA
(...): aggiornate=... da-chiedere=... non-agganciate=...`) guadagna
`saracinesca=${report.saracinescaScritte ?? 0}`.

**c) `apiAgente.mjs` — timeout esplicito su `fetchSaracinesche`**: oggi la fetch non ha
alcun timeout (il `fetch()` nativo di Node non ne ha uno di default) — un endpoint
lento o bloccato può tenere l'intero giro ACEA in attesa indefinita. Si aggiunge un
`AbortController` con timeout di 20 secondi (costante `TIMEOUT_MS = 20000`), che
produce un errore chiaro ("timeout dopo 20000ms") catturato dal try/catch già esistente
in `caricaSaracinescaMap` (resta best-effort: un timeout non blocca comunque la
scrittura dello Stato Operazione, si limita a far scadere prima l'attesa).

## Architettura

```
GET /api/export/acea-saracinesche
  rapportino_voci (chiave A valorizzata) ─┐
  rapportino_voci (chiave B valorizzata) ─┼→ id distinti → interventi (IN id, completato, odl)
                                           ┘                    ↓
                                              righeDb → aggregaSaracinescaPerOdl (INVARIATA)
```

Nessuna modifica a: `lib/limitazione/aceaSaracinesche.ts` (funzione pura di
aggregazione, già testata), `fetchSaracinesche`'s firma pubblica (resta
`({baseUrl,exportKey}, fetchImpl?)`), `aggiornaStatoXlsx`'s parametri/contratto di
scrittura xlsx, `eseguiGiroAcea`'s wiring (best-effort, solo target dunning — invariato).

## Test

- `app/api/export/acea-saracinesche/route.ts`: nessun test dedicato preesistente (in
  linea con la convenzione del repo per le route export — verificato in PR #73). La
  verifica di questo cambiamento è tramite lettura statica + confronto con
  `approva/route.ts` per la sintassi, come già fatto in PR #73 per lo stesso file.
- `tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.test.ts`: nuovo test che verifica
  `rep.righe` contiene `saracinesca: 'SI'` sulla riga toccata (sia caso
  `tipo:'acea-saracinesca'` sia caso `tipo:'acea-stato'` con saracinesca insieme).
- `tools/limitazioni-sync/lib/apiAgente.test.ts`: nuovo test che verifica il timeout
  (fetch che non risolve mai entro il timeout configurato → `fetchSaracinesche` lancia
  un errore col messaggio atteso, entro un tempo di test ragionevole — timeout
  configurabile via parametro iniettabile per non far durare 20s il test).
- Nessun test per `agente.mjs`'s `console.log` (non testato altrove nel repo, entrypoint
  CLI — verifica tramite lettura del diff, come già fatto in PR #73 Task 6).

## Error handling

- Fetch saracinesche resta best-effort in ogni caso (timeout incluso): un fallimento non
  blocca mai la scrittura dello Stato Operazione.
- La nuova query a due fasi non introduce nuovi codici di errore: eventuali errori
  Supabase vengono comunque propagati con lo stesso `try/catch → 500` esistente.

## Scope escluso (YAGNI)

- Nessuna nuova colonna DB su `agente_run` per "saracinescaScritte totale" a livello di
  Riepilogo — il reviewer ha segnalato solo l'assenza dal log agente e dalla colonna
  SARACINESCA del run-export, entrambi risolti senza schema change. Se in futuro serve
  un contatore aggregato nel foglio "Riepilogo", è un task separato (richiede
  migration).
- Nessuna modifica alla funzione pura `aggregaSaracinescaPerOdl` (logica di
  aggregazione/dedup invariata, già testata in PR #73).
- Nessun cambiamento alla copertura dati (continua a coprire TUTTI i committenti/tipi,
  nessun filtro data) — l'ottimizzazione riguarda SOLO come viene costruita la query,
  non cosa viene incluso nel risultato.

## Rilascio

- File toccati: `app/api/export/acea-saracinesche/route.ts` (non BLINDATO),
  `tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.mjs` (non nella lista
  `guard-acea.mjs`, ma comunque automazione ACEA in produzione — cautela invariata),
  `tools/limitazioni-sync/agente.mjs`, `tools/limitazioni-sync/lib/apiAgente.mjs`.
- Lavoro in worktree (`acea-saracinesca-perf`) da `origin/main` → PR.
- Dopo merge: `git pull` nel repo principale (agente gira da lì) + riavvio agente (i
  file `.mjs` toccati sono importati dall'agente, servono ricaricati). Nessuna modifica
  al `config.json` (nessun nuovo parametro di configurazione introdotto).
