# Risanamento colonne — Fase 1: Fondamenta dati

**Data:** 2026-06-09
**Stato:** Design in revisione
**Progetto:** Flusso operativo "Risanamento colonne" (multi-fase). Questo documento copre **solo la Fase 1**.

---

## Quadro generale (contesto)

Nuovo flusso operativo per il risanamento delle colonne montanti. L'operatore riceve un
link (stesso stile dei rapportini attuali `/r/[token]`) che contiene uno o più **civici/stabili**;
per ogni civico carica **N righe-misuratore** (una per contatore) con foto, più foto a livello
di stabile. La struttura è **gerarchica a 2 livelli** (civico → misuratori), diversa dai
rapportini "piatti" attuali.

**Caratteristiche del flusso (raccolte in brainstorming):**
- Template **apposito** di tipo "risanamento" (gerarchico), distinto dai template piatti.
- **Estrazione di riferimento** (PDR + matricola + nominativo + civico) caricata nel DB.
- Sul posto: **scan barcode/QR** del misuratore → la **matricola** è la chiave; PDR e nominativo
  si **auto-compilano** dal match. Lookup **prima nel civico**, poi **globale** (l'anagrafica può
  essere sporca → misuratore su civico errato), infine **inserimento manuale** se non trovata.
- "Prima" e "dopo" del contatore avvengono in **fasi separate** nel tempo: la riga si crea con la
  foto "prima" e si completa più tardi con la foto "dopo". Una **barra di ricerca scanner** in alto
  ritrova le righe già create (per la fase "dopo").
- Foto a 3 raggruppamenti dentro la card-civico: **misuratori** (righe, prima/dopo),
  **fasi** (resina, livello stabile), **accessorie** (intercettazione/muratura, opzionali attivabili).
- **Multi-civico** e **multi-operatore** sullo stesso link (concorrenza).
- Alla chiusura: l'app **conta le righe-contatore** e mostra "rilevati N punti gas"; l'operatore
  **conferma** o **annulla e ricontrolla**. Blocco rigido alla chiusura: **doppia foto (prima+dopo)
  per ogni riga**.
- Chiusura → **PDF** (lista punti gas resina + intercettazioni + opere murarie), condiviso come oggi.

**Decomposizione in fasi** (ogni fase = spec → piano → implementazione a sé):
1. **Fase 1 — Fondamenta dati** ← *questo documento*
2. Fase 2 — Editor template risanamento (slot foto con scope misuratore/fase/accessoria)
3. Fase 3 — Assegnazione & generazione link (uno o più civici dal dataset)
4. Fase 4 — UI operatore (card-civico → 3 sezioni, scanner barcode/QR + lookup, foto, concorrenza)
5. Fase 5 — Chiusura (conteggio + conferma punti gas, vincolo doppia foto) & PDF

**Principi guida:** massimo riuso del sistema rapportini esistente (link, stile, foto, PDF);
modello concorrenza-safe; nessuna reinvenzione.

---

## Scope della Fase 1

Consegna lo **schema dati** (tabelle e colonne) e la **schermata admin di import** dell'estrazione
di riferimento. È software testabile da solo: carico un'estrazione Excel/CSV e vedo le righe nel DB.

Non tocca: editor template (F2), generazione link (F3), UI operatore/scanner (F4), conteggio-conferma e PDF (F5).

---

## Sezione 1 — Tabella di riferimento misuratori + import

### Tabella `risanamento_misuratori_ref`

Ospita l'estrazione (fonte del lookup dello scanner).

| colonna | tipo | note |
|---|---|---|
| `id` | bigserial PK | |
| `import_id` | uuid NOT NULL | identifica il caricamento (re-import / eliminazione selettiva) |
| `indirizzo` | text | scope "prima nel civico" |
| `civico` | text | scope "prima nel civico" |
| `comune` | text NULL | disambiguazione |
| `cap` | text NULL | disambiguazione |
| `pdr` | text NULL | auto-compila la riga |
| `matricola` | text NOT NULL | **chiave del lookup** (ciò che lo scanner cerca) |
| `nominativo` | text NULL | auto-compila la riga |
| `created_at` | timestamptz default now() | |

**Indici:** `matricola` (lookup globale), `(indirizzo, civico)` normalizzati (scope civico), `import_id`.
**Niente UNIQUE su `matricola`**: l'anagrafica può essere sporca (matricola duplicata / civico errato);
i match multipli si gestiscono nel lookup (Fase 4).

### Import (schermata admin)

- Pagina admin che carica un file **Excel/CSV** (riuso del pattern già esistente in
  `app/api/sopralluoghi/import-civici`; parsing con la libreria già in uso nel progetto).
