# Assegnazione AI — Fase 1 (lettura + tabella) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans. Gli step usano checkbox (`- [ ]`).

**Goal:** L'agente legge dal file ZAGAROLO le righe di un giorno scelto (data + esecutore + esito vuoto) e le carica nell'app; un nuovo modulo `/hub/assegnazione-ai` le mostra in una tabella con checkbox. (La creazione di piano/interventi/rapportini è la **Fase 2**, fuori da questo piano.)

**Architecture:** Riusa l'infrastruttura agente (tick a chiave condivisa, flag one-shot come `forza_scan`). Niente scrittura sul file: solo lettura. Logica di filtro **pura** nell'agente (testabile). Modulo = pagina server (gate admin) + client con tabella e indicatore "in attesa". Spec: `docs/superpowers/specs/2026-06-18-assegnazione-ai-design.md`.

**Tech Stack:** Next.js 15 (route `runtime='nodejs'`), Supabase (`supabaseAdmin`), TypeScript, Vitest; agente Node ESM (`tools/limitazioni-sync`, exceljs). Worktree: `C:/Users/Edgardo/Desktop/gp-assegnazione-ai`, branch `feat/assegnazione-ai`.

## Global Constraints
- **Gate mirati**: baseline repo lint/test già rossa → per ogni file del WP: `npx tsc --noEmit` senza NUOVI errori, `npx eslint <file>` pulito, `node --check` sull'agente, `npx vitest run <file>` per i test aggiunti.
- **Push a main** solo con OK esplicito dell'utente, via refspec `git push origin feat/assegnazione-ai:main`. Migration **la lancia l'utente**.
- **Sessione concorrente attiva**: lavorare SOLO nel worktree; `git fetch` + verifica FF prima di ogni push.
- **Italiano** in UI e messaggi.
- L'agente è **solo lettore** in questo flusso: NON apre in scrittura, NON tocca `forza_giro`/`forza_scan`/esiti.

---

### Task 1: Migration — tabelle pianificabili + config per-file + flag data

**Files:**
- Create: `supabase/migrations/20260618000000_assegnazione_ai.sql`

- [ ] **Step 1: Scrivi la migration**

```sql
-- Assegnazione AI: righe lette dall'agente (set volatile per file+data) + config per-file + flag lettura
create table if not exists agente_pianificabili (
  id uuid primary key default gen_random_uuid(),
  file text not null,
  riga int not null,
  odl text,
  matricola text,
  indirizzo text,
  comune text,
  data date not null,
  esecutore text,
  scansionato_il timestamptz not null default now()
);
create index if not exists agente_pianificabili_file_data_idx on agente_pianificabili (file, data);

create table if not exists agente_file_config (
  file text primary key,
  committente text not null default 'acea',
  attivita text not null,
  template_id uuid,
  updated_at timestamptz not null default now()
);

-- flag one-shot: il giorno che l'agente deve leggere (null = nessuna richiesta)
alter table agente_config add column if not exists pianifica_data date;

-- seed ZAGAROLO (template_id da impostare dall'utente con l'id del "Rapportino limitazioni massive")
insert into agente_file_config (file, committente, attivita, template_id)
values ('ZAGAROLO.xlsx', 'acea', 'LIMITAZIONI MASSIVE', null)
on conflict (file) do nothing;
```

