# Agente — "Esegui ora" + campo saracinesca — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Aggiungere al modulo Agente un pulsante "Esegui ora" (giro forzato) e un campo `saracinesca` mappabile (dato per riga = coalesce di `sostituzione_valvola`/`sost_valvola` dalle risposte voce).

**Architecture:** Riusa l'infrastruttura esistente. Saracinesca = aggiunta **additiva** all'export (come `sigillo`) + voce in `CAMPI_MAPPABILI` (compare da sé nell'editor). Esegui ora = colonna `forza_giro` + endpoint admin + OR nel tick (one-shot) + pulsante UI. Spec: `docs/superpowers/specs/2026-06-17-agente-esegui-ora-saracinesca-design.md`.

**Tech Stack:** Next.js (route nodejs), Supabase (`supabaseAdmin`), TypeScript, Vitest; agente Node ESM. Gate **mirati** (`npx vitest run <file>`, `npx tsc --noEmit` senza nuovi errori, `npx eslint <file>`, `node --check`). Baseline repo lint/test già rossa.

---

## PART 1 — Campo saracinesca

### Task 1: `buildRigaLimMassive` additivo con `saracinesca`

**Files:**
- Modify: `lib/limitazione/exportLimMassive.ts`
- Test: `lib/limitazione/exportLimMassive.test.ts`

- [ ] **Step 1: Aggiorna il test (additivo)**

In `lib/limitazione/exportLimMassive.test.ts`: l'oggetto `base` (tipo `RigaDb`) ora deve includere `saracinesca`; aggiorna anche le asserzioni `toEqual` che elencano i campi attesi (aggiungi `saracinesca`). Aggiungi inoltre il caso non-vuoto:
```ts
// nel base RigaDb aggiungi:  saracinesca: 'SI',
// nelle toEqual delle righe attese aggiungi:  saracinesca: 'SI',
it('saracinesca: passa il valore trimmato', () => {
  expect(buildRigaLimMassive({ ...base, saracinesca: '  NO  ' }).saracinesca).toBe('NO');
  expect(buildRigaLimMassive({ ...base, saracinesca: null }).saracinesca).toBe('');
});
```

- [ ] **Step 2: Run test → FAIL** (`saracinesca` non esiste sul tipo)

Run: `npx vitest run lib/limitazione/exportLimMassive.test.ts`
Expected: FAIL di tipo / proprietà mancante.

- [ ] **Step 3: Implementa (additivo)**

In `lib/limitazione/exportLimMassive.ts`:
- in `RigaLimMassive` aggiungi `saracinesca: string;` (dopo `nominativo`);
- in `RigaDb` aggiungi `saracinesca: string | null;` (dopo `nominativo`);
- in `buildRigaLimMassive` aggiungi `saracinesca: t(r.saracinesca),` (dopo `nominativo: t(r.nominativo),`).

- [ ] **Step 4: Run test → PASS**

Run: `npx vitest run lib/limitazione/exportLimMassive.test.ts`
Expected: PASS (tutti, inclusi gli 8+ esistenti).

- [ ] **Step 5: Commit**

```bash
git add lib/limitazione/exportLimMassive.ts lib/limitazione/exportLimMassive.test.ts
git commit -m "feat(lim-export): campo saracinesca additivo in buildRigaLimMassive"
```

---

### Task 2: export route — estrai `saracinesca` (coalesce) dalle risposte

**Files:**
- Modify: `app/api/export/limitazioni-massive/route.ts`

> Nessun unit test sulle route: gate `tsc` + `eslint`.

- [ ] **Step 1: Estrai la saracinesca nel loop voci**

Nel blocco "mappa intervento_id → sigillo" (dove c'è `sigilloById`), aggiungi una mappa gemella `saracinescaById` e popolala nello stesso loop. Dopo la riga che fa `const sigilloById = new Map<string, string>();` aggiungi:
```ts
    const saracinescaById = new Map<string, string>();
```
Dentro il `for (const v of ...)` (dopo il blocco `sig`), aggiungi:
```ts
        // saracinesca: primo non vuoto tra sostituzione_valvola e sost_valvola (due template)
        const sar =
          v.risposte && typeof v.risposte['sostituzione_valvola'] === 'string' && (v.risposte['sostituzione_valvola'] as string).trim()
            ? (v.risposte['sostituzione_valvola'] as string)
            : v.risposte && typeof v.risposte['sost_valvola'] === 'string'
              ? (v.risposte['sost_valvola'] as string)
              : '';
        if (sar && !saracinescaById.has(v.intervento_id)) saracinescaById.set(v.intervento_id, sar);
```

- [ ] **Step 2: Passa `saracinesca` a buildRigaLimMassive**

Nel `buildRigaLimMassive({ ... } satisfies RigaDb)`, aggiungi dopo `nominativo: i.nominativo,`:
```ts
        saracinesca: saracinescaById.get(i.id) ?? null,
```

- [ ] **Step 3: Gate**

Run: `npx tsc --noEmit` → nessun nuovo errore sul file.
Run: `npx eslint app/api/export/limitazioni-massive/route.ts` → pulito.

- [ ] **Step 4: Commit**

```bash
git add app/api/export/limitazioni-massive/route.ts
git commit -m "feat(lim-export): route espone saracinesca (coalesce sostituzione_valvola/sost_valvola)"
```

---

### Task 3: `saracinesca` in `CAMPI_MAPPABILI`

**Files:**
- Modify: `lib/agente/decisione.ts`
- Test: `lib/agente/decisione.test.ts` + (eventuale) `components/modules/agente/__tests__/colonneView.test.ts`

- [ ] **Step 1: Aggiungi il campo**

In `lib/agente/decisione.ts`, nell'array `CAMPI_MAPPABILI`, aggiungi `'saracinesca'` (es. in coda prima di `'marcatore'`):
```ts
export const CAMPI_MAPPABILI = [
  'esecutore', 'data', 'esito', 'sigillo', 'matricola',
  'via', 'pdr', 'nominativo', 'comune', 'saracinesca', 'marcatore',
] as const;
```

- [ ] **Step 2: Aggiorna i test che dipendono dalla lista**

Esegui prima `npx vitest run lib/agente/ components/modules/agente/` e guarda quali test si rompono per il nuovo campo (es. `validaMappatura` accetta `saracinesca`; un test di `mappaturaCompleta` che conta i campi = `CAMPI_MAPPABILI.length`). Aggiorna i conteggi/asserzioni di conseguenza e aggiungi:
```ts
// in decisione.test.ts, dentro validaMappatura:
it('accetta una regola saracinesca', () => {
  const r = validaMappatura([{ campo: 'saracinesca', colonna: 'saracinesca', abilitato: true }]);
  expect(r.ok).toBe(true);
});
```

- [ ] **Step 3: Run → PASS**

Run: `npx vitest run lib/agente/ components/modules/agente/`
Expected: tutti PASS (con i conteggi aggiornati).

- [ ] **Step 4: Gate + Commit**

Run: `npx tsc --noEmit` → nessun nuovo errore.

```bash
git add lib/agente/decisione.ts lib/agente/decisione.test.ts components/modules/agente/__tests__/colonneView.test.ts
git commit -m "feat(agente): saracinesca tra i campi mappabili"
```

---

### Task 4: agente `eseguiGiro` scrive `saracinesca`

**Files:**
- Modify: `tools/limitazioni-sync/agente.mjs`
- Test: `tools/limitazioni-sync/agente.test.ts`

- [ ] **Step 1: Aggiungi il case in `valoreCampo`**

In `tools/limitazioni-sync/agente.mjs`, nella funzione `valoreCampo(l, campo)`, aggiungi tra gli altri case:
```js
    case 'saracinesca': return l.saracinesca;
```

- [ ] **Step 2: Estendi l'e2e**

In `tools/limitazioni-sync/agente.test.ts`: nella fixture aggiungi una colonna "saracinesca" all'intestazione e una regola `{ campo:'saracinesca', colonna:'saracinesca', abilitato:true }` alla `mappatura` passata a `eseguiGiro`; dai al lavoro pianificato `saracinesca: 'NO'`; asserisci che la cella saracinesca della riga lavorata valga `'NO'`. (Mantieni gli assert esistenti.)

- [ ] **Step 3: Run → PASS**

Run: `npx vitest run tools/limitazioni-sync/` → tutti PASS.
Run: `node --check tools/limitazioni-sync/agente.mjs` → ok.

- [ ] **Step 4: Commit**

```bash
git add tools/limitazioni-sync/agente.mjs tools/limitazioni-sync/agente.test.ts
git commit -m "feat(lim-sync): scrittura campo saracinesca guidata dalla mappa"
```

---

## PART 2 — "Esegui ora"

### Task 5: migration `forza_giro`

**Files:**
- Create: `supabase/migrations/20260617000000_agente_forza_giro.sql`

- [ ] **Step 1: Scrivi la migration**

```sql
-- Agente: flag one-shot per forzare un giro dal modulo ("Esegui ora")
alter table agente_config add column if not exists forza_giro boolean not null default false;
```

- [ ] **Step 2: Commit** (la esegue l'utente su prod nel Task finale)

```bash
git add supabase/migrations/20260617000000_agente_forza_giro.sql
git commit -m "feat(agente): migration forza_giro"
```

---

### Task 6: tick — `eseguiOra = forza_giro || decisione`, one-shot

**Files:**
- Modify: `app/api/agente/tick/route.ts`

- [ ] **Step 1: Carica `forza_giro`**

- Nel tipo `ConfigRow` aggiungi `forza_giro: boolean;`.
- Nella `.select(...)` di `agente_config` aggiungi `, forza_giro` alla lista colonne.

- [ ] **Step 2: OR + azzeramento one-shot**

Sostituisci il blocco decisione + rivendica (sezioni "4) decisione" e "5) rivendica") con:
```ts
    // 4) decisione (fuso Europe/Rome) + forzatura "Esegui ora"
    const parti = partiRoma(now);
    const forzato = config.forza_giro === true;
    const eseguiOra =
      forzato ||
      decideEsecuzione({
        enabled: config.enabled,
        giorni: config.giorni ?? [],
        ora: config.ora ?? '21:00',
        weekday: parti.weekday,
        oraCorrente: parti.oraCorrente,
        oggi: parti.oggi,
        ultimaRivendicazione: config.ultima_rivendicazione_giorno,
      });

    // 5) se si esegue: rivendica il giorno e (se forzato) azzera il flag one-shot
    if (eseguiOra) {
      const patch: Record<string, unknown> = { ultima_rivendicazione_giorno: parti.oggi };
      if (forzato) patch.forza_giro = false;
      const { error: claimErr } = await supabaseAdmin
        .from('agente_config')
        .update(patch)
        .eq('id', 1);
      if (claimErr) throw claimErr;
    }
```

- [ ] **Step 3: Gate**

Run: `npx tsc --noEmit` → nessun nuovo errore.
Run: `npx eslint app/api/agente/tick/route.ts` → pulito.

- [ ] **Step 4: Commit**

```bash
git add app/api/agente/tick/route.ts
git commit -m "feat(agente): tick onora forza_giro (esegui ora) one-shot"
```

---

### Task 7: endpoint `POST /api/admin/agente/esegui-ora`

**Files:**
- Create: `app/api/admin/agente/esegui-ora/route.ts`

- [ ] **Step 1: Implementa**

```ts
// app/api/admin/agente/esegui-ora/route.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { error } = await supabaseAdmin
    .from('agente_config')
    .update({ forza_giro: true, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Gate + Commit**

Run: `npx tsc --noEmit` → nessun nuovo errore. Run: `npx eslint app/api/admin/agente/esegui-ora/route.ts` → pulito.

```bash
git add app/api/admin/agente/esegui-ora/route.ts
git commit -m "feat(agente): POST /api/admin/agente/esegui-ora (arma il giro)"
```

---

### Task 8: pulsante "Esegui ora" nella card Stato

**Files:**
- Modify: `components/modules/agente/AgenteClient.tsx`

- [ ] **Step 1: Stato locale + handler**

Dentro `AgenteClient`, accanto agli altri `useState`, aggiungi:
```tsx
  const [arming, setArming] = useState(false);
  const [armMsg, setArmMsg] = useState<string | null>(null);

  async function eseguiOra() {
    setArming(true); setArmMsg(null);
    try {
      const res = await fetch('/api/admin/agente/esegui-ora', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      setArmMsg(res.ok ? 'Giro armato: parte al prossimo contatto dell\'agente (entro l\'ora).' : `Errore: ${j.error ?? res.status}`);
    } catch (e) {
      setArmMsg(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally {
      setArming(false);
    }
  }
```
(Se `useState` non è già importato in cima, aggiungilo all'import `react`.)

- [ ] **Step 2: Pulsante nella card Stato**

Nella **Card Stato** (cerca `{/* Card Stato */}`), sotto la riga online/contatto (dopo il blocco `{stato.allerta && (...)}`), aggiungi:
```tsx
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={eseguiOra}
            disabled={arming}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {arming ? 'Armo…' : 'Esegui ora'}
          </button>
          {armMsg && <span className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{armMsg}</span>}
        </div>
```

- [ ] **Step 3: Gate + Commit**

Run: `npx tsc --noEmit` → nessun nuovo errore. Run: `npx eslint components/modules/agente/AgenteClient.tsx` → pulito.

```bash
git add components/modules/agente/AgenteClient.tsx
git commit -m "feat(agente-ui): pulsante Esegui ora nella card Stato"
```

---

## PART 3 — Deploy (manuale)

### Task 9: migration, push, agente

- [ ] **Step 1:** Suite mirata: `npx vitest run lib/agente/ lib/limitazione/exportLimMassive.test.ts tools/limitazioni-sync/ components/modules/agente/` → verdi; `npx tsc --noEmit` → 0 errori nuovi.
- [ ] **Step 2:** Lancia `supabase/migrations/20260617000000_agente_forza_giro.sql` su prod (utente).
- [ ] **Step 3:** Con OK utente: `git push origin <branch>:main` → Vercel deploya endpoint + UI. Verifica: `POST /api/agente/tick` con chiave → 200; export contiene `saracinesca`.
- [ ] **Step 4:** Ricopia sul PC **solo** `tools/limitazioni-sync/agente.mjs` aggiornato (l'unico file agente cambiato — `valoreCampo`):
  ```powershell
  $dir="C:\Users\edgardo.perrelli\Desktop\tools\tools\limitazioni-sync"
  Invoke-WebRequest -Uri "https://raw.githubusercontent.com/edgardoperrelli-maker/gestione-personale/main/tools/limitazioni-sync/agente.mjs" -OutFile (Join-Path $dir "agente.mjs") -UseBasicParsing
  & "C:\Users\edgardo.perrelli\node\node-v24.16.0-win-x64\node.exe" --check (Join-Path $dir "agente.mjs")
  ```
- [ ] **Step 5:** In `/hub/agente`: abilita **Saracinesca** nell'editor mappa e scegli la colonna `saracinesca`; prova il pulsante **Esegui ora**.

---

## Self-Review
- **Esegui ora** (DB `forza_giro` T5 · endpoint T7 · tick OR+one-shot T6 · UI T8): ✅
- **Saracinesca** (buildRigaLimMassive T1 · route coalesce T2 · CAMPI_MAPPABILI T3 · agente valoreCampo T4 · UI auto via mappaturaCompleta): ✅
- Additivo: `esito`/`sigillo` invariati; i test esistenti restano (T1 aggiorna solo `base`+attese per il nuovo campo). ✅
- Nomi coerenti: `saracinesca` ovunque; `forza_giro` (DB) ↔ `forzato` (tick). ✅
- Allineamento template/backfill: **fuori scope** (spec separata). ✅
