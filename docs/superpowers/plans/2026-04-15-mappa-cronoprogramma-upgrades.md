# Gestione Personale — Map & Cronoprogramma Upgrades

> **Per worker agentici:** Usa superpowers:subagent-driven-development per implementare questo piano task-by-task.

**Obiettivo:** Aggiungere saturazione da template alla mappa, persistere i contatori di distribuzione su Supabase, e visualizzare i conteggi attività come badge nel cronoprogramma.

**Architettura:**
1. **Saturazione template** — Estendi MappaOperatoriClient per accettare file `.xlsx`, geocodificali, e uniscili ai task esistenti prima della distribuzione
2. **Persistenza distribuzione** — Crea tabella `mappa_distribuzioni` e route API per registrare assegnazioni per data
3. **Badge conteggi** — Recupera dati distribuzione e visualizza conteggi accanto ai nomi operatori nel calendario e split view

**Tech Stack:** Next.js 14, TypeScript, React, Supabase, TailwindCSS

---

## Task 1: Crea Supabase Migration

**File:**
- Crea: `supabase/migrations/20260415000000_mappa_distribuzioni.sql`

- [ ] **Passo 1: Scrivi il file migration**

Crea `supabase/migrations/20260415000000_mappa_distribuzioni.sql`:

```sql
CREATE TABLE mappa_distribuzioni (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id text NOT NULL,
  data date NOT NULL,
  task_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(staff_id, data)
);

ALTER TABLE mappa_distribuzioni ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_policy" ON mappa_distribuzioni FOR ALL TO authenticated USING (true);
```

- [ ] **Passo 2: Verifica il file esiste**

Esegui: `ls -la supabase/migrations/20260415000000_mappa_distribuzioni.sql`

Atteso: File esiste con nome corretto.

- [ ] **Passo 3: Commit migration**

```bash
git add supabase/migrations/20260415000000_mappa_distribuzioni.sql
git commit -m "migration: create mappa_distribuzioni table for tracking staff assignments"
```

---

## Task 2: Crea Route API per Distribuzioni

**File:**
- Crea: `app/api/mappa/distribuzioni/route.ts`

- [ ] **Passo 1: Crea il file route handler**

Crea `app/api/mappa/distribuzioni/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { data, distribuzioni } = body;

    if (!data || !Array.isArray(distribuzioni)) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    for (const dist of distribuzioni) {
      const { staff_id, task_count } = dist;
      
      const { error } = await supabaseAdmin
        .from('mappa_distribuzioni')
        .upsert(
          {
            staff_id,
            data,
            task_count,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'staff_id,data' }
        );

      if (error) {
        console.error('Upsert error:', error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/mappa/distribuzioni error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json(
        { error: 'Missing from/to query parameters' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('mappa_distribuzioni')
      .select('staff_id, data, task_count')
      .gte('data', from)
      .lte('data', to);

    if (error) {
      console.error('SELECT error:', error);
      return NextResponse.json(
        { error: 'Database query failed' },
        { status: 500 }
      );
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('GET /api/mappa/distribuzioni error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

- [ ] **Passo 2: Verifica il file e gli import**

Esegui: `head -20 app/api/mappa/distribuzioni/route.ts`

Atteso: File mostra import corretti e firme funzioni.

- [ ] **Passo 3: Commit route**

```bash
git add app/api/mappa/distribuzioni/route.ts
git commit -m "api: add POST/GET endpoints for mappa_distribuzioni"
```

---

## Task 3: Aggiungi Stati e Logica Template a MappaOperatoriClient (Parte A)

**File:**
- Modifica: `components/modules/mappa/MappaOperatoriClient.tsx`

- [ ] **Passo 1: Leggi il file**

Apri `components/modules/mappa/MappaOperatoriClient.tsx` e individua la sezione degli stati (di solito attorno a riga 50-100).

- [ ] **Passo 2: Aggiungi stati template**

Dopo gli stati esistenti, aggiungi:

```typescript
const [templateTasks, setTemplateTasks] = useState<Task[]>([]);
const [templateGeocoding, setTemplateGeocoding] = useState<{done:number;total:number}|null>(null);
const fileTemplateInputRef = useRef<HTMLInputElement|null>(null);
```

- [ ] **Passo 3: Aggiorna memo allTasks**

Trova il `useMemo` esistente che calcola `allTasks`. Aggiornalo da:

```typescript
const allTasks = useMemo(() =>
  [...excelTasks, ...(geocodedAppointmentTasks ?? [])],
  [excelTasks, geocodedAppointmentTasks]);
