# Design — Data-model interventi Acea (riconsegna misuratori & premialità)

- **Data:** 2026-06-01
- **Stato:** in attesa di revisione utente · **nessun codice ancora** (spec)
- **Autore:** Edgardo Perrelli (con Claude)
- **Stack previsto:** Supabase (PostgreSQL + RLS) · TypeScript · zod · Vitest
- **Fonte contrattuale:** Acea ATO2 — DT "Gestione Utenze Idriche Morose e Rimozioni Allacci Abusivi" (Ott. 2024) + Disciplinare di gara 4293/MDM (Apr. 2025)
- **Collegato a:** [Coordinamento operatori & tracciatura interventi](2026-06-01-coordinamento-operatori-interventi-design.md) · [Connettore committenti](2026-06-01-connettore-committenti-automazione-design.md) · regola implementata in `lib/premialita/acea.ts`

---

## 1. Contesto

Estende lo store canonico `interventi` con i campi **reali** del contratto Acea (servizio **idrico**, utenze morose), e aggiunge due tabelle per i due pilastri richiesti: **riconsegna dei misuratori rimossi** e **premialità di fine contratto**. La regola di premialità è **già implementata e testata** in `lib/premialita/acea.ts` (Parte A); qui si definisce come alimentarla con dati reali.

L'app resta livello di **coordinamento**: l'esitazione tecnica e le foto restano sui sistemi Acea (tablet/SAP/Web Appalti); qui si traccia stato, riconsegna e KPI.

## 2. Tipi di intervento (voci 1–13)

Enum `intervento_tipo` dal listino contrattuale:

| Voce | Attività | Prezzo |
|---|---|---|
| 1 | Regolazione massiva tutela risorsa | fisso |
| 2 | Riattivazione utenza | fisso |
| 3 | Riattivazione urgente | fisso |
| 4 | Revoca distacco con riattivazione | fisso |
| 5 | Rimozione/sospensione elevata morosità | fisso |
| 6 | Rimozione allaccio abusivo | variabile |
| 8 | Sostituzione saracinesca | fisso |
| 9 | Sostituzione valvola | fisso |
| 10 | **Limitazione erogazione** (EL) | variabile |
| 11 | **Sospensione erogazione** (ES) | variabile |
| 12 | **Rimozione contatore** (ERC) | variabile |
| 13 | Lettura spazi confinati | variabile |

> EL/ES/ERC/ERA sono i 4 KPI di efficienza (ERA = Rimozione Abusi, voce 6).

## 3. Estensione tabella `interventi`

Campi aggiuntivi (oltre a quelli dello spec coordinamento):

```
committente        text   -- 'acea' | 'italgas' | 'altro'
odl                text   -- Ordinativo di Lavoro / ODS Acea
contratto          text   -- id contratto utenza (sulla targa al momento rimozione)
utenza             text   -- id utenza
matricola_contatore text  -- seriale misuratore (chiave centrale)
lettura            text   -- lettura misuratore
diametro           text   -- ½" … 3"
sigillo_numero     text
sigillo_colore     text   -- 'blu' (regolazione/riattivazione) | 'rosso' (sospensione/rimozione)
lat / lng          double precision  -- coordinate GPS WGS84
lotto              smallint           -- 1 | 2 | 3
comune             text
municipio          text
codice_servizio    text
intervento_tipo    text   -- enum voci 1–13 (vedi §2)
```

### Macchina a stati (allineata agli stati OdL Acea)
`da_assegnare → assegnato → in_viaggio → sul_posto → in_esecuzione → completato`
con esiti/causali KO:
- `eseguito_positivo` (esito a buon fine — entra nel numeratore KPI),
- `accesso_negato`, `contatore_non_trovato`, `dati_ubicazione_insufficienti`,
- `accesso_a_vuoto` (documentato con foto cassetta/citofono — **escluso** dal numeratore KPI),
- `rinviato`.

I timestamp (`assegnato_at`, `iniziato_at`, `chiuso_at`) restano come da spec coordinamento. Esitazione tecnica e foto **non** sono replicate qui (restano su Acea); si memorizza l'esito sintetico + eventuale `rif_esterno`.

## 4. Pilastro A — `misuratori_riconsegna`

Traccia la **riconsegna settimanale** dei contatori rimossi ai magazzini Acea (DT §1.5/§1.9).

