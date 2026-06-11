# Cronoprogramma ↔ Mappa: Disponibilità operatori (assenze a fascia oraria)

**Data:** 2026-06-11
**Stato:** Spec approvata in brainstorming, da rivedere prima del piano

## Problema

Oggi i due moduli non sono collegati:

- **Cronoprogramma** (`app/dashboard/page.tsx` → `CronoprogrammaWorkspace`) modella ferie e 104 come semplici **attività** (`activities_renamed`) dentro la tabella `assignments`. Non c'è dimensione oraria: una persona segnata "Ferie" sembra assente tutto il giorno anche se ha solo un permesso fino alle 13 → **trae in inganno**.
- **Mappa Operatori** (`app/hub/mappa/page.tsx` → `MappaOperatoriClient`) carica `staff` e legge `assignments` **solo** per il flag `reperibile`. Non guarda ferie/104 → si può assegnare lavoro a chi è in ferie. **Nessun collegamento reale.**

## Obiettivo

1. **Collegamento stabile**: una **fonte unica di verità** sulla disponibilità che il cronoprogramma scrive e la Mappa legge. Se una persona è assente (intera giornata) in una data, nella Mappa non può ricevere assegnazioni in quella data.
2. **Stati con orario**: introdurre disponibilità parziale a **fascia oraria precisa** (es. "104 fino alle 13:00", "disponibile dalle 14:00") al posto del solo Ferie/104 tutto-o-niente.

## Decisioni prese (brainstorming)

- **Architettura A**: tabella dedicata `disponibilita_operatore` come fonte unica di verità (non si estende `assignments`).
- **Granularità**: fascia oraria precisa (`ora_da`/`ora_a`).
- **Blocco Mappa**: **netto** per assenza a giornata intera (non selezionabile); **parziale** selezionabile con avviso + limite orario.
- **Tipi**: `ferie`, `104`, `permesso`, `malattia`.
- **Migrazione**: i ferie/104 storici (attività in `assignments`) vengono convertiti nella nuova tabella e le vecchie card-attività rimosse, per evitare doppioni.
- **Conflitto retroattivo**: se un operatore già nel piano Mappa diventa assente-intero per quella data, la Mappa **lo segnala** (badge rosso + banner) senza rimuoverlo in automatico.
- **Indipendenza dal territorio**: un'assenza è uno **stato della persona**, NON un lavoro su una zona. La tabella `disponibilita_operatore` **non ha `territory_id`**; il dialog non chiede il territorio; nel calendario la card assenza è renderizzata a livello di **giorno**, non dentro una colonna territorio. (Nelle future viste grid/split le assenze andranno in una fascia/area "del giorno", mai forzate sotto un territorio.)

---

## Modello dati

### Nuova tabella `disponibilita_operatore`

Una riga = una assenza/disponibilità ridotta di un operatore in un giorno. **Una sola riga per (operatore, giorno)** → il dialog fa upsert.

```sql
CREATE TABLE IF NOT EXISTS disponibilita_operatore (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id    text NOT NULL,                 -- convenzione progetto (no FK su schema base)
  data        date NOT NULL,
  tipo        text NOT NULL                  -- 'ferie' | '104' | 'permesso' | 'malattia'
              CHECK (tipo IN ('ferie','104','permesso','malattia')),
  modalita    text NOT NULL DEFAULT 'intera' -- 'intera' | 'parziale'
              CHECK (modalita IN ('intera','parziale')),
  ora_da      time NULL,                     -- inizio finestra DISPONIBILITÀ (null = da inizio giornata)
  ora_a       time NULL,                     -- fine finestra DISPONIBILITÀ   (null = fino a fine giornata)
  note        text NULL,
  created_by  uuid NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (staff_id, data)
);

CREATE INDEX IF NOT EXISTS idx_disponibilita_operatore_data
  ON disponibilita_operatore (data);
CREATE INDEX IF NOT EXISTS idx_disponibilita_operatore_staff_data
  ON disponibilita_operatore (staff_id, data);

ALTER TABLE disponibilita_operatore ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_policy" ON disponibilita_operatore
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

**Semantica di `ora_da`/`ora_a`** = finestra in cui l'operatore **È disponibile** (così "fino alle"/"dalle" non sono ambigui):

| Scelta nel dialog | modalita | ora_da | ora_a | Effetto Mappa |
|---|---|---|---|---|
| Tutto il giorno | `intera` | NULL | NULL | 🔒 bloccato (non selezionabile) |
| Disponibile **fino alle** 13:00 | `parziale` | NULL | 13:00 | ✅ + badge "fino alle 13:00" |
| Disponibile **dalle** 14:00 | `parziale` | 14:00 | NULL | ✅ + badge "dalle 14:00" |
| Finestra 09:00–13:00 | `parziale` | 09:00 | 13:00 | ✅ + badge "09:00–13:00" |

Regola di derivazione: `modalita = 'intera'` ⇔ `ora_da IS NULL AND ora_a IS NULL`. La `modalita` è ridondante ma comoda per query/leggibilità; viene impostata coerentemente dall'API in base agli orari.

### Tipi e colori (UI)

| tipo | etichetta | token colore (tema) |
|---|---|---|
| `ferie` | Ferie | `--info` / blu |
| `104` | 104 | `--brand-accent` / viola |
| `permesso` | Permesso | `--warning` / ambra |
| `malattia` | Malattia | `--danger` / rosso |

(Colori indicativi: usare i token tema esistenti, niente colori hard-coded.)

---

## Architettura componenti / flusso dati

```
                       disponibilita_operatore  (fonte unica di verità)
                          ▲ scrive                    │ legge
                          │                           ▼
   Cronoprogramma  ──────────────  /api/disponibilita  ──────────────  Mappa
   (dialog + card nel calendario)   GET ?from&to | ?data               (blocco/segnalazione)
                                    POST (upsert) | DELETE