- [ ] **Step 2: Commit** (la esegue l'utente su prod nel Task finale)

```bash
git -C "C:/Users/Edgardo/Desktop/gp-assegnazione-ai" add supabase/migrations/20260618000000_assegnazione_ai.sql
git -C "C:/Users/Edgardo/Desktop/gp-assegnazione-ai" commit -m "feat(assegnazione-ai): migration pianificabili + file_config + pianifica_data"
```

---

### Task 2: Registra il modulo `assegnazione-ai`

**Files:**
- Modify: `lib/moduleAccess.ts`
- Test: `lib/__tests__/moduleAccess.assegnazione-ai.test.ts`

**Interfaces:**
- Produces: chiave modulo `'assegnazione-ai'` in `AppModuleKey`, voce in `APP_MODULES` (`adminOnly: true`, NON `requiresAdminRole`).

- [ ] **Step 1: Scrivi il test**

```ts
import { describe, it, expect } from 'vitest';
import { APP_MODULES, ALL_MODULE_KEYS, DEFAULT_ALLOWED_MODULES, findModuleByPath } from '@/lib/moduleAccess';

describe('modulo assegnazione-ai', () => {
  it('registrato con i flag corretti', () => {
    const m = APP_MODULES.find((x) => x.key === 'assegnazione-ai');
    expect(m).toBeDefined();
    expect(m?.href).toBe('/hub/assegnazione-ai');
    expect(m?.adminOnly).toBe(true);
    expect(m?.requiresAdminRole).toBeFalsy();
    expect(m?.matchPrefixes).toContain('/hub/assegnazione-ai');
  });
  it('in ALL_MODULE_KEYS, non nei default operatore', () => {
    expect(ALL_MODULE_KEYS).toContain('assegnazione-ai');
    expect(DEFAULT_ALLOWED_MODULES).not.toContain('assegnazione-ai');
  });
  it('findModuleByPath riconosce la rotta', () => {
    expect(findModuleByPath('/hub/assegnazione-ai')?.key).toBe('assegnazione-ai');
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run lib/__tests__/moduleAccess.assegnazione-ai.test.ts`

- [ ] **Step 3: Implementa**

In `lib/moduleAccess.ts`: aggiungi `'assegnazione-ai'` all'union `AppModuleKey` (dopo `'agente'`), e in `APP_MODULES` (dopo la voce `agente`, prima di `impostazioni`):
```ts
  {
    key: 'assegnazione-ai',
    href: '/hub/assegnazione-ai',
    label: 'Assegnazione AI',
    description: 'Pianificazione assistita dagli interventi letti dal file',
    section: 'modules',
    matchPrefixes: ['/hub/assegnazione-ai'],
    adminOnly: true,
  },
```

- [ ] **Step 4: Run → PASS** — `npx vitest run lib/__tests__/moduleAccess.assegnazione-ai.test.ts` + `npx tsc --noEmit` (0 nuovi errori)

- [ ] **Step 5: Commit**

```bash
git -C "<worktree>" add lib/moduleAccess.ts lib/__tests__/moduleAccess.assegnazione-ai.test.ts
git -C "<worktree>" commit -m "feat(assegnazione-ai): registra il modulo in moduleAccess"
```
(`<worktree>` = `C:/Users/Edgardo/Desktop/gp-assegnazione-ai` in tutti i Task seguenti.)

---

### Task 3: Filtro puro `estraiPianificabili` (agente, mjs)

**Files:**
- Create: `tools/limitazioni-sync/lib/pianificabili.mjs`
- Test: `tools/limitazioni-sync/lib/pianificabili.test.ts`

**Interfaces:**
- Consumes: `giornoDa` da `./dataCella.mjs` (normalizza una cella data → 'YYYY-MM-DD' | '').
- Produces: `estraiPianificabili(righe, dataTarget) -> Array<{riga,odl,matricola,indirizzo,comune,data,esecutore}>` dove `righe` = `Array<{riga:number, odl, matricola, indirizzo, comune, esecutore, dataRaw, esitoRaw}>`.

- [ ] **Step 1: Scrivi il test**

```ts
import { describe, it, expect } from 'vitest';
import { estraiPianificabili } from './pianificabili.mjs';

const base = (over: Record<string, unknown> = {}) => ({
  riga: 2, odl: '912', matricola: 'M1', indirizzo: 'VIA X', comune: 'ZAGAROLO',
  esecutore: 'CIARALLO', dataRaw: '2026-06-19', esitoRaw: '', ...over,
});

describe('estraiPianificabili', () => {
  it('tiene solo data==target + esecutore presente + esito vuoto', () => {
    const out = estraiPianificabili([
      base(),
      base({ riga: 3, dataRaw: '2026-06-20' }),            // altra data
      base({ riga: 4, esecutore: '' }),                    // senza esecutore
      base({ riga: 5, esitoRaw: 'eseguito' }),             // già lavorata
    ], '2026-06-19');
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ riga: 2, odl: '912', matricola: 'M1', indirizzo: 'VIA X', comune: 'ZAGAROLO', data: '2026-06-19', esecutore: 'CIARALLO' });
  });
  it('normalizza la data via giornoDa (accetta Date/locale)', () => {
    const out = estraiPianificabili([base({ dataRaw: new Date('2026-06-19T00:00:00') })], '2026-06-19');
    expect(out).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tools/limitazioni-sync/lib/pianificabili.test.ts`

- [ ] **Step 3: Implementa**

```js
// tools/limitazioni-sync/lib/pianificabili.mjs
// PURE: filtra le righe del file "pianificabili" (data target + esecutore presente + esito vuoto).
import { giornoDa } from './dataCella.mjs';

const t = (v) => String(v ?? '').trim();

export function estraiPianificabili(righe, dataTarget) {
  const target = giornoDa(dataTarget) || t(dataTarget);
  const out = [];
  for (const r of righe ?? []) {
    const data = giornoDa(r.dataRaw);
    if (!data || data !== target) continue;
    if (!t(r.esecutore)) continue;
    if (t(r.esitoRaw)) continue;
    out.push({
      riga: r.riga,
      odl: t(r.odl), matricola: t(r.matricola), indirizzo: t(r.indirizzo),
      comune: t(r.comune), data, esecutore: t(r.esecutore),
    });
  }
  return out;
}
```

- [ ] **Step 4: Run → PASS** — `npx vitest run tools/limitazioni-sync/lib/pianificabili.test.ts` + `node --check tools/limitazioni-sync/lib/pianificabili.mjs`

- [ ] **Step 5: Commit**

```bash
git -C "<worktree>" add tools/limitazioni-sync/lib/pianificabili.mjs tools/limitazioni-sync/lib/pianificabili.test.ts
git -C "<worktree>" commit -m "feat(assegnazione-ai): filtro puro estraiPianificabili (agente)"
```

---

### Task 4: Endpoint `POST /api/agente/pianificabili` (riceve dall'agente)

**Files:**
- Create: `app/api/agente/pianificabili/route.ts`

**Interfaces:**
- Consumes: `chiaveValida` da `@/lib/apiExportKey`; `supabaseAdmin`.
- Body: `{ file: string, data: string, righe: Array<{riga,odl,matricola,indirizzo,comune,data,esecutore}> }`.
- Effetto: cancella le righe `agente_pianificabili` per quel `(file, data)`, inserisce le nuove, azzera `agente_config.pianifica_data`.

- [ ] **Step 1: Implementa** (route nodejs, key-gated — niente unit test; gate tsc/eslint)

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveValida } from '@/lib/apiExportKey';

