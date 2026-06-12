# Limitazioni massive — "Cerca matricola" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere al "+" intervento manuale una quarta opzione **"Limitazioni massive"** (committente `lim_massive`) che fa cercare la matricola (scan QR/barcode o digitazione) su un DB di censiti Acea, con autofill e fallback manuale; l'intervento finisce in Lista Attesa dove il revisore può aprire le foto.

**Architecture:** Riusa la pipeline esistente intervento manuale → `interventi_manuali` → Lista Attesa (nessuna nuova tabella interventi). Nuova tabella di riferimento `limitazione_misuratori_ref` (separata da Resine), modulo Estrazione misuratori reso dataset-aware, nuovo endpoint di ricerca per token, nuovo step "Cerca matricola" nella modale, e galleria foto nel pannello di revisione.

**Tech Stack:** Next.js (App Router, route handlers `runtime='nodejs'`), Supabase (`supabaseAdmin`, storage bucket privato `interventi-foto`), React client components, Vitest, `barcode-detector` (già usato da Resine).

---

## Prerequisiti operativi (manuali, fuori dal codice)
Dopo il merge, l'utente deve:
1. **Lanciare la migration** del Task 1 sul DB di produzione (il Supabase MCP **non** è il prod).
2. **Creare il template** `lim_massive` nell'editor template (`/impostazioni/template-rapportini`): `committente='lim_massive'`, `solo_manuale=true`, con i campi anagrafica/esito/foto obbligatori desiderati. Senza questo template la modale risponde `template_mancante`.
3. **Importare i censiti Acea** dal modulo Estrazione misuratori (Task 3): dataset *Limitazioni*, committente *Acea*.

## File Structure
- **Nuovi:**
  - `supabase/migrations/20260612000000_limitazione_misuratori_ref.sql` — tabella + vista catalogo + RLS.
  - `lib/limitazione/matricoleSimili.ts` (+`.test.ts`) — normalizzazione + similarità bidirezionale (pura).
  - `lib/limitazione/autofillAnagrafica.ts` (+`.test.ts`) — mapping censito → anagrafica (pura).
  - `lib/interventi/manuali/etichettaCommittente.ts` (+`.test.ts`) — label committente (pura).
  - `app/api/r/[token]/cerca-limitazione/route.ts` — ricerca matricola (token).
  - `components/modules/rapportini/limitazione/CercaMatricolaLimitazione.tsx` — UI step "Cerca matricola".
  - `app/api/admin/interventi-manuali/[id]/foto/route.ts` — signed URL foto (admin).
- **Modificati:**
  - `app/api/admin/risanamento/import-misuratori/route.ts` — dataset-aware (attivita+committente).
  - `app/impostazioni/risanamento-misuratori/ImportMisuratoriClient.tsx` — selettori dataset/committente.
  - `lib/interventi/manuali/types.ts` — enum `CommittenteManuale`.
  - `lib/interventi/manuali/richiestaToIntervento.ts` — allarga `ContextInterventoManuale.committente`.
  - `components/modules/rapportini/ModaleInterventoManuale.tsx` — opzione + step "Cerca matricola".
  - `app/api/r/[token]/intervento-manuale/route.ts` — `COMMITTENTI`.
  - `app/r/[token]/page.tsx` — mappa `templatesPerCommittente`.
  - `app/hub/lista-attesa/page.tsx` — `COMMITTENTI_MANUALI`.
  - `components/modules/lista-attesa/CodaRichiesteManuali.tsx`, `PannelloRevisioneRichiesta.tsx`, `RegistroAutorizzazioni.tsx` — etichette + galleria foto.

## Note sui gate di verifica
La baseline `npm run lint` / `npx vitest run` è **già rossa** su main: per ogni task la verifica è **mirata** ai file del WP — `npx tsc --noEmit`, `npx eslint <file>`, e `npx vitest run <testfile>` per le funzioni pure. Lo scanner (fotocamera) si prova solo sul campo (deploy Vercel).

---

### Task 1: Migration `limitazione_misuratori_ref`

**Files:**
- Create: `supabase/migrations/20260612000000_limitazione_misuratori_ref.sql`

- [ ] **Step 1: Scrivi la migration** (pattern identico a `20260609010000_risanamento_fase1.sql`)

```sql
-- ============================================================================
-- Limitazioni massive — tabella di riferimento misuratori censiti (separata da Resine)
-- ============================================================================
-- matricola = chiave del lookup; committente distingue il dataset (per ora solo 'acea').
-- Nessun UNIQUE su matricola: l'anagrafica puo' essere sporca (duplicati / prefisso variabile).
create table if not exists limitazione_misuratori_ref (
  id bigserial primary key,
  import_id uuid not null,
  committente text not null default 'acea',
  indirizzo text not null default '',
  civico text not null default '',
  comune text not null default '',
  cap text not null default '',
  pdr text not null default '',
  matricola text not null,
  nominativo text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_lim_ref_matricola on limitazione_misuratori_ref (matricola);
create index if not exists idx_lim_ref_committente on limitazione_misuratori_ref (committente);
create index if not exists idx_lim_ref_import on limitazione_misuratori_ref (import_id);

alter table limitazione_misuratori_ref enable row level security;
drop policy if exists lim_ref_all_auth on limitazione_misuratori_ref;
create policy lim_ref_all_auth on limitazione_misuratori_ref
  for all to authenticated using (true) with check (true);

-- Vista catalogo import (per la lista nella schermata admin).
create or replace view limitazione_import_catalog as
select
  import_id,
  count(*)::int          as righe,
  min(created_at)        as caricato_at,
  max(indirizzo)         as indirizzo_campione
from limitazione_misuratori_ref
group by import_id;
```

