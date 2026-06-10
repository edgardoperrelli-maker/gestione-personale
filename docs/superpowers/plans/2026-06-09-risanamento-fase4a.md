# Risanamento — Fase 4a (UI operatore card-civico, manuale) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. **Sessioni concorrenti**: verificare `git branch --show-current` = `feat/risanamento-fase4a` prima di OGNI commit; se diverso, NON committare e segnalare.

**Goal:** Dare all'operatore la UI per compilare un rapportino risanamento: lista civici → dettaglio civico con 3 sezioni (Misuratori/Fasi/Accessorie), righe-misuratore aggiunte a mano con foto prima/dopo.

**Architecture:** Quando `rapportino.tipo='risanamento'`, `RapportinoForm` rende un nuovo `RisanamentoView` invece di lista/focus. La voce-civico è una `rapportino_voci`; le righe-misuratore sono `rapportino_righe` (figlie via `voce_id`). Foto via `foto-campo` (riuso) + salvataggio su `rapportino_righe.risposte` (nuovo endpoint `/riga`) o `rapportino_voci.risposte` (endpoint `voce` esistente).

**Tech Stack:** Next.js 15, TypeScript, Supabase, React 19, Vitest, Tailwind v4.

**Vincoli:** Nessuna migration nuova (`rapportino_righe` e `tipo` esistono dalle Fasi 1/3). Gate: unit test helper, `tsc`, `eslint` (mirato sui file nuovi; i file grandi esistenti hanno baseline rossa), `npm run build`. Branch `feat/risanamento-fase4a`. NO push senza ok.

**Modello dati (Fase 1, confermato):** `rapportino_righe` = `{ id uuid, voce_id uuid→rapportino_voci, rapportino_id uuid, matricola text, pdr text, nominativo text, ref_id bigint, fonte 'civico'|'fuori_elenco'|'manuale', risposte jsonb, ordine int, creato_da text, created_at, updated_at }`.

---

## File Structure
- Create: `utils/rapportini/campiScope.ts` (+ test) — partiziona i campi foto per scope.
- Create: `app/api/r/[token]/riga/route.ts` — POST crea/aggiorna riga-misuratore.
- Modify: `app/r/[token]/page.tsx` — `tipo` + caricamento `rapportino_righe`.
- Modify: `components/modules/rapportini/RapportinoForm.tsx` — props `tipo`/`righe` + innesto `RisanamentoView`.
- Create: `components/modules/rapportini/risanamento/RisanamentoView.tsx` — lista civici ↔ dettaglio.
- Create: `components/modules/rapportini/risanamento/SlotFoto.tsx` — singolo slot foto (compress+upload+preview).
- Create: `components/modules/rapportini/risanamento/types.ts` — tipo `RigaRisanamento`.

---

## Task 1: Helper partizione campi per scope (TDD)

**Files:** Create `utils/rapportini/campiScope.ts` + `utils/rapportini/campiScope.test.ts`

- [ ] **Step 1: Test che fallisce** — `utils/rapportini/campiScope.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { campiPerScope } from './campiScope';

const campi = [
  { chiave: 'prima', etichetta: 'Prima', tipo: 'foto', ordine: 1, scope_foto: 'misuratore', obbligatoria: true },
  { chiave: 'dopo', etichetta: 'Dopo', tipo: 'foto', ordine: 2, scope_foto: 'misuratore', obbligatoria: true },
  { chiave: 'resina1', etichetta: 'Resina 1', tipo: 'foto', ordine: 3, scope_foto: 'fase' },
  { chiave: 'interc', etichetta: 'Intercettazione', tipo: 'foto', ordine: 4, scope_foto: 'accessoria' },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 5 },
  { chiave: 'vecchia_foto', etichetta: 'Foto', tipo: 'foto', ordine: 6 }, // senza scope → default misuratore
] as const;

describe('campiPerScope', () => {
  it('partiziona i campi foto per scope (default misuratore)', () => {
    const r = campiPerScope(campi as never);
    expect(r.misuratore.map((c) => c.chiave)).toEqual(['prima', 'dopo', 'vecchia_foto']);
    expect(r.fase.map((c) => c.chiave)).toEqual(['resina1']);
    expect(r.accessoria.map((c) => c.chiave)).toEqual(['interc']);
  });
  it('esclude i campi non-foto', () => {
    const r = campiPerScope(campi as never);
    const tutte = [...r.misuratore, ...r.fase, ...r.accessoria];
    expect(tutte.some((c) => c.chiave === 'note')).toBe(false);
  });
  it('ordina per ordine crescente', () => {
    const r = campiPerScope([
      { chiave: 'b', etichetta: 'B', tipo: 'foto', ordine: 2, scope_foto: 'misuratore' },
      { chiave: 'a', etichetta: 'A', tipo: 'foto', ordine: 1, scope_foto: 'misuratore' },
    ] as never);
    expect(r.misuratore.map((c) => c.chiave)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Esegui** `npx vitest run utils/rapportini/campiScope.test.ts` → FAIL.

- [ ] **Step 3: Implementa** — `utils/rapportini/campiScope.ts`:
```ts
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export type ScopeFoto = 'misuratore' | 'fase' | 'accessoria';
export type CampiScope = Record<ScopeFoto, TemplateCampo[]>;

