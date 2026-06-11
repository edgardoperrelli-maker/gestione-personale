# Correzione esiti rapportino lato ufficio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere editabili i campi esito di un rapportino dal dettaglio ufficio, con tabella tutta visibile (niente scroll orizzontale) e ripropagazione automatica delle correzioni agli interventi, anche su rapportini già inviati.

**Architecture:** La pagina dettaglio (`/hub/rapportini/contenuto/[id]`) resta Server Component (auth admin + fetch) e delega a un nuovo Client Component `RapportinoEditor` con stato locale e badge Esito live. Il salvataggio in blocco chiama una nuova route admin `POST /api/admin/rapportini/voce` che fonde le risposte (merge anti-perdita-foto) e ripropaga l'esito agli `interventi` riusando `patchInterventoLiveDaVoce`.

**Tech Stack:** Next.js 15 (App Router, RSC), React 19, Supabase (`supabaseAdmin` service-role), zod, Tailwind v4 (token `--brand-*`), Vitest.

**Spec di riferimento:** [docs/superpowers/specs/2026-06-11-correzione-esiti-rapportino-ufficio-design.md](../specs/2026-06-11-correzione-esiti-rapportino-ufficio-design.md)

**Nota baseline:** `npm run lint`/`npx vitest run` sono già rossi su main per problemi preesistenti. Il gate qui è **nessun nuovo problema dai file di questo WP**: verifica mirata con `npx vitest run <file>` ed `npx eslint <file>`.

---

### Task 1: Helper puro `mergeRisposte` (anti-perdita-foto)

Fonde le risposte esistenti con quelle modificate dall'ufficio: le chiavi modificate vincono, le chiavi non toccate (incluse le foto, non editabili dalla tabella) sono preservate. Estratto come funzione pura per testarne la garanzia anti-perdita.

**Files:**
- Create: `utils/rapportini/mergeRisposte.ts`
- Test: `utils/rapportini/mergeRisposte.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

`utils/rapportini/mergeRisposte.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mergeRisposte } from './mergeRisposte';

