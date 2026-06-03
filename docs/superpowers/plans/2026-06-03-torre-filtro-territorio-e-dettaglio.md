# Torre: filtro operatori per territorio + dettaglio lavori — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Con un territorio selezionato mostrare solo gli operatori di quel territorio; rendere compatte le card a sinistra e spostare l'elenco dei lavori in un pannello colorato e live sotto la mappa.

**Architecture:** Una funzione pura testabile `operatoriVisibili(gruppi, selTerr)` filtra i gruppi; il resto sono modifiche di rendering in `TorreControlloClient.tsx` che riusano lo stato `items` (già live) e `itemsMappa` (già calcolato con `filtraInterventi`).

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest.

**Convenzione commit:** ogni commit termina con una riga vuota poi
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**Branch:** `fix/torre-interventi-dashboard-giorno` (già creato da main; la spec è già committata).

**Spec:** `docs/superpowers/specs/2026-06-03-torre-filtro-territorio-e-dettaglio-design.md`

---

## File Structure

| File | Tipo | Responsabilità |
|---|---|---|
| `lib/interventi/torreView.ts` | modifica | nuova `operatoriVisibili(gruppi, selTerr)` pura |
| `lib/interventi/torreView.test.ts` | modifica | test di `operatoriVisibili` |
| `components/modules/torre/TorreControlloClient.tsx` | modifica | card compatte, uso di `operatoriVisibili`, pannello dettaglio sotto la mappa, `TONO.bg` |

---

## Task 1: Funzione pura `operatoriVisibili`

**Files:**
- Modify: `lib/interventi/torreView.ts`
- Test: `lib/interventi/torreView.test.ts`

- [ ] **Step 1: Write the failing test**

In `lib/interventi/torreView.test.ts`, cambia la riga di import da:
```ts
import { coloreStato, raggruppaPerOperatore, filtraInterventi, SENTINELLA_NON_ASSEGNATI } from './torreView';
```
a:
```ts
import { coloreStato, raggruppaPerOperatore, filtraInterventi, operatoriVisibili, SENTINELLA_NON_ASSEGNATI } from './torreView';
```