/** Partiziona i campi `tipo='foto'` per scope (default 'misuratore'), ciascun gruppo ordinato per `ordine`. */
export function campiPerScope(campi: TemplateCampo[]): CampiScope {
  const out: CampiScope = { misuratore: [], fase: [], accessoria: [] };
  for (const c of campi) {
    if (c.tipo !== 'foto') continue;
    const scope: ScopeFoto = c.scope_foto ?? 'misuratore';
    out[scope].push(c);
  }
  (Object.keys(out) as ScopeFoto[]).forEach((k) => out[k].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0)));
  return out;
}
```

- [ ] **Step 4: Esegui** `npx vitest run utils/rapportini/campiScope.test.ts` → PASS.

- [ ] **Step 5: Lint** `npx eslint utils/rapportini/campiScope.ts utils/rapportini/campiScope.test.ts --max-warnings=0` → vuoto.

- [ ] **Step 6: Commit** (verifica branch = `feat/risanamento-fase4a`)
```bash
git add utils/rapportini/campiScope.ts utils/rapportini/campiScope.test.ts
git commit -m "feat(risanamento): helper partizione campi foto per scope" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Endpoint POST /api/r/[token]/riga

**Files:** Create `app/api/r/[token]/riga/route.ts`

- [ ] **Step 1: Implementa** — replica il guard di `voce/route.ts` (tokenStatus). Contenuto:
```ts
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, stato, data, riaperto_at')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  const body = (await req.json()) as {
    voceId?: string; rigaId?: string;
    matricola?: string; pdr?: string; nominativo?: string;
    risposte?: Record<string, unknown>; creato_da?: string;
  };

  // UPDATE riga esistente (merge risposte + anagrafica).
  if (body.rigaId) {
    const { data: riga } = await supabaseAdmin
      .from('rapportino_righe')
      .select('id, risposte')
      .eq('id', body.rigaId)
      .eq('rapportino_id', rap.id)
      .maybeSingle();
    if (!riga) return NextResponse.json({ error: 'riga_non_valida' }, { status: 400 });
    const risposte = { ...((riga.risposte as Record<string, unknown> | null) ?? {}), ...(body.risposte ?? {}) };
    const patch: Record<string, unknown> = { risposte };
    if (body.matricola !== undefined) patch.matricola = body.matricola;
    if (body.pdr !== undefined) patch.pdr = body.pdr;
    if (body.nominativo !== undefined) patch.nominativo = body.nominativo;
    const { data: upd, error } = await supabaseAdmin
      .from('rapportino_righe').update(patch).eq('id', body.rigaId)
      .select('id, voce_id, matricola, pdr, nominativo, risposte, ordine, fonte').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ riga: upd });
  }

  // INSERT nuova riga (manuale).
  if (!body.voceId || !body.matricola || !body.matricola.trim())
    return NextResponse.json({ error: 'voceId e matricola obbligatori' }, { status: 422 });
  // Verifica che la voce appartenga al rapportino.
  const { data: voce } = await supabaseAdmin
    .from('rapportino_voci').select('id').eq('id', body.voceId).eq('rapportino_id', rap.id).maybeSingle();
  if (!voce) return NextResponse.json({ error: 'voce_non_valida' }, { status: 400 });
  // ordine = max+1 per quella voce.
  const { data: maxRow } = await supabaseAdmin
    .from('rapportino_righe').select('ordine').eq('voce_id', body.voceId)
    .order('ordine', { ascending: false }).limit(1).maybeSingle();
  const ordine = ((maxRow?.ordine as number | undefined) ?? 0) + 1;
  const { data: ins, error } = await supabaseAdmin
    .from('rapportino_righe').insert({
      id: randomUUID(), voce_id: body.voceId, rapportino_id: rap.id,
      matricola: body.matricola.trim(), pdr: body.pdr ?? null, nominativo: body.nominativo ?? null,
      ref_id: null, fonte: 'manuale', risposte: body.risposte ?? {}, ordine, creato_da: body.creato_da ?? null,
    })
    .select('id, voce_id, matricola, pdr, nominativo, risposte, ordine, fonte').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ riga: ins });
}
```