- [ ] **Step 2: Verifica sintattica visiva**

Confronta col file `supabase/migrations/20260609010000_risanamento_fase1.sql` (stessa forma per tabella/indici/RLS/vista). Non c'è DB locale: l'applicazione su prod la fa l'utente (vedi Prerequisiti).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260612000000_limitazione_misuratori_ref.sql
git commit -m "feat(limitazioni): migration limitazione_misuratori_ref + vista catalogo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Import route dataset-aware

**Files:**
- Modify: `app/api/admin/risanamento/import-misuratori/route.ts`

- [ ] **Step 1: Aggiungi un helper per risolvere tabella e vista da `attivita`** (in cima al file, dopo `const BATCH = 500;`)

```ts
type Dataset = { tabella: 'risanamento_misuratori_ref' | 'limitazione_misuratori_ref'; vista: 'risanamento_import_catalog' | 'limitazione_import_catalog' };
function risolviDataset(attivita: string | null): Dataset {
  return (attivita ?? '').toLowerCase() === 'limitazione'
    ? { tabella: 'limitazione_misuratori_ref', vista: 'limitazione_import_catalog' }
    : { tabella: 'risanamento_misuratori_ref', vista: 'risanamento_import_catalog' };
}
function committenteValido(c: string | null): 'acea' | 'italgas' {
  return c === 'italgas' ? 'italgas' : 'acea';
}
```

- [ ] **Step 2: POST — leggi `attivita`/`committente` dal form e instrada l'insert**

Nel `POST`, dopo `const form = await req.formData();` e la lettura di `file`, aggiungi la lettura dei due campi e calcola il dataset:

```ts
  const attivita = (form.get('attivita') as string | null);
  const committente = committenteValido(form.get('committente') as string | null);
  const ds = risolviDataset(attivita);
```

Poi modifica la costruzione del `payload` e l'insert (sostituendo le righe attuali `const payload = ...` e il loop `for (...) supabaseAdmin.from('risanamento_misuratori_ref').insert(chunk)`):

```ts
  const importId = randomUUID();
  const isLim = ds.tabella === 'limitazione_misuratori_ref';
  const payload = parsed.records.map((r: MisuratoreRefInput) => ({
    ...r,
    import_id: importId,
    ...(isLim ? { committente } : {}),
  }));

  let inseriti = 0;
  for (let i = 0; i < payload.length; i += BATCH) {
    const chunk = payload.slice(i, i + BATCH);
    const { error } = await supabaseAdmin.from(ds.tabella).insert(chunk);
    if (error) return NextResponse.json({ error: error.message, inseriti_parziali: inseriti }, { status: 500 });
    inseriti += chunk.length;
  }
```

- [ ] **Step 3: GET — catalogo dalla vista del dataset richiesto**

Sostituisci nel `GET` la query sulla vista fissa con il dataset risolto da `?attivita=`:

```ts
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const ds = risolviDataset(new URL(req.url).searchParams.get('attivita'));
  const { data, error } = await supabaseAdmin
    .from(ds.vista)
    .select('import_id, righe, caricato_at, indirizzo_campione')
    .order('caricato_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
```

- [ ] **Step 4: DELETE — elimina dall'`import_id` sulla tabella del dataset**

Sostituisci nel `DELETE` la tabella fissa con quella risolta da `?attivita=`:

```ts
export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const url = new URL(req.url);
  const importId = url.searchParams.get('import_id');
  if (!importId) return NextResponse.json({ error: 'import_id mancante.' }, { status: 400 });
  const ds = risolviDataset(url.searchParams.get('attivita'));
  const { error } = await supabaseAdmin.from(ds.tabella).delete().eq('import_id', importId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Verifica tipi/lint**

Run: `npx tsc --noEmit` ed `npx eslint app/api/admin/risanamento/import-misuratori/route.ts`
Expected: nessun nuovo errore sui file toccati.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/risanamento/import-misuratori/route.ts
git commit -m "feat(limitazioni): import misuratori dataset-aware (attivita+committente)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: ImportMisuratoriClient — selettori dataset/committente

**Files:**
- Modify: `app/impostazioni/risanamento-misuratori/ImportMisuratoriClient.tsx`

- [ ] **Step 1: Aggiungi stato dataset/committente** (dopo `const [refSample, setRefSample] = useState(...)`)

```ts
  const [dataset, setDataset] = useState<'resine' | 'limitazione'>('resine');
  const [committente, setCommittente] = useState<'acea' | 'italgas'>('acea');
```

- [ ] **Step 2: Ricarica il catalogo quando cambia il dataset**

Modifica l'effetto di caricamento iniziale per dipendere dal dataset (sostituisci `useEffect(() => { void carica(); }, [carica]);`):

```ts
  useEffect(() => { void carica(); }, [carica, dataset]);
