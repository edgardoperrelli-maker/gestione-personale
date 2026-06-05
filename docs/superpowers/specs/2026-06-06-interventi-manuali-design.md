# Interventi manuali — Design

**Data:** 2026-06-06
**Stato:** Design approvato in brainstorming, in attesa di review dello spec
**Topic:** Caricamento di interventi manuali da parte dell'operatore sul rapportino digitale, con governance ibrida (approvazione admin + corsia "Liberi") e registro autorizzazioni.

---

## 1. Contesto e obiettivo

Oggi il rapportino digitale dell'operatore (`/r/[token]`, [app/r/[token]/page.tsx](../../../app/r/%5Btoken%5D/page.tsx)) mostra **solo** le voci generate dalla pianificazione (`rapportino_voci`, derivate dal piano in mappa). L'operatore può compilare i campi del template e l'esito si propaga in automatico sull'`interventi` canonico, ma **non può aggiungere interventi non pianificati**.

Servono perché capitano due scenari reali (confermati in brainstorming):
- **Assegnazione verbale in giornata**: il coordinatore affida a voce un intervento fuori dal piano della sera prima.
- **Extra trovato sul posto**: arrivato all'indirizzo pianificato, l'operatore scopre un intervento aggiuntivo (es. un secondo PDR/contatore allo stesso civico).

Il volume è **molto variabile** per operatore/giorno: alcuni quasi mai, altri parecchi. Questo esclude un modello di autorizzazione uno-per-uno rigido e impone una leva che si adatti al volume.

**Obiettivo:** un tasto "+" sempre visibile sul rapportino con cui l'operatore carica un intervento manuale completo (anagrafica + esiti); di default la richiesta passa per l'approvazione di uno dei 4 admin attivi; una corsia "Liberi" per-operatore-per-piano salta l'attesa per chi fa volumi alti. Una volta approvato, l'intervento diventa **canonico** (conta in KPI/conteggi/mappa/export, ma resta filtrabile come `origine='manuale'`). Tutto è tracciato in un **registro autorizzazioni**.

---

## 2. Decisioni chiave (esito del brainstorming)

| Tema | Decisione |
|------|-----------|
| Governance | **Ibrido**: tasto sempre visibile; default = approvazione admin; corsia "Liberi" per-operatore-per-piano salta l'attesa. |
| Attesa lato operatore | La voce compare **subito** nella lista in stato *Sospeso*, non compilabile e annullabile. Dopo l'ok diventa una voce normale col suo esito. |
| Cosa carica l'operatore | Tutto in una modale: committente → template auto, **anagrafica + lavorazioni/esiti** + note. |
| Committente → template | Scelta Italgas/Acea/Altro → carica il template del committente. **Template diversi per committente** (fallback a "Standard" finché non esistono i template specifici). |
| Destinazione approvato | **Intervento canonico** (`origine='manuale'`): KPI, conteggi, mappa, torre, export. Sempre filtrabile come manuale. |
| Notifica admin | **Badge realtime + presa in carico**. Niente popup bloccante. Quando un admin apre, gli altri vedono "in gestione da …" (con scadenza). |
| Editor admin | L'admin può modificare **qualsiasi** campo (anagrafica + esiti) prima dell'ok. **Salva = Approva**: due soli pulsanti, *Approva* / *Rifiuta*. |
| Audit | Si conserva lo **snapshot originale dell'operatore** separato dai dati correnti (eventualmente corretti dall'admin). |

---

## 3. Modello di governance

```
                    Operatore preme "+"  (FAB sempre visibile)
                                  │
                                  ▼
                     compila modale (committente → template,
                              anagrafica, esiti, note)
                                  │
                                  ▼  "Invia richiesta"
                    ┌─────────────────────────────────┐
                    │  corsia LIBERI per (piano,staff)?│
                    └─────────────────────────────────┘
                       sì │                    │ no
                          ▼                    ▼
        crea intervento canonico        crea RICHIESTA (in_attesa)
        + voce approvata subito          + voce "Sospeso" (non compilabile)
        richiesta stato = auto_liberi    badge realtime ai 4 admin
        (a registro, nessuna attesa)            │
                          │              admin "prende in carico"
                          │              (edita liberamente i campi)
                          │                     │
                          │            ┌────────┴────────┐
                          │         APPROVA          RIFIUTA(+motivo)
                          │            │                 │
                          ▼            ▼                 ▼
                  intervento canonico creato      voce → "Rifiutato"
                  voce diventa compilabile        operatore corregge
                  con il suo esito                e re-invia / elimina
                          │
                          ▼
              operatore compila/modifica l'esito come una voce normale
```

