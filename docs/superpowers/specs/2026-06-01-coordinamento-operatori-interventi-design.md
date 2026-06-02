# Design — Coordinamento operatori & tracciatura interventi (fondamenta anti-Excel)

- **Data:** 2026-06-01
- **Stato:** in attesa di revisione utente
- **Autore:** Edgardo Perrelli (con Claude)
- **Stack:** Next.js 15 (App Router) · React 19 · Supabase (PostgreSQL + RLS) · TypeScript · Tailwind 4 (tema Aurea `--brand-*`) · zod · Vitest
- **Collegato a:** [Auto-assegnazione Esecutore](2026-06-01-esecutore-autoassegnazione-mappa-design.md) · [Assegnazioni manuali mappa](2026-05-31-assegnazioni-manuali-mappa-design.md) · [Rapportini interattivi](2026-05-31-rapportini-interattivi-design.md)

---

## 1. Contesto e obiettivo

Questa app è lo **strumento di coordinamento e comunicazione** tra ufficio e operatori. **Non** esegue l'esitazione tecnica degli interventi: quella avviene sui tablet/app forniti dai committenti **Acea** e **Italgas**. Il valore di questa app è **gestire e coordinare gli operatori, eliminando progressivamente i file Excel** usati oggi per assegnare le attività.

Due pilastri alla base di tutto:

- **A — Ottimizzazione dei tempi degli operatori:** sequenze di lavoro intelligenti (fasce orarie, durate, partenza dal domicilio), bilanciamento del carico, ricalcolo immediato.
- **B — Tracciatura di ogni intervento:** ciclo di vita con timestamp, dall'assegnazione alla comunicazione di esito, visibile in tempo reale all'ufficio.

**Problema attuale:** gli interventi sono **righe Excel volatili**. `utils/routing/excelParser.ts` legge 3 formati (ATTGIORN, Massiva, Export Dati) e li tiene **solo in memoria** dentro `MappaOperatoriClient.tsx`; l'assegnazione finale viene persistita come JSONB in `mappa_piani_operatori.tasks`. Finché l'intervento non è un **dato di prima classe**, non è né tracciabile nel tempo né ottimizzabile in modo affidabile.

**Chiave di volta:** introdurre la tabella **`interventi`** come store canonico. Da quel momento l'Excel diventa un semplice **formato di import** (con l'obiettivo a tendere di azzerarlo) e tutto — assegnazione, tracciatura, ottimizzazione — si appoggia agli interventi persistiti.

## 2. Decisioni (confermate dall'utente)

| Tema | Scelta |
|---|---|
| Accesso operatore | **Link token** (riuso di `/r/[token]`, nessun login). |
| Cattura esito | **Leggero + riferimento**: `eseguito` / `non_eseguito` (motivo) / `rinviato` + campo facoltativo `rif_esterno` (nº pratica Acea/Italgas). |
| Ruolo Excel | **Eliminazione progressiva**: in Fase 1 resta solo come import; obiettivo successivo ridurlo a zero. |
| Esitazione tecnica | **Fuori scope permanente**: resta su Acea/Italgas. Qui si traccia solo la comunicazione/coordinamento. |

## 3. Scope

**In scope (questo spec):**
- Schema `interventi` + stati + timestamp (Fase 1).
- Import Excel→DB tramite i parser esistenti, riuso senza riscrittura (Fase 1).
- Assegnazione in-app degli interventi agli operatori riusando la mappa e la distribuzione esistenti (Fase 1).
- Disegno (delineato) di tracciatura live (Fase 2) e ottimizzazione tempi (Fase 3).

**Fuori scope:**
- Esitazione tecnica e integrazione diretta con i sistemi Acea/Italgas (nessuna API verso di loro in questo spec).
- Login operatore / PWA (si resta su token; eventuale evoluzione futura).
- Routing stradale reale (si parte da Haversine già presente; il motore tempi è predisposto per evolvere).
- Rimozione immediata di `mappa_piani`/`mappa_piani_operatori`: convivono con `interventi` e verranno deprecati in modo incrementale.

## 4. Modello dati — la tabella `interventi`

Nuova migration `supabase/migrations/AAAA…_interventi.sql`. Lo store canonico di un intervento dalla ricezione alla chiusura comunicata.