```

A:

```typescript
const allTasks = useMemo(() =>
  [...excelTasks, ...templateTasks, ...(geocodedAppointmentTasks ?? [])],
  [excelTasks, templateTasks, geocodedAppointmentTasks]);
```

- [ ] **Passo 4: Aggiungi variabili calcolate**

Dopo il memo `allTasks`, aggiungi:

```typescript
const totalQtyRichiesta = selectedOps.reduce((s,o) => s + (o.qty||0), 0);
const geocodificati = allTasks.filter(t => t.lat != null && t.lng != null).length;
const needsSaturazione = totalQtyRichiesta > 0 && geocodificati < totalQtyRichiesta && !!distribution;
```

- [ ] **Passo 5: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "refactor: add template file states and allTasks logic"
```

---

## Task 4: Implementa Handler Template File (Parte B)

**File:**
- Modifica: `components/modules/mappa/MappaOperatoriClient.tsx`

- [ ] **Passo 1: Aggiungi handler handleTemplateFileChange**

Dopo la funzione `handleFileChange`, aggiungi:

```typescript
const handleTemplateFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    setTemplateGeocoding({ done: 0, total: 0 });
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const tasks: Task[] = rows.map((row: any, idx) => ({
      id: `template-${Date.now()}-${idx}`,
      indirizzo: row.indirizzo || '',
      cap: row.cap || '',
      citta: row.citta || '',
    }));

    setTemplateGeocoding({ done: 0, total: tasks.length });
    const geocoded: Task[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?` +
          `street=${encodeURIComponent(task.indirizzo)}&` +
          `postalcode=${encodeURIComponent(task.cap)}&` +
          `city=${encodeURIComponent(task.citta)}&` +
          `format=json&limit=1`
        );
        const results = await response.json();
        if (results.length > 0) {
          geocoded.push({
            ...task,
            lat: parseFloat(results[0].lat),
            lng: parseFloat(results[0].lon),
          });
        } else {
          geocoded.push(task);
        }
      } catch (error) {
        console.error(`Geocoding error for task ${i}:`, error);
        geocoded.push(task);
      }
      setTemplateGeocoding({ done: i + 1, total: tasks.length });
      await new Promise(r => setTimeout(r, 100));
    }

    setTemplateTasks(geocoded);
    setTemplateGeocoding(null);
    
    if (distribution) {
      distributeToOps();
    }
  } catch (error) {
    console.error('Error processing template file:', error);
    setTemplateGeocoding(null);
  }

  if (fileTemplateInputRef.current) {
    fileTemplateInputRef.current.value = '';
  }
};
```

- [ ] **Passo 2: Verifica handler**

Esegui: `grep -n "handleTemplateFileChange" components/modules/mappa/MappaOperatoriClient.tsx`

Atteso: Handler è definito.

- [ ] **Passo 3: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat: add handleTemplateFileChange with geocoding"
```

---

## Task 5: Aggiungi Bottone Template nel JSX (Parte C)

**File:**
- Modifica: `components/modules/mappa/MappaOperatoriClient.tsx` (sezione JSX)

- [ ] **Passo 1: Aggiungi input file nascosto**

Nel JSX (prima della chiusura `return`), cerca dove è l'input file per Excel e aggiungi vicino:

```typescript
<input
  ref={fileTemplateInputRef}
  type="file"
  accept=".xlsx,.xls"
  style={{ display: 'none' }}
  onChange={handleTemplateFileChange}
/>
```

- [ ] **Passo 2: Aggiungi bottone visibile**

Nella sezione Excel mode, dopo la distribuzione operatori, aggiungi:

```typescript
{needsSaturazione && (
  <div className="mt-3 flex items-center justify-between">
    <span className="text-xs text-gray-600">
      Completamento: {geocodificati} / {totalQtyRichiesta}
    </span>
    <button
      onClick={() => fileTemplateInputRef.current?.click()}
      className="rounded-lg border border-violet-400 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-800 hover:bg-violet-100"
    >
      + Integra da template ({totalQtyRichiesta - geocodificati} mancanti)
    </button>
  </div>
)}
```

- [ ] **Passo 3: Aggiungi progress bar**

Subito dopo il bottone:

