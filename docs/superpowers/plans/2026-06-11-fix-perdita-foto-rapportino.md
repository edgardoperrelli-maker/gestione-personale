# Fix perdita foto rapportino — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedire che le foto scattate dall'operatore si perdano (sovrascrittura `/voce` + strand post-invio) e rendere visibile all'ufficio quando un rapportino ha foto ancora in sospeso.

**Architecture:** Estrarre la logica di merge in util puri testabili; far salvare `/voce` con merge per-chiave invece di sovrascrittura totale; aprire una "finestra di grazia" che, finché esistono segnaposto `blob-locale:`, permette il completamento delle foto anche su rapportino inviato (`/foto-campo` carica su storage, `/voce` applica solo le transizioni segnaposto→path); esporre un conteggio `fotoInSospeso` derivato nel riepilogo con badge in UI. Nessuna migrazione, nessuna SQL.

**Tech Stack:** Next.js (route handlers, runtime nodejs), Supabase JS, TypeScript, Vitest (alias `@/` → root, `environment: node`).

**Spec di riferimento:** `docs/superpowers/specs/2026-06-11-fix-perdita-foto-rapportino-design.md`

**Note di contesto:**
- I segnaposto foto sono stringhe `blob-locale:<uuid>` ([lib/offline/fotoPlaceholder.ts](../../../lib/offline/fotoPlaceholder.ts), `isPlaceholderFoto`). I path reali sono stringhe `rapportini/<rapId>/<file>.jpg`.
- La baseline test/lint del repo è già parzialmente rossa: **verificare sempre i singoli file** con `npx vitest run <file>` (contano i nuovi test verdi), non l'intera suite.
- Comando test del progetto: `npx vitest run <path-del-test>`.

---

### Task 1: Util puro `mergeRisposte`

**Files:**
- Create: `utils/rapportini/mergeRisposte.ts`
- Test: `utils/rapportini/mergeRisposte.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Create `utils/rapportini/mergeRisposte.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mergeRisposte, eStoragePath } from './mergeRisposte';

const PATH_A = 'rapportini/r1/a.jpg';
const PATH_A2 = 'rapportini/r1/a2.jpg';
const PATH_B = 'rapportini/r1/b.jpg';
const PH = 'blob-locale:11111111-1111-1111-1111-111111111111';

describe('eStoragePath', () => {
  it('riconosce un path di storage reale', () => {
    expect(eStoragePath(PATH_A)).toBe(true);
    expect(eStoragePath(PH)).toBe(false);
    expect(eStoragePath('')).toBe(false);
    expect(eStoragePath(null)).toBe(false);
  });
});

describe('mergeRisposte — modalità normale', () => {
  it('le chiavi in arrivo vincono, le assenti restano', () => {
    const out = mergeRisposte({ a: PATH_A, b: PATH_B }, { a: PATH_A2 }, { soloCompletamentoFoto: false });
    expect(out).toEqual({ a: PATH_A2, b: PATH_B });
  });
  it('un salvataggio parziale NON azzera le altre foto (la regressione del bug)', () => {
    const out = mergeRisposte({ a: PATH_A, b: PATH_B, eseguito: 'SI' }, { eseguito: 'SI' }, { soloCompletamentoFoto: false });
    expect(out).toEqual({ a: PATH_A, b: PATH_B, eseguito: 'SI' });
  });
  it('un null esplicito cancella il campo', () => {
    const out = mergeRisposte({ a: PATH_A }, { a: null }, { soloCompletamentoFoto: false });
    expect(out).toEqual({ a: null });
  });
});

describe('mergeRisposte — modalità completamento foto (rapportino inviato)', () => {
  it('applica la transizione segnaposto → path reale', () => {
    const out = mergeRisposte({ a: PH, eseguito: 'SI' }, { a: PATH_A }, { soloCompletamentoFoto: true });
    expect(out).toEqual({ a: PATH_A, eseguito: 'SI' });
  });
  it('NON sovrascrive un path reale già presente', () => {
    const out = mergeRisposte({ a: PATH_A }, { a: PATH_A2 }, { soloCompletamentoFoto: true });
    expect(out).toEqual({ a: PATH_A });
  });
  it('ignora le modifiche a campi non-foto', () => {
    const out = mergeRisposte({ a: PH, note: 'x' }, { a: PATH_A, note: 'y' }, { soloCompletamentoFoto: true });
    expect(out).toEqual({ a: PATH_A, note: 'x' });
  });
  it('ignora una transizione segnaposto → segnaposto (non un path reale)', () => {
    const PH2 = 'blob-locale:22222222-2222-2222-2222-222222222222';
    const out = mergeRisposte({ a: PH }, { a: PH2 }, { soloCompletamentoFoto: true });
    expect(out).toEqual({ a: PH });
  });
});
```

- [ ] **Step 2: Esegui il test, deve fallire**

Run: `npx vitest run utils/rapportini/mergeRisposte.test.ts`
Expected: FAIL (modulo `./mergeRisposte` inesistente).

- [ ] **Step 3: Implementa il modulo**

Create `utils/rapportini/mergeRisposte.ts`:

```ts
import { isPlaceholderFoto } from '@/lib/offline/fotoPlaceholder';

