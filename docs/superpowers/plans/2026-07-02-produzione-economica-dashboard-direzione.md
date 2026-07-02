# Produzione economica ACEA — Dashboard direzione + modalità presentazione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare la tab KPI "Produzione economica" in una dashboard con grafici professionali (trend Produzione vs SAL, composizione per voce, personale impegnato) più una vista presentazione a schermo intero per la dirigenza, e arricchire l'export Excel con i dati personale/SAL-per-giorno.

**Architecture:** La logica nuova vive in moduli PURI in `lib/produzione/` (aggregaPersonale, serieTrend, composizioneVoce), testati con vitest. `load.ts` li orchestra (una query in più: interventi lavorati di TUTTE le commesse per il denominatore delle giornate-uomo) ed espone `sal.perGiorno` + `personale` nel payload esistente `/api/admin/acea/produzione` (nessun endpoint nuovo). I grafici sono componenti client Recharts in `components/modules/performance/economica/`, condivisi tra la tab in-app e la nuova route `/presentazione/produzione-acea` (fuori da `/hub` → niente AppShell, tema chiaro forzato).

**Tech Stack:** Next.js 15 (App Router), React client components, Recharts ^3.8.1 (già presente), ExcelJS + JSZip (già presenti), vitest. Nessuna dipendenza nuova.

## Global Constraints

