# Hardening affidabilità foto richieste manuali — Design

Data: 2026-06-18
Stato: design approvato (brainstorming), pronto per writing-plans

## Contesto e problema

Le foto delle richieste manuali ("+") vivono nella tabella `interventi_manuali_foto`
(metadati) e nel bucket Storage privato `interventi-foto` (file). L'invio dell'operatore
passa dal route `app/api/r/[token]/intervento-manuale/route.ts` via il ramo `manuale` del
sync offline (`lib/offline/sync.ts`).

Il 2026-06-18 si è verificato un caso di **righe-foto senza file**: `storage.upload(...)`
aveva risposto `error: null` senza che l'oggetto venisse davvero persistito (rete instabile
in campo), e il codice aveva inserito le righe fidandosi del "successo apparente". Risultato:
pannello che mostra "FOTO (3)" ma anteprima vuota.

**Già deployato** (commit `eb959e0`, fuori scope di questa spec ma è la base):
- Verifica post-upload nel route operatore (rollback + 502 se i file non si posano).
- `fileMancante` nel GET admin `/foto` + placeholder "da re-inviare" nel pannello revisione.

Restano due lacune di affidabilità, oggetto di questa spec.

## Obiettivo

Rendere il recupero delle foto **automatico e verificato**, guidato dall'app, in modo che
**gli operatori non ri-carichino mai le foto a mano**. Più un hardening di sicurezza sullo
storage.

## Scope

**In scope:**
1. **Idempotenza self-healing** (server): al re-invio di una richiesta esistente, se mancano
   file e il re-invio porta le foto, ri-caricarle e verificarle (invece di rispondere subito
   idempotente).
2. **Contratto di completezza** (server→client): ogni risposta dichiara se le foto sono tutte
   davvero sullo storage (`fotoComplete`), così il client sa se può rilasciare i blob.
3. **Trattieni-finché-confermato** (client): il sync cancella i blob foto **solo** quando il
   server conferma la persistenza, altrimenti li mantiene e ritenta in automatico.
4. **RLS lockdown** del bucket `interventi-foto`: rimuovere le policy `to authenticated`.

**Out of scope (ciclo separato):**
- Deduplica dei doppioni di richieste manuali (stessa matricola/via inviata più volte → più
  righe `in_attesa`). Tema distinto, con scelte UX proprie.
- Hardening su `upsert:false` (non risolve il fallimento osservato — non-persistenza, non
  sovrascrittura — e introduce gestione 409; tenuto fuori).

## Design

### 1. Server — idempotenza self-healing + contratto `fotoComplete`

File: `app/api/r/[token]/intervento-manuale/route.ts`.

**Stato attuale** (righe ~146-161): se `richiestaId` esiste, ritorna subito
`{ id, voceId, corsia, interventoId, idempotente: true }` senza guardare i file.

**Nuovo comportamento del ramo idempotenza:**
1. Caricare le righe foto della richiesta esistente (`interventi_manuali_foto` per
   `richiesta_id`): per ciascuna si ha `slot_chiave` e `storage_path`.
2. Verificare quali `storage_path` esistono davvero nel bucket (una `storage.list(richiestaId)`,
   stesso meccanismo della verifica post-upload già introdotta).
3. Per ogni slot **mancante** il cui `slot_chiave` corrisponde a una foto presente nel re-invio
   (`partiFotoRicevute(form)`, già parse-ata prima del ramo idempotenza): ri-caricare il file
   **allo stesso `storage_path`** della riga (`upsert: true`) e **ri-verificare** che sia salito.
4. Non si toccano le righe DB (il path è già corretto) né intervento/voce: solo i bytes mancanti.
   La riparazione agisce **solo sulle righe foto esistenti** (caso orfano); non inserisce righe
   nuove. Post-fix di creazione, "richiesta esiste" implica "righe foto già inserite", quindi
   non esiste lo scenario "richiesta senza righe foto + foto nel re-invio".
