# Design — Rapportini interattivi (Blocco B)

- **Data:** 2026-05-31
- **Stato:** approvato (in attesa di revisione finale utente)
- **Autore:** Edgardo Perrelli (con Claude)
- **Stack:** Next.js 15 (App Router) · React 19 · Supabase · TypeScript · Tailwind 4 · zod · Vitest
- **Collegato a:** [Blocco A — assegnazioni manuali](2026-05-31-assegnazioni-manuali-mappa-design.md)

---

## 1. Contesto e obiettivo

Oggi i rapportini sono **file Excel** generati lato admin e compilati a mano (le colonne di
esito M–Q + note). Si vuole renderli **interattivi e compilabili online dai tecnici** tramite
un **link tokenizzato** inviato via **WhatsApp** — **senza account/login**. Ogni operatore
apre il proprio link, compila gli esiti (le "**crocette**") e le note per ogni intervento, con
**salvataggio automatico**, e a fine giornata preme **Invia**. Gli admin vedono i risultati
lato desktop e possono **esportare l'Excel + Allegato 10** dai dati compilati.

I rapportini **nascono dal piano mappa** (Blocco A): gli interventi già assegnati a ogni
operatore diventano le voci del suo rapportino. La compilazione è **storicizzata nel DB in
forma relazionale** (una riga per intervento eseguito), **non come PDF**, seguendo il
"template tabelle" del progetto gemello **Aurea**.

## 2. Scope

**In scope:**
- Generazione rapportini dal piano + token/link (48h), invio via WhatsApp (manuale).
- Template del rapportino **configurabile in Impostazioni** (più template, campi tipizzati), **uno per piano** scelto alla generazione.
- Rotta pubblica `/r/[token]` senza login: compilazione dinamica dal template, autosave, Invia.
- Lato admin: vista/stato rapportini, **alert "non consegnato"**, export Excel + Allegato 10 dai dati compilati.
- Storicizzazione relazionale (rapportini → voci), una riga per intervento.

**Fuori scope:**
- Account/login per gli operatori (esplicitamente escluso: accesso solo via link).
- Mapping custom-template → Excel ufficiale (per ora solo il template Standard mappa le colonne ufficiali).
- Notifiche push/automazioni oltre l'alert in-app (email opzionale).

## 3. Glossario

| Termine | Significato |
|---|---|
| **Rapportino** | Insieme degli interventi di **un operatore** per **un piano** (una giornata), compilabile via link |
| **Voce** | Una riga = **un intervento** del rapportino |
| **Crocette** | Le X di esito che l'operatore mette (ATT/CESS, CAMBIO, MINI BAG, RG STOP, ASSENTE) |
| **Template** | Definizione configurabile dei campi compilabili di un rapportino (in Impostazioni) |
| **Token** | Stringa casuale che fa da chiave del link pubblico (URL "a capacità") |
| **Snapshot** | Copia "congelata" alla generazione (dei campi del template e dei dati intervento) |

## 4. Modello dati

Convenzioni allineate ad **Aurea**: `id` uuid `gen_random_uuid()`, `created_at`/`updated_at`
con trigger `set_updated_at()`, colonne tipizzate per i dati stabili + **JSONB** per ciò che è
flessibile (campi del template, risposte, `raw_json` di audit), naming snake_case, `stato`
testuale a valori controllati. Pattern **padre → figlio** (rapportini → voci), una riga per
intervento (come `production_entries` di Aurea).

