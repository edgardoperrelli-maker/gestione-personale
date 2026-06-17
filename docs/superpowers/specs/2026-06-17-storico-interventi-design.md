# Storico interventi (consultazione) — modulo /hub/interventi

**Data:** 2026-06-17
**Stato:** design approvato
**Branch di lavoro previsto:** `feat/storico-interventi`

> ## ⚠️ REVISIONE v2 (2026-06-17, post-feedback utente) — fonte dati cambiata
>
> La v1 (sotto) basava lo Storico sulla tabella `interventi`. L'utente ha poi
> chiesto come colonne: **ODL/ODS · Data esecuzione · Esecutore · Via · Eseguito
> (SI/NO) · Sost. valvola · Mini bag · RG stop · Note** — e "il resto non
> interessa". I 4 campi Eseguito/valvola/mini bag/rg stop **non sono colonne di
> `interventi`**: sono **risposte del rapportino** (`rapportino_voci.risposte`,
> chiavi `eseguito`, `sostituzione_valvola`, `mini_bag`/`minibag`, `rg_stop`,
> `note`). Decisioni confermate dall'utente:
> - **Fonte = `rapportino_voci` + rapportino padre** (`rapportini!inner`), che
>   include sia programmati sia manuali (voci con `manuale=true`). Niente più
>   merge `interventi` + `interventi_manuali`.
> - **Data esecuzione = `rapportini.data`** (giorno del rapportino).
> - **Crocette non spuntate → `—`** (SI se valorizzato/true); resa via `siNo()`.
> - Colonne ESATTE = le 9 sopra. Filtri = ricerca (q) + Dal/Al + Esecutore +
>   Comune (committente/stato/esito rimossi).
> - Default oggi, ricerca su tutto lo storico, spinner, paginazione, cap
>   `MAX_RIGHE` con `troncato`: invariati.
>
> File aggiornati: `lib/interventi/storico/{types,filtri,normalizza}.ts` (+test),
> `app/api/interventi/storico/route.ts`, `components/modules/interventi/Storico*.tsx`.
> Chiavi/valori verificati sul DB di produzione via MCP (eseguito="SI"/"NO";
> crocette="true"; note testo libero).
>
> _Il testo v1 sotto è storico e superato sui punti fonte-dati/colonne._

## Obiettivo

Dentro il modulo esistente `/hub/interventi`, fornire una **pagina di sola
consultazione** che renda visibili **tutti gli interventi transitati per l'app**
— sia **programmati** sia **manuali** — con tutti i dettagli presenti
nell'estrazione "Excel interventi".

Comportamento richiesto:

1. La tabella mostra **di default solo gli interventi del giorno corrente**.
2. Una **barra di ricerca** (ODL/ODS, via, matricola, PDR, nominativo): se
   compilata, **interroga il DB su tutto lo storico** (ignora il filtro data) e
   mostra in tabella tutti i dati registrati.
3. **Filtri** (data singola + range Dal/Al, esecutore, comune, committente,
   stato, esito): una volta applicati **ri-interrogano il DB** con quei criteri
   (come se venisse generata una SQL), non filtrano solo lato client.
4. Ad ogni richiesta che parte verso il DB compare un **indicatore di
   caricamento** (spinner/barra), così è chiaro che la richiesta è partita.

