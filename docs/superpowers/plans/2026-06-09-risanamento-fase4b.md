# Risanamento — Fase 4b (Scanner + lookup) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. **Sessioni concorrenti**: verificare `git branch --show-current` = `feat/risanamento-fase4b` prima di OGNI commit; se diverso, NON committare.

**Goal:** Scansionare barcode/QR del misuratore, cercare la matricola nell'estrazione e creare la riga auto-compilando PDR/nominativo; barra di ricerca scanner per la fase "dopo".

**Architecture:** Helper puro per il match indirizzo (civico vs fuori_elenco). Endpoint `lookup-misuratore` che cerca la matricola in `risanamento_misuratori_ref`. Componente `ScannerMisuratore` con `@zxing/browser` (cross-browser). `RisanamentoView` integra scan→lookup→crea-riga e una ricerca scan per ritrovare righe.

**Tech Stack:** Next.js 15, TypeScript, Supabase, `@zxing/browser` (nuova dep), Vitest, React 19.

**Vincoli:** Nessuna migration nuova. Gate: unit test helper, `tsc`, `eslint` (mirato file nuovi), `npm run build`. Lo scanner si prova solo sul campo (fotocamera). Branch `feat/risanamento-fase4b`. NO push senza ok.

---

## File Structure
- Create: `utils/rapportini/matchIndirizzo.ts` (+ test) — normalizza/confronta indirizzi.
- Create: `app/api/r/[token]/lookup-misuratore/route.ts` — GET lookup matricola.
- Modify: `app/api/r/[token]/riga/route.ts` — INSERT accetta `fonte`/`ref_id`.
- Create: `components/modules/rapportini/risanamento/ScannerMisuratore.tsx` — overlay scanner zxing.
- Modify: `components/modules/rapportini/risanamento/RisanamentoView.tsx` — bottoni scan + handler.
- Modify: `package.json` — aggiunge `@zxing/browser`.

---

## Task 1: Helper match indirizzo (TDD)

**Files:** Create `utils/rapportini/matchIndirizzo.ts` + `utils/rapportini/matchIndirizzo.test.ts`