Poi APPENDI in fondo al file:
```ts
describe('operatoriVisibili', () => {
  const conteggi = { totale: 0, assegnati: 0, fatti: 0, nonFatti: 0 };
  const mk = (id: string | null, n: number) => ({
    operatore: { id, display_name: id ?? 'Non assegnati' },
    conteggi: { ...conteggi, totale: n },
    interventi: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}` })),
  });
  const gruppi = [mk('s1', 2), mk('s2', 0), mk(null, 1)];

  it('senza territorio → tutti i gruppi', () => {
    expect(operatoriVisibili(gruppi, null)).toHaveLength(3);
  });

  it('con territorio → solo i gruppi con lavori', () => {
    const r = operatoriVisibili(gruppi, 't1');
    expect(r.map((g) => g.operatore.id)).toEqual(['s1', null]); // s2 (0 lavori) escluso, "Non assegnati" incluso
  });

  it('con territorio e nessun lavoro → vuoto', () => {
    expect(operatoriVisibili([mk('s2', 0)], 't1')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/interventi/torreView.test.ts`
Expected: FAIL — `operatoriVisibili` non esportata.

- [ ] **Step 3: Add the implementation**

APPENDI in fondo a `lib/interventi/torreView.ts`:
```ts
/**
 * Filtra i gruppi da mostrare in colonna: con un territorio selezionato mostra
 * solo gli operatori che hanno lavori (interventi.length > 0); senza territorio,
 * tutti. `gruppi` è già calcolato sugli interventi filtrati per territorio.
 */
export function operatoriVisibili<T>(
  gruppi: GruppoOperatore<T>[],
  selTerr: string | null,
): GruppoOperatore<T>[] {
  return selTerr ? gruppi.filter((g) => g.interventi.length > 0) : gruppi;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/interventi/torreView.test.ts`
Expected: PASS (test esistenti + 3 nuovi di `operatoriVisibili`).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/torreView.ts lib/interventi/torreView.test.ts
git commit -m "feat(torre): operatoriVisibili — nasconde operatori senza lavori col filtro territorio"
```

---

## Task 2: Card compatte + pannello dettaglio sotto la mappa

**Files:**
- Modify: `components/modules/torre/TorreControlloClient.tsx`

Fai gli edit nell'ordine indicato. Preserva tutto il resto (subscription, header, totali, mappa).

- [ ] **Step 1: Aggiungi `bg` alla mappa TONO**

Sostituisci il blocco:
```ts
const TONO: Record<TonoTorre, { fg: string; dot: string; label: string }> = {
  ok: { fg: 'var(--success)', dot: '#22c55e', label: 'Fatto' },
  ko: { fg: 'var(--danger)', dot: '#ef4444', label: 'Non fatto' },
  attesa: { fg: 'var(--brand-text-main)', dot: '#fbbf24', label: 'Da fare' },
  corso: { fg: 'var(--brand-text-main)', dot: '#38bdf8', label: 'In corso' },
  annullato: { fg: 'var(--brand-text-muted)', dot: '#9ca3af', label: 'Annullato' },
  da_assegnare: { fg: 'var(--brand-text-muted)', dot: '#9ca3af', label: 'Da assegnare' },
};
```
con:
```ts
const TONO: Record<TonoTorre, { fg: string; dot: string; label: string; bg: string }> = {
  ok: { fg: 'var(--success)', dot: '#22c55e', label: 'Fatto', bg: 'var(--success-soft)' },
  ko: { fg: 'var(--danger)', dot: '#ef4444', label: 'Non fatto', bg: 'var(--danger-soft)' },
  attesa: { fg: 'var(--brand-text-main)', dot: '#fbbf24', label: 'Da fare', bg: 'var(--warning-soft)' },
  corso: { fg: 'var(--brand-text-main)', dot: '#38bdf8', label: 'In corso', bg: 'rgba(56,189,248,0.12)' },
  annullato: { fg: 'var(--brand-text-muted)', dot: '#9ca3af', label: 'Annullato', bg: 'var(--brand-surface-muted)' },
  da_assegnare: { fg: 'var(--brand-text-muted)', dot: '#9ca3af', label: 'Da assegnare', bg: 'var(--brand-surface-muted)' },
};
```

- [ ] **Step 2: Importa `operatoriVisibili`**

Sostituisci la riga:
```ts
import { coloreStato, raggruppaPerOperatore, filtraInterventi, SENTINELLA_NON_ASSEGNATI, type TonoTorre } from '@/lib/interventi/torreView';
```
con:
```ts
import { coloreStato, raggruppaPerOperatore, filtraInterventi, operatoriVisibili, SENTINELLA_NON_ASSEGNATI, type TonoTorre } from '@/lib/interventi/torreView';
```

- [ ] **Step 3: Calcola `gruppiVisibili`**

Sostituisci:
```ts
  const itemsTerr = filtraInterventi(items, selTerr, null);
  const gruppi = raggruppaPerOperatore(itemsTerr, operatori);
```
con:
```ts
  const itemsTerr = filtraInterventi(items, selTerr, null);
  const gruppi = raggruppaPerOperatore(itemsTerr, operatori);
  const gruppiVisibili = operatoriVisibili(gruppi, selTerr);
```

- [ ] **Step 4: Card compatte (rendi compatte e usa `gruppiVisibili`)**

Sostituisci l'INTERO blocco da `{gruppi.map((g) => {` fino al suo `})}` di chiusura, cioè queste righe:
```tsx
          {gruppi.map((g) => {
            const opKey = g.operatore.id ?? SENTINELLA_NON_ASSEGNATI;
            const sel = selStaff === opKey;
            return (
              <button
                key={opKey}
                type="button"
                onClick={() => setSelStaff((p) => (p === opKey ? null : opKey))}
                className="w-full rounded-2xl border p-3 text-left transition hover:border-[var(--brand-primary)]"
                style={{
                  borderColor: sel ? 'var(--brand-primary)' : 'var(--brand-border)',
                  backgroundColor: sel ? 'var(--brand-primary-soft)' : 'var(--brand-surface)',
                  boxShadow: sel ? '0 0 0 1px var(--brand-primary)' : undefined,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="truncate font-semibold" style={{ color: 'var(--brand-text-main)' }}>
                    {g.operatore.display_name}
                  </h2>
                  <div className="shrink-0 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                    {g.conteggi.assegnati}⏳ · {g.conteggi.fatti}✅ · {g.conteggi.nonFatti}❌
                  </div>
                </div>

                {g.interventi.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {g.interventi.map((it) => {
                      const tono = TONO[coloreStato(it.stato, it.esito)];
                      return (
                        <li key={it.id} className="flex items-center gap-2 text-sm">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tono.dot }} />
                          <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--brand-text-main)' }}>
                            {it.nominativo ?? it.odl ?? 'Intervento'}
                            {it.comune ? ` · ${it.comune}` : ''}
                          </span>
                          <span className="shrink-0 text-xs" style={{ color: tono.fg }}>
                            {it.stato === 'completato' ? tono.label : labelStato(it.stato)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </button>
            );
          })}
```
con (card compatta: solo nome + conteggi; usa `gruppiVisibili`):
```tsx
          {gruppiVisibili.map((g) => {
            const opKey = g.operatore.id ?? SENTINELLA_NON_ASSEGNATI;
            const sel = selStaff === opKey;
            return (
              <button
                key={opKey}
                type="button"
                onClick={() => setSelStaff((p) => (p === opKey ? null : opKey))}
                className="w-full rounded-2xl border p-3 text-left transition hover:border-[var(--brand-primary)]"
                style={{
                  borderColor: sel ? 'var(--brand-primary)' : 'var(--brand-border)',
                  backgroundColor: sel ? 'var(--brand-primary-soft)' : 'var(--brand-surface)',
                  boxShadow: sel ? '0 0 0 1px var(--brand-primary)' : undefined,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="truncate font-semibold" style={{ color: 'var(--brand-text-main)' }}>
                    {g.operatore.display_name}
                  </h2>
                  <div className="shrink-0 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                    {g.conteggi.assegnati}⏳ · {g.conteggi.fatti}✅ · {g.conteggi.nonFatti}❌
                  </div>
                </div>
              </button>
            );
          })}
```

- [ ] **Step 5: Pannello dettaglio sotto la mappa**

Sostituisci:
```tsx
          <TorreMappa interventi={itemsMappa} />
        </div>
```
con:
```tsx
          <TorreMappa interventi={itemsMappa} />

          {/* Dettaglio lavori (operatore selezionato o tutti): righe colorate, live. */}
          <section className="rounded-2xl border" style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' }}>
            <header
              className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm font-semibold"
              style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
            >
              <span className="truncate">{nomeSel ? `Dettaglio lavori — ${nomeSel}` : 'Tutti i lavori'}</span>
              <span className="shrink-0 text-xs font-medium" style={{ color: 'var(--brand-text-muted)' }}>{itemsMappa.length}</span>
            </header>
            <ul className="max-h-[360px] divide-y divide-[var(--brand-border)] overflow-y-auto">
              {itemsMappa.length === 0 ? (
                <li className="px-3 py-4 text-center text-sm" style={{ color: 'var(--brand-text-muted)' }}>Nessun lavoro.</li>
              ) : (
                itemsMappa.map((it) => {
                  const tono = TONO[coloreStato(it.stato, it.esito)];
                  const ko = it.stato === 'completato' && it.esito !== 'eseguito_positivo';
                  return (
                    <li key={it.id} className="flex items-center gap-2 px-3 py-2 text-sm" style={{ backgroundColor: tono.bg }}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tono.dot }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate" style={{ color: 'var(--brand-text-main)' }}>
                          {it.nominativo ?? it.odl ?? 'Intervento'}
                          {it.comune ? ` · ${it.comune}` : ''}
                        </div>
                        {ko && it.esito_motivo && (
                          <div className="truncate text-xs" style={{ color: tono.fg }}>{it.esito_motivo}</div>
                        )}
                      </div>
                      <span className="shrink-0 text-xs font-medium" style={{ color: tono.fg }}>
                        {it.stato === 'completato' ? tono.label : labelStato(it.stato)}
                      </span>
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        </div>
```

- [ ] **Step 6: Verify lint + tests**

Run: `npm run lint`
Expected: nessun errore in `TorreControlloClient.tsx`.

Run: `npx vitest run lib/interventi/torreView.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/modules/torre/TorreControlloClient.tsx
git commit -m "feat(torre): card operatori compatte filtrate per territorio + dettaglio lavori colorato sotto la mappa"
```

---

## Task 3: Verifica finale

- [ ] **Step 1: Suite completa**

Run: `npm run test`
Expected: tutti i test verdi (incluso `operatoriVisibili`).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: nessun nuovo errore.

- [ ] **Step 3: Verifica manuale (`npm run dev`, `/hub/torre`)**

- Senza territorio: colonna mostra tutti gli operatori (compatti, nome + conteggi). Sotto la mappa: "Tutti i lavori" con tutte le righe colorate.
- Seleziona un territorio: la colonna mostra solo gli operatori con lavori in quel territorio.
- Seleziona un operatore: la mappa filtra; sotto la mappa "Dettaglio lavori — {nome}" con le sole righe di quell'operatore, sfondo verde per i Fatti, rosso per i Non fatti, ambra per i Da fare.
- Cambia data: board, mappa e dettaglio si aggiornano solo su quella data.

---

## Note di esecuzione

- `operatoriVisibili` riceve `selTerr` solo come flag "territorio attivo": il filtro per territorio è già applicato a monte in `gruppi` (via `filtraInterventi(items, selTerr, null)`).
- Il pannello dettaglio usa `itemsMappa`, identico a ciò che vede la mappa: operatore selezionato → suoi lavori; nessuna selezione → tutti i lavori della vista. È live perché deriva da `items`.
- Nessuna migration, nessuna modifica alle query server.
