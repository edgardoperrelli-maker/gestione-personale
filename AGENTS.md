# AGENTS.md — gestione-personale (Plenzich S.p.A.)

## 1. PROGETTO

Sistema di gestione del personale operativo per Plenzich S.p.A.
Sviluppato con GestiLab. Non modificare mai logica di business esistente senza istruzione esplicita.

---

## 2. STACK TECNICO

| Layer | Tecnologia | Note |
|---|---|---|
| Framework | Next.js 15 (App Router) | `--turbopack` in dev |
| Language | TypeScript 5 strict | `noEmit`, niente `any` |
| Styling | Tailwind CSS 4 | Solo utility classes + CSS variables |
| State | Stato locale nei componenti | (jotai installato ma non in uso) |
| Database | Supabase (PostgreSQL) | RLS abilitato |
| Auth | @supabase/auth-helpers-nextjs | Vedi sezione 5 |
| Maps | MapLibre GL (wrapper "mapcn" in `components/ui/map.tsx`) | Leaflet rimosso — vedi sezione 7 |
| Excel | xlsx + exceljs | Entrambi installati |
| PDF | jspdf + jspdf-autotable | |
| Deploy | Vercel | `vercel.json` presente |

---

## 3. STRUTTURA CARTELLE

```
app/
  (auth)/login/          → pagine autenticazione
  hub/                   → moduli principali (richiede auth)
    mappa/               → Mappa Operatori
    rapportini/          → Rapportini
    hotel-calendar/      → Calendario Hotel
  dashboard/             → Cronoprogramma (admin)
  impostazioni/          → Utenze (admin only)
  api/                   → Route handlers server-side

components/
  modules/[modulo]/      → Componenti specifici per modulo
  layout/AppShell.tsx    → Shell navigazione globale
  Button.tsx             → Componenti UI riutilizzabili
  Card.tsx
  Badge.tsx
  Input.tsx
  Tabs.tsx

lib/
  supabaseBrowser.ts     → Client per Client Components
  supabaseAdmin.ts       → Client service-role (server only)
  moduleAccess.ts        → Ruoli e permessi moduli
  territoryColors.ts     → Colori territori su mappa
  utils.ts               → Utility generali
  date.ts                → Utility date
  rls.ts                 → Helper RLS

utils/
  date-it.ts             → Formattazione date italiana

types.ts                 → Tipi globali (Staff, Activity, Territory, Assignment)
constants/
  cost-centers.ts        → Enum centri di costo
```

---

## 4. CONVENZIONI TYPESCRIPT

```typescript
// ✅ CORRETTO
'use client'; // sempre prima riga nei Client Components

// Tipi espliciti, mai `any`
type Props = { rows: MappaStaffRow[]; dateFrom: string }

// Interfacce nel file types.ts se condivise tra moduli
// Interfacce locali nel file del componente se usate solo lì

// Path alias
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import type { Staff } from '@/types';

// ❌ VIETATO
const foo: any = ...
import something from '../../../lib/utils'
```

---

## 5. PATTERN SUPABASE

### Client Component (browser)
```typescript
'use client';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

const supabase = supabaseBrowser();
const { data, error } = await supabase.from('table').select('*');
```

### Server Component / Route Handler
```typescript
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

const cookieStore = await cookies();
const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
const supabase = createServerComponentClient({ cookies: cookieMethods });
```

### Admin (service role — solo server)
```typescript
import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
// Usa SOLO in API routes che richiedono bypass RLS
```

### Relazioni Supabase (array vs oggetto)
Supabase può restituire relazioni come array. Usare sempre `firstRelation()`:
```typescript
function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
```

---

## 6. DESIGN SYSTEM

**Fonte canonica: [`DESIGN.md`](DESIGN.md)** (sistema "sobrio enterprise → premium", 2026-07). L'era "Aurea neon" (ciano/glow/gradienti) è stata abbandonata a giugno 2026: niente glow, niente accenti neon, niente colori hardcoded.

Punti chiave (dettagli e token completi in DESIGN.md e `app/globals.css`):

- **Light-first**, un solo accento blu (OKLCH hue 255). Dark = *assenza* della classe `.light` su `<html>` (non esiste `.dark`).
- **Ogni colore via `var(--token)`** (o utility `@theme`). Mai hex/oklch nel markup; `--on-primary` per il testo su fill accentati; `--status-*` per gli stati; `--terr-*` per i territori; `--chart-1..8` per i grafici.
- **Font**: Geist (`--font-geist`) per UI; **Geist Mono** (`--font-mono`) con `font-mono tabular-nums` per dati numerici (KPI, importi, matricole).
- **Elevazione a 3 livelli**: bordo 1px + `--shadow-sm` (superfici), `--shadow-md` (popover), `--shadow-lg` + `--overlay` (modali). Raggi via `--radius-sm/md/lg/xl`.
- **Primitivi obbligatori** (`components/`, `components/ui/`): Button (con `loading`), Card, Badge, Input/Select/Textarea (`error`, `disabled`), Tabs (solo filtri di dato), Dialog (`busy`, animato), **ConfirmDialog** e **Toast** (`toast.*`) al posto di `confirm()`/`alert()` nativi (vietati), Skeleton, FogliettaCard + Breadcrumb (pattern viste di modulo, DESIGN.md §7bis), DatePicker, MultiSelect.
- **Motion**: preset in `lib/animations.ts`, 150–200ms, `prefers-reduced-motion` garantito da `MotionProvider` nel root layout.

