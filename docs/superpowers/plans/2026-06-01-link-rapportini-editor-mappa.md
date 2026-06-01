# Link rapportini nell'editor mappa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dopo "Salva distribuzione" nell'editor mappa, mostrare accanto a ogni operatore il link al rapportino (Copia / WhatsApp / Esporta Excel), con un pulsante "Genera rapportini" e un salvataggio in-place che non invalida i token già emessi.

**Architecture:** Si riusa il backend rapportini esistente (`/api/mappa/rapportini/genera` + `GET /api/mappa/rapportini`). Si aggiunge un ramo `PUT` all'API piani per aggiornare il piano **mantenendo lo stesso `piano_id`** (così i `rapportini`, legati a `piano_id`, sopravvivono ai ri-salvataggi). Helper di presentazione condivisi vengono estratti in `utils/rapportini/links.ts`; una funzione pura gestisce la pulizia dei rapportini orfani.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Supabase (service role + auth-helpers), Tailwind 4 (tema Aurea: variabili `--brand-*`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-01-link-rapportini-editor-mappa-design.md`

---

## File Structure

| File | Responsabilità | Azione |
|---|---|---|
| `utils/rapportini/links.ts` (+ test) | Tipo `RapportinoStato` + helper presentazione `statoBadge`, `whatsappHref` (puri) | Create |
| `components/modules/mappa/RegistroPianificazioni.tsx` | Usa gli helper condivisi (rimuove i duplicati locali) | Modify |
| `utils/rapportini/orphans.ts` (+ test) | `orphanRapportini` — id dei rapportini il cui `staff_id` non è più nel piano (puro) | Create |
| `app/api/mappa/rapportini/genera/route.ts` | Pulizia rapportini orfani in generazione | Modify |
| `app/api/mappa/piani/route.ts` | `PUT` update in-place del piano (mantiene `piano_id`) | Modify |
| `components/modules/mappa/MappaOperatoriClient.tsx` | `saveDistribution` usa PUT; stato/fetch rapportini; pulsante "Genera"; link per operatore | Modify |

**Match operatore→rapportino (risolto):** in `distributeToOps` ogni voce ha `staffId: op.id`, e `saveDistribution` salva `staff_id: dist.staffId`. Quindi il `staff_id` salvato **coincide con `op.id`** della riga `selectedOps`. Il match è diretto: `rapByStaff.get(op.id)`.

---

## Task 1: Helper condivisi `links.ts` + refactor Registro (DRY)

**Files:**
- Create: `utils/rapportini/links.ts`
- Create (test): `utils/rapportini/links.test.ts`
- Modify: `components/modules/mappa/RegistroPianificazioni.tsx`

- [ ] **Step 1: Scrivere il test (fallisce)** — `utils/rapportini/links.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { whatsappHref, statoBadge } from './links';

describe('whatsappHref', () => {
  it('costruisce un link wa.me con testo e url codificati', () => {
    const href = whatsappHref('Mario', '01/06/2026', 'https://x.app/r/abc');
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    const text = decodeURIComponent(href.replace('https://wa.me/?text=', ''));
    expect(text).toContain('Mario');
    expect(text).toContain('01/06/2026');
    expect(text).toContain('https://x.app/r/abc');
  });
  it('gestisce staffName null senza rompersi', () => {
    expect(whatsappHref(null, '01/06/2026', 'https://x.app/r/abc')).toContain('wa.me');
  });
});

describe('statoBadge', () => {
  it('mappa gli stati alle etichette', () => {
    expect(statoBadge('inviato').label).toBe('Inviato');
    expect(statoBadge('scaduto').label).toBe('Scaduto');
    expect(statoBadge('valido').label).toBe('In corso');
  });
});
```

- [ ] **Step 2: Eseguire il test → FAIL**

Run: `npx vitest run utils/rapportini/links.test.ts`
Expected: FAIL (`Cannot find module './links'`).

- [ ] **Step 3: Implementare** — `utils/rapportini/links.ts`