```sql
create table public.misuratori_riconsegna (
  id              uuid primary key default gen_random_uuid(),
  intervento_id   uuid references public.interventi(id),  -- rimozione che ha generato il misuratore
  matricola       text not null,        -- seriale del misuratore rimosso
  contratto       text,                 -- targa identificativa
  utenza          text,
  odl             text,
  con_codoli      boolean default false,      -- codoli riconsegnati col contatore
  con_saracinesca boolean default false,      -- saracinesca/valvola riconsegnata
  batch_id        uuid,                 -- raggruppa la consegna settimanale (cesta)
  stato           text not null default 'in_custodia'
                  check (stato in ('in_custodia','in_riepilogo','consegnato','mancante')),
  data_rimozione  date,
  data_consegna   date,
  riepilogo_firmato boolean default false,    -- modulo "Riepilogo misuratori dismessi" firmato
  created_at      timestamptz not null default now()
);
create index misuratori_riconsegna_batch_idx on public.misuratori_riconsegna (batch_id);
create unique index misuratori_riconsegna_matricola_idx on public.misuratori_riconsegna (matricola, data_rimozione);
```

**Regole/alert in Dashboard:**
- **Penale €1.000** per ogni **mancata corrispondenza** elenco riversato ↔ consegnato → alert su `stato='mancante'` o su discrepanza batch.
- Smarrimento/danno = prezzo +20% +€100/pezzo → evidenziare i `mancante` non giustificati.
- Cadenza **settimanale** (nessuna scadenza per-singolo misuratore nel contratto): vista "cesta della settimana" con conteggio e stato firma `riepilogo_firmato`.
- Includere `con_codoli`/`con_saracinesca` perché il contratto richiede la riconsegna congiunta.

## 5. Pilastro B — `kpi_contratto` (premialità)

Alimenta il cruscotto `PremialitaPanel` (gated `admin_plus`) con i conteggi per finestra bimestrale.

```sql
create table public.kpi_contratto (
  id                  uuid primary key default gen_random_uuid(),
  committente         text not null default 'acea',
  lotto               smallint,
  periodo_inizio      date not null,     -- finestra di 2 mesi solari
  periodo_fine        date not null,
  kpi                 text not null check (kpi in ('EL','ES','ERC','ERA')),
  eseguiti_positivi   integer not null default 0,  -- al netto accessi a vuoto
  accessi_a_vuoto     integer not null default 0,
  assegnati_dovuti    integer not null default 0,
  efficienza_dichiarata numeric,         -- % dichiarata in gara per il KPI (65–85)
  created_at          timestamptz not null default now()
);
create unique index kpi_contratto_periodo_idx
  on public.kpi_contratto (committente, lotto, periodo_inizio, kpi);
```

**Calcolo (riuso `lib/premialita/acea.ts`):**
- `efficienza = eseguiti_positivi / assegnati_dovuti` (×100, arrotondata al primo decimale) — soglia minima **65%**.
- `variazionePrezzo` da **−35%** (a 65%) a **+30%** (≥85%) rispetto all'efficienza dichiarata.
- **Premio** se **ES ≥ 80%** (20% del prezzo sospensione sugli accessi a vuoto).
- Valutazione **ogni 2 mesi solari**; segnalare il rischio risoluzione se efficienza < 65% per 3 mesi continuativi.

I conteggi `eseguiti_positivi`/`accessi_a_vuoto`/`assegnati_dovuti` derivano da `interventi` (per `intervento_tipo`→KPI, `data` nella finestra, esito). Una vista/funzione aggrega gli interventi nei contatori `kpi_contratto`, poi `valutaKpi()` produce il cruscotto.

## 6. Vincoli abilitanti (alimentano A e B)

- **Assenze operatori** (`staff_assenze`): blocco/avviso in assegnazione.
- **Abilitazioni** (es. spazi confinati DPR 177/11 per voce 13): matrice competenze usata in assegnazione.
- **Squadre** + capacità giornaliera per lotto (target produttività DT §6, es. Lotto 1: 62 limitazioni / 26 sospensioni / 9 rimozioni contatori al giorno) → bilanciamento e heatmap.

## 7. Sicurezza

- RLS su `interventi`, `misuratori_riconsegna`, `kpi_contratto` con policy per ruolo (coerenti con le altre tabelle).
- Il cruscotto premialità è **riservato `admin_plus`** (già gated server-side in `app/hub/page.tsx`).
- L'operatore aggiorna gli esiti via token (`/r/[token]`), mai accesso diretto alle tabelle.

## 8. Fuori scope / aperti

- Foto/evidenze tecniche e loro naming (restano su Acea): non replicate qui.
- Scadenza per-singolo misuratore: **non prevista** dal contratto (solo cadenza settimanale).
- Mapping esatto `intervento_tipo` ↔ campi dell'Excel committente: dipende dal tracciato reale (vedi connettore + Allegato 1/2).
- Valori `efficienza_dichiarata` per KPI: da inserire dai dati di gara dell'appaltatore.
