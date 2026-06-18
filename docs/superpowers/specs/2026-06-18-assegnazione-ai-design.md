# Modulo "Assegnazione AI" — pianificazione assistita dal file

**Data:** 2026-06-18
**Stato:** Design approvato

## Contesto
Estende il modulo Agente ([[modulo-agente]]). Oggi l'agente locale (`tools/limitazioni-sync`) legge il file Excel ACEA e **scrive** gli esiti dei lavori. Per **pianificare** gli interventi del file (assegnarli a un operatore per un giorno e generare i rapportini), oggi l'ufficio fa a mano: scrive data+esecutore sul file → popola il "template di pianificazione indirizzo" → lo importa in "pianificazione indirizzi" → segue l'iter. Questa feature automatizza il **ponte**: l'agente **legge** le righe del giorno scelto, l'app le mostra in un nuovo modulo **"Assegnazione AI"**, l'utente **seleziona** le righe e con **"Procedi"** l'app crea piano + interventi + rapportini **riusando il motore esistente** (`ensureInterventiForPiano` + `sincronizzaRapportini`).

## Principi
- **Human-in-the-loop**: l'agente è solo **lettore**; la decisione (giorno, righe) e la creazione stanno nell'app. Nessuna pianificazione automatica al buio.
- **Riuso massimo**: il flusso "pianificazione indirizzi" esiste già lato server e si richiama senza UI mappa.

## Flusso
1. Nel modulo Assegnazione AI scegli un **giorno** (es. 19/06) → **"Leggi dal file"** (il file può contenere l'intero programma del mese: l'agente pesca **solo** quel giorno).
2. L'app arma una richiesta di lettura per quel giorno (`agente_config.pianifica_data`, one-shot).
3. L'agente, al tick (entro ~1 min col Task ogni minuto), legge ZAGAROLO, prende le righe con **`data = giorno scelto` + esecutore valorizzato + esito vuoto**, estrae le colonne chiave e le invia a `POST /api/agente/pianificabili`. L'app azzera il flag. **L'agente non scrive sul file.**
4. Il modulo mostra la **tabella** (ODL, matricola, indirizzo, comune, data, esecutore, **gruppo attività**, **committente**) con **checkbox per riga**; gli esecutori non risolti sono segnalati.
5. Selezioni/deselezioni le righe → **"Procedi"**.
6. L'app, per le righe selezionate: mappa esecutore→staff_id, raggruppa per (data, comune), crea **piano → interventi (assegnati) → rapportini** (template del file). Mostra l'esito (piani/rapportini creati, operatori non trovati).

## Componenti