```ts
export interface RapportinoStato {
  id: string;
  staff_id: string;
  staff_name: string | null;
  token: string;
  stato: string;
  data: string;
  expires_at: string;
  submitted_at: string | null;
  url: string;
  statoCalcolato: 'valido' | 'scaduto' | 'inviato';
  nVoci: number;
}

export function statoBadge(
  stato: RapportinoStato['statoCalcolato'],
): { label: string; className: string } {
  if (stato === 'inviato') {
    return { label: 'Inviato', className: 'bg-[var(--success-soft)] text-[var(--success)]' };
  }
  if (stato === 'scaduto') {
    return { label: 'Scaduto', className: 'bg-[var(--danger-soft)] text-[var(--danger)]' };
  }
  return { label: 'In corso', className: 'bg-[var(--warning-soft)] text-[var(--warning)]' };
}

export function whatsappHref(
  staffName: string | null,
  dataLabel: string,
  url: string,
): string {
  const testo = `Ciao ${staffName ?? ''}, ecco il link per il rapportino del ${dataLabel}:`;
  return `https://wa.me/?text=${encodeURIComponent(`${testo} ${url}`)}`;
}
```

- [ ] **Step 4: Eseguire il test → PASS**

Run: `npx vitest run utils/rapportini/links.test.ts`
Expected: PASS (5 assert).

- [ ] **Step 5: Refactor `RegistroPianificazioni.tsx` per usare gli helper condivisi**

5a. Aggiungere l'import (dopo la riga 5 `import { nonConsegnati } ...`):
```ts
import { type RapportinoStato, statoBadge, whatsappHref } from '@/utils/rapportini/links';
```

5b. **Rimuovere** l'interfaccia locale `RapportinoStato` (righe 29-41) — ora arriva dall'import.

5c. **Rimuovere** la funzione locale `statoBadge` (righe 320-328) — ora arriva dall'import.

5d. Nel componente `RapportiniModal`, **rimuovere** la funzione locale `whatsappHref` (righe 423-426):
```ts
  const whatsappHref = (r: RapportinoStato) => {
    const testo = `Ciao ${r.staff_name ?? ''}, ecco il link per il rapportino del ${dataLabel}:`;
    return `https://wa.me/?text=${encodeURIComponent(`${testo} ${r.url}`)}`;
  };
```
e cambiare la chiamata nel JSX (riga ~536) da:
```tsx
                        href={whatsappHref(r)}
```
a:
```tsx
                        href={whatsappHref(r.staff_name, dataLabel, r.url)}
```

- [ ] **Step 6: Verificare i tipi → pulito**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add utils/rapportini/links.ts utils/rapportini/links.test.ts components/modules/mappa/RegistroPianificazioni.tsx
git commit -m "feat(rapportini): helper condivisi statoBadge/whatsappHref + refactor Registro" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Funzione pura `orphanRapportini`

**Files:**
- Create: `utils/rapportini/orphans.ts`
- Create (test): `utils/rapportini/orphans.test.ts`

- [ ] **Step 1: Scrivere il test (fallisce)** — `utils/rapportini/orphans.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { orphanRapportini } from './orphans';