```sql
create table public.interventi (
  id              uuid primary key default gen_random_uuid(),
  -- Identificazione (dal committente / import)
  committente     text not null check (committente in ('acea','italgas','altro')),
  ods             text,                 -- ODSIN estratto dall'import
  pdr             text,
  nominativo      text,
  matricola       text,
  -- Localizzazione
  indirizzo       text,
  comune          text,
  cap             text,
  lat             double precision,
  lng             double precision,
  geocoded_at     timestamptz,
  -- Classificazione
  activity_id     uuid references public.activities_renamed(id),
  territorio_id   uuid references public.territories(id),
  fascia_oraria   text,                 -- es. "08:00-12:00"
  durata_stimata_min integer,           -- stima (default per attività, vedi Fase 3)
  richiede_due_operatori boolean not null default false,
  -- Assegnazione
  data            date not null,        -- giorno di lavoro
  staff_id        uuid references public.staff(id),
  squadra_id      uuid references public.squadre(id),   -- Fase 3, nullable
  ordine          integer,              -- posizione nella sequenza ottimizzata
  -- Ciclo di vita (Pilastro B)
  stato           text not null default 'da_assegnare'
                  check (stato in ('da_assegnare','assegnato','notificato',
                                   'in_corso','eseguito','non_eseguito','rinviato')),
  esito_motivo    text,                 -- obbligatorio se non_eseguito/rinviato
  rif_esterno     text,                 -- nº pratica Acea/Italgas (facoltativo)
  assegnato_at    timestamptz,
  notificato_at   timestamptz,
  iniziato_at     timestamptz,
  chiuso_at       timestamptz,
  -- Provenienza
  import_batch_id uuid,                  -- raggruppa una sessione di import
  piano_id        uuid,                  -- ponte col flusso mappa esistente (nullable)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index interventi_data_staff_idx    on public.interventi (data, staff_id);
create index interventi_stato_idx         on public.interventi (data, stato);
create index interventi_territorio_idx    on public.interventi (territorio_id, data);
create index interventi_ods_idx           on public.interventi (ods);
create unique index interventi_dedup_idx  on public.interventi (committente, ods, data)
  where ods is not null;

-- updated_at trigger (riuso del pattern già presente nelle altre migration)
create trigger interventi_set_updated_at before update on public.interventi
  for each row execute function public.set_updated_at();
```

**RLS:**
- Lettura/scrittura per utenti autenticati con accesso al modulo `mappa` (policy basata su `profiles.role` come nelle altre tabelle del progetto).
- L'aggiornamento di **stato/esito da parte dell'operatore** avviene tramite Route Handler con `supabaseAdmin` previa validazione del **token** (come per i rapportini): il `token` non è una colonna di `interventi` ma è risolto dal rapportino collegato (vedi §6). Nessun accesso diretto dell'operatore alla tabella.

**Relazione con lo schema esistente:**
- `appointments` (territorio-based, con `pdr/indirizzo/lat/lng/fascia_oraria`) resta per la sua funzione attuale; gli interventi importati confluiscono in `interventi`, non in `appointments`.
- `mappa_piani_operatori.tasks` (JSONB) viene **affiancato**: in Fase 1 la distribuzione scrive `staff_id`/`ordine`/`stato='assegnato'` sugli `interventi` corrispondenti, mantenendo il piano per retrocompatibilità. La deprecazione del JSONB è un passo successivo.

## 5. Fase 1 — Fondamenta (qui muore l'Excel come strumento)

Obiettivo: gli interventi vivono nel DB; l'assegnazione si fa nell'app; l'Excel è solo ingresso.

### 5.1 Import Excel → DB (riuso dei parser)
- Nuova rotta `POST /api/interventi/import` (`runtime='nodejs'`, **`requireUser()`** dal nuovo helper `lib/apiAuth.ts`).
- Riusa `parseExcelToTasks` di `utils/routing/excelParser.ts` **senza modificarne la logica**: il client invia il file, la rotta lo parse-a, normalizza e fa `insert` in `interventi` con `import_batch_id` condiviso, `committente` e `data` passati dal form.
- **Deduplica** su `(committente, ods, data)` via `upsert onConflict` (indice §4): un re-import dello stesso giorno aggiorna, non duplica.
- Risposta: `{ batchId, inseriti, aggiornati, scartati: [{ riga, motivo }] }` — **feedback esplicito** (oggi il parser logga e basta).

### 5.2 Geocoding sugli interventi persistiti
- Riuso di `geocodeTask` + `geocodingCache` esistenti. Una rotta `POST /api/interventi/geocode?batchId=` (o on-demand) popola `lat/lng/geocoded_at` per gli interventi senza coordinate.
- La cache DB già esistente evita richieste ripetute tra import successivi.

### 5.3 Assegnazione in-app (niente Excel)
- `MappaOperatoriClient.tsx`: la sorgente dei task passa **da memoria/Excel a query su `interventi`** (`data` + `territorio` filtro). La distribuzione k-means e le regole manuali esistenti producono assegnazioni che vengono **persistite** aggiornando `staff_id`, `ordine`, `stato='assegnato'`, `assegnato_at` sugli `interventi`.
- Il flusso "Genera rapportini" esistente resta il ponte verso l'operatore (vedi §6), ora alimentato dagli `interventi` invece che dal JSONB.

### 5.4 Test (Vitest, logica pura)
- `mapExcelRowToIntervento` (normalizzazione + estrazione ODS) — file `utils/interventi/mapImport.test.ts`.
- `dedupInterventi` (chiave committente+ods+data) — casi: nuovo, duplicato esatto, stesso ODS giorno diverso.
- `interventoStato` transizioni valide (vedi §7) — macchina a stati pura, testabile senza DB.

## 6. Fase 2 — Tracciatura live (delineata)

