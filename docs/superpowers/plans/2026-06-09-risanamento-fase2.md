# Risanamento — Fase 2 (Editor template) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rendere l'editor template capace di impostare il `tipo` (standard/risanamento) e, per i template risanamento, dare a ogni campo foto uno scope (misuratore/fase/accessoria).

**Architecture:** `scope_foto` si aggiunge a `TemplateCampo` (vive nel jsonb `campi`, persiste da solo) e a `CampoSchema`; `tipo` si aggiunge a `TemplateSchema` e all'API. L'editor guadagna un selettore "Tipo template" e, in modalità risanamento, un selettore scope per ogni campo foto (con accessoria sempre opzionale).

**Tech Stack:** Next.js 15, TypeScript, Zod, Vitest, React 19, Tailwind v4.

**Vincoli:** Niente migration (la colonna `tipo` esiste dalla Fase 1). Gate locali: unit test schema, `tsc`, `eslint` (baseline rossa → mirato sui file toccati), `npm run build`. Branch `feat/risanamento-fase2`. NO push senza ok.

---

## File Structure
- Modify: `utils/rapportini/buildVoci.ts` (campo `scope_foto` su `TemplateCampo`)
- Modify: `lib/rapportini/templateSchema.ts` (`scope_foto` in `CampoSchema`, `tipo` in `TemplateSchema`)
- Create: `lib/rapportini/templateSchema.test.ts` (unit)
- Modify: `app/api/admin/rapportino-template/route.ts` (GET/POST/PATCH includono `tipo`)
- Modify: `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` (selettore tipo + scope foto + anteprima)

---

## Task 1: Modello + schema (TDD sullo schema)

**Files:** Modify `utils/rapportini/buildVoci.ts`, `lib/rapportini/templateSchema.ts`; Create `lib/rapportini/templateSchema.test.ts`

- [ ] **Step 1: `TemplateCampo` += `scope_foto`.** In `utils/rapportini/buildVoci.ts`, nell'interfaccia `TemplateCampo`, dopo `obbligatoria?: boolean;` aggiungi:
```ts
  scope_foto?: 'misuratore' | 'fase' | 'accessoria'; // solo per tipo='foto' nei template risanamento
```

- [ ] **Step 2: Test che fallisce** — crea `lib/rapportini/templateSchema.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { CampoSchema, TemplateSchema } from './templateSchema';

describe('CampoSchema scope_foto', () => {
  it('accetta scope_foto valido', () => {
    expect(CampoSchema.safeParse({ chiave: 'f', etichetta: 'Foto', tipo: 'foto', ordine: 1, scope_foto: 'misuratore' }).success).toBe(true);
  });
  it('rifiuta scope_foto fuori enum', () => {
    expect(CampoSchema.safeParse({ chiave: 'f', etichetta: 'Foto', tipo: 'foto', ordine: 1, scope_foto: 'xxx' }).success).toBe(false);
  });
  it('scope_foto opzionale (assente ok)', () => {
    expect(CampoSchema.safeParse({ chiave: 'f', etichetta: 'Foto', tipo: 'foto', ordine: 1 }).success).toBe(true);
  });
});

describe('TemplateSchema tipo', () => {
  const base = { nome: 'T', campi: [{ chiave: 'c', etichetta: 'C', tipo: 'testo', ordine: 1 }] };
  it('default standard se assente', () => {
    const r = TemplateSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tipo).toBe('standard');
  });
  it('accetta tipo risanamento', () => {
    const r = TemplateSchema.safeParse({ ...base, tipo: 'risanamento' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tipo).toBe('risanamento');
  });
  it('rifiuta tipo fuori enum', () => {
    expect(TemplateSchema.safeParse({ ...base, tipo: 'altro' }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Esegui** `npx vitest run lib/rapportini/templateSchema.test.ts` → FAIL (scope_foto/tipo non ancora nello schema).

- [ ] **Step 4: Implementa lo schema.** In `lib/rapportini/templateSchema.ts`:
  - In `CampoSchema`, dopo `obbligatoria: z.boolean().optional(),` aggiungi:
    ```ts
      scope_foto: z.enum(['misuratore', 'fase', 'accessoria']).optional(),
    ```
  - In `TemplateSchema`, dopo `foto_id_priority: FotoIdPrioritySchema,` aggiungi:
    ```ts
      tipo: z.enum(['standard', 'risanamento']).optional().default('standard'),
    ```

- [ ] **Step 5: Esegui** `npx vitest run lib/rapportini/templateSchema.test.ts` → PASS.

- [ ] **Step 6: Lint** `npx eslint utils/rapportini/buildVoci.ts lib/rapportini/templateSchema.ts lib/rapportini/templateSchema.test.ts --max-warnings=0` → vuoto.

- [ ] **Step 7: Commit**
```bash
git add utils/rapportini/buildVoci.ts lib/rapportini/templateSchema.ts lib/rapportini/templateSchema.test.ts
git commit -m "feat(template): scope_foto sui campi + tipo template nello schema" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: API admin template — persiste `tipo`