/** True se il valore è un path di storage reale (foto già caricata su bucket). */
export function eStoragePath(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('rapportini/');
}

/**
 * Unisce le risposte esistenti con quelle in arrivo SENZA cancellare le chiavi
 * non inviate (l'opposto della vecchia sovrascrittura totale).
 *
 * - `soloCompletamentoFoto: false` (rapportino modificabile): le chiavi in arrivo
 *   vincono; le chiavi assenti restano invariate. Un `null` esplicito cancella.
 * - `soloCompletamentoFoto: true` (rapportino già inviato): applica SOLO le
 *   transizioni segnaposto → path reale (`blob-locale:…` → `rapportini/…`); ogni
 *   altra modifica è ignorata (un inviato non può essere alterato).
 */
export function mergeRisposte(
  esistenti: Record<string, unknown>,
  inArrivo: Record<string, unknown>,
  opts: { soloCompletamentoFoto: boolean },
): Record<string, unknown> {
  if (!opts.soloCompletamentoFoto) {
    return { ...esistenti, ...inArrivo };
  }
  const out: Record<string, unknown> = { ...esistenti };
  for (const [chiave, valore] of Object.entries(inArrivo)) {
    if (isPlaceholderFoto(esistenti[chiave]) && eStoragePath(valore)) {
      out[chiave] = valore;
    }
  }
  return out;
}
```

- [ ] **Step 4: Esegui il test, deve passare**

Run: `npx vitest run utils/rapportini/mergeRisposte.test.ts`
Expected: PASS (tutti verdi).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/mergeRisposte.ts utils/rapportini/mergeRisposte.test.ts
git commit -m "feat(rapportini): mergeRisposte — merge per-chiave + grazia placeholder→path

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Util puro `contaFotoInSospeso`

**Files:**
- Create: `utils/rapportini/fotoInSospeso.ts`
- Test: `utils/rapportini/fotoInSospeso.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Create `utils/rapportini/fotoInSospeso.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { contaFotoInSospeso } from './fotoInSospeso';

const PH = 'blob-locale:11111111-1111-1111-1111-111111111111';
const PH2 = 'blob-locale:22222222-2222-2222-2222-222222222222';
const PATH = 'rapportini/r1/a.jpg';

describe('contaFotoInSospeso', () => {
  it('0 con null/undefined/oggetto vuoto', () => {
    expect(contaFotoInSospeso(null)).toBe(0);
    expect(contaFotoInSospeso(undefined)).toBe(0);
    expect(contaFotoInSospeso({})).toBe(0);
  });
  it('0 quando tutti i valori sono path reali o non-foto', () => {
    expect(contaFotoInSospeso({ a: PATH, eseguito: 'SI', note: 'x' })).toBe(0);
  });
  it('conta i segnaposto scalari', () => {
    expect(contaFotoInSospeso({ a: PH, b: PATH, c: PH2 })).toBe(2);
  });
  it('conta i segnaposto dentro gli array', () => {
    expect(contaFotoInSospeso({ a: [PH, PATH, PH2] })).toBe(2);
  });
});
```

- [ ] **Step 2: Esegui il test, deve fallire**

Run: `npx vitest run utils/rapportini/fotoInSospeso.test.ts`
Expected: FAIL (modulo inesistente).

- [ ] **Step 3: Implementa il modulo**

Create `utils/rapportini/fotoInSospeso.ts`:

```ts
import { isPlaceholderFoto } from '@/lib/offline/fotoPlaceholder';

/**
 * Conta i segnaposto foto (`blob-locale:…`) presenti in una mappa di risposte.
 * Gestisce valori scalari e array (un campo foto può contenere più path).
 */
export function contaFotoInSospeso(
  risposte: Record<string, unknown> | null | undefined,
): number {
  if (!risposte) return 0;
  let n = 0;
  for (const v of Object.values(risposte)) {
    if (Array.isArray(v)) {
      n += v.filter(isPlaceholderFoto).length;
    } else if (isPlaceholderFoto(v)) {
      n += 1;
    }
  }
  return n;
}
```

