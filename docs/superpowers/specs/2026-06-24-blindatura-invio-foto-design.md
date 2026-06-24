# Spec — Blindatura invio foto interventi manuali

- **Data:** 2026-06-24
- **Branch:** `worktree-blindatura-invio-foto` (da `origin/main` 124aa70)
- **Tipo:** hardening affidabilità (percorso critico dati di campo)
- **Estende:** fix `eb959e0` (verifica post-upload) + `682b0c0` (self-healing + rilascio blob a `fotoComplete`). Vedi memoria `foto-manuali-persistenza-storage`.

## 1. Problema

Le foto degli interventi manuali ("+", soprattutto `lim_massive`) finiscono con **righe in
`interventi_manuali_foto` senza il file nel bucket `interventi-foto`**. Nel pannello di revisione
(Lista attesa) compaiono come "FOTO (N) · N DA RE-INVIARE". Sintomo aggiuntivo osservato dall'utente:
**le anteprime appaiono alla prima apertura del task e spariscono alla riapertura** — il pannello
ri-scarica sempre con `cache: 'no-store'` e ri-genera le signed URL
([PannelloRevisioneRichiesta.tsx:45-52](../../../components/modules/lista-attesa/PannelloRevisioneRichiesta.tsx)),
quindi non è un artefatto di cache: gli oggetti **vengono davvero cancellati e ricreati nel tempo**.

### Impatto (verificato sul prod 2026-06-24)

- 30 righe-foto orfane in un giorno, tutte di **PASTORELLI LUIGI**, `lim_massive`, 06:55→09:06.
- 1 richiesta (`4f35a908`, ODL 912231804) **già approvata** → intervento canonico `721cb014`
  `completato / eseguito_positivo` **senza alcuna foto** → alimenterebbe l'export ACEA come positivo
  non documentato. L'approvazione **non controlla** la presenza delle foto.
- Il fenomeno è **ancora in corso**: nuove richieste continuano a orfanarsi mentre l'operatore lavora;
  alcune si **auto-guariscono** (es. 912231846: 0→5 file alle 09:56) perché il telefono aveva ancora i blob.

## 2. Causa radice (verificata)

L'upload **riesce**, poi l'oggetto viene **cancellato** poco dopo da un POST concorrente.

Prova: le richieste sane "auto-guarite" hanno `storage.objects.created_at` **+5/+54s DOPO** la riga DB —
impossibile sul primo invio (la riga si scrive solo dopo la verifica `list()`). Quindi l'oggetto attuale
è stato **ricreato dal self-healing** → l'originale era stato cancellato.

**Meccanismo:** lo `storage_path` è **deterministico**
(`${richiestaId}/${slot}_${identificativoFoto}.${ext}`,
[route.ts:254](../../../app/api/r/[token]/intervento-manuale/route.ts)). Due POST **concorrenti della
stessa `richiestaId`** (timer sync 30s + `visibilitychange` + Background Sync nel Service Worker, che ha
un guard `inCorso` **separato** da quello della pagina) scrivono sugli **stessi path**. Quando un POST
fallisce — conflitto PK sulla richiesta (`eReq`), oppure errore su voce/foto (`eVoce`/`eFoto`) — il suo
rollback `remove(pathCaricati)` cancella i file **condivisi col POST vincente**. Il vincente aveva già
risposto `fotoComplete:true`, quindi il client ha **rilasciato i blob** dal telefono
([sync.ts:104](../../../lib/offline/sync.ts), [syncPlan.ts:60-62](../../../lib/offline/syncPlan.ts)) →
niente più self-heal → orfana definitiva. La cancellazione **ricorre** a ogni ciclo di retry finché
l'item resta attivo (da cui il "appare e sparisce").

Colpisce solo PASTORELLI perché foto pesanti + rete instabile = finestra di upload lunga + trigger di
sync ripetuti = race frequente.

## 3. Invariante da garantire

> Una foto non viene mai persa: **o è confermata-durabile sullo storage, o resta sul telefono
> (IndexedDB) finché non lo è.** Nessun POST può distruggere i file di un altro. Nessuna approvazione
> propaga silenziosamente una mancanza foto.

## 4. Architettura della soluzione

Due fasi. La Fase 1 ferma l'emorragia ed è deployabile da sola; la Fase 2 chiude il cerchio.

### Fase 1 — Server: stop alla cancellazione

**(b) `storage_path` unico per-tentativo — fix centrale.**
Aggiungere un token casuale **per-esecuzione** allo storage path:
`${richiestaId}/${slot}_${identificativoFoto}_${tentativo}.${ext}` con `tentativo = randomUUID().slice(0,8)`
generato **una volta per richiesta HTTP**. Conseguenze:
- Ogni POST carica su **path propri** → qualunque rollback (`eReq`/`eVoce`/`eFoto`) rimuove **solo i
  propri** file, mai quelli del vincente.
- La riga `interventi_manuali_foto.storage_path` registra il path del **vincente**; il self-heal
  idempotente (`slotDaRiparare`) ri-carica sul path **registrato** → stabile.
