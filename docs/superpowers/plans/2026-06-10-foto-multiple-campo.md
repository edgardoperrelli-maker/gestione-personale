# Foto multiple per campo (risanamento) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Verificare `git branch --show-current` = `feat/foto-multiple-risanamento` prima di OGNI commit.

**Goal:** Permettere più foto sui campi fase/accessoria del risanamento (misuratore resta a 1 foto), regola scope-based.

**Architecture:** `risposte[chiave]` diventa `string | string[]`. Helper `comeArrayFoto` normalizza. Nuovo componente `GalleriaFoto` per i campi multipli. `RisanamentoView` usa GalleriaFoto in Fasi/Accessorie. `righeIncomplete` e `foto-zip` leggono via `comeArrayFoto`.

**Tech Stack:** Next.js 15, TypeScript, React 19, Supabase, Vitest.

**Vincoli:** Nessuna migration. Gate: unit test, `tsc`, `eslint` (file nuovi), `npm run build`. Branch `feat/foto-multiple-risanamento`. NO push senza ok.

---

## File Structure
- Create: `utils/rapportini/comeArrayFoto.ts` (+ test) — normalizza string|string[] → string[].
- Create: `components/modules/rapportini/risanamento/GalleriaFoto.tsx` — galleria multi-foto.
- Modify: `components/modules/rapportini/risanamento/RisanamentoView.tsx` — Fasi/Accessorie usano GalleriaFoto.
- Modify: `utils/rapportini/righeIncomplete.ts` (+test) — validazione via comeArrayFoto.
- Modify: `app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts` — entry per path (indice se >1).
- Modify: `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` — hint "(più foto)" in anteprima.

---

## Task 1: Helper comeArrayFoto (TDD)

**Files:** Create `utils/rapportini/comeArrayFoto.ts` + `utils/rapportini/comeArrayFoto.test.ts`

- [ ] **Step 1: Test che fallisce** — `utils/rapportini/comeArrayFoto.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { comeArrayFoto } from './comeArrayFoto';

describe('comeArrayFoto', () => {
  it('stringa non vuota → lista di 1', () => {
    expect(comeArrayFoto('a/b.jpg')).toEqual(['a/b.jpg']);
  });
  it('array → filtra vuoti e non-stringhe', () => {
    expect(comeArrayFoto(['a.jpg', '', 'b.jpg'])).toEqual(['a.jpg', 'b.jpg']);
    expect(comeArrayFoto(['a.jpg', null, 2, 'b.jpg'] as never)).toEqual(['a.jpg', 'b.jpg']);
  });
  it('vuoto/null/undefined → lista vuota', () => {
    expect(comeArrayFoto(null)).toEqual([]);
    expect(comeArrayFoto(undefined)).toEqual([]);
    expect(comeArrayFoto('')).toEqual([]);
    expect(comeArrayFoto('   ')).toEqual([]);
    expect(comeArrayFoto([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Esegui** `npx vitest run utils/rapportini/comeArrayFoto.test.ts` → FAIL.

- [ ] **Step 3: Implementa** — `utils/rapportini/comeArrayFoto.ts`:
```ts
/** Normalizza un valore-foto (string | string[] | altro) in una lista di path non vuoti. */
export function comeArrayFoto(v: unknown): string[] {
  if (typeof v === 'string') {
    const s = v.trim();
    return s ? [s] : [];
  }
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  }
  return [];
}
```

- [ ] **Step 4: Esegui** `npx vitest run utils/rapportini/comeArrayFoto.test.ts` → PASS.
- [ ] **Step 5: Lint** `npx eslint utils/rapportini/comeArrayFoto.ts utils/rapportini/comeArrayFoto.test.ts --max-warnings=0` → vuoto.
- [ ] **Step 6: Commit** (verifica branch)
```bash
git add utils/rapportini/comeArrayFoto.ts utils/rapportini/comeArrayFoto.test.ts
git commit -m "feat(risanamento): helper comeArrayFoto (normalizza foto singola/multipla)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Validazione righeIncomplete via comeArrayFoto