- [ ] **Step 2: Type-check** `npx tsc --noEmit 2>&1 | grep -i "riga/route"` → vuoto.
- [ ] **Step 3: Lint** `npx eslint "app/api/r/[token]/riga/route.ts" --max-warnings=0` → vuoto.
- [ ] **Step 4: Commit** (verifica branch)
```bash
git add "app/api/r/[token]/riga/route.ts"
git commit -m "feat(risanamento): endpoint POST /riga (crea/aggiorna riga-misuratore)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: page.tsx — tipo + caricamento righe

**Files:** Modify `app/r/[token]/page.tsx`

- [ ] **Step 1: Aggiungi `tipo` alla select rapportini** (≈ riga 90): aggiungi `, tipo` alla lista colonne della `.select(...)` di `rapportini`.

- [ ] **Step 2: Carica le righe se risanamento.** Dopo il caricamento delle voci (≈ riga 119), aggiungi:
```ts
  let righe: Array<{ id: string; voce_id: string; matricola: string | null; pdr: string | null; nominativo: string | null; risposte: Record<string, unknown> | null; ordine: number; fonte: string }> = [];
  if ((rap as { tipo?: string }).tipo === 'risanamento') {
    const { data: righeRows } = await supabaseAdmin
      .from('rapportino_righe')
      .select('id, voce_id, matricola, pdr, nominativo, risposte, ordine, fonte')
      .eq('rapportino_id', rap.id)
      .order('ordine', { ascending: true });
    righe = (righeRows ?? []) as typeof righe;
  }
```

- [ ] **Step 3: Passa le props a RapportinoForm** (≈ riga 198-208): aggiungi `tipo={(rap as { tipo?: 'standard' | 'risanamento' }).tipo ?? 'standard'}` e `righe={righe}`.

- [ ] **Step 4: Type-check** `npx tsc --noEmit 2>&1 | grep -i "r/\[token\]/page"` → vuoto.
- [ ] **Step 5: Lint** `npx eslint "app/r/[token]/page.tsx" --max-warnings=0` → vuoto (o solo preesistenti).
- [ ] **Step 6: Commit** (verifica branch)
```bash
git add "app/r/[token]/page.tsx"
git commit -m "feat(risanamento): page passa tipo + righe al form" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Tipo condiviso + innesto in RapportinoForm

**Files:** Create `components/modules/rapportini/risanamento/types.ts`; Modify `components/modules/rapportini/RapportinoForm.tsx`

- [ ] **Step 1: Tipo condiviso** — `components/modules/rapportini/risanamento/types.ts`:
```ts
/** Riga-misuratore (figlia di una voce-civico) come arriva dal server. */
export type RigaRisanamento = {
  id: string;
  voce_id: string;
  matricola: string | null;
  pdr: string | null;
  nominativo: string | null;
  risposte: Record<string, unknown> | null;
  ordine: number;
  fonte: string;
};
```

- [ ] **Step 2: Props in RapportinoForm.** Aggiungi al type `Props` (≈ riga 42-52):
```ts
  tipo?: 'standard' | 'risanamento';
  righe?: import('./risanamento/types').RigaRisanamento[];
```
e destruttura `tipo`, `righe` nei parametri del componente.

- [ ] **Step 3: Innesto del rendering.** Importa in cima: `import { RisanamentoView } from './risanamento/RisanamentoView';`. Nel `return`, PRIMA del ramo `vista === 'focus' ? <VoceFocus/> : <RapportinoLista/>`, aggiungi il ramo risanamento (dentro lo stesso `<RapportinoFotoCtx.Provider>` esistente):
```tsx
        {tipo === 'risanamento' ? (
          <RisanamentoView
            token={token}
            rapportino={rapportino}
            voci={voci}
            righeIniziali={righe ?? []}
            campi={campi}
            readOnly={readOnly}
          />
        ) : vista === 'focus' && voci[indiceCorrente] ? (
          /* ...VoceFocus invariato... */
        ) : (
          /* ...RapportinoLista invariato... */
        )}
```
NOTE: mantieni IDENTICI i rami `VoceFocus` e `RapportinoLista` esistenti; aggiungi solo il ramo `tipo === 'risanamento'` davanti. `voci` qui sono le voci-civico (`Voce[]` già caricate).