Fuori scope (YAGNI): nessuna modifica/assegnazione/export da questa pagina
(l'export Excel esiste già altrove), nessuna modifica allo schema DB, nessun
nuovo permesso.

## Contesto codice esistente

- Modulo `/hub/interventi`: landing = form import (`app/hub/interventi/page.tsx`),
  `lista` = assegnazione operatori (`app/hub/interventi/lista/page.tsx`,
  server-render, solo `interventi`, solo oggi), `riconsegna` (admin).
- Permessi: modulo `interventi` definito in `lib/moduleAccess.ts`
  (`key: 'interventi'`, non adminOnly) → già abilitabile per-utente. La nuova
  pagina vive sotto lo stesso prefisso `/hub/interventi`, nessuna modifica
  permessi.
- Tabella **`interventi`** (canonica): `id, committente, odl, pdr, nominativo,
  matricola_contatore, indirizzo, comune, cap, lat, lng, codice_servizio,
  intervento_tipo, fascia_oraria, data, staff_id, stato, esito, esito_motivo,
  origine, chiuso_at, …`. Indici utili: `interventi_odl_idx (odl)`,
  `interventi_matricola_idx (matricola_contatore)`, `interventi_data_stato_idx`.
- Tabella **`interventi_manuali`**: campi diretti `staff_id, staff_name, data,
  committente, stato (in_attesa|approvato|rifiutato|auto_liberi|annullato),
  intervento_id, motivo_rifiuto, …`; anagrafica dentro i JSONB
  `dati_correnti`/`dati_operatore` con chiavi `InfoChiave`
  (`odl, pdr, matricola, via, comune, cap, nominativo, recapito, attivita,
  fascia_oraria, …`). Estrazione già disponibile via
  `lib/interventi/manuali/filtraCoda.ts → datiAnagraficaCoda()`
  (priorità `dati_correnti.anagrafica`, fallback `dati_operatore.anagrafica`).
- **Relazione manuali↔interventi:** i manuali **approvati / "liberi"** sono
  *promossi* a riga in `interventi` (`origine='manuale'`, e
  `interventi_manuali.intervento_id` valorizzato). I manuali **in attesa /
  rifiutati / annullati** restano solo in `interventi_manuali`
  (`intervento_id IS NULL`).
- Riuso UI: `components/ui/DatePicker.tsx` (range Dal/Al), spinner
  `animate-spin` (vedi `RisanamentoClient.tsx`), pattern fetch+loading
  (`RiepilogoRapportini.tsx`), helper esiti `lib/interventi/esitiCommessa.ts`,
  label stato `lib/interventi/interventiView.ts → labelStato()`.
- Colonne di riferimento (export "Excel interventi" basato su `interventi`,
  `app/api/interventi/export/route.ts`): Data, Operatore, Stato, Esito, Motivo,
  ODL, Nominativo, PDR, Matricola, Indirizzo, Comune, CAP, Attività, Fascia
  oraria, Chiuso.

## Architettura

### Forma dati unificata

Tipo puro `RigaStorico` (nuovo, in `lib/interventi/storico/types.ts`):

```
{
  id: string;
  origine: 'programmato' | 'manuale';   // 'manuale' = riga non promossa da interventi_manuali
  committente: string | null;
  data: string | null;                  // YYYY-MM-DD
  odl: string | null;
  pdr: string | null;
  matricola: string | null;
  nominativo: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  attivita: string | null;              // interventi.intervento_tipo / anagrafica.attivita
  fascia_oraria: string | null;
  esecutoreId: string | null;           // staff_id
  esecutoreNome: string | null;         // risolto da staff/auth
  stato: string | null;                 // stato grezzo (interventi.stato o interventi_manuali.stato)
  statoLabel: string;                   // etichetta leggibile
  esito: string | null;
  esitoLabel: string;                   // etichetta leggibile ('—' se assente)
  motivo: string | null;                // esito_motivo (interventi) o motivo_rifiuto (manuali)
}
```

### Normalizzazione (helper puri, testabili)

In `lib/interventi/storico/normalizza.ts`:

- `interventoToRigaStorico(row)` — mappa una riga `interventi`. `origine` =
  `'manuale'` se `row.origine === 'manuale'` altrimenti `'programmato'` (nota:
  il manuale promosso resta UNA riga, presa da `interventi`).
- `manualeToRigaStorico(row)` — mappa una riga `interventi_manuali` non promossa
  usando `datiAnagraficaCoda()` per l'anagrafica; `origine = 'manuale'`;
  `stato` = stato richiesta (`in_attesa`/`rifiutato`/`annullato`);
  `motivo` = `motivo_rifiuto`; `esito` = null.
- `labelStatoStorico(stato)` / `labelEsitoStorico(esito)` — riusano gli helper
  esistenti dove possibile, estesi per gli stati manuali.

### Endpoint `GET /api/interventi/storico`

Server route (force-dynamic). Query param:

| param | significato | default |
|---|---|---|
| `q` | ricerca testo (odl, indirizzo/via, matricola, pdr, nominativo) | — |
| `data` | giorno singolo YYYY-MM-DD | oggi (Europe/Rome) se nessun filtro data e nessun `q` |
| `dal`,`al` | range date (alternativo a `data`) | — |
| `esecutore` | staff_id | — |
| `comune` | comune (match esatto/ilike) | — |
| `committente` | acea/italgas/altro/lim_massive | — |
| `stato` | stato (interventi o manuale) | — |
| `esito` | esito (solo interventi) | — |
| `page` | indice pagina (0-based) | 0 |

Logica:

1. **Determinazione finestra temporale**
   - Se `q` valorizzato → **nessun vincolo data** (ricerca su tutto lo storico).
   - Altrimenti se `dal`/`al` presenti → range. Altrimenti → `data` (default oggi).
2. **Query `interventi`** con filtri server-side: `committente` (eq), `stato`
   (eq, se stato appartiene agli stati interventi), `esito` (eq), `comune`
   (ilike), `staff_id` (eq), finestra data (`eq` o `gte`/`lte`). Ricerca `q`:
   `or(odl.ilike.*q*, indirizzo.ilike.*q*, matricola_contatore.ilike.*q*,
   pdr.ilike.*q*, nominativo.ilike.*q*)`. Lettura paginata interna con
   `.range()` fino a un tetto di sicurezza (`MAX_RIGHE`, es. 5000) per aggirare
   il limite 1000 di PostgREST.
3. **Query `interventi_manuali`** solo se il filtro non esclude i manuali (cioè
   se `esito` non è impostato e `stato` non è uno stato esclusivo di
   `interventi`): `intervento_id IS NULL`, più `committente`/`staff_id`/data
   compatibili. Il match su `comune`/`q` (che vivono nel JSONB) viene fatto **in
   memoria** dopo `datiAnagraficaCoda()` — l'insieme dei manuali non promossi è
   piccolo. Mappatura `stato` manuale: `in_attesa`/`rifiutato`/`annullato`.
4. **Merge + ordinamento** in memoria: per `data` desc, poi `comune` asc, poi
   `indirizzo`. Risoluzione `esecutoreNome` da `staff` (e fallback `auth.users`
   via helper esistente) con una sola lookup batch.
5. **Paginazione di output**: `PAGE_SIZE` (es. 100). Risposta:
   `{ righe: RigaStorico[], total: number, troncato: boolean }`. Se il totale
   grezzo supera `MAX_RIGHE`, `troncato=true` (la UI mostra avviso "restringi i
   filtri", **nessun troncamento silenzioso**).

### UI — `components/modules/interventi/StoricoInterventiClient.tsx`

Componente client. Stato: `filtri` (q, data/dal/al, esecutore, comune,
committente, stato, esito), `righe`, `total`, `loading`, `error`, `troncato`,
`page`.

- **Barra di ricerca** in alto (input + lente). Invio o debounce (~400ms) →
  fetch con `q` (azzera l'effetto del filtro data lato server).
- **Pannello filtri**: `DatePicker` Dal/Al (riuso), select Esecutore (lista
  staff passata dalla pagina server), input/select Comune, select Committente,
  select Stato (unione stati interventi + stati manuali), select Esito; pulsanti
  **Applica** e **Pulisci**.
- **Tabella** a scorrimento orizzontale (`overflow-x-auto`) con le colonne sotto.
- **Loading**: spinner `animate-spin` + testo "Caricamento…" su ogni fetch
  (sia ricerca sia Applica filtri). Stati "Nessun risultato" ed errore (banner
  rosso). Badge avviso se `troncato`.
- **Paginazione**: "Pagina X di Y" o "Carica altri" con conteggio `total`.

Pagina server `app/hub/interventi/storico/page.tsx`: carica la lista staff per
il filtro Esecutore + il giorno odierno, rende `StoricoInterventiClient`.
Aggiunge link "Storico interventi" da `app/hub/interventi/page.tsx` e da
`app/hub/interventi/lista/page.tsx`.

### Colonne tabella

Data · Origine · Committente · ODL · PDR · Matricola · Nominativo · Indirizzo ·
Comune · CAP · Attività · Fascia oraria · Esecutore · Stato · Esito · Motivo.

## Test (vitest, mirati ai file nuovi)

- `interventoToRigaStorico` / `manualeToRigaStorico`: mappatura campi, estrazione
  JSONB (priorità dati_correnti), origine, stato/esito/motivo.
- Parsing/validazione filtri: default a oggi, `q` annulla la finestra data,
  range vs giorno singolo, valori invalidi.
- Logica "salta query manuali" quando `esito`/`stato` escludono i manuali.
- Ordinamento e calcolo `troncato`.

## Gestione errori / edge

- Errore di rete/DB → banner rosso, tabella vuota, niente crash.
- Date invalide → ignorate (fallback default).
- Nessun risultato → riga "Nessun intervento trovato".
- Risultati oltre `MAX_RIGHE` → `troncato=true` + avviso UI.
- `q` con spazi/maiuscole → trim + ilike case-insensitive.

## Decisioni aperte (da confermare in review)

- Inclusione manuali **in attesa/rifiutati/annullati**: SÌ (da indicazione
  utente "tutti gli interventi sia manuali che programmati"). Colonna Origine +
  Stato li distingue.
- `PAGE_SIZE`=100, `MAX_RIGHE`=5000: valori iniziali, regolabili.