describe('mergeRisposte', () => {
  it('le chiavi modificate vincono su quelle esistenti', () => {
    expect(mergeRisposte({ a: 'vecchio' }, { a: 'nuovo' })).toEqual({ a: 'nuovo' });
  });
  it('preserva le chiavi non toccate (es. foto)', () => {
    const out = mergeRisposte({ foto_1: 'storage/path.jpg', assente: true }, { assente: false });
    expect(out).toEqual({ foto_1: 'storage/path.jpg', assente: false });
  });
  it('aggiunge le chiavi nuove', () => {
    expect(mergeRisposte({}, { note: 'x' })).toEqual({ note: 'x' });
  });
  it('non muta gli oggetti in ingresso', () => {
    const esistenti = { a: 1 };
    mergeRisposte(esistenti, { b: 2 });
    expect(esistenti).toEqual({ a: 1 });
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run utils/rapportini/mergeRisposte.test.ts`
Expected: FAIL — `Failed to resolve import "./mergeRisposte"` (file non esiste).

- [ ] **Step 3: Implementa l'helper minimo**

`utils/rapportini/mergeRisposte.ts`:
```ts
/**
 * Fonde le risposte esistenti di una voce con quelle modificate dall'ufficio.
 * Le chiavi modificate vincono; le chiavi non toccate (incluse le foto, non
 * editabili dalla tabella ufficio) sono preservate. Evita la sovrascrittura
 * totale del JSON risposte (bug noto di perdita foto).
 */
export function mergeRisposte(
  esistenti: Record<string, unknown>,
  modificate: Record<string, unknown>,
): Record<string, unknown> {
  return { ...esistenti, ...modificate };
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run utils/rapportini/mergeRisposte.test.ts`
Expected: PASS (4 test verdi).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/mergeRisposte.ts utils/rapportini/mergeRisposte.test.ts
git commit -m "feat(rapportini): mergeRisposte helper (anti-perdita-foto) + test"
```

---

### Task 2: Route admin `POST /api/admin/rapportini/voce`

Salvataggio in blocco delle voci corrette + ripropagazione esito agli interventi. Modellata su `app/api/admin/rapportini/riapri/route.ts` (stesso `requireAdmin`). **Niente** check `tokenStatus`: funziona anche su rapportino `inviato`.

**Files:**
- Create: `app/api/admin/rapportini/voce/route.ts`
- Reference (pattern auth): `app/api/admin/rapportini/riapri/route.ts`
- Reference (propagazione): `app/api/r/[token]/voce/route.ts:60-75`

- [ ] **Step 1: Crea la route completa**

`app/api/admin/rapportini/voce/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveUserRole } from '@/lib/moduleAccess';
import { patchInterventoLiveDaVoce } from '@/lib/interventi/esitoDaVoce';
import { mergeRisposte } from '@/utils/rapportini/mergeRisposte';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

async function requireAdmin(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (resolveUserRole(profile?.role, user.app_metadata?.role) !== 'admin')
    return NextResponse.json({ error: 'Accesso riservato agli admin.' }, { status: 403 });
  return true;
}

const Schema = z.object({
  rapportinoId: z.string().uuid(),
  voci: z
    .array(
      z.object({
        voceId: z.string().uuid(),
        risposte: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1),
});

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Payload non valido' }, { status: 400 });
  const { rapportinoId, voci } = parsed.data;

  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, campi_snapshot')
    .eq('id', rapportinoId)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'Rapportino non trovato.' }, { status: 404 });
  const campi = ((rap as { campi_snapshot: unknown }).campi_snapshot ?? []) as TemplateCampo[];

  let aggiornate = 0;
  for (const item of voci) {
    const { data: voce } = await supabaseAdmin
      .from('rapportino_voci')
      .select('id, intervento_id, risposte')
      .eq('id', item.voceId)
      .eq('rapportino_id', rapportinoId)
      .maybeSingle();
    if (!voce) continue;
    const v = voce as { intervento_id: string | null; risposte: Record<string, unknown> | null };

    const merged = mergeRisposte(v.risposte ?? {}, item.risposte);
    const { error } = await supabaseAdmin
      .from('rapportino_voci')
      .update({ risposte: merged })
      .eq('id', item.voceId);
    if (error) {
      console.error('[admin/voce] update voce fallito:', error.message);
      continue;
    }
    aggiornate++;

    // Ripropagazione esito all'intervento (best-effort, identica alla route operatore):
    // 'completa' chiude l'intervento (qualsiasi stato tranne annullato);
    // 'riapri' annulla SOLO una nostra precedente chiusura (tocca solo se 'completato').
    if (v.intervento_id) {
      try {
        const patch = patchInterventoLiveDaVoce(merged, campi);
        const interventoPatch =
          patch.azione === 'completa'
            ? { stato: 'completato', esito: patch.esito, esito_motivo: patch.esito_motivo, chiuso_at: new Date().toISOString() }
            : { stato: 'assegnato', esito: null, esito_motivo: null, chiuso_at: null };
        const query = supabaseAdmin.from('interventi').update(interventoPatch).eq('id', v.intervento_id);
        const { error: errInt } = await (patch.azione === 'completa'
          ? query.neq('stato', 'annullato')
          : query.eq('stato', 'completato'));
        if (errInt) console.error('[admin/voce] propagazione intervento fallita:', errInt.message);
      } catch (e) {
        console.error('[admin/voce] propagazione fallita:', e instanceof Error ? e.message : String(e));
      }
    }
  }

  return NextResponse.json({ ok: true, aggiornate });
}
```

> Nota: `risposte` aggiornato **senza** impostare `updated_at` esplicitamente, identico alla route operatore (`app/api/r/[token]/voce/route.ts:27`), per non assumere lo schema della colonna; se esiste un trigger `moddatetime` si aggiorna da sé.

- [ ] **Step 2: Verifica lint e tipi sui file nuovi**

Run: `npx eslint app/api/admin/rapportini/voce/route.ts utils/rapportini/mergeRisposte.ts`
Expected: nessun errore su questi file.

Run: `npx tsc --noEmit`
Expected: nessun **nuovo** errore che citi `app/api/admin/rapportini/voce/route.ts` (la baseline può avere errori preesistenti altrove).

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/rapportini/voce/route.ts
git commit -m "feat(rapportini): API admin correzione esiti voce + ripropagazione interventi"
```

---

### Task 3: Client Component `RapportinoEditor`

Tabella editabile: colonna Esito (badge live), colonna Intervento compatta (sostituisce le ~11 anagrafiche), colonne campi esito editabili (crocetta/select/numero/testo). Barra "Salva modifiche".

**Files:**
- Create: `components/modules/rapportini/RapportinoEditor.tsx`
- Reference (token stile bottone primario): `components/modules/rapportini/CampoInput.tsx:201`

- [ ] **Step 1: Crea il componente completo**

`components/modules/rapportini/RapportinoEditor.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { valoreInfo, type VoceInfo } from '@/utils/rapportini/infoCampi';
import { voceEsitoColore } from '@/utils/rapportini/voceColore';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export type VoceEditabile = VoceInfo & {
  id: string;
  ordine: number;
  risposte: Record<string, unknown> | null;
};

const TH = 'px-3 py-2 text-left font-semibold align-bottom';
const TD = 'px-3 py-2 align-top';

const BADGE: Record<'verde' | 'rossa' | 'neutro', { label: string; bg: string; fg: string }> = {
  verde: { label: '🟢 Fatto', bg: 'var(--success-soft, #dcfce7)', fg: 'var(--success, #166534)' },
  rossa: { label: '🔴 Non fatto', bg: 'var(--danger-soft, #fee2e2)', fg: 'var(--danger, #991b1b)' },
  neutro: { label: '⚪ Da fare', bg: 'var(--brand-surface-muted)', fg: 'var(--brand-text-muted)' },
};

const cellInput =
  'w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none';

function CellaCampo({
  campo,
  valore,
  onChange,
}: {
  campo: TemplateCampo;
  valore: unknown;
  onChange: (v: unknown) => void;
}) {
  if (campo.tipo === 'crocetta') {
    return (
      <input
        type="checkbox"
        checked={valore === true}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-[var(--brand-primary)]"
      />
    );
  }
  if (campo.tipo === 'select') {
    return (
      <select value={typeof valore === 'string' ? valore : ''} onChange={(e) => onChange(e.target.value)} className={cellInput}>
        <option value="">—</option>
        {(campo.opzioni ?? []).map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }
  if (campo.tipo === 'numero') {
    return (
      <input
        type="number"
        inputMode="decimal"
        value={typeof valore === 'number' || typeof valore === 'string' ? String(valore) : ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className={cellInput}
      />
    );
  }
  return (
    <textarea
      rows={2}
      value={typeof valore === 'string' ? valore : ''}
      onChange={(e) => onChange(e.target.value)}
      className={`${cellInput} resize-y`}
    />
  );
}

export default function RapportinoEditor({
  rapportinoId,
  vociIniziali,
  campi,
}: {
  rapportinoId: string;
  vociIniziali: VoceEditabile[];
  campi: TemplateCampo[];
}) {
  const [risposteByVoce, setRisposteByVoce] = useState<Record<string, Record<string, unknown>>>(() =>
    Object.fromEntries(vociIniziali.map((v) => [v.id, { ...(v.risposte ?? {}) }])),
  );
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [stato, setStato] = useState<'idle' | 'salvataggio' | 'ok' | 'errore'>('idle');

  function setCampo(voceId: string, chiave: string, valore: unknown) {
    setRisposteByVoce((prev) => ({ ...prev, [voceId]: { ...prev[voceId], [chiave]: valore } }));
    setDirty((prev) => new Set(prev).add(voceId));
    setStato('idle');
  }

  async function salva() {
    if (dirty.size === 0) return;
    setStato('salvataggio');
    const payload = {
      rapportinoId,
      voci: Array.from(dirty).map((voceId) => ({ voceId, risposte: risposteByVoce[voceId] })),
    };
    try {
      const res = await fetch('/api/admin/rapportini/voce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      setDirty(new Set());
      setStato('ok');
    } catch {
      setStato('errore');
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--brand-border)' }}>
        <table className="w-full table-auto text-sm">
          <thead>
            <tr style={{ color: 'var(--brand-text-muted)' }}>
              <th className={TH}>#</th>
              <th className={TH}>Esito</th>
              <th className={TH}>Intervento</th>
              {campi.map((c) => (
                <th key={c.chiave} className={TH}>{c.etichetta}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vociIniziali.map((v, i) => {
              const risposte = risposteByVoce[v.id] ?? {};
              const b = BADGE[voceEsitoColore(risposte, campi)];
              const nominativo = valoreInfo(v, 'nominativo') || `Voce ${i + 1}`;
              const sotto = (['odl', 'via', 'comune'] as const)
                .map((k) => valoreInfo(v, k))
                .filter(Boolean)
                .join(' · ');
              return (
                <tr key={v.id} className="border-t" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}>
                  <td className={TD} style={{ color: 'var(--brand-text-muted)' }}>{i + 1}</td>
                  <td className={TD}>
                    <span
                      className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{ background: b.bg, color: b.fg }}
                    >
                      {b.label}
                    </span>
                  </td>
                  <td className={TD}>
                    <div className="font-semibold">{nominativo}</div>
                    {sotto && (
                      <div className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>{sotto}</div>
                    )}
                  </td>
                  {campi.map((c) => (
                    <td key={c.chiave} className={`${TD} text-center`}>
                      <CellaCampo campo={c} valore={risposte[c.chiave]} onChange={(val) => setCampo(v.id, c.chiave, val)} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={salva}
          disabled={dirty.size === 0 || stato === 'salvataggio'}
          className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition hover:opacity-90 disabled:opacity-50"
        >
          {stato === 'salvataggio' ? 'Salvataggio…' : 'Salva modifiche'}
        </button>
        {dirty.size > 0 && (
          <span className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{dirty.size} righe modificate</span>
        )}
        {stato === 'ok' && (
          <span className="text-sm font-semibold" style={{ color: 'var(--success, #166534)' }}>✓ Salvato</span>
        )}
        {stato === 'errore' && (
          <span className="text-sm font-semibold" style={{ color: 'var(--danger, #991b1b)' }}>Errore nel salvataggio</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica lint e tipi sul componente**

Run: `npx eslint components/modules/rapportini/RapportinoEditor.tsx`
Expected: nessun errore su questo file.

Run: `npx tsc --noEmit`
Expected: nessun **nuovo** errore che citi `RapportinoEditor.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/modules/rapportini/RapportinoEditor.tsx
git commit -m "feat(rapportini): RapportinoEditor — tabella esiti editabile + badge live"
```

---

### Task 4: Collega la pagina dettaglio al nuovo editor

Sostituisci la tabella statica con `<RapportinoEditor>`. Passa tutti i campi del template **non-foto** (non più filtrati per colonne popolate) e le voci con anagrafica + risposte.

**Files:**
- Modify: `app/hub/rapportini/contenuto/[id]/page.tsx` (riscrittura completa del file)

- [ ] **Step 1: Riscrivi la pagina**

`app/hub/rapportini/contenuto/[id]/page.tsx` (sostituisci l'intero contenuto):
```tsx
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { resolveUserRole } from '@/lib/moduleAccess';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import RapportinoEditor, { type VoceEditabile } from '@/components/modules/rapportini/RapportinoEditor';

export const dynamic = 'force-dynamic';

export default async function ContenutoRapportinoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (resolveUserRole(profile?.role, user.app_metadata?.role) !== 'admin') redirect('/hub');

  const { data: rap } = await supabase
    .from('rapportini')
    .select('id, staff_name, data, stato, campi_snapshot')
    .eq('id', id)
    .maybeSingle();

  if (!rap) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10 text-center">
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>Rapportino non trovato.</p>
        <Link href="/hub/mappa?vista=riepilogo" className="mt-3 inline-block text-sm" style={{ color: 'var(--brand-primary)' }}>
          ← Torna al riepilogo
        </Link>
      </main>
    );
  }

  const r = rap as { staff_name: string | null; data: string | null; stato: string | null; campi_snapshot: unknown };

  const { data: vociRows } = await supabase
    .from('rapportino_voci')
    .select('id, ordine, nominativo, matricola, pdr, odl, via, comune, cap, recapito, attivita, accessibilita, fascia_oraria, risposte')
    .eq('rapportino_id', id)
    .order('ordine', { ascending: true });

  // Tutti i campi del template tranne le foto (non editabili in tabella), ordinati.
  const campi = ((r.campi_snapshot ?? []) as TemplateCampo[])
    .slice()
    .sort((a, b) => a.ordine - b.ordine)
    .filter((c) => c.tipo !== 'foto');
  const voci = (vociRows ?? []) as VoceEditabile[];

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-6 py-8">
      <div>
        <Link href="/hub/mappa?vista=riepilogo" className="text-sm" style={{ color: 'var(--brand-primary)' }}>
          ← Riepilogo rapportini
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
          Rapportino · {r.staff_name ?? 'Operatore'}
        </h1>
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
          {r.data ?? '—'} · {voci.length} interventi · stato {r.stato ?? '—'} · correggi gli esiti e premi “Salva modifiche”.
        </p>
      </div>

      {voci.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}>
          Nessun intervento registrato in questo rapportino.
        </div>
      ) : (
        <RapportinoEditor rapportinoId={id} vociIniziali={voci} campi={campi} />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verifica lint e tipi sulla pagina**

Run: `npx eslint "app/hub/rapportini/contenuto/[id]/page.tsx"`
Expected: nessun errore su questo file.

Run: `npx tsc --noEmit`
Expected: nessun **nuovo** errore che citi `contenuto/[id]/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "app/hub/rapportini/contenuto/[id]/page.tsx"
git commit -m "feat(rapportini): dettaglio rapportino usa RapportinoEditor (esiti editabili, no scroll laterale)"
```

---

### Task 5: Verifica finale (build + suite mirata) e checklist manuale

**Files:** nessuno (solo verifica).

- [ ] **Step 1: Suite mirata del WP verde**

Run: `npx vitest run utils/rapportini/mergeRisposte.test.ts lib/interventi/esitoDaVoce.test.ts utils/rapportini/voceColore.test.ts`
Expected: tutti PASS (il nuovo test + i due esistenti riusati per la logica esito).

- [ ] **Step 2: Build di produzione**

Run: `npm run build`
Expected: build completata; in particolare nessun errore sulla route `app/api/admin/rapportini/voce` né sulla pagina `contenuto/[id]`. (Se la build era già rotta su main per altri motivi, confronta che gli unici errori non riguardino i file di questo WP.)

- [ ] **Step 3: Checklist verifica manuale (su deploy Vercel, dopo merge)**

Verifica reale, non assumibile dai test:
1. Apri **Riepilogo rapportini** → un rapportino **inviato** con un esito sbagliato → “👁 Visualizza”.
2. La tabella è **tutta visibile**, senza scroll orizzontale; colonna Intervento compatta + colonne campi esito editabili.
3. Correggi una cella (es. togli la crocetta “Assente”, metti “Eseguito”): il **badge Esito** della riga cambia in tempo reale (🔴 → 🟢).
4. Compare “N righe modificate” e il pulsante **Salva modifiche** si attiva.
5. Premi Salva → “✓ Salvato”.
6. Ricarica la pagina: la correzione persiste.
7. In **Live**/**Riepilogo** l'intervento collegato riflette il nuovo esito (completato/eseguito_positivo o riaperto, secondo la correzione).
8. Le eventuali **foto** della voce non vanno perse (verifica su un rapportino risanamento con foto: restano presenti dopo il salvataggio).

- [ ] **Step 4: Niente commit** (task di sola verifica). Se la verifica manuale rivela difetti, apri un nuovo ciclo TDD sul punto specifico.

---

## Note di chiusura (per chi esegue)

- **Nessuna SQL / nessuna migration**: usa solo colonne esistenti (`rapportino_voci.risposte`, `interventi.esito/esito_motivo/stato/chiuso_at`).
- **`requireAdmin` duplicato** in `riapri/route.ts` e nella nuova route: duplicazione accettata, coerente col codice attuale (non c'è un helper condiviso oggi). Estrazione in `lib/` è un refactor fuori scope.
- A fine feature, dopo verifica manuale ok: merge ff in `main` + push + elimina branch (metodo feature superpowers).