5. La risposta diventa:
   `{ id, voceId, corsia, interventoId, idempotente: true, fotoOk, fotoTotali, fotoComplete }`
   dove `fotoTotali` = n. righe foto della richiesta, `fotoOk` = n. con file presente **dopo** il
   tentativo di riparazione, `fotoComplete = fotoOk === fotoTotali`.
6. **Best-effort**: se la riparazione fallisce (es. storage giù), si risponde comunque
   `idempotente: true` con `fotoComplete: false` (non si peggiora lo stato; il client riterrà).

**Percorso di creazione (non idempotente):** invariato nella logica (upload→verifica→insert),
ma la risposta finale aggiunge gli stessi campi: a creazione riuscita tutti i file sono
verificati ⇒ `fotoComplete: true`; al fallimento di persistenza resta il 502 già introdotto.

**Caso senza foto** (richiesta testo-only): `fotoTotali = 0` ⇒ `fotoComplete: true`.

**Helper puro estraibile (testabile):**
`slotDaRiparare(righeEsistenti, fotoRicevute, pathPresenti) -> Array<{ chiave, storagePath, file }>`
che, date le righe esistenti, le foto ricevute (per chiave) e l'insieme dei path presenti,
restituisce gli slot da ri-caricare. Tutta la decisione è pura; l'I/O (list/upload/verify) resta
nel route.

### 2. Client — trattieni i blob finché `fotoComplete`

File: `lib/offline/sync.ts`, ramo `type === 'manuale'` (righe ~80-99) e l'anello
`sincronizzaToken`.

**Stato attuale:** dopo `r.ok` il sync rimuove TUTTI i blob (`for ... dbBlob.rimuovi`), poi
`classificaEsito(status)` su un 2xx ⇒ `completato` ⇒ item rimosso. Quindi anche una risposta
`idempotente` con file mancanti fa **buttare le foto**.

**Nuovo comportamento:**
1. Dopo la POST, leggere dal corpo `fotoComplete` (default prudente: se assente, trattare come
   `false` → non rilasciare).
2. **Rilasciare i blob e completare l'item SOLO se** `status` è 2xx **e** `fotoComplete === true`.
   - In tal caso: rimuovere i blob (come oggi) e lasciare che `classificaEsito` chiuda l'item.
3. Se `status` 2xx ma `fotoComplete === false`: **non** rimuovere i blob e **non** completare
   l'item → l'item resta in coda (esito trattato come "ritenta") → ai trigger esistenti (online,
   ritorno in primo piano, intervallo 30s) il sync ri-manda, il server ripara, finché
   `fotoComplete: true`.
4. Errori di rete / 5xx: invariati (ritenta, blob mantenuti).

**Decisione pura estraibile (testabile):**
`deveRilasciareFoto(status, fotoComplete) -> boolean` (true sse 2xx && fotoComplete).
Riuso del meccanismo esistente: il ramo `manuale` di `inviaElemento` ritorna
`ritentabile: !deveRilasciareFoto(status, fotoComplete)` (stesso flag già usato dal ramo
`invia`). Così, in `sincronizzaToken`, `const esito = ritentabile ? 'ritenta' : classificaEsito(status)`
chiude l'item solo a `fotoComplete: true`, altrimenti lo lascia in coda. I blob si rimuovono nello
stesso ramo solo quando `deveRilasciareFoto` è true.

**Anti-spin / sicurezza:** i blob non vengono **mai** eliminati finché non confermati. Se la
persistenza continua a fallire, l'item resta in coda e ricade nel meccanismo `tentativi`/
`marcaErrore`/badge "foto in sospeso" già esistente (nessuna perdita, nessun lavoro manuale).
Non si introduce un cap che cancelli i blob.

### 3. RLS — lockdown del bucket `interventi-foto`