**Files:** Modify `app/api/admin/rapportino-template/route.ts`

- [ ] **Step 1: GET** — aggiungi `tipo` alla `.select(...)` (vicino a `foto_id_priority`, già presente nella lista colonne della GET).

- [ ] **Step 2: POST** — nell'oggetto `.insert({...})` aggiungi `tipo: parsed.data.tipo`.

- [ ] **Step 3: PATCH** — nell'array delle chiavi copiate nel patch (`for (const k of [...] as const)`), aggiungi `'tipo'`.

- [ ] **Step 4: Type-check** `npx tsc --noEmit 2>&1 | grep -i "rapportino-template"` → vuoto.

- [ ] **Step 5: Lint** `npx eslint "app/api/admin/rapportino-template/route.ts" --max-warnings=0` → atteso solo l'errore PREESISTENTE `no-explicit-any` su `(parsed.data as any)[k]` (baseline). Verifica con `git show HEAD:app/api/admin/rapportino-template/route.ts | grep "as any"` che esistesse già; NON modificarlo.

- [ ] **Step 6: Commit**
```bash
git add "app/api/admin/rapportino-template/route.ts"
git commit -m "feat(template): API persiste il tipo template" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Editor UI — selettore tipo + scope foto + anteprima

**Files:** Modify `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`

Leggi il file per ancorare gli inserimenti. Segui i pattern già presenti (`committente`/`soloManuale` per lo stato; il blocco `{campo.tipo === 'foto' && (...)}` per il flag obbligatoria).

- [ ] **Step 1: tipo nel `Template` type + costante etichette scope.** Nel type `Template`, aggiungi `tipo?: 'standard' | 'risanamento';`. In cima al file (dopo gli import), aggiungi:
```ts
const SCOPE_FOTO: { v: 'misuratore' | 'fase' | 'accessoria'; label: string }[] = [
  { v: 'misuratore', label: 'Misuratore (prima/dopo)' },
  { v: 'fase', label: 'Fase lavorazione' },
  { v: 'accessoria', label: 'Accessoria opzionale' },
];
```

- [ ] **Step 2: stato `tipo` + wiring.** Aggiungi `const [tipo, setTipo] = useState<'standard' | 'risanamento'>('standard');` vicino agli altri `useState`. In `loadTemplate`: `setTipo(tpl.tipo ?? 'standard');`. In `startNew`: `setTipo('standard');`. In `handleSave` payload e nel payload dell'auto-save: aggiungi `tipo,`. Aggiungi `tipo` alle dipendenze dell'`useEffect` di auto-save (vicino a `soloManuale`).

- [ ] **Step 3: selettore "Tipo template".** Nella card "Committente" (quella col select committente e il flag soloManuale), aggiungi PRIMA del select committente:
```tsx
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Tipo template</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as 'standard' | 'risanamento')}
                className="mb-4 w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
              >
                <option value="standard">Standard</option>
                <option value="risanamento">Risanamento colonne</option>
              </select>
