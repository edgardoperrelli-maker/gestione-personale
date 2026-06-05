# Interventi manuali — Design

**Data:** 2026-06-06
**Stato:** Design approvato in brainstorming, in attesa di review dello spec
**Topic:** Caricamento di interventi manuali da parte dell'operatore sul rapportino digitale, con governance ibrida (approvazione admin + corsia "Liberi"), foto obbligatorie e registro autorizzazioni.

---

## 1. Contesto e obiettivo

Oggi il rapportino digitale dell'operatore (`/r/[token]`, [app/r/[token]/page.tsx](../../../app/r/%5Btoken%5D/page.tsx)) mostra **solo** le voci generate dalla pianificazione (`rapportino_voci`, derivate dal piano in mappa). L'operatore può compilare i campi del template e l'esito si propaga in automatico sull'`interventi` canonico, ma **non può aggiungere interventi non pianificati**.

Servono perché capitano due scenari reali (confermati in brainstorming):
- **Assegnazione verbale in giornata**: il coordinatore affida a voce un intervento fuori dal piano della sera prima.
- **Extra trovato sul posto**: arrivato all'indirizzo pianificato, l'operatore scopre un intervento aggiuntivo (es. un secondo PDR/contatore allo stesso civico).

Il volume è **molto variabile** per operatore/giorno: alcuni quasi mai, altri parecchi. Questo esclude un modello di autorizzazione uno-per-uno rigido e impone una leva che si adatti al volume.

**Obiettivo:** un tasto "+" sempre visibile sul rapportino con cui l'operatore carica un intervento manuale completo (anagrafica + esiti + foto obbligatorie); di default la richiesta passa per l'approvazione di uno dei 4 admin attivi; una corsia "Liberi" per-operatore-per-piano salta l'attesa per chi fa volumi alti. Una volta approvato, l'intervento diventa **canonico** (conta in KPI/conteggi/mappa/export, ma resta filtrabile come `origine='manuale'`). Tutto è tracciato in un **registro autorizzazioni**.

---

## 2. Decisioni chiave (esito del brainstorming)

| Tema | Decisione |
|------|-----------|
| Governance | **Ibrido**: tasto sempre visibile; default = approvazione admin; corsia "Liberi" per-operatore-per-piano salta l'attesa. |
| Attesa lato operatore | La voce compare **subito** nella lista in stato *Sospeso*, non compilabile e annullabile. Dopo l'ok diventa una voce normale col suo esito. |
| Blocco invio rapportino | Il rapportino **non è inviabile** a fine giornata se resta **anche una sola voce in sospeso**. Fa da forcing naturale sugli admin (niente timer). |
| Cosa carica l'operatore | Tutto in una modale: committente → template auto, **anagrafica + lavorazioni/esiti + foto obbligatorie** + note. |
| Committente → template | Scelta Italgas/Acea/Altro → carica il template del committente. **Template diversi per committente** (fallback a "Standard" finché non esistono i template specifici). |
| Foto obbligatorie | **Solo interventi manuali.** Il template definisce **N slot foto** (etichetta + flag obbligatoria); scatto da fotocamera o scelta da libreria. File rinominato `etichettaSlot + identificativo` (vedi §8). |
| Export foto | Nel **riepilogo rapportini**, icona per **scaricare le foto** di un rapportino in **ZIP** con i file rinominati (vedi §8). |
| Destinazione approvato | **Intervento canonico** (`origine='manuale'`): KPI, conteggi, mappa, torre, export. Sempre filtrabile come manuale. |
| Notifica admin | **Badge realtime + presa in carico** *informativa* (nessuna scadenza; rilascio manuale + override). Niente popup bloccante. |
| Editor admin | L'admin può modificare **qualsiasi** campo (anagrafica + esiti) prima dell'ok. **Salva = Approva**: due soli pulsanti, *Approva* / *Rifiuta*. |
| Audit | Si conserva lo **snapshot originale dell'operatore** separato dai dati correnti (eventualmente corretti dall'admin). |

---

## 3. Modello di governance

