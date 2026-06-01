# Fix rapportino digitale + opzioni template — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrare i dati intervento completi e non troncati nel rapportino digitale, far comparire tipo/attività e ODS (formato Export Dati), e correggere l'inserimento delle opzioni del template (una per riga).

**Architecture:** Tre fix indipendenti: un cambio di classe CSS (un-truncate), due ritocchi al parser Excel (mappa attività + fallback ODSIN), e la sostituzione dell'input opzioni con una textarea robusta. Nessuna tabella/SQL.

**Tech Stack:** Next.js 15, React 19, TypeScript, xlsx, Tailwind 4 (tema Aurea), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-01-rapportino-dettagli-opzioni-fix-design.md`

---

## File Structure

| File | Responsabilità | Azione |
|---|---|---|
| `components/modules/rapportini/RapportinoForm.tsx` | Valori anagrafica non troncati | Modify |
| `utils/routing/excelParser.ts` | Mappa attività + fallback ODSIN (Export Dati) | Modify |
| `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` | Opzioni "una per riga" + trim/filter al salvataggio | Modify |

I 3 task sono indipendenti.

---

## Task 1: Dettagli intervento non troncati

**Files:** Modify `components/modules/rapportini/RapportinoForm.tsx`

- [ ] **Step 1: Togliere il troncamento dai valori dell'anagrafica.** In `VoceCard`, trovare il `<dd>` dei valori (≈riga 370):
```tsx
                <dd className="truncate text-sm text-[var(--brand-text-main)]" title={r.value}>
                  {r.value}
                </dd>
```
e sostituirlo con (niente `truncate`, va a capo):
```tsx
                <dd className="text-sm text-[var(--brand-text-main)] break-words">
                  {r.value}
                </dd>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**
```bash
git add components/modules/rapportini/RapportinoForm.tsx
git commit -m "fix(rapportini): dati intervento non troncati nel rapportino digitale" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> Nota: i campi vuoti restano nascosti (il `.filter((r) => r.value != null && String(r.value).trim() !== '')` sull'array `anagrafica` è già presente — non va toccato).

---

## Task 2: Parser cattura "Tipo/attività" e ODS (Export Dati)

**Files:** Modify `utils/routing/excelParser.ts`

- [ ] **Step 1: Mappare la colonna attività nel ramo "Export Dati".** In `detectFormat`, ramo "Export Dati / Geocall", sostituire la riga:
```ts
    attivita: null,
```
con:
```ts
    attivita: findCol(headers, [/^attivit/, /^tipo.*(odl|servizio|intervento)/, /^servizio$/, /^tipo$/]),
```
(così l'header normalizzato `tipo odl(cdl)/servizio` viene riconosciuto come colonna attività.)

- [ ] **Step 2: Fallback ODSIN al valore grezzo.** In `parseExcelToTasks`, trovare il calcolo di `odsin` (≈righe 245-248):
```ts
    const odsin =
      (colMap.odsin != null ? extractOdsin(row[colMap.odsin]) : undefined) ??
      extractOdsin(odl) ??
      (colMap.pdR != null ? extractOdsin(row[colMap.pdR]) : undefined);
```
e aggiungere un ultimo fallback al valore grezzo della colonna ODSIN:
```ts
    const odsin =
      (colMap.odsin != null ? extractOdsin(row[colMap.odsin]) : undefined) ??
      extractOdsin(odl) ??
      (colMap.pdR != null ? extractOdsin(row[colMap.pdR]) : undefined) ??
      (colMap.odsin != null ? (str(row[colMap.odsin]) || undefined) : undefined);
```
(`str` è già definita nel file.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**
```bash
git add utils/routing/excelParser.ts
git commit -m "fix(mappa): mappa colonna Tipo/Servizio ad attività + fallback ODSIN (Export Dati)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> Nota: cambia solo il ramo "Export Dati"; ATTGIORN/Massiva (indici fissi) sono invariati. L'effetto si vede sui rapportini **rigenerati** dopo il deploy (lo snapshot voci si congela alla generazione). Nessun test unitario (il parser legge un `File`; verifica manuale in Task 4).