```

- [ ] **Step 4: selettore scope sui campi foto (solo se tipo='risanamento').** Trova il blocco che mostra il flag obbligatoria per i campi foto (`{campo.tipo === 'foto' && ( ...checkbox "Foto obbligatoria"... )}`). Sostituiscilo con un blocco che, quando `tipo==='risanamento'`, mostra il selettore scope e nasconde "obbligatoria" per le accessorie:
```tsx
                    {campo.tipo === 'foto' && (
                      <div className="mb-3 space-y-2">
                        {tipo === 'risanamento' && (
                          <div>
                            <label className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">Sezione foto</label>
                            <select
                              value={campo.scope_foto ?? 'misuratore'}
                              onChange={(e) => {
                                const scope = e.target.value as 'misuratore' | 'fase' | 'accessoria';
                                updateCampo(idx, scope === 'accessoria' ? { scope_foto: scope, obbligatoria: false } : { scope_foto: scope });
                              }}
                              className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
                            >
                              {SCOPE_FOTO.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                            </select>
                          </div>
                        )}
                        {!(tipo === 'risanamento' && (campo.scope_foto ?? 'misuratore') === 'accessoria') && (
                          <label className="flex items-center gap-2 text-sm text-[var(--brand-text-main)]">
                            <input
                              type="checkbox"
                              checked={campo.obbligatoria === true}
                              onChange={(e) => updateCampo(idx, { obbligatoria: e.target.checked })}
                              className="h-4 w-4 accent-[var(--brand-primary)]"
                            />
                            Foto obbligatoria
                          </label>
                        )}
                      </div>
                    )}
```
NOTE: usa la stessa `updateCampo(idx, patch)` già presente nel componente. Il blocco "obbligatoria" si nasconde solo quando scope=accessoria in modalità risanamento; in modalità standard resta identico a oggi.

- [ ] **Step 5: anteprima scope (solo risanamento).** Subito dopo il bottone "＋ Aggiungi campo" (dentro la card "Lista azioni da fare"), aggiungi:
```tsx
              {tipo === 'risanamento' && campi.some((c) => c.tipo === 'foto') && (
                <div className="mt-4 rounded-xl border border-dashed border-[var(--brand-primary)] bg-[var(--brand-surface-muted)] p-3 text-xs">
                  <p className="mb-2 font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">Anteprima sezioni foto</p>
                  {SCOPE_FOTO.map((s) => {
                    const slots = campi.filter((c) => c.tipo === 'foto' && (c.scope_foto ?? 'misuratore') === s.v);
                    if (slots.length === 0) return null;
                    return (
                      <div key={s.v} className="mb-1">
                        <span className="font-medium text-[var(--brand-text-main)]">{s.label}:</span>{' '}
                        <span className="text-[var(--brand-text-muted)]">
                          {slots.map((c) => `${c.etichetta || '(senza nome)'}${s.v !== 'accessoria' && c.obbligatoria ? ' *' : ''}`).join(', ')}
                        </span>
                      </div>
                    );
                  })}
                  <p className="mt-1 text-[var(--brand-text-subtle)]">* obbligatoria</p>
                </div>
              )}
```

- [ ] **Step 6: Type-check** `npx tsc --noEmit 2>&1 | grep -i "TemplateRapportiniClient"` → vuoto.

- [ ] **Step 7: Lint** `npx eslint "app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx" --max-warnings=0` → vuoto.

- [ ] **Step 8: Commit**
```bash
git add "app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx"
git commit -m "feat(template): selettore tipo risanamento + scope foto con anteprima" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Verifica finale

- [ ] **Step 1:** `npx vitest run lib/rapportini/templateSchema.test.ts` → PASS.
- [ ] **Step 2:** `npx tsc --noEmit 2>&1 | grep -Ei "template|buildVoci"` → nessun errore introdotto dai file di questo piano.
- [ ] **Step 3:** eslint sui file toccati → puliti (eccetto il `no-explicit-any` preesistente nella route, documentato).
- [ ] **Step 4:** `npm run build` → ok.
- [ ] **Step 5:** Riepilogo: Fase 2 pronta sul branch; nessuna migration; rendering operativo (Fase 4) e vincolo chiusura (Fase 5) restano per dopo.

---

## Self-review (copertura spec Fase 2)
- `scope_foto` su `TemplateCampo` + `CampoSchema` → Task 1 ✓
- `tipo` su `TemplateSchema` + API → Task 1 (schema) + Task 2 (API) ✓
- Selettore tipo template nell'editor → Task 3 Step 3 ✓
- Selettore scope sui campi foto (solo risanamento) → Task 3 Step 4 ✓
- Accessoria ⇒ obbligatoria=false + flag nascosto → Task 3 Step 4 (onChange forza false + condizione di render) ✓
- Anteprima per scope → Task 3 Step 5 ✓
- Template standard invariato → Task 3 (tutti i blocchi scope sono dietro `tipo==='risanamento'`) ✓
- Fuori scope (rendering operativo/scanner/vincolo chiusura) → nessun task li tocca ✓

## Note tipi
- `scope_foto` valori `'misuratore'|'fase'|'accessoria'` identici in `TemplateCampo`, `CampoSchema`, `SCOPE_FOTO` (editor).
- `tipo` valori `'standard'|'risanamento'` identici in `TemplateSchema`, `Template` (editor), colonna DB (Fase 1 CHECK).