- L'identificativo (matricola/ODL) **resta** nel nome → ricerche storage per matricola/indirizzo invariate.

**(a) Conflitto PK → risposta idempotente (no 500 spurio, no leak).**
Nel ramo `eReq` ([route.ts:355-362](../../../app/api/r/[token]/intervento-manuale/route.ts)): se
l'errore è **violazione di chiave primaria** su `interventi_manuali` (= la richiesta esiste già =
duplicato concorrente):
1. rimuovere **i propri** `pathCaricati` (ora sicuro: sono path unici di questo tentativo → niente leak,
   niente danno al vincente);
2. ri-leggere la richiesta esistente e rispondere con la **logica idempotente** già presente
   (`{ idempotente:true, fotoComplete: <verifica byte-aware> }`).

Per non duplicare codice, estrarre la risposta idempotente (oggi [route.ts:177-216](../../../app/api/r/[token]/intervento-manuale/route.ts))
in una funzione interna riusata sia dal check iniziale sia dal ramo `eReq`.
Rilevamento PK: helper puro `isViolazionePk(error)` (codice Postgres `23505`).

**Verifica byte-aware (helper condiviso).**
Sostituire `pathPresentiInStorage` (basata su `storage.list()` = metadati) con una verifica **per-oggetto**
coerente col percorso di lettura: `createSignedUrl(path, 60)` → presente solo se ritorna URL senza errore
(dai log: `sign 400` quando l'oggetto non esiste). Helper `fotoPresentiVerificate(paths): Promise<Set<string>>`,
riusato in: verifica post-upload immediata, risposta idempotente (`fotoComplete`/`durabile`), gate
approvazione (Fase 2). Nota: rileva in modo affidabile la **cancellazione** (riga `storage.objects` assente),
che è la causa accertata. (Una verifica davvero byte-level via `download()` è un'estensione futura non
necessaria qui.)

### Fase 2 — Affidabilità end-to-end

**(c) Rilascio differito dei blob lato client.**
Il telefono **non rilascia mai** i blob al primo invio; li tiene finché una **conferma differita** prova
la durabilità (per superare la finestra di sparizione, osservata fino a +54s).

Macchina a stati dell'item `manuale` in coda (campi nuovi su `OutboxItem`):
- `caricato?: boolean` — `true` dopo il primo 2xx (foto caricate almeno una volta).
- `confermaDopo?: number` — timestamp minimo per tentare la conferma (= `now + GRACE`, GRACE ≈ 90s).

Server: la risposta del route porta un nuovo campo **`durabile: boolean`** (= verifica byte-aware passata
**adesso**). Primo invio: `durabile:false` (appena caricato). Ramo idempotente: `durabile` = esito reale.

Logica client (helper puro `prossimaAzioneManuale(item, risposta, now) → 'rilascia' | 'conferma' | 'ripara' | 'attendi'`):
1. **Primo invio** (`!caricato`): invia **con** le foto. Su 2xx → `caricato=true`, `confermaDopo=now+GRACE`,
   **non rilascia**, tiene l'item.
2. **Conferma** (`caricato && now>=confermaDopo`): re-invia **senza** foto (solo `dati`, banda minima) → il
   ramo idempotente fa la verifica byte-aware.
   - `durabile:true` → **rilascia i blob** + rimuove l'item.
   - `durabile:false` → `caricato=false` (forza ri-upload) → prossimo giro ripara con le foto.
3. `attendi`: `caricato && now<confermaDopo` → salta, ritenta al trigger successivo.

**Prerequisito server (riordino del route).** Oggi la validazione "foto obbligatorie"
([route.ts:153-165](../../../app/api/r/[token]/intervento-manuale/route.ts)) precede il check di
idempotenza (riga 171): una conferma **senza foto** verrebbe respinta con 422 prima di raggiungere il ramo
idempotente. Spostare il **check di idempotenza PRIMA** della validazione foto-obbligatorie: per ogni
re-invio con `richiestaId` già esistente si entra subito nel ramo idempotente (verifica byte-aware), senza
ri-validare le obbligatorie (già passate al primo invio) e senza richiedere foto allegate. Beneficio
collaterale: un duplicato concorrente che arriva dopo l'INSERT del vincente corto-circuita subito, senza
ri-caricare.

`deveRilasciareFoto(status, durabile)` ([syncPlan.ts:60](../../../lib/offline/syncPlan.ts)) passa da
`fotoComplete` a `durabile`. Backward-compat: risposta priva del campo → `durabile=false` (prudenziale,
tiene i blob). Con la Fase 1 attiva la cancellazione cessa → la conferma converge e i blob si liberano.

**(e) Avviso forzabile in approvazione.**
In [approva/route.ts](../../../app/api/admin/interventi-manuali/[id]/approva/route.ts), prima del
check-and-set: verifica byte-aware delle righe-foto della richiesta. Se mancano oggetti **e** la richiesta
non porta `confermaFotoMancanti:true` → 409 `{ error:'foto_mancanti', mancanti:N }` (non bloccante).
In [PannelloRevisioneRichiesta.tsx](../../../components/modules/lista-attesa/PannelloRevisioneRichiesta.tsx)
gestirlo come l'avviso `matricola_duplicata` esistente: callout "Mancano N foto: l'intervento risulterà
senza prove" + bottone "Approva comunque" → ri-chiama con `confermaFotoMancanti:true`.

## 5. Componenti e interfacce (unità isolate e testabili)

| Unità | Tipo | Responsabilità |
|---|---|---|
| `isViolazionePk(error)` | puro | riconosce conflitto PK (Postgres 23505) |
| `pathFotoTentativo(richiestaId, chiave, identificativo, ext, tentativo)` | puro | costruisce lo storage_path per-tentativo |
| `fotoPresentiVerificate(paths)` | server (supabaseAdmin) | esistenza byte-aware via createSignedUrl |
| `prossimaAzioneManuale(item, risposta, now)` | puro | decide rilascia/conferma/ripara/attendi |
| `deveRilasciareFoto(status, durabile)` | puro | gate rilascio blob (aggiornato a `durabile`) |
| `fotoMancantiPerApprovazione(paths)` | server | conta gli oggetti assenti per il gate |

## 6. Flusso dati (happy path Fase 2)

1. Operatore invia "+": foto in IndexedDB, item in coda.
2. Primo invio (con foto) → upload su path per-tentativo → verifica byte-aware ok → INSERT righe →
   `{durabile:false}`. Client: `caricato=true`, tiene i blob, `confermaDopo=+90s`.
3. (eventuale duplicato concorrente → conflitto PK → idempotente, rimuove solo i propri file → nessun danno.)
4. Dopo 90s, conferma senza foto → byte-aware ok → `{durabile:true}` → client **rilascia i blob**, item rimosso.
5. Se nel frattempo un file fosse sparito → `durabile:false` → ri-upload con foto → riconferma.

## 7. Gestione errori

- Upload fallito (`upErr`) o verifica post-upload fallita: rollback dei **propri** path + 502 → il client
  ritenta (blob trattenuti). Invariato, ma ora il rollback è innocuo per gli altri POST.
- Conferma su deploy server vecchio (campo `durabile` assente): client prudenziale `durabile=false` → tiene
  i blob (non li perde mai); al massimo non li rilascia finché il server non è aggiornato.
- Approvazione con foto mancanti: 409 non bloccante, forzabile.

## 8. Testing (TDD — test prima del codice)

Test puri (vitest, stile del progetto), un test rosso prima di ogni unità:
- `isViolazionePk`: 23505 → true; altri → false.
- `pathFotoTentativo`: include identificativo + token; due token diversi → path diversi.
- `deveRilasciareFoto`: rilascia solo `2xx && durabile===true`; campo assente → false.
- `prossimaAzioneManuale`: copre i 4 rami (primo invio, attendi, conferma-durabile, conferma-non-durabile).
- `fotoMancantiPerApprovazione` / gate: con mock di esistenza.

Verifica d'integrazione del route (handler con supabaseAdmin) secondo il pattern del progetto: smoke
manuale sul deploy + e2e offline esistente. Verifica mirata: `npx vitest run <file>` sui nuovi helper
(baseline lint/test del repo è già rossa — vedi memoria `lint-baseline-rosso` — i gate valgono come
"nessun nuovo problema dai file toccati").

## 9. Fuori scope

- (d) Guardiano/reconcile server-side via cron (opzione "Massimo" non scelta).
- Bonifica delle 6 richieste già orfane di oggi (= **recupero**, gestito a parte dall'ufficio: telefono di
  PASTORELLI → "Carica foto (recupero)"; le richieste col blob ancora sul telefono si auto-guariranno dopo
  il deploy Fase 1).
- Deduplica dei doppioni di richieste manuali.

## 10. File toccati

- `app/api/r/[token]/intervento-manuale/route.ts` — (b) path per-tentativo, (a) PK→idempotente, verifica
  byte-aware, campo `durabile`, refactor + **riordino** del check di idempotenza (prima delle obbligatorie).
- `lib/offline/sync.ts`, `lib/offline/syncPlan.ts`, `lib/offline/types.ts` — (c) macchina a stati conferma,
  `deveRilasciareFoto(durabile)`.
- `app/api/admin/interventi-manuali/[id]/approva/route.ts` — (e) gate foto mancanti.
- `components/modules/lista-attesa/PannelloRevisioneRichiesta.tsx` — (e) avviso forzabile.
- Nuovi helper puri + relativi test in `lib/interventi/manuali/` e `lib/offline/`.

## 11. Deploy

Nessuna migrazione SQL. Fase 1 e Fase 2 sono entrambe app-only. Fase 1 deployabile per prima per fermare
la perdita dati. A fine lavoro: push su `main` (Vercel auto-deploy). Hard refresh consigliato lato
operatore per la cache del Service Worker.
