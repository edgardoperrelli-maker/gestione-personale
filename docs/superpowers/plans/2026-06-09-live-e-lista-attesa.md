# Live + Lista attesa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rinominare la Torre di controllo in "Live" (board del giorno, finestra max 7 giorni, export Excel) e spostare gli ordini manuali degli operatori in un nuovo modulo "Lista attesa".

**Architecture:** Riuso al massimo il codice esistente. La logica di lettura/filtro `data` della board è già corretta e resta intatta. Si lavora su: (1) tre funzioni pure testate (clamp finestra, filtro stato export, riga export), (2) un nuovo endpoint export `exceljs`, (3) rinomina di rotta/componente, (4) un nuovo modulo che ospita coda + registro spostati. Nessuna modifica allo schema DB.

**Tech Stack:** Next.js App Router, Supabase (`supabaseAdmin`/auth-helpers), ExcelJS, Vitest, Tailwind.

**Spec di riferimento:** `docs/superpowers/specs/2026-06-09-live-e-lista-attesa-design.md`

**Branch:** `feat/live-e-lista-attesa` (già creato; spec già committato).

**Convenzioni:**
- Test: `npx vitest run <path>` (il progetto usa Vitest).
- Lint gate: `npx eslint <file>` sui file toccati (il `npm run lint` globale è già rosso su main — vedi memoria; conta "nessun nuovo problema").
- Ogni commit termina con il footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## WP1 — Logiche pure (additivo, non rompe nulla)

### Task 1: Finestra navigabile del Live (clamp 7 giorni)

**Files:**
- Create: `lib/interventi/liveWindow.ts`
- Test: `lib/interventi/liveWindow.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

`lib/interventi/liveWindow.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { clampDataLive, minDataLive } from './liveWindow';

describe('minDataLive', () => {
  it('ritorna oggi − 7 giorni', () => {
    expect(minDataLive('2026-06-09')).toBe('2026-06-02');
  });
});