```

E rendi `carica` consapevole del dataset (sostituisci la funzione `carica`):

```ts
  const carica = useCallback(async () => {
    const res = await fetch(`${ENDPOINT}?attivita=${dataset}`);
    if (res.ok) setLista((await res.json()) as ImportRow[]);
    else setEsito({ type: 'err', msg: 'Impossibile caricare la lista (DB non ancora migrato?).' });
  }, [dataset]);
```

- [ ] **Step 3: Invia dataset/committente all'import e all'eliminazione**

Nella funzione `importa`, dopo `fd.append('file', file, file.name);` aggiungi:

```ts
      fd.append('attivita', dataset);
      fd.append('committente', committente);
```

Nella funzione `elimina(importId)`, sostituisci la `fetch` con:

```ts
      const res = await fetch(`${ENDPOINT}?import_id=${encodeURIComponent(importId)}&attivita=${dataset}`, { method: 'DELETE' });
```

- [ ] **Step 4: Aggiungi i selettori in UI** (subito dopo `<h2 ...>Importa estrazione</h2>` nel primo riquadro)

```tsx
        <div className="mb-4 grid grid-cols-2 gap-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
            Attività
            <select value={dataset} onChange={(e) => setDataset(e.target.value as 'resine' | 'limitazione')}
              className="mt-1 block w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-sm text-[var(--brand-text-main)]">
              <option value="resine">Resine (risanamento)</option>
              <option value="limitazione">Limitazioni massive</option>
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
            Committente
            <select value={committente} onChange={(e) => setCommittente(e.target.value as 'acea' | 'italgas')}
              className="mt-1 block w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-sm text-[var(--brand-text-main)]">
              <option value="acea">Acea</option>
              <option value="italgas">Italgas</option>
            </select>
          </label>
        </div>
```

- [ ] **Step 5: Mostra la "Pulizia righe di riferimento" solo per Resine** (la pulizia per-via usa l'endpoint risanamento; per Limitazioni si elimina l'intero import dalla lista)

Avvolgi l'intero terzo riquadro `<div className="rounded-2xl ...">…Pulizia righe di riferimento…</div>` in:

```tsx
        {dataset === 'resine' && (
          /* …blocco Pulizia righe di riferimento invariato… */
        )}
```

- [ ] **Step 6: Verifica tipi/lint**

Run: `npx tsc --noEmit` ed `npx eslint app/impostazioni/risanamento-misuratori/ImportMisuratoriClient.tsx`
Expected: nessun nuovo errore.

- [ ] **Step 7: Commit**

```bash
git add app/impostazioni/risanamento-misuratori/ImportMisuratoriClient.tsx
git commit -m "feat(limitazioni): selettori dataset/committente nell'estrazione misuratori

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `matricoleSimili` (funzione pura, TDD)