**Files:** Modify `utils/rapportini/righeIncomplete.ts`; extend `utils/rapportini/righeIncomplete.test.ts`

- [ ] **Step 1: Test aggiuntivo** — aggiungi a `righeIncomplete.test.ts` (dentro il `describe` esistente):
```ts
  it('fase obbligatoria con array vuoto → incompleta; con foto → ok', () => {
    const campiFase = [
      { chiave: 'prima', etichetta: 'Prima', tipo: 'foto', ordine: 1, scope_foto: 'misuratore', obbligatoria: true },
      { chiave: 'dopo', etichetta: 'Dopo', tipo: 'foto', ordine: 2, scope_foto: 'misuratore', obbligatoria: true },
      { chiave: 'resina', etichetta: 'Resina', tipo: 'foto', ordine: 3, scope_foto: 'fase', obbligatoria: true },
    ] as never;
    const rigaOk = [{ id: 'r1', voce_id: 'v1', matricola: 'M1', risposte: { prima: 'p.jpg', dopo: 'd.jpg' } }] as never;
    const vuoto = righeIncomplete([{ id: 'v1', via: 'V', risposte: { resina: [] } }] as never, rigaOk, campiFase);
    expect(vuoto.ok).toBe(false);
    const pieno = righeIncomplete([{ id: 'v1', via: 'V', risposte: { resina: ['r1.jpg', 'r2.jpg'] } }] as never, rigaOk, campiFase);
    expect(pieno.ok).toBe(true);
  });
```

- [ ] **Step 2: Esegui** `npx vitest run utils/rapportini/righeIncomplete.test.ts` → il nuovo test FALLISCE (oggi `fotoPresente` non gestisce array).

- [ ] **Step 3: Implementa** — in `righeIncomplete.ts`: importa `import { comeArrayFoto } from './comeArrayFoto';`. Rimuovi la funzione `fotoPresente` e sostituisci i suoi usi con `comeArrayFoto(risposte?.[chiave]).length > 0`. Concretamente, nelle due `filter`:
```ts
    const mancanti = misObb.filter((c) => comeArrayFoto(r.risposte?.[c.chiave]).length === 0).map((c) => c.etichetta);
```
e
```ts
      const mancanti = faseObb.filter((c) => comeArrayFoto(v.risposte?.[c.chiave]).length === 0).map((c) => c.etichetta);
```

- [ ] **Step 4: Esegui** `npx vitest run utils/rapportini/righeIncomplete.test.ts` → PASS (tutti, inclusi i preesistenti: string singola → comeArrayFoto length 1).
- [ ] **Step 5: Lint** `npx eslint utils/rapportini/righeIncomplete.ts --max-warnings=0` → vuoto.
- [ ] **Step 6: Commit** (verifica branch)
```bash
git add utils/rapportini/righeIncomplete.ts utils/rapportini/righeIncomplete.test.ts
git commit -m "feat(risanamento): validazione foto gestisce liste (multi-foto)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Componente GalleriaFoto

**Files:** Create `components/modules/rapportini/risanamento/GalleriaFoto.tsx`

- [ ] **Step 1: Implementa** — `components/modules/rapportini/risanamento/GalleriaFoto.tsx`:
```tsx
'use client';
import { useRef, useState } from 'react';
import { comprimiImmagine } from '../CampoFoto';

