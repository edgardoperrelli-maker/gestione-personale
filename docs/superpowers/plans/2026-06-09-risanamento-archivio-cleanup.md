# Risanamento — Archiviazione + pulizia ricerca — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Aggiungere la tabella archivio dei misuratori lavorati e dare all'admin la pulizia filtrata della tabella di riferimento (la logica di spostamento alla chiusura resta alla Fase 5).

**Architecture:** Nuova tabella `risanamento_misuratori_archivio` (deposito tecnico). Un helper puro parsa i filtri (via/civico/comune/import) ed è usato da un nuovo endpoint admin `misuratori-ref` con GET (conteggio + campione filtrato) e DELETE (eliminazione filtrata, mai senza filtro). La pagina admin esistente guadagna una terza card di pulizia.

**Tech Stack:** Next.js 15, TypeScript, Supabase, Vitest, React 19, Tailwind v4.

**Vincoli:** Migration NON eseguita (consegnata in blocco a fine progetto). Gate locali: unit test helper, `tsc`, `eslint`, `npm run build`. Branch: `feat/risanamento-archivio-cleanup`. NO push senza ok.

---

## File Structure
- Create: `supabase/migrations/20260609020000_risanamento_archivio.sql`
- Create: `lib/risanamento/filtriRef.ts` (+ test)
- Create: `app/api/admin/risanamento/misuratori-ref/route.ts` (GET + DELETE)
- Modify: `app/impostazioni/risanamento-misuratori/ImportMisuratoriClient.tsx` (terza card pulizia)

---

## Task 1: Migration tabella archivio

**Files:** Create `supabase/migrations/20260609020000_risanamento_archivio.sql`

- [ ] **Step 1: Scrivi il file**

```sql
-- Risanamento: archivio dei misuratori lavorati (deposito tecnico).
-- Lo storico "vero" e' negli interventi esitati; qui si depositano i record di
-- riferimento lavorati, spostati dalla tabella di ricerca alla chiusura (logica in Fase 5).
create table if not exists risanamento_misuratori_archivio (
  id bigserial primary key,
  matricola text not null,
  pdr text not null default '',
  nominativo text not null default '',
  indirizzo text not null default '',
  civico text not null default '',
  comune text not null default '',
  cap text not null default '',
  import_id uuid,
  ref_id_originale bigint,
  rapportino_id uuid references rapportini(id) on delete set null,
  archiviato_at timestamptz not null default now()
);
create index if not exists idx_ris_arch_matricola on risanamento_misuratori_archivio (matricola);
create index if not exists idx_ris_arch_rapportino on risanamento_misuratori_archivio (rapportino_id);

alter table risanamento_misuratori_archivio enable row level security;
drop policy if exists ris_arch_all_auth on risanamento_misuratori_archivio;
create policy ris_arch_all_auth on risanamento_misuratori_archivio
  for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Verifica** che `rapportini(id)` esista (sì, migration 20260502000000) e che il pattern RLS `*_all_auth` sia coerente con le altre tabelle del progetto. NON eseguire la SQL.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/20260609020000_risanamento_archivio.sql
git commit -m "feat(db): tabella archivio misuratori lavorati" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Helper filtri (TDD)

**Files:** Create `lib/risanamento/filtriRef.ts` + `lib/risanamento/filtriRef.test.ts`

- [ ] **Step 1: Test che fallisce** — `lib/risanamento/filtriRef.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseFiltriRef } from './filtriRef';