Ogni transizione è registrata su `interventi_manuali` (= registro autorizzazioni).

---

## 4. Modello dati

> Nota consegna SQL: lo schema qui è **design**. I file di migrazione `supabase/migrations/*.sql` verranno prodotti in implementazione; la SQL da lanciare verrà consegnata **solo su richiesta esplicita** (l'utente la esegue al PC). Il Supabase MCP punta al progetto "aurea", **non** al DB prod.

### 4.1 Nuova tabella `interventi_manuali` (registro richieste + autorizzazioni)

| Campo | Tipo | Note |
|-------|------|------|
| `id` | uuid PK | |
| `rapportino_id` | uuid → `rapportini.id` | rapportino dell'operatore |
| `voce_id` | uuid → `rapportino_voci.id` null | voce "sospesa" creata |
| `intervento_id` | uuid → `interventi.id` null | popolato dopo approvazione |
| `piano_id` | uuid → `mappa_piani.id` null | dal rapportino |
| `staff_id` | text | operatore |
| `staff_name` | text | denormalizzato per il registro |
| `committente` | text | check `('acea','italgas','altro')` |
| `template_id` | uuid → `rapportino_template.id` | risolto dal committente |
| `data` | date | data di lavoro (dal rapportino) |
| `dati_operatore` | jsonb | **snapshot immutabile**: anagrafica + risposte come inviate dall'operatore (audit) |
| `dati_correnti` | jsonb | anagrafica + risposte attuali (eventualmente corretti dall'admin); fonte per creare l'intervento |
| `note` | text null | |
| `stato` | text | check `('in_attesa','approvato','rifiutato','auto_liberi','annullato')` |
| `corsia` | text | check `('normale','liberi')` |
| `preso_in_carico_da` | uuid null | admin che sta gestendo |
| `preso_in_carico_at` | timestamptz null | per scadenza presa in carico |
| `deciso_da` | uuid null | admin che ha approvato/rifiutato |
| `deciso_at` | timestamptz null | |
| `motivo_rifiuto` | text null | |
| `created_at` / `updated_at` | timestamptz | trigger su update |

Indici: `(stato)` per la coda, `(rapportino_id)`, `(data)`, `(staff_id, data)`.

### 4.2 Modifiche a `rapportino_voci`

| Campo nuovo | Tipo | Note |
|-------------|------|------|
| `manuale` | boolean default false | distingue le voci manuali |
| `approvazione_stato` | text null | `null` = voce pianificata normale; altrimenti `('in_attesa','approvato','rifiutato')` (denormalizzato dalla richiesta per il rendering veloce nel rapportino) |
| `richiesta_id` | uuid → `interventi_manuali.id` null | link alla richiesta |

Regola di rendering: `manuale && approvazione_stato='in_attesa'` → badge **"⏳ Sospeso"**, campi non compilabili; `='rifiutato'` → badge **"✗ Rifiutato"** + motivo; `='approvato'` o `null` → voce normale.

### 4.3 Modifiche a `interventi`

| Campo nuovo | Tipo | Note |
|-------------|------|------|
| `origine` | text default `'pianificato'` | check `('pianificato','manuale','import')`; i manuali = `'manuale'`. Filtrabile in mappa/torre/export. |

`created_from_mappa` resta `false` per i manuali (non nascono dalla mappa).

### 4.4 Modifiche a `rapportino_template`

| Campo nuovo | Tipo | Note |
|-------------|------|------|
| `committente` | text null | check `('acea','italgas','altro')`; marca un template per un committente |

**Risoluzione template per committente** (server-side): cerca `rapportino_template` con `active=true AND committente=<scelto>`; se assente → `is_default=true` ("Standard"). Così la feature funziona da subito col solo "Standard" e diventa committente-specifica appena vengono creati i template dedicati.

### 4.5 Corsia "Liberi"

Estensione della tabella esistente `mappa_piani_lucchetti`:

| Campo nuovo | Tipo | Note |
|-------------|------|------|
| `manuali_liberi` | boolean default false | per `(piano_id, staff_id)`: se true, gli interventi manuali di quell'operatore in quel piano saltano l'approvazione |

Upsert della riga lucchetto anche per operatori senza regole manuali (oggi il toggle lucchetto appare solo per chi ha regole; la corsia "Liberi" va estesa a qualsiasi operatore del piano).

---

## 5. Stati e transizioni della richiesta

```
                    (corsia normale)            (corsia liberi)
crea ──► in_attesa                              crea ──► auto_liberi (terminale, intervento creato)
           │
   ┌───────┼─────────────────┐
   ▼       ▼                 ▼
approvato  rifiutato      annullato
(term.)      │             (term., da operatore mentre in_attesa)
             ▼
        re-invio operatore ──► in_attesa  (stesso record; storico mantenuto in registro)
```

- **approvato** → crea/collega `interventi` (origine='manuale'), `voce.approvazione_stato='approvato'`.
- **rifiutato** → `voce.approvazione_stato='rifiutato'`, `motivo_rifiuto` valorizzato.
- **annullato** → voce rimossa dalla lista, richiesta resta a registro per audit.
- **auto_liberi** → intervento e voce creati subito; nessuna attesa.

---

## 6. API / Route

### 6.1 Operatore (autenticazione via token del rapportino, come le altre `/r/[token]`)

- `POST /api/r/[token]/intervento-manuale`
  body: `{ committente, anagrafica:{...}, risposte:{...}, note }`
  - valida che il rapportino sia modificabile (riusa `tokenStatus`/`bloccato`);
  - risolve `template_id` dal committente;
  - legge la corsia da `mappa_piani_lucchetti.manuali_liberi` per `(piano_id, staff_id)`;
  - **liberi** → crea intervento canonico + voce (`manuale=true`, `approvazione_stato='approvato'`) + richiesta `stato='auto_liberi'`;
  - **normale** → crea richiesta `stato='in_attesa'` + voce (`manuale=true`, `approvazione_stato='in_attesa'`);
  - idempotenza: blocca il doppio invio (bottone disabilitato + guardia server).
- `POST /api/r/[token]/intervento-manuale/[id]/annulla` — consentito solo se `stato='in_attesa'`.
- Caricamento template per la modale: i template (campi + info_campi per committente) vengono passati nel payload iniziale della pagina o letti via `GET /api/r/[token]/templates`.

### 6.2 Admin (`requireAdmin()`, [lib/apiAuth.ts](../../../lib/apiAuth.ts))

- `GET /api/admin/interventi-manuali?stato=&from=&to=&staff=` — coda (in attesa) + registro (storico).
- `POST /api/admin/interventi-manuali/[id]/prendi` — presa in carico (`preso_in_carico_da/at`); rifiuta se già preso da altri e non scaduto.
- `POST /api/admin/interventi-manuali/[id]/rilascia` — rilascia la presa in carico.
- `POST /api/admin/interventi-manuali/[id]/approva` — body: `{ dati_correnti }`. Aggiorna `dati_correnti`, crea l'`interventi` canonico (origine='manuale'), aggancia `voce.intervento_id`, setta `stato='approvato'`, `voce.approvazione_stato='approvato'`, avvia geocodifica async. **Salva = Approva**.
- `POST /api/admin/interventi-manuali/[id]/rifiuta` — body: `{ motivo }`. `stato='rifiutato'`.

---

## 7. UI / Componenti

### 7.1 Operatore
- **`FabInterventoManuale`** — "+" flottante in basso a destra, sopra la bottom-nav; disabilitato se rapportino non modificabile.
- **`ModaleInterventoManuale`** — modale a step: (1) committente Italgas/Acea/Altro; (2) anagrafica (campi `info_campi` del template, minimi obbligatori: indirizzo + comune + un identificativo); (3) lavorazioni/esiti (campi del template); invio.
- Estensione di [RapportinoLista.tsx](../../../components/modules/mappa/) e `VoceFocus` per i badge *Sospeso* / *Rifiutato* (+motivo) e il blocco compilazione finché non approvato.

### 7.2 Admin
- **`CampanelloRichieste`** in [TopBar.tsx](../../../components/layout/TopBar.tsx) — badge contatore realtime, visibile su ogni pagina admin; apre la coda.
- **`useRichiesteManualiFeed`** — hook realtime su `interventi_manuali` (filtro `stato=in_attesa`), modellato su [useInterventiFeed.ts](../../../lib/interventi/useInterventiFeed.ts).
- **`CodaRichieste`** — lista nella **Torre di controllo** ([app/hub/torre/page.tsx](../../../app/hub/torre/page.tsx)), accessibile anche dal campanello; mostra presa in carico ("in gestione da …").
- **`PannelloRevisione`** — editor completo dei campi + *Approva* / *Rifiuta (con motivo)*.
- **`RegistroAutorizzazioni`** — vista storico con filtri (operatore, data, stato, committente) ed export.

---

## 8. Realtime / Notifiche
- Abilitare la publication realtime su `interventi_manuali` (stesso approccio di [20260603020000_realtime_interventi.sql](../../../supabase/migrations/)).
- Il campanello sottoscrive gli `INSERT`/`UPDATE` con `stato='in_attesa'` e mostra il contatore; suono/toast all'arrivo (non bloccante).
- **Presa in carico**: lock ottimistico via `preso_in_carico_da/at` con **scadenza** (es. 10 min) per liberare richieste lasciate aperte (browser chiuso).

---

## 9. Sicurezza e permessi
- Route operatore: accesso **token-based** sul proprio rapportino (coerente con `voce/route.ts` e `invia/route.ts`); nessun accesso ad altri rapportini.
- Route admin: `requireAdmin()`.
- RLS `interventi_manuali`: coerente con le altre tabelle del progetto (`FOR ALL TO authenticated`), con il controllo reale demandato ai guard API; le route server usano il client server-side come le altre `/r/[token]`.

---

## 10. Casi limite / error handling
- **Rapportino inviato/scaduto** → FAB disabilitato (riuso `bloccato`/`tokenStatus`).
- **Race tra admin** → presa in carico con scadenza; il secondo admin vede "in gestione da …".
- **Rifiuto → re-invio** → la stessa richiesta torna `in_attesa`; lo storico (snapshot operatore, motivo precedente) resta nel registro.
- **Annulla in attesa** → voce rimossa, richiesta `annullata` (audit).
- **Geocodifica fallita** → intervento creato senza coordinate (come per gli import), non blocca; resta geocodificabile in seguito.
- **Doppio invio** → bottone disabilitato durante l'invio + guardia server.
- **Admin cambia committente** in revisione → ri-risoluzione del template di riferimento.
- **Errore di rete in invio** (operatore) → retry, coerente con il pattern autosave esistente del rapportino.

---

## 11. Riuso del codice esistente
- Creazione intervento canonico: logica di [taskToIntervento.ts](../../../lib/interventi/taskToIntervento.ts) / `ensureInterventiForPiano` (mappare i campi della richiesta, `origine='manuale'`, `created_from_mappa=false`).
- Geocodifica: [geocodeServer.ts](../../../lib/interventi/geocodeServer.ts) / `POST /api/interventi/geocode`.
- Aggancio voce↔intervento: setting diretto di `intervento_id` (la voce è creata da noi; pattern di riferimento in [voceInterventoLink.ts](../../../lib/interventi/voceInterventoLink.ts)).
- Feed realtime admin: pattern di [useInterventiFeed.ts](../../../lib/interventi/useInterventiFeed.ts).
- Corsia "Liberi" UI: estensione di [ManualAssignmentsModal.tsx](../../../components/modules/mappa/ManualAssignmentsModal.tsx) accanto al lucchetto esistente.
- Stato modificabilità rapportino: `tokenStatus` + flag `bloccato`.

---

## 12. Strategia di test (TDD)
- **Risoluzione template per committente** (con fallback a default quando manca il template specifico).
- **Creazione richiesta**: percorso normale (in_attesa + voce sospesa) vs liberi (intervento + voce subito, auto_liberi).
- **Transizioni di stato**: in_attesa → approvato / rifiutato / annullato; re-invio dopo rifiuto.
- **Approvazione**: crea `interventi` con campi corretti (`origine='manuale'`, link voce, applica `dati_correnti`), preserva `dati_operatore`.
- **Snapshot audit**: la correzione admin non sovrascrive `dati_operatore`.
- **Presa in carico concorrente**: secondo admin bloccato; scadenza libera la richiesta.

---

## 13. Fuori scope (YAGNI, per ora)
- Notifiche push/email agli admin (solo badge realtime in-app).
- Modale di escalation a timeout (scartata in favore di badge + presa in carico).
- KPI dedicati ai manuali (confluiscono nei KPI esistenti via `origine`).
- Allegati foto all'intervento manuale (non richiesto).

---

## 14. Punti aperti
- Soglia esatta di scadenza della presa in carico (default proposto: 10 min).
- Elenco preciso dei campi obbligatori minimi nella modale operatore (proposta: indirizzo + comune + un identificativo tra PDR/ODL/matricola).
- Collocazione definitiva del `RegistroAutorizzazioni` (Torre vs sezione dedicata nel riepilogo).