describe('orphanRapportini', () => {
  const existing = [
    { id: 'r1', staff_id: 'a' },
    { id: 'r2', staff_id: 'b' },
    { id: 'r3', staff_id: 'c' },
  ];
  it('ritorna gli id dei rapportini il cui staff_id non è più nel piano', () => {
    expect(orphanRapportini(existing, ['a', 'c'])).toEqual(['r2']);
  });
  it('ritorna [] se tutti gli staff_id sono ancora presenti', () => {
    expect(orphanRapportini(existing, ['a', 'b', 'c', 'd'])).toEqual([]);
  });
  it('ritorna tutti gli id se currentStaffIds è vuoto', () => {
    expect(orphanRapportini(existing, [])).toEqual(['r1', 'r2', 'r3']);
  });
});
```

- [ ] **Step 2: Eseguire il test → FAIL**

Run: `npx vitest run utils/rapportini/orphans.test.ts`
Expected: FAIL (`Cannot find module './orphans'`).

- [ ] **Step 3: Implementare** — `utils/rapportini/orphans.ts`

```ts
export function orphanRapportini(
  existing: { id: string; staff_id: string }[],
  currentStaffIds: string[],
): string[] {
  const current = new Set(currentStaffIds);
  return existing.filter((r) => !current.has(r.staff_id)).map((r) => r.id);
}
```

- [ ] **Step 4: Eseguire il test → PASS**

Run: `npx vitest run utils/rapportini/orphans.test.ts`
Expected: PASS (3 assert).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/orphans.ts utils/rapportini/orphans.test.ts
git commit -m "feat(rapportini): orphanRapportini puro + test" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Pulizia orfani in `genera`

**Files:**
- Modify: `app/api/mappa/rapportini/genera/route.ts`

- [ ] **Step 1: Aggiungere l'import** in cima al file (dopo la riga 4 `import { taskToVoce, mergeVoci, type Voce } ...`):

```ts
import { orphanRapportini } from '@/utils/rapportini/orphans';
```

- [ ] **Step 2: Inserire la pulizia** subito dopo il caricamento degli operatori (dopo le righe che assegnano `const { data: ops } = await supabaseAdmin.from('mappa_piani_operatori')...`, attorno alla riga 18) e **prima** di `const base = ...`:

```ts
    // Pulizia rapportini orfani: operatori non più nel piano → rimuovi rapportino (+ voci a cascata)
    const currentStaffIds = (ops ?? []).map((o) => String(o.staff_id));
    if (currentStaffIds.length > 0) {
      const { data: existingRaps } = await supabaseAdmin
        .from('rapportini')
        .select('id, staff_id')
        .eq('piano_id', pianoId);
      const toRemove = orphanRapportini((existingRaps as { id: string; staff_id: string }[]) ?? [], currentStaffIds);
      if (toRemove.length > 0) {
        await supabaseAdmin.from('rapportini').delete().in('id', toRemove);
      }
    }
