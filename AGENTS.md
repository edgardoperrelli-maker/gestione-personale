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
// assegnazione-ai, hotel-calendar, interventi, consuntivazione, live,
// lista-attesa, misuratori, agente, performance, impostazioni, …) vive in
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

**Dipendenze già disponibili:** Leaflet, xlsx, exceljs — nessuna installazione necessaria.

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

---

## 14. LIMITAZIONI MASSIVE MULTI-COMUNE + PRODUZIONE ECONOMICA — REGOLE

Le "limitazioni massive" sono un programma ACEA **per comune**. Regola cardine (data-driven,
**mai hardcodare un comune**). Oggi i comuni attivi sono **Labico** e **Zagarolo**.

### Il comune È il file master
I comuni massive = i file MASTER scansionati dall'agente (`agente_file_colonne.is_master`,
es. `LABICO.xlsx` → `LABICO`). Fonte unica: `comuniMaster()` (`lib/agente/comuni.ts`) e, lato
Produzione economica, `caricaComuniMassive()` (`lib/produzione/comuniMassive.ts`). **Aggiungere
un comune = aggiungere un master nella cartella**, nessuna modifica al codice.

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

### Allineamento agente dalla Produzione economica
Il bottone **"Limitazioni massive"** accoda `target='TUTTI'` a `/api/admin/agente/acea-stato`
(`forza_acea_stato=true`, `acea_target='TUTTI'`, flag one-shot). Un solo giro Playwright: l'export
viene riversato su TUTTI i master massive (`risolviMaster`) e ne pusha lo snapshot (audit 3 vie).
`acea-stato` accetta `dunning | TUTTI | <COMUNE>`. Il controllo per singolo comune resta sulla
pagina **Agente**. **Non reintrodurre** un bottone per-comune ("Zagarolo") in Produzione economica.
Traccia del giro: `agente_run` = un `acea-stato` + un `acea-master` **per ogni** master del target
(con `TUTTI`, due `acea-master` ravvicinati).

### tools/limitazioni-sync (agente standalone `.mjs`)
`comuneDaFile` usa `path.win32.basename/extname`: i master vivono su SharePoint con path Windows
(`C:\...\LABICO.xlsx`) ma test/CI girano su POSIX; con `node:path` posix il path non verrebbe
spezzato. Vale per qualunque parsing di path Windows in questo tool.

### Invariante
Non disattivare la voce tassonomia `LIMITAZIONI MASSIVE`: l'export
`api/export/limitazioni-massive` è ancorato al literal `gruppo_attivita='LIMITAZIONI MASSIVE'`
(selezione per tassonomia, agnostica al comune → include tutti i comuni).