```typescript
{templateGeocoding && (
  <div className="mt-2">
    <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
      <span>Geocodifica template</span>
      <span>{templateGeocoding.done} / {templateGeocoding.total}</span>
    </div>
    <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
      <div
        className="h-full bg-violet-500 transition-all"
        style={{
          width: `${templateGeocoding.total > 0 ? (templateGeocoding.done / templateGeocoding.total) * 100 : 0}%`
        }}
      />
    </div>
  </div>
)}
```

- [ ] **Passo 4: Verifica**

Esegui: `grep -n "needsSaturazione" components/modules/mappa/MappaOperatoriClient.tsx | head -2`

Atteso: Almeno 2 match.

- [ ] **Passo 5: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "ui: add template file button and progress bar"
```

---

## Task 6: Integra Salvataggio Distribuzioni su Supabase

**File:**
- Modifica: `components/modules/mappa/MappaOperatoriClient.tsx` (funzione distributeToOps)

- [ ] **Passo 1: Localizza distributeToOps e trova setDistribution(result)**

Apri il file e trova la riga:

```typescript
setDistribution(result);
```

- [ ] **Passo 2: Aggiungi fetch dopo setDistribution**

Sostituisci con:

```typescript
setDistribution(result);

fetch('/api/mappa/distribuzioni', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    data: planningDate,
    distribuzioni: result.map(d => ({ staff_id: d.staffId, task_count: d.tasks.length }))
  })
}).catch(() => {});
```

- [ ] **Passo 3: Verifica**

Esegui: `grep -A 5 "setDistribution(result)" components/modules/mappa/MappaOperatoriClient.tsx | head -8`

Atteso: Mostra fetch call.

- [ ] **Passo 4: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat: persist distribution counts to Supabase"
```

---

## Task 7: Aggiorna OperatorCard con Badge Conteggio

**File:**
- Modifica: `components/OperatorCard.tsx`

- [ ] **Passo 1: Aggiungi prop taskCount**

Nella firma della funzione, aggiungi `taskCount?: number` ai props:

```typescript
function OperatorCard({ a, onDelete, onEdit, taskCount }: { a: Assignment, onDelete?: ..., onEdit?: ..., taskCount?: number })
```

- [ ] **Passo 2: Localizza display_name nel JSX**

Trova lo span che renderizza `a.staff?.display_name ?? '-'`.

- [ ] **Passo 3: Aggiorna display name con badge**

Sostituisci il testo con:

```typescript
{`${a.staff?.display_name ?? '-'}${taskCount != null && taskCount > 0 ? ` (${taskCount})` : ''}`}
```

- [ ] **Passo 4: Verifica**

Esegui: `grep -n "taskCount" components/OperatorCard.tsx`

Atteso: Almeno 2 match.

- [ ] **Passo 5: Commit**

```bash
git add components/OperatorCard.tsx
git commit -m "feat: add taskCount badge to OperatorCard"
```

---

## Task 8: Aggiungi Fetch Conteggi a CronoprogrammaWorkspace

**File:**
- Modifica: `components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx`

- [ ] **Passo 1: Aggiungi stato taskCountMap**

Nei `useState`, aggiungi:

```typescript
const [taskCountMap, setTaskCountMap] = useState<Record<string,number>>({});
```

- [ ] **Passo 2: Aggiungi useEffect per fetch**

Dopo il `useEffect` che fetcha gli assignment, aggiungi:

```typescript
useEffect(() => {
  const isoFrom = from?.toISOString().split('T')[0];
  const isoTo = to?.toISOString().split('T')[0];

  if (!isoFrom || !isoTo) return;

  fetch(`/api/mappa/distribuzioni?from=${isoFrom}&to=${isoTo}`)
    .then(r => r.json())
    .then(rows => {
      const m: Record<string, number> = {};
      for (const r of rows) {
        m[`${r.staff_id}|${r.data}`] = r.task_count;
      }
      setTaskCountMap(m);
    })
    .catch(() => {});
}, [from, to]);
```

- [ ] **Passo 3: Passa taskCountMap a CronoCalendarView e CronoSplitView**

Aggiungi `taskCountMap={taskCountMap}` a entrambi i componenti nel JSX.

- [ ] **Passo 4: Verifica**

Esegui: `grep -n "taskCountMap" components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx | head -3`

Atteso: Almeno 3 match.

- [ ] **Passo 5: Commit**

```bash
git add components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx
git commit -m "feat: fetch and propagate taskCountMap in workspace"
```

---

## Task 9: Aggiorna CronoCalendarView