/** Galleria multi-foto: aggiunge/rimuove foto a una lista. Carica via foto-campo. */
export function GalleriaFoto({
  token, etichetta, valori, obbligatoria, disabilitato, onAdd, onRemove,
}: {
  token: string; etichetta: string; valori: string[];
  obbligatoria?: boolean; disabilitato?: boolean;
  onAdd: (path: string) => void; onRemove: (path: string) => void;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const handle = async (f: File | undefined) => {
    if (!f || busy) return;
    setBusy(true); setErr(false);
    try {
      const compressed = await comprimiImmagine(f);
      const fd = new FormData();
      fd.append('file', compressed, compressed.name);
      const res = await fetch(`/api/r/${token}/foto-campo`, { method: 'POST', body: fd });
      if (!res.ok) { setErr(true); return; }
      const json = (await res.json()) as { path?: string };
      if (json.path) onAdd(json.path);
    } catch { setErr(true); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--brand-text-main)]">{etichetta}{obbligatoria ? ' *' : ''}</span>
        <span className="text-xs text-[var(--brand-text-muted)]">{valori.length ? `${valori.length} foto` : err ? <span className="text-[var(--danger)]">errore</span> : '—'}</span>
      </div>
      {valori.length > 0 && (
        <ul className="mb-2 space-y-1">
          {valori.map((p, i) => (
            <li key={p} className="flex items-center justify-between rounded-lg bg-[var(--brand-surface)] px-2 py-1 text-xs">
              <span className="text-[var(--success)]">✓ Foto {i + 1}</span>
              {!disabilitato && (
                <button type="button" onClick={() => onRemove(p)} className="text-[var(--danger)]" aria-label={`Rimuovi foto ${i + 1}`}>✕</button>
              )}
            </li>
          ))}
        </ul>
      )}
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

- [ ] **Step 2: tsc** `npx tsc --noEmit 2>&1 | grep -i GalleriaFoto` → vuoto.
- [ ] **Step 3: Lint** `npx eslint "components/modules/rapportini/risanamento/GalleriaFoto.tsx" --max-warnings=0` → vuoto.
- [ ] **Step 4: Commit** (verifica branch)
```bash
git add "components/modules/rapportini/risanamento/GalleriaFoto.tsx"
git commit -m "feat(risanamento): componente GalleriaFoto (multi-foto add/remove)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: RisanamentoView — Fasi/Accessorie multi-foto

**Files:** Modify `components/modules/rapportini/risanamento/RisanamentoView.tsx`

- [ ] **Step 1: Import.** Aggiungi `import { GalleriaFoto } from './GalleriaFoto';` e `import { comeArrayFoto } from '@/utils/rapportini/comeArrayFoto';`.

- [ ] **Step 2: Handler add/remove foto-voce.** Vicino a `salvaFotoVoce` (che resta per i casi single, ma le Fasi/Accessorie useranno questi), aggiungi:
```tsx
  const aggiungiFotoVoce = async (chiave: string, path: string) => {
    if (!civicoApertoId) return;
    setErrore(null);
    const correnti = comeArrayFoto(risposteVoce[chiave]);
    const nuovo = [...correnti, path];
    try {
      const res = await fetch(`/api/r/${token}/voce`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voceId: civicoApertoId, risposte: { [chiave]: nuovo } }),
      });
      if (!res.ok) { setErrore('Errore nel salvataggio della foto'); return; }
      setVociRisposte((prev) => ({ ...prev, [civicoApertoId]: { ...(prev[civicoApertoId] ?? {}), [chiave]: nuovo } }));
    } catch { setErrore('Errore di rete nel salvataggio della foto'); }
  };
  const rimuoviFotoVoce = async (chiave: string, path: string) => {
    if (!civicoApertoId) return;
    const nuovo = comeArrayFoto(risposteVoce[chiave]).filter((p) => p !== path);
    try {
      const res = await fetch(`/api/r/${token}/voce`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voceId: civicoApertoId, risposte: { [chiave]: nuovo } }),
      });
      if (!res.ok) { setErrore('Errore nella rimozione della foto'); return; }
      setVociRisposte((prev) => ({ ...prev, [civicoApertoId]: { ...(prev[civicoApertoId] ?? {}), [chiave]: nuovo } }));
    } catch { setErrore('Errore di rete'); }
  };