```

> Nota: `pianoId` è già in scope (estratto da `await req.json()` a riga 10). La cascade su `rapportino_voci` elimina anche le voci dei rapportini rimossi.

- [ ] **Step 3: Verificare i tipi → pulito**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add app/api/mappa/rapportini/genera/route.ts
git commit -m "feat(rapportini): pulizia rapportini orfani in generazione" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `PUT /api/mappa/piani` (update in-place)

**Files:**
- Modify: `app/api/mappa/piani/route.ts`

> `cookies`, `createRouteHandlerClient`, `parseRegole`, `buildRuleRows`, `buildLockRows` e `supabaseAdmin` sono già importati/definiti nel file (usati dal `POST`). Non servono nuovi import.

- [ ] **Step 1: Aggiungere l'handler `PUT`** in fondo al file, dopo la funzione `DELETE` (dopo la riga 212):

```ts
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, data: isoData, territorio, note, stato = 'confermato', operatori, regole, lucchetti } = body;

    if (!id) return NextResponse.json({ error: 'id mancante' }, { status: 400 });
    if (!isoData) return NextResponse.json({ error: 'Campo data obbligatorio' }, { status: 400 });
    if (!operatori || !Array.isArray(operatori) || operatori.length === 0) {
      return NextResponse.json({ error: 'Campo operatori obbligatorio' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabaseBrowser = createRouteHandlerClient({ cookies: () => cookieStore as any });
    const { data: { user } } = await supabaseBrowser.auth.getUser();
    const userId = user?.id ?? null;

    const { data: existing, error: eFind } = await supabaseAdmin
      .from('mappa_piani').select('id').eq('id', id).maybeSingle();
    if (eFind) throw new Error(eFind.message);
    if (!existing) return NextResponse.json({ error: 'Piano non trovato' }, { status: 404 });

    // Aggiorna la testata mantenendo lo stesso piano_id (i rapportini collegati restano validi)
    const { error: eUpd } = await supabaseAdmin
      .from('mappa_piani')
      .update({ data: isoData, territorio: territorio ?? null, note: note ?? null, stato, updated_by: userId })
      .eq('id', id);
    if (eUpd) throw new Error(eUpd.message);

    // Rigenera gli operatori del piano
    await supabaseAdmin.from('mappa_piani_operatori').delete().eq('piano_id', id);
    const opRows = operatori.map((op: any) => ({
      piano_id: id,
      staff_id: String(op.staff_id),
      staff_name: String(op.staff_name),
      colore: String(op.colore ?? '#2563EB'),
      km: Number(op.km ?? 0),
      task_count: Number(op.task_count ?? 0),
      start_address: op.start_address ?? null,
      tasks: op.tasks ?? [],
      polyline: op.polyline ?? [],
    }));
    const { error: eOp } = await supabaseAdmin.from('mappa_piani_operatori').insert(opRows);
    if (eOp) throw new Error(eOp.message);

    // Rigenera regole e lucchetti
    await supabaseAdmin.from('mappa_assegnazioni_manuali').delete().eq('piano_id', id);
    const ruleRows = buildRuleRows(id, parseRegole(regole));
    if (ruleRows.length > 0) {
      const { error: eRules } = await supabaseAdmin.from('mappa_assegnazioni_manuali').insert(ruleRows);
      if (eRules) console.error('[PUT /api/mappa/piani] regole:', eRules.message);
    }
    await supabaseAdmin.from('mappa_piani_lucchetti').delete().eq('piano_id', id);
    const lockRows = buildLockRows(id, lucchetti);
    if (lockRows.length > 0) {
      const { error: eLocks } = await supabaseAdmin.from('mappa_piani_lucchetti').insert(lockRows);
      if (eLocks) console.error('[PUT /api/mappa/piani] lucchetti:', eLocks.message);
    }

    // Aggiorna i contatori nel cronoprogramma
    const distribuzioniRows = operatori.map((op: any) => ({
      staff_id: String(op.staff_id),
      data: isoData,
      task_count: Number(op.task_count ?? 0),
      updated_at: new Date().toISOString(),
    }));
    const { error: eDist } = await supabaseAdmin
      .from('mappa_distribuzioni').upsert(distribuzioniRows, { onConflict: 'staff_id,data' });
    if (eDist) console.error('[PUT /api/mappa/piani] upsert distribuzioni:', eDist.message);

    return NextResponse.json({ ok: true, id });
  } catch (err: any) {
    console.error('[PUT /api/mappa/piani]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificare i tipi → pulito**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/api/mappa/piani/route.ts
git commit -m "feat(mappa): PUT piani update in-place (mantiene piano_id)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `saveDistribution` usa PUT quando il piano esiste

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx` (funzione `saveDistribution`, righe 1480-1536)

- [ ] **Step 1: Sostituire il corpo del `try`** dentro `saveDistribution`. Rimpiazzare l'attuale blocco (righe 1484-1535, da `// Se esiste già un piano salvato...` fino a `setSavingDistribution(false);` incluso il `finally`) con:

```ts
    try {
      const operatori = selectedOps.map((op, idx) => {
        const dist = distribution[idx];
        return {
          staff_id: dist.staffId,
          staff_name: op.name,
          colore: dist.color,
          km: dist.km,
          task_count: dist.tasks.length,
          start_address: dist.startAddress || null,
          tasks: dist.tasks,
          polyline: dist.polyline,
        };
      });

      const payload = {
        data: planningDate,
        territorio: selectedPlanningTerritory?.name ?? null,
        note: '',
        stato: 'confermato',
        operatori,
        regole: manualRules,
        lucchetti: operatorLocks,
      };

      // Update in-place se il piano esiste già: mantiene piano_id → i link rapportini restano validi
      const res = currentPianoId
        ? await fetch('/api/mappa/piani', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: currentPianoId, ...payload }),
          })
        : await fetch('/api/mappa/piani', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      if (res.ok) {
        const json = await res.json();
        setSavedDistribution(true);
        if (json.id) {
          setCurrentPianoId(json.id);
          window.history.replaceState({}, '', `/hub/mappa?vista=pianifica&pianoId=${json.id}`);
        }
      }
    } finally {
      setSavingDistribution(false);
    }
```

> La dependency list di `useCallback` resta invariata (riga 1536): `[currentPianoId, distribution, planningDate, selectedOps, selectedPlanningTerritory, manualRules, operatorLocks]`.

- [ ] **Step 2: Verificare i tipi → pulito**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): salvataggio distribuzione in-place via PUT" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Blocco rapportini + link per operatore nell'editor

**Files:**
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx`

- [ ] **Step 1: Import degli helper** — aggiungere vicino agli altri import in cima al file:

```ts
import { type RapportinoStato, statoBadge, whatsappHref } from '@/utils/rapportini/links';
```

- [ ] **Step 2: Stato locale** — aggiungere subito dopo `const [savedDistribution, setSavedDistribution] = useState(false);` (riga 693):

```ts
  // Rapportini inline (editor)
  const [rapStato, setRapStato] = useState<RapportinoStato[]>([]);
  const [rapTemplateId, setRapTemplateId] = useState('');
  const [rapGenerating, setRapGenerating] = useState(false);
  const [rapError, setRapError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
```

- [ ] **Step 3: Funzioni ed effetti** — aggiungere subito dopo la fine di `saveDistribution` e del suo `useEffect` di reset (dopo la riga 1541, prima di `// Distribuisce i task geocodificati...`):

```ts
  // ── Rapportini inline ──────────────────────────────────────────────────────
  const caricaRapportini = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`/api/mappa/rapportini?pianoId=${pid}`);
      const data = await res.json();
      setRapStato(Array.isArray(data) ? data : []);
    } catch {
      setRapStato([]);
    }
  }, []);

  // Template di default (una volta)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/rapportino-template');
        const list = await res.json();
        const arr: Array<{ id: string; is_default?: boolean }> = Array.isArray(list) ? list : [];
        const def = arr.find((t) => t.is_default) ?? arr[0];
        if (def) setRapTemplateId(def.id);
      } catch {
        /* nessun template attivo */
      }
    })();
  }, []);

  // Carica lo stato rapportini quando il piano è salvato (incluso edit mode)
  useEffect(() => {
    if (savedDistribution && currentPianoId) caricaRapportini(currentPianoId);
    else setRapStato([]);
  }, [savedDistribution, currentPianoId, caricaRapportini]);

  const generaRapportini = useCallback(async () => {
    if (!currentPianoId) return;
    if (!rapTemplateId) {
      setRapError('Nessun modello attivo. Crea un template in Impostazioni → Template rapportini.');
      return;
    }
    setRapGenerating(true);
    setRapError(null);
    try {
      const res = await fetch('/api/mappa/rapportini/genera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pianoId: currentPianoId, templateId: rapTemplateId }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        setRapError(data?.error ?? 'Errore durante la generazione.');
        return;
      }
      await caricaRapportini(currentPianoId);
    } catch {
      setRapError('Errore durante la generazione.');
    } finally {
      setRapGenerating(false);
    }
  }, [currentPianoId, rapTemplateId, caricaRapportini]);

  const rapByStaff = useMemo(() => {
    const m = new Map<string, RapportinoStato>();
    rapStato.forEach((r) => m.set(r.staff_id, r));
    return m;
  }, [rapStato]);

  const rapDataLabel = useMemo(
    () => new Date(planningDate).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    [planningDate],
  );

  const handleCopyLink = useCallback(async (r: RapportinoStato) => {
    try {
      await navigator.clipboard.writeText(r.url);
      setCopiedToken(r.token);
      setTimeout(() => setCopiedToken((t) => (t === r.token ? null : t)), 1800);
    } catch {
      /* clipboard non disponibile */
    }
  }, []);
```

- [ ] **Step 4: Pulsante "Genera rapportini"** — nella riga azioni della tabella operatori, **tra** il `</button>` di chiusura del pulsante "Salva distribuzione" (riga 2361) e il `</>` (riga 2362), così resta dentro il frammento `{distribution && ( <> ... </> )}`:

```tsx
                          {savedDistribution && currentPianoId && (
                            <button
                              type="button"
                              onClick={generaRapportini}
                              disabled={rapGenerating || !rapTemplateId}
                              title={!rapTemplateId ? 'Nessun modello attivo' : undefined}
                              className="rounded-lg border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--brand-primary)] hover:opacity-90 disabled:opacity-50"
                            >
                              {rapGenerating
                                ? 'Genero…'
                                : rapStato.length > 0
                                  ? '↻ Rigenera rapportini'
                                  : '📋 Genera rapportini'}
                            </button>
                          )}
```

- [ ] **Step 5: Messaggio d'errore rapportini** — **tra** il `</div>` di riga 2364 (chiude la riga azioni `flex items-center gap-2 pt-1`) e il `</div>` di riga 2365 (chiude il contenitore `mt-2 space-y-1`), così resta dentro `{selectedOps.length > 0 && (...)}` ma fuori dalla riga azioni:

```tsx
                    {rapError && (
                      <p className="text-[10px] text-[var(--danger)]">{rapError}</p>
                    )}
```

- [ ] **Step 6: Link accanto al nome operatore** — nella cella del nome, **dopo** il blocco `{op.startAddress && (...)}` (dopo riga 2285), ancora dentro `<div className="min-w-0">`:

```tsx
                              {(() => {
                                const r = rapByStaff.get(op.id);
                                if (!r) return null;
                                const badge = statoBadge(r.statoCalcolato);
                                return (
                                  <div className="mt-1 flex flex-wrap items-center gap-1">
                                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${badge.className}`}>
                                      {badge.label}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyLink(r)}
                                      className="rounded border border-[var(--brand-border)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]"
                                    >
                                      {copiedToken === r.token ? 'Copiato!' : 'Copia link'}
                                    </button>
                                    <a
                                      href={whatsappHref(r.staff_name, rapDataLabel, r.url)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="rounded border border-[var(--success)]/40 bg-[var(--success-soft)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--success)] hover:opacity-80"
                                    >
                                      WhatsApp
                                    </a>
                                    <a
                                      href={`/api/mappa/rapportini/export?rapportinoId=${r.id}`}
                                      className="rounded border border-[var(--brand-border)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]"
                                    >
                                      Excel
                                    </a>
                                  </div>
                                );
                              })()}