**File:**
- Modifica: `components/modules/cronoprogramma-personale/CronoCalendarView.tsx`

- [ ] **Passo 1: Aggiungi prop taskCountMap al componente esterno**

Nella firma di CronoCalendarView, aggiungi:

```typescript
taskCountMap?: Record<string,number>;
```

- [ ] **Passo 2: Aggiungi prop a DayCell**

In DayCell, aggiungi:

```typescript
taskCountMap?: Record<string,number>;
```

- [ ] **Passo 3: Passa taskCountMap a ogni OperatorCard**

In DayCell, aggiorna ogni `<OperatorCard>` con:

```typescript
taskCount={taskCountMap?.[`${a.staff?.id}|${iso}`]}
```

(Dove `iso` è la data ISO della cella.)

- [ ] **Passo 4: Passa taskCountMap da CronoCalendarView a DayCell**

Nel render di DayCell, aggiungi:

```typescript
<DayCell ... taskCountMap={taskCountMap} />
```

- [ ] **Passo 5: Verifica**

Esegui: `grep -n "taskCountMap" components/modules/cronoprogramma-personale/CronoCalendarView.tsx | head -5`

Atteso: Almeno 5 match.

- [ ] **Passo 6: Commit**

```bash
git add components/modules/cronoprogramma-personale/CronoCalendarView.tsx
git commit -m "feat: propagate taskCountMap through CronoCalendarView"
```

---

## Task 10: Aggiorna CronoSplitView

**File:**
- Modifica: `components/modules/cronoprogramma-personale/CronoSplitView.tsx`

- [ ] **Passo 1: Aggiungi prop taskCountMap al componente principale**

Nella firma, aggiungi:

```typescript
taskCountMap?: Record<string,number>;
```

- [ ] **Passo 2: Propaga attraverso componenti intermedi**

Per ogni componente intermedio (WeekCell, TerritoryWeek, ecc.), aggiungi `taskCountMap?: Record<string,number>` e passalo down.

- [ ] **Passo 3: Aggiungi taskCount a OperatorCard**

In ogni OperatorCard, aggiungi:

```typescript
taskCount={taskCountMap?.[`${a.staff?.id}|${iso}`]}
```

- [ ] **Passo 4: Verifica propagazione**

Esegui: `grep -n "taskCountMap" components/modules/cronoprogramma-personale/CronoSplitView.tsx | head -5`

Atteso: Almeno 5 match.

- [ ] **Passo 5: Commit**

```bash
git add components/modules/cronoprogramma-personale/CronoSplitView.tsx
git commit -m "feat: propagate taskCountMap through CronoSplitView"
```

---

## Task 11: Test Integrazione Completa

**File:**
- Test: Controllo browser dei moduli

- [ ] **Passo 1: Avvia dev server**

Esegui: `npm run dev`

Atteso: App avvia senza errori.

- [ ] **Passo 2: Test Upgrade 1 — Upload template file**

1. Vai al modulo mappa
2. Seleziona operatori e quantità (es. 5 operatori, 10 task)
3. Clicca "Distribuisci"
4. Verifica appare bottone "+ Integra da template"
5. Carica un file `.xlsx` con colonne indirizzo, cap, citta
6. Osserva progress bar geocodifica
7. Verifica task mergiati e distribuzione ricalcolata

Atteso: Bottone innesca file picker, geocodifica procede, distribuzione aggiornata.

- [ ] **Passo 3: Test Upgrade 2 — Persistenza Supabase**

1. Apri DevTools → Network
2. Completa distribuzione
3. Filtra richieste `/api/mappa/distribuzioni`
4. Verifica POST con staff_id e task_count corretti
5. Apri dashboard Supabase → tabella `mappa_distribuzioni`
6. Verifica record inseriti/upsertati

Atteso: API riceve POST, record in DB.

- [ ] **Passo 4: Test Upgrade 3 — Badge conteggi**

1. Vai a cronoprogramma (calendario pianificazione)
2. Cambia range date per includere date con distribuzioni
3. Verifica badge accanto nomi operatori (es. "Giovanni (5)")
4. Switch a split view
5. Verifica badge anche in split view

Atteso: Conteggi task visualizzati come badge "(n)".

- [ ] **Passo 5: Verifica tutto committed**

Esegui:

```bash
git status
```

Atteso: Working tree clean (tutto committed).

---

## Prossimo Passo

Tutti i task completati. Ora uso **finishing-a-development-branch** per completare lo sviluppo.