---

## 7. PATTERN MAPPA (MapLibre GL / "mapcn")

Leaflet è stato **rimosso** (migrazione 2026-07, vedi `docs/mapcn-fattibilita.md`). Le mappe usano **maplibre-gl** tramite il wrapper `components/ui/map.tsx` (`Map`, `MapMarker`, `MapPopup`, `MapRoute`, `MapControls`, …), theme-aware: basemap CARTO positron (light) / dark-matter (dark), tema rilevato via `hooks/useAppTheme.ts`.

Regole colori sulle mappe:
- **Marker = nodi DOM** (portali React): accettano direttamente `var(--token)` e `color-mix(...)` — usarli.
- **Paint WebGL** (polyline/fill di MapLibre) **non risolve `var()`**: risolvere prima con `getComputedStyle` (vedi `resolveCssColor()` in `components/modules/mappa/PlanningMap.tsx`).
- Colori territorio: sempre `lib/territoryColors.ts` → token `--terr-*` (cambiano col tema senza re-render).

---

## 8. RUOLI E PERMESSI

```typescript
type ValidRole = 'admin' | 'operatore';
// AssignableRole aggiunge 'admin_plus' (super-admin: premialità, utenze).

// La lista completa dei moduli (14+: dashboard, mappa, appuntamenti,
// hotel-calendar, interventi, consuntivazione, live, lista-attesa,
// misuratori, acqualatina, performance, impostazioni, …) vive in
// APP_MODULES (lib/moduleAccess.ts) — quella è la fonte di verità, con i
// gruppi sidebar (Pianificazione · Operatività · Analisi · Sistema).
type AppModuleKey = (typeof APP_MODULES)[number]['key'];
```

- `admin` → accesso completo incluso `/impostazioni`
- `operatore` → accesso ai moduli assegnati in `allowedModules` (app_metadata)
- Controllo via `middleware.ts` + `canAccessPath()`
- **Aggiungere un nuovo modulo**: registrarlo in `APP_MODULES` in `lib/moduleAccess.ts`

---

## 9. API ROUTES

```typescript
// app/api/[modulo]/[azione]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin'; // se serve bypass RLS
// oppure createServerComponentClient per rispettare RLS

export async function POST(req: NextRequest) {
  const body = await req.json();
  // validazione con zod se input complesso
  const { data, error } = await supabaseAdmin.from('table').insert(body);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
```

---

## 10. TIPI GLOBALI (types.ts)

```typescript
export type Staff      = { id: string; display_name: string; active?: boolean };
export type Activity   = { id: string; name: string; active?: boolean };
export type Territory  = { id: string; name: string; active?: boolean };
export type Assignment = {
  id: string; day_id: string;
  staff?: { id: string; display_name: string } | null;
  activity?: { id: string; name: string } | null;
  territory?: { id: string; name: string } | null;
  cost_center?: CostCenter | null;
  reperibile: boolean;
  notes?: string | null;
};
```

---

## 11. REGOLE GENERALI

1. **Mai modificare** `middleware.ts`, `lib/moduleAccess.ts`, `lib/supabaseAdmin.ts` senza istruzione esplicita.
2. **Ogni nuovo modulo** va registrato in `APP_MODULES` e aggiunto alla navigazione in `lib/appNavigation.ts`.
3. **Nessuna libreria esterna** da installare senza approvazione esplicita.
4. **Strict TypeScript**: zero `any`, zero `@ts-ignore`.
5. **Nessun `console.log`** in produzione — usare solo durante debug con commento `// DEBUG`.
6. **Formati date**: sempre `YYYY-MM-DD` per Supabase, `dd/MM/yyyy` per display IT.
7. **CSS**: usare sempre CSS variables del brand, **mai** colori hardcoded (tolleranza zero, come DESIGN.md §9); i nuovi token sono additivi e vanno definiti in entrambi i temi.
8. **Componenti UI**: usare i primitivi esistenti (Button, Card, Badge, Input, Select, Textarea, Tabs, Dialog, ConfirmDialog, Toast, Skeleton, FogliettaCard, Breadcrumb) prima di crearne di nuovi. **Vietati `alert()`/`confirm()` nativi**: usare `toast.*` e ConfirmDialog.
9. **Mappe**: usare il wrapper `components/ui/map.tsx` (MapLibre); mai `var()` nel paint WebGL (vedi sezione 7).
10. **Excel parsing**: usare `xlsx` per lettura semplice, `exceljs` per formattazione avanzata.