**Files:**
- Create: `lib/limitazione/matricoleSimili.ts`
- Test: `lib/limitazione/matricoleSimili.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
import { describe, it, expect } from 'vitest';
import { normMatricola, matricoleSimili } from './matricoleSimili';

describe('normMatricola', () => {
  it('maiuscolo e rimuove spazi/trattini/non-alfanumerici', () => {
    expect(normMatricola(' a-023 041 ')).toBe('A023041');
  });
});

describe('matricoleSimili', () => {
  const db = (...m: string[]) => m.map((matricola) => ({ matricola }));

  it('prefisso variabile: A023041 suggerisce 99A023041', () => {
    const r = matricoleSimili('A023041', db('99A023041', 'B999999'));
    expect(r.map((x) => x.matricola)).toEqual(['99A023041']);
  });

  it('caso inverso: 99A023041 suggerisce A023041', () => {
    const r = matricoleSimili('99A023041', db('A023041'));
    expect(r.map((x) => x.matricola)).toEqual(['A023041']);
  });

  it('ordina esatto > suffisso > prefisso > contenimento', () => {
    const r = matricoleSimili('A023041', db('XA023041Y', '99A023041', 'A023041', 'A023041Z'));
    expect(r.map((x) => x.matricola)).toEqual(['A023041', '99A023041', 'A023041Z', 'XA023041Y']);
  });

  it('query troppo corta (<4) → nessun suggerimento', () => {
    expect(matricoleSimili('A02', db('99A023041'))).toEqual([]);
  });

  it('taglia a max (default 8)', () => {
    const many = db(...Array.from({ length: 20 }, (_, i) => `A023041_${i}`));
    expect(matricoleSimili('A023041', many)).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Esegui il test → deve fallire**

Run: `npx vitest run lib/limitazione/matricoleSimili.test.ts`
Expected: FAIL (modulo non trovato).

- [ ] **Step 3: Implementa la funzione**

```ts
/** Normalizza una matricola per il confronto: maiuscolo, solo A–Z/0–9. */
export function normMatricola(v: unknown): string {
  return String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export type CandidatoMatricola = { matricola: string };

/** Punteggio di vicinanza: più basso = più simile; -1 = non simile. */
function punteggio(q: string, cand: string): number {
  if (!q || !cand) return -1;
  if (q === cand) return 0;
  if (cand.endsWith(q) || q.endsWith(cand)) return 1;
  if (cand.startsWith(q) || q.startsWith(cand)) return 2;
  if (cand.includes(q) || q.includes(cand)) return 3;
  return -1;
}

/**
 * Fino a `max` candidati simili a `q`, ordinati per vicinanza (esatto > suffisso > prefisso > contenimento;
 * a parità, minore differenza di lunghezza, poi alfabetico). Containment richiede `q` normalizzata ≥ `minLen`.
 */
export function matricoleSimili<T extends CandidatoMatricola>(
  q: string,
  candidati: T[],
  max = 8,
  minLen = 4,
): T[] {
  const nq = normMatricola(q);
  if (nq.length < minLen) return [];
  const scored: Array<{ item: T; p: number; diff: number }> = [];
  for (const c of candidati) {
    const nc = normMatricola(c.matricola);
    const p = punteggio(nq, nc);
    if (p < 0) continue;
    scored.push({ item: c, p, diff: Math.abs(nc.length - nq.length) });
  }
  scored.sort((a, b) => a.p - b.p || a.diff - b.diff || a.item.matricola.localeCompare(b.item.matricola));
  return scored.slice(0, max).map((s) => s.item);
}
```

- [ ] **Step 4: Esegui il test → deve passare**

Run: `npx vitest run lib/limitazione/matricoleSimili.test.ts`
Expected: PASS (tutti i casi).

- [ ] **Step 5: Commit**

```bash
git add lib/limitazione/matricoleSimili.ts lib/limitazione/matricoleSimili.test.ts
git commit -m "feat(limitazioni): matricoleSimili (similarità bidirezionale + suffix-aware)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `autofillAnagrafica` (funzione pura, TDD)

**Files:**
- Create: `lib/limitazione/autofillAnagrafica.ts`
- Test: `lib/limitazione/autofillAnagrafica.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
import { describe, it, expect } from 'vitest';
import { autofillAnagrafica, type CensitoMisuratore } from './autofillAnagrafica';

const base: CensitoMisuratore = {
  matricola: 'A023041', pdr: '00123', nominativo: 'Rossi Mario',
  indirizzo: 'Via Roma', civico: '12', comune: 'Firenze', cap: '50100',
};

describe('autofillAnagrafica', () => {
  it('mappa i campi e concatena civico alla via', () => {
    expect(autofillAnagrafica(base)).toEqual({
      matricola: 'A023041', pdr: '00123', nominativo: 'Rossi Mario',
      via: 'Via Roma 12', comune: 'Firenze', cap: '50100',
    });
  });

  it('omette i campi vuoti', () => {
    expect(autofillAnagrafica({ matricola: 'X1', indirizzo: 'Via Po' })).toEqual({
      matricola: 'X1', via: 'Via Po',
    });
  });
});
```

- [ ] **Step 2: Esegui il test → deve fallire**

Run: `npx vitest run lib/limitazione/autofillAnagrafica.test.ts`
Expected: FAIL (modulo non trovato).

- [ ] **Step 3: Implementa la funzione**

```ts
import type { AnagraficaManuale } from '@/lib/interventi/manuali/types';

/** Misuratore censito come ritornato dall'endpoint di ricerca. */
export type CensitoMisuratore = {
  matricola: string;
  pdr?: string | null;
  nominativo?: string | null;
  indirizzo?: string | null;
  civico?: string | null;
  comune?: string | null;
  cap?: string | null;
};

const s = (v: unknown): string => String(v ?? '').trim();

/** Mappa un censito nei campi anagrafica della modale manuale.
 *  Non esiste una chiave 'civico' tra gli InfoChiave: il civico si concatena alla via. */
export function autofillAnagrafica(m: CensitoMisuratore): AnagraficaManuale {
  const via = [s(m.indirizzo), s(m.civico)].filter(Boolean).join(' ');
  const out: AnagraficaManuale = {};
  if (s(m.matricola)) out.matricola = s(m.matricola);
  if (s(m.pdr)) out.pdr = s(m.pdr);
  if (s(m.nominativo)) out.nominativo = s(m.nominativo);
  if (via) out.via = via;
  if (s(m.comune)) out.comune = s(m.comune);
  if (s(m.cap)) out.cap = s(m.cap);
  return out;
}
```

- [ ] **Step 4: Esegui il test → deve passare**

Run: `npx vitest run lib/limitazione/autofillAnagrafica.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/limitazione/autofillAnagrafica.ts lib/limitazione/autofillAnagrafica.test.ts
git commit -m "feat(limitazioni): autofillAnagrafica (censito -> campi anagrafica)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Enum `CommittenteManuale` + `etichettaCommittente` (TDD) + fix tipo context

**Files:**
- Modify: `lib/interventi/manuali/types.ts:10`
- Modify: `lib/interventi/manuali/richiestaToIntervento.ts:8`
- Create: `lib/interventi/manuali/etichettaCommittente.ts`
- Test: `lib/interventi/manuali/etichettaCommittente.test.ts`

- [ ] **Step 1: Allarga l'enum committente**

In `lib/interventi/manuali/types.ts` sostituisci la riga 10:

```ts
export type CommittenteManuale = 'acea' | 'italgas' | 'altro' | 'lim_massive';
```

- [ ] **Step 2: Allarga il tipo del context intervento** (altrimenti i call-site passano `lim_massive` a un tipo ristretto)

In `lib/interventi/manuali/richiestaToIntervento.ts`, aggiungi l'import in cima e cambia il campo `committente` del context:

```ts
import type { CommittenteManuale, DatiInterventoManuale } from './types';
```
e nel tipo `ContextInterventoManuale`:
```ts
  committente: CommittenteManuale;
```
(rimuovi il vecchio `import type { DatiInterventoManuale } from './types';` duplicato se presente.)

- [ ] **Step 3: Scrivi il test della label (fallisce)**

```ts
import { describe, it, expect } from 'vitest';
import { etichettaCommittente } from './etichettaCommittente';

describe('etichettaCommittente', () => {
  it('mappa i valori noti', () => {
    expect(etichettaCommittente('acea')).toBe('Acea');
    expect(etichettaCommittente('italgas')).toBe('Italgas');
    expect(etichettaCommittente('altro')).toBe('Altro');
    expect(etichettaCommittente('lim_massive')).toBe('Limitazioni massive');
  });
  it('fallback al valore grezzo se sconosciuto', () => {
    expect(etichettaCommittente('xxx')).toBe('xxx');
    expect(etichettaCommittente(null)).toBe('');
  });
});
```

- [ ] **Step 4: Esegui il test → deve fallire**

Run: `npx vitest run lib/interventi/manuali/etichettaCommittente.test.ts`
Expected: FAIL (modulo non trovato).

- [ ] **Step 5: Implementa la label**

```ts
import type { CommittenteManuale } from './types';

const ETICHETTE: Record<CommittenteManuale, string> = {
  acea: 'Acea',
  italgas: 'Italgas',
  altro: 'Altro',
  lim_massive: 'Limitazioni massive',
};

/** Etichetta leggibile del committente; fallback al valore grezzo se sconosciuto. */
export function etichettaCommittente(c: CommittenteManuale | string | null | undefined): string {
  return (c != null && (ETICHETTE as Record<string, string>)[c]) || String(c ?? '');
}
```

- [ ] **Step 6: Esegui test + tipi**

Run: `npx vitest run lib/interventi/manuali/etichettaCommittente.test.ts` → PASS
Run: `npx tsc --noEmit` → nessun nuovo errore (verifica che l'allargamento enum non rompa nulla).

- [ ] **Step 7: Commit**

```bash
git add lib/interventi/manuali/types.ts lib/interventi/manuali/richiestaToIntervento.ts lib/interventi/manuali/etichettaCommittente.ts lib/interventi/manuali/etichettaCommittente.test.ts
git commit -m "feat(limitazioni): committente lim_massive + etichettaCommittente

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Endpoint di ricerca `cerca-limitazione`

**Files:**
- Create: `app/api/r/[token]/cerca-limitazione/route.ts`

- [ ] **Step 1: Scrivi la route** (guard token come `lookup-misuratore`; esatto poi simili)

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { matricoleSimili } from '@/lib/limitazione/matricoleSimili';

export const runtime = 'nodejs';

const COMMITTENTE_LIMITAZIONE = 'acea';
const CAMPI = 'id, matricola, pdr, nominativo, indirizzo, civico, comune, cap';

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ error: 'q obbligatorio' }, { status: 400 });

  const { data: rap } = await supabaseAdmin
    .from('rapportini').select('id, stato, data, riaperto_at').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  // 1) match esatto
  const { data: esatti } = await supabaseAdmin
    .from('limitazione_misuratori_ref')
    .select(CAMPI)
    .eq('committente', COMMITTENTE_LIMITAZIONE)
    .eq('matricola', q)
    .limit(1);
  if (esatti && esatti.length > 0) {
    return NextResponse.json({ trovato: true, misuratore: esatti[0] });
  }

  // 2) nessun esatto → suggerimenti simili (bidirezionali) sul dataset committente=acea.
  //    Dataset per comune limitato (poche migliaia di righe): carichiamo fino a 2000 e filtriamo con la pura.
  const { data: rows } = await supabaseAdmin
    .from('limitazione_misuratori_ref')
    .select(CAMPI)
    .eq('committente', COMMITTENTE_LIMITAZIONE)
    .limit(2000);
  const suggerimenti = matricoleSimili(q, (rows ?? []) as Array<{ matricola: string }>, 8);
  return NextResponse.json({ trovato: false, suggerimenti });
}
```

- [ ] **Step 2: Verifica tipi/lint**

Run: `npx tsc --noEmit` ed `npx eslint "app/api/r/[token]/cerca-limitazione/route.ts"`
Expected: nessun nuovo errore.

- [ ] **Step 3: Commit**

```bash
git add "app/api/r/[token]/cerca-limitazione/route.ts"
git commit -m "feat(limitazioni): endpoint cerca-limitazione (esatto + simili)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Step "Cerca matricola" nella modale