```sql
-- Trigger condiviso (crea solo se non già presente nel DB)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- 1) TEMPLATE rapportini (gestiti in Impostazioni)
create table if not exists rapportino_template (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  campi       jsonb not null default '[]',  -- [{chiave, etichetta, tipo, opzioni?, ordine}]
  is_default  boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- tipo ∈ 'crocetta' | 'testo' | 'select' | 'numero'

-- 2) RAPPORTINI (uno per operatore per piano)
create table if not exists rapportini (
  id             uuid primary key default gen_random_uuid(),
  piano_id       uuid not null references mappa_piani(id) on delete cascade,
  staff_id       text not null,
  staff_name     text,
  data           date not null,
  template_id    uuid references rapportino_template(id) on delete set null,
  campi_snapshot jsonb not null default '[]',  -- campi del template "congelati"
  token          text not null unique,
  stato          text not null default 'in_corso',  -- 'in_corso' | 'inviato' | 'scaduto'
  expires_at     timestamptz not null,
  submitted_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (piano_id, staff_id)
);
create index if not exists idx_rapportini_token ON rapportini(token);
create index if not exists idx_rapportini_piano ON rapportini(piano_id);
create index if not exists idx_rapportini_stato_data ON rapportini(stato, data);

-- 3) VOCI (una per intervento)
create table if not exists rapportino_voci (
  id             uuid primary key default gen_random_uuid(),
  rapportino_id  uuid not null references rapportini(id) on delete cascade,
  task_id        text,            -- id intervento del piano (merge in rigenerazione)
  ordine         int not null default 0,
  -- snapshot dati intervento (sola lettura)
  nominativo text, matricola text, pdr text, odsin text,
  via text, comune text, cap text, recapito text,
  attivita text, accessibilita text, fascia_oraria text,
  raw_json       jsonb not null default '{}',  -- Task completo (audit)
  -- compilabili
  risposte       jsonb not null default '{}',  -- { chiaveCampo: valore }
  updated_at     timestamptz not null default now()
);
create index if not exists idx_voci_rapportino ON rapportino_voci(rapportino_id);

-- Trigger updated_at
create trigger rapportino_template_set_updated_at before update on rapportino_template
  for each row execute function public.set_updated_at();
create trigger rapportini_set_updated_at before update on rapportini
  for each row execute function public.set_updated_at();
create trigger rapportino_voci_set_updated_at before update on rapportino_voci
  for each row execute function public.set_updated_at();

-- RLS: solo authenticated (area admin). L'accesso pubblico passa da rotte server con
-- service role DOPO validazione del token (anon NON abilitato direttamente).
alter table rapportino_template enable row level security;
alter table rapportini          enable row level security;
alter table rapportino_voci      enable row level security;
-- (policy "FOR ALL TO authenticated USING (true) WITH CHECK (true)" per tutte e tre)

-- Seed template Standard (5 crocette + nota)
insert into rapportino_template (nome, is_default, campi) values
('Standard', true, '[
  {"chiave":"att_cess","etichetta":"ATT/CESS","tipo":"crocetta","ordine":1},
  {"chiave":"cambio","etichetta":"CAMBIO","tipo":"crocetta","ordine":2},
  {"chiave":"mini_bag","etichetta":"MINI BAG","tipo":"crocetta","ordine":3},
  {"chiave":"rg_stop","etichetta":"RG STOP","tipo":"crocetta","ordine":4},
  {"chiave":"assente","etichetta":"ASSENTE","tipo":"crocetta","ordine":5},
  {"chiave":"note","etichetta":"Note","tipo":"testo","ordine":6}
]'::jsonb)
on conflict do nothing;
```

**Relazioni:** `mappa_piani` 1─N `rapportini` 1─N `rapportino_voci` (cascade). `rapportino_template` referenziato da `rapportini` (con snapshot per stabilità).

## 5. Generazione dei rapportini dal piano

**Trigger:** pulsante **"Genera rapportini"** su un piano salvato (dal Registro pianificazioni / editor mappa). All'avvio l'admin **sceglie un template** (menu dai template attivi).

**Logica** (server-side, funzione pura `buildRapportiniFromPiano` + persistenza):
1. Per ogni operatore del piano (`mappa_piani_operatori`):
   - upsert `rapportini` per `(piano_id, staff_id)`; se nuovo → genera `token` (≥32 byte random), `expires_at = now()+48h`, `stato='in_corso'`; salva `template_id` + `campi_snapshot` (campi del template scelto).
   - se esiste già → **mantiene token** ed eventualmente aggiorna `campi_snapshot` (se si rigenera con altro template).