```

### Nuova API `app/api/disponibilita/route.ts`

Pattern identico alle route esistenti (`app/api/mappa/distribuzioni/route.ts`): client `supabaseAdmin` con service-role.

- **GET** `?from=YYYY-MM-DD&to=YYYY-MM-DD` → righe nel range (per il cronoprogramma).
  GET `?data=YYYY-MM-DD` → righe del singolo giorno (per la Mappa).
- **POST** body `{ staff_id, data, tipo, ora_da|null, ora_a|null, note|null }` → **upsert** su `(staff_id, data)`; l'API calcola `modalita` (`intera` se entrambi gli orari null, altrimenti `parziale`) e `updated_at`. Validazione: `tipo` ammesso; se `ora_da` e `ora_a` entrambi valorizzati → `ora_da < ora_a`.
- **DELETE** `?id=` (o body `{ id }`) → elimina la riga.

Tipo TS condiviso in `types.ts`:
```ts
export type Disponibilita = {
  id: string;
  staff_id: string;
  data: string;          // YYYY-MM-DD
  tipo: 'ferie' | '104' | 'permesso' | 'malattia';
  modalita: 'intera' | 'parziale';
  ora_da: string | null; // 'HH:MM'
  ora_a: string | null;  // 'HH:MM'
  note: string | null;
};
```

### Helper puro `lib/disponibilita.ts` (con test)

Logica condivisa fra cronoprogramma e Mappa, **pura e testabile**:

```ts
// true se l'operatore è bloccato per quel giorno (assenza intera)
export function isAssenzaIntera(d: Disponibilita): boolean
// etichetta breve per badge/card, es. "104 · fino alle 13:00", "Ferie · tutto il giorno"
export function labelDisponibilita(d: Disponibilita): string
// deriva modalita dagli orari (usata anche dall'API)
export function derivaModalita(ora_da: string|null, ora_a: string|null): 'intera'|'parziale'
// indicizza una lista per staff_id|data per lookup O(1)
export function indexByStaffData(rows: Disponibilita[]): Record<string, Disponibilita>
```

Test in `lib/disponibilita.test.ts` (vitest) sui quattro casi della tabella semantica + edge (orari uguali, solo `ora_da`, solo `ora_a`).

---

## Cronoprogramma (scrittura)

- **Pulsante "Assenza / Disponibilità"** nella toolbar (`CronoToolbar`), accanto a "Inserisci reperibile".
- **Nuovo dialog `AssenzaDialog`** (stile coerente con `NewAssignmentDialog`/`EditAssignmentDialog`), campi:
  - Operatore (select su `staff` validi nel giorno).
  - Data (riusa `components/ui/DatePicker.tsx`; preimpostata se aperto da una cella giorno).
  - Tipo (Ferie / 104 / Permesso / Malattia).
  - Modalità: radio "Tutto il giorno" | "Disponibile fino alle…" | "Disponibile dalle…" | "Finestra…" → mostra i campi orario pertinenti.
  - Note (opzionale).
  - **Nessun campo territorio** (l'assenza è indipendente dalla zona).
  - Salva → `POST /api/disponibilita` (upsert); Elimina → `DELETE`.
- **Rendering nel calendario** (`CronoCalendarView` / `DayCell`): le righe `disponibilita_operatore` del range vengono caricate in `CronoprogrammaWorkspace` (nuovo `useEffect` su `range`, come già per `taskCountMap`) e disegnate come **card colorata per tipo** nella cella del giorno, con etichetta `labelDisponibilita`. Click sulla card → riapre `AssenzaDialog` in modifica.
- **Fuori scope v1**: rendering delle assenze nelle viste `grid` / `split` / `table` (follow-up). La vista `calendar` è la default e copre il caso d'uso.

## Mappa (lettura + blocco)

- In `MappaOperatoriClient`, nuovo fetch `GET /api/disponibilita?data=${planningDate}` quando `planningDate` cambia (stesso pattern di appuntamenti/interventi). Risultato indicizzato con `indexByStaffData`.
- **Lista operatori selezionabili**:
  - assenza **intera** per `planningDate` → riga **disabilitata** (grigia + lucchetto), tooltip "In {tipo} · {data}". `toggleOperator` fa early-return con messaggio se si tenta di selezionarla.
  - **parziale** → selezionabile, con **chip orario** (`labelDisponibilita`) sulla card.
- **Conflitto retroattivo**: alla costruzione del piano (da `initialDistribution` e ad ogni ricarica), per ogni operatore già selezionato che risulta **assente-intero** in quella data → **bordo/badge rosso "ora in {tipo}"** sulla card operatore + **banner** in cima "⚠ N operatori ora risultano assenti: rivedi". Nessuna rimozione automatica.
- I dati `reperibile` esistenti restano invariati e indipendenti (reperibilità ≠ assenza).

---

## Migrazione dati storici

SQL **una tantum** (consegnata all'utente da lanciare; il Supabase MCP non punta al DB prod). Da verificare prima i **nomi reali** delle attività ferie/104/permesso/malattia in `activities_renamed`.

Logica:
1. Per ogni `assignments` a la cui `activity_id` corrisponde a un'attività di assenza (match per nome, case-insensitive), inserire in `disponibilita_operatore` `(staff_id, data = calendar_days.day, tipo dedotto dal nome, modalita='intera', ora_da=NULL, ora_a=NULL)`, con `ON CONFLICT (staff_id, data) DO NOTHING`.
2. Eliminare quelle `assignments` migrate (evita doppioni nel calendario, ora alimentato dalla nuova tabella).

Mappatura nome→tipo (da confermare sui dati reali): contiene "ferie"→`ferie`; contiene "104"→`104`; "permesso"/"uscita"→`permesso`; "malattia"→`malattia`.

---

## Error handling

- API: 400 su `tipo` non valido o `ora_da >= ora_a`; 500 con log su errori DB (come le route esistenti). Le scritture dal dialog mostrano feedback in UI (riusa il pattern `actionFeedback`).
- Mappa: se il fetch disponibilità fallisce, non bloccare la pianificazione → log + nessun blocco (fail-open con avviso discreto), così un disservizio non impedisce di lavorare.
- Upsert idempotente: ri-salvare la stessa assenza non crea doppioni grazie a `UNIQUE(staff_id, data)`.

## Testing

- `lib/disponibilita.test.ts` (vitest): casi semantica orari + edge.
- Route `/api/disponibilita`: smoke manuale (GET range, GET data, POST upsert, DELETE).
- E2e leggero (manuale o Playwright): metti un'assenza intera nel cronoprogramma → in Mappa l'operatore è bloccato per quella data; metti una parziale → selezionabile con chip; assegna poi metti in ferie → banner conflitto alla riapertura del piano.

## Out of scope (follow-up)

- Assenze nelle viste cronoprogramma `grid`/`split`/`table`.
- Filtro automatico dei task per fascia oraria nella distribuzione (oggi solo avviso/limite visivo).
- Più assenze nello stesso giorno per lo stesso operatore (oggi: una per giorno, upsert).
- Riepilogo/ KPI assenze.

## File toccati (sintesi)

- **Nuovi**: `supabase/migrations/<ts>_disponibilita_operatore.sql`, `app/api/disponibilita/route.ts`, `lib/disponibilita.ts`, `lib/disponibilita.test.ts`, `components/AssenzaDialog.tsx` (o sotto `components/modules/cronoprogramma-personale/`).
- **Modificati**: `types.ts`, `CronoprogrammaWorkspace.tsx`, `CronoToolbar.tsx`, `CronoCalendarView.tsx`, `MappaOperatoriClient.tsx`, `app/hub/mappa/page.tsx` (se serve passare dati lato server).
- **Consegna a parte**: script SQL di migrazione storica.