Migration nuova in `supabase/migrations/`:
```sql
drop policy if exists "interventi_foto_select" on storage.objects;
drop policy if exists "interventi_foto_insert" on storage.objects;
drop policy if exists "interventi_foto_delete" on storage.objects;
```
Motivazione: ogni accesso al bucket avviene dal server con `supabaseAdmin` (service_role), che
**bypassa la RLS**; le anteprime usano signed URL firmate dal server (che non passano dalla RLS).
Verificato che nessun codice client tocca il bucket. Le tre policy `to authenticated` sono quindi
pura superficie d'attacco. Reversibile (le policy si possono ricreare). Applicata via MCP
`apply_migration` al momento dell'implementazione.

## Contratto API (risposta `/intervento-manuale`)

| Campo | Tipo | Significato |
|---|---|---|
| `id`, `voceId`, `corsia`, `interventoId` | invariati | come oggi |
| `idempotente` | boolean | presente sul ramo idempotenza |
| `fotoTotali` | number | n. righe foto della richiesta |
| `fotoOk` | number | n. con file presente dopo eventuale riparazione |
| `fotoComplete` | boolean | `fotoOk === fotoTotali` (sempre presente) |

Il client tratta l'assenza di `fotoComplete` come `false` (prudente).

## Error handling / casi limite

- Re-invio senza i blob (evacuati dal device): `partiFotoRicevute` vuoto per gli slot mancanti →
  niente riparazione possibile → `fotoComplete: false`; l'item resta "foto in sospeso". Nessun
  peggioramento. (Caso raro; non si forza il re-scatto.)
- Riparazione parziale (alcuni slot riparati, altri no): `fotoComplete: false` → il client
  ritenta; al giro dopo ripara i restanti se nel frattempo arrivano.
- Storage temporaneamente giù: `fotoComplete: false` ripetuto → ritenta senza perdere i blob.
- Richiesta testo-only: `fotoComplete: true` immediato (comportamento invariato).

## Testing

- **Unit (TDD)**:
  - `slotDaRiparare(...)` — copertura: nessuno mancante, alcuni mancanti con/ senza foto nel
    re-invio, tutti mancanti, chiavi non corrispondenti.
  - `deveRilasciareFoto(status, fotoComplete)` — 2xx+complete→true; 2xx+incomplete→false;
    5xx→false; 0(rete)→false.
- **Smoke manuale sul deploy**: creare uno stato "riga senza file" (o riusare i casi noti),
  re-inviare da mobile, confermare: (a) il server ri-carica e verifica; (b) il client mantiene i
  blob finché `fotoComplete`; (c) a buon fine rilascia e l'item sparisce dalla coda.
- **Gate**: `npx tsc --noEmit` e `npx eslint <file toccati>` verdi (baseline rosso del repo
  invariato).

## Deploy / migrazione

- Codice (route + sync + helper + test) su `origin/main` via worktree isolato + push ff (con OK).
- Migration RLS applicata via MCP `apply_migration` (no impatto sul codice vecchio; le policy
  rimosse non servono ai flussi legittimi).
- Deploy Vercel automatico su push; hard-refresh per la cache SW.

## File coinvolti

- `app/api/r/[token]/intervento-manuale/route.ts` — ramo idempotenza self-healing + campi risposta.
- `lib/interventi/manuali/riparazioneFoto.ts` (nuovo) — `slotDaRiparare` (puro) + `riparazioneFoto.test.ts`.
- `lib/offline/sync.ts` — ramo `manuale`: legge `fotoComplete`, `ritentabile`, rilascio condizionato.
- `lib/offline/syncPlan.ts` — aggiunge `deveRilasciareFoto` (puro, accanto a `classificaEsito`) + test in `syncPlan.test.ts`.
- `supabase/migrations/<timestamp>_rls_lockdown_interventi_foto.sql` (nuovo, timestamp alla creazione) — drop delle 3 policy.

## Out of scope ribadito

- Doppioni richieste manuali (deduplica) — ciclo di design separato.