---

## 12. MODULO OTTIMIZZAZIONE PERCORSI (IMPLEMENTATO)

> Nota 2026-07: il modulo è stato realizzato — la logica vive in `utils/routing/`
> e la UI nel workspace mappa (`components/modules/mappa/`). La sezione resta
> come riferimento storico della struttura.

**Posizione nel progetto:**
```
utils/routing/
  types.ts
  distance.ts
  geocoding.ts
  optimizer.ts
  index.ts

components/modules/mappa/
  PianificazionePercorsiClient.tsx   ← nuovo componente UI

app/hub/mappa/
  page.tsx                           ← esistente (mappa operatori)
  pianificazione/
    page.tsx                         ← nuova pagina
```

**Nuovo modulo da registrare:**
Non richiede nuovo AppModuleKey — è una sotto-sezione di `mappa`.
Aggiungere link interno nella UI di `/hub/mappa`.

**Dipendenze già disponibili:** maplibre-gl (via `components/ui/map.tsx`), xlsx, exceljs — nessuna installazione necessaria.

---

## 13. MODULO MISURATORI RIMOSSI — REGOLE DI BUSINESS

Registro dei misuratori scaricati a magazzino dopo una rimozione ACEA positiva
(tabella `misuratori_rimossi`, UI in `/misuratori`). Popolato da due writer, entrambi
gate-ati dallo stesso classificatore:

- **all'invio rapportino** → `app/api/r/[token]/invia/route.ts`
- **"Ricalcola" (fallback/manuale)** → `app/api/misuratori/sync/route.ts`

### Cosa entra nel registro
Solo interventi ACEA con `esito = 'eseguito_positivo'`, `matricola` presente e
`intervento_tipo` classificato come rimozione da `isRimozioneTipo`
(`lib/interventi/rimozioneMisuratore.ts`).

### L'attività dell'ordine la dichiara ACEA (regola chiave)
`intervento_tipo` **decide un magazzino**, quindi non può restare la fotografia del testo che
l'attività aveva sulla mappa il giorno della pianificazione — l'ODL cambia (il moroso paga, ACEA
lo riapre e la rimozione misuratore diventa riattivazione fornitura) e la rigenerazione del piano
**non riallinea gli interventi in stato terminale** (`planInterventiForPiano`: li preserva e ne
occupa la chiave). L'import del Cruscotto lo riporta all'attività corrente
(`lib/acea/attivitaDaImport.ts`, passo 5-quater di `app/api/acea/import`) e poi **ricalcola il
registro**, perché il registro è derivato. Tre cancelli, tutti "non indovinare": ODL con
operazioni discordi fermi, attività fuori tassonomia mai scritta, **`lim_massive` escluso** (è un
canale con canonica propria — vedi §14 e migration 20260722140000). Recupero del pregresso:
migration `20260804090000` (93 interventi, 5 righe di registro uscite).

### Esclusione rimozioni ABUSIVE (regola chiave)
Le "Rimozione impianto/allaccio/contatore abusivo" **non entrano MAI** nel registro:
il misuratore rimosso da un impianto abusivo non entra nei nostri magazzini.
`isRimozioneTipo` restituisce `false` per qualsiasi `intervento_tipo` contenente
`abusiv`, **anche se nel campo note è presente una matricola** (in quel caso la
matricola è un errore). Coerente con la spec del registro e con `voceDaAttivita.ts`
("ABUSIVO prima di tutto").

### "Ricalcola" ripulisce anche le righe già entrate
Il sync elimina dal registro **qualsiasi riga il cui intervento non qualifica più**
(riclassificato abusivo, corretto da positivo a negativo, o eliminato), **a prescindere
dallo stato logistico** — anche `scaricato/verificato/consegnato`, non solo
`da_consegnare_deposito`. Decisione pura e testata in
`lib/interventi/misuratoriDaRimuovere.ts` (`righeMisuratoriDaRimuovere`), con guardrail:
se l'insieme qualificante è vuoto non cancella nulla (anti-svuotamento di massa).
Nota: la cascata `ON DELETE CASCADE` copre solo l'**eliminazione** dell'intervento,
non la correzione dell'esito → per quest'ultima serve il Ricalcola.