describe('parseFiltriRef', () => {
  it('estrae e trimma i filtri', () => {
    const f = parseFiltriRef(new URLSearchParams('indirizzo=%20Via%20Roma%20&civico=24&comune=Napoli&import_id=abc'));
    expect(f).toEqual({ indirizzo: 'Via Roma', civico: '24', comune: 'Napoli', import_id: 'abc', vuoto: false });
  });

  it('vuoto=true quando nessun filtro e\\u0300 presente', () => {
    expect(parseFiltriRef(new URLSearchParams('')).vuoto).toBe(true);
    expect(parseFiltriRef(new URLSearchParams('indirizzo=%20%20')).vuoto).toBe(true);
  });

  it('vuoto=false se almeno un filtro e\\u0300 valorizzato', () => {
    expect(parseFiltriRef(new URLSearchParams('civico=3')).vuoto).toBe(false);
    expect(parseFiltriRef(new URLSearchParams('import_id=x')).vuoto).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui** `npx vitest run lib/risanamento/filtriRef.test.ts` → FAIL.

- [ ] **Step 3: Implementa** — `lib/risanamento/filtriRef.ts`:

```ts
/** Filtri di pulizia della tabella di riferimento misuratori. */
export type FiltriRef = {
  indirizzo: string;
  civico: string;
  comune: string;
  import_id: string;
  vuoto: boolean; // true se nessun filtro e' valorizzato (vieta la DELETE di massa)
};

export function parseFiltriRef(sp: URLSearchParams): FiltriRef {
  const g = (k: string) => (sp.get(k) ?? '').trim();
  const indirizzo = g('indirizzo');
  const civico = g('civico');
  const comune = g('comune');
  const import_id = g('import_id');
  return { indirizzo, civico, comune, import_id, vuoto: !indirizzo && !civico && !comune && !import_id };
}
```

- [ ] **Step 4: Esegui** `npx vitest run lib/risanamento/filtriRef.test.ts` → PASS.

- [ ] **Step 5: Lint** `npx eslint lib/risanamento/filtriRef.ts lib/risanamento/filtriRef.test.ts --max-warnings=0` → vuoto.

- [ ] **Step 6: Commit**
```bash
git add lib/risanamento/filtriRef.ts lib/risanamento/filtriRef.test.ts
git commit -m "feat(risanamento): helper parse filtri tabella riferimento" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Endpoint misuratori-ref (GET filtrato + DELETE filtrato)

**Files:** Create `app/api/admin/risanamento/misuratori-ref/route.ts`

- [ ] **Step 1: Implementa**

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { parseFiltriRef, type FiltriRef } from '@/lib/risanamento/filtriRef';

export const runtime = 'nodejs';

/** Applica i filtri a una query builder Supabase su risanamento_misuratori_ref. */
function applica<T extends { ilike: (c: string, p: string) => T; eq: (c: string, v: string) => T }>(q: T, f: FiltriRef): T {
  let out = q;
  if (f.indirizzo) out = out.ilike('indirizzo', `%${f.indirizzo}%`);
  if (f.civico) out = out.eq('civico', f.civico);
  if (f.comune) out = out.ilike('comune', `%${f.comune}%`);
  if (f.import_id) out = out.eq('import_id', f.import_id);
  return out;
}

/** GET: conteggio + campione (max 50) delle righe di riferimento che matchano i filtri. */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const f = parseFiltriRef(new URL(req.url).searchParams);
  const base = supabaseAdmin
    .from('risanamento_misuratori_ref')
    .select('id, matricola, pdr, nominativo, indirizzo, civico, comune', { count: 'exact' });
  const { data, count, error } = await applica(base, f).order('indirizzo', { ascending: true }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ count: count ?? 0, sample: data ?? [] });
}

/** DELETE: elimina le righe di riferimento che matchano i filtri (almeno un filtro obbligatorio). */
export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const f = parseFiltriRef(new URL(req.url).searchParams);
  if (f.vuoto) {
    return NextResponse.json({ error: 'Specifica almeno un filtro: la cancellazione totale non è ammessa.' }, { status: 400 });
  }
  const base = supabaseAdmin.from('risanamento_misuratori_ref').delete({ count: 'exact' });
  const { count, error } = await applica(base, f);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ eliminati: count ?? 0 });
}
```

- [ ] **Step 2: Type-check** `npx tsc --noEmit 2>&1 | grep -i "misuratori-ref"` → vuoto. Se il generic di `applica` dà problemi col tipo del query builder Supabase, semplifica usando `any` LOCALE per il builder con un commento (il pattern del progetto già usa cast verso il client untyped); l'importante è che i filtri vengano applicati e i due handler compilino.

- [ ] **Step 3: Lint** `npx eslint "app/api/admin/risanamento/misuratori-ref/route.ts" --max-warnings=0` → vuoto.

- [ ] **Step 4: Commit**
```bash
git add "app/api/admin/risanamento/misuratori-ref/route.ts"
git commit -m "feat(risanamento): endpoint pulizia filtrata tabella riferimento" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: UI — card "Pulizia righe di riferimento"

**Files:** Modify `app/impostazioni/risanamento-misuratori/ImportMisuratoriClient.tsx`

- [ ] **Step 1:** Dopo la card "Import caricati" (l'ultima `<div>` prima della chiusura del componente), aggiungi una nuova card. Inserisci anche lo stato e gli handler necessari nel componente.

Aggiungi questi stati (vicino agli altri `useState`):
```tsx
  const [fIndirizzo, setFIndirizzo] = useState('');
  const [fCivico, setFCivico] = useState('');
  const [fComune, setFComune] = useState('');
  const [fImport, setFImport] = useState('');
  const [refCount, setRefCount] = useState<number | null>(null);
  const [refSample, setRefSample] = useState<Array<{ id: number; matricola: string; indirizzo: string; civico: string; comune: string }>>([]);
```

Aggiungi gli handler (vicino agli altri):
```tsx
  const queryRef = () => {
    const p = new URLSearchParams();
    if (fIndirizzo.trim()) p.set('indirizzo', fIndirizzo.trim());
    if (fCivico.trim()) p.set('civico', fCivico.trim());
    if (fComune.trim()) p.set('comune', fComune.trim());
    if (fImport) p.set('import_id', fImport);
    return p;
  };

  const cercaRef = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/risanamento/misuratori-ref?${queryRef().toString()}`);
      if (!res.ok) { setEsito({ type: 'err', msg: 'Ricerca fallita.' }); return; }
      const json = (await res.json()) as { count: number; sample: typeof refSample };
      setRefCount(json.count);
      setRefSample(json.sample);
    } finally { setBusy(false); }
  };

  const eliminaRef = async () => {
    const p = queryRef();
    if ([...p.keys()].length === 0) { setEsito({ type: 'err', msg: 'Imposta almeno un filtro prima di eliminare.' }); return; }
    if (!confirm(`Eliminare ${refCount ?? '?'} righe di riferimento corrispondenti ai filtri?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/risanamento/misuratori-ref?${p.toString()}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) { setEsito({ type: 'err', msg: json.error ?? 'Eliminazione fallita.' }); return; }
      setEsito({ type: 'ok', msg: `Eliminate ${json.eliminati} righe di riferimento.` });
      setRefCount(null); setRefSample([]);
      await carica();
    } finally { setBusy(false); }
  };
```

La nuova card (dopo "Import caricati"):
```tsx
      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
        <h2 className="mb-1 font-semibold text-[var(--brand-text-main)]">Pulizia righe di riferimento</h2>
        <p className="mb-4 text-xs text-[var(--brand-text-muted)]">
          A lavori ultimati in una via, elimina i misuratori mai lavorati. Imposta almeno un filtro.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input value={fIndirizzo} onChange={(e) => setFIndirizzo(e.target.value)} placeholder="Via"
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs" aria-label="Via" />
          <input value={fCivico} onChange={(e) => setFCivico(e.target.value)} placeholder="Civico"
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs" aria-label="Civico" />
          <input value={fComune} onChange={(e) => setFComune(e.target.value)} placeholder="Comune"
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs" aria-label="Comune" />
          <select value={fImport} onChange={(e) => setFImport(e.target.value)}
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs" aria-label="Import">
            <option value="">Tutti gli import</option>
            {lista.map((imp) => <option key={imp.import_id} value={imp.import_id}>{imp.righe} · {new Date(imp.caricato_at).toLocaleDateString('it-IT')}</option>)}
          </select>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" disabled={busy} onClick={cercaRef}
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-50">
            Cerca
          </button>
          {refCount !== null && (
            <>
              <span className="text-xs text-[var(--brand-text-muted)]">{refCount} corrispondenti</span>
              <button type="button" disabled={busy || refCount === 0} onClick={eliminaRef}
                className="rounded-lg border border-[var(--danger)] px-3 py-1.5 text-xs font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)] disabled:opacity-50">
                Elimina {refCount}
              </button>
            </>
          )}
        </div>
        {refSample.length > 0 && (
          <ul className="mt-3 max-h-40 space-y-1 overflow-auto text-xs text-[var(--brand-text-muted)]">
            {refSample.map((r) => (
              <li key={r.id}>{r.matricola} · {r.indirizzo} {r.civico} {r.comune}</li>
            ))}
          </ul>
        )}
      </div>
```

- [ ] **Step 2: Type-check** `npx tsc --noEmit 2>&1 | grep -i "risanamento-misuratori"` → vuoto.

- [ ] **Step 3: Lint** `npx eslint "app/impostazioni/risanamento-misuratori/ImportMisuratoriClient.tsx" --max-warnings=0` → vuoto.

- [ ] **Step 4: Commit**
```bash
git add "app/impostazioni/risanamento-misuratori/ImportMisuratoriClient.tsx"
git commit -m "feat(risanamento): card pulizia filtrata tabella riferimento" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Verifica finale

- [ ] **Step 1:** `npx vitest run lib/risanamento/filtriRef.test.ts` → PASS.
- [ ] **Step 2:** `npx tsc --noEmit 2>&1 | grep -Ei "risanamento|misuratori"` → vuoto.
- [ ] **Step 3:** eslint su tutti i file nuovi/toccati → vuoto.
- [ ] **Step 4:** `npm run build` → ok, route `/api/admin/risanamento/misuratori-ref` presente.
- [ ] **Step 5:** Riepilogo: migration archivio + cleanup pronti sul branch; SQL da lanciare in blocco; logica spostamento alla chiusura rimane in Fase 5.

---

## Self-review (copertura spec — Sezione 4)
- Tabella `risanamento_misuratori_archivio` → Task 1 ✓
- Pulizia filtrata (via/civico/comune/import) endpoint → Task 3 (GET+DELETE) ✓; helper TDD → Task 2 ✓
- UI cleanup → Task 4 ✓
- DELETE mai senza filtro (anti-svuotamento) → Task 2 (`vuoto`) + Task 3 (400) ✓
- Spostamento alla chiusura → NON in questo piano (Fase 5), come da spec ✓

## Note tipi
- `FiltriRef` (Task 2) usato da endpoint (Task 3). `parseFiltriRef` condiviso GET/DELETE.
- Endpoint GET ritorna `{ count, sample }`; client legge `json.count`/`json.sample` (Task 4). DELETE ritorna `{ eliminati }`; client legge `json.eliminati`.