- [ ] **Step 4: Type-check** `npx tsc --noEmit 2>&1 | grep -i "RapportinoForm"` → vuoto (RisanamentoView creato in Task 5; per ora questo task può fallire la compilazione finché Task 5 non esiste — quindi COMMITTA Task 4 e Task 5 INSIEME, oppure crea prima uno stub di RisanamentoView). Per evitare rotture: crea in questo task uno **stub** `RisanamentoView` minimale (vedi Task 5 Step 1) così `tsc` passa, poi Task 5 lo completa.

- [ ] **Step 5: Commit** (verifica branch) — insieme allo stub di Task 5 Step 1.

---

## Task 5: RisanamentoView + SlotFoto (UI)

**Files:** Create `components/modules/rapportini/risanamento/RisanamentoView.tsx`, `components/modules/rapportini/risanamento/SlotFoto.tsx`

Riusa i pattern esistenti: `RapportinoLista`/`RigaVoceCard` per lo stile lista; `comprimiImmagine` (export di `CampoFoto.tsx`) per comprimere; l'endpoint `foto-campo` per l'upload.

- [ ] **Step 1: `SlotFoto.tsx`** — singolo slot foto (compress → upload → callback path). Contenuto:
```tsx
'use client';
import { useRef, useState } from 'react';
import { comprimiImmagine } from '../CampoFoto';

/** Uno slot foto: scatta/libreria → comprime → carica via foto-campo → onUploaded(path). */
export function SlotFoto({
  token, etichetta, valore, obbligatoria, disabilitato, onUploaded,
}: {
  token: string; etichetta: string; valore?: string | null;
  obbligatoria?: boolean; disabilitato?: boolean;
  onUploaded: (path: string | null) => void;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const handle = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr(false);
    try {
      const compressed = await comprimiImmagine(f);
      const fd = new FormData();
      fd.append('file', compressed, compressed.name);
      const res = await fetch(`/api/r/${token}/foto-campo`, { method: 'POST', body: fd });
      if (!res.ok) { setErr(true); onUploaded(null); return; }
      const json = (await res.json()) as { path?: string };
      onUploaded(json.path ?? null);
    } catch { setErr(true); onUploaded(null); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--brand-text-main)]">{etichetta}{obbligatoria ? ' *' : ''}</span>
        {valore ? <span className="text-xs text-[var(--success)]">✓ caricata</span> : err ? <span className="text-xs text-[var(--danger)]">errore</span> : null}
      </div>
      {!disabilitato && (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => camRef.current?.click()} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">📷 {busy ? '…' : 'Scatta'}</button>
          <button type="button" disabled={busy} onClick={() => libRef.current?.click()} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">🖼️ Libreria</button>
        </div>
      )}
      <input ref={camRef} type="file" accept="image/*" capture="environment" aria-hidden tabIndex={-1}
        className="absolute h-px w-px overflow-hidden opacity-0" onChange={(e) => { void handle(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={libRef} type="file" accept="image/*" aria-hidden tabIndex={-1}
        className="absolute h-px w-px overflow-hidden opacity-0" onChange={(e) => { void handle(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
```