### AcquaLatina: registro gemello, e l'invariante cesta↔stato
La commessa `acqualatina` ha il **suo** registro (`acqualatina_misuratori_rimossi`), stessi stati
e stesso motore di ricalcolo (`lib/misuratori/sincronizzaRegistro.ts`), senza PDR e **senza gate
sul tipo** (una sola attività, già una sostituzione).

Il riferimento di magazzino è **UNO** e si chiama **`cesta`**: il contenitore numerato con cui la
riconsegna al committente viaggia, su **entrambi** i registri. Per qualche giorno ne sono esistiti
due — `cesta` e `pallet`, come due gradini di un ciclo che il magazzino non fa — fusi il 2026-08-04
(migration `20260804090000`: su ACEA `pallet` **rinominato** in `cesta`, su AcquaLatina eliminato
perché mai usato). A differenziare le due commesse resta **chi scrive il numero, e cosa significa**:
- su **ACEA** lo scrive l'**ufficio**, in blocco dalla barra della selezione o in cella. È un
  riferimento e basta: **non tocca mai lo stato**.
- su **AcquaLatina** vale l'**invariante cesta↔stato**, ed è l'unica delle due commesse ad averlo.

#### L'invariante (solo AcquaLatina)
> **`cesta` valorizzata ⟹ lo stato è almeno `scaricato_deposito`.**

Mai il contrario: righe `scaricato_deposito` **senza** cesta restano legittime (è il pregresso, e
oltre lo scarico togliere il numero non riporta indietro niente). Un numero di cesta è la prova che
quel contatore è in deposito — la cesta sta in magazzino.

Logica pura in `lib/misuratori/cestaStato.ts` (`statoDopoCesta`), applicata da quattro scrittori:
- l'**operatore**, all'invio del rapportino (`/api/r/[token]/scarico-misuratori`): scrive `cesta` e
  `stato` in una sola UPDATE — è da qui che l'invariante è nato;
- l'**ufficio in cella** (`aggiornaRegistro`): **la crea**, non solo la corregge. Su una riga
  `da_consegnare_deposito` dichiara con essa lo scarico avvenuto; svuotarla su `scaricato_deposito`
  riporta lo stato indietro, e la riga rientra nella modale dell'operatore;
- l'**ufficio in blocco** (`assegnaCesta`, `POST .../misuratori/cesta`): stesso significato, ma la
  barra **dichiara prima** quante righe cambieranno stato — una selezione può contenere righe che
  nessuno ha guardato;
- la **regressione esplicita** dello stato a `da_consegnare_deposito` (tendina, solo `admin_plus`)
  azzera la cesta: il numero rimasto sarebbe un riferimento falso in magazzino.

⚠️ Ogni ramo che applica l'invariante è gated su `tabella === 'acqualatina_misuratori_rimossi'`.
Prima del 2026-08-04 il discriminante era «ACEA non ha la colonna» e bastava il 400: con la colonna
su entrambi i registri quella difesa è caduta, e il gate va scritto a mano.

Filtri puri condivisi in `lib/misuratori/riferimenti.ts`. La colonna viaggia fra le **opzionali**
di `selectDegradante`: mai nella select principale, o un deploy prima della migration spegne il
registro intero.

### AcquaLatina: la scheda segue l'ESITO del rapportino
La vista `AcquaLatina › Pianificazione` mostra la colonna **Esito** — la risposta `eseguito` della
voce — e non lo stato derivato: quello diceva «Aperta» su quasi tutte le righe, e chi cercava com'era
finita un'uscita non la trovava lì. La scheda la segue:

| Esito | Stato scritto | Scheda |
|---|---|---|
| `SI` | `Chiusa — eseguita` | Chiusi |
| `NO` | `Chiusa — non eseguita` | Chiusi |
| `NESSUN PASSAGGIO` | `Aperta — non eseguita` | Da lavorare |

⚠️ **`NO` ≠ `NESSUN PASSAGGIO`, e la differenza È la regola.** Su questa commessa il NO è
definitivo (contatore non più presente, impianto dismesso, rifiuto); il «nessun passaggio» è un giro
che non c'è stato, e il contatore è ancora lì. Chiudere anche quest'ultimo è l'errore del 03/08 —
12 righe di lavoro vero dichiarate concluse e non più riassegnabili.

La distinzione **non è in `interventi.esito`**, che conosce solo il positivo: la riconciliazione
legge `rapportino_voci.risposte.eseguito` (best-effort — se la lettura salta si torna a chiudere sul
solo positivo). Il `NO` chiude solo dalle uscite del **`NO_CHIUDE_DAL`** in poi, barriera che
protegge le righe esitate prima che la regola esistesse.

⚠️ La guardia della `update` è **solo** «non contraddire il positivo». Quella vecchia riapriva le
righe `esito_positivo=false AND aperto=false`: con la regola nuova è la combinazione di una riga
chiusa dal NO, e la riaprirebbe a ogni giro.