**Files:**
- Create: `components/modules/rapportini/limitazione/CercaMatricolaLimitazione.tsx`
- Modify: `components/modules/rapportini/ModaleInterventoManuale.tsx`

- [ ] **Step 1: Crea il componente di ricerca** (riusa `ScannerMisuratore` di Resine)

```tsx
'use client';

import { useState } from 'react';
import { ScannerMisuratore } from '@/components/modules/rapportini/risanamento/ScannerMisuratore';
import type { CensitoMisuratore } from '@/lib/limitazione/autofillAnagrafica';

export function CercaMatricolaLimitazione({
  token,
  onTrovato,
  onManuale,
  onIndietro,
}: {
  token: string;
  onTrovato: (m: CensitoMisuratore) => void;
  onManuale: (matricola: string) => void;
  onIndietro: () => void;
}) {
  const [q, setQ] = useState('');
  const [scanner, setScanner] = useState(false);
  const [cercando, setCercando] = useState(false);
  const [suggerimenti, setSuggerimenti] = useState<CensitoMisuratore[] | null>(null);
  const [nonTrovato, setNonTrovato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const cerca = async (valore: string) => {
    const v = valore.trim();
    if (!v) return;
    setCercando(true); setErrore(null); setNonTrovato(false); setSuggerimenti(null);
    try {
      const res = await fetch(`/api/r/${token}/cerca-limitazione?q=${encodeURIComponent(v)}`);
      if (!res.ok) { setErrore('Ricerca non riuscita.'); return; }
      const j = (await res.json()) as
        | { trovato: true; misuratore: CensitoMisuratore }
        | { trovato: false; suggerimenti: CensitoMisuratore[] };
      if (j.trovato) { onTrovato(j.misuratore); return; }
      setSuggerimenti(j.suggerimenti);
      setNonTrovato(true);
    } catch {
      setErrore('Errore di rete.');
    } finally {
      setCercando(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-[var(--brand-text-muted)]">Cerca matricola</p>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="text"
          placeholder="Matricola misuratore"
          aria-label="Matricola"
          value={q}
          onChange={(e) => { setQ(e.target.value); setNonTrovato(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void cerca(q); }}
          className="min-w-0 flex-1 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
        />
        <button type="button" onClick={() => setScanner(true)} className="shrink-0 rounded-lg border border-[var(--brand-primary)] px-3 py-2 text-sm font-semibold text-[var(--brand-primary)]">📷</button>
        <button type="button" disabled={cercando || !q.trim()} onClick={() => void cerca(q)} className="shrink-0 rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] disabled:opacity-50">{cercando ? '…' : 'Cerca'}</button>
      </div>

      {errore && <p className="text-sm font-medium text-[var(--danger)]">{errore}</p>}

      {nonTrovato && (
        <div className="space-y-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
          <p className="text-sm font-medium text-[var(--brand-text-main)]">Matricola non censita.</p>
          {suggerimenti && suggerimenti.length > 0 && (
            <>
              <p className="text-xs text-[var(--brand-text-muted)]">Forse intendevi:</p>
              <ul className="space-y-1">
                {suggerimenti.map((s) => (
                  <li key={s.matricola}>
                    <button type="button" onClick={() => onTrovato(s)} className="w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-left text-sm text-[var(--brand-text-main)] hover:border-[var(--brand-primary)]">
                      <span className="font-semibold">{s.matricola}</span>
                      <span className="ml-2 text-xs text-[var(--brand-text-muted)]">{[s.indirizzo, s.civico, s.comune].filter(Boolean).join(' ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button type="button" onClick={() => onManuale(q.trim())} className="w-full rounded-lg border border-dashed border-[var(--brand-border)] px-3 py-2 text-sm font-semibold text-[var(--brand-text-muted)] hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]">
            Inserisci a mano questa matricola
          </button>
        </div>
      )}

      <button type="button" onClick={onIndietro} className="rounded-xl border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] px-4 py-3 font-bold text-[var(--brand-text-main)]">Indietro</button>

      {scanner && (
        <ScannerMisuratore onCodice={(codice) => { setScanner(false); setQ(codice); void cerca(codice); }} onChiudi={() => setScanner(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Aggiorna gli import della modale** (in cima a `ModaleInterventoManuale.tsx`)

```ts
import { CercaMatricolaLimitazione } from './limitazione/CercaMatricolaLimitazione';
import { autofillAnagrafica } from '@/lib/limitazione/autofillAnagrafica';
```

- [ ] **Step 3: Aggiungi l'opzione nel selettore committente** (sostituisci la const `COMMITTENTI`)

```ts
const COMMITTENTI: { value: CommittenteManuale; label: string }[] = [
  { value: 'italgas', label: 'Italgas' },
  { value: 'acea', label: 'Acea' },
  { value: 'lim_massive', label: 'Limitazioni massive' },
  { value: 'altro', label: 'Altro' },
];
```

Inoltre, con 4 opzioni, porta il grid del picker da 3 a 2 colonne: sostituisci `<div className="grid grid-cols-3 gap-2">` con `<div className="grid grid-cols-2 gap-2">`.

- [ ] **Step 4: Aggiungi lo stato `cercaFatta`** (dopo `const [errore, setErrore] = useState<string | null>(null);`)

```ts
  const [cercaFatta, setCercaFatta] = useState(false);