- Ogni import genera un nuovo `import_id`; la schermata elenca gli import caricati con
  conteggio righe e possibilità di **eliminarne** uno (per ricaricare un'estrazione aggiornata).
- Validazione delle colonne attese; righe senza `matricola` scartate con report.

---

## Sezione 2 — Modello gerarchico (voce-civico + tabella figlia righe)

**Card-civico = una `rapportino_voci`** (riuso totale di link/stile/chiusura/PDF). I campi anagrafici
della voce descrivono lo stabile; le foto per-stabile (fasi, accessorie) vivono in
`rapportino_voci.risposte`. Un rapportino di `tipo='risanamento'` interpreta le sue voci come card-civico.

### Tabella `rapportino_righe` (figlia della voce)

| colonna | tipo | note |
|---|---|---|
| `id` | uuid PK (default gen_random_uuid()) | |
| `voce_id` | uuid FK → `rapportino_voci` ON DELETE CASCADE | la card-civico di appartenenza |
| `rapportino_id` | uuid FK → `rapportini` | denormalizzato per query/PDF rapidi |
| `matricola` | text NOT NULL | scansionata |
| `pdr` | text NULL | auto-compilato dal match |
| `nominativo` | text NULL | auto-compilato dal match |
| `ref_id` | bigint FK → `risanamento_misuratori_ref` NULL | riga matchata; null se manuale/non trovata |
| `fonte` | text NOT NULL CHECK in (`civico`,`fuori_elenco`,`manuale`) | come è stata risolta la matricola |
| `risposte` | jsonb NOT NULL default '{}' | foto per-misuratore (chiave-slot → storage path), come le voci |
| `ordine` | int NOT NULL | ordinamento all'interno della card |
| `creato_da` | text NULL | operatore che ha creato la riga (multi-operatore) |
| `created_at` / `updated_at` | timestamptz | trigger su updated_at |

**Indici:** `voce_id`, `rapportino_id`, `matricola` (per la barra di ricerca della fase "dopo").
**Concorrenza:** ogni scan = un `INSERT` indipendente → niente read-modify-write; più operatori
sullo stesso civico non si sovrascrivono.
**Compilazione incrementale:** la riga nasce in fase "prima" (solo foto prima) e si completa in fase
"dopo" (`UPDATE risposte`). Nessuna riga è "completa" finché non ha entrambe le foto — base del vincolo
di chiusura (Fase 5).
**RLS / accessi:** stessa policy di `rapportino_voci` (accesso via service-role lato server, come gli
altri endpoint `/api/r/[token]` e admin).

---

## Sezione 3 — Flag tipo template

- `rapportino_template.tipo` — text NOT NULL default `'standard'`, CHECK in (`standard`,`risanamento`).
  Distingue il template gerarchico. L'UI per impostarlo arriva in Fase 2; in Fase 1 è settabile via SQL/seed.
- `rapportini.tipo` — text NOT NULL default `'standard'` (**snapshot** alla generazione del link),
  così il rendering sa subito se il rapportino è piatto o gerarchico senza dipendere dal template live.

Il conteggio "punti gas rilevati" alla chiusura è un semplice `COUNT` delle righe → **nessuna colonna
da persistere** in Fase 1 (comportamento della Fase 5).

---

## Migration

Tutte le modifiche di schema di questo progetto multi-fase vengono **accumulate e consegnate in un
unico blocco SQL alla fine** (l'utente le lancia dal PC, in una sola sessione). I file di migration
vengono creati nel repo come record (`supabase/migrations/`), ma **non eseguiti** dall'agente (il
Supabase MCP punta ad altro progetto) e **non consegnati in chat** finché l'utente non li richiede.

Migration introdotte dalla Fase 1 (file nel repo):
- `risanamento_misuratori_ref` (Sezione 1)
- `rapportino_righe` (Sezione 2)
- `rapportino_template.tipo`, `rapportini.tipo` (Sezione 3)

---

## Error handling

- Import: file senza colonna `matricola` → 422 con messaggio; righe singole senza matricola → scartate e contate nel report.
- Re-import dello stesso dataset → nuovo `import_id`; nessuna fusione automatica (l'admin elimina il vecchio import se serve).
- `rapportino_righe.fonte='manuale'` → `ref_id` null, `pdr`/`nominativo` inseriti a mano (Fase 4).
- Matricola duplicata nell'estrazione → ammessa (no UNIQUE); il lookup gestirà i match multipli (Fase 4).

## Testing

- Unit: parsing/validazione del file di import (colonne attese, scarto righe senza matricola, conteggi).
- Unit: helper di normalizzazione indirizzo/civico per lo scope (se introdotto).
- Lo schema si verifica applicando la migration su un DB di prova; gli endpoint di import con un file di esempio.

## Fuori scope (YAGNI)

- Nessun lookup/scanner (Fase 4), nessun editor del tipo template (Fase 2), nessuna generazione link (Fase 3), nessun PDF/conteggio (Fase 5).
- Nessun vincolo UNIQUE sulla matricola di riferimento (anagrafica sporca per design).
- Nessuna persistenza del totale punti gas (derivato con COUNT alla chiusura).