### ODL TOP (registro ordini ACEA)
ACEA segnala certe attività come **TOP**. Il flag è `acea_ordini.top` (booleano): lo marca
l'ufficio **in blocco** dalla selezione della tabella (`POST /api/acea/ordini/top`,
`requireAdmin`, tracciato in `audit_azioni` come `ordine.top`). Nessuna cella cliccabile: un
secondo modo di scrivere lo stesso campo si paga in codice e diverge alla prima modifica.

⚠️ La colonna esiste su **entrambe** le tabelle del registro (`acea_ordini` e
`acqualatina_ordini`): `app/api/acea/ordini/route.ts` le legge con **una sola** lista di colonne,
e metterla solo su una spegne l'altra.

`top` sta nella **select principale**, non fra le opzionali di `selectDegradante` come la `cesta`
qui sopra — e non è una svista. La degradazione serve a sopravvivere a un deploy che precede la
migration; qui l'ordine è invertito apposta, perché la migration è **additiva** e quindi si applica
PRIMA senza rompere il codice vecchio, che semplicemente non la nomina. La regola vera è quella:
**additiva → prima la migration; distruttiva → prima il deploy** (vedi la fusione cesta/pallet del
04/08, dove l'ordine sbagliato ha svuotato per un'ora la colonna Cesta in produzione).

L'operatore lo legge **live**: `app/r/[token]/page.tsx` risolve gli ODL delle sue voci contro il
registro a ogni caricamento, così un ordine marcato a giro già partito si vede subito. Non è
fotografato in `raw_json` come la nota dell'ufficio, proprio per questo. Lettura best-effort:
se salta, niente badge e il rapportino resta compilabile.

Resa: **badge testuale + ambra**, mai rosso — nel dunning il rosso è già revoca da verificare e
scadenza superata, e il colore da solo non è un'informazione per chi non lo vede. Le voci TOP
vanno **in cima** alla lista dell'operatore, con ordinamento **stabile** (dentro il gruppo resta
l'ordine geografico del giro) e `index` invariato, perché si riordina la lista e non i dati.
Regola per gli ODL multi-operazione: **almeno una riga TOP ⇒ voce TOP**.

Helper puri in `lib/acea/top.ts`. Spec:
`docs/superpowers/specs/2026-08-04-acea-odl-top-design.md`.

---

## 14. LIMITAZIONI MASSIVE MULTI-COMUNE + PRODUZIONE ECONOMICA — REGOLE

Le "limitazioni massive" sono un programma ACEA **per comune**. Regola cardine (data-driven,
**mai hardcodare un comune**). Oggi i comuni attivi sono **Labico** e **Zagarolo**.

### Il comune viene dal REGISTRO
I comuni massive = i comuni con almeno un ordine `famiglia = 'massive'` in `acea_ordini`. Fonte
unica: `comuniMassiveDaRegistro()` (`lib/acea/comuniMassive.ts`) e, lato Produzione economica,
`caricaComuniMassive()` (`lib/produzione/comuniMassive.ts`). **Aggiungere un comune = importarne
gli ordini dal modulo ACEA**, nessuna modifica al codice.
Fino al 04/08/2026 la fonte erano i file master scansionati dall'agente Playwright; è sparita col
ritiro dell'agente.

### Classificazione in Produzione economica (`lib/produzione/attivitaCanonica.ts`)
- La riclassificazione committente (gas `acea`→`italgas`, massive→`acea`) vive **QUI**, non nel DB.
- Firma: `attivitaCanonica(committente, testo, comune, alias, massiveComuni)`. Una riga `acea`
  **senza testo attività** è massiva **solo se** `comune ∈ massiveComuni`; altrove (es. Umbria)
  → `italgas`, non valorizzata. **NON re-hardcodare `=== 'ZAGAROLO'`.**
- `lib/produzione/load.ts` e `loadCandele.ts` caricano `caricaComuniMassive()` e lo passano a
  OGNI chiamata di `attivitaCanonica`.
- Conteggio massive = **per MATRICOLA** (fallback ODL), non per riga: `deduplicaMassivePerMatricola`.
- Saracinesca (`saracinescaProdotta`): **comune-agnostica**. Verità = colonna `esito` del master
  massive (Labico/Zagarolo la hanno); il DUNNING no → fallback sul positivo del DB.

### Niente comandi verso l'agente (ritirato il 04/08/2026)
La Produzione economica non arma più giri: i bottoni «Allinea master: Dunning / Limitazioni
massive» sono spariti con l'agente Playwright. I dati arrivano dall'**import del modulo ACEA**,
che porta il file nuovo e completo a ogni giro. **Non reintrodurre** bottoni di allineamento.