- **Lingua UI e commenti: italiano** (come tutto il repo).
- **Baseline lint/test ROSSA su main** (~89 errori eslint, ~5 test falliti in utils/rapportini): il gate è "nessun NUOVO problema" — verifiche mirate (`npx tsc --noEmit`, `npx eslint <file toccati>`, `npx vitest run lib/produzione`), MAI pretendere il verde globale.
- **NON toccare `tools/limitazioni-sync/`** (file blindati dall'hook guard-acea).
- **Token CSS**: usare solo token esistenti (`--brand-*`, `--success`, `--warning`, `--chart-1..8`). Nessun token nuovo. Per i prop SVG Recharts usare SEMPRE `useChartColors()` (le CSS var non si risolvono negli attributi SVG).
- **Next 15**: nei server component `searchParams` è una `Promise` (fare `await`).
- Import con alias `@/` (es. `@/lib/produzione/load`).
- **Regola business** (non negoziabile, dal design approvato): giornata-uomo ACEA = frazione `interventi ACEA lavorati / totale interventi lavorati nel giorno` per operatore. "Lavorato" = `stato='completato'` (esito positivo O negativo). Soglia "dedicato" = frazione ≥ 0,8.
- Commit frequenti, messaggio convenzionale in italiano (es. `feat(produzione-economica): …`), con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

| File | Ruolo | Azione |
|---|---|---|
| `lib/produzione/aggregaPersonale.ts` (+`.test.ts`) | PURO: giornate-uomo frazionarie per operatore/giorno | Create |
| `lib/produzione/serieTrend.ts` (+`.test.ts`) | PURO: serie cumulate Produzione/SAL + raggruppo settimanale | Create |
| `lib/produzione/composizioneVoce.ts` (+`.test.ts`) | PURO: slice donut per voce (estrae le saracinesche da NON_RISOLTA) | Create |
| `lib/produzione/load.ts` | Loader: espone `sal.perGiorno` + `personale`; nuova query lavoro giornaliero | Modify |
| `lib/produzione/exportExcel.ts` (+`.test.ts`) | Fallback tabellare: fogli "Dati - personale" e "Dati - SAL giorni" | Modify |
| `lib/produzione/excelInject.ts` (+`.test.ts`) | `aggiungiFogli()` (aggiunge fogli al buffer template preservando i grafici) + `fogliPersonale()` | Modify |
| `app/api/admin/acea/produzione/export/route.ts` | Aggancia `aggiungiFogli` alla via template | Modify |
| `components/modules/performance/palette.ts` | `useChartColors` espone anche `warning`/`success`/`brandPrimary` risolti | Modify (additivo) |
| `components/modules/performance/economica/tipi.ts` | Tipo condiviso `DatiProduzione` + helper `eur`/`num` | Create |
| `components/modules/performance/economica/KpiDirezione.tsx` | 6 card dirigenziali (+2 operative opzionali) | Create |
| `components/modules/performance/economica/TrendProduzioneSal.tsx` | Aree cumulate SAL+scarto, linea produzione, barre ritmo | Create |
| `components/modules/performance/economica/ComposizioneProduzione.tsx` | Donut per voce + barre orizzontali top attività | Create |
| `components/modules/performance/economica/PersonaleImpegno.tsx` | Barre € per operatore (giornate/resa) + impegno nel tempo | Create |
| `components/modules/performance/economica/PresentazioneProduzione.tsx` | Client della vista presentazione (light forzato, stampa) | Create |
| `components/modules/performance/PerformanceEconomica.tsx` | Integra i blocchi, bottone Presentazione, rimuove il vecchio BarChart per voce | Modify |
| `app/presentazione/produzione-acea/page.tsx` | Route presentazione (fuori da /hub, gate `assertKpiAccess`) | Create |

Interfacce dati chiave già esistenti (da `lib/produzione/aggregaProduzione.ts`):
`Aggregato = { chiave: string; label: string; conteggio: number; valore: number }`;
`ProduzioneAggregata = { totale: {conteggio,valore}; perVoce; perAttivita; perOperatore; perTerritorio; perGiorno: Aggregato[]; nonRisolte: number }`.

---

### Task 1: `aggregaPersonale` — giornate-uomo frazionarie (PURO)

**Files:**
- Create: `lib/produzione/aggregaPersonale.ts`
- Test: `lib/produzione/aggregaPersonale.test.ts`

**Interfaces:**
- Consumes: `Aggregato` da `./aggregaProduzione`.
- Produces (usati da Task 4, 5, 6, 8, 11):
  - `interface RigaLavoro { staffId: string; operatore: string; data: string; acea: boolean }`
  - `interface PersonaleOperatore { chiave: string; label: string; giornate: number; interventiAcea: number; valore: number; resa: number | null }`
  - `interface PersonaleGiorno { data: string; dedicate: number; saturazione: number; operatori: number }`
  - `interface ProduzionePersonale { totaleGiornate: number; operatoriAttivi: number; perOperatore: PersonaleOperatore[]; perGiorno: PersonaleGiorno[] }`
  - `const SOGLIA_DEDICATO = 0.8`
  - `function aggregaPersonale(righe: RigaLavoro[], euroPerOperatore: Aggregato[]): ProduzionePersonale`

- [ ] **Step 1: Scrivere il test che fallisce**

Crea `lib/produzione/aggregaPersonale.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { aggregaPersonale, SOGLIA_DEDICATO, type RigaLavoro } from './aggregaPersonale';

const r = (p: Partial<RigaLavoro>): RigaLavoro => ({
  staffId: 's1', operatore: 'ROSSI', data: '2026-06-01', acea: true, ...p,
});

describe('aggregaPersonale', () => {
  it('insieme vuoto → zero giornate, nessun operatore', () => {
    const p = aggregaPersonale([], []);
    expect(p.totaleGiornate).toBe(0);
    expect(p.operatoriAttivi).toBe(0);
    expect(p.perOperatore).toEqual([]);
    expect(p.perGiorno).toEqual([]);
  });

  it('giornata piena ACEA → frazione 1', () => {
    const p = aggregaPersonale([r({}), r({})], [{ chiave: 's1', label: 'ROSSI', conteggio: 2, valore: 100 }]);
    expect(p.totaleGiornate).toBe(1);
    expect(p.perOperatore[0]).toMatchObject({ chiave: 's1', giornate: 1, interventiAcea: 2, valore: 100, resa: 100 });
  });

  it('giornata mista → frazione proporzionale sui LAVORATI (2 ACEA su 10 → 0,2)', () => {
    const righe = [
      ...Array.from({ length: 2 }, () => r({ acea: true })),
      ...Array.from({ length: 8 }, () => r({ acea: false })),
    ];
    const p = aggregaPersonale(righe, []);
    expect(p.perOperatore[0].giornate).toBe(0.2);
    expect(p.perOperatore[0].interventiAcea).toBe(2);
  });

  it('giorno senza interventi ACEA → non conta (né giornate né perGiorno)', () => {
    const p = aggregaPersonale([r({ acea: false })], []);
    expect(p.totaleGiornate).toBe(0);
    expect(p.perGiorno).toEqual([]);
  });

  it('perGiorno separa dedicati (frazione ≥ 0,8) da saturazione', () => {
    const righe = [
      // s1 il 01/06: 1 su 1 ACEA → frazione 1 (dedicato)
      r({ staffId: 's1', data: '2026-06-01', acea: true }),
      // s2 il 01/06: 1 ACEA su 4 → frazione 0,25 (saturazione)
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01', acea: true }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01', acea: false }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01', acea: false }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01', acea: false }),
    ];
    const p = aggregaPersonale(righe, []);
    expect(p.perGiorno).toEqual([{ data: '2026-06-01', dedicate: 1, saturazione: 0.25, operatori: 2 }]);
    expect(SOGLIA_DEDICATO).toBe(0.8);
  });

  it('resa = valore/giornate; null se giornate 0; ordinamento per valore desc', () => {
    const righe = [
      r({ staffId: 's1', data: '2026-06-01' }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01' }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-02' }),
    ];
    const p = aggregaPersonale(righe, [
      { chiave: 's1', label: 'ROSSI', conteggio: 1, valore: 50 },
      { chiave: 's2', label: 'VERDI', conteggio: 2, valore: 300 },
    ]);
    expect(p.perOperatore.map((o) => o.chiave)).toEqual(['s2', 's1']);
    expect(p.perOperatore[0].resa).toBe(150); // 300 € / 2 giornate
    expect(p.perOperatore[1].resa).toBe(50);
  });

  it('righe senza staffId o senza data vengono scartate', () => {
    const p = aggregaPersonale([r({ staffId: '' }), r({ data: '' })], []);
    expect(p.totaleGiornate).toBe(0);
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run lib/produzione/aggregaPersonale.test.ts`
Atteso: FAIL (modulo `./aggregaPersonale` inesistente).

- [ ] **Step 3: Implementazione**

Crea `lib/produzione/aggregaPersonale.ts`:

```typescript
// PURA: giornate-uomo ACEA per operatore e per giorno. Regola business (design 2026-07-02):
// una giornata vale la FRAZIONE di interventi ACEA lavorati sul totale lavorato nel giorno
// (gli operatori "doppio territorio" fanno ACEA a saturazione: la giornata intera gonfierebbe
// l'impegno). "Lavorato" = intervento con esito (positivo o negativo), non gli assegnati.

import type { Aggregato } from './aggregaProduzione';

export interface RigaLavoro {
  staffId: string;
  operatore: string;
  data: string; // 'YYYY-MM-DD'
  acea: boolean; // lavorato sulla commessa ACEA (committente effettivo, alias inclusi)
}

export interface PersonaleOperatore {
  chiave: string; // staffId
  label: string; // display name
  giornate: number; // somma frazioni (2 decimali)
  interventiAcea: number;
  valore: number; // € produzione (da euroPerOperatore)
  resa: number | null; // €/giornata (null se giornate=0)
}

export interface PersonaleGiorno {
  data: string;
  dedicate: number; // somma frazioni degli operatori con frazione ≥ SOGLIA_DEDICATO
  saturazione: number; // somma frazioni degli operatori con frazione < SOGLIA_DEDICATO
  operatori: number; // operatori con almeno 1 intervento ACEA nel giorno
}

export interface ProduzionePersonale {
  totaleGiornate: number;
  operatoriAttivi: number;
  perOperatore: PersonaleOperatore[];
  perGiorno: PersonaleGiorno[];
}

export const SOGLIA_DEDICATO = 0.8;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function aggregaPersonale(righe: RigaLavoro[], euroPerOperatore: Aggregato[]): ProduzionePersonale {
  // (staffId, giorno) → conteggi lavorati
  type Cella = { staffId: string; operatore: string; data: string; acea: number; totale: number };
  const celle = new Map<string, Cella>();
  for (const r of righe) {
    if (!r.staffId || !r.data) continue;
    const k = `${r.staffId}|${r.data}`;
    let c = celle.get(k);
    if (!c) {
      c = { staffId: r.staffId, operatore: r.operatore, data: r.data, acea: 0, totale: 0 };
      celle.set(k, c);
    }
    c.totale += 1;
    if (r.acea) c.acea += 1;
  }

  const perOp = new Map<string, PersonaleOperatore>();
  const perG = new Map<string, PersonaleGiorno>();
  for (const c of celle.values()) {
    if (c.acea === 0) continue; // quel giorno l'operatore non ha toccato ACEA
    const frazione = c.acea / c.totale;
    let op = perOp.get(c.staffId);
    if (!op) {
      op = { chiave: c.staffId, label: c.operatore, giornate: 0, interventiAcea: 0, valore: 0, resa: null };
      perOp.set(c.staffId, op);
    }
    op.giornate += frazione;
    op.interventiAcea += c.acea;
    let g = perG.get(c.data);
    if (!g) {
      g = { data: c.data, dedicate: 0, saturazione: 0, operatori: 0 };
      perG.set(c.data, g);
    }
    if (frazione >= SOGLIA_DEDICATO) g.dedicate += frazione;
    else g.saturazione += frazione;
    g.operatori += 1;
  }

  const euro = new Map(euroPerOperatore.map((e) => [e.chiave, e.valore]));
  for (const op of perOp.values()) {
    op.giornate = round2(op.giornate);
    op.valore = euro.get(op.chiave) ?? 0;
    op.resa = op.giornate > 0 ? round2(op.valore / op.giornate) : null;
  }
  const perOperatore = [...perOp.values()].sort((a, b) => b.valore - a.valore || b.giornate - a.giornate);
  const perGiorno = [...perG.values()]
    .map((g) => ({ ...g, dedicate: round2(g.dedicate), saturazione: round2(g.saturazione) }))
    .sort((a, b) => (a.data < b.data ? -1 : 1));
  const totaleGiornate = round2(perOperatore.reduce((s, o) => s + o.giornate, 0));
  return { totaleGiornate, operatoriAttivi: perOperatore.length, perOperatore, perGiorno };
}
```

- [ ] **Step 4: Verificare il verde**

Run: `npx vitest run lib/produzione/aggregaPersonale.test.ts`
Atteso: PASS (7 test).

- [ ] **Step 5: Commit**

```bash
git add lib/produzione/aggregaPersonale.ts lib/produzione/aggregaPersonale.test.ts
git commit -m "feat(produzione-economica): giornate-uomo frazionarie per operatore/giorno (aggregaPersonale)"
```

---

### Task 2: `serieTrend` — cumulate Produzione/SAL + raggruppo settimanale (PURO)

**Files:**
- Create: `lib/produzione/serieTrend.ts`
- Test: `lib/produzione/serieTrend.test.ts`

**Interfaces:**
- Consumes: `Aggregato` da `./aggregaProduzione`.
- Produces (usati da Task 9, 11):
  - `interface PuntoTrend { data: string; salCum: number; scartoCum: number; prodCum: number; prodGiorno: number }`
  - `function serieTrend(prodPerGiorno: Aggregato[], salPerGiorno: Aggregato[], from: string, to: string): PuntoTrend[]`
  - `function raggruppaPerSettimana(agg: Aggregato[]): Aggregato[]` (chiave = lunedì ISO della settimana)

Nota semantica: il SAL del loader NON è filtrato per range (è il consuntivato dell'intera commessa); le righe SAL con `data < from` diventano OFFSET iniziale della cumulata, così l'ultimo punto coincide con la card "SAL". `scartoCum = max(0, prodCum − salCum)` (clamp: nei periodi stretti il SAL può superare la produzione del periodo).

- [ ] **Step 1: Scrivere il test che fallisce**

Crea `lib/produzione/serieTrend.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { serieTrend, raggruppaPerSettimana } from './serieTrend';
import type { Aggregato } from './aggregaProduzione';

const g = (chiave: string, valore: number): Aggregato => ({ chiave, label: chiave, conteggio: 1, valore });

describe('serieTrend', () => {
  it('cumula produzione e SAL per giorno, con scarto clampato a ≥ 0', () => {
    const s = serieTrend(
      [g('2026-06-01', 100), g('2026-06-03', 50)],
      [g('2026-06-01', 30), g('2026-06-02', 40)],
      '2026-06-01',
      '2026-06-30',
    );
    expect(s.map((p) => p.data)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(s[0]).toMatchObject({ prodCum: 100, salCum: 30, scartoCum: 70, prodGiorno: 100 });
    expect(s[1]).toMatchObject({ prodCum: 100, salCum: 70, scartoCum: 30, prodGiorno: 0 });
    expect(s[2]).toMatchObject({ prodCum: 150, salCum: 70, scartoCum: 80, prodGiorno: 50 });
  });

  it('le righe SAL prima di from entrano come offset iniziale', () => {
    const s = serieTrend([g('2026-06-10', 100)], [g('2026-05-01', 25), g('2026-06-10', 5)], '2026-06-01', '2026-06-30');
    expect(s).toHaveLength(1);
    expect(s[0].salCum).toBe(30); // 25 (offset pre-from) + 5
  });

  it('scarto mai negativo (SAL > produzione del periodo)', () => {
    const s = serieTrend([g('2026-06-10', 10)], [g('2026-05-01', 100)], '2026-06-01', '2026-06-30');
    expect(s[0].scartoCum).toBe(0);
  });

  it('date oltre to sono escluse', () => {
    const s = serieTrend([g('2026-06-10', 10), g('2026-07-05', 99)], [], '2026-06-01', '2026-06-30');
    expect(s.map((p) => p.data)).toEqual(['2026-06-10']);
  });
});

describe('raggruppaPerSettimana', () => {
  it('raggruppa per lunedì ISO sommando valore e conteggio', () => {
    // 2026-06-01 è lunedì; 2026-06-03 mercoledì stessa settimana; 2026-06-08 lunedì successivo
    const out = raggruppaPerSettimana([g('2026-06-01', 10), g('2026-06-03', 5), g('2026-06-08', 7)]);
    expect(out).toEqual([
      { chiave: '2026-06-01', label: '2026-06-01', conteggio: 2, valore: 15 },
      { chiave: '2026-06-08', label: '2026-06-08', conteggio: 1, valore: 7 },
    ]);
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run lib/produzione/serieTrend.test.ts`
Atteso: FAIL (modulo inesistente).

- [ ] **Step 3: Implementazione**

Crea `lib/produzione/serieTrend.ts`:

```typescript
// PURA: serie temporali per il grafico di trend della Produzione economica.
// Il SAL del loader NON è filtrato per range (consuntivato dell'intera commessa): le righe con
// data < from diventano OFFSET iniziale della cumulata, così l'ultimo punto del grafico coincide
// con la card "SAL". Lo scarto è clampato a ≥ 0 (aree impilate: salCum + scartoCum = prodCum).

import type { Aggregato } from './aggregaProduzione';

export interface PuntoTrend {
  data: string; // 'YYYY-MM-DD'
  salCum: number;
  scartoCum: number; // max(0, prodCum − salCum)
  prodCum: number;
  prodGiorno: number; // produzione puntuale del giorno (per le barre del ritmo)
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function serieTrend(
  prodPerGiorno: Aggregato[],
  salPerGiorno: Aggregato[],
  from: string,
  to: string,
): PuntoTrend[] {
  let prod0 = 0;
  let sal0 = 0;
  const prodByDay = new Map<string, number>();
  const salByDay = new Map<string, number>();
  for (const g of prodPerGiorno) {
    if (g.chiave < from) prod0 += g.valore;
    else if (g.chiave <= to) prodByDay.set(g.chiave, (prodByDay.get(g.chiave) ?? 0) + g.valore);
  }
  for (const g of salPerGiorno) {
    if (g.chiave < from) sal0 += g.valore;
    else if (g.chiave <= to) salByDay.set(g.chiave, (salByDay.get(g.chiave) ?? 0) + g.valore);
  }
  const giorni = Array.from(new Set([...prodByDay.keys(), ...salByDay.keys()])).sort();
  const out: PuntoTrend[] = [];
  let p = prod0;
  let s = sal0;
  for (const d of giorni) {
    p = round2(p + (prodByDay.get(d) ?? 0));
    s = round2(s + (salByDay.get(d) ?? 0));
    out.push({
      data: d,
      prodCum: p,
      salCum: s,
      scartoCum: round2(Math.max(0, p - s)),
      prodGiorno: prodByDay.get(d) ?? 0,
    });
  }
  return out;
}

/** Lunedì (ISO) della settimana di un giorno 'YYYY-MM-DD'. */
function lunediDi(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const g = (d.getUTCDay() + 6) % 7; // 0=lunedì
  d.setUTCDate(d.getUTCDate() - g);
  return d.toISOString().slice(0, 10);
}

/** Raggruppa un aggregato per-giorno in per-settimana (chiave = lunedì ISO). */
export function raggruppaPerSettimana(agg: Aggregato[]): Aggregato[] {
  const m = new Map<string, Aggregato>();
  for (const g of agg) {
    const k = lunediDi(g.chiave);
    let a = m.get(k);
    if (!a) {
      a = { chiave: k, label: k, conteggio: 0, valore: 0 };
      m.set(k, a);
    }
    a.conteggio += g.conteggio;
    a.valore = round2(a.valore + g.valore);
  }
  return [...m.values()].sort((a, b) => (a.chiave < b.chiave ? -1 : 1));
}
```

- [ ] **Step 4: Verificare il verde**

Run: `npx vitest run lib/produzione/serieTrend.test.ts`
Atteso: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add lib/produzione/serieTrend.ts lib/produzione/serieTrend.test.ts
git commit -m "feat(produzione-economica): serie cumulate Produzione/SAL + raggruppo settimanale (serieTrend)"
```

---

### Task 3: `composizioneVoce` — slice per il donut (PURO)

**Files:**
- Create: `lib/produzione/composizioneVoce.ts`
- Test: `lib/produzione/composizioneVoce.test.ts`

**Interfaces:**
- Consumes: `Aggregato`, `ProduzioneAggregata` da `./aggregaProduzione`.
- Produces (usati da Task 10):
  - `const VOCE_LABEL: Record<string, string>`
  - `function composizionePerVoce(p: ProduzioneAggregata): Aggregato[]`

Contesto: le righe saracinesca hanno `kpi: null` e in `perVoce` finiscono nel bucket `NON_RISOLTA` (che nel periodo reale contiene ~876 saracinesche). Nel donut per la dirigenza la saracinesca deve essere una fetta a sé, estratta da `perAttivita` (chiave `'SOSTITUZIONE SARACINESCA'`), sottraendola dal residuo NON_RISOLTA.

- [ ] **Step 1: Scrivere il test che fallisce**

Crea `lib/produzione/composizioneVoce.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { composizionePerVoce, VOCE_LABEL } from './composizioneVoce';
import type { ProduzioneAggregata } from './aggregaProduzione';

const base: ProduzioneAggregata = {
  totale: { conteggio: 0, valore: 0 },
  perVoce: [],
  perAttivita: [],
  perOperatore: [],
  perTerritorio: [],
  perGiorno: [],
  nonRisolte: 0,
};

describe('composizionePerVoce', () => {
  it('rietichetta le voci note', () => {
    const out = composizionePerVoce({
      ...base,
      perVoce: [{ chiave: 'EL', label: 'EL', conteggio: 3, valore: 60 }],
    });
    expect(out).toEqual([{ chiave: 'EL', label: VOCE_LABEL.EL, conteggio: 3, valore: 60 }]);
  });

  it('estrae le saracinesche da NON_RISOLTA come fetta a sé', () => {
    const out = composizionePerVoce({
      ...base,
      perVoce: [
        { chiave: 'EL', label: 'EL', conteggio: 2, valore: 40 },
        { chiave: 'NON_RISOLTA', label: 'NON_RISOLTA', conteggio: 10, valore: 950 },
      ],
      perAttivita: [{ chiave: 'SOSTITUZIONE SARACINESCA', label: 'Sostituzione saracinesca', conteggio: 9, valore: 900 }],
    });
    expect(out).toEqual([
      { chiave: 'EL', label: VOCE_LABEL.EL, conteggio: 2, valore: 40 },
      { chiave: 'SARACINESCA', label: VOCE_LABEL.SARACINESCA, conteggio: 9, valore: 900 },
      { chiave: 'NON_RISOLTA', label: VOCE_LABEL.NON_RISOLTA, conteggio: 1, valore: 50 },
    ]);
  });

  it('se NON_RISOLTA è tutta saracinesca, il residuo sparisce', () => {
    const out = composizionePerVoce({
      ...base,
      perVoce: [{ chiave: 'NON_RISOLTA', label: 'NON_RISOLTA', conteggio: 5, valore: 455 }],
      perAttivita: [{ chiave: 'SOSTITUZIONE SARACINESCA', label: 'Sostituzione saracinesca', conteggio: 5, valore: 455 }],
    });
    expect(out).toEqual([{ chiave: 'SARACINESCA', label: VOCE_LABEL.SARACINESCA, conteggio: 5, valore: 455 }]);
  });

  it('senza saracinesche NON_RISOLTA resta intatta', () => {
    const out = composizionePerVoce({
      ...base,
      perVoce: [{ chiave: 'NON_RISOLTA', label: 'NON_RISOLTA', conteggio: 2, valore: 10 }],
    });
    expect(out).toEqual([{ chiave: 'NON_RISOLTA', label: VOCE_LABEL.NON_RISOLTA, conteggio: 2, valore: 10 }]);
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run lib/produzione/composizioneVoce.test.ts`
Atteso: FAIL (modulo inesistente).

- [ ] **Step 3: Implementazione**

Crea `lib/produzione/composizioneVoce.ts`:

```typescript
// PURA: slice per il donut "composizione per voce" della vista dirigenziale.
// Le righe saracinesca hanno kpi null → in perVoce collassano dentro NON_RISOLTA: qui vengono
// estratte come fetta a sé (da perAttivita, chiave 'SOSTITUZIONE SARACINESCA'), lasciando in
// NON_RISOLTA solo l'eventuale residuo davvero non classificato.

import type { Aggregato, ProduzioneAggregata } from './aggregaProduzione';

const SARA_KEY = 'SOSTITUZIONE SARACINESCA';

export const VOCE_LABEL: Record<string, string> = {
  EL: 'Limitazioni (EL)',
  ES: 'Sospensioni (ES)',
  ERC: 'Rimozione contatori (ERC)',
  ERA: 'Rimozione abusi (ERA)',
  SARACINESCA: 'Saracinesche',
  NON_RISOLTA: 'Non classificata',
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function composizionePerVoce(p: ProduzioneAggregata): Aggregato[] {
  const sara = p.perAttivita.find((a) => a.chiave === SARA_KEY);
  const out: Aggregato[] = [];
  for (const v of p.perVoce) {
    if (v.chiave === 'NON_RISOLTA' && sara) {
      out.push({ chiave: 'SARACINESCA', label: VOCE_LABEL.SARACINESCA, conteggio: sara.conteggio, valore: sara.valore });
      const resto = {
        chiave: 'NON_RISOLTA',
        label: VOCE_LABEL.NON_RISOLTA,
        conteggio: v.conteggio - sara.conteggio,
        valore: round2(v.valore - sara.valore),
      };
      if (resto.conteggio > 0) out.push(resto);
    } else {
      out.push({ ...v, label: VOCE_LABEL[v.chiave] ?? v.chiave });
    }
  }
  return out;
}
```

- [ ] **Step 4: Verificare il verde**

Run: `npx vitest run lib/produzione/composizioneVoce.test.ts`
Atteso: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add lib/produzione/composizioneVoce.ts lib/produzione/composizioneVoce.test.ts
git commit -m "feat(produzione-economica): composizione per voce con saracinesche estratte da NON_RISOLTA"
```

---

### Task 4: loader — `sal.perGiorno` + `personale` nel payload

**Files:**
- Modify: `lib/produzione/load.ts`
- Modify: `lib/produzione/exportExcel.test.ts` (fixture: nuovi campi obbligatori)
- Modify: `lib/produzione/excelInject.test.ts` (fixture: nuovi campi obbligatori)

**Interfaces:**
- Consumes: `aggregaPersonale`, `RigaLavoro`, `ProduzionePersonale` (Task 1); `attivitaCanonica`, `aggregaProduzione` (esistenti).
- Produces (usati da Task 5, 6, 8-13):
  - `ProduzioneSal` acquisisce `perGiorno: Aggregato[]` (dopo `perVoce`).
  - `ProduzioneEconomica` acquisisce `personale: ProduzionePersonale` (dopo `scarto`).

Non c'è unit test server-only per `load.ts` (dipende da Supabase): la verifica è `tsc` + i test esistenti di lib/produzione + verifica runtime in Task 14.

- [ ] **Step 1: Estendere i tipi e il calcolo SAL in `load.ts`**

In `lib/produzione/load.ts`:

1. Aggiorna l'import da `./aggregaPersonale` (nuovo) e i tipi:

```typescript
import { aggregaPersonale, type ProduzionePersonale, type RigaLavoro } from './aggregaPersonale';
```

2. Sostituisci l'interfaccia `ProduzioneSal` (righe 38-41) con:

```typescript
export interface ProduzioneSal {
  totale: Totale;
  perVoce: { chiave: string; label: string; conteggio: number; valore: number }[];
  perGiorno: { chiave: string; label: string; conteggio: number; valore: number }[];
}
```

3. In `ProduzioneEconomica` aggiungi, subito dopo `scarto: Totale;`:

```typescript
  personale: ProduzionePersonale;
```

4. Sostituisci la riga `const sal: ProduzioneSal = { totale: salAgg.totale, perVoce: salAgg.perVoce };` con:

```typescript
  const sal: ProduzioneSal = { totale: salAgg.totale, perVoce: salAgg.perVoce, perGiorno: salAgg.perGiorno };
```

- [ ] **Step 2: Query lavoro giornaliero + calcolo personale**

Sempre in `load.ts`:

1. Dopo l'interfaccia `PortaleRow` aggiungi:

```typescript
interface LavoroRow {
  staff_id: string | null;
  data: string | null;
  committente: string | null;
  intervento_tipo: string | null;
  comune: string | null;
}
```

2. Dopo la funzione `caricaSnapshot` aggiungi:

```typescript
/** Giorno successivo di 'YYYY-MM-DD' (bound esclusivo per query robuste a date/timestamp). */
function giornoDopo(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Interventi LAVORATI (stato='completato', qualsiasi committente) nel range: è il DENOMINATORE
// delle giornate-uomo frazionarie (un operatore "doppio territorio" che fa ACEA a saturazione
// non conta una giornata intera sulla commessa).
async function caricaLavoroGiornaliero(from: string, to: string): Promise<LavoroRow[]> {
  const rows: LavoroRow[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('staff_id, data, committente, intervento_tipo, comune')
      .eq('stato', 'completato')
      .gte('data', from)
      .lt('data', giornoDopo(to))
      .order('id', { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as LavoroRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}
```

3. In `caricaProduzioneEconomica`, aggiungi la query al `Promise.all` iniziale (in coda alla destrutturazione e alla lista):

```typescript
  const [listinoRows, interventi, masterRows, portaleRows, maps, alias, lavoroRows] = await Promise.all([
    /* …le 6 esistenti invariate… */
    caricaLavoroGiornaliero(from, to),
  ]);
```

4. Subito dopo la riga `const scarto = scartoProduzioneSal(produzione.totale, sal.totale);` aggiungi:

```typescript
  // Giornate-uomo: frazione ACEA/totale per (operatore, giorno). ACEA = committente EFFETTIVO
  // 'acea' via alias (stessa riclassificazione della produzione: il gas→italgas resta fuori).
  const righeLavoro: RigaLavoro[] = [];
  for (const l of lavoroRows) {
    const staffId = l.staff_id ?? '';
    const data = (l.data ?? '').slice(0, 10);
    if (!staffId || !data) continue;
    const canon = COMMITTENTI.includes(l.committente ?? '')
      ? attivitaCanonica(l.committente, l.intervento_tipo, l.comune, alias)
      : null;
    righeLavoro.push({
      staffId,
      operatore: maps.staff.get(staffId) ?? 'Operatore',
      data,
      acea: canon?.committenteEff === 'acea',
    });
  }
  const personale = aggregaPersonale(righeLavoro, produzione.perOperatore);
```

5. Aggiungi `personale,` all'oggetto di ritorno (dopo `scarto,`).

- [ ] **Step 3: Aggiornare le fixture dei test esistenti**

`ProduzioneEconomica` ora richiede `personale` e `sal.perGiorno`: i due test esistenti non compilano più.

In `lib/produzione/exportExcel.test.ts` E in `lib/produzione/excelInject.test.ts`, nella fixture `dati`:
- sostituisci `sal: { totale: …, perVoce: […] }` aggiungendo `perGiorno: [{ chiave: '2026-06-01', label: '2026-06-01', conteggio: 2, valore: 200 }]`;
- aggiungi dopo `scarto`:

```typescript
  personale: {
    totaleGiornate: 1.5,
    operatoriAttivi: 1,
    perOperatore: [{ chiave: 's1', label: 'ROSSI', giornate: 1.5, interventiAcea: 3, valore: 300, resa: 200 }],
    perGiorno: [{ data: '2026-06-01', dedicate: 1, saturazione: 0.5, operatori: 2 }],
  },
```

- [ ] **Step 4: Verifica tipi e test**

Run: `npx tsc --noEmit`
Atteso: 0 errori (la baseline tsc è verde).
Run: `npx vitest run lib/produzione`
Atteso: PASS su tutti i file di lib/produzione (inclusi i 3 nuovi).

- [ ] **Step 5: Commit**

```bash
git add lib/produzione/load.ts lib/produzione/exportExcel.test.ts lib/produzione/excelInject.test.ts
git commit -m "feat(produzione-economica): loader espone sal.perGiorno e personale (giornate-uomo frazionarie)"
```

---

### Task 5: export Excel tabellare — fogli "Dati - personale" e "Dati - SAL giorni"

**Files:**
- Modify: `lib/produzione/exportExcel.ts`
- Test: `lib/produzione/exportExcel.test.ts`

**Interfaces:**
- Consumes: `dati.personale` e `dati.sal.perGiorno` (Task 4).
- Produces: due worksheet in più nel workbook fallback (nessuna API nuova).

- [ ] **Step 1: Estendere il test**

In `lib/produzione/exportExcel.test.ts` aggiungi (accanto ai test esistenti, riusando la fixture `dati` e il pattern di lettura del workbook già presente nel file — adattare al helper esistente se il test rilegge il buffer con ExcelJS):

```typescript
  it('include i fogli personale e SAL per giorno', async () => {
    const buf = await buildWorkbookProduzione(dati);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as Buffer);
    const pe = wb.getWorksheet('Dati - personale');
    expect(pe).toBeDefined();
    expect(pe!.getCell('A1').value).toBe('Operatore');
    expect(pe!.getCell('A2').value).toBe('ROSSI');
    expect(pe!.getCell('B2').value).toBe(1.5); // giornate
    expect(pe!.getCell('E2').value).toBe(200); // resa €/gg
    const sg = wb.getWorksheet('Dati - SAL giorni');
    expect(sg).toBeDefined();
    expect(sg!.getCell('A2').value).toBe('2026-06-01');
    expect(sg!.getCell('C2').value).toBe(200);
  });
```

(se il file non importa già `ExcelJS`, aggiungi `import ExcelJS from 'exceljs';` in testa.)

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run lib/produzione/exportExcel.test.ts`
Atteso: FAIL (`getWorksheet('Dati - personale')` → undefined).

- [ ] **Step 3: Implementazione**

In `lib/produzione/exportExcel.ts`, subito dopo il blocco `aggSheet('Dati - giorni', …)` e prima del blocco audit, aggiungi:

```typescript
  // ── DATI: personale (giornate-uomo frazionarie) ─────────────
  const pe = wb.addWorksheet('Dati - personale');
  pe.columns = [{ width: 32 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 14 }];
  intestazione(pe.addRow(['Operatore', 'Giornate', 'Interventi ACEA', 'Produzione €', 'Resa €/gg']));
  for (const o of dati.personale.perOperatore) {
    const r = pe.addRow([o.label, o.giornate, o.interventiAcea, o.valore, o.resa ?? '']);
    r.getCell(4).numFmt = EUR;
    if (o.resa != null) r.getCell(5).numFmt = EUR;
  }
  const peTot = pe.addRow(['TOTALE', dati.personale.totaleGiornate, '', dati.produzione.totale.valore, '']);
  peTot.eachCell((c, col) => {
    c.font = { bold: true };
    if (col === 4) c.numFmt = EUR;
  });

  // ── DATI: SAL per giorno ────────────────────────────────────
  const sg = wb.addWorksheet('Dati - SAL giorni');
  sg.columns = [{ width: 16 }, { width: 10 }, { width: 16 }];
  intestazione(sg.addRow(['Giorno', 'ODL', 'SAL €']));
  for (const g of dati.sal.perGiorno) {
    const r = sg.addRow([g.chiave, g.conteggio, g.valore]);
    r.getCell(3).numFmt = EUR;
  }
```

- [ ] **Step 4: Verificare il verde**

Run: `npx vitest run lib/produzione/exportExcel.test.ts`
Atteso: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/produzione/exportExcel.ts lib/produzione/exportExcel.test.ts
git commit -m "feat(produzione-economica): fogli Excel personale e SAL per giorno (fallback tabellare)"
```

---

### Task 6: `aggiungiFogli` — fogli extra anche sulla via template (jszip)

**Files:**
- Modify: `lib/produzione/excelInject.ts`
- Modify: `app/api/admin/acea/produzione/export/route.ts`
- Test: `lib/produzione/excelInject.test.ts`

**Interfaces:**
- Consumes: `ProduzioneEconomica` (Task 4).
- Produces:
  - `interface FoglioSemplice { nome: string; righe: Array<Array<string | number>> }`
  - `async function aggiungiFogli(buf: Buffer, fogli: FoglioSemplice[]): Promise<Buffer>` — aggiunge worksheet "semplici" (senza stili) a un .xlsx SENZA ri-serializzarlo (grafici nativi preservati).
  - `function fogliPersonale(dati: ProduzioneEconomica): FoglioSemplice[]`

Motivo: la via primaria dell'export inietta i dati nel template con grafici nativi; il template non ha (e non può ricevere senza rigenerarlo a mano) i fogli personale/SAL-giorni. `aggiungiFogli` li appende al buffer finale scrivendo raw XML (sheetN.xml + registrazioni in workbook.xml, workbook.xml.rels, [Content_Types].xml), tecnica gemella di `iniettaCelle`.

- [ ] **Step 1: Scrivere il test che fallisce**

In `lib/produzione/excelInject.test.ts` aggiungi:

```typescript
  it('aggiungiFogli appende fogli leggibili senza rompere il workbook', async () => {
    // workbook di partenza minimale costruito con ExcelJS
    const wb0 = new ExcelJS.Workbook();
    wb0.addWorksheet('Dati').getCell('A1').value = 'x';
    const buf0 = Buffer.from(await wb0.xlsx.writeBuffer());

    const out = await aggiungiFogli(buf0, [
      { nome: 'Dati - personale', righe: [['Operatore', 'Giornate'], ['ROSSI', 1.5]] },
    ]);

    const wb1 = new ExcelJS.Workbook();
    await wb1.xlsx.load(out);
    expect(wb1.getWorksheet('Dati')).toBeDefined(); // il foglio originale sopravvive
    const pe = wb1.getWorksheet('Dati - personale');
    expect(pe).toBeDefined();
    expect(pe!.getCell('A1').value).toBe('Operatore');
    expect(pe!.getCell('A2').value).toBe('ROSSI');
    expect(pe!.getCell('B2').value).toBe(1.5);
  });

  it('fogliPersonale mappa personale e SAL per giorno', () => {
    const fogli = fogliPersonale(dati);
    expect(fogli.map((f) => f.nome)).toEqual(['Dati - personale', 'Dati - SAL giorni']);
    expect(fogli[0].righe[0]).toEqual(['Operatore', 'Giornate', 'Interventi ACEA', 'Produzione EUR', 'Resa EUR/gg']);
    expect(fogli[0].righe[1]).toEqual(['ROSSI', 1.5, 3, 300, 200]);
    expect(fogli[1].righe[1]).toEqual(['2026-06-01', 2, 200]);
  });
```

Aggiorna gli import del test: `import { aggiungiFogli, fogliPersonale, iniettaCelle, … } from './excelInject';` e `import ExcelJS from 'exceljs';` se assente.

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run lib/produzione/excelInject.test.ts`
Atteso: FAIL (export inesistenti).

- [ ] **Step 3: Implementazione in `excelInject.ts`**

In coda a `lib/produzione/excelInject.ts` aggiungi:

```typescript
// ── Fogli extra (personale / SAL per giorno) anche sulla via template ────────
// Il template con grafici nativi non contiene questi fogli e non può riceverli via iniettaCelle
// (best-effort su celle esistenti): li APPENDIAMO al package scrivendo raw XML — worksheet senza
// stili + registrazione in workbook.xml / rels / [Content_Types].xml. I grafici restano intatti
// perché non si ri-serializza nulla di esistente.

export interface FoglioSemplice {
  nome: string;
  righe: Array<Array<string | number>>;
}

/** Nome colonna Excel 0-based: 0→A, 25→Z, 26→AA. */
function colonna(i: number): string {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export async function aggiungiFogli(buf: Buffer, fogli: FoglioSemplice[]): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  let wbXml = await zip.file('xl/workbook.xml')!.async('string');
  let relsXml = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  let ctXml = await zip.file('[Content_Types].xml')!.async('string');

  // Primi indici liberi (sheetN.xml, rIdN, sheetId) — il template può averne di arbitrari.
  const maxDi = (xml: string, re: RegExp) => Math.max(0, ...[...xml.matchAll(re)].map((m) => Number(m[1])));
  let nextFile = maxDi(ctXml, /worksheets\/sheet(\d+)\.xml/g) + 1;
  let nextRid = maxDi(relsXml, /Id="rId(\d+)"/g) + 1;
  let nextSheetId = maxDi(wbXml, /<sheet[^>]*sheetId="(\d+)"/g) + 1;

  for (const f of fogli) {
    const file = `worksheets/sheet${nextFile}.xml`;
    const rowsXml = f.righe
      .map((riga, ri) => {
        const celle = riga
          .map((v, ci) => {
            const ref = `${colonna(ci)}${ri + 1}`;
            return typeof v === 'number' && Number.isFinite(v)
              ? `<c r="${ref}" t="n"><v>${v}</v></c>`
              : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escXml(String(v))}</t></is></c>`;
          })
          .join('');
        return `<row r="${ri + 1}">${celle}</row>`;
      })
      .join('');
    zip.file(
      `xl/${file}`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`,
    );
    ctXml = ctXml.replace(
      '</Types>',
      `<Override PartName="/xl/${file}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    );
    relsXml = relsXml.replace(
      '</Relationships>',
      `<Relationship Id="rId${nextRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${file}"/></Relationships>`,
    );
    wbXml = wbXml.replace('</sheets>', `<sheet name="${escXml(f.nome)}" sheetId="${nextSheetId}" r:id="rId${nextRid}"/></sheets>`);
    nextFile += 1;
    nextRid += 1;
    nextSheetId += 1;
  }

  zip.file('xl/workbook.xml', wbXml);
  zip.file('xl/_rels/workbook.xml.rels', relsXml);
  zip.file('[Content_Types].xml', ctXml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Fogli extra dell'export Produzione economica (personale + SAL per giorno). PURA. */
export function fogliPersonale(dati: ProduzioneEconomica): FoglioSemplice[] {
  return [
    {
      nome: 'Dati - personale',
      righe: [
        ['Operatore', 'Giornate', 'Interventi ACEA', 'Produzione EUR', 'Resa EUR/gg'],
        ...dati.personale.perOperatore.map((o): Array<string | number> => [o.label, o.giornate, o.interventiAcea, o.valore, o.resa ?? '']),
        ['TOTALE', dati.personale.totaleGiornate, '', dati.produzione.totale.valore, ''],
      ],
    },
    {
      nome: 'Dati - SAL giorni',
      righe: [
        ['Giorno', 'ODL', 'SAL EUR'],
        ...dati.sal.perGiorno.map((g): Array<string | number> => [g.chiave, g.conteggio, g.valore]),
      ],
    },
  ];
}
```

- [ ] **Step 4: Agganciare la route export**

In `app/api/admin/acea/produzione/export/route.ts`:

1. Estendi l'import: `import { aggiungiFogli, fogliPersonale, iniettaTemplate, mappaCelleProduzione } from '@/lib/produzione/excelInject';`
2. Nella `costruisciBuffer`, sostituisci il corpo del `try` con:

```typescript
    const tpl = Buffer.from((templateDashboard as { b64: string }).b64, 'base64');
    const iniettato = await iniettaTemplate(tpl, mappaCelleProduzione(dati));
    return await aggiungiFogli(iniettato, fogliPersonale(dati));
```

(il `catch` col fallback ExcelJS resta invariato: il fallback ha già i suoi fogli dal Task 5.)

- [ ] **Step 5: Verificare il verde**

Run: `npx vitest run lib/produzione/excelInject.test.ts`
Atteso: PASS.
Run: `npx tsc --noEmit`
Atteso: 0 errori.

- [ ] **Step 6: Commit**

```bash
git add lib/produzione/excelInject.ts lib/produzione/excelInject.test.ts app/api/admin/acea/produzione/export/route.ts
git commit -m "feat(produzione-economica): fogli personale/SAL anche sull'export template (aggiungiFogli jszip)"
```

---

### Task 7: `useChartColors` — token semantici risolti per gli SVG

**Files:**
- Modify: `components/modules/performance/palette.ts`

**Interfaces:**
- Produces (usati da Task 9, 10, 11): `ResolvedChartColors` acquisisce `warning: string`, `success: string`, `brandPrimary: string` (valori concreti risolti da `--warning`, `--success`, `--brand-primary`).

Modifica ADDITIVA (l'interfaccia è usata da altri componenti performance: non rimuovere nulla).

- [ ] **Step 1: Estendere interfaccia, lettura e fallback**

In `components/modules/performance/palette.ts`:

1. In `interface ResolvedChartColors` aggiungi in coda:

```typescript
  /** Colore risolto per --warning (area scarto / saturazione). */
  warning: string;
  /** Colore risolto per --success (linea produzione / dedicati). */
  success: string;
  /** Colore risolto per --brand-primary (serie primaria). */
  brandPrimary: string;
```

2. In `readTokens()`, nell'oggetto di ritorno aggiungi:

```typescript
    warning:      resolve('--warning'),
    success:      resolve('--success'),
    brandPrimary: resolve('--brand-primary'),
```

3. In `FALLBACK` aggiungi:

```typescript
  warning:      '#d97706',
  success:      '#16a34a',
  brandPrimary: '#2563eb',
```

- [ ] **Step 2: Verifica**

Run: `npx tsc --noEmit`
Atteso: 0 errori.
Run: `npx eslint components/modules/performance/palette.ts`
Atteso: nessun errore nuovo.

- [ ] **Step 3: Commit**

```bash
git add components/modules/performance/palette.ts
git commit -m "feat(performance): useChartColors espone warning/success/brand-primary risolti"
```

---

### Task 8: tipi condivisi + `KpiDirezione` (6 card dirigenziali)

**Files:**
- Create: `components/modules/performance/economica/tipi.ts`
- Create: `components/modules/performance/economica/KpiDirezione.tsx`

**Interfaces:**
- Consumes: tipi lib (Task 1, 4).
- Produces (usati da Task 9-13):
  - `tipi.ts`: `interface DatiProduzione` (payload completo dell'API, con `sal.perGiorno` e `personale`), `const eur = (n: number) => string`, `const num = (n: number) => string`, `const giornoIT = (iso: string) => string` (→ `dd/MM`).
  - `KpiDirezione.tsx`: `default function KpiDirezione({ dati, operative }: { dati: DatiProduzione; operative?: boolean })` — 6 card (Produzione, SAL, Da richiedere, % consuntivato, Giornate-uomo, Resa €/gg); con `operative` aggiunge le 2 card Voci non risolte / Discrepanze audit.

- [ ] **Step 1: Creare `tipi.ts`**

Crea `components/modules/performance/economica/tipi.ts`:

```typescript
// Tipo del payload /api/admin/acea/produzione + helper di formattazione condivisi
// tra la tab in-app (PerformanceEconomica) e la vista presentazione.

import type { Aggregato, ProduzioneAggregata } from '@/lib/produzione/aggregaProduzione';
import type { ProduzionePersonale } from '@/lib/produzione/aggregaPersonale';
import type { ClasseDiscrepanza, Discrepanza, Totale } from '@/lib/produzione/riconciliazione';

export interface DatiProduzione {
  from: string;
  to: string;
  produzione: ProduzioneAggregata;
  sal: { totale: Totale; perVoce: Aggregato[]; perGiorno: Aggregato[] };
  scarto: Totale;
  personale: ProduzionePersonale;
  audit: Discrepanza[];
  auditSummary: Record<ClasseDiscrepanza, number>;
  auditTotale: number;
  auditTruncated: boolean;
  masterPopolato: boolean;
  portalePopolato: boolean;
}

export const eur = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
export const num = (n: number) => n.toLocaleString('it-IT');
/** 'YYYY-MM-DD' → 'dd/MM' (assi dei grafici). */
export const giornoIT = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
```

- [ ] **Step 2: Creare `KpiDirezione.tsx`**

Crea `components/modules/performance/economica/KpiDirezione.tsx`:

```tsx
'use client';
import { eur, num, type DatiProduzione } from './tipi';

function Card({ titolo, valore, nota, accent }: { titolo: string; valore: string; nota?: string; accent?: 'pos' | 'neg' | 'warn' }) {
  const color =
    accent === 'pos' ? 'text-[var(--success)]' : accent === 'neg' ? 'text-[var(--danger)]' : accent === 'warn' ? 'text-[var(--warning)]' : 'text-[var(--brand-text-main)]';
  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2">
      <div className="text-[11px] text-[var(--brand-text-muted)]">{titolo}</div>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{valore}</div>
      {nota && <div className="text-[10px] text-[var(--brand-text-subtle)]">{nota}</div>}
    </div>
  );
}

/** Fila di KPI per la dirigenza: economia + personale. Con `operative` aggiunge le 2 card di controllo. */
export default function KpiDirezione({ dati, operative }: { dati: DatiProduzione; operative?: boolean }) {
  const prod = dati.produzione.totale.valore;
  const sal = dati.sal.totale.valore;
  const perc = prod > 0 ? Math.round((sal / prod) * 100) : null;
  const giornate = dati.personale.totaleGiornate;
  const resa = giornate > 0 ? prod / giornate : null;

  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      <Card titolo="Produzione" valore={eur(prod)} nota={`${num(dati.produzione.totale.conteggio)} ordini`} accent="pos" />
      <Card titolo="SAL (pagato)" valore={eur(sal)} nota={`${num(dati.sal.totale.conteggio)} ODL · causale E%`} />
      <Card titolo="Da richiedere ad ACEA" valore={eur(dati.scarto.valore)} nota="Produzione − SAL" accent={dati.scarto.valore > 0 ? 'warn' : undefined} />
      <Card titolo="% consuntivato" valore={perc == null ? '—' : `${num(perc)}%`} nota="SAL / Produzione" />
      <Card titolo="Giornate-uomo" valore={num(giornate)} nota={`${num(dati.personale.operatoriAttivi)} operatori`} />
      <Card titolo="Resa €/giornata" valore={resa == null ? '—' : eur(resa)} nota="Produzione / giornate" />
      {operative && (
        <>
          <Card titolo="Voci non risolte" valore={num(dati.produzione.nonRisolte)} nota="da classificare" accent={dati.produzione.nonRisolte > 0 ? 'warn' : undefined} />
          <Card titolo="Discrepanze audit" valore={num(dati.auditTotale)} nota="3 vie: DB · master · portale" accent={dati.auditTotale > 0 ? 'warn' : undefined} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verifica**

Run: `npx tsc --noEmit` → 0 errori.
Run: `npx eslint components/modules/performance/economica/tipi.ts components/modules/performance/economica/KpiDirezione.tsx` → nessun errore nuovo.

- [ ] **Step 4: Commit**

```bash
git add components/modules/performance/economica/tipi.ts components/modules/performance/economica/KpiDirezione.tsx
git commit -m "feat(produzione-economica): tipi condivisi + fila KPI dirigenziale (KpiDirezione)"
```

---

### Task 9: `TrendProduzioneSal` — cumulate + ritmo

**Files:**
- Create: `components/modules/performance/economica/TrendProduzioneSal.tsx`

**Interfaces:**
- Consumes: `serieTrend`, `raggruppaPerSettimana` (Task 2); `useChartColors` esteso (Task 7); `eur`, `giornoIT`, `DatiProduzione` (Task 8).
- Produces: `default function TrendProduzioneSal({ dati }: { dati: DatiProduzione })`.

Design: ComposedChart con due Aree impilate — `salCum` (brandPrimary, "SAL (pagato)") + `scartoCum` (warning, "Da richiedere ad ACEA") — la cui somma è la produzione cumulata, ribadita da una `Line` `prodCum` (success). Sotto, BarChart compatto del ritmo (`prodGiorno`), aggregato per settimana quando i punti superano 45.

- [ ] **Step 1: Implementazione**

Crea `components/modules/performance/economica/TrendProduzioneSal.tsx`:

```tsx
'use client';
import { useMemo } from 'react';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { serieTrend, raggruppaPerSettimana } from '@/lib/produzione/serieTrend';
import { useChartColors, chartTooltipContent, chartItemStyle, chartLabelStyle } from '../palette';
import { eur, giornoIT, type DatiProduzione } from './tipi';

const SOGLIA_SETTIMANE = 45; // oltre ~45 giorni le barre passano a granularità settimanale

/** Trend cumulato Produzione vs SAL: l'area gialla tra le curve è il "da richiedere ad ACEA". */
export default function TrendProduzioneSal({ dati }: { dati: DatiProduzione }) {
  const cc = useChartColors();

  const serie = useMemo(
    () => serieTrend(dati.produzione.perGiorno, dati.sal.perGiorno, dati.from, dati.to),
    [dati],
  );
  const ritmo = useMemo(() => {
    const giorni = dati.produzione.perGiorno;
    return giorni.length > SOGLIA_SETTIMANE ? raggruppaPerSettimana(giorni) : giorni;
  }, [dati]);
  const settimanale = dati.produzione.perGiorno.length > SOGLIA_SETTIMANE;

  if (serie.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--brand-border)] p-3">
        <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Produzione vs SAL nel tempo</h3>
        <p className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Nessun dato nel periodo.</p>
      </div>
    );
  }

  const kEuro = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));

  return (
    <div className="rounded-xl border border-[var(--brand-border)] p-3">
      <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Produzione vs SAL nel tempo (cumulato)</h3>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={cc.brandBorder} vertical={false} />
            <XAxis dataKey="data" tickFormatter={giornoIT} tick={{ fill: cc.brandTextMuted, fontSize: 11 }} axisLine={{ stroke: cc.brandBorder }} tickLine={false} minTickGap={24} />
            <YAxis tickFormatter={kEuro} tick={{ fill: cc.brandTextMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              labelFormatter={(l) => `Al ${giornoIT(String(l))}`}
              formatter={(v, name) => [eur(Number(v)), String(name)]}
              contentStyle={chartTooltipContent}
              itemStyle={chartItemStyle}
              labelStyle={chartLabelStyle}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="salCum" stackId="cum" name="SAL (pagato)" stroke={cc.brandPrimary} fill={cc.brandPrimary} fillOpacity={0.55} />
            <Area type="monotone" dataKey="scartoCum" stackId="cum" name="Da richiedere ad ACEA" stroke={cc.warning} fill={cc.warning} fillOpacity={0.35} />
            <Line type="monotone" dataKey="prodCum" name="Produzione" stroke={cc.success} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <h4 className="mb-1 mt-3 text-[12px] font-medium text-[var(--brand-text-muted)]">
        Ritmo di produzione {settimanale ? '(per settimana)' : '(per giorno)'}
      </h4>
      <div style={{ width: '100%', height: 110 }}>
        <ResponsiveContainer>
          <BarChart data={ritmo} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <XAxis dataKey="chiave" tickFormatter={giornoIT} tick={{ fill: cc.brandTextMuted, fontSize: 10 }} axisLine={{ stroke: cc.brandBorder }} tickLine={false} minTickGap={24} />
            <YAxis tickFormatter={kEuro} tick={{ fill: cc.brandTextMuted, fontSize: 10 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              labelFormatter={(l) => (settimanale ? `Settimana del ${giornoIT(String(l))}` : giornoIT(String(l)))}
              formatter={(v) => [eur(Number(v)), 'Produzione']}
              contentStyle={chartTooltipContent}
              itemStyle={chartItemStyle}
              labelStyle={chartLabelStyle}
            />
            <Bar dataKey="valore" fill={cc.brandPrimary} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica**

Run: `npx tsc --noEmit` → 0 errori.
Run: `npx eslint components/modules/performance/economica/TrendProduzioneSal.tsx` → nessun errore nuovo.

- [ ] **Step 3: Commit**

```bash
git add components/modules/performance/economica/TrendProduzioneSal.tsx
git commit -m "feat(produzione-economica): grafico trend cumulato Produzione vs SAL + ritmo"
```

---

### Task 10: `ComposizioneProduzione` — donut voce + barre attività

**Files:**
- Create: `components/modules/performance/economica/ComposizioneProduzione.tsx`

**Interfaces:**
- Consumes: `composizionePerVoce` (Task 3); `useChartColors` (Task 7); `eur`, `num`, `DatiProduzione` (Task 8).
- Produces: `default function ComposizioneProduzione({ dati }: { dati: DatiProduzione })`.

- [ ] **Step 1: Implementazione**

Crea `components/modules/performance/economica/ComposizioneProduzione.tsx`:

```tsx
'use client';
import { useMemo } from 'react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { composizionePerVoce } from '@/lib/produzione/composizioneVoce';
import { useChartColors, chartTooltipContent, chartItemStyle, chartLabelStyle } from '../palette';
import { eur, num, type DatiProduzione } from './tipi';

const MAX_ATTIVITA = 8;

/** Composizione della produzione: donut per voce + barre orizzontali delle top attività. */
export default function ComposizioneProduzione({ dati }: { dati: DatiProduzione }) {
  const cc = useChartColors();
  const slices = useMemo(() => composizionePerVoce(dati.produzione), [dati]);
  const attivita = dati.produzione.perAttivita.slice(0, MAX_ATTIVITA);
  const totale = dati.produzione.totale.valore;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-[var(--brand-border)] p-3">
        <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Produzione per voce</h3>
        {slices.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Nessun dato nel periodo.</p>
        ) : (
          <>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={slices} dataKey="valore" nameKey="label" innerRadius={55} outerRadius={88} stroke={cc.brandSurface} strokeWidth={1.5}>
                    {slices.map((s, i) => (
                      <Cell key={s.chiave} fill={cc.palette[i % cc.palette.length]} stroke={cc.brandSurface} strokeWidth={1.5} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, name) => {
                      const val = Number(v);
                      return [`${eur(val)} (${totale ? Math.round((val / totale) * 100) : 0}%)`, String(name)];
                    }}
                    contentStyle={chartTooltipContent}
                    itemStyle={chartItemStyle}
                    labelStyle={chartLabelStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--brand-text-muted)]">
              {slices.map((s, i) => (
                <span key={s.chiave} className="inline-flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: cc.palette[i % cc.palette.length] }} />
                  {s.label} <span className="tabular-nums">{eur(s.valore)}</span> · <span className="tabular-nums">{num(s.conteggio)}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="rounded-xl border border-[var(--brand-border)] p-3">
        <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Top attività per valore</h3>
        {attivita.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Nessun dato nel periodo.</p>
        ) : (
          <div style={{ width: '100%', height: Math.max(180, attivita.length * 32) }}>
            <ResponsiveContainer>
              <BarChart data={attivita} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <XAxis type="number" tick={{ fill: cc.brandTextMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => (Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : String(v))} />
                <YAxis type="category" dataKey="label" width={170} tick={{ fill: cc.brandTextMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v, _n, p) => [`${eur(Number(v))} · ${num(Number((p?.payload as { conteggio?: number })?.conteggio ?? 0))} interventi`, 'Produzione']}
                  contentStyle={chartTooltipContent}
                  itemStyle={chartItemStyle}
                  labelStyle={chartLabelStyle}
                />
                <Bar dataKey="valore" radius={[0, 4, 4, 0]}>
                  {attivita.map((a, i) => (
                    <Cell key={a.chiave} fill={cc.palette[i % cc.palette.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica**

Run: `npx tsc --noEmit` → 0 errori.
Run: `npx eslint components/modules/performance/economica/ComposizioneProduzione.tsx` → nessun errore nuovo.

- [ ] **Step 3: Commit**

```bash
git add components/modules/performance/economica/ComposizioneProduzione.tsx
git commit -m "feat(produzione-economica): composizione produzione (donut voce + top attività)"
```

---

### Task 11: `PersonaleImpegno` — € per operatore + impegno nel tempo

**Files:**
- Create: `components/modules/performance/economica/PersonaleImpegno.tsx`

**Interfaces:**
- Consumes: `PersonaleOperatore`, `PersonaleGiorno` via `dati.personale` (Task 1/4); `raggruppaPerSettimana` (Task 2); `useChartColors` (Task 7); `eur`, `num`, `giornoIT`, `DatiProduzione` (Task 8).
- Produces: `default function PersonaleImpegno({ dati }: { dati: DatiProduzione })`.

- [ ] **Step 1: Implementazione**

Crea `components/modules/performance/economica/PersonaleImpegno.tsx`:

```tsx
'use client';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PersonaleOperatore } from '@/lib/produzione/aggregaPersonale';
import { useChartColors, chartTooltipContent, chartItemStyle, chartLabelStyle } from '../palette';
import { eur, num, giornoIT, type DatiProduzione } from './tipi';

const MAX_OPERATORI = 12;
const SOGLIA_SETTIMANE = 45;

/** Personale impegnato sulla commessa: € per operatore (con giornate/resa) + impegno nel tempo. */
export default function PersonaleImpegno({ dati }: { dati: DatiProduzione }) {
  const cc = useChartColors();
  const operatori = dati.personale.perOperatore.slice(0, MAX_OPERATORI);

  // Impegno nel tempo: se il periodo è lungo, somma le giornate per settimana.
  const impegno = useMemo(() => {
    const g = dati.personale.perGiorno;
    if (g.length <= SOGLIA_SETTIMANE) return g.map((x) => ({ chiave: x.data, dedicate: x.dedicate, saturazione: x.saturazione }));
    const m = new Map<string, { chiave: string; dedicate: number; saturazione: number }>();
    for (const x of g) {
      const d = new Date(`${x.data}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      const k = d.toISOString().slice(0, 10);
      const acc = m.get(k) ?? { chiave: k, dedicate: 0, saturazione: 0 };
      acc.dedicate += x.dedicate;
      acc.saturazione += x.saturazione;
      m.set(k, acc);
    }
    return [...m.values()]
      .map((x) => ({ ...x, dedicate: Math.round(x.dedicate * 100) / 100, saturazione: Math.round(x.saturazione * 100) / 100 }))
      .sort((a, b) => (a.chiave < b.chiave ? -1 : 1));
  }, [dati]);
  const settimanale = dati.personale.perGiorno.length > SOGLIA_SETTIMANE;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-[var(--brand-border)] p-3">
        <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Produzione per operatore</h3>
        {operatori.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Nessun dato nel periodo.</p>
        ) : (
          <div style={{ width: '100%', height: Math.max(180, operatori.length * 30) }}>
            <ResponsiveContainer>
              <BarChart data={operatori} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <XAxis type="number" tick={{ fill: cc.brandTextMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => (Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : String(v))} />
                <YAxis type="category" dataKey="label" width={130} tick={{ fill: cc.brandTextMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v, _n, p) => {
                    const o = p?.payload as PersonaleOperatore | undefined;
                    const dettagli = o ? ` · ${num(o.giornate)} gg · resa ${o.resa == null ? '—' : eur(o.resa)}` : '';
                    return [`${eur(Number(v))}${dettagli}`, 'Produzione'];
                  }}
                  contentStyle={chartTooltipContent}
                  itemStyle={chartItemStyle}
                  labelStyle={chartLabelStyle}
                />
                <Bar dataKey="valore" fill={cc.brandPrimary} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-1 text-[10px] text-[var(--brand-text-subtle)]">
          Giornate = quota di interventi ACEA lavorati sul totale lavorato nel giorno (gli assegnati non eseguiti non contano).
        </p>
      </div>

      <div className="rounded-xl border border-[var(--brand-border)] p-3">
        <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">
          Impegno nel tempo {settimanale ? '(giornate/settimana)' : '(giornate/giorno)'}
        </h3>
        {impegno.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Nessun dato nel periodo.</p>
        ) : (
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={impegno} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={cc.brandBorder} vertical={false} />
                <XAxis dataKey="chiave" tickFormatter={giornoIT} tick={{ fill: cc.brandTextMuted, fontSize: 10 }} axisLine={{ stroke: cc.brandBorder }} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fill: cc.brandTextMuted, fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  labelFormatter={(l) => (settimanale ? `Settimana del ${giornoIT(String(l))}` : giornoIT(String(l)))}
                  formatter={(v, name) => [`${num(Number(v))} gg`, String(name)]}
                  contentStyle={chartTooltipContent}
                  itemStyle={chartItemStyle}
                  labelStyle={chartLabelStyle}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="dedicate" stackId="gg" name="Dedicati (≥ 80%)" fill={cc.success} />
                <Bar dataKey="saturazione" stackId="gg" name="A saturazione" fill={cc.warning} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica**

Run: `npx tsc --noEmit` → 0 errori.
Run: `npx eslint components/modules/performance/economica/PersonaleImpegno.tsx` → nessun errore nuovo.

- [ ] **Step 3: Commit**

```bash
git add components/modules/performance/economica/PersonaleImpegno.tsx
git commit -m "feat(produzione-economica): blocco personale (€/operatore con giornate-resa + impegno nel tempo)"
```

---

### Task 12: integrazione nella tab `PerformanceEconomica`

**Files:**
- Modify: `components/modules/performance/PerformanceEconomica.tsx`

**Interfaces:**
- Consumes: `KpiDirezione`, `TrendProduzioneSal`, `ComposizioneProduzione`, `PersonaleImpegno`, `DatiProduzione` (Task 8-11).
- Produces: la tab riorganizzata; bottone "Presentazione" → `/presentazione/produzione-acea?from=…&to=…` (target `_blank`).

- [ ] **Step 1: Sostituire tipi e KPI locali**

In `components/modules/performance/PerformanceEconomica.tsx`:

1. Rimuovi l'interfaccia locale `DatiProduzione` (righe 11-23) e importa quella condivisa; rimuovi anche il componente locale `Card` (righe 54-64) e le costanti `eur`/`num` locali (righe 25-26):

```typescript
import KpiDirezione from './economica/KpiDirezione';
import TrendProduzioneSal from './economica/TrendProduzioneSal';
import ComposizioneProduzione from './economica/ComposizioneProduzione';
import PersonaleImpegno from './economica/PersonaleImpegno';
import { eur, num, type DatiProduzione } from './economica/tipi';
```

(`Aggregato`/`ProduzioneAggregata` restano usati dalla tabella per voce e `TabellaAgg`; lasciare gli import lib esistenti che servono ancora, rimuovere quelli morti.)

2. Rimuovi dagli import recharts i simboli non più usati dopo il punto 4 (il BarChart per voce sparisce): `Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis` e l'import `useChartColors, chartTooltipContent, chartItemStyle, chartLabelStyle` + la riga `const cc = useChartColors();` (i grafici ora vivono nei componenti dedicati).

- [ ] **Step 2: Bottone Presentazione nell'header**

Nell'header (dopo il link "Scarica Excel (dashboard)", riga ~152) aggiungi:

```tsx
          <a
            href={invalid ? undefined : `/presentazione/produzione-acea?from=${from}&to=${to}`}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex h-7 items-center rounded-[var(--radius-md)] border border-[var(--brand-primary)] px-3 text-xs font-medium text-[var(--brand-primary)] ${invalid ? 'pointer-events-none opacity-50' : ''}`}
          >
            Presentazione
          </a>
```

- [ ] **Step 3: Riorganizzare il corpo**

Dentro `{dati && (<>…</>)}`:

1. Sostituisci l'intero grid delle 5 KPI card (righe 181-187) con:

```tsx
          <KpiDirezione dati={dati} operative />
```

2. Sostituisci il blocco a 2 colonne "Produzione € per voce" + "Produzione vs SAL per voce" (righe 189-244) con i due blocchi grafici nuovi + la tabella Produzione vs SAL conservata:

```tsx
          {/* Trend cumulato Produzione vs SAL */}
          <div className="mb-4">
            <TrendProduzioneSal dati={dati} />
          </div>

          {/* Composizione: donut per voce + top attività */}
          <div className="mb-4">
            <ComposizioneProduzione dati={dati} />
          </div>

          {/* Personale impegnato */}
          <div className="mb-4">
            <PersonaleImpegno dati={dati} />
          </div>

          {/* Produzione vs SAL per voce (tabella operativa) */}
          <div className="mb-4 rounded-xl border border-[var(--brand-border)] p-3">
            <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Produzione vs SAL per voce</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--brand-text-muted)]">
                  <th className="py-1 pr-2">Voce</th>
                  <th className="py-1 pr-2 text-right">Produzione</th>
                  <th className="py-1 pr-2 text-right">SAL</th>
                </tr>
              </thead>
              <tbody>
                {dati.produzione.perVoce.map((v) => {
                  const sal = dati.sal.perVoce.find((s) => s.chiave === v.chiave);
                  return (
                    <tr key={v.chiave} className="border-t border-[var(--brand-border)]">
                      <td className="py-1 pr-2 font-medium text-[var(--brand-text-main)]">{v.chiave}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{eur(v.valore)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-[var(--brand-text-muted)]">{eur(sal?.valore ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
```

3. Le sezioni successive restano INVARIATE: "Produzione per attività" (`TabellaAgg` max 30), il grid "Per operatore"/"Per territorio", l'audit a tre vie.

- [ ] **Step 4: Verifica**

Run: `npx tsc --noEmit` → 0 errori.
Run: `npx eslint components/modules/performance/PerformanceEconomica.tsx` → nessun errore nuovo (occhio agli import inutilizzati).

- [ ] **Step 5: Commit**

```bash
git add components/modules/performance/PerformanceEconomica.tsx
git commit -m "feat(produzione-economica): tab riorganizzata con KPI direzione, trend, composizione e personale"
```

---

### Task 13: route presentazione a schermo intero

**Files:**
- Create: `components/modules/performance/economica/PresentazioneProduzione.tsx`
- Create: `app/presentazione/produzione-acea/page.tsx`

**Interfaces:**
- Consumes: `assertKpiAccess` (`@/lib/performance/kpiGate`), i 4 componenti grafici, `DatiProduzione`.
- Produces: route `/presentazione/produzione-acea?from=YYYY-MM-DD&to=YYYY-MM-DD` — fuori da `/hub` (nessuna AppShell), tema chiaro forzato, toolbar stampa nascosta in stampa.

- [ ] **Step 1: Componente client**

Crea `components/modules/performance/economica/PresentazioneProduzione.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import KpiDirezione from './KpiDirezione';
import TrendProduzioneSal from './TrendProduzioneSal';
import ComposizioneProduzione from './ComposizioneProduzione';
import PersonaleImpegno from './PersonaleImpegno';
import type { DatiProduzione } from './tipi';

/** Vista presentazione per la dirigenza: schermo intero, TEMA CHIARO FORZATO, solo KPI + grafici.
 *  Il tema si forza aggiungendo la classe `light` su <html> (meccanismo di app/layout.tsx);
 *  all'uscita si ripristina lo stato precedente. */
export default function PresentazioneProduzione({ from, to }: { from: string; to: string }) {
  const [dati, setDati] = useState<DatiProduzione | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    const aveva = document.documentElement.classList.contains('light');
    document.documentElement.classList.add('light');
    return () => {
      if (!aveva) document.documentElement.classList.remove('light');
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/acea/produzione?from=${from}&to=${to}`, { cache: 'no-store' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
        if (vivo) setDati((await res.json()) as DatiProduzione);
      } catch (e) {
        if (vivo) setErrore(e instanceof Error ? e.message : 'Errore caricamento.');
      }
    })();
    return () => {
      vivo = false;
    };
  }, [from, to]);

  const dataIT = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--brand-text-main)]">
      <div className="mx-auto max-w-[1400px] p-6 lg:p-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Commessa ACEA — Produzione economica</h1>
            <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
              Periodo {dataIT(from)} → {dataIT(to)} · Produzione = lavorato valorizzato · SAL = pagato ACEA (causale E%)
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <a href="/hub/performance/economica" className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-[var(--brand-border)] px-3 text-xs text-[var(--brand-text-muted)]">
              ← Torna al modulo
            </a>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-8 items-center rounded-[var(--radius-md)] bg-[var(--brand-primary)] px-3 text-xs font-medium text-white"
            >
              Stampa / PDF
            </button>
          </div>
        </div>

        {errore && <p className="text-sm text-[var(--danger)]">{errore}</p>}
        {!dati && !errore && <p className="py-16 text-center text-sm text-[var(--brand-text-muted)]">Carico i dati…</p>}

        {dati && (
          <div className="space-y-6">
            <section className="break-inside-avoid">
              <KpiDirezione dati={dati} />
            </section>
            <section className="break-inside-avoid">
              <TrendProduzioneSal dati={dati} />
            </section>
            <section className="break-inside-avoid">
              <ComposizioneProduzione dati={dati} />
            </section>
            <section className="break-inside-avoid">
              <PersonaleImpegno dati={dati} />
            </section>
            <p className="text-[10px] text-[var(--brand-text-subtle)]">
              Fonte: gestionale (interventi + snapshot master/portale ACEA). SAL = ordini COMPLETATI con causale di
              scostamento pagata (E%). Giornate-uomo = quota di interventi ACEA lavorati sul totale lavorato nel giorno.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Pagina server**

Crea `app/presentazione/produzione-acea/page.tsx`:

```tsx
import { assertKpiAccess } from '@/lib/performance/kpiGate';
import PresentazioneProduzione from '@/components/modules/performance/economica/PresentazioneProduzione';

export const dynamic = 'force-dynamic';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function trentaGiorniFa(oggi: string): string {
  const d = new Date(`${oggi}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString().slice(0, 10);
}

/** Vista presentazione (fuori da /hub → nessuna AppShell): ?from&to, default ultimi 30 giorni. */
export default async function PresentazioneProduzioneAceaPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await assertKpiAccess();
  const sp = await searchParams;
  const oggi = new Date().toISOString().slice(0, 10);
  const to = ISO.test(sp.to ?? '') ? (sp.to as string) : oggi;
  const from = ISO.test(sp.from ?? '') ? (sp.from as string) : trentaGiorniFa(to);
  return <PresentazioneProduzione from={from} to={to} />;
}
```

- [ ] **Step 3: Verifica**

Run: `npx tsc --noEmit` → 0 errori.
Run: `npx eslint app/presentazione/produzione-acea/page.tsx components/modules/performance/economica/PresentazioneProduzione.tsx` → nessun errore nuovo.

- [ ] **Step 4: Commit**

```bash
git add app/presentazione/produzione-acea/page.tsx components/modules/performance/economica/PresentazioneProduzione.tsx
git commit -m "feat(produzione-economica): vista presentazione dirigenza (tema chiaro, stampa)"
```

---

### Task 14: verifica finale end-to-end

**Files:** nessuna modifica prevista (solo fix di ciò che emerge).

- [ ] **Step 1: Gate statici completi**

Run: `npx tsc --noEmit` → 0 errori.
Run: `npx vitest run lib/produzione` → tutti PASS.
Run: `npx eslint components/modules/performance lib/produzione app/presentazione app/api/admin/acea/produzione` → nessun errore NUOVO rispetto alla baseline (la baseline globale è rossa altrove: contano solo i file toccati).

- [ ] **Step 2: Build**

Run: `npm run build`
Atteso: build Next completata senza errori (verifica che la route `/presentazione/produzione-acea` compili).

- [ ] **Step 3: Verifica visuale (dev server)**

1. Avvia il dev server e apri `/hub/performance/economica` con periodo **2026-06-01 → 2026-07-31** (dati reali: produzione ≈ 134.740 €, SAL ≈ 47.755 €).
2. Controlla: 8 KPI card (6 direzione + 2 operative); trend con area SAL + area scarto + linea produzione che chiude sui totali delle card; donut con fetta "Saracinesche" grande (~876 conteggio) e NON più un bucket "NON_RISOLTA" gonfiato; blocco personale con giornate frazionarie e nota metodologica.
3. Bottone "Presentazione" → si apre `/presentazione/produzione-acea?from=…&to=…` in tab nuova, TEMA CHIARO anche se l'app era in dark, senza sidebar; "Stampa / PDF" apre l'anteprima con la toolbar nascosta.
4. "Scarica Excel (dashboard)" → il file contiene i fogli nuovi "Dati - personale" e "Dati - SAL giorni" E i grafici nativi del template intatti (aprire in Excel).

- [ ] **Step 4: Commit di eventuali fix + push**

Fix mirati per ciò che emerge, poi commit finale.

---

## Note per l'esecuzione

- Lavorare in un **worktree da `origin/main`** (skill superpowers:using-git-worktrees). ⚠️ MAI junctionare `node_modules` nel worktree (incidente noto): usare `npm ci` nel worktree se servono i moduli.
- A fine lavoro: PR verso main (gh CLI disponibile), merge, push — Vercel deploya da main. Questo task NON tocca `tools/limitazioni-sync`, quindi non serve alcun riavvio/pull per l'agente.
- La memoria persistente da aggiornare a fine progetto: `produzione-economica-acea.md` (la vista ora include personale + presentazione).