- [ ] **Step 4: Esegui il test, deve passare**

Run: `npx vitest run utils/rapportini/fotoInSospeso.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/fotoInSospeso.ts utils/rapportini/fotoInSospeso.test.ts
git commit -m "feat(rapportini): contaFotoInSospeso — conta segnaposto blob-locale nelle risposte

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `/voce` — merge invece di sovrascrittura + finestra di grazia

**Files:**
- Modify: `app/api/r/[token]/voce/route.ts`

Sostituisce la sovrascrittura totale con `mergeRisposte`, accetta i rapportini `inviato` in sola modalità completamento-foto, rifiuta solo gli `scaduto`, e limita la propagazione live ai salvataggi `valido`.

- [ ] **Step 1: Aggiungi l'import di `mergeRisposte`**

In `app/api/r/[token]/voce/route.ts`, dopo l'import di `tokenStatus` (riga 3), aggiungi:

```ts
import { mergeRisposte } from '@/utils/rapportini/mergeRisposte';
```

- [ ] **Step 2: Sostituisci il gate di stato (righe 18-19)**

Vecchio:
```ts
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });
```

Nuovo:
```ts
  const stato = tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString());
  // 'inviato' è ammesso ma SOLO per completare le foto pendenti (vedi mergeRisposte);
  // 'scaduto' resta bloccato (l'ufficio può riaprire).
  if (stato === 'scaduto')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });
```

- [ ] **Step 3: Carica le risposte esistenti e applica il merge (righe 20-27)**

Vecchio:
```ts
  const { data: voce } = await supabaseAdmin
    .from('rapportino_voci')
    .select('id, intervento_id, raw_json')
    .eq('id', voceId)
    .eq('rapportino_id', rap.id)
    .maybeSingle();
  if (!voce) return NextResponse.json({ error: 'voce_non_valida' }, { status: 400 });
  const { error } = await supabaseAdmin.from('rapportino_voci').update({ risposte }).eq('id', voceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
```

Nuovo:
```ts
  const { data: voce } = await supabaseAdmin
    .from('rapportino_voci')
    .select('id, intervento_id, raw_json, risposte')
    .eq('id', voceId)
    .eq('rapportino_id', rap.id)
    .maybeSingle();
  if (!voce) return NextResponse.json({ error: 'voce_non_valida' }, { status: 400 });

  const esistenti = ((voce as { risposte: Record<string, unknown> | null }).risposte ?? {});
  const merged = mergeRisposte(esistenti, (risposte ?? {}) as Record<string, unknown>, {
    soloCompletamentoFoto: stato === 'inviato',
  });
  const { error } = await supabaseAdmin.from('rapportino_voci').update({ risposte: merged }).eq('id', voceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
```

- [ ] **Step 4: Limita la propagazione live ai salvataggi `valido` e usa `merged`**

Avvolgi il blocco `try { … } catch { … }` di propagazione (attuali righe 32-78) in una guardia di stato e usa `merged` al posto di `risposte` nella chiamata a `patchInterventoLiveDaVoce`.

Cambia l'inizio del blocco da:
```ts
  // Propagazione live (best-effort: ...).
  try {
```
a:
```ts
  // Propagazione live SOLO sui salvataggi di un rapportino ancora modificabile:
  // su un 'inviato' stiamo solo completando foto pendenti, non si ri-propaga l'esito.
  if (stato === 'valido') try {
```

E dentro al blocco cambia la riga:
```ts
      const patch = patchInterventoLiveDaVoce((risposte ?? {}) as Record<string, unknown>, campi);
```
in:
```ts
      const patch = patchInterventoLiveDaVoce(merged as Record<string, unknown>, campi);
```

- [ ] **Step 5: Verifica di tipo**

Run: `npx tsc --noEmit`
Expected: nessun errore **sui file toccati** (`app/api/r/[token]/voce/route.ts`). Se `tsc` mostra errori preesistenti altrove, verifica che nessuno riguardi questo file.

- [ ] **Step 6: Riesegui i test dei util (non regressione)**

Run: `npx vitest run utils/rapportini/mergeRisposte.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/r/[token]/voce/route.ts
git commit -m "fix(rapportini): /voce salva con merge per-chiave + grazia foto post-invio

Chiude la perdita foto da sovrascrittura totale di risposte e la trappola 409
sui salvataggi foto dopo l'invio (solo transizioni placeholder->path).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `/foto-campo` — consenti il caricamento finché il rapportino è inviato (non scaduto)

**Files:**
- Modify: `app/api/r/[token]/foto-campo/route.ts`

Il caricamento foto scrive solo su storage (nessuna mutazione di `risposte`): è innocuo e va permesso anche dopo l'invio, così la coda offline finisce di salire. Il vero controllo d'integrità resta su `/voce` (Task 3).

- [ ] **Step 1: Allenta il gate di stato (righe 25-31)**

Vecchio:
```ts
  if (
    tokenStatus(
      rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null },
      new Date().toISOString(),
    ) !== 'valido'
  )
    return NextResponse.json({ error: 'rapportino non modificabile' }, { status: 409 });
```

Nuovo:
```ts
  // Solo 'scaduto' è bloccato: un rapportino 'inviato' deve poter ancora ricevere
  // le foto rimaste in coda sul telefono (lo storage non altera le risposte; il
  // gate d'integrità è su /voce).
  if (
    tokenStatus(
      rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null },
      new Date().toISOString(),
    ) === 'scaduto'
  )
    return NextResponse.json({ error: 'rapportino non modificabile' }, { status: 409 });
```

- [ ] **Step 2: Verifica di tipo**

Run: `npx tsc --noEmit`
Expected: nessun errore su `app/api/r/[token]/foto-campo/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/r/[token]/foto-campo/route.ts
git commit -m "fix(rapportini): /foto-campo accetta upload anche su rapportino inviato (non scaduto)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Helper DB `contaFotoInSospesoByRapportino` (paginato anti-1000)

**Files:**
- Create: `lib/rapportini/contaFotoInSospeso.ts`

Mirror del pattern di [lib/rapportini/contaVoci.ts](../../../lib/rapportini/contaVoci.ts): pagina `rapportino_voci` e somma i segnaposto per rapportino usando l'util puro `contaFotoInSospeso`.

- [ ] **Step 1: Crea l'helper**

Create `lib/rapportini/contaFotoInSospeso.ts`:

```ts
// lib/rapportini/contaFotoInSospeso.ts
// Conteggio delle foto ancora in sospeso (segnaposto `blob-locale:`) per rapportino,
// con la stessa paginazione anti-1000 di contaVoci.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import { contaFotoInSospeso } from '@/utils/rapportini/fotoInSospeso';

const PAGE = 1000;

/** rapportino_id → numero di foto in sospeso (0 omesso). Non interroga il db se `rapIds` è vuoto. */
export async function contaFotoInSospesoByRapportino(
  db: SupabaseClient,
  rapIds: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (rapIds.length === 0) return counts;

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from('rapportino_voci')
      .select('rapportino_id, risposte')
      .in('rapportino_id', rapIds)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);

    const batch = (data ?? []) as Array<{ rapportino_id: string; risposte: Record<string, unknown> | null }>;
    for (const v of batch) {
      const n = contaFotoInSospeso(v.risposte);
      if (n > 0) counts[v.rapportino_id] = (counts[v.rapportino_id] ?? 0) + n;
    }
    if (batch.length < PAGE) break;
  }

  return counts;
}
```

- [ ] **Step 2: Verifica di tipo**

Run: `npx tsc --noEmit`
Expected: nessun errore su `lib/rapportini/contaFotoInSospeso.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/rapportini/contaFotoInSospeso.ts
git commit -m "feat(rapportini): contaFotoInSospesoByRapportino (paginato anti-1000)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Riepilogo API — esporre `fotoInSospeso` per rapportino

**Files:**
- Modify: `app/api/mappa/rapportini/riepilogo/route.ts`

- [ ] **Step 1: Aggiungi l'import**

Dopo l'import di `contaVociByRapportino` (riga 4):
```ts
import { contaFotoInSospesoByRapportino } from '@/lib/rapportini/contaFotoInSospeso';
```

- [ ] **Step 2: Calcola il conteggio accanto a `vociCount`**

Dopo la riga:
```ts
  const vociCount = await contaVociByRapportino(supabaseAdmin, rapIds);
```
aggiungi:
```ts
  const fotoSospese = await contaFotoInSospesoByRapportino(supabaseAdmin, rapIds);
```

- [ ] **Step 3: Aggiungi il campo all'output**

Nel `list.map(...)`, dopo la riga `nVoci: vociCount[r.id] ?? 0,` aggiungi:
```ts
    fotoInSospeso: fotoSospese[r.id] ?? 0,
```

- [ ] **Step 4: Verifica di tipo**

Run: `npx tsc --noEmit`
Expected: nessun errore su `app/api/mappa/rapportini/riepilogo/route.ts`.

- [ ] **Step 5: Commit**

```bash
git add app/api/mappa/rapportini/riepilogo/route.ts
git commit -m "feat(riepilogo): espone fotoInSospeso per rapportino

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Tipo + badge "foto in sospeso" in UI

**Files:**
- Modify: `utils/rapportini/links.ts`
- Modify: `components/modules/mappa/riepilogo/CardTerritorio.tsx`

- [ ] **Step 1: Aggiungi il campo al tipo `RapportinoStato`**

In `utils/rapportini/links.ts`, dentro `interface RapportinoStato`, dopo `nVoci: number;` aggiungi (opzionale per non rompere i test/fixtures esistenti che non lo impostano):
```ts
  fotoInSospeso?: number;
```

- [ ] **Step 2: Rendi il badge nella riga del rapportino**

In `components/modules/mappa/riepilogo/CardTerritorio.tsx`, nella `<div className="flex items-center gap-2">` della riga operatore (subito dopo lo `<span>` con `{r.nVoci} interventi`, attuale riga ~75), aggiungi:

```tsx
                    {(r.fotoInSospeso ?? 0) > 0 && (
                      <span
                        className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--warning)]"
                        title="Foto ancora in caricamento dal telefono dell'operatore (non ancora sul server)"
                      >⏳ {r.fotoInSospeso} foto in sospeso</span>
                    )}