```

- [ ] **Step 5: Reset `cercaFatta` quando si sceglie il committente** (nel bottone del picker, `onClick`)

Sostituisci `onClick={() => { setCommittente(c.value); setStep(2); }}` con:

```tsx
                  onClick={() => { setCommittente(c.value); setStep(2); setCercaFatta(false); }}
```

- [ ] **Step 6: Inserisci lo step "Cerca matricola" prima dell'anagrafica** (sostituisci l'apertura del blocco `{step === 2 && (` con il ramo condizionale)

```tsx
        {step === 2 && committente === 'lim_massive' && !cercaFatta && (
          <CercaMatricolaLimitazione
            token={token}
            onTrovato={(m) => { setAnagrafica((prev) => ({ ...prev, ...autofillAnagrafica(m) })); setCercaFatta(true); }}
            onManuale={(matricola) => { setAnagrafica((prev) => ({ ...prev, matricola })); setCercaFatta(true); }}
            onIndietro={() => setStep(1)}
          />
        )}

        {step === 2 && !(committente === 'lim_massive' && !cercaFatta) && (
```

(La parentesi di chiusura `)}` esistente dello step 2 resta invariata: ora chiude il secondo blocco.)

- [ ] **Step 7: Verifica tipi/lint**

Run: `npx tsc --noEmit` ed `npx eslint components/modules/rapportini/ModaleInterventoManuale.tsx components/modules/rapportini/limitazione/CercaMatricolaLimitazione.tsx`
Expected: nessun nuovo errore.

- [ ] **Step 8: Commit**

```bash
git add components/modules/rapportini/ModaleInterventoManuale.tsx components/modules/rapportini/limitazione/CercaMatricolaLimitazione.tsx
git commit -m "feat(limitazioni): step Cerca matricola (scan/digita + autofill) nella modale

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Glue submit — committente valido + template map

**Files:**
- Modify: `app/api/r/[token]/intervento-manuale/route.ts:18`
- Modify: `app/r/[token]/page.tsx` (≈ riga 205)

- [ ] **Step 1: Aggiungi `lim_massive` ai committenti accettati dalla route**

In `app/api/r/[token]/intervento-manuale/route.ts` sostituisci la riga 18:

```ts
const COMMITTENTI: CommittenteManuale[] = ['acea', 'italgas', 'altro', 'lim_massive'];
```

- [ ] **Step 2: Includi `lim_massive` nella mappa `templatesPerCommittente`**

In `app/r/[token]/page.tsx`, nel loop di costruzione, sostituisci la condizione:

```ts
    if (t.committente === 'acea' || t.committente === 'italgas' || t.committente === 'altro' || t.committente === 'lim_massive') {
```

- [ ] **Step 3: Verifica tipi/lint**

Run: `npx tsc --noEmit` ed `npx eslint "app/api/r/[token]/intervento-manuale/route.ts" "app/r/[token]/page.tsx"`
Expected: nessun nuovo errore.

- [ ] **Step 4: Commit**

```bash
git add "app/api/r/[token]/intervento-manuale/route.ts" "app/r/[token]/page.tsx"
git commit -m "feat(limitazioni): accetta committente lim_massive nel submit + template map

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Lista Attesa — abilita lim_massive + etichette

**Files:**
- Modify: `app/hub/lista-attesa/page.tsx:43`
- Modify: `components/modules/lista-attesa/CodaRichiesteManuali.tsx:68`
- Modify: `components/modules/lista-attesa/PannelloRevisioneRichiesta.tsx:58`
- Modify: `components/modules/lista-attesa/RegistroAutorizzazioni.tsx` (filtro + cella)

- [ ] **Step 1: Aggiungi `lim_massive` ai committenti manuali** (così i campi esito si risolvono in revisione)

In `app/hub/lista-attesa/page.tsx` sostituisci la riga 43:

```ts
  const COMMITTENTI_MANUALI: CommittenteManuale[] = ['acea', 'italgas', 'altro', 'lim_massive'];
```

- [ ] **Step 2: Etichetta committente nella coda**

In `CodaRichiesteManuali.tsx` aggiungi l'import:
```ts
import { etichettaCommittente } from '@/lib/interventi/manuali/etichettaCommittente';
```
e sostituisci `{r.staff_name ?? r.staff_id} · {r.committente}` (riga ~68) con:
```tsx
                    <span className="text-sm font-semibold text-[var(--brand-text-main)]">{r.staff_name ?? r.staff_id} · {etichettaCommittente(r.committente)}</span>
```

- [ ] **Step 3: Etichetta committente nel pannello di revisione**

In `PannelloRevisioneRichiesta.tsx` aggiungi l'import:
```ts
import { etichettaCommittente } from '@/lib/interventi/manuali/etichettaCommittente';
```
e sostituisci `· {riga.committente} ·` (riga 58) con:
```tsx
      <p className="text-sm font-semibold text-[var(--brand-text-muted)]">{riga.staff_name ?? riga.staff_id} · {etichettaCommittente(riga.committente)} · {riga.data}</p>
```

- [ ] **Step 4: Registro — opzione filtro + cella**

In `RegistroAutorizzazioni.tsx` aggiungi l'opzione dopo `<option value="altro">Altro</option>` (riga ~108):
```tsx
          <option value="lim_massive">Limitazioni massive</option>
```
Aggiungi l'import:
```ts
import { etichettaCommittente } from '@/lib/interventi/manuali/etichettaCommittente';
```
e sostituisci la cella `<td className="px-3 py-2">{r.committente}</td>` (riga ~149) con:
```tsx
                  <td className="px-3 py-2">{etichettaCommittente(r.committente)}</td>
```

- [ ] **Step 5: Verifica tipi/lint**

Run: `npx tsc --noEmit` ed `npx eslint app/hub/lista-attesa/page.tsx components/modules/lista-attesa/CodaRichiesteManuali.tsx components/modules/lista-attesa/PannelloRevisioneRichiesta.tsx components/modules/lista-attesa/RegistroAutorizzazioni.tsx`
Expected: nessun nuovo errore.

- [ ] **Step 6: Commit**

```bash
git add app/hub/lista-attesa/page.tsx components/modules/lista-attesa/CodaRichiesteManuali.tsx components/modules/lista-attesa/PannelloRevisioneRichiesta.tsx components/modules/lista-attesa/RegistroAutorizzazioni.tsx
git commit -m "feat(limitazioni): Lista Attesa abilita lim_massive + etichette committente

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Endpoint foto richiesta (signed URL)

**Files:**
- Create: `app/api/admin/interventi-manuali/[id]/foto/route.ts`

- [ ] **Step 1: Scrivi la route** (admin; signed URL dal bucket privato)

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

const TTL = 60 * 10; // 10 minuti

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { data: foto, error } = await supabaseAdmin
    .from('interventi_manuali_foto')
    .select('id, slot_etichetta, storage_path, file_name')
    .eq('richiesta_id', id)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out: Array<{ id: string; etichetta: string; fileName: string; url: string | null }> = [];
  for (const f of (foto ?? []) as Array<{ id: string; slot_etichetta: string; storage_path: string; file_name: string }>) {
    const { data: signed } = await supabaseAdmin.storage.from('interventi-foto').createSignedUrl(f.storage_path, TTL);
    out.push({ id: f.id, etichetta: f.slot_etichetta, fileName: f.file_name, url: signed?.signedUrl ?? null });
  }
  return NextResponse.json({ foto: out });
}
```

- [ ] **Step 2: Verifica tipi/lint**

Run: `npx tsc --noEmit` ed `npx eslint "app/api/admin/interventi-manuali/[id]/foto/route.ts"`
Expected: nessun nuovo errore.

- [ ] **Step 3: Commit**

```bash
git add "app/api/admin/interventi-manuali/[id]/foto/route.ts"
git commit -m "feat(limitazioni): endpoint foto richiesta manuale (signed URL)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Galleria foto nel pannello di revisione

**Files:**
- Modify: `components/modules/lista-attesa/PannelloRevisioneRichiesta.tsx`

- [ ] **Step 1: Aggiorna gli import** (aggiungi `useEffect`)

Sostituisci `import { useMemo, useState } from 'react';` con:
```ts
import { useEffect, useMemo, useState } from 'react';
```

- [ ] **Step 2: Aggiungi stato + fetch foto** (dopo `const campiAnag = useMemo(...)`)

```ts
  const [foto, setFoto] = useState<Array<{ id: string; etichetta: string; url: string | null }>>([]);
  useEffect(() => {
    let attivo = true;
    fetch(`/api/admin/interventi-manuali/${riga.id}/foto`)
      .then((r) => (r.ok ? r.json() : { foto: [] }))
      .then((j: { foto?: Array<{ id: string; etichetta: string; url: string | null }> }) => { if (attivo) setFoto(j.foto ?? []); })
      .catch(() => { /* foto opzionali: errore silenzioso */ });
    return () => { attivo = false; };
  }, [riga.id]);
```

- [ ] **Step 3: Renderizza la galleria** (subito prima del blocco `<div className="flex gap-2">` dei bottoni Approva/Rifiuta)

```tsx
      {foto.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Foto ({foto.length})</p>
          <div className="flex flex-wrap gap-2">
            {foto.map((f) => f.url && (
              <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" title={f.etichetta} className="block h-20 w-20 overflow-hidden rounded-lg border border-[var(--brand-border)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.etichetta} className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Verifica tipi/lint**

Run: `npx tsc --noEmit` ed `npx eslint components/modules/lista-attesa/PannelloRevisioneRichiesta.tsx`
Expected: nessun nuovo errore.

- [ ] **Step 5: Commit**

```bash
git add components/modules/lista-attesa/PannelloRevisioneRichiesta.tsx
git commit -m "feat(limitazioni): galleria foto apribili nel pannello di revisione

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verifica finale (dopo tutti i task)
- [ ] `npx tsc --noEmit` → nessun errore introdotto dal WP.
- [ ] `npx vitest run lib/limitazione/matricoleSimili.test.ts lib/limitazione/autofillAnagrafica.test.ts lib/interventi/manuali/etichettaCommittente.test.ts` → PASS.
- [ ] Smoke sul deploy Vercel (con migration + template + import fatti): "+" → Limitazioni massive → Cerca `A023041` → seleziona `99A023041` → invio → compare in Lista Attesa con foto apribili → approva → riga + foto nel rapportino del giorno.

## Fuori scope
- Limitazioni **Italgas** nella ricerca (dataset importabile, ma la ricerca filtra `acea`).
- Autofill offline (la ricerca richiede rete; l'inserimento manuale funziona offline).
- Pulizia per-via dei censiti Limitazioni (per ora: eliminazione dell'intero import dalla lista).
- Persistenza del `ref_id` censito sull'intervento (i dati anagrafici validati bastano alla revisione).