### SAL ufficiali ACEA: un solo `acea_sal`, la colonna `origine` dice da dove
- `'agente'` — righe storiche del bottone «Leggi SAL» del vecchio agente Playwright, ritirato
  il 04/08/2026 col resto dei suoi giri;
- `'import'` — la porta attiva: file caricato a mano da **Produzione economica → «Importa SAL»**
  (`POST /api/admin/acea/sal`, `requireAdmin`), per il giro di controllo di fine mese.

⚠️ **L'export che ACEA pubblica è CUMULATIVO**: contiene tutti i SAL emessi dall'inizio della
commessa, non il SAL del mese. Sommarne le righe dà il cumulato — è l'errore che
`lib/produzione/importSal.ts` esiste per rendere impossibile. Quello che divide un SAL dall'altro
dentro il file è la **Data registrazione** (il giro contabile SAP; la data di completamento varia
riga per riga). Un lotto = una data di registrazione.

Un SAL però può avere **più lotti**: ACEA chiude il grosso a fine mese e registra la coda nei
giorni dopo. Perciò `proponiLotti()`:
1. riconosce i lotti già in banca dati per **chiave naturale SAP** (`doc_acquisti|posizione`) e
   riusa il loro numero — il SAL 1 dentro il file di agosto non deve diventare un SAL nuovo;
2. numera i restanti per **mese di competenza** (mese prevalente delle date di completamento), così
   la coda sta col suo SAL. Verificato sull'export reale del 04/08/2026: lotti 08/07 → SAL 1
   (1545 righe, 46.191,14 €), 31/07 + 03/08 → SAL 2 (1454 righe, 45.305,18 €).

Il numero resta **correggibile a mano** nell'anteprima: a decidere quanti SAL ci sono in un mese è
il committente, non una regola nostra. La scrittura è **delete+insert per `sal_n`** (come il giro
dell'agente: ACEA riemette il file corretto, e un upsert lascerebbe in vita le righe che la
correzione voleva togliere) e tocca **solo i lotti selezionati**.

### Regola d'imputazione al SAL (decisione utente 2026-08-05, ritoccata la sera stessa)
Nel **SAL atteso** («Esitato ACEA») e nel **pre-SAL** entra solo l'ODL che soddisfa ENTRAMBE:
1. **riscontro NOSTRO**, in una di due forme:
   a. **positivo dai rapportini** (`stato='completato'` + `esito='eseguito_positivo'`; per le
      saracinesche vale l'ordine FIGLIO di sostituzione, agganciato per matricola alla
      limitazione madre con dichiarazione positiva — `figliSaracinescaPositivi`);
   b. **ultimo tentativo ESEGUITO nel registro Cruscotto** (`acea_ordini.esito_positivo` sulla
      riga col **max `numero_operazione`** dell'ODL — MAI la prima: ogni riga di registro è
      un'operazione SAP, cioè un tentativo). Nato dai **10 ODL del 2026-08-05** (es. 957276082:
      rapportini 12/06 e 15/06 «Nessun passaggio», eseguito da Giosi il 19/06 senza rapportino):
      il giro conclusivo dei nostri operatori a volte esiste solo nel registro. Sui 714 «senza
      riscontro» di luglio: 75 erano così (31 già pagati nel SAL 1), 639 negativi anche per il
      registro (causale non-E) e restano fuori.
2. **COMPLETATO sul portale ACEA**.
Un COMPLETATO del portale senza nessun riscontro nostro NON entra — resta materia dell'audit a
tre vie. Nel confronto SAL i riscontri da solo-registro hanno la classe/badge dedicata
«eseguiti da noi (registro), senza rapportino»: contati nel SAL, con la carta da sanare. La data
di una riga esitata da solo-registro è il `data_completamento` dell'ultimo tentativo, non la
data del passaggio fallito a rapportino. Helper puro: `odlImputabileAlSal`
(`lib/produzione/salUfficiale.ts`); mappa `registroUltimo` in `lib/produzione/load.ts`.