2. Per ogni intervento (`tasks` JSONB dell'operatore) → upsert `rapportino_voci` per `task_id`:
   - snapshot dei campi (nominativo, matricola, pdr, odsin, via=indirizzo, comune=citta, cap, recapito, attivita, accessibilita, fascia_oraria) + `raw_json` = Task completo + `ordine`.
   - `risposte`: se la voce esisteva → **conservate**; se nuova → `{}`.
   - voci con `task_id` non più presente → eliminate.
3. Restituisce la lista operatori + link `https://<NEXT_PUBLIC_APP_URL>/r/<token>`.

**Output admin:** lista operatori con **link** (Copia / Apri WhatsApp `wa.me` precompilato col recapito se disponibile).

**Config:** serve `NEXT_PUBLIC_APP_URL` (URL pubblico del deploy) per costruire link inviabili.

## 6. Impostazioni → "Template rapportini"

Nuovo **sotto-modulo** in Impostazioni (`app/impostazioni/template-rapportini`), admin-only,
stile Aurea, coerente con utenze/codici-allegato10/zone-ztl.

- **Lista**: nome · n° campi · attivo · default.
- **Editor**: `nome` + campi **ordinabili**; per campo: etichetta, **tipo** (crocetta/testo/select/numero), opzioni (se select), ordine; aggiungi/rimuovi/riordina; attiva/disattiva.
- **Default "Standard"** (seed) protetto dalla cancellazione.
- **API** `/api/admin/rapportino-template` (GET/POST/PATCH/DELETE), `requireAdmin`, validazione **zod**.
- Modifica/cancellazione **non rompe** i rapportini esistenti (usano `campi_snapshot`).

## 7. Rotta pubblica `/r/[token]` — compilazione, autosave, Invia

**Rotta** `app/r/[token]/page.tsx` — **fuori da AuthGate**. Server Component: carica il
rapportino per token (service role), valida **token + scadenza + stato**, rende il form
(client). Stati speciali: non trovato · scaduto · già inviato (sola lettura).

**Form (mobile/tablet, stile Aurea):**
- Intestazione: operatore, data, territorio.
- Elenco **voci**: campi precompilati in **sola lettura** + campi editabili **resi dinamicamente dal `campi_snapshot`** (crocetta → casella, testo → input, select → tendina, numero).
- **Autosave a ogni azione** (debounce) → `POST /api/r/[token]/voce` `{voceId, risposte}`; indicatore "salvato ✓". **Resiliente**: coda + retry, stato "non salvato" su rete assente.
- **Invia** → `POST /api/r/[token]/invia` → `stato='inviato'`, `submitted_at`; poi sola lettura (admin può riaprire).

**Sicurezza (URL "a capacità"):**
- Token ≥32 byte random, univoco, indicizzato; scadenza 48h; solo HTTPS.
- Tabelle **non** esposte ad anon: ogni accesso pubblico passa da rotte server che validano il token e usano service role; il token vede **solo** il proprio rapportino/voci (verifica che `voceId` appartenga al rapportino).
- Rate-limiting leggero sulle rotte pubbliche.
- **Da verificare nel piano:** che nessun `middleware.ts` o layout radice applichi auth globale a `/r` (in quest'app `AuthGate` è importato **per-pagina**, quindi `/r` resta pubblica; confermare l'assenza di un gate globale).

## 8. Lato admin (desktop) — vista, stato, alert, export

**Pannello "Rapportini" del piano** (dal Registro pianificazioni): per operatore → link
(Copia / WhatsApp), **stato** (in corso/inviato/scaduto), **avanzamento** (voci compilate/totali),
`submitted_at`; azioni: vedi (anteprima read-only), riapri, rigenera.

**Alert "non consegnato":** banner che elenca i rapportini con `stato ≠ 'inviato'` e `data`
passata → *"[operatore] · piano [data] non consegnato, richiede intervento"* (query al
caricamento). **Opzionale**: email agli admin (nodemailer già presente).

**Export Excel + Allegato 10:** rigenera l'Excel (+ Allegato 10 Lazio/Firenze) **riempito con le
risposte compilate** (crocette → colonne M–Q, note → sezione note), riusando la generazione
`exceljs`/`docx` esistente ma **alimentata dai dati DB**.
- Template **Standard** → mapping diretto alle colonne ufficiali del `Rapportino.xlsx`.
- Template **custom** → tabella Excel generica (colonne = campi); Allegato 10 resta legato ai codici attività (`allegato10_codici`).

## 9. Casi limite e sicurezza

| Caso | Comportamento |
|---|---|
| Token non trovato | Pagina "Rapportino non trovato" |
| Link scaduto (>48h) | "Link scaduto — contatta l'ufficio" |
| Già inviato | Sola lettura "Inviato il …" (admin può riaprire) |
| Connessione scarsa in campo | Autosave con coda + retry; stato "non salvato"; nessuna perdita |
| Stesso link su 2 dispositivi | Last-write-wins per singola voce |
| Rigenerazione dopo compilazione | Match per `task_id`: risposte conservate; nuove vuote; rimosse eliminate |
| Template modificato dopo generazione | Invariato (usa `campi_snapshot`) |
| Piano cancellato | Cascade: rapportini+voci eliminati → link 404 |
| Invio con voci incomplete | Consentito, con conferma "alcune voci senza esito, invii comunque?" |

## 10. Testing (Vitest)

**Funzioni pure** (testabili senza DB/React), estratte in `utils/rapportini/`:
- `buildRapportiniFromPiano(piano, operatori, tasksByOp, template)` → rapportini+voci, con **merge per `task_id`** che preserva le risposte. Test: snapshot corretto, merge che conserva/aggiunge/rimuove.
- `tokenStatus(rapportino, now)` → `valido | scaduto | inviato`. Test casi.
- `risposteToExcelRow(voce, templateStandard)` → mapping colonne M–Q + note. Test sul template Standard.
- `nonConsegnati(rapportini, oggi)` → lista per l'alert. Test.
- Validazione template (zod). Test.

**Verifica manuale**: rotta pubblica + autosave + Invia (runtime con app+Supabase), apertura
dell'Excel/Allegato 10 esportato.

## 11. File coinvolti (riferimenti per il piano)

| Area | File |
|---|---|
| Migrazione SQL (nuova) | `supabase/migrations/<ts>_rapportini_interattivi.sql` |
| Logica pura (nuova) | `utils/rapportini/buildRapportini.ts`, `tokenStatus.ts`, `excelMapping.ts`, `nonConsegnati.ts` (+ test) |
| Generazione | `app/api/mappa/rapportini/genera/route.ts` + pulsante in `RegistroPianificazioni.tsx` |
| Impostazioni template | `app/impostazioni/template-rapportini/page.tsx` (+ client), `app/api/admin/rapportino-template/route.ts` |
| Rotta pubblica | `app/r/[token]/page.tsx` + `components/.../RapportinoForm.tsx` |
| API pubbliche | `app/api/r/[token]/voce/route.ts`, `app/api/r/[token]/invia/route.ts` |
| Admin vista/alert/export | pannello in `RegistroPianificazioni.tsx`; refactor generazione `exceljs`/`docx` esistente in modulo riusabile alimentato da dati DB |

## 12. Passi futuri (fuori scope qui)

- Mapping configurabile **custom-template → Excel ufficiale**.
- Eventuale passaggio ad **account operatori** (oggi escluso: solo link).
- **Redesign completo** dell'app in stile Aurea (fase separata già pianificata).
- Notifiche email/automazioni più ricche sull'alert "non consegnato".