describe('clampDataLive', () => {
  const oggi = '2026-06-09';
  it('data odierna resta', () => expect(clampDataLive('2026-06-09', oggi)).toBe('2026-06-09'));
  it('data nella finestra resta', () => expect(clampDataLive('2026-06-05', oggi)).toBe('2026-06-05'));
  it('bordo minimo (oggi−7) resta', () => expect(clampDataLive('2026-06-02', oggi)).toBe('2026-06-02'));
  it('oltre 7 giorni → oggi', () => expect(clampDataLive('2026-06-01', oggi)).toBe('2026-06-09'));
  it('data futura → oggi', () => expect(clampDataLive('2026-06-10', oggi)).toBe('2026-06-09'));
  it('formato non valido → oggi', () => expect(clampDataLive('abc', oggi)).toBe('2026-06-09'));
  it('undefined → oggi', () => expect(clampDataLive(undefined, oggi)).toBe('2026-06-09'));
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `npx vitest run lib/interventi/liveWindow.test.ts`
Expected: FAIL (`Failed to resolve import './liveWindow'`).

- [ ] **Step 3: Implementa la funzione pura**

`lib/interventi/liveWindow.ts`:
```ts
// Finestra temporale navigabile del modulo Live: oggi e fino a 7 giorni indietro.
// Puro: riceve `oggi` (YYYY-MM-DD) per essere deterministico/testabile.
import { addDaysIso } from '@/lib/dashboard/addDaysIso';

/** Data minima navigabile nel Live: oggi − 7 giorni. */
export function minDataLive(oggi: string): string {
  return addDaysIso(oggi, -7);
}

/**
 * Clampa la data richiesta nella finestra [oggi−7, oggi]. Se `data` è assente,
 * malformata, oltre la settimana o nel futuro, ritorna `oggi`.
 */
export function clampDataLive(data: string | undefined | null, oggi: string): string {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return oggi;
  if (data < minDataLive(oggi) || data > oggi) return oggi;
  return data;
}
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `npx vitest run lib/interventi/liveWindow.test.ts`
Expected: PASS (8 test).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/liveWindow.ts lib/interventi/liveWindow.test.ts
git commit -m "feat(live): clampDataLive — finestra navigabile di 7 giorni" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Filtro stato per l'export (riusa coloreStato)

**Files:**
- Create: `lib/interventi/exportFiltro.ts`
- Test: `lib/interventi/exportFiltro.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

`lib/interventi/exportFiltro.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { interventoMatchStato } from './exportFiltro';

describe('interventoMatchStato', () => {
  it('tutti → sempre true', () => {
    expect(interventoMatchStato({ stato: 'assegnato', esito: null }, 'tutti')).toBe(true);
    expect(interventoMatchStato({ stato: 'completato', esito: 'accesso_negato' }, 'tutti')).toBe(true);
  });
  it('ok → solo completato positivo', () => {
    expect(interventoMatchStato({ stato: 'completato', esito: 'eseguito_positivo' }, 'ok')).toBe(true);
    expect(interventoMatchStato({ stato: 'completato', esito: 'accesso_negato' }, 'ok')).toBe(false);
  });
  it('ko → completato non positivo', () => {
    expect(interventoMatchStato({ stato: 'completato', esito: 'accesso_negato' }, 'ko')).toBe(true);
    expect(interventoMatchStato({ stato: 'completato', esito: 'eseguito_positivo' }, 'ko')).toBe(false);
  });
  it('attesa → solo assegnato', () => {
    expect(interventoMatchStato({ stato: 'assegnato', esito: null }, 'attesa')).toBe(true);
    expect(interventoMatchStato({ stato: 'in_esecuzione', esito: null }, 'attesa')).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `npx vitest run lib/interventi/exportFiltro.test.ts`
Expected: FAIL (`Failed to resolve import './exportFiltro'`).

- [ ] **Step 3: Implementa la funzione pura**

`lib/interventi/exportFiltro.ts`:
```ts
// Mappa il filtro-stato della UI del Live ('tutti'|'ok'|'ko'|'attesa') a un
// predicato sull'intervento, riusando la stessa logica cromatica della board.
import { coloreStato } from './torreView';

export type FiltroStatoLive = 'tutti' | 'ok' | 'ko' | 'attesa';

export function interventoMatchStato(
  it: { stato: string; esito: string | null },
  filtro: FiltroStatoLive,
): boolean {
  if (filtro === 'tutti') return true;
  return coloreStato(it.stato, it.esito) === filtro;
}
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `npx vitest run lib/interventi/exportFiltro.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/exportFiltro.ts lib/interventi/exportFiltro.test.ts
git commit -m "feat(live): interventoMatchStato — filtro stato per export" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Riga export intervento → Excel

**Files:**
- Create: `lib/interventi/exportRows.ts`
- Test: `lib/interventi/exportRows.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

`lib/interventi/exportRows.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildRigaExport, type InterventoExport } from './exportRows';

const base: InterventoExport = {
  data: '2026-06-09', staff_id: 's1', stato: 'completato', esito: 'eseguito_positivo',
  esito_motivo: null, odl: 'A1', nominativo: 'Mario Rossi', pdr: 'P1', matricola_contatore: 'M1',
  indirizzo: 'Via X 1', comune: 'Roma', cap: '00100', intervento_tipo: 'Rimozione',
  fascia_oraria: '8-12', chiuso_at: '2026-06-09T08:30:00Z',
};

describe('buildRigaExport', () => {
  const staff = new Map([['s1', 'Mario']]);

  it('mappa i campi e risolve operatore + label', () => {
    const r = buildRigaExport(base, staff);
    expect(r.operatore).toBe('Mario');
    expect(r.stato).toBe('Completato');
    expect(r.esito).toBe('Eseguito positivo');
    expect(r.odl).toBe('A1');
    expect(r.chiuso).toBe('10:30'); // 08:30Z → 10:30 Europe/Rome (estate)
  });

  it('staff sconosciuto → usa id; null → Non assegnato', () => {
    expect(buildRigaExport({ ...base, staff_id: 'x' }, staff).operatore).toBe('x');
    expect(buildRigaExport({ ...base, staff_id: null }, staff).operatore).toBe('Non assegnato');
  });

  it('campi nulli → stringa vuota; chiuso_at null → vuoto', () => {
    const r = buildRigaExport({ ...base, odl: null, esito: null, chiuso_at: null }, staff);
    expect(r.odl).toBe('');
    expect(r.esito).toBe('');
    expect(r.chiuso).toBe('');
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `npx vitest run lib/interventi/exportRows.test.ts`
Expected: FAIL (`Failed to resolve import './exportRows'`).

- [ ] **Step 3: Implementa la funzione pura**

`lib/interventi/exportRows.ts`:
```ts
// Mappa una riga `interventi` alla riga dell'export Excel del Live.
import { labelStato } from './interventiView';

export type InterventoExport = {
  data: string;
  staff_id: string | null;
  stato: string;
  esito: string | null;
  esito_motivo: string | null;
  odl: string | null;
  nominativo: string | null;
  pdr: string | null;
  matricola_contatore: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  intervento_tipo: string | null;
  fascia_oraria: string | null;
  chiuso_at: string | null;
};

export type RigaExport = {
  data: string; operatore: string; stato: string; esito: string; motivo: string;
  odl: string; nominativo: string; pdr: string; matricola: string;
  indirizzo: string; comune: string; cap: string; attivita: string; fascia: string; chiuso: string;
};

const ESITO_LABELS: Record<string, string> = {
  eseguito_positivo: 'Eseguito positivo',
  accesso_negato: 'Accesso negato',
  contatore_non_trovato: 'Contatore non trovato',
  dati_ubicazione_insufficienti: 'Dati ubicazione insufficienti',
  accesso_a_vuoto: 'Accesso a vuoto',
  rinviato: 'Rinviato',
};

function labelEsito(e: string | null): string {
  if (!e) return '';
  return ESITO_LABELS[e] ?? e;
}

/** HH:MM in fuso Europe/Rome dell'orario di chiusura; '' se assente. */
function oraRoma(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
}

export function buildRigaExport(it: InterventoExport, staffById: Map<string, string>): RigaExport {
  return {
    data: it.data,
    operatore: it.staff_id ? (staffById.get(it.staff_id) ?? it.staff_id) : 'Non assegnato',
    stato: labelStato(it.stato),
    esito: labelEsito(it.esito),
    motivo: it.esito_motivo ?? '',
    odl: it.odl ?? '',
    nominativo: it.nominativo ?? '',
    pdr: it.pdr ?? '',
    matricola: it.matricola_contatore ?? '',
    indirizzo: it.indirizzo ?? '',
    comune: it.comune ?? '',
    cap: it.cap ?? '',
    attivita: it.intervento_tipo ?? '',
    fascia: it.fascia_oraria ?? '',
    chiuso: oraRoma(it.chiuso_at),
  };
}
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `npx vitest run lib/interventi/exportRows.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/exportRows.ts lib/interventi/exportRows.test.ts
git commit -m "feat(live): buildRigaExport — mappa intervento → riga Excel" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## WP2 — Endpoint export

### Task 4: `GET /api/interventi/export`

**Files:**
- Create: `app/api/interventi/export/route.ts`

Nota: route handler che usa `supabaseAdmin` → non si unit-testa (pattern del progetto, come `export-intervalli`). La logica testabile è già coperta da Task 2-3. Verifica con lint + prova manuale (Task 12).

- [ ] **Step 1: Crea il route handler**

`app/api/interventi/export/route.ts`:
```ts
import 'server-only';
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { interventoMatchStato, type FiltroStatoLive } from '@/lib/interventi/exportFiltro';
import { buildRigaExport, type InterventoExport } from '@/lib/interventi/exportRows';
import { SENTINELLA_NON_ASSEGNATI } from '@/lib/interventi/torreView';

export const runtime = 'nodejs';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const COLONNE =
  'data, staff_id, stato, esito, esito_motivo, odl, nominativo, pdr, matricola_contatore, indirizzo, comune, cap, intervento_tipo, fascia_oraria, chiuso_at, territorio_id';

const HEADERS = [
  { key: 'data', header: 'DATA', width: 12 },
  { key: 'operatore', header: 'OPERATORE', width: 20 },
  { key: 'stato', header: 'STATO', width: 14 },
  { key: 'esito', header: 'ESITO', width: 20 },
  { key: 'motivo', header: 'MOTIVO', width: 24 },
  { key: 'odl', header: 'ODL', width: 14 },
  { key: 'nominativo', header: 'NOMINATIVO', width: 22 },
  { key: 'pdr', header: 'PDR', width: 14 },
  { key: 'matricola', header: 'MATRICOLA', width: 14 },
  { key: 'indirizzo', header: 'INDIRIZZO', width: 24 },
  { key: 'comune', header: 'COMUNE', width: 16 },
  { key: 'cap', header: 'CAP', width: 7 },
  { key: 'attivita', header: 'ATTIVITÀ', width: 16 },
  { key: 'fascia', header: 'FASCIA ORARIA', width: 14 },
  { key: 'chiuso', header: 'CHIUSO', width: 8 },
];

const STATI_VALIDI: FiltroStatoLive[] = ['tutti', 'ok', 'ko', 'attesa'];

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'Parametri from/to obbligatori (YYYY-MM-DD).' }, { status: 400 });
  }
  const staff = searchParams.get('staff') ?? '';
  const territorio = searchParams.get('territorio') ?? '';
  const statoParam = (searchParams.get('stato') ?? 'tutti') as FiltroStatoLive;
  const stato: FiltroStatoLive = STATI_VALIDI.includes(statoParam) ? statoParam : 'tutti';

  try {
    // Interventi nel range; territorio/operatore filtrati in SQL, paginazione 1000.
    const PAGE = 1000;
    const righeDb: InterventoExport[] = [];
    for (let offset = 0; ; offset += PAGE) {
      let q = supabaseAdmin
        .from('interventi')
        .select(COLONNE)
        .gte('data', from)
        .lte('data', to)
        .order('data', { ascending: true })
        .order('comune', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (territorio) q = q.eq('territorio_id', territorio);
      if (staff === SENTINELLA_NON_ASSEGNATI) q = q.is('staff_id', null);
      else if (staff) q = q.eq('staff_id', staff);
      const { data: batch, error } = await q;
      if (error) throw error;
      const rows = (batch ?? []) as InterventoExport[];
      righeDb.push(...rows);
      if (rows.length < PAGE) break;
    }

    // Filtro stato in memoria (riusa coloreStato).
    const filtrate = righeDb.filter((it) => interventoMatchStato(it, stato));

    // Mappa staff_id → display_name.
    const { data: staffRows } = await supabaseAdmin.from('staff').select('id, display_name');
    const staffById = new Map<string, string>();
    for (const s of (staffRows ?? []) as Array<{ id: string; display_name: string }>) {
      staffById.set(s.id, s.display_name);
    }

    // Workbook.
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Gestione Personale';
    wb.created = new Date();
    const ws = wb.addWorksheet('Live', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = HEADERS;

    const hRow = ws.getRow(1);
    hRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2749' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    hRow.height = 20;
    hRow.commit();

    let rowIdx = 2;
    for (const it of filtrate) {
      const wsRow = ws.getRow(rowIdx);
      // Assegnazione per chiave (le chiavi combaciano con ws.columns[].key).
      wsRow.values = buildRigaExport(it, staffById) as unknown as Record<string, ExcelJS.CellValue>;
      wsRow.commit();
      rowIdx++;
    }

    const buf = await wb.xlsx.writeBuffer();
    const fileName = `live_${from.replaceAll('-', '')}_${to.replaceAll('-', '')}.xlsx`;
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String((buf as unknown as { byteLength: number }).byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore export.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Lint del nuovo file**

Run: `npx eslint app/api/interventi/export/route.ts`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/api/interventi/export/route.ts
git commit -m "feat(live): endpoint GET /api/interventi/export (xlsx, filtri)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## WP3 — Modulo Lista attesa (coda + registro)

In questo WP la coda/registro restano fisicamente in `components/modules/torre/` e vengono montati ANCHE nella nuova pagina Lista attesa (stato transitorio: coda raggiungibile sempre). Lo spostamento fisico avviene in WP5.

### Task 5: Registra il modulo `lista-attesa`

**Files:**
- Modify: `lib/moduleAccess.ts`
- Modify: `components/layout/moduleIcons.tsx`

- [ ] **Step 1: Aggiungi la chiave al type `AppModuleKey`**

In `lib/moduleAccess.ts`, nel type `AppModuleKey` aggiungi `| 'lista-attesa'` (dopo `'torre'`):
```ts
  | 'torre'
  | 'lista-attesa'
  | 'misuratori'
```

- [ ] **Step 2: Aggiungi la definizione del modulo**

In `APP_MODULES`, subito dopo il blocco `torre` (che termina con `adminOnly: true },`), inserisci:
```ts
  {
    key: 'lista-attesa',
    href: '/hub/lista-attesa',
    label: 'Lista attesa',
    description: 'Ordini manuali degli operatori',
    section: 'modules',
    matchPrefixes: ['/hub/lista-attesa'],
    adminOnly: true,
  },
```

- [ ] **Step 3: Includi `lista-attesa` nei moduli admin**

In `normalizeAllowedModules`, nel ramo admin, aggiungi `'lista-attesa'`:
```ts
  if (isAdminAssignableRole(role)) {
    return Array.from(new Set<AppModuleKey>([...allowed, 'sopralluoghi', 'impostazioni', 'torre', 'lista-attesa', 'misuratori']));
  }
```
E nel ramo non-admin escludilo (è adminOnly), aggiungendo la condizione:
```ts
  return Array.from(
    new Set<AppModuleKey>([...allowed.filter((key) => key !== 'impostazioni' && key !== 'torre' && key !== 'lista-attesa'), 'sopralluoghi']),
  );
```

- [ ] **Step 4: Aggiungi l'icona**

In `components/layout/moduleIcons.tsx`, dentro `MODULE_ICONS`, dopo la voce `torre`, aggiungi (lista + clessidra):
```tsx
  'lista-attesa': (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 6h10M4 12h10M4 18h6" />
      <circle cx="18" cy="17" r="3.5" />
      <path d="M18 15.5v1.5l1 1" />
    </svg>
  ),
```

- [ ] **Step 5: Lint + commit**

Run: `npx eslint lib/moduleAccess.ts components/layout/moduleIcons.tsx`
Expected: nessun errore.
```bash
git add lib/moduleAccess.ts components/layout/moduleIcons.tsx
git commit -m "feat(lista-attesa): registra il modulo e l'icona" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Pagina `/hub/lista-attesa`

**Files:**
- Create: `app/hub/lista-attesa/page.tsx`

Porta qui il caricamento dati manuali oggi presente in `app/hub/torre/page.tsx` (righe 64-104) e monta coda + registro importandoli dalla posizione attuale `@/components/modules/torre/`.

- [ ] **Step 1: Crea la pagina**

`app/hub/lista-attesa/page.tsx`:
```tsx
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { resolveUserRole } from '@/lib/moduleAccess';
import { CodaRichiesteManuali } from '@/components/modules/torre/CodaRichiesteManuali';
import { RegistroAutorizzazioni } from '@/components/modules/torre/RegistroAutorizzazioni';
import { resolveInfoCampi, type TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { risolviTemplateCommittente, type TemplateRow } from '@/lib/interventi/manuali/risolviTemplateCommittente';
import type { CommittenteManuale } from '@/lib/interventi/manuali/types';

export const dynamic = 'force-dynamic';

export default async function ListaAttesaPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (role !== 'admin') redirect('/hub');

  // Header info per la revisione: template default PIANIFICATO.
  const { data: tplDefRows } = await supabase
    .from('rapportino_template')
    .select('info_campi, is_default')
    .eq('active', true);
  const tplDef = (tplDefRows ?? []) as Array<{ info_campi: unknown; is_default: boolean }>;
  const tplDefault = tplDef.find((t) => t.is_default) ?? tplDef[0];
  const infoCampi: TemplateInfoCampo[] = resolveInfoCampi((tplDefault?.info_campi ?? null) as TemplateInfoCampo[] | null);

  // Campi esito per committente: solo template SOLO-MANUALE.
  const { data: tplRows } = await supabase
    .from('rapportino_template')
    .select('id, committente, campi, info_campi, is_default, active, solo_manuale')
    .eq('active', true)
    .eq('solo_manuale', true);
  const tpl = (tplRows ?? []) as Array<{ id: string; committente: string | null; campi: unknown; info_campi: unknown; is_default: boolean; active: boolean; solo_manuale?: boolean }>;

  const COMMITTENTI_MANUALI: CommittenteManuale[] = ['acea', 'italgas', 'altro'];
  const tplRows2 = tpl as TemplateRow[];
  const campiPerCommittente: Partial<Record<CommittenteManuale, TemplateCampo[]>> = {};
  for (const committente of COMMITTENTI_MANUALI) {
    const tplId = risolviTemplateCommittente(committente, tplRows2);
    const tplMatch = tplId ? tpl.find((t) => t.id === tplId) : null;
    if (tplMatch) campiPerCommittente[committente] = (tplMatch.campi ?? []) as TemplateCampo[];
  }

  // Mappa uuid→nome admin per la coda (chi ha preso in carico).
  const { data: adminRows } = await supabase.from('profiles').select('id, username').eq('role', 'admin');
  const adminNomi: Record<string, string> = {};
  for (const a of (adminRows ?? []) as Array<{ id: string; username: string | null }>) {
    adminNomi[a.id] = a.username ?? a.id;
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>Lista attesa</h1>
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>Ordini manuali generati dagli operatori: coda da approvare e storico.</p>
      </header>
      <CodaRichiesteManuali infoCampi={infoCampi} campiPerCommittente={campiPerCommittente} userId={user.id} adminNomi={adminNomi} />
      <RegistroAutorizzazioni />
    </main>
  );
}
```

- [ ] **Step 2: Verifica build della rotta**

Run: `npx eslint app/hub/lista-attesa/page.tsx`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/hub/lista-attesa/page.tsx
git commit -m "feat(lista-attesa): pagina con coda e registro" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Campanello topbar → Lista attesa

**Files:**
- Modify: `components/layout/CampanelloRichieste.tsx:11`

- [ ] **Step 1: Aggiorna l'href e il commento**

In `components/layout/CampanelloRichieste.tsx`:
- riga 5 (commento): `apre la torre.` → `apre la lista attesa.`
- riga 11: `href="/hub/torre"` → `href="/hub/lista-attesa"`

- [ ] **Step 2: Lint + commit**

Run: `npx eslint components/layout/CampanelloRichieste.tsx`
Expected: nessun errore.
```bash
git add components/layout/CampanelloRichieste.tsx
git commit -m "feat(lista-attesa): il campanello apre la Lista attesa" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## WP4 — Rinomina Torre → Live + snellimento + finestra + export UI

### Task 8: Rinomina rotta e componente, aggiorna moduleAccess

**Files:**
- Rename: `app/hub/torre/` → `app/hub/live/`
- Rename: `components/modules/torre/TorreControlloClient.tsx` → `components/modules/live/LiveClient.tsx`
- Rename: `components/modules/torre/TorreMappa.tsx` → `components/modules/live/TorreMappa.tsx`
- Create: `app/hub/torre/page.tsx` (stub redirect)
- Modify: `lib/moduleAccess.ts`, `components/layout/moduleIcons.tsx`, `app/hub/page.tsx`

- [ ] **Step 1: Verifica chi importa TorreMappa**

Run: `git grep -n "TorreMappa"`
Expected: solo `TorreControlloClient.tsx` la importa via `dynamic(() => import('./TorreMappa'))`. Se compaiono altri importatori, aggiorna i loro path nello Step 3.

- [ ] **Step 2: Sposta i file (preserva la history)**

```bash
git mv app/hub/torre app/hub/live
git mv components/modules/torre/TorreControlloClient.tsx components/modules/live/LiveClient.tsx
git mv components/modules/torre/TorreMappa.tsx components/modules/live/TorreMappa.tsx
```

- [ ] **Step 3: Rinomina il simbolo del componente**

In `components/modules/live/LiveClient.tsx`:
- `export default function TorreControlloClient({` → `export default function LiveClient({`
- L'import `dynamic(() => import('./TorreMappa'))` resta valido (TorreMappa è ora nella stessa cartella).
- `<h1>` "Torre di controllo" → "Live".
- `router.push(\`/hub/torre?data=${e.target.value}\`)` → `router.push(\`/hub/live?data=${e.target.value}\`)`.

- [ ] **Step 4: Aggiorna l'import nella pagina Live**

In `app/hub/live/page.tsx`:
```ts
import LiveClient, { type TorreIntervento } from '@/components/modules/live/LiveClient';
```
e nel JSX `<TorreControlloClient .../>` → `<LiveClient .../>`.

- [ ] **Step 5: Aggiorna moduleAccess (torre → live)**

In `lib/moduleAccess.ts`:
- type `AppModuleKey`: `| 'torre'` → `| 'live'`.
- blocco modulo:
```ts
  {
    key: 'live',
    href: '/hub/live',
    label: 'Live',
    description: 'Interventi del giorno in tempo reale',
    section: 'modules',
    matchPrefixes: ['/hub/live'],
    adminOnly: true,
  },
```
- `normalizeAllowedModules`, ramo admin: `'torre'` → `'live'`.
- ramo non-admin: `key !== 'torre'` → `key !== 'live'`.

- [ ] **Step 6: Aggiorna icona e link dashboard**

- `components/layout/moduleIcons.tsx`: rinomina la chiave `torre:` → `live:` (mantieni l'SVG esistente).
- `app/hub/page.tsx:152`: `href="/hub/torre"` → `href="/hub/live"`; riga 165 testo "Torre di controllo" → "Live".

- [ ] **Step 7: Crea lo stub di redirect**

`app/hub/torre/page.tsx`:
```tsx
import { permanentRedirect } from 'next/navigation';

// La Torre di controllo è stata rinominata in "Live" (/hub/live).
// Redirect permanente per i preferiti già salvati.
export default function TorreRedirect() {
  permanentRedirect('/hub/live');
}
```

- [ ] **Step 8: Lint + commit**

Run: `npx eslint app/hub/live/page.tsx app/hub/torre/page.tsx components/modules/live/LiveClient.tsx lib/moduleAccess.ts app/hub/page.tsx`
Expected: nessun errore.
```bash
git add -A
git commit -m "feat(live): rinomina Torre di controllo → Live (rotta, componente, modulo) + redirect" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Snellisci il Live (rimuovi coda e registro)

**Files:**
- Modify: `app/hub/live/page.tsx`

- [ ] **Step 1: Riscrivi la pagina Live senza i blocchi manuali**

Sostituisci il contenuto di `app/hub/live/page.tsx` con (rimuove `CodaRichiesteManuali`, `RegistroAutorizzazioni` e tutto il caricamento dati solo-loro; mantiene interventi/territori/operatori e il clamp finestra):
```tsx
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { resolveUserRole } from '@/lib/moduleAccess';
import { isStaffValidOnDay } from '@/lib/staff';
import type { Staff } from '@/types';
import LiveClient, { type TorreIntervento } from '@/components/modules/live/LiveClient';
import { clampDataLive } from '@/lib/interventi/liveWindow';

export const dynamic = 'force-dynamic';

/** Data odierna in fuso Europe/Rome (YYYY-MM-DD). */
function oggiRoma(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

export default async function LivePage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (role !== 'admin') redirect('/hub');

  const oggi = oggiRoma();
  const data = clampDataLive(sp.data, oggi);

  const PAGE = 1000;
  const rows: TorreIntervento[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: page } = await supabase
      .from('interventi')
      .select('id, odl, nominativo, indirizzo, comune, cap, pdr, matricola_contatore, intervento_tipo, lat, lng, staff_id, stato, esito, esito_motivo, chiuso_at, fascia_oraria, territorio_id')
      .eq('data', data)
      .order('comune', { ascending: true })
      .order('indirizzo', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    const batch = (page ?? []) as TorreIntervento[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const { data: territoriRows } = await supabase.from('territories').select('id, name').order('name', { ascending: true });
  const territori = (territoriRows ?? []) as Array<{ id: string; name: string }>;

  const { data: staffRows } = await supabase.from('staff').select('id, display_name, valid_from, valid_to');
  const operatori = ((staffRows ?? []) as Staff[])
    .filter((s) => isStaffValidOnDay(s, data))
    .map((s) => ({ id: s.id, display_name: s.display_name }));

  return (
    <LiveClient
      data={data}
      interventi={rows}
      operatori={operatori}
      territori={territori}
    />
  );
}
```

Nota: in questo task `LiveClient` riceve ancora le sole props originali (la finestra `minData`/`maxData` viene cablata nel Task 10, insieme all'estensione del componente, per mantenere ogni commit type-safe).

- [ ] **Step 2: Verifica che i componenti manuali non siano più importati dal Live**

Run: `git grep -n "CodaRichiesteManuali\|RegistroAutorizzazioni" -- app/hub/live`
Expected: nessun risultato.

- [ ] **Step 3: Lint + commit**

Run: `npx eslint app/hub/live/page.tsx`
Expected: nessun errore.
```bash
git add app/hub/live/page.tsx
git commit -m "feat(live): board del solo giorno (coda e registro spostati in Lista attesa)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Finestra 7 giorni — estendi il componente e collega la pagina

**Files:**
- Modify: `components/modules/live/LiveClient.tsx`
- Modify: `app/hub/live/page.tsx`

Componente e pagina cambiano nello stesso commit: così il commit type-checka (la pagina passa `minData`/`maxData` solo quando il componente le dichiara).

- [ ] **Step 1: Estendi le props del componente**

Nella firma `export default function LiveClient({ data, interventi, operatori, territori })` e nel suo type, aggiungi `minData` e `maxData`:
```ts
export default function LiveClient({
  data,
  minData,
  maxData,
  interventi,
  operatori,
  territori,
}: {
  data: string;
  minData: string;
  maxData: string;
  interventi: TorreIntervento[];
  operatori: { id: string; display_name: string }[];
  territori: { id: string; name: string }[];
}) {
```

- [ ] **Step 2: Applica min/max all'input data**

Nell'`<input type="date" value={data} ... />` dell'header aggiungi gli attributi:
```tsx
            min={minData}
            max={maxData}
```

- [ ] **Step 3: Collega la pagina (passa la finestra)**

In `app/hub/live/page.tsx`:
- aggiorna l'import: `import { clampDataLive } from '@/lib/interventi/liveWindow';` → `import { clampDataLive, minDataLive } from '@/lib/interventi/liveWindow';`
- passa le nuove props nel JSX:
```tsx
    <LiveClient
      data={data}
      minData={minDataLive(oggi)}
      maxData={oggi}
      interventi={rows}
      operatori={operatori}
      territori={territori}
    />
```

- [ ] **Step 4: Lint + commit**

Run: `npx eslint components/modules/live/LiveClient.tsx app/hub/live/page.tsx`
Expected: nessun errore.
```bash
git add components/modules/live/LiveClient.tsx app/hub/live/page.tsx
git commit -m "feat(live): selettore data limitato a oggi…oggi-7" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Pulsante Export Excel nel Live

**Files:**
- Create: `components/modules/live/EsportaExcelButton.tsx`
- Modify: `components/modules/live/LiveClient.tsx`

- [ ] **Step 1: Crea il componente con mini-form Dal/Al**

`components/modules/live/EsportaExcelButton.tsx`:
```tsx
'use client';

import { useState } from 'react';
import type { FiltroStatoLive } from '@/lib/interventi/exportFiltro';

/**
 * Pulsante + popover per esportare gli interventi in Excel su un range Dal/Al
 * libero, rispettando i filtri attivi nel Live (operatore/territorio/stato).
 */
export function EsportaExcelButton({
  defaultData,
  selStaff,
  selTerr,
  filtroStato,
}: {
  defaultData: string;
  selStaff: string | null;
  selTerr: string | null;
  filtroStato: FiltroStatoLive;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultData);
  const [to, setTo] = useState(defaultData);

  const scarica = () => {
    const params = new URLSearchParams({ from, to, stato: filtroStato });
    if (selStaff) params.set('staff', selStaff);
    if (selTerr) params.set('territorio', selTerr);
    window.location.href = `/api/interventi/export?${params.toString()}`;
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-xl border px-3 py-1.5 text-sm font-medium transition hover:border-[var(--brand-primary)]"
        style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
        title="Esporta gli interventi del periodo in Excel (rispetta i filtri attivi)"
      >
        Esporta Excel
      </button>
      {open && (
        <div
          className="absolute right-0 z-20 mt-1 flex flex-col gap-2 rounded-xl border p-3 shadow-lg"
          style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' }}
        >
          <label className="flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
            Dal
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border px-2 py-1 text-sm" style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }} />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
            Al
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border px-2 py-1 text-sm" style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }} />
          </label>
          <button
            type="button"
            onClick={scarica}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold"
            style={{ backgroundColor: 'var(--brand-primary)', color: 'oklch(0.16 0.06 245)' }}
          >
            Scarica
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Monta il pulsante nell'header del Live**

In `components/modules/live/LiveClient.tsx`:
- import in cima: `import { EsportaExcelButton } from './EsportaExcelButton';`
- nell'header, dopo il bottone "Rigenera interventi" (e prima del badge "Live"), inserisci:
```tsx
          <EsportaExcelButton defaultData={data} selStaff={selStaff} selTerr={selTerr} filtroStato={filtroStato} />
```
(`selStaff`, `selTerr`, `filtroStato` sono già stati locali del componente; `filtroStato` ha tipo `'tutti' | 'ok' | 'ko' | 'attesa'`, compatibile con `FiltroStatoLive`.)

- [ ] **Step 3: Lint + commit**

Run: `npx eslint components/modules/live/EsportaExcelButton.tsx components/modules/live/LiveClient.tsx`
Expected: nessun errore.
```bash
git add components/modules/live/EsportaExcelButton.tsx components/modules/live/LiveClient.tsx
git commit -m "feat(live): pulsante Esporta Excel (range Dal/Al + filtri attivi)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## WP5 — Spostamento fisico componenti manuali

### Task 12: Sposta coda/registro in `components/modules/lista-attesa/`

**Files:**
- Rename: `components/modules/torre/{CodaRichiesteManuali,PannelloRevisioneRichiesta,RegistroAutorizzazioni}.tsx` → `components/modules/lista-attesa/`
- Modify: `app/hub/lista-attesa/page.tsx` (import)

- [ ] **Step 1: Verifica che solo la pagina lista-attesa li importi**

Run: `git grep -n "modules/torre/CodaRichiesteManuali\|modules/torre/RegistroAutorizzazioni"`
Expected: solo `app/hub/lista-attesa/page.tsx`. (Il Live non li importa più dopo Task 9.)

- [ ] **Step 2: Sposta i file**

```bash
git mv components/modules/torre/CodaRichiesteManuali.tsx components/modules/lista-attesa/CodaRichiesteManuali.tsx
git mv components/modules/torre/PannelloRevisioneRichiesta.tsx components/modules/lista-attesa/PannelloRevisioneRichiesta.tsx
git mv components/modules/torre/RegistroAutorizzazioni.tsx components/modules/lista-attesa/RegistroAutorizzazioni.tsx
```
(L'import relativo `./PannelloRevisioneRichiesta` dentro `CodaRichiesteManuali.tsx` resta valido; gli altri import sono assoluti `@/...`.)

- [ ] **Step 3: Aggiorna gli import nella pagina**

In `app/hub/lista-attesa/page.tsx`:
```ts
import { CodaRichiesteManuali } from '@/components/modules/lista-attesa/CodaRichiesteManuali';
import { RegistroAutorizzazioni } from '@/components/modules/lista-attesa/RegistroAutorizzazioni';
```

- [ ] **Step 4: Verifica cartella torre svuotata**

Run: `git status --short && ls components/modules/torre 2>/dev/null || echo "cartella torre rimossa"`
Expected: la cartella `components/modules/torre/` non contiene più componenti (Git rimuove le cartelle vuote dopo `git mv`).

- [ ] **Step 5: Lint + commit**

Run: `npx eslint app/hub/lista-attesa/page.tsx components/modules/lista-attesa/CodaRichiesteManuali.tsx components/modules/lista-attesa/RegistroAutorizzazioni.tsx components/modules/lista-attesa/PannelloRevisioneRichiesta.tsx`
Expected: nessun errore.
```bash
git add -A
git commit -m "refactor(lista-attesa): sposta coda/registro/pannello nel modulo dedicato" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## WP6 — Verifica finale

### Task 13: Riferimenti residui, build, smoke test

- [ ] **Step 1: Nessun riferimento orfano a `torre`**

Run: `git grep -n "hub/torre\|modules/torre\|TorreControlloClient\|'torre'" -- '*.ts' '*.tsx'`
Expected: gli unici match ammessi sono lo **stub redirect** `app/hub/torre/page.tsx` e i file di test/spec/plan storici. Nessun import di `components/modules/torre/...` o `@/components/modules/torre`. Se compaiono altri riferimenti runtime, correggili (path → `live`/`lista-attesa`).

- [ ] **Step 2: Test completi verdi**

Run: `npx vitest run lib/interventi/liveWindow.test.ts lib/interventi/exportFiltro.test.ts lib/interventi/exportRows.test.ts lib/interventi/torreView.test.ts`
Expected: tutti PASS.

- [ ] **Step 3: Build di produzione**

Run: `npm run build`
Expected: build completata senza errori; compaiono le rotte `/hub/live`, `/hub/lista-attesa`, `/hub/torre` (redirect), `/api/interventi/export`.

- [ ] **Step 4: Smoke test manuale (checklist)**

- [ ] Menu mostra "Live" e "Lista attesa"; "Torre di controllo" non c'è più.
- [ ] `/hub/torre` redirige a `/hub/live`.
- [ ] Nel Live il selettore data non va oltre 7 giorni indietro né nel futuro; aprendo `/hub/live?data=<15 giorni fa>` si vede oggi.
- [ ] "Esporta Excel": Dal/Al scarica un `.xlsx` coerente coi filtri (operatore/territorio/stato) attivi.
- [ ] Campanello in topbar apre `/hub/lista-attesa`; coda (Prendi/Approva/Rifiuta) e Registro funzionano lì.
- [ ] Approvando un ordine manuale di oggi, l'intervento compare nel Live.

- [ ] **Step 5: Commit finale eventuale**

Se lo Step 1 ha richiesto correzioni:
```bash
git add -A
git commit -m "fix(live): pulizia riferimenti residui torre" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Note di esecuzione

- **Ordine WP**: rispettare WP1→WP6. La coda ordini resta sempre raggiungibile (in WP3 è duplicata tra torre e lista-attesa; in WP4 il Live la perde; in WP5 si consolida in lista-attesa).
- **Gate per task**: test verdi (dove presenti) + `npx eslint` pulito sui file toccati. Build completa solo in WP6.
- **Niente DB**: nessuna migrazione; i permessi admin sono gestiti d'ufficio da `normalizeAllowedModules`.
- **A fine feature** (dopo approvazione): merge fast-forward in `main` + push + eliminazione branch, secondo il metodo del progetto.