```
NOTA: `risposteVoce` è la mappa risposte del civico aperto già usata nel componente; adatta il nome se diverso (è la stessa fonte letta da `risposteVoce[campo.chiave]` nelle sezioni Fasi/Accessorie).

- [ ] **Step 3: Sezione Fasi** — sostituisci il blocco `scope.fase.map((campo) => (<SlotFoto .../>))` con:
```tsx
              {scope.fase.map((campo) => (
                <GalleriaFoto
                  key={campo.chiave}
                  token={token}
                  etichetta={campo.etichetta}
                  obbligatoria={campo.obbligatoria}
                  valori={comeArrayFoto(risposteVoce[campo.chiave])}
                  disabilitato={readOnly}
                  onAdd={(path) => { void aggiungiFotoVoce(campo.chiave, path); }}
                  onRemove={(path) => { void rimuoviFotoVoce(campo.chiave, path); }}
                />
              ))}
```

- [ ] **Step 4: Sezione Accessorie** — l'attivazione usa `comeArrayFoto`; il ramo attivo usa `GalleriaFoto`:
```tsx
              {scope.accessoria.map((campo) => {
                const attiva = accessorieAttive.has(campo.chiave) || comeArrayFoto(risposteVoce[campo.chiave]).length > 0;
                if (attiva) {
                  return (
                    <GalleriaFoto
                      key={campo.chiave}
                      token={token}
                      etichetta={campo.etichetta}
                      obbligatoria={campo.obbligatoria}
                      valori={comeArrayFoto(risposteVoce[campo.chiave])}
                      disabilitato={readOnly}
                      onAdd={(path) => { void aggiungiFotoVoce(campo.chiave, path); }}
                      onRemove={(path) => { void rimuoviFotoVoce(campo.chiave, path); }}
                    />
                  );
                }
                if (readOnly) return null;
                return (
                  <button key={campo.chiave} type="button" onClick={() => attivaAccessoria(campo.chiave)}
                    className="w-full rounded-xl border border-dashed border-[var(--brand-border)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]">
                    + {campo.etichetta}
                  </button>
                );
              })}
```
(I Misuratori — Sezione 1 — restano con `SlotFoto`, NON toccare. `salvaFotoVoce` resta definita anche se ora non più usata dalle Fasi/Accessorie: se diventa inutilizzata, rimuoverla per non lasciare codice morto.)

- [ ] **Step 5: tsc** `npx tsc --noEmit 2>&1 | grep -i RisanamentoView` → vuoto (rimuovi `salvaFotoVoce` se eslint la segnala inutilizzata).
- [ ] **Step 6: Lint** `npx eslint "components/modules/rapportini/risanamento/RisanamentoView.tsx" --max-warnings=0` → vuoto.
- [ ] **Step 7: Commit** (verifica branch)
```bash
git add "components/modules/rapportini/risanamento/RisanamentoView.tsx"
git commit -m "feat(risanamento): Fasi/Accessorie con galleria multi-foto" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: ZIP foto — una entry per path (indice se >1)

**Files:** Modify `app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts`

- [ ] **Step 1: Import** `import { comeArrayFoto } from '@/utils/rapportini/comeArrayFoto';`.

- [ ] **Step 2: Fonte B (voci)** — sostituisci il blocco che legge il path singolo dal campo voce:
```ts
      for (const campo of campiFoto) {
        const paths = comeArrayFoto((v.risposte ?? {})[campo.chiave]);
        paths.forEach((storagePath, i) => {
          const ext = storagePath.split('.').pop() ?? 'jpg';
          let fileName = nomeFotoFile(campo.etichetta, ids, ext, fotoPriority);
          if (paths.length > 1) fileName = fileName.replace(/(\.[^.]+)$/, `_${i + 1}$1`);
          fotoVoci.push({ richiesta_id: v.id, storage_path: storagePath, file_name: fileName });
        });
      }
```

