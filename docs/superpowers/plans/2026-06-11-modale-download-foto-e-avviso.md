# Modale download foto ("tutto / per indirizzo") + avviso obbligatorie — Design & Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Nel riepilogo, il tasto 🖼️ apre una modale per scaricare **tutte** le foto del rapportino **oppure solo quelle di un indirizzo/voce**. In più (Task 8 differito dal fix precedente): avviso soft all'operatore se mancano foto obbligatorie mai scattate.

**Design (deciso autonomamente, autorizzato dall'utente):**
- "Indirizzo" = singola **voce** (una voce = un ODL a una via). La modale elenca le voci del rapportino che hanno **foto scaricabili** (path reali in storage), ciascuna con un pulsante di download; in cima "📦 Scarica tutto".
- `/foto-zip` accetta `?voceId=<id>` opzionale: se presente, lo ZIP contiene SOLO le foto di quella voce (esclude foto manuali e righe-misuratore), con nome file derivato da via/ODL.
- Nuovo endpoint `GET /voci-foto` per popolare la modale: `[{ voceId, via, odl, nFoto }]` (solo voci con nFoto>0).
- `nFoto` = foto **scaricabili** = path reali `rapportini/…` (i segnaposto `blob-locale:` non si contano: non ancora scaricabili).

**Tech:** Next route handlers (runtime nodejs), Supabase JS, React client component, Vitest (alias `@/`, env node). Baseline test/lint del repo parzialmente rossa → verificare solo i file toccati.

**File:**
- Create `utils/rapportini/contaFotoScaricabili.ts` (+ test)
- Create `app/api/admin/rapportini/[rapportinoId]/voci-foto/route.ts`
- Modify `app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts`
- Create `components/modules/mappa/riepilogo/ModaleScaricaFoto.tsx`
- Modify `components/modules/mappa/riepilogo/CardTerritorio.tsx`
- Create `utils/rapportini/fotoObbligatorieMancanti.ts` (+ test)
- Modify `components/modules/rapportini/RapportinoForm.tsx`

---

### Task 1: util puro `contaFotoScaricabili`

**Files:** Create `utils/rapportini/contaFotoScaricabili.ts` + `utils/rapportini/contaFotoScaricabili.test.ts`

- [ ] **Step 1: test che fallisce**

```ts
import { describe, it, expect } from 'vitest';
import { contaFotoScaricabili } from './contaFotoScaricabili';

const PATH = 'rapportini/r1/a.jpg';
const PATH2 = 'rapportini/r1/b.jpg';
const PH = 'blob-locale:11111111-1111-1111-1111-111111111111';

describe('contaFotoScaricabili', () => {
  it('0 con risposte vuote/null o senza campi foto', () => {
    expect(contaFotoScaricabili(null, ['a'])).toBe(0);
    expect(contaFotoScaricabili({}, ['a'])).toBe(0);
    expect(contaFotoScaricabili({ a: PATH }, [])).toBe(0);
  });
  it('conta solo i path reali, ignora i segnaposto', () => {
    expect(contaFotoScaricabili({ a: PATH, b: PH }, ['a', 'b'])).toBe(1);
  });
  it('conta i path negli array', () => {
    expect(contaFotoScaricabili({ a: [PATH, PH, PATH2] }, ['a'])).toBe(2);
  });
  it('ignora le chiavi non-foto', () => {
    expect(contaFotoScaricabili({ a: PATH, note: PATH2 }, ['a'])).toBe(1);
  });
});
```

- [ ] **Step 2: run → FAIL** — `npx vitest run utils/rapportini/contaFotoScaricabili.test.ts`

- [ ] **Step 3: implementa**

```ts
import { comeArrayFoto } from '@/utils/rapportini/comeArrayFoto';

/**
 * Conta le foto SCARICABILI (path di storage reali `rapportini/…`) tra i campi
 * foto indicati di una voce. I segnaposto `blob-locale:` non si contano: non sono
 * ancora caricati sul server.
 */
export function contaFotoScaricabili(
  risposte: Record<string, unknown> | null | undefined,
  chiaviFoto: string[],
): number {
  if (!risposte) return 0;
  let n = 0;
  for (const chiave of chiaviFoto) {
    for (const p of comeArrayFoto(risposte[chiave])) {
      if (p.startsWith('rapportini/')) n += 1;
    }
  }
  return n;
}
```

- [ ] **Step 4: run → PASS** — `npx vitest run utils/rapportini/contaFotoScaricabili.test.ts`

- [ ] **Step 5: commit**

```bash
git add utils/rapportini/contaFotoScaricabili.ts utils/rapportini/contaFotoScaricabili.test.ts
git commit -m "feat(rapportini): contaFotoScaricabili — conta i path foto reali per campo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: endpoint `GET /voci-foto`

**Files:** Create `app/api/admin/rapportini/[rapportinoId]/voci-foto/route.ts`

- [ ] **Step 1: implementa**

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { contaFotoScaricabili } from '@/utils/rapportini/contaFotoScaricabili';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

/**
 * GET /api/admin/rapportini/[rapportinoId]/voci-foto
 * Elenco delle voci con foto scaricabili: [{ voceId, via, odl, nFoto }] (solo nFoto>0).
 * Alimenta la modale di download "per indirizzo".
 */
export async function GET(_req: Request, { params }: { params: Promise<{ rapportinoId: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { rapportinoId } = await params;

  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, campi_snapshot')
    .eq('id', rapportinoId)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'rapportino non trovato' }, { status: 404 });

  const chiaviFoto = ((rap.campi_snapshot ?? []) as TemplateCampo[])
    .filter((c) => c.tipo === 'foto')
    .map((c) => c.chiave);
  if (chiaviFoto.length === 0) return NextResponse.json([]);

  const { data: vociRows, error } = await supabaseAdmin
    .from('rapportino_voci')
    .select('id, via, odl, risposte')
    .eq('rapportino_id', rapportinoId)
    .order('ordine', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out = ((vociRows ?? []) as Array<{ id: string; via: string | null; odl: string | null; risposte: Record<string, unknown> | null }>)
    .map((v) => ({ voceId: v.id, via: v.via, odl: v.odl, nFoto: contaFotoScaricabili(v.risposte, chiaviFoto) }))
    .filter((v) => v.nFoto > 0);

  return NextResponse.json(out);
}
```

- [ ] **Step 2: typecheck** — `npx tsc --noEmit` (nessun errore sul nuovo file)

- [ ] **Step 3: commit**

```bash
git add "app/api/admin/rapportini/[rapportinoId]/voci-foto/route.ts"
git commit -m "feat(rapportini): endpoint voci-foto (elenco voci con foto scaricabili)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `/foto-zip` accetta `?voceId=`

**Files:** Modify `app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts`

- [ ] **Step 1: leggi il `voceId` e cambia la firma**

Cambia la firma da `GET(_req: Request, ...)` a `GET(req: Request, ...)` e, subito dopo `const { rapportinoId } = await params;`, aggiungi:

```ts
  const voceId = new URL(req.url).searchParams.get('voceId');
```

- [ ] **Step 2: Fonte A (manuali) solo senza `voceId`**

Avvolgi il blocco "Fonte A" (la `const fotoManuali` + la query `interventi_manuali`/`interventi_manuali_foto`) in `if (!voceId) { … }`. Concretamente: lascia `const fotoManuali: FotoZip[] = [];` fuori, e metti dentro `if (!voceId) { … }` solo la parte che fa le query e il `.push(...)`.

- [ ] **Step 3: Fonte B filtrata per voce + nome file**

Nel blocco "Fonte B", cambia la costruzione della query così da filtrare per voce quando richiesto, e cattura via/odl della voce per il nome file. Sostituisci:

```ts
    const { data: vociRows, error: vociErr } = await supabaseAdmin
      .from('rapportino_voci')
      .select('id, nominativo, matricola, pdr, odl, via, risposte')
      .eq('rapportino_id', rapportinoId)
      .order('ordine', { ascending: true });
```
con:
```ts
    let vociQuery = supabaseAdmin
      .from('rapportino_voci')
      .select('id, nominativo, matricola, pdr, odl, via, risposte')
      .eq('rapportino_id', rapportinoId);
    if (voceId) vociQuery = vociQuery.eq('id', voceId);
    const { data: vociRows, error: vociErr } = await vociQuery.order('ordine', { ascending: true });
```

- [ ] **Step 4: Fonte C (righe) solo senza `voceId`**

Avvolgi il blocco "Fonte C" (`const fotoRighe` + query `rapportino_righe` + loop) in `if (!voceId) { … }` (lascia `const fotoRighe: FotoZip[] = [];` fuori).

- [ ] **Step 5: nome file per voce**

Sostituisci:
```ts
  const fileName = `foto-rapportino-${rapportinoId}.zip`;
```
con:
```ts
  let fileName = `foto-rapportino-${rapportinoId}.zip`;
  if (voceId) {
    const v0 = (vociRows ?? [])[0] as { via?: string | null; odl?: string | null } | undefined;
    const base = (v0?.via || v0?.odl || `voce-${voceId}`).toString().replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
    fileName = `foto-${base || 'voce'}.zip`;
  }
```
Nota: `vociRows` è dichiarato dentro `if (campiFoto.length > 0)`. Per usarlo nel nome file, dichiara `let vociRows: …` PRIMA del blocco Fonte B e assegnalo dentro, **oppure** ricava via/odl in modo sicuro. Implementazione robusta: in cima alla funzione (dopo `voceId`) aggiungi `let voceForName: { via: string | null; odl: string | null } | null = null;`, e nel loop Fonte B, alla prima iterazione, imposta `if (voceId && !voceForName) voceForName = { via: v.via, odl: v.odl };`. Poi nel nome file usa `voceForName` invece di `vociRows[0]`:
```ts
  let fileName = `foto-rapportino-${rapportinoId}.zip`;
  if (voceId) {
    const base = (voceForName?.via || voceForName?.odl || `voce-${voceId}`).replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
    fileName = `foto-${base || 'voce'}.zip`;
  }
```

- [ ] **Step 6: typecheck** — `npx tsc --noEmit` (nessun errore sul file)

- [ ] **Step 7: commit**

```bash
git add "app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts"
git commit -m "feat(rapportini): /foto-zip filtra per ?voceId (download foto di un solo indirizzo)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: componente `ModaleScaricaFoto`

**Files:** Create `components/modules/mappa/riepilogo/ModaleScaricaFoto.tsx`

- [ ] **Step 1: implementa**

```tsx
'use client';
import { useEffect, useState } from 'react';

type VoceFoto = { voceId: string; via: string | null; odl: string | null; nFoto: number };

export default function ModaleScaricaFoto({
  rapportinoId,
  etichetta,
  onClose,
}: {
  rapportinoId: string;
  etichetta: string;
  onClose: () => void;
}) {
  const [voci, setVoci] = useState<VoceFoto[] | null>(null);
  const [errore, setErrore] = useState(false);

  useEffect(() => {
    let attivo = true;
    fetch(`/api/admin/rapportini/${rapportinoId}/voci-foto`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then((d) => { if (attivo) setVoci(d as VoceFoto[]); })
      .catch(() => { if (attivo) setErrore(true); });
    return () => { attivo = false; };
  }, [rapportinoId]);

  const zip = (qs = '') => `/api/admin/rapportini/${rapportinoId}/foto-zip${qs}`;

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-md overflow-auto rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--brand-text-main)]">Scarica foto — {etichetta}</h2>
          <button onClick={onClose} className="text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)]">✕</button>
        </div>

        <a
          href={zip()}
          className="mb-3 block rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-center text-sm font-semibold text-[oklch(0.16_0.06_245)]"
        >📦 Scarica tutto</a>

        <div className="mb-1 text-[11px] font-semibold uppercase text-[var(--brand-text-muted)]">Per indirizzo</div>
        {errore && <p className="py-2 text-sm text-[var(--danger)]">Errore nel caricamento.</p>}
        {!voci && !errore && <p className="py-2 text-sm text-[var(--brand-text-muted)]">Caricamento…</p>}
        {voci && voci.length === 0 && <p className="py-2 text-sm text-[var(--brand-text-muted)]">Nessuna foto per indirizzo.</p>}
        {voci && voci.length > 0 && (
          <ul className="divide-y divide-[var(--brand-border)]">
            {voci.map((v) => (
              <li key={v.voceId} className="flex items-center justify-between gap-2 py-2">
                <span className="text-sm text-[var(--brand-text-main)]">
                  {v.via ?? 'Indirizzo n/d'}{v.odl ? ` · ODL ${v.odl}` : ''}{' '}
                  <span className="text-[var(--brand-text-muted)]">({v.nFoto})</span>
                </span>
                <a
                  href={zip(`?voceId=${v.voceId}`)}
                  title="Scarica le foto di questo indirizzo"
                  className="shrink-0 rounded-lg border border-[var(--brand-border)] px-3 py-1 text-sm font-semibold text-[var(--brand-text-main)] hover:border-[var(--brand-primary)]"
                >⤓</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: typecheck** — `npx tsc --noEmit`

- [ ] **Step 3: commit**

```bash
git add components/modules/mappa/riepilogo/ModaleScaricaFoto.tsx
git commit -m "feat(riepilogo): ModaleScaricaFoto (scarica tutto / per indirizzo)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: aggancia la modale in `CardTerritorio`

**Files:** Modify `components/modules/mappa/riepilogo/CardTerritorio.tsx`

- [ ] **Step 1: import**

In cima, aggiungi:
```tsx
import { useState } from 'react';
import ModaleScaricaFoto from './ModaleScaricaFoto';
```

- [ ] **Step 2: stato locale della modale**

Subito dentro il corpo del componente (dopo `const multiPiano = …`), aggiungi:
```tsx
  const [fotoModal, setFotoModal] = useState<{ id: string; etichetta: string } | null>(null);
```

- [ ] **Step 3: sostituisci il link 🖼️ con un bottone**

Sostituisci:
```tsx
                    <a
                      href={`/api/admin/rapportini/${r.id}/foto-zip`}
                      title="Scarica foto interventi manuali (ZIP)"
                      className="rounded border border-[var(--brand-border)] px-2 py-0.5"
                    >🖼️</a>
```
con:
```tsx
                    <button
                      type="button"
                      onClick={() => setFotoModal({ id: r.id, etichetta: `${r.staff_name ?? 'Operatore'} · ${dataLabel}` })}
                      title="Scarica foto"
                      className="rounded border border-[var(--brand-border)] px-2 py-0.5"
                    >🖼️</button>
```

- [ ] **Step 4: renderizza la modale**

Subito prima del `</div>` di chiusura del `return` (dopo la chiusura di `{terr.piani.map((p) => ( … ))}`), aggiungi:
```tsx
      {fotoModal && (
        <ModaleScaricaFoto
          rapportinoId={fotoModal.id}
          etichetta={fotoModal.etichetta}
          onClose={() => setFotoModal(null)}
        />
      )}
```

- [ ] **Step 5: typecheck + test non-regressione fixtures**

Run: `npx tsc --noEmit` e `npx vitest run utils/rapportini/filtraRapportini.test.ts utils/rapportini/groupByDay.test.ts` (devono passare).

- [ ] **Step 6: commit**

```bash
git add components/modules/mappa/riepilogo/CardTerritorio.tsx
git commit -m "feat(riepilogo): il tasto foto apre la modale di download

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: util puro `fotoObbligatorieMancanti` (Task 8 del fix)

**Files:** Create `utils/rapportini/fotoObbligatorieMancanti.ts` + `utils/rapportini/fotoObbligatorieMancanti.test.ts`

- [ ] **Step 1: test che fallisce**

```ts
import { describe, it, expect } from 'vitest';
import { contaFotoObbligatorieMancanti } from './fotoObbligatorieMancanti';

const campi = [
  { tipo: 'foto', chiave: 'a', etichetta: 'A', obbligatoria: true },
  { tipo: 'foto', chiave: 'b', etichetta: 'B', obbligatoria: true },
  { tipo: 'foto', chiave: 'c', etichetta: 'C' },
  { tipo: 'select', chiave: 'eseguito', etichetta: 'Eseguito' },
] as never[];

const PH = 'blob-locale:11111111-1111-1111-1111-111111111111';
const PATH = 'rapportini/r1/a.jpg';

describe('contaFotoObbligatorieMancanti', () => {
  it('conta solo le obbligatorie con campo vuoto (mai scattate)', () => {
    expect(contaFotoObbligatorieMancanti([{ risposte: { a: PATH, eseguito: 'SI' } }], campi)).toBe(1);
  });
  it('un segnaposto NON conta come mancante (scattata, in caricamento)', () => {
    expect(contaFotoObbligatorieMancanti([{ risposte: { a: PATH, b: PH } }], campi)).toBe(0);
  });
  it('le facoltative non contano', () => {
    expect(contaFotoObbligatorieMancanti([{ risposte: { a: PATH, b: PATH } }], campi)).toBe(0);
  });
  it('somma su più voci', () => {
    expect(contaFotoObbligatorieMancanti([{ risposte: { a: PATH } }, { risposte: {} }], campi)).toBe(3);
  });
});
```

- [ ] **Step 2: run → FAIL** — `npx vitest run utils/rapportini/fotoObbligatorieMancanti.test.ts`

- [ ] **Step 3: implementa**

```ts
import { isPlaceholderFoto } from '@/lib/offline/fotoPlaceholder';
import { comeArrayFoto } from '@/utils/rapportini/comeArrayFoto';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

/** True se il campo foto è "vuoto": nessun path reale e nessun segnaposto. */
function fotoVuota(valore: unknown): boolean {
  if (isPlaceholderFoto(valore)) return false;
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

- [ ] **Step 4: run → PASS** — `npx vitest run utils/rapportini/fotoObbligatorieMancanti.test.ts`

- [ ] **Step 5: commit**

```bash
git add utils/rapportini/fotoObbligatorieMancanti.ts utils/rapportini/fotoObbligatorieMancanti.test.ts
git commit -m "feat(rapportini): contaFotoObbligatorieMancanti (foto obbligatorie mai scattate)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: avviso pre-invio in `RapportinoForm`

**Files:** Modify `components/modules/rapportini/RapportinoForm.tsx`

- [ ] **Step 1: import**

In cima, aggiungi:
```ts
import { contaFotoObbligatorieMancanti } from '@/utils/rapportini/fotoObbligatorieMancanti';
```

- [ ] **Step 2: avviso non bloccante in `handleInvia`**

In `handleInvia`, SUBITO dopo la riga di guardia `if (disabilitato || inviando || !inviabile) return;` (riga ~269), aggiungi:
```ts
    const fotoMancanti = contaFotoObbligatorieMancanti(voci, campi);
    if (fotoMancanti > 0 && !window.confirm(`Mancano ${fotoMancanti} foto obbligatorie (mai scattate). Inviare comunque?`)) {
      return;
    }
```

- [ ] **Step 3: aggiorna le dipendenze del `useCallback`**

Alla fine di `handleInvia`, l'array di dipendenze è `[disabilitato, inviando, inviabile, token]`. Aggiungi `voci` e `campi`:
```ts
  }, [disabilitato, inviando, inviabile, token, voci, campi]);
```

- [ ] **Step 4: typecheck** — `npx tsc --noEmit`

- [ ] **Step 5: commit**

```bash
git add components/modules/rapportini/RapportinoForm.tsx
git commit -m "feat(rapportini): avviso pre-invio se mancano foto obbligatorie mai scattate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verifica finale

- [ ] `npx vitest run utils/rapportini/contaFotoScaricabili.test.ts utils/rapportini/fotoObbligatorieMancanti.test.ts utils/rapportini/filtraRapportini.test.ts utils/rapportini/groupByDay.test.ts` → tutti verdi
- [ ] `npx tsc --noEmit` → nessun nuovo errore
- [ ] `npm run build` → build ok (route + componenti)

## Rilascio
- Nessuna SQL/migrazione. Merge ff in main + push → Vercel auto.