---

## Task 3: Opzioni template "una per riga"

**Files:** Modify `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`

- [ ] **Step 1: Sostituire l'input opzioni con una textarea.** Trovare il blocco (dentro `{campo.tipo === 'select' && ( ... )}`, ≈righe 304-319):
```tsx
                    {campo.tipo === 'select' && (
                      <div className="mb-3">
                        <label className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">
                          Opzioni (separate da virgola)
                        </label>
                        <input
                          type="text"
                          value={(campo.opzioni ?? []).join(', ')}
                          onChange={(e) =>
                            updateCampo(idx, {
                              opzioni: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                            })
                          }
                          className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none"
                          placeholder="es. Sì, No, N/A"
                        />
                      </div>
                    )}
```
e sostituirlo con:
```tsx
                    {campo.tipo === 'select' && (
                      <div className="mb-3">
                        <label className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">
                          Opzioni (una per riga)
                        </label>
                        <textarea
                          rows={3}
                          value={(campo.opzioni ?? []).join('\n')}
                          onChange={(e) =>
                            updateCampo(idx, { opzioni: e.target.value.split('\n') })
                          }
                          className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none"
                          placeholder={'SI\nNO'}
                        />
                      </div>
                    )}
```
(Nessun `trim`/`filter` durante la digitazione → l'Invio aggiunge una riga e nulla viene mangiato.)

- [ ] **Step 2: Trim + filtro vuoti SOLO al salvataggio.** In `handleSave`, nel `payload`, sostituire (≈riga 121):
```ts
          opzioni: c.tipo === 'select' ? (c.opzioni ?? []) : undefined,
```
con:
```ts
          opzioni: c.tipo === 'select' ? (c.opzioni ?? []).map((s) => s.trim()).filter(Boolean) : undefined,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**
```bash
git add app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx
git commit -m "fix(rapportini): opzioni template una per riga (textarea), trim/filter al salvataggio" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Verifica end-to-end

**Files:** nessuno (verifica). Richiede app + Supabase (`npm run dev`).

- [ ] **Step 1: Suite + tipi**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 44 test PASS (nessun nuovo test), nessun errore di tipo.

- [ ] **Step 2: Opzioni template**
  - Impostazioni → Template rapportini → nuovo/seleziona → campo tipo "Selezione" → nella textarea scrivi `SI`, Invio, `NO` → due righe. Salva → riapri il template → restano due opzioni "SI" e "NO" (righe vuote scartate).

- [ ] **Step 3: Attività + ODS + indirizzo intero**
  - Importa il template "Export Dati" con "Tipo OdL(CdL)/Servizio" e "ODSIN" valorizzati → distribuisci → Salva → **Genera/Rigenera rapportini** → apri un `/r/<token>`:
    - l'indirizzo è mostrato **per intero** (non "VIA … G…");
    - compaiono **Attività** (es. LIMITAZIONE MASSIVA) e **ODSIN**;
    - i campi vuoti non sono mostrati.

- [ ] **Step 4: Campo select compilabile**
  - Sullo stesso `/r/<token>`, il campo "Selezione" mostra le opzioni separate ("SI" e "NO") e si può scegliere.

---

## Note per chi esegue

- **Nessuna SQL / migrazione.**
- Task 2: l'attività appare nei rapportini **rigenerati** dopo il deploy (lo snapshot si fissa alla generazione). Per un piano esistente: Riapri → ri-importa/Salva → Rigenera.
- Le righe vuote nella textarea opzioni sono normali durante la digitazione; vengono ripulite al salvataggio (Task 3 Step 2). Coerenza: il `value` della textarea fa `join('\n')`, l'`onChange` fa `split('\n')` senza filtrare → round-trip stabile.