### 1. Modulo `/hub/assegnazione-ai`
- Nuova chiave modulo `assegnazione-ai` in `lib/moduleAccess.ts` (`adminOnly`).
- `app/hub/assegnazione-ai/page.tsx` (gate admin) + componente client.
- UI: selettore file (per ora solo ZAGAROLO) + **date-picker** + **"Leggi dal file"**; **tabella** con checkbox (colonne chiave + gruppo attività + committente; badge "operatore non trovato"/"ambiguo"); **"Procedi"**; indicatore **"in attesa di lettura"** (come l'indicatore forza_scan) finché l'agente non risponde.

### 2. Agente — modalità lettura pianificabili (`tools/limitazioni-sync/agente.mjs`)
- Il **tick** ritorna `pianificaData` (la data richiesta) se `agente_config.pianifica_data` è valorizzato.
- Se `pianificaData` è presente, una funzione pura **`righePianificabili(rows, col, data)`** filtra le righe con `data == pianificaData` + esecutore presente + esito vuoto, ed estrae `{riga, odl, matricola, indirizzo, comune, data, esecutore}`. `agente.mjs` apre il file, applica il filtro e fa `POST /api/agente/pianificabili {file, data, righe}`. **Read-only**, in più del tick normale (non tocca `forza_giro`/`forza_scan`/scrittura).
- One-shot: il flag si azzera quando l'app riceve le righe.

### 3. Endpoint
- **`POST /api/agente/pianificabili`** (chiave condivisa `chiaveValida`): riceve `{file, data, righe:[…]}` → **rimpiazza** il set in `agente_pianificabili` per quel `file`+`data`; azzera `agente_config.pianifica_data`.
- **`POST /api/admin/agente/leggi-pianificabili`** (`requireAdmin`): `{file, data}` → setta `agente_config.pianifica_data = data` (arma la lettura). Ritorna `{ok:true}`.
- **`POST /api/admin/agente/assegna`** (`requireAdmin`): `{ids:[…]}` (righe `agente_pianificabili` selezionate) → per ognuna applica i costanti per-file (`committente`, `attivita`, `template_id`) da `agente_file_config`; mappa esecutore→staff_id (cognome di `staff.display_name`); raggruppa per `(data, comune)`; crea/aggiorna il piano (riusa `POST /api/mappa/piani` o le sue funzioni), poi `ensureInterventiForPiano(pianoId)` e `sincronizzaRapportini(pianoId, templateId)`. Ritorna `{piani:[…], rapportini:[…], nonTrovati:[…]}`.

### 4. Dati (migration — la lancia l'utente)
- **`agente_pianificabili`**: `id uuid pk, file text, riga int, odl text, matricola text, indirizzo text, comune text, data date, esecutore text, scansionato_il timestamptz`. Indice su `(file, data)`. Nessuna FK (set volatile).
- **`agente_file_config`**: `file text pk, committente text, attivita text, template_id uuid, updated_at timestamptz`. **Seed**: `ZAGAROLO.xlsx` → `committente='lim_massive'`, `attivita='LIMITAZIONI MASSIVE'`, `template_id=<id "Rapportino limitazioni massive">`.
- **`agente_config`** + colonna `pianifica_data date null`.

## Mappatura esecutore → operatore
Il file salva il **cognome** (l'export usa `cognomeDaDisplayName`). Match: `staff` dove il cognome di `display_name` (primo token, maiuscolo) `==` esecutore (maiuscolo). **0 match → "non trovato"; >1 → "ambiguo"**. Le righe non risolte si vedono in tabella ma **non sono pianificabili** (escluse dal Procedi, con avviso). Helper puro `risolviEsecutore(esecutore, staff[])` testabile.

## Idempotenza
- `ensureInterventiForPiano` usa il dedup `(committente, odl, data)` **già esistente**: una riga già pianificata non si duplica.
- `agente_pianificabili` è un set **volatile** per `(file, data)`: rileggere rimpiazza. (Fase 2 opzionale: lato server escludere dal preview le righe che hanno già un intervento per `odl+data`.)

## Scelte confermate
- **Territorio** piano = **comune** del file (un piano per `data, comune`).
- **Niente geocodifica/ottimizzazione rotta** (operatore già assegnato dal file; i rapportini non usano coordinate). Eventuale geocodifica best-effort futura solo per la mappa.
- **Committente / gruppo attività / template** = **costanti per-file** (`agente_file_config`), seed per ZAGAROLO; estendibili ad altri file.

## Fasi (per il piano)
- **Fase 1 — Lettura + tabella**: `agente_pianificabili` + endpoint `pianificabili`/`leggi-pianificabili` + agente `righePianificabili`/upload + modulo con tabella, checkbox, indicatore "in attesa". Risultato: vedi la tabella popolata del giorno scelto.
- **Fase 2 — Procedi + creazione**: endpoint `assegna` + `risolviEsecutore` + riuso piano/interventi/rapportini + schermata esito.

## Testing
- **Puri**: `righePianificabili` (filtro data/esecutore/esito + estrazione colonne); `risolviEsecutore` (match cognome, ambiguo, non trovato); raggruppamento `(data, comune)`.
- **Riuso**: `ensureInterventiForPiano`/`sincronizzaRapportini` già testati.
- **Endpoint**: verifica manuale (curl) + smoke nel modulo.
- Gate **mirati** (baseline repo rossa).

## Fuori scope
- Geocodifica/rotta sulla mappa.
- File diversi da ZAGAROLO (la config per-file è predisposta; seed solo ZAGAROLO).
- Scrittura sul file di un marcatore "PIANIFICATO" (idempotenza già garantita dal dedup; eventuale follow-up).
