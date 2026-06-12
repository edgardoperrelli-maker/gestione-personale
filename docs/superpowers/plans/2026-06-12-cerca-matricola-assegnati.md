# Cerca matricola "smart" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nello step "Cerca matricola" (Lim massive): se la matricola è già un task dell'operatore → apre quella voce in automatico; se è di un altro operatore dello stesso piano → alert "contatta l'ufficio"; i suggerimenti "simili" includono anche i task del proprio rapportino.

**Architecture:** Il match esatto sui propri task e i suggerimenti dai propri task sono lato client (le `voci` sono già in `RapportinoForm`). Il conflitto con altri operatori è lato server (estensione dell'endpoint `cerca-limitazione`, query su `rapportino_voci` dello stesso `piano_id`). Logica di match in una funzione pura testata.

**Tech Stack:** Next.js (route handler `runtime='nodejs'`, `supabaseAdmin`), React client components, Vitest.

---

## File Structure
- **Nuovi:** `lib/limitazione/matchVociMatricola.ts` (+`.test.ts`) — match esatto normalizzato sui task.
- **Modificati:**
  - `app/api/r/[token]/cerca-limitazione/route.ts` — calcola `altroOperatore` (stesso piano).
  - `components/modules/rapportini/limitazione/CercaMatricolaLimitazione.tsx` — auto-apri, alert, suggerimenti dai task.
  - `components/modules/rapportini/ModaleInterventoManuale.tsx` — prop `voci` + `onApriAssegnato`.
  - `components/modules/rapportini/RapportinoForm.tsx` — passa `voci` + `onApriAssegnato`.

## Note gate
Baseline lint/test già rossa su main → verifica **mirata**: `npx tsc --noEmit` (solo errori baseline e2e/playwright), `npx eslint <file>`, `npx vitest run <testfile>`.

---

### Task 1: `matchVociMatricola` (funzione pura, TDD)

**Files:**
- Create: `lib/limitazione/matchVociMatricola.ts`
- Test: `lib/limitazione/matchVociMatricola.test.ts`

- [ ] **Step 1: Scrivi il test (fallisce)**

```ts
import { describe, it, expect } from 'vitest';
import { matchVociMatricola } from './matchVociMatricola';

describe('matchVociMatricola', () => {
  const voci = [
    { id: 'v1', matricola: 'A-023 041' },
    { id: 'v2', matricola: '99B000000' },
    { id: 'v3' }, // senza matricola
  ];

  it('match esatto normalizzato (maiuscole/spazi/trattini)', () => {
    expect(matchVociMatricola(voci, 'a023041')?.id).toBe('v1');
  });

  it('il prefisso variabile NON è match esatto (va ai suggerimenti)', () => {
    expect(matchVociMatricola(voci, '99A023041')).toBeNull();
  });

  it('nessun match → null; ignora voci senza matricola; q vuota → null', () => {
    expect(matchVociMatricola(voci, 'ZZZ999')).toBeNull();
    expect(matchVociMatricola(voci, '')).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui → deve fallire**

Run: `npx vitest run lib/limitazione/matchVociMatricola.test.ts`
Expected: FAIL (modulo non trovato).

- [ ] **Step 3: Implementa**

```ts
import { normMatricola } from './matricoleSimili';

export type VoceMatricola = { id: string; matricola?: string | null; via?: string | null; comune?: string | null };

/** Prima voce con matricola normalizzata uguale a `q` (match esatto), o null. Ignora voci senza matricola. */
export function matchVociMatricola<T extends VoceMatricola>(voci: T[], q: string): T | null {
  const nq = normMatricola(q);
  if (!nq) return null;
  return voci.find((v) => v.matricola != null && normMatricola(v.matricola) === nq) ?? null;
}
```

- [ ] **Step 4: Esegui → deve passare**

Run: `npx vitest run lib/limitazione/matchVociMatricola.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add lib/limitazione/matchVociMatricola.ts lib/limitazione/matchVociMatricola.test.ts
git commit -m "feat(limitazioni): matchVociMatricola (match esatto sui task del rapportino)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Endpoint `cerca-limitazione` — conflitto altro operatore

**Files:**
- Modify: `app/api/r/[token]/cerca-limitazione/route.ts`

- [ ] **Step 1: Aggiorna import e select rapportino**

READ il file. Aggiungi l'import:
```ts
import { matchVociMatricola } from '@/lib/limitazione/matchVociMatricola';
```
Cambia la select del rapportino per includere `piano_id, staff_id`:
```ts
  const { data: rap } = await supabaseAdmin
    .from('rapportini').select('id, stato, data, riaperto_at, piano_id, staff_id').eq('token', token).maybeSingle();
```

- [ ] **Step 2: Calcola `altroOperatore` (dopo la validazione token, PRIMA del match esatto censito)**

Subito dopo il blocco `if (tokenStatus(...) !== 'valido') return ...;`, inserisci:
```ts
  // Conflitto: stesso piano, altro operatore con quella matricola tra i suoi task.
  let altroOperatore: string | null = null;
  const pianoId = (rap as { piano_id?: string | null }).piano_id ?? null;
  const staffId = (rap as { staff_id?: string | null }).staff_id ?? '';
  if (pianoId) {
    const { data: altri } = await supabaseAdmin
      .from('rapportini').select('id, staff_name').eq('piano_id', pianoId).neq('staff_id', staffId);
    const nomePerRapp = new Map<string, string>(
      ((altri ?? []) as Array<{ id: string; staff_name: string | null }>).map((r) => [r.id, r.staff_name ?? '']),
    );
    if (nomePerRapp.size > 0) {
      const { data: vociAltri } = await supabaseAdmin
        .from('rapportino_voci').select('matricola, rapportino_id')
        .in('rapportino_id', [...nomePerRapp.keys()]).not('matricola', 'is', null).limit(2000);
      const hit = matchVociMatricola(
        ((vociAltri ?? []) as Array<{ matricola: string | null; rapportino_id: string }>)
          .map((v) => ({ id: v.rapportino_id, matricola: v.matricola })),
        q,
      );
      if (hit) altroOperatore = nomePerRapp.get(hit.id) || null;
    }
  }
```

- [ ] **Step 3: Includi `altroOperatore` nelle due risposte**

Cambia la risposta del match esatto:
```ts
  if (esatti && esatti.length > 0) {
    return NextResponse.json({ trovato: true, misuratore: esatti[0], altroOperatore });
  }
```
e quella dei suggerimenti (riga finale):
```ts
  return NextResponse.json({ trovato: false, suggerimenti, altroOperatore });
```

- [ ] **Step 4: Verifica tipi/lint**

Run: `npx tsc --noEmit` ed `npx eslint "app/api/r/[token]/cerca-limitazione/route.ts"`
Expected: nessun nuovo errore (baseline e2e/playwright a parte).

- [ ] **Step 5: Commit**

```bash
git add "app/api/r/[token]/cerca-limitazione/route.ts"
git commit -m "feat(limitazioni): cerca-limitazione restituisce altroOperatore (conflitto stesso piano)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `CercaMatricolaLimitazione` — auto-apri / alert / suggerimenti dai task

**Files:**
- Modify (rewrite): `components/modules/rapportini/limitazione/CercaMatricolaLimitazione.tsx`

- [ ] **Step 1: Sostituisci l'INTERO file con:**

```tsx
'use client';

import { useState } from 'react';
import { ScannerMisuratore } from '@/components/modules/rapportini/risanamento/ScannerMisuratore';
import type { CensitoMisuratore } from '@/lib/limitazione/autofillAnagrafica';
import { matchVociMatricola, type VoceMatricola } from '@/lib/limitazione/matchVociMatricola';
import { matricoleSimili } from '@/lib/limitazione/matricoleSimili';

export function CercaMatricolaLimitazione({
  token,
  voci,
  onTrovato,
  onManuale,
  onApriAssegnato,
  onIndietro,
}: {
  token: string;
  voci: VoceMatricola[];
  onTrovato: (m: CensitoMisuratore) => void;
  onManuale: (matricola: string) => void;
  onApriAssegnato: (voceId: string) => void;
  onIndietro: () => void;
}) {
  const [q, setQ] = useState('');
  const [scanner, setScanner] = useState(false);
  const [cercando, setCercando] = useState(false);
  const [suggerimenti, setSuggerimenti] = useState<CensitoMisuratore[]>([]);
  const [suggVoci, setSuggVoci] = useState<Array<VoceMatricola & { matricola: string }>>([]);
  const [altroOperatore, setAltroOperatore] = useState<string | null>(null);
  const [misuratore, setMisuratore] = useState<CensitoMisuratore | null>(null);
  const [cercato, setCercato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const reset = () => {
    setErrore(null); setCercato(false); setSuggerimenti([]); setSuggVoci([]);
    setAltroOperatore(null); setMisuratore(null);
  };

  const cerca = async (valore: string) => {
    const v = valore.trim();
    if (!v) return;
    reset();

    // 1) Già tuo → apri in automatico quella voce
    const own = matchVociMatricola(voci, v);
    if (own) { onApriAssegnato(own.id); return; }

    setCercando(true);
    try {
      const res = await fetch(`/api/r/${token}/cerca-limitazione?q=${encodeURIComponent(v)}`);
      if (!res.ok) { setErrore('Ricerca non riuscita.'); return; }
      const j = (await res.json()) as
        | { trovato: true; misuratore: CensitoMisuratore; altroOperatore: string | null }
        | { trovato: false; suggerimenti: CensitoMisuratore[]; altroOperatore: string | null };
      setAltroOperatore(j.altroOperatore);
      const simili = matricoleSimili(
        v,
        voci.filter((x): x is VoceMatricola & { matricola: string } => x.matricola != null && x.matricola !== ''),
        5,
      );
      setSuggVoci(simili);
      if (j.trovato) {
        setMisuratore(j.misuratore);
        // Nessun conflitto → autofill diretto. Con conflitto → resta e mostra il banner.
        if (!j.altroOperatore) { onTrovato(j.misuratore); return; }
      } else {
        setSuggerimenti(j.suggerimenti);
      }
      setCercato(true);
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
          onChange={(e) => { setQ(e.target.value); setCercato(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void cerca(q); }}
          className="min-w-0 flex-1 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
        />
        <button type="button" onClick={() => setScanner(true)} className="shrink-0 rounded-lg border border-[var(--brand-primary)] px-3 py-2 text-sm font-semibold text-[var(--brand-primary)]">📷</button>
        <button type="button" disabled={cercando || !q.trim()} onClick={() => void cerca(q)} className="shrink-0 rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] disabled:opacity-50">{cercando ? '…' : 'Cerca'}</button>
      </div>

      {errore && <p className="text-sm font-medium text-[var(--danger)]">{errore}</p>}

      {altroOperatore && (
        <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm font-medium text-[var(--danger)]">
          ⚠️ Matricola assegnata a <b>{altroOperatore}</b> — contatta l&apos;ufficio per fartela assegnare.
        </div>
      )}

      {cercato && (
        <div className="space-y-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
          {misuratore && altroOperatore ? (
            <button type="button" onClick={() => onTrovato(misuratore)} className="w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm font-semibold text-[var(--brand-text-main)] hover:border-[var(--brand-primary)]">
              Procedi comunque (compila i dati)
            </button>
          ) : (
            <>
              {suggVoci.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-[var(--brand-text-muted)]">📋 Già nel tuo rapportino:</p>
                  <ul className="space-y-1">
                    {suggVoci.map((s) => (
                      <li key={s.id}>
                        <button type="button" onClick={() => onApriAssegnato(s.id)} className="w-full rounded-lg border border-[var(--brand-primary)] bg-[var(--brand-surface)] px-3 py-2 text-left text-sm text-[var(--brand-text-main)] hover:bg-[var(--brand-primary-soft)]">
                          <span className="font-semibold">{s.matricola}</span>
                          <span className="ml-2 text-xs text-[var(--brand-text-muted)]">{[s.via, s.comune].filter(Boolean).join(' ')}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {suggerimenti.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-[var(--brand-text-muted)]">Forse intendevi:</p>
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
              {suggVoci.length === 0 && suggerimenti.length === 0 && (
                <p className="text-sm font-medium text-[var(--brand-text-main)]">Matricola non censita.</p>
              )}
              <button type="button" onClick={() => onManuale(q.trim())} className="w-full rounded-lg border border-dashed border-[var(--brand-border)] px-3 py-2 text-sm font-semibold text-[var(--brand-text-muted)] hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]">
                Inserisci a mano questa matricola
              </button>
            </>
          )}
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

- [ ] **Step 2: Verifica tipi/lint**

Run: `npx tsc --noEmit` ed `npx eslint components/modules/rapportini/limitazione/CercaMatricolaLimitazione.tsx`
Expected: nessun nuovo errore.

- [ ] **Step 3: Commit**

```bash
git add components/modules/rapportini/limitazione/CercaMatricolaLimitazione.tsx
git commit -m "feat(limitazioni): cerca matricola - auto-apri assegnati, alert altro operatore, suggerimenti dai task

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Wiring `ModaleInterventoManuale` + `RapportinoForm`

**Files:**
- Modify: `components/modules/rapportini/ModaleInterventoManuale.tsx`
- Modify: `components/modules/rapportini/RapportinoForm.tsx`

- [ ] **Step 1: Modale — nuove prop**

In `ModaleInterventoManuale.tsx`, aggiungi l'import del tipo:
```ts
import type { VoceMatricola } from '@/lib/limitazione/matchVociMatricola';
```
Nel tipo delle props del componente (dove ci sono `token`, `infoCampi`, `campiPerCommittente`, `onClose`, `onCreata`), aggiungi:
```ts
  voci: VoceMatricola[];
  onApriAssegnato: (voceId: string) => void;
```
e aggiungili ai parametri destrutturati della firma del componente (es. `export function ModaleInterventoManuale({ token, infoCampi, campiPerCommittente, voci, onApriAssegnato, onClose, onCreata }: { … })`).

- [ ] **Step 2: Modale — passa le prop a Cerca**

Trova il render `<CercaMatricolaLimitazione token={token} onTrovato={…} onManuale={…} onIndietro={…} />` e aggiungi `voci` + `onApriAssegnato`:
```tsx
          <CercaMatricolaLimitazione
            token={token}
            voci={voci}
            onTrovato={(m) => { setAnagrafica((prev) => ({ ...prev, ...autofillAnagrafica(m) })); setCercaFatta(true); }}
            onManuale={(matricola) => { setAnagrafica((prev) => ({ ...prev, matricola })); setCercaFatta(true); }}
            onApriAssegnato={onApriAssegnato}
            onIndietro={() => setStep(1)}
          />
```

- [ ] **Step 3: RapportinoForm — passa `voci` + `onApriAssegnato`**

In `RapportinoForm.tsx`, trova il render `<ModaleInterventoManuale … />` (dentro `{modaleAperta && ( … )}`) e aggiungi le due prop:
```tsx
        <ModaleInterventoManuale
          token={token}
          infoCampi={infoCampiManuale}
          campiPerCommittente={templatesPerCommittente}
          voci={voci}
          onApriAssegnato={(voceId) => {
            setModaleAperta(false);
            const idx = voci.findIndex((v) => v.id === voceId);
            if (idx >= 0) { window.alert('Ordine già assegnato a te — apro il task da compilare.'); onApri(idx); }
          }}
          onClose={() => setModaleAperta(false)}
          onCreata={() => {
            setModaleAperta(false);
            window.location.reload();
          }}
        />
```
(`voci` e `onApri` sono già in scope in `RapportinoForm`. `Voce` è strutturalmente compatibile con `VoceMatricola` — ha `id`, `matricola?`, `via?`, `comune?`.)

- [ ] **Step 4: Verifica tipi/lint**

Run: `npx tsc --noEmit` ed `npx eslint components/modules/rapportini/ModaleInterventoManuale.tsx components/modules/rapportini/RapportinoForm.tsx`
Expected: nessun nuovo errore.

- [ ] **Step 5: Commit**

```bash
git add components/modules/rapportini/ModaleInterventoManuale.tsx components/modules/rapportini/RapportinoForm.tsx
git commit -m "feat(limitazioni): passa voci + onApriAssegnato alla modale (auto-apri task assegnato)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verifica finale
- [ ] `npx vitest run lib/limitazione/matchVociMatricola.test.ts` → PASS.
- [ ] `npx tsc --noEmit` → nessun errore introdotto dal WP.
- [ ] Smoke sul deploy: scan/cerca una matricola che è un tuo task → apre la voce + alert "già assegnato a te". Matricola di un altro operatore dello stesso piano → alert "contatta l'ufficio". Matricola con prefisso diverso presente nel tuo rapportino → compare tra i suggerimenti "📋 già nel tuo rapportino".

## Fuori scope
- Scope conflitto diverso da "stesso piano".
- Blocco rigido sul conflitto (alert non bloccante).
- Italgas/Acea (lo step Cerca esiste solo per Lim massive).
