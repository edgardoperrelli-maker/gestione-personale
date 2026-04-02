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
| State | Jotai | Solo per stato globale UI |
| Database | Supabase (PostgreSQL) | RLS abilitato |
| Auth | @supabase/auth-helpers-nextjs | Vedi sezione 5 |
| Maps | Leaflet 1.9 | Import dinamico obbligatorio (SSR) |
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
    smartracker/         → SmarTracker
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

### CSS Variables (da globals.css)
```css
--brand-primary:       #921B1B   /* rosso Plenzich */
--brand-primary-hover: #741515
--brand-primary-soft:  #F8ECEC
--brand-bg:            #F6F2F2
--brand-surface:       #ffffff
--brand-border:        #E5D8D8
--brand-text-main:     #1A0A0A
--brand-text-muted:    #7A6060
--brand-nav-active-bg: #F3E8E8

--sidebar-bg-from:     #1A0808   /* sidebar scura */
--sidebar-bg-to:       #2C1010
--sidebar-text:        #e8dada
--sidebar-muted:       #b89898
```

### Font
- **Inter** (400, 500, 600, 700) — body e UI
- Caricato via Google Fonts in globals.css

### Pattern card standard
```tsx
<div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4 shadow-sm">
  <div className="text-xl font-semibold">Titolo</div>
  <div className="text-sm text-[var(--brand-text-muted)]">Sottotitolo</div>
</div>
```

### Pattern stat box
```tsx
<div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
  <div className="text-xs text-[var(--brand-text-muted)]">Label</div>
  <div className="text-lg font-semibold text-[var(--brand-primary)]">{value}</div>
</div>
```

### Bottone primario
```tsx
<button className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-primary-hover)]">
  Azione
</button>
```

### Select / Input
```tsx
<select className="rounded-lg border border-[var(--brand-border)] bg-white px-2 py-1.5 text-sm">
<input className="rounded-lg border border-[var(--brand-border)] bg-white px-3 py-2 text-sm w-full" />
```

---

## 7. PATTERN MAPPA (Leaflet)

Leaflet richiede import dinamico per evitare errori SSR.

```typescript
'use client';
import { useEffect, useRef, useState } from 'react';

const mapRef = useRef<HTMLDivElement | null>(null);
const mapInstanceRef = useRef<Leaflet.Map | null>(null);
const layerRef = useRef<Leaflet.LayerGroup | null>(null);
const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null);

// Init mappa
useEffect(() => {
  let alive = true;
  (async () => {
    const L = await import('leaflet');
    if (!alive) return;
    setLeaflet(L);
    if (!mapRef.current || mapInstanceRef.current) return;
    mapInstanceRef.current = L.map(mapRef.current).setView([41.9, 12.5], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(mapInstanceRef.current);
    layerRef.current = L.layerGroup().addTo(mapInstanceRef.current);
  })();
  return () => {
    alive = false;
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
  };
}, []);
```

Tile provider: **CartoDB Voyager** (no API key, open)
Import CSS Leaflet: `import 'leaflet/dist/leaflet.css';` — solo nelle page.tsx server, non nei client components.

---

## 8. RUOLI E PERMESSI

```typescript
type ValidRole = 'admin' | 'operatore';

type AppModuleKey =
  | 'dashboard' | 'hotel-calendar' | 'smartracker'
  | 'rapportini' | 'mappa' | 'impostazioni';
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
7. **CSS**: usare sempre CSS variables del brand, mai colori hardcoded esclusi quelli già presenti nel codebase.
8. **Componenti UI**: usare i componenti esistenti (Button, Card, Badge, Input, Tabs) prima di crearne di nuovi.
9. **Leaflet**: sempre import dinamico, mai import statico (rompe SSR).
10. **Excel parsing**: usare `xlsx` per lettura semplice, `exceljs` per formattazione avanzata.

---

## 12. MODULO DA SVILUPPARE — OTTIMIZZAZIONE PERCORSI

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