**Lo stato portale lo rinfresca l'IMPORT** (decisione utente 2026-08-06): `aggiornaPortaleSnapshot`
(`lib/acea/aggiornaPortaleSnapshot.ts`) riscrive `acea_portale_snapshot` a ogni import del modulo
ACEA, dall'ULTIMA operazione di ogni ordine, con `run_id` = id dell'import. Prende il posto
dell'agente ritirato: niente più tabella ferma, e il giro lo fa l'ufficio comunque. Tocca **solo
gli ODL presenti nel file** (l'export è finestrato: cancellare il resto perderebbe lo storico) ed
è best-effort come gli altri passi post-import. La vista AcquaLatina non ha un equivalente: là non
c'è portale né SAL (`conContabilizzazione: false`), la produzione nasce dagli interventi.

⚠️ **La consuntivazione ACEA ha DUE fonti** (`lib/produzione/consuntivazioneAcea.ts`, 2026-08-06):
portale (`acea_portale_snapshot`, COMPLETATO) **∪** registro Cruscotto (`acea_ordini`, ultimo
tentativo `stato='COMP'`). Lo snapshot lo scriveva l'agente ritirato il 04/08 ed è **fermo al
29/07**: reggerci sopra il gate del SAL nascondeva tutto ciò che ACEA chiude da fine luglio in
poi (al 06/08: 265 ordini pagabili, 76 di luglio + 189 di agosto — lo scarto notato sul pre-SAL
2). Il registro è la fonte viva e non contraddice: sui 5.828 ordini comuni è avanti 320 volte,
indietro mai. Il portale resta **primario sulla causale**; il registro parla solo per gli ordini
che il portale non conosce. La stessa unione alimenta `odlCompletatoAny` (fuori-SAL) e la colonna
«portale» dell'audit — se non lo facesse, ogni nostro positivo recente uscirebbe come
`POSITIVO_DB_NON_COMPLETATO_PORTALE`.

⚠️ **Audit a tre vie: COMPLETATO ≠ eseguito** (correzione utente 2026-08-05, «i 639»):
`PortaleRiga.esitoPositivoAcea` distingue la chiusura pagabile (causale E%, o ultimo tentativo
ESEGUITO nel registro) dall'ordine **archiviato negativo** (causale non-E: NPRT, NMNT…). Un
archiviato negativo con nostro esito negativo/assente è CONCORDE: niente
`COMPLETATO_PORTALE_NON_POSITIVO_DB`, `REGISTRO_NON_IN_DB` né `SOLO_PORTALE` — quei 639
concordi seppellivano le ~75 discrepanze vere. Se invece il nostro DB dà POSITIVO, le classi
restano vive.

⚠️ **«Fuori SAL» resta UN numero solo e NON si scompone** (correzione utente 2026-08-05):
tutto il prodotto non ancora consuntivato dal portale, CON o SENZA un ordine ACEA dietro
(a luglio 2026: 117.224 €). La scomposizione con-ordine/senza-ordine è stata provata
(`separaProduzioneDaEsitare` + card «Senza ordine ACEA» + area dedicata nel trend) e
**rifiutata lo stesso giorno**: non reintrodurla. Il lavoro positivo senza ordine (saracinesche
dichiarate senza ordine di sostituzione, massive senza ODL) conta in produzione e in fuori-SAL;
la regola d'imputazione qui sopra governa solo SAL e pre-SAL. Il lavoro senza ordine emerge
comunque dal confronto SAL per voce (Δ saracinesca/massive).

L'aggancio madre→figlio delle saracinesche usa TUTTI i figli per chiave (impianto+matricola,
via `chiaviAggancio`, anche dal misuratore dell'ordine madre nel registro), con preferenza
completato > aperto > primo — mai una mappa first-wins, che sceglierebbe a caso tra un figlio
chiuso già pagato e uno nuovo.

### Il pre-SAL segue il PERIODO (correzione utente 2026-08-06)
`preSal.totale` è il consuntivato-non-ancora-pagato **del periodo a schermo** — «il pre-SAL in
pancia ad ACEA a quel giorno»; `preSal.totaleVivo` è lo stock complessivo a qualunque data e vive
nella nota della card. Prima il numero grande era lo stock: accanto a un luglio secco diceva
51.186 € contro i ~45.700 di luglio, perché conteneva agosto e la coda di giugno.
L'asse è la **data di completamento ACEA** (`registroUltimo`), non la nostra data di esecuzione:
il SAL del committente si taglia su quella, e fra le due passano giorni. Così la card mostra
esattamente lo scarto col SAL del mese — a luglio 2026, dopo il carico del SAL 2: **731,64 € su
20 ODL**, cioè i 14 ordini per 610,37 € chiusi da ACEA dopo il taglio del SAL più 6 non pagabili.

### KPI personale: giornate-uomo ≠ giorni (correzione utente 2026-08-06)
`personale.totaleGiornate` sono **giornate-uomo** (somma delle frazioni: 4 operatori per 5 giorni
≈ 19); `personale.giorniLavorati` sono i **giorni di calendario** feriali in cui la commessa è
stata davvero toccata (`perGiorno.length`), e non dipendono dall'ampiezza del periodo a schermo.
La card «Personale impiegato» mostra `op × giorniLavorati` (mostrava le giornate-uomo come giorni:
«4 op × 19 gg» = 76 uomo-giorno, il quadruplo) e la «Produzione media giornaliera» divide per i
giorni lavorati; la resa per uomo-giorno resta nella nota. Se il lavoro parte il 29/07, i giorni
sono quelli lavorati — non i feriali del mese.

### Spunta saracinesca su voci nate senza il campo
La dichiarazione `risposte.sostituzione_valvola = 'SI'` è l'unica fonte del ciclo saracinesche:
la leggono KPI «Sost. valvola» dello Storico, filtro `soloValvola` di Performance, tabella
saracinesche del modulo ACEA (`caricaDichiarazioni`), riga di produzione da 91,12 €
(`SARA_KEY`) e aggancio madre→figlio del SAL (`figliSaracinescaPositivi`). Sulle voci ANTICHE
il campo non esisteva nel template e gli operatori scrivevano nelle note («INSERIMENTO
VALVOLA»): per recuperarle si scrive in DUE punti — la risposta **e** il campo select nel
`campi_snapshot` della voce, altrimenti la modale dello Storico (che costruisce i campi dallo
snapshot) non la mostra né la lascia correggere. Precedente: migration `20260805170000`
(3 massive Zagarolo del 03/06). Nessun campo foto va aggiunto: creerebbe un obbligo
fotografico su rapportini già chiusi.

### Voci di rapportino: MAI orfane (caso 957327236, 2026-08-05)
Una voce con `intervento_id NULL` è un esito che non arriva da nessuna parte: lo Storico
(che legge la voce) dice SI, l'intervento resta `assegnato`, il motore economico lo conta
negativo. L'aggancio voce→intervento (`buildVoceInterventoLinker`) vive in QUATTRO punti e
tutti con fallback alle colonne della voce (`odl`/`matricola`/`pdr`), non solo al `raw_json`:
1. generazione (`sincronizzaRapportini`) — e sul fallback FK-race si RILEGGE il piano e si
   riaggancia prima di salvare a NULL;
2. salvataggio operatore (`/api/r/[token]/voce`) — auto-aggancio live;
3. **invio** (`/api/r/[token]/invia`) — aggancio d'ultima istanza PRIMA del loop di
   propagazione, che salta le voci senza intervento;
4. sanatoria storica: migration `20260805150000` (54 ricollegate su 3 livelli di chiave,
   19 SI; positivi persi ripristinati con guardie: non annullato, esito null, motivo vuoto,
   nessun altro positivo sull'ODL). Le voci `-1`/`-2` AcquaLatina NON sono mislink: è la
   convenzione multi-misuratore.
Nel client Storico il drawer si azzera se la riga selezionata esce dalle righe caricate
(prima restava aperto su un intervento che la ricerca non mostrava più).

### Guardia DB: niente annullamenti muti su lavoro dichiarato SI
Trigger `interventi_blocca_annullamento_voce_si` (migration `20260805100000`): un intervento la
cui voce di rapportino dichiara `eseguito = SI` NON può passare ad `annullato` senza
`esito_motivo` o `riconciliazione_rif_id` **nello stesso UPDATE**. I flussi legittimi (doppio
positivo, annullamento motivato) li scrivono già; quello che si blocca è solo l'update muto —
il caso dell'ODL 957276247: 4 positivi pagati da ACEA nel SAL 1 annullati senza firma né audit,
spariti da produzione/Esitato/pre-SAL (ripristinati dalla migration `20260805090000`, con
guardia: voce SI + nessun altro positivo sull'ODL + annullamento non motivato). La transizione
è sorvegliata solo verso `annullato` (old ≠ annullato): i backfill sugli annullati storici non
inciampano nel trigger.

### Confronto SAL ↔ produzione (tendina «SAL» della barra periodo)
La tendina accanto a Mese/Trim./Anno porta il periodo sulla **finestra dei lavori** del SAL
(`SalStorico.dal/al`, cioè min/max `data_completamento`) e passa `&sal=N` all'endpoint produzione:
il payload si arricchisce di `confrontoSal` (`lib/produzione/confrontoSal.ts`, puro).

⚠️ Il **totale** non torna quasi mai e non è un errore: ACEA consuntiva con settimane di ritardo,
quindi la produzione del mese supera il SAL di quel mese. Quello che si guarda è la tabella **per
voce** — agganciata sull'**attività canonica**, non sul testo SAP, altrimenti «Limitazione flusso
idrico» e «Limitazione Erogazione» non si sommerebbero mai — e i quattro conteggi di ODL, che
separano un problema di **tempi** (pagato, lavorato in un altro mese) da uno di **dati** (pagato e
assente dal database). Segno: **Δ = produzione − SAL**; positivo = da farsi pagare, negativo =
ACEA ha contabilizzato più di quanto risulta a noi.


### Invariante
Non disattivare la voce tassonomia `LIMITAZIONI MASSIVE`: l'export
`api/export/limitazioni-massive` è ancorato al literal `gruppo_attivita='LIMITAZIONI MASSIVE'`
(selezione per tassonomia, agnostica al comune → include tutti i comuni).