```

- [ ] **Step 3: Verifica di tipo**

Run: `npx tsc --noEmit`
Expected: nessun errore su `utils/rapportini/links.ts` né `components/modules/mappa/riepilogo/CardTerritorio.tsx`.

- [ ] **Step 4: Riesegui i test che usano le fixtures `RapportinoStato` (non regressione)**

Run: `npx vitest run utils/rapportini/filtraRapportini.test.ts utils/rapportini/groupByDay.test.ts`
Expected: PASS (il campo è opzionale, le fixtures restano valide).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/links.ts components/modules/mappa/riepilogo/CardTerritorio.tsx
git commit -m "feat(riepilogo): badge 'foto in sospeso' nella riga del rapportino

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8 (OPZIONALE): Avviso all'operatore se mancano foto obbligatorie mai scattate

Da fare solo se si vuole il punto 5 della spec. Distingue "mai scattata" (campo vuoto) da "scattata ma non ancora caricata" (segnaposto): avvisa solo per le prime, in modo non bloccante.

**Files:**
- Create: `utils/rapportini/fotoObbligatorieMancanti.ts`
- Test: `utils/rapportini/fotoObbligatorieMancanti.test.ts`
- Modify: `components/modules/rapportini/RapportinoForm.tsx` (handler di invio)

- [ ] **Step 1: Scrivi il test che fallisce**

Create `utils/rapportini/fotoObbligatorieMancanti.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { contaFotoObbligatorieMancanti } from './fotoObbligatorieMancanti';

const campi = [
  { tipo: 'foto', chiave: 'a', etichetta: 'A', obbligatoria: true },
  { tipo: 'foto', chiave: 'b', etichetta: 'B', obbligatoria: true },
  { tipo: 'foto', chiave: 'c', etichetta: 'C' }, // facoltativa
  { tipo: 'select', chiave: 'eseguito', etichetta: 'Eseguito' },
] as never[];

const PH = 'blob-locale:11111111-1111-1111-1111-111111111111';
const PATH = 'rapportini/r1/a.jpg';

describe('contaFotoObbligatorieMancanti', () => {
  it('conta solo le obbligatorie con campo vuoto (mai scattate)', () => {
    const voci = [{ risposte: { a: PATH, eseguito: 'SI' } }]; // b mancante
    expect(contaFotoObbligatorieMancanti(voci, campi)).toBe(1);
  });
  it('un segnaposto NON conta come mancante (scattata, in caricamento)', () => {
    const voci = [{ risposte: { a: PATH, b: PH } }];
    expect(contaFotoObbligatorieMancanti(voci, campi)).toBe(0);
  });
  it('le facoltative non contano', () => {
    const voci = [{ risposte: { a: PATH, b: PATH } }]; // c facoltativa assente
    expect(contaFotoObbligatorieMancanti(voci, campi)).toBe(0);
  });
  it('somma su più voci', () => {
    const voci = [{ risposte: { a: PATH } }, { risposte: {} }];
    expect(contaFotoObbligatorieMancanti(voci, campi)).toBe(3); // v1: b; v2: a,b
  });
});
```

- [ ] **Step 2: Esegui il test, deve fallire**

Run: `npx vitest run utils/rapportini/fotoObbligatorieMancanti.test.ts`
Expected: FAIL (modulo inesistente).

- [ ] **Step 3: Implementa il modulo**

Create `utils/rapportini/fotoObbligatorieMancanti.ts`:

```ts
import { isPlaceholderFoto } from '@/lib/offline/fotoPlaceholder';
import { comeArrayFoto } from '@/utils/rapportini/comeArrayFoto';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