- [ ] **Step 3: Fonte C (righe-misuratore)** — analogamente, sostituisci il blocco interno con:
```ts
      for (const campo of campiMisuratore) {
        const paths = comeArrayFoto((r.risposte ?? {})[campo.chiave]);
        paths.forEach((storagePath, i) => {
          const ext = storagePath.split('.').pop() ?? 'jpg';
          let fileName = nomeFotoFile(campo.etichetta, ids, ext, fotoPriority);
          if (paths.length > 1) fileName = fileName.replace(/(\.[^.]+)$/, `_${i + 1}$1`);
          fotoRighe.push({ richiesta_id: r.id, storage_path: storagePath, file_name: fileName });
        });
      }
```
(I misuratori avranno sempre 1 path → nessun indice; comportamento invariato per i single.)

- [ ] **Step 4: tsc** `npx tsc --noEmit 2>&1 | grep -i foto-zip` → vuoto.
- [ ] **Step 5: Lint** `npx eslint "app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts" --max-warnings=0` → vuoto.
- [ ] **Step 6: Commit** (verifica branch)
```bash
git add "app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts"
git commit -m "feat(risanamento): ZIP esporta tutte le foto dei campi multipli (indice nel nome)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Editor template — hint "(più foto)" in anteprima

**Files:** Modify `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`

- [ ] **Step 1:** Nell'"Anteprima sezioni foto" (~riga 730-743), per le sezioni `fase` e `accessoria` aggiungi l'indicazione "(più foto)". Trova la riga che costruisce la stringa dei campi della sezione (`slots.map(...).join(', ')`) e, quando `s.v !== 'misuratore'`, anteponi/accoda "(più foto)". Esempio: dopo la lista dei nomi, se `s.v !== 'misuratore' && slots.length > 0`, aggiungi ` — più foto`. Leggi il contesto esatto e inseriscilo nella riga del valore della sezione.

- [ ] **Step 2: tsc** `npx tsc --noEmit 2>&1 | grep -i TemplateRapportini` → vuoto.
- [ ] **Step 3: Lint** `npx eslint "app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx" --max-warnings=0` → vuoto (o solo preesistenti).
- [ ] **Step 4: Commit** (verifica branch)
```bash
git add "app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx"
git commit -m "feat(risanamento): anteprima template segnala le sezioni a più foto" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Verifica finale

- [ ] **Step 1:** `npx vitest run utils/rapportini/comeArrayFoto.test.ts utils/rapportini/righeIncomplete.test.ts` → PASS.
- [ ] **Step 2:** `npx tsc --noEmit 2>&1 | grep -Ei "comeArrayFoto|GalleriaFoto|RisanamentoView|righeIncomplete|foto-zip|TemplateRapportini"` → nessun errore introdotto.
- [ ] **Step 3:** eslint sui file nuovi → puliti.
- [ ] **Step 4:** `npm run build` → ok.
- [ ] **Step 5:** Riepilogo: foto multiple pronte; verifica reale sul campo (fotocamera) + scarico ZIP con più foto.

---

## Self-review (copertura spec)
- Helper comeArrayFoto → Task 1 ✓
- Storage string|string[] + retrocompat → Task 1 (helper) + Task 4 (handler) ✓
- GalleriaFoto → Task 3 ✓
- RisanamentoView Fasi/Accessorie multi (misuratore invariato) → Task 4 ✓
- Validazione (fase obbligatoria ≥1) → Task 2 ✓
- ZIP indicizzato → Task 5 ✓
- Editor anteprima hint → Task 6 ✓
- Confine (standard invariato, no PDF) → nessun task li tocca ✓

## Note tipi
- `comeArrayFoto(v) → string[]`; usato in righeIncomplete (Task 2), RisanamentoView (Task 4), foto-zip (Task 5).
- `GalleriaFoto` props `{ token, etichetta, valori: string[], obbligatoria?, disabilitato?, onAdd, onRemove }`.
- `/voce` POST `{ voceId, risposte: { [chiave]: string[] } }` — accetta già `Record<string, unknown>`, nessuna modifica server.