- [ ] **Step 1: Test che fallisce** — `utils/rapportini/matchIndirizzo.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizzaIndirizzo, stessoCivico } from './matchIndirizzo';

describe('normalizzaIndirizzo', () => {
  it('lowercase, no accenti/punteggiatura/spazi', () => {
    expect(normalizzaIndirizzo('Via G. D\'Annunzio, 12')).toBe('viagdannunzio12');
    expect(normalizzaIndirizzo('  VIA Róma  ')).toBe('viaroma');
    expect(normalizzaIndirizzo(null)).toBe('');
  });
});

describe('stessoCivico', () => {
  it('uguali dopo normalizzazione', () => {
    expect(stessoCivico('Via Roma 12', 'via roma 12')).toBe(true);
  });
  it('uno contiene l\'altro (tollera civico mancante)', () => {
    expect(stessoCivico('Via Roma', 'Via Roma 12')).toBe(true);
    expect(stessoCivico('Via Roma 12', 'Via Roma')).toBe(true);
  });
  it('vie diverse → false', () => {
    expect(stessoCivico('Via Roma 12', 'Via Milano 3')).toBe(false);
  });
  it('vuoti → false', () => {
    expect(stessoCivico('', 'Via Roma')).toBe(false);
    expect(stessoCivico('Via Roma', '')).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui** `npx vitest run utils/rapportini/matchIndirizzo.test.ts` → FAIL.

- [ ] **Step 3: Implementa** — `utils/rapportini/matchIndirizzo.ts`:
```ts
/** Normalizza un indirizzo in stringa canonica: lowercase, senza accenti/punteggiatura/spazi. */
export function normalizzaIndirizzo(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** True se due indirizzi coincidono dopo normalizzazione (uguali o uno contiene l'altro). */
export function stessoCivico(viaVoce: unknown, indirizzoRef: unknown): boolean {
  const a = normalizzaIndirizzo(viaVoce);
  const b = normalizzaIndirizzo(indirizzoRef);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}
```

- [ ] **Step 4: Esegui** `npx vitest run utils/rapportini/matchIndirizzo.test.ts` → PASS.
- [ ] **Step 5: Lint** `npx eslint utils/rapportini/matchIndirizzo.ts utils/rapportini/matchIndirizzo.test.ts --max-warnings=0` → vuoto.
- [ ] **Step 6: Commit** (verifica branch)
```bash
git add utils/rapportini/matchIndirizzo.ts utils/rapportini/matchIndirizzo.test.ts
git commit -m "feat(risanamento): helper normalizza/confronta indirizzo (civico vs fuori_elenco)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Endpoint lookup-misuratore

**Files:** Create `app/api/r/[token]/lookup-misuratore/route.ts`

- [ ] **Step 1: Implementa** (guard come gli altri `/r/[token]`):
```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { stessoCivico } from '@/utils/rapportini/matchIndirizzo';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { searchParams } = new URL(req.url);
  const voceId = searchParams.get('voceId') ?? '';
  const codice = (searchParams.get('codice') ?? '').trim();
  if (!voceId || !codice) return NextResponse.json({ error: 'voceId e codice obbligatori' }, { status: 400 });

  const { data: rap } = await supabaseAdmin
    .from('rapportini').select('id, stato, data, riaperto_at').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  const { data: voce } = await supabaseAdmin
    .from('rapportino_voci').select('id, via').eq('id', voceId).eq('rapportino_id', rap.id).maybeSingle();
  if (!voce) return NextResponse.json({ error: 'voce_non_valida' }, { status: 400 });

  const { data: matches } = await supabaseAdmin
    .from('risanamento_misuratori_ref')
    .select('id, pdr, nominativo, indirizzo')
    .eq('matricola', codice);
  const list = (matches ?? []) as Array<{ id: number; pdr: string | null; nominativo: string | null; indirizzo: string | null }>;
  if (list.length === 0) return NextResponse.json({ trovato: false });

  const via = (voce as { via: string | null }).via;
  const civico = list.find((m) => stessoCivico(via, m.indirizzo));
  const scelto = civico ?? list[0];
  return NextResponse.json({
    trovato: true,
    fonte: civico ? 'civico' : 'fuori_elenco',
    ref_id: scelto.id,
    pdr: scelto.pdr ?? '',
    nominativo: scelto.nominativo ?? '',
    indirizzoRef: civico ? undefined : (scelto.indirizzo ?? ''),
  });
}
```

- [ ] **Step 2: Type-check** `npx tsc --noEmit 2>&1 | grep -i "lookup-misuratore"` → vuoto.
- [ ] **Step 3: Lint** `npx eslint "app/api/r/[token]/lookup-misuratore/route.ts" --max-warnings=0` → vuoto.
- [ ] **Step 4: Commit** (verifica branch)
```bash
git add "app/api/r/[token]/lookup-misuratore/route.ts"
git commit -m "feat(risanamento): endpoint lookup matricola (civico/fuori_elenco/non trovato)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Estendi /riga (fonte + ref_id)

**Files:** Modify `app/api/r/[token]/riga/route.ts`

- [ ] **Step 1:** Nel body type aggiungi `fonte?: 'civico' | 'fuori_elenco' | 'manuale'; ref_id?: number | null;`. Nell'INSERT (ramo senza `rigaId`), sostituisci `ref_id: null, fonte: 'manuale'` con i valori dal body (con default):
```ts
      ref_id: body.ref_id ?? null,
      fonte: body.fonte === 'civico' || body.fonte === 'fuori_elenco' ? body.fonte : 'manuale',
```
(lascia invariato il resto: `voce_id`, `rapportino_id`, `matricola`, `pdr`, `nominativo`, `risposte`, `ordine`, `creato_da`).

- [ ] **Step 2: Type-check** `npx tsc --noEmit 2>&1 | grep -i "riga/route"` → vuoto.
- [ ] **Step 3: Lint** `npx eslint "app/api/r/[token]/riga/route.ts" --max-warnings=0` → vuoto.
- [ ] **Step 4: Commit** (verifica branch)
```bash
git add "app/api/r/[token]/riga/route.ts"
git commit -m "feat(risanamento): /riga accetta fonte e ref_id (righe da scan)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Componente ScannerMisuratore (@zxing/browser)

**Files:** Modify `package.json` (add dep); Create `components/modules/rapportini/risanamento/ScannerMisuratore.tsx`

- [ ] **Step 1: Installa la libreria** `npm install @zxing/browser` (aggiunge anche `@zxing/library` come dipendenza transitiva). Verifica che `package.json` la elenchi.

- [ ] **Step 2: Verifica l'API installata.** Apri `node_modules/@zxing/browser/esm/index.d.ts` (o `README`) e conferma il nome esatto: `BrowserMultiFormatReader` e il metodo `decodeFromConstraints(constraints, videoElement, callback)` che ritorna `IScannerControls` con `.stop()`. Se l'API differisce nella versione installata, adatta il codice dello Step 3 di conseguenza (mantieni: apri camera posteriore, decodifica continua, primo risultato → callback + stop).

- [ ] **Step 3: Implementa** — `components/modules/rapportini/risanamento/ScannerMisuratore.tsx`:
```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';

/** Overlay scanner: apre la fotocamera posteriore, decodifica barcode/QR, primo codice → onCodice. */
export function ScannerMisuratore({ onCodice, onChiudi }: { onCodice: (codice: string) => void; onChiudi: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let attivo = true;
    const reader = new BrowserMultiFormatReader();
    (async () => {
      try {
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current!,
          (result) => {
            if (result && attivo) {
              const testo = result.getText().trim();
              if (testo) { controlsRef.current?.stop(); onCodice(testo); }
            }
          },
        );
        controlsRef.current = controls;
        if (!attivo) controls.stop();
      } catch {
        if (attivo) setErrore('Fotocamera non disponibile o permesso negato. Usa l\'inserimento manuale.');
      }
    })();
    return () => { attivo = false; controlsRef.current?.stop(); };
  }, [onCodice]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      <div className="flex items-center justify-between p-4">
        <span className="text-sm font-semibold text-white">Inquadra il codice del misuratore</span>
        <button type="button" onClick={onChiudi} className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-semibold text-white">Annulla</button>
      </div>
      {errore ? (
        <div className="m-4 rounded-xl bg-white p-4 text-sm text-[var(--danger)]">{errore}</div>
      ) : (
        <video ref={videoRef} className="min-h-0 flex-1 object-cover" muted playsInline />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Type-check** `npx tsc --noEmit 2>&1 | grep -i "ScannerMisuratore"` → vuoto. (Se i tipi di `@zxing/browser` non includono `IScannerControls`, importalo da `@zxing/browser` o tipizza `controlsRef` come `{ stop: () => void } | null` con un commento.)
- [ ] **Step 5: Lint** `npx eslint "components/modules/rapportini/risanamento/ScannerMisuratore.tsx" --max-warnings=0` → vuoto.
- [ ] **Step 6: Commit** (verifica branch)
```bash
git add package.json package-lock.json "components/modules/rapportini/risanamento/ScannerMisuratore.tsx"
git commit -m "feat(risanamento): componente ScannerMisuratore (@zxing/browser, barcode/QR)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Integrazione scanner in RisanamentoView

**Files:** Modify `components/modules/rapportini/risanamento/RisanamentoView.tsx`

Leggi il file per ancorare gli edit. Importa `ScannerMisuratore` e (se servono i tipi) `RigaRisanamento`.

- [ ] **Step 1: Stato scanner.** Aggiungi: `const [scanner, setScanner] = useState<null | 'crea' | 'cerca'>(null);` e `const [evidenziata, setEvidenziata] = useState<string | null>(null);`.

- [ ] **Step 2: Handler "crea da scan".**
```tsx
  const onScanCrea = async (codice: string) => {
    setScanner(null);
    if (!civicoApertoId) return;
    try {
      const res = await fetch(`/api/r/${token}/lookup-misuratore?voceId=${encodeURIComponent(civicoApertoId)}&codice=${encodeURIComponent(codice)}`);
      const json = await res.json();
      if (!res.ok) { setErrore(json.error ?? 'Lookup fallito'); return; }
      if (!json.trovato) {
        // Precompila il form manuale con la matricola scansionata.
        setMat(codice); setPdr(''); setNom('');
        setErrore('Matricola non in elenco: completa i dati e salva.');
        return;
      }
      const r = await fetch(`/api/r/${token}/riga`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voceId: civicoApertoId, matricola: codice, pdr: json.pdr, nominativo: json.nominativo, fonte: json.fonte, ref_id: json.ref_id }),
      });
      const rj = await r.json();
      if (!r.ok) { setErrore(rj.error ?? 'Creazione riga fallita'); return; }
      setRighe((prev) => [...prev, rj.riga]);
      if (json.fonte === 'fuori_elenco') setErrore(`Misuratore fuori elenco (anagrafica: ${json.indirizzoRef ?? '—'}).`);
    } catch { setErrore('Errore di rete'); }
  };
```

- [ ] **Step 3: Handler "cerca (dopo)".**
```tsx
  const onScanCerca = (codice: string) => {
    setScanner(null);
    const norm = codice.trim();
    const riga = righe.find((r) => r.voce_id === civicoApertoId && (r.matricola ?? '') === norm);
    if (riga) { setEvidenziata(riga.id); setErrore(null); }
    else setErrore('Misuratore non presente: usa "Scansiona" per crearlo.');
  };
```

- [ ] **Step 4: Bottoni nella sezione Misuratori** (solo se `!readOnly`): accanto a "+ Aggiungi misuratore", aggiungi:
```tsx
  <button type="button" onClick={() => setScanner('crea')} className="rounded-lg border border-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)]">📷 Scansiona</button>
  <button type="button" onClick={() => setScanner('cerca')} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-semibold">🔍 Cerca (scan)</button>
```

- [ ] **Step 5: Render dello scanner** (in fondo al JSX del componente, dentro il fragment/div radice):
```tsx
  {scanner && (
    <ScannerMisuratore
      onCodice={scanner === 'crea' ? onScanCrea : onScanCerca}
      onChiudi={() => setScanner(null)}
    />
  )}
```

- [ ] **Step 6: Evidenziazione riga** — sulla card/riga misuratore, aggiungi un bordo se `evidenziata === riga.id` (es. `className={... + (evidenziata === riga.id ? ' ring-2 ring-[var(--brand-primary)]' : '')}`). Opzionale: `useEffect` per pulire `evidenziata` dopo qualche secondo.

- [ ] **Step 7: Type-check** `npx tsc --noEmit 2>&1 | grep -i "RisanamentoView"` → vuoto.
- [ ] **Step 8: Lint** `npx eslint "components/modules/rapportini/risanamento/RisanamentoView.tsx" --max-warnings=0` → vuoto.
- [ ] **Step 9: Commit** (verifica branch)
```bash
git add "components/modules/rapportini/risanamento/RisanamentoView.tsx"
git commit -m "feat(risanamento): scan crea riga (lookup) + ricerca scan per fase dopo" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Verifica finale

- [ ] **Step 1:** `npx vitest run utils/rapportini/matchIndirizzo.test.ts` → PASS.
- [ ] **Step 2:** `npx tsc --noEmit 2>&1 | grep -Ei "risanamento|lookup-misuratore|matchIndirizzo|riga/route|Scanner"` → nessun errore introdotto.
- [ ] **Step 3:** eslint sui file nuovi → puliti.
- [ ] **Step 4:** `npm run build` → ok (verifica che `@zxing/browser` non rompa il bundle SSR — il componente è `'use client'`, quindi ok).
- [ ] **Step 5:** Riepilogo: 4b pronta; lo scanner va provato **sul campo** (fotocamera). Resta solo la Fase 5 (chiusura + PDF). Nessuna migration nuova.

---

## Self-review (copertura spec 4b)
- Libreria + ScannerMisuratore → Task 4 ✓
- Helper match indirizzo → Task 1 ✓
- Endpoint lookup → Task 2 ✓
- /riga esteso (fonte/ref_id) → Task 3 ✓
- Integrazione (scan crea + ricerca dopo) → Task 5 ✓
- Confine (no chiusura/PDF) → nessun task li tocca ✓

## Note tipi
- `stessoCivico(viaVoce, indirizzoRef)` usato nel lookup (Task 2) e testato (Task 1).
- Lookup ritorna `{ trovato, fonte, ref_id, pdr, nominativo, indirizzoRef? }`; `RisanamentoView` (Task 5) lo passa a `/riga` con `fonte`/`ref_id` (Task 3 li accetta).
- `fonte` valori `'civico'|'fuori_elenco'|'manuale'` coerenti con la CHECK di `rapportino_righe` (Fase 1) e il tipo `RigaRisanamento`.