```

- [ ] **Step 7: Verificare i tipi → pulito**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 8: Commit**

```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): link rapportini accanto agli operatori (Genera/Copia/WhatsApp/Excel)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Verifica manuale end-to-end

**Files:** nessuno (solo verifica). Richiede app + Supabase attivi (`npm run dev`) e almeno un template attivo in Impostazioni → Template rapportini.

- [ ] **Step 1: Suite test + tipi**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tutti i test PASS, nessun errore di tipo.

- [ ] **Step 2: Flusso base**
  1. Mappa → importa Excel, geocodifica, seleziona operatori, **Distribuisci**, **Salva distribuzione** (compare "✓ Salvata" e l'URL diventa `?pianoId=…`).
  2. Compare **"📋 Genera rapportini"** → click → accanto a ogni operatore compaiono badge **In corso** + **Copia link** / **WhatsApp** / **Excel**.
  3. **Copia link** copia un URL `…/r/<token>`; aprendolo si vede il form del rapportino.

- [ ] **Step 3: Stabilità link (il punto chiave)**
  1. Apri il link di un operatore, compila una crocetta/nota (autosave).
  2. Torna nell'editor, **modifica** la distribuzione e premi di nuovo **Salva distribuzione**.
  3. Riapri lo **stesso** link → deve essere **ancora valido** e la risposta compilata **conservata** (nessun 404).

- [ ] **Step 4: Rigenera + orfani**
  1. Premi **↻ Rigenera rapportini**: i token restano, eventuali nuovi interventi compaiono nel form.
  2. Rimuovi un operatore dalla distribuzione, **Salva** e **Rigenera**: il suo link sparisce dall'editor (rapportino orfano eliminato).

- [ ] **Step 5: Registro invariato** — apri Registro pianificazioni → il modal "Rapportini" funziona come prima (Copia/WhatsApp/Excel), a riprova del refactor DRY.

---

## Note per chi esegue

- **Nessuna SQL / migrazione**: si riusano `rapportini`, `rapportino_voci`, `rapportino_template`, `mappa_*` esistenti.
- **Perché i link sopravvivono**: `rapportini.piano_id → mappa_piani` (FK con cascade), mentre `staff_id` è testo. Il `PUT` mantiene il `piano_id` e rigenera solo i figli `mappa_piani_operatori`/regole/lucchetti (che **non** sono referenziati dai rapportini). `genera` fa upsert/merge per `(piano_id, staff_id)` preservando token e risposte.
- **Match operatore→rapportino**: diretto su `op.id` perché `staff_id` salvato = `dist.staffId` = `op.id`.
- **WhatsApp assoluto**: l'URL usa `NEXT_PUBLIC_SITE_URL` (in `.env.local`). Verificare che sia impostato anche tra le **Environment Variables di Vercel** in produzione, altrimenti l'URL risulta relativo e non condivisibile.
- **Coerenza tipi**: `RapportinoStato`, `statoBadge`, `whatsappHref` (Task 1) usati sia dal Registro sia dall'editor; `orphanRapportini` (Task 2) usato dal `genera` (Task 3).