/** True se il campo foto è "vuoto": nessun path reale e nessun segnaposto. */
function fotoVuota(valore: unknown): boolean {
  if (isPlaceholderFoto(valore)) return false; // scattata, in caricamento
  if (Array.isArray(valore) && valore.some(isPlaceholderFoto)) return false;
  return comeArrayFoto(valore).length === 0;
}

/**
 * Conta, su tutte le voci, le foto OBBLIGATORIE mai scattate (campo vuoto).
 * I segnaposto `blob-locale:` NON contano: la foto c'è, sta solo salendo.
 */
export function contaFotoObbligatorieMancanti(
  voci: Array<{ risposte: Record<string, unknown> | null }>,
  campi: TemplateCampo[],
): number {
  const obbligatorie = campi.filter(
    (c) => c.tipo === 'foto' && (c as { obbligatoria?: boolean }).obbligatoria === true,
  );
  if (obbligatorie.length === 0) return 0;
  let n = 0;
  for (const v of voci) {
    const risposte = v.risposte ?? {};
    for (const c of obbligatorie) {
      if (fotoVuota(risposte[c.chiave])) n += 1;
    }
  }
  return n;
}
```

- [ ] **Step 4: Esegui il test, deve passare**

Run: `npx vitest run utils/rapportini/fotoObbligatorieMancanti.test.ts`
Expected: PASS.

- [ ] **Step 5: Aggancia l'avviso in `handleInvia`**

In `components/modules/rapportini/RapportinoForm.tsx`:

Aggiungi l'import in cima:
```ts
import { contaFotoObbligatorieMancanti } from '@/utils/rapportini/fotoObbligatorieMancanti';
```

All'inizio di `handleInvia`, subito dopo la guardia `if (disabilitato || inviando || !inviabile) return;`, aggiungi un avviso non bloccante:
```ts
    const mancanti = contaFotoObbligatorieMancanti(voci, campi);
    if (mancanti > 0) {
      const ok = window.confirm(`Mancano ${mancanti} foto obbligatorie (mai scattate). Inviare comunque?`);
      if (!ok) return;
    }
```

- [ ] **Step 6: Verifica di tipo**

Run: `npx tsc --noEmit`
Expected: nessun errore sui file toccati.

- [ ] **Step 7: Commit**

```bash
git add utils/rapportini/fotoObbligatorieMancanti.ts utils/rapportini/fotoObbligatorieMancanti.test.ts components/modules/rapportini/RapportinoForm.tsx
git commit -m "feat(rapportini): avviso pre-invio se mancano foto obbligatorie mai scattate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verifica finale (dopo tutti i task)

- [ ] **Test dei nuovi util tutti verdi**

Run: `npx vitest run utils/rapportini/mergeRisposte.test.ts utils/rapportini/fotoInSospeso.test.ts`
(+ `utils/rapportini/fotoObbligatorieMancanti.test.ts` se fatto il Task 8)
Expected: PASS.

- [ ] **Typecheck pulito sui file toccati**

Run: `npx tsc --noEmit`
Expected: nessun nuovo errore introdotto dai file di questo piano.

- [ ] **Build Next (sanity)**

Run: `npm run build`
Expected: build completata senza errori sulle route toccate.

## Note di rilascio

- Nessuna migrazione, nessuna SQL. Deploy = merge ff in `main` → push → Vercel auto (con ok esplicito dell'utente, come da prassi).
- Comportamento atteso post-deploy: le foto ancora in coda sui telefoni risalgono alla riapertura dell'app / col background sync e sostituiscono i segnaposto; il riepilogo mostra "⏳ N foto in sospeso" finché non sono tutte sul server.
- Il sub-progetto #2 (modale download "tutto / per indirizzo") è un piano separato.