export const runtime = 'nodejs';

type RigaIn = { riga?: number; odl?: string; matricola?: string; indirizzo?: string; comune?: string; data?: string; esecutore?: string };

export async function POST(req: Request) {
  if (!chiaveValida(req)) return NextResponse.json({ error: 'Chiave non valida.' }, { status: 401 });
  let body: { file?: string; data?: string; righe?: RigaIn[] } = {};
  try { body = (await req.json()) as typeof body; } catch { body = {}; }

  const file = String(body.file ?? '').trim();
  const data = String(body.data ?? '').trim();
  if (!file || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: 'file/data obbligatori (data YYYY-MM-DD).' }, { status: 400 });
  }
  const righe = Array.isArray(body.righe) ? body.righe : [];

  try {
    // rimpiazza il set per (file, data)
    await supabaseAdmin.from('agente_pianificabili').delete().eq('file', file).eq('data', data);
    if (righe.length > 0) {
      const rows = righe.map((r) => ({
        file, data,
        riga: Number(r.riga ?? 0),
        odl: r.odl ?? null, matricola: r.matricola ?? null, indirizzo: r.indirizzo ?? null,
        comune: r.comune ?? null, esecutore: r.esecutore ?? null,
        scansionato_il: new Date().toISOString(),
      }));
      const { error } = await supabaseAdmin.from('agente_pianificabili').insert(rows);
      if (error) throw error;
    }
    // one-shot: la richiesta di lettura è soddisfatta
    await supabaseAdmin.from('agente_config').update({ pianifica_data: null }).eq('id', 1);
    return NextResponse.json({ ok: true, n: righe.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore pianificabili.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Gate** — `npx tsc --noEmit` (0 nuovi errori); `npx eslint app/api/agente/pianificabili/route.ts`

- [ ] **Step 3: Commit**

```bash
git -C "<worktree>" add app/api/agente/pianificabili/route.ts
git -C "<worktree>" commit -m "feat(assegnazione-ai): endpoint /api/agente/pianificabili (riceve + azzera flag)"
```

---

### Task 5: Tick ritorna `pianificaData`

**Files:**
- Modify: `app/api/agente/tick/route.ts`

**Interfaces:**
- Produces: nella response del tick il campo `pianificaData: string | null` (= `agente_config.pianifica_data`).

- [ ] **Step 1: Carica e ritorna il campo**

- Nel tipo `ConfigRow` aggiungi `pianifica_data: string | null;`.
- Nella `.select(...)` di `agente_config` aggiungi `, pianifica_data` alla lista colonne.
- Nell'oggetto della response (dopo `forzaScan: config.forza_scan === true,`) aggiungi:
```ts
        pianificaData: config.pianifica_data ?? null,
```

- [ ] **Step 2: Gate** — `npx tsc --noEmit`; `npx eslint app/api/agente/tick/route.ts`

- [ ] **Step 3: Commit**

```bash
git -C "<worktree>" add app/api/agente/tick/route.ts
git -C "<worktree>" commit -m "feat(assegnazione-ai): tick ritorna pianificaData"
```

---

### Task 6: Agente — modalità lettura pianificabili

**Files:**
- Modify: `tools/limitazioni-sync/agente.mjs`
- Modify: `tools/limitazioni-sync/lib/apiAgente.mjs`

**Interfaces:**
- Consumes: `estraiPianificabili` (Task 3); `tick` ritorna `pianificaData` (Task 5); `rilevaColonne`/`risolviColonna` (già presenti), `caricaWorkbook`/`trovaRigaIntestazione` (già in `excelIO.mjs`).
- Produces: in `apiAgente.mjs` `inviaPianificabili({baseUrl, exportKey, file, data, righe})` → POST `/api/agente/pianificabili`.

- [ ] **Step 1: Client HTTP**

In `tools/limitazioni-sync/lib/apiAgente.mjs`, accanto a `inviaReport`, aggiungi:
```js
/** POST /api/agente/pianificabili con le righe lette per un giorno. */
export function inviaPianificabili({ baseUrl, exportKey, file, data, righe }, fetchImpl = fetch) {
  return postJson(`${baseUrl}/api/agente/pianificabili`, exportKey, { file, data, righe }, fetchImpl);
}
```

- [ ] **Step 2: Funzione di lettura nell'agente**

In `tools/limitazioni-sync/agente.mjs`:
- import in cima: `import { estraiPianificabili } from './lib/pianificabili.mjs';` e aggiungi `inviaPianificabili` all'import esistente da `./lib/apiAgente.mjs`.
- aggiungi una funzione che, dato `cartella` e `dataTarget`, apre ogni file master, estrae le righe grezze e applica `estraiPianificabili`, poi invia:
```js
/** Legge dai file master le righe pianificabili del giorno e le invia all'app (no scrittura). */
async function leggiPianificabili({ baseUrl, exportKey, cartella, dataTarget }) {
  if (!fs.existsSync(cartella)) return;
  const files = fs.readdirSync(cartella)
    .filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
    .map((f) => path.join(cartella, f));
  for (const file of files) {
    try {
      const wb = await caricaWorkbook(file);
      const ws = wb.worksheets[0];
      const rIntest = trovaRigaIntestazione(ws);
      if (rIntest < 0) continue; // non master
      const header = (ws.getRow(rIntest).values || []).slice(1);
      const col = rilevaColonne(header); // {odl,matricola,via,comune,esecutore,data,esito}
      const grezze = [];
      for (let r = rIntest + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const cell = (i) => (i != null ? row.getCell(i + 1).value : null);
        grezze.push({
          riga: r,
          odl: cell(col.odl), matricola: cell(col.matricola),
          indirizzo: cell(col.via), comune: cell(col.comune), esecutore: cell(col.esecutore),
          dataRaw: cell(col.data), esitoRaw: cell(col.esito),
        });
      }
      const righe = estraiPianificabili(grezze, dataTarget);
      await inviaPianificabili({ baseUrl, exportKey, file: path.basename(file), data: dataTarget, righe });
      console.log(`[lim-sync] pianificabili ${path.basename(file)} ${dataTarget}: ${righe.length} righe.`);
    } catch (e) {
      console.error(`[lim-sync] leggiPianificabili ${path.basename(file)} fallito: ${e instanceof Error ? e.message : e}`);
    }
  }
}
```

- [ ] **Step 3: Aggancia in `main()` dopo il tick**

In `main()`, dopo il blocco re-scan (`if (ris.forzaScan && !scanNeeded) { ... }`) e prima di `const { eseguiOra, ... } = ris;`, aggiungi:
```js
  // Lettura "Assegnazione AI": l'app chiede di leggere un giorno specifico (one-shot).
  if (ris.pianificaData) {
    await leggiPianificabili({ baseUrl, exportKey: cfg.exportKey, cartella: cfg.cartella, dataTarget: ris.pianificaData });
  }
```
(È in più del tick normale; NON tocca scrittura/giro.)

- [ ] **Step 4: Gate + Commit** — `node --check tools/limitazioni-sync/agente.mjs`; `npx vitest run tools/limitazioni-sync/` (suite esistente verde)

```bash
git -C "<worktree>" add tools/limitazioni-sync/agente.mjs tools/limitazioni-sync/lib/apiAgente.mjs
git -C "<worktree>" commit -m "feat(lim-sync): lettura pianificabili del giorno + invio all'app (read-only)"
```

---

### Task 7: Endpoint admin `POST /api/admin/agente/leggi-pianificabili` (arma la lettura)

**Files:**
- Create: `app/api/admin/agente/leggi-pianificabili/route.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `supabaseAdmin`.
- Body: `{ data: string }` (YYYY-MM-DD) → setta `agente_config.pianifica_data = data`. Ritorna `{ ok: true }`.

- [ ] **Step 1: Implementa**

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  let body: { data?: string } = {};
  try { body = (await req.json()) as typeof body; } catch { body = {}; }
  const data = String(body.data ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: 'data obbligatoria (YYYY-MM-DD).' }, { status: 400 });
  }
  const { error } = await supabaseAdmin
    .from('agente_config')
    .update({ pianifica_data: data, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Gate + Commit** — `npx tsc --noEmit`; `npx eslint app/api/admin/agente/leggi-pianificabili/route.ts`

```bash
git -C "<worktree>" add app/api/admin/agente/leggi-pianificabili/route.ts
git -C "<worktree>" commit -m "feat(assegnazione-ai): endpoint admin leggi-pianificabili (arma il giorno)"
```

---

### Task 8: Modulo `/hub/assegnazione-ai` — pagina + client (tabella + checkbox)

**Files:**
- Create: `app/hub/assegnazione-ai/page.tsx`
- Create: `components/modules/assegnazione-ai/AssegnazioneAiClient.tsx`

**Interfaces:**
- Consumes: `requireUserRole`-style gate come `app/hub/agente/page.tsx`; `supabaseAdmin`; endpoint `leggi-pianificabili` (Task 7); tabella `agente_pianificabili` + `agente_file_config` + `agente_config.pianifica_data`.

- [ ] **Step 1: Pagina server (gate admin + fetch)**

`app/hub/assegnazione-ai/page.tsx` — modello da `app/hub/agente/page.tsx`:
```tsx
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import AssegnazioneAiClient from '@/components/modules/assegnazione-ai/AssegnazioneAiClient';

export const dynamic = 'force-dynamic';

export default async function AssegnazioneAiPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  const allowedModules = getAllowedModulesForUser(user.app_metadata, role);
  if (role !== 'admin' || !allowedModules.includes('assegnazione-ai')) redirect('/hub');

  const [{ data: cfg }, { data: righe }, { data: fileCfg }] = await Promise.all([
    supabaseAdmin.from('agente_config').select('pianifica_data').eq('id', 1).maybeSingle(),
    supabaseAdmin.from('agente_pianificabili').select('*').order('comune', { ascending: true }).order('riga', { ascending: true }),
    supabaseAdmin.from('agente_file_config').select('*'),
  ]);

  return (
    <AssegnazioneAiClient
      righe={(righe ?? []) as RigaPianificabile[]}
      fileConfig={(fileCfg ?? []) as FileConfig[]}
      pianificaData={(cfg as { pianifica_data?: string | null } | null)?.pianifica_data ?? null}
    />
  );
}

export type RigaPianificabile = { id: string; file: string; riga: number; odl: string | null; matricola: string | null; indirizzo: string | null; comune: string | null; data: string; esecutore: string | null; scansionato_il: string };
export type FileConfig = { file: string; committente: string; attivita: string; template_id: string | null };
```

- [ ] **Step 2: Client (date-picker + Leggi + tabella + checkbox + in attesa)**

`components/modules/assegnazione-ai/AssegnazioneAiClient.tsx` (`'use client'`):
- Stato: `data` (string del date-picker, default oggi+1), `selezione` (Set<string> di id, inizializzata con tutti gli id), `arming` (bool), `msg` (string|null).
- `useRouter` per `router.refresh()`.
- Mappa `fileConfig` per file → `{committente, attivita}` per le colonne "gruppo attività" e "committente".
- Funzione `leggi()`: `POST /api/admin/agente/leggi-pianificabili {data}` → su ok, `msg='In attesa: l'agente legge il giorno al prossimo contatto (entro 1 min)'` + `router.refresh()`.
- Render:
  - barra: `<input type="date">` legato a `data` + pulsante **"Leggi dal file"** (disabilitato durante `arming`); se `pianificaData` valorizzato → riquadro **"⏳ In attesa di lettura per il giorno {pianificaData}"** + pulsante **"↻ Aggiorna"** (`router.refresh()`).
  - tabella delle `righe`: header `☑ | File | Riga | ODL | Matricola | Indirizzo | Comune | Data | Esecutore | Gruppo attività | Committente`. Checkbox header = seleziona/deseleziona tutto. Per riga: checkbox legata a `selezione`; gruppo attività/committente da `fileConfig[riga.file]`.
  - pulsante **"Procedi"** (selezione.size righe): **per ora disabilitato** con tooltip "Disponibile nella Fase 2" (la creazione è la Fase 2). Mostra il conteggio selezionati.
- Usa le CSS var del progetto (`--brand-*`) e lo stile delle altre card (`rounded-2xl border p-5`).

> Nota: la logica di selezione/deselezione e il raggruppamento sono semplici stati React; nessun test unit dedicato (componente client). Gate: `tsc` + `eslint`.

- [ ] **Step 3: Gate** — `npx tsc --noEmit` (0 nuovi errori); `npx eslint app/hub/assegnazione-ai/page.tsx components/modules/assegnazione-ai/AssegnazioneAiClient.tsx`

- [ ] **Step 4: Commit**

```bash
git -C "<worktree>" add app/hub/assegnazione-ai/page.tsx components/modules/assegnazione-ai/AssegnazioneAiClient.tsx
git -C "<worktree>" commit -m "feat(assegnazione-ai): modulo /hub/assegnazione-ai (tabella pianificabili + checkbox + Leggi)"
```

---

### Task 9 — Deploy Fase 1 (manuale)

- [ ] **Step 1:** Suite mirata verde: `npx vitest run lib/__tests__/moduleAccess.assegnazione-ai.test.ts tools/limitazioni-sync/`; `npx tsc --noEmit` 0 nuovi errori.
- [ ] **Step 2:** `git -C "<worktree>" fetch origin` + verifica FF (`git -C "<worktree>" merge-base --is-ancestor origin/main HEAD`). Se NON-FF: `git -C "<worktree>" rebase origin/main`.
- [ ] **Step 3:** Lancia la migration `20260618000000_assegnazione_ai.sql` su prod (utente) + imposta `agente_file_config.template_id` di ZAGAROLO con l'id del "Rapportino limitazioni massive".
- [ ] **Step 4:** Con OK utente: `git push origin feat/assegnazione-ai:main` → Vercel.
- [ ] **Step 5:** Ricopia sul PC `tools/limitazioni-sync/agente.mjs` + `tools/limitazioni-sync/lib/{pianificabili,apiAgente}.mjs` (i file agente cambiati); abilita il modulo **Assegnazione AI** in Utenze.
- [ ] **Step 6:** Smoke: nel modulo scegli un giorno → "Leggi dal file" → entro ~1 min la tabella si popola con le righe di quel giorno.

---

## Self-Review
- Spec coverage Fase 1: modulo (T2,T8) · agente lettura (T3,T6) · endpoint pianificabili (T4) · tick pianificaData (T5) · arma lettura (T7) · dati (T1). ✅
- Fuori da Fase 1 (→ Fase 2): endpoint `assegna`, mappatura esecutore→staff, creazione piano/interventi/rapportini, "Procedi" attivo. ✅
- Niente placeholder: codice completo in ogni step; `<worktree>` definito in T2. ✅
- Tipi coerenti: `estraiPianificabili` (T3) ↔ body `/api/agente/pianificabili` (T4) ↔ `inviaPianificabili` (T6) ↔ `RigaPianificabile` (T8). ✅
- Read-only: l'agente non scrive il file; lettura agganciata dopo il tick, indipendente da giro/scan. ✅