```
                    Operatore preme "+"  (FAB sempre visibile)
                                  │
                                  ▼
                     compila modale (committente → template,
                       anagrafica, esiti, FOTO obbligatorie, note)
                                  │
                                  ▼  "Invia richiesta"  (bloccato se mancano foto obbligatorie)
                    ┌─────────────────────────────────┐
                    │  corsia LIBERI per (piano,staff)?│
                    └─────────────────────────────────┘
                       sì │                    │ no
                          ▼                    ▼
        crea intervento canonico        crea RICHIESTA (in_attesa)
        + voce approvata subito          + voce "Sospeso" (non compilabile)
        richiesta stato = auto_liberi    badge realtime ai 4 admin
        (a registro, nessuna attesa)            │
                          │              admin "prende in carico" (informativo)
                          │              edita liberamente i campi
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

   Vincolo trasversale: il rapportino NON può essere inviato finché esiste
   anche una sola voce con approvazione_stato = 'in_attesa'.
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
| `preso_in_carico_da` | uuid null | admin che sta gestendo (informativo) |
| `preso_in_carico_at` | timestamptz null | timestamp presa in carico (nessuna scadenza automatica) |
| `deciso_da` | uuid null | admin che ha approvato/rifiutato |
| `deciso_at` | timestamptz null | |
| `motivo_rifiuto` | text null | |
| `created_at` / `updated_at` | timestamptz | trigger su update |

Indici: `(stato)` per la coda, `(rapportino_id)`, `(data)`, `(staff_id, data)`.

### 4.2 Nuova tabella `interventi_manuali_foto` (allegati)

| Campo | Tipo | Note |
|-------|------|------|
| `id` | uuid PK | |
| `richiesta_id` | uuid → `interventi_manuali.id` (cascade) | |
| `slot_chiave` | text | chiave dello slot foto del template |
| `slot_etichetta` | text | etichetta configurata (snapshot) |
| `storage_path` | text | path nel bucket |
| `file_name` | text | nome logico rinominato (vedi §8) |
| `mime_type` | text | |
| `size` | int null | byte |
| `created_at` | timestamptz | |

### 4.3 Modifiche a `rapportino_voci`

| Campo nuovo | Tipo | Note |
|-------------|------|------|
| `manuale` | boolean default false | distingue le voci manuali |
| `approvazione_stato` | text null | `null` = voce pianificata normale; altrimenti `('in_attesa','approvato','rifiutato')` (denormalizzato dalla richiesta per il rendering veloce e per il blocco-invio) |
| `richiesta_id` | uuid → `interventi_manuali.id` null | link alla richiesta |

Regola di rendering: `manuale && approvazione_stato='in_attesa'` → badge **"⏳ Sospeso"**, campi non compilabili; `='rifiutato'` → badge **"✗ Rifiutato"** + motivo; `='approvato'` o `null` → voce normale.

### 4.4 Modifiche a `interventi`

| Campo nuovo | Tipo | Note |
|-------------|------|------|
| `origine` | text default `'pianificato'` | check `('pianificato','manuale','import')`; i manuali = `'manuale'`. Filtrabile in mappa/torre/export. |

`created_from_mappa` resta `false` per i manuali.

### 4.5 Modifiche a `rapportino_template` e al tipo campo

| Campo nuovo | Tipo | Note |
|-------------|------|------|
| `committente` | text null | check `('acea','italgas','altro')`; marca un template per un committente |

**`TemplateCampo` esteso** (oggi in [utils/rapportini/buildVoci.ts](../../../utils/rapportini/buildVoci.ts)):
- `tipo` aggiunge il valore `'foto'`;
- nuovo flag `obbligatoria?: boolean` (usato per i campi foto: uno slot foto può essere obbligatorio o opzionale).

**Risoluzione template per committente** (server-side): cerca `rapportino_template` con `active=true AND committente=<scelto>`; se assente → `is_default=true` ("Standard"). La feature funziona da subito col solo "Standard" e diventa committente-specifica appena vengono creati i template dedicati.

### 4.6 Corsia "Liberi"

Estensione di `mappa_piani_lucchetti`:

| Campo nuovo | Tipo | Note |
|-------------|------|------|
| `manuali_liberi` | boolean default false | per `(piano_id, staff_id)`: se true, i manuali di quell'operatore in quel piano saltano l'approvazione |

Upsert della riga lucchetto anche per operatori senza regole manuali (la corsia "Liberi" va estesa a qualsiasi operatore del piano).

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

- `POST /api/r/[token]/intervento-manuale` — **multipart** (foto + JSON dati).
  - valida che il rapportino sia modificabile (riusa `tokenStatus`/`bloccato`);
  - risolve `template_id` dal committente;
  - **valida le foto obbligatorie** (tutti gli slot `obbligatoria=true` presenti) → altrimenti 422;
  - carica le foto sul bucket (vedi §8) e crea i record `interventi_manuali_foto`;
  - legge la corsia da `mappa_piani_lucchetti.manuali_liberi` per `(piano_id, staff_id)`;
  - **liberi** → crea intervento canonico + voce (`approvazione_stato='approvato'`) + richiesta `stato='auto_liberi'`;
  - **normale** → crea richiesta `stato='in_attesa'` + voce (`manuale=true`, `approvazione_stato='in_attesa'`);
  - idempotenza: blocca il doppio invio (bottone disabilitato + guardia server).
- `POST /api/r/[token]/intervento-manuale/[id]/annulla` — solo se `stato='in_attesa'`.
- `POST /api/r/[token]/invia` (esistente, da estendere) — **rifiuta l'invio** (409) se esiste ≥1 voce con `approvazione_stato='in_attesa'`, con messaggio "N interventi in attesa di approvazione".

### 6.2 Admin (`requireAdmin()`, [lib/apiAuth.ts](../../../lib/apiAuth.ts))

- `GET /api/admin/interventi-manuali?stato=&from=&to=&staff=` — coda (in attesa) + registro (storico) + foto.
- `POST /api/admin/interventi-manuali/[id]/prendi` — presa in carico informativa (`preso_in_carico_da/at`); `override=true` per riprendere una richiesta già in gestione da altri.
- `POST /api/admin/interventi-manuali/[id]/rilascia` — rilascia la presa in carico.
- `POST /api/admin/interventi-manuali/[id]/approva` — body: `{ dati_correnti }`. Aggiorna `dati_correnti`, crea l'`interventi` canonico (origine='manuale'), aggancia `voce.intervento_id`, setta `stato='approvato'`, `voce.approvazione_stato='approvato'`, avvia geocodifica async. **Salva = Approva**.
- `POST /api/admin/interventi-manuali/[id]/rifiuta` — body: `{ motivo }`. `stato='rifiutato'`.
- `GET /api/admin/rapportini/[rapportinoId]/foto-zip` — raccoglie tutte le foto degli interventi manuali del rapportino, le rinomina (§8) e restituisce un archivio **ZIP** (accesso al bucket privato lato server; generazione con `jszip`, già in dipendenze).

---

## 7. UI / Componenti

### 7.1 Operatore
- **`FabInterventoManuale`** — "+" flottante in basso a destra, sopra la bottom-nav; disabilitato se rapportino non modificabile.
- **`ModaleInterventoManuale`** — modale a step: (1) committente Italgas/Acea/Altro; (2) anagrafica (campi `info_campi` del template, minimi obbligatori: indirizzo + comune + un identificativo PDR/ODL/matricola); (3) lavorazioni/esiti; (4) **foto obbligatorie** (uno slot per ciascun campo `foto` del template; vedi §8); invio bloccato finché le foto obbligatorie non sono tutte presenti.
- Estensione di [RapportinoLista.tsx](../../../components/modules/rapportini/) e `VoceFocus` per i badge *Sospeso* / *Rifiutato* (+motivo) e il blocco compilazione finché non approvato.
- Banner sul rapportino quando l'invio è bloccato da voci in sospeso.

### 7.2 Admin
- **`CampanelloRichieste`** in [TopBar.tsx](../../../components/layout/TopBar.tsx) — badge contatore realtime, visibile su ogni pagina admin; apre la coda.
- **`useRichiesteManualiFeed`** — hook realtime su `interventi_manuali` (filtro `stato=in_attesa`), modellato su [useInterventiFeed.ts](../../../lib/interventi/useInterventiFeed.ts).
- **`CodaRichieste`** — lista nella **Torre di controllo** ([app/hub/torre/page.tsx](../../../app/hub/torre/page.tsx)); mostra presa in carico ("in gestione da …").
- **`PannelloRevisione`** — editor completo dei campi + **anteprima foto** + *Approva* / *Rifiuta (con motivo)*.
- **`RegistroAutorizzazioni`** — nella Torre: storico con filtri (operatore, data, stato, committente) ed export.
- **Icona "scarica foto (ZIP)"** nel **riepilogo rapportini** ([RiepilogoRapportini.tsx](../../../components/modules/mappa/RiepilogoRapportini.tsx) / [CardTerritorio.tsx](../../../components/modules/mappa/riepilogo/CardTerritorio.tsx)), accanto alle azioni esistenti (copia link, Excel, WhatsApp): scarica le foto del rapportino zippate e rinominate.

### 7.3 Configurazione template (admin)
- Estensione di [TemplateRapportiniClient.tsx](../../../app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx): nuovo tipo campo **"foto"** con etichetta e flag **obbligatoria**, ordinabile come gli altri campi.

---

## 8. Foto obbligatorie (interventi manuali)

**Scope:** solo gli interventi manuali. Le voci pianificate non sono toccate.

**Configurazione:** ogni template definisce N campi di tipo `foto` (etichetta + flag `obbligatoria`). Oggi se ne configurano **4 obbligatori**; resta flessibile (più/meno slot, opzionali).

**Cattura (mobile-first):**
- Scatto: `<input type="file" accept="image/*" capture="environment">`.
- Libreria: `<input type="file" accept="image/*">` (senza `capture`).
- Preview per slot + possibilità di rifare lo scatto prima dell'invio.
- Compressione/ridimensionamento lato client prima dell'upload (proposta: lato lungo ~1600px, JPEG q≈0.8) per reggere rete mobile e non saturare lo storage.

**Validazione:** l'invio della richiesta è bloccato (client + server 422) finché ogni slot `obbligatoria=true` non ha una foto.

**Storage:** nuovo bucket Supabase **privato** `interventi-foto` con RLS; lettura admin via **signed URL**. Riuso del client storage già presente nel progetto (pattern di [app/hub/rapportini/save/route.tsx](../../../app/hub/rapportini/save/route.tsx)).
- `storage_path` = `<richiesta_id>/<slot_chiave>_<identificativo>.<ext>` (path univoco).

**Rinomina file (`file_name` logico):**
- formato: `<EtichettaSlotNormalizzata>_<identificativo>.<ext>`
- `EtichettaSlotNormalizzata` = etichetta dello slot foto configurata nel template, normalizzata (no spazi/accenti).
- `identificativo` = **primo disponibile** nell'ordine **PDR → matricola → ODL → indirizzo**, normalizzato.
- esempio: slot "Foto contatore" + PDR `12345` → `FotoContatore_12345.jpg`.

**Admin:** in revisione vede l'anteprima delle foto. Se sbagliate → *Rifiuta con motivo* (l'operatore ricarica). L'admin **non** sostituisce le foto (assunzione corrente; modificabile).

**Export ZIP (riepilogo admin):** nel riepilogo rapportini, un'icona per rapportino scarica **tutte** le foto dei suoi interventi manuali in un unico **ZIP**, con i file già rinominati (convenzione sopra). In caso di nomi coincidenti, le foto sono separate in sottocartelle per intervento (`<identificativo>/…`). Route server `GET /api/admin/rapportini/[rapportinoId]/foto-zip`, archivio generato con `jszip`.

---

## 9. Realtime / Notifiche
- Abilitare la publication realtime su `interventi_manuali` (stesso approccio di [20260603020000_realtime_interventi.sql](../../../supabase/migrations/)).
- Il campanello sottoscrive gli `INSERT`/`UPDATE` con `stato='in_attesa'` e mostra il contatore; suono/toast all'arrivo (non bloccante).
- **Presa in carico**: solo indicatore informativo (`preso_in_carico_da/at`), **senza scadenza automatica**; rilascio manuale e **override** se un admin si pianta. Il forcing reale è il blocco-invio del rapportino.

---

## 10. Sicurezza e permessi
- Route operatore: accesso **token-based** sul proprio rapportino (coerente con `voce/route.ts` e `invia/route.ts`); nessun accesso ad altri rapportini.
- Route admin: `requireAdmin()`.
- RLS `interventi_manuali` / `interventi_manuali_foto`: coerente con le altre tabelle (`FOR ALL TO authenticated`), controllo reale ai guard API.
- Bucket `interventi-foto` **privato** + policy storage; visualizzazione admin via signed URL.

---

## 11. Casi limite / error handling
- **Rapportino inviato/scaduto** → FAB disabilitato (riuso `bloccato`/`tokenStatus`).
- **Invio rapportino con voci in sospeso** → bloccato (409) con elenco delle voci da attendere.
- **Foto obbligatoria mancante** → invio richiesta bloccato (client + server 422).
- **Upload foto fallito** → la richiesta non viene creata; messaggio + retry (prima si caricano le foto, poi si crea la richiesta).
- **Race tra admin** → presa in carico informativa + override; l'azione finale (approva/rifiuta) è atomica: la seconda riceve "già gestita da …".
- **Rifiuto → re-invio** → la stessa richiesta torna `in_attesa`; lo storico resta nel registro.
- **Annulla in attesa** → voce rimossa, richiesta `annullata` (audit), foto eliminate dal bucket.
- **Geocodifica fallita** → intervento creato senza coordinate (come per gli import), non blocca.
- **Doppio invio** → bottone disabilitato durante l'invio + guardia server.
- **Admin cambia committente** in revisione → ri-risoluzione del template di riferimento.

---

## 12. Riuso del codice esistente
- Creazione intervento canonico: logica di [taskToIntervento.ts](../../../lib/interventi/taskToIntervento.ts) / `ensureInterventiForPiano` (`origine='manuale'`, `created_from_mappa=false`).
- Geocodifica: [geocodeServer.ts](../../../lib/interventi/geocodeServer.ts) / `POST /api/interventi/geocode`.
- Aggancio voce↔intervento: setting diretto di `intervento_id` (pattern in [voceInterventoLink.ts](../../../lib/interventi/voceInterventoLink.ts)).
- Upload storage: pattern di [app/hub/rapportini/save/route.tsx](../../../app/hub/rapportini/save/route.tsx).
- Feed realtime admin: pattern di [useInterventiFeed.ts](../../../lib/interventi/useInterventiFeed.ts).
- Corsia "Liberi" UI: estensione di [ManualAssignmentsModal.tsx](../../../components/modules/mappa/ManualAssignmentsModal.tsx).
- Config template foto: estensione di [TemplateRapportiniClient.tsx](../../../app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx) e di `TemplateCampo`/[CampoInput.tsx](../../../components/modules/rapportini/CampoInput.tsx).
- Stato modificabilità rapportino: `tokenStatus` + flag `bloccato`.
- Export ZIP foto: `jszip` (già nelle dipendenze del progetto).

---

## 13. Strategia di test (TDD)
- **Risoluzione template per committente** (con fallback a default quando manca il template specifico).
- **Creazione richiesta**: normale (in_attesa + voce sospesa) vs liberi (intervento + voce subito, auto_liberi).
- **Validazione foto obbligatorie**: invio rifiutato (422) se manca uno slot obbligatorio.
- **Naming foto**: etichetta normalizzata + identificativo per priorità (PDR→matricola→ODL→indirizzo).
- **Export ZIP**: contenuto completo e nomi file corretti; separazione in sottocartelle su collisione di nomi.
- **Blocco invio rapportino**: invio rifiutato con ≥1 voce in `in_attesa`.
- **Transizioni di stato**: in_attesa → approvato / rifiutato / annullato; re-invio dopo rifiuto.
- **Approvazione**: crea `interventi` con campi corretti (`origine='manuale'`, link voce, applica `dati_correnti`), preserva `dati_operatore`.
- **Presa in carico**: indicatore + override; azione finale atomica (no doppia decisione).

---

## 14. Fuori scope (YAGNI, per ora)
- Notifiche push/email agli admin (solo badge realtime in-app).
- Foto per gli interventi pianificati (solo manuali per ora).
- Modale di escalation a timeout (scartata: badge + presa in carico + blocco-invio).
- KPI dedicati ai manuali (confluiscono nei KPI esistenti via `origine`).
- Sostituzione delle foto da parte dell'admin in revisione.

---

## 15. Punti aperti
- Limiti dimensione/compressione foto (proposta: lato lungo ~1600px, JPEG q≈0.8; tetto per foto).
- Numero/etichette di default dei 4 slot foto da preconfigurare nei template (es. "Foto contatore", "Foto sigillo", "Foto matricola", "Foto panoramica").
- Bucket pubblico vs privato+signed URL per l'anteprima admin (proposta: privato + signed URL).