- [ ] **Step 2: `RisanamentoView.tsx`** — orchestratore lista-civici ↔ dettaglio. Responsabilità e struttura (completare il markup seguendo lo stile di `RapportinoLista`):
  - **Props**: `{ token, rapportino: {staff_name; data}, voci: Voce[], righeIniziali: RigaRisanamento[], campi: TemplateCampo[], readOnly: boolean }`.
  - **Stato**: `righe` (da `righeIniziali`, mutato dopo ogni save), `civicoApertoId: string | null`.
  - `const scope = campiPerScope(campi)` (da `@/utils/rapportini/campiScope`).
  - **Vista lista** (`civicoApertoId === null`): intestazione (staff/data come `RapportinoLista`), elenco delle `voci` come card cliccabili (riusa lo stile di `RigaVoceCard`: numero, titolo = via/civico, sub = comune, conteggio righe della voce). Tap → `setCivicoApertoId(voce.id)`.
  - **Vista dettaglio** (`civicoApertoId !== null`): header civico + bottone "‹ Civici" (torna alla lista) + 3 sezioni:
    - **Misuratori**: `righe.filter((r) => r.voce_id === civicoApertoId)`. Per ogni riga: anagrafica (matricola/nominativo) + uno `SlotFoto` per ciascun campo in `scope.misuratore` (valore = `riga.risposte[campo.chiave]`); `onUploaded(path)` → `POST /api/r/${token}/riga` con `{ rigaId: riga.id, risposte: { [campo.chiave]: path } }`, poi aggiorna `righe` in stato con la riga ritornata. Bottone **"+ Aggiungi misuratore"** → form inline (input matricola obbligatoria, pdr/nominativo opzionali) → `POST /riga` con `{ voceId: civicoApertoId, matricola, pdr, nominativo }` → append della riga ritornata a `righe`.
    - **Fasi**: per ogni campo in `scope.fase`, uno `SlotFoto` (valore = `voce.risposte[campo.chiave]`); `onUploaded(path)` → `POST /api/r/${token}/voce` con `{ voceId: civicoApertoId, risposte: { [campo.chiave]: path } }`.
    - **Accessorie**: per ogni campo in `scope.accessoria`, mostrato solo dopo che l'operatore lo "attiva" con un bottone "+ {etichetta}" (stato locale `accessorieAttive: Set<chiave>`); una volta attivo, uno `SlotFoto` come per le fasi (salva su `voce.risposte`). Se la voce ha già un valore per quel campo, è attivo di default.
  - **readOnly**: se true, gli `SlotFoto` sono `disabilitato` e i bottoni di aggiunta nascosti.
  - **Helper upload riga/voce**: due funzioni `salvaFotoRiga(rigaId, chiave, path)` e `salvaFotoVoce(chiave, path)` che fanno il POST e aggiornano lo stato locale. Gestire errore con un messaggio inline.

- [ ] **Step 3: Type-check** `npx tsc --noEmit 2>&1 | grep -Ei "RisanamentoView|SlotFoto|RapportinoForm"` → vuoto.
- [ ] **Step 4: Lint** `npx eslint "components/modules/rapportini/risanamento/RisanamentoView.tsx" "components/modules/rapportini/risanamento/SlotFoto.tsx" --max-warnings=0` → vuoto.
- [ ] **Step 5: Commit** (verifica branch)
```bash
git add "components/modules/rapportini/risanamento/" "components/modules/rapportini/RapportinoForm.tsx"
git commit -m "feat(risanamento): UI operatore card-civico (3 sezioni, righe, foto prima/dopo)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Verifica finale

- [ ] **Step 1:** `npx vitest run utils/rapportini/campiScope.test.ts` → PASS.
- [ ] **Step 2:** `npx tsc --noEmit 2>&1 | grep -Ei "risanamento|riga/route|campiScope|RapportinoForm"` → nessun errore introdotto.
- [ ] **Step 3:** eslint sui file nuovi → puliti.
- [ ] **Step 4:** `npm run build` → ok; route `/r/[token]` compila.
- [ ] **Step 5:** Riepilogo: 4a pronta sul branch; scanner+lookup (4b) e chiusura/PDF (Fase 5) restano. Nessuna migration nuova.

---

## Self-review (copertura spec 4a)
- Caricamento dati (tipo + righe) → Task 3 ✓
- Aggancio rendering → Task 4 ✓
- Componenti UI (3 sezioni, righe, accessorie attivabili) → Task 5 ✓
- Endpoint /riga (insert/update) → Task 2 ✓
- Flussi foto (riga via /riga, civico via /voce, upload via foto-campo) → Task 5 (SlotFoto + helper) ✓
- Helper campi per scope → Task 1 ✓
- Confine (no scanner/chiusura) → nessun task li tocca ✓

## Note tipi
- `RigaRisanamento` (Task 4) usato da page (Task 3, stessa shape della select), RapportinoForm e RisanamentoView.
- `campiPerScope` → `{misuratore, fase, accessoria}` di `TemplateCampo[]`; `scope_foto` default 'misuratore'.
- Endpoint `/riga` ritorna `{ riga: {...} }`; foto-civico riusa `/voce` (`{voceId, risposte}`); upload via `/foto-campo` (`{path}`).