- **Agenda operatore** su `/r/[token]`: la pagina già esistente diventa la lista ordinata degli interventi del giorno dell'operatore. Ogni voce mostra indirizzo, fascia, attività e i pulsanti **Iniziato / Eseguito / Non eseguito / Rinviato**.
- Il collegamento token→interventi passa per il rapportino già generato: `rapportino_voci` viene esteso con `intervento_id` (FK) così l'aggiornamento di una voce aggiorna lo `stato` dell'intervento corrispondente.
- Nuova rotta `POST /api/r/[token]/intervento` (pubblica, validata dal **token** come le altre `/r/[token]/*`): aggiorna `stato`, `esito_motivo`, `rif_esterno` e il timestamp coerente (`iniziato_at`/`chiuso_at`).
- **Torre di controllo** (`/hub/mappa` o nuova vista): board live per la data odierna con stato per operatore (`in_corso / eseguito / non_eseguito / rinviato / in ritardo`) e marker mappa colorati per stato, in **auto-refresh** (Supabase Realtime sulla tabella `interventi`).

## 7. Macchina a stati dell'intervento

```
da_assegnare → assegnato → notificato → in_corso → eseguito
                                    │            ├→ non_eseguito (motivo obbligatorio)
                                    │            └→ rinviato      (motivo obbligatorio)
                                    └→ (riassegnazione) → assegnato
```

Regole (funzione pura `transizioneValida(da, a)`):
- `eseguito` richiede transizione da `in_corso`; imposta `chiuso_at`.
- `non_eseguito`/`rinviato` richiedono `esito_motivo` non vuoto; impostano `chiuso_at`.
- `in_corso` imposta `iniziato_at`.
- una riassegnazione riporta a `assegnato` azzerando `iniziato_at/chiuso_at`.

## 8. Fase 3 — Ottimizzazione dei tempi (delineata)

- **Durate:** `durata_stimata_min` di default per `activity_id` (tabella `attivita_durate` o campo su `activities_renamed`). Le **durate reali** (`chiuso_at − iniziato_at`) raccolte in Fase 2 affinano progressivamente le stime (media mobile per attività/operatore).
- **Sequenza temporale:** estendere `utils/routing/optimizer.ts` (oggi minimizza solo la distanza) per rispettare `fascia_oraria` + durata e calcolare un **ETA per tappa**, con partenza/arrivo dal **domicilio operatore** (migration `staff_home_address` già presente).
- **Ricalcolo immediato:** quando un intervento cambia (assenza operatore, aggiunta, rinvio) la sequenza si ricostruisce.
- **Squadre a 2:** tabella `squadre` + uso del flag `richiede_due_operatori` (oggi `requiresTwoOperators` è solo nei tipi, TODO non implementato): gli interventi a 2 persone assegnano entrambi gli operatori e condividono la sequenza.
- **Bilanciamento:** heatmap operatore×giorno basata sui conteggi `interventi` (sostituisce/affianca `mappa_distribuzioni`).

## 9. Vincoli abilitanti (alimentano A e B)

- **Disponibilità/assenze:** tabella `staff_assenze` (ferie/malattia/permessi); un guard in fase di assegnazione **blocca/avvisa** se l'operatore è assente quel giorno (oggi `FERIE/MALATTIA/104` sono solo attività escluse in `lib/sopralluoghiActivities.ts`).
- **Competenze/abilitazioni:** generalizzazione di `authorized_staff_ids` delle ZTL (`migrations/…ztl_zones.sql`) a una matrice abilitazioni usata in distribuzione e assegnazione manuale.

## 10. Sicurezza

- Tutte le nuove rotte `/api/interventi/*` usano **`requireUser()`** (`lib/apiAuth.ts`), coerente con la messa in sicurezza appena applicata alle rotte service-role.
- Le rotte operatore `/api/r/[token]/*` restano **pubbliche ma validate dal token** (pattern `tokenStatus` esistente); l'operatore non accede mai direttamente alla tabella `interventi`.
- RLS attiva su `interventi` con policy basate sul ruolo, in linea con le altre tabelle.

## 11. Fuori scope / rischi

- Nessuna integrazione con Acea/Italgas: `rif_esterno` è inserito manualmente dall'operatore, non sincronizzato.
- La convivenza `interventi` ↔ `mappa_piani_operatori.tasks` in Fase 1 va gestita con attenzione per non scrivere due fonti di verità: la distribuzione scrive su `interventi`, il JSONB resta in sola lettura/ponte finché non deprecato.
- Realtime (Fase 2) introduce carico aggiuntivo: limitare le subscription alla data odierna e ai territori visibili.

## 12. Domande aperte per la revisione

1. Il campo `committente` con valori `acea/italgas/altro` è sufficiente, o servono più committenti?
2. La deduplica `(committente, ods, data)` è corretta, o l'ODS può ripetersi legittimamente nello stesso giorno (es. due interventi sullo stesso ODS)?
3. In Fase 1, vogliamo già esporre la lista interventi del giorno all'operatore (sola lettura) o limitarci ad assegnazione lato ufficio?
