# Personale feriale + grafico esiti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nel modulo Produzione economica ACEA: giornate-uomo solo feriali (sabato a parte, domenica esclusa), card KPI «N op × M gg» con resa feriale, nuovo grafico % esiti sull'assegnato per operatore, Excel aggiornato.

**Architecture:** La logica resta in moduli PURI: `aggregaPersonale` viene esteso (split feriale/sabato/domenica, nuova firma a 4 argomenti) e nasce `aggregaEsiti` (conteggi positivi/negativi/non-lavorati per operatore). `load.ts` calcola gli split € feriale/sabato dalle righe di produzione già in memoria e raccoglie le righe-esito nel loop interventi esistente (nessuna query nuova). La UI presenta soltanto: card aggiornate, riga Sabati, nuovo componente `EsitiOperatore` condiviso tab+presentazione.

**Tech Stack:** Next.js 15, React client components, Recharts ^3.8.1 (`stackOffset="expand"` per le barre 100%), ExcelJS + JSZip, vitest. Nessuna dipendenza nuova.

**Spec di riferimento:** `docs/superpowers/specs/2026-07-02-personale-giorni-esiti-design.md`

## Global Constraints

- **Lingua italiana** per codice, commenti e copy UI.
- **Baseline lint/test ROSSA su main** (problemi pre-esistenti altrove): gate = "nessun NUOVO problema" — verifiche mirate (`npx tsc --noEmit` deve dare 0, `npx vitest run lib/produzione` tutto verde, `npx eslint <file toccati>` 0), MAI pretendere il verde globale.
- **NON toccare `tools/limitazioni-sync/`** (blindati).
- **Regole business vincolanti (dalla spec, verbatim)**: feriale = `getUTCDay ∈ {1..5}`; sabato (6) → aggregato separato `sabato { giornate, valore }`; domenica (0) → scartata ovunque nel blocco personale; la frazione giornaliera (ACEA lavorati / totale lavorati) NON cambia; `perOperatore[].valore` resta il TOTALE del periodo; la resa usa `valoreFeriale / giornate feriali` (numeratore e denominatore omogenei); base esiti = ogni riga interventi con committente effettivo `acea` e `staff_id` valorizzato, data nel range, SENZA dedup matricola e SENZA saracinesche da master.
- Per i prop SVG recharts usare SOLO i colori risolti di `useChartColors()` (mai stringhe `var(...)`).
- Import con alias `@/`. Next 15.
- Commit frequenti in italiano + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. **MAI `git push`/`git remote` dagli implementer.**

## File Structure

| File | Ruolo | Azione |
|---|---|---|
| `lib/produzione/aggregaPersonale.ts` (+`.test.ts`) | Split feriale/sabato/domenica, nuova firma, `valoreFeriale`+`sabato` | Modify (Task 1) |
| `lib/produzione/load.ts` | Split € feriale/sabato + righe esito + `esiti` nel payload | Modify (Task 1 + 2) |
| `lib/produzione/aggregaEsiti.ts` (+`.test.ts`) | PURO: conteggi esiti per operatore | Create (Task 2) |
| `components/modules/performance/economica/tipi.ts` | `DatiProduzione.esiti` | Modify (Task 2) |
| `components/modules/performance/economica/KpiDirezione.tsx` | Card «N op × M gg» + resa feriale | Modify (Task 3) |
| `components/modules/performance/economica/PersonaleImpegno.tsx` | Riga Sabati + nota feriale | Modify (Task 3) |
| `lib/produzione/exportExcel.ts` (+`.test.ts`) | Colonne esiti + riga Sabati + TOTALE feriale | Modify (Task 4) |
| `lib/produzione/excelInject.ts` (+`.test.ts`) | `fogliPersonale` idem | Modify (Task 4) |
| `components/modules/performance/palette.ts` | `useChartColors` espone `danger` risolto (additivo) | Modify (Task 5) |
| `components/modules/performance/economica/EsitiOperatore.tsx` | Nuovo grafico barre 100% | Create (Task 5) |
| `components/modules/performance/PerformanceEconomica.tsx` | Integra EsitiOperatore | Modify (Task 5) |
| `components/modules/performance/economica/PresentazioneProduzione.tsx` | Integra EsitiOperatore + footer aggiornato | Modify (Task 5) |

**Nota per il controller (non per gli implementer)**: primo commit nel worktree = `docs/superpowers/specs/2026-07-02-personale-giorni-esiti-design.md` + questo piano; subito dopo RIMUOVERE le copie untracked dal checkout principale (lezione PR #67: bloccano il `git pull` post-merge).

---

### Task 1: `aggregaPersonale` feriale + split € nel loader

**Files:**
- Modify: `lib/produzione/aggregaPersonale.ts`
- Modify: `lib/produzione/aggregaPersonale.test.ts`
- Modify: `lib/produzione/load.ts` (righe ~255-257 e ~344-361 attuali)

**Interfaces:**
- Consumes: `Aggregato` da `./aggregaProduzione` (`{ chiave, label, conteggio, valore }`).
- Produces (usati da Task 3, 4):
  - `function giornoSettimana(iso: string): number` (0=dom … 6=sab, UTC)
  - `PersonaleOperatore` acquisisce `valoreFeriale: number`; `resa = valoreFeriale/giornate`
  - `ProduzionePersonale` acquisisce `valoreFeriale: number` e `sabato: { giornate: number; valore: number }`
  - Nuova firma: `aggregaPersonale(righe: RigaLavoro[], euroPerOperatore: Aggregato[], euroFerialePerOperatore: Aggregato[], extra: { valoreFeriale: number; sabatoValore: number }): ProduzionePersonale`

- [ ] **Step 1: Aggiornare i test (falliranno)**

Sostituisci l'intero contenuto di `lib/produzione/aggregaPersonale.test.ts` con:

```typescript
import { describe, expect, it } from 'vitest';
import { aggregaPersonale, giornoSettimana, SOGLIA_DEDICATO, type RigaLavoro } from './aggregaPersonale';
import type { Aggregato } from './aggregaProduzione';

// 2026-06-01 = lunedì, 2026-06-05 = venerdì, 2026-06-06 = SABATO, 2026-06-07 = DOMENICA.
const r = (p: Partial<RigaLavoro>): RigaLavoro => ({
  staffId: 's1', operatore: 'ROSSI', data: '2026-06-01', acea: true, ...p,
});
const ZERO = { valoreFeriale: 0, sabatoValore: 0 };
const agg = (
  righe: RigaLavoro[],
  euro: Aggregato[] = [],
  euroFer: Aggregato[] = euro,
  extra: { valoreFeriale: number; sabatoValore: number } = ZERO,
) => aggregaPersonale(righe, euro, euroFer, extra);

describe('giornoSettimana', () => {
  it('riconosce lunedì/sabato/domenica in UTC', () => {
    expect(giornoSettimana('2026-06-01')).toBe(1);
    expect(giornoSettimana('2026-06-06')).toBe(6);
    expect(giornoSettimana('2026-06-07')).toBe(0);
  });
});

describe('aggregaPersonale', () => {
  it('insieme vuoto → zero giornate, nessun operatore, sabato a zero', () => {
    const p = agg([]);
    expect(p.totaleGiornate).toBe(0);
    expect(p.operatoriAttivi).toBe(0);
    expect(p.perOperatore).toEqual([]);
    expect(p.perGiorno).toEqual([]);
    expect(p.sabato).toEqual({ giornate: 0, valore: 0 });
    expect(p.valoreFeriale).toBe(0);
  });

  it('giornata piena ACEA feriale → frazione 1', () => {
    const p = agg([r({}), r({})], [{ chiave: 's1', label: 'ROSSI', conteggio: 2, valore: 100 }]);
    expect(p.totaleGiornate).toBe(1);
    expect(p.perOperatore[0]).toMatchObject({ chiave: 's1', giornate: 1, interventiAcea: 2, valore: 100 });
  });

  it('giornata mista → frazione proporzionale sui LAVORATI (2 ACEA su 10 → 0,2)', () => {
    const righe = [
      ...Array.from({ length: 2 }, () => r({ acea: true })),
      ...Array.from({ length: 8 }, () => r({ acea: false })),
    ];
    const p = agg(righe);
    expect(p.perOperatore[0].giornate).toBe(0.2);
    expect(p.perOperatore[0].interventiAcea).toBe(2);
  });

  it('giorno senza interventi ACEA → non conta (né giornate né perGiorno)', () => {
    const p = agg([r({ acea: false })]);
    expect(p.totaleGiornate).toBe(0);
    expect(p.perGiorno).toEqual([]);
  });

  it('SABATO → frazione in sabato.giornate, fuori da giornate/perGiorno/perOperatore', () => {
    const p = agg([r({ data: '2026-06-06' })]);
    expect(p.totaleGiornate).toBe(0);
    expect(p.perGiorno).toEqual([]);
    expect(p.perOperatore).toEqual([]); // operatore solo-sabato non è "attivo" feriale
    expect(p.sabato.giornate).toBe(1);
  });

  it('DOMENICA → scartata ovunque (nemmeno nel sabato)', () => {
    const p = agg([r({ data: '2026-06-07' })]);
    expect(p.totaleGiornate).toBe(0);
    expect(p.sabato.giornate).toBe(0);
    expect(p.perOperatore).toEqual([]);
  });

  it('sabato misto: solo la frazione ACEA finisce nel sabato', () => {
    const p = agg([r({ data: '2026-06-06', acea: true }), r({ data: '2026-06-06', acea: false })]);
    expect(p.sabato.giornate).toBe(0.5);
  });

  it('perGiorno separa dedicati (frazione ≥ 0,8) da saturazione', () => {
    const righe = [
      r({ staffId: 's1', data: '2026-06-01', acea: true }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01', acea: true }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01', acea: false }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01', acea: false }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01', acea: false }),
    ];
    const p = agg(righe);
    expect(p.perGiorno).toEqual([{ data: '2026-06-01', dedicate: 1, saturazione: 0.25, operatori: 2 }]);
    expect(SOGLIA_DEDICATO).toBe(0.8);
  });

  it('resa = valoreFeriale/giornate; valore resta il TOTALE; ordinamento per valore desc', () => {
    const righe = [
      r({ staffId: 's1', data: '2026-06-01' }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-01' }),
      r({ staffId: 's2', operatore: 'VERDI', data: '2026-06-02' }),
    ];
    const p = agg(
      righe,
      [
        { chiave: 's1', label: 'ROSSI', conteggio: 1, valore: 50 },
        { chiave: 's2', label: 'VERDI', conteggio: 2, valore: 300 },
      ],
      [
        { chiave: 's1', label: 'ROSSI', conteggio: 0, valore: 40 },
        { chiave: 's2', label: 'VERDI', conteggio: 0, valore: 200 },
      ],
    );
    expect(p.perOperatore.map((o) => o.chiave)).toEqual(['s2', 's1']);
    expect(p.perOperatore[0]).toMatchObject({ valore: 300, valoreFeriale: 200, resa: 100 }); // 200 € feriali / 2 gg
    expect(p.perOperatore[1]).toMatchObject({ valore: 50, valoreFeriale: 40, resa: 40 });
  });

  it('valoreFeriale e sabato.valore arrivano da extra, arrotondati a 2 decimali', () => {
    const p = agg([r({})], [], [], { valoreFeriale: 100.005, sabatoValore: 9.999 });
    expect(p.valoreFeriale).toBe(100.01);
    expect(p.sabato.valore).toBe(10);
  });

  it('righe senza staffId o senza data vengono scartate', () => {
    const p = agg([r({ staffId: '' }), r({ data: '' })]);
    expect(p.totaleGiornate).toBe(0);
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run lib/produzione/aggregaPersonale.test.ts`
Atteso: FAIL (giornoSettimana non esportata, firma a 2 argomenti, campi mancanti).

- [ ] **Step 3: Implementazione**

Sostituisci l'intero contenuto di `lib/produzione/aggregaPersonale.ts` con:

```typescript
// PURA: giornate-uomo ACEA per operatore e per giorno. Regola business (design 2026-07-02):
// una giornata vale la FRAZIONE di interventi ACEA lavorati sul totale lavorato nel giorno
// (gli operatori "doppio territorio" fanno ACEA a saturazione: la giornata intera gonfierebbe
// l'impegno). "Lavorato" = intervento con esito (positivo o negativo), non gli assegnati.
// Contano SOLO i giorni FERIALI (lun–ven): il sabato è un canale a parte (solo attivazioni,
// accantonato in `sabato`), la domenica non è lavorativa e si scarta del tutto.

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
  giornate: number; // somma frazioni nei giorni FERIALI (2 decimali)
  interventiAcea: number; // interventi ACEA lavorati nei giorni feriali
  valore: number; // € produzione TOTALE del periodo (riconciliabile con la card Produzione)
  valoreFeriale: number; // € produzione dei soli giorni feriali (numeratore della resa)
  resa: number | null; // €/giornata FERIALE (valoreFeriale/giornate; null se giornate=0)
}

export interface PersonaleGiorno {
  data: string;
  dedicate: number; // somma frazioni degli operatori con frazione ≥ SOGLIA_DEDICATO
  saturazione: number; // somma frazioni degli operatori con frazione < SOGLIA_DEDICATO
  operatori: number; // operatori con almeno 1 intervento ACEA nel giorno
}

export interface ProduzionePersonale {
  totaleGiornate: number; // solo feriali
  operatoriAttivi: number; // operatori con giornate feriali > 0
  valoreFeriale: number; // € produzione feriale complessiva (numeratore della resa KPI)
  sabato: { giornate: number; valore: number }; // canale attivazioni, mostrato a parte
  perOperatore: PersonaleOperatore[];
  perGiorno: PersonaleGiorno[]; // solo giorni feriali
}

export const SOGLIA_DEDICATO = 0.8;

/** Giorno della settimana di 'YYYY-MM-DD' in UTC: 0=domenica … 6=sabato. */
export function giornoSettimana(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function aggregaPersonale(
  righe: RigaLavoro[],
  euroPerOperatore: Aggregato[],
  euroFerialePerOperatore: Aggregato[],
  extra: { valoreFeriale: number; sabatoValore: number },
): ProduzionePersonale {
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
  let sabatoGiornate = 0;
  for (const c of celle.values()) {
    if (c.acea === 0) continue; // quel giorno l'operatore non ha toccato ACEA
    const gs = giornoSettimana(c.data);
    if (gs === 0) continue; // domenica: non lavorativa, scartata ovunque
    const frazione = c.acea / c.totale;
    if (gs === 6) {
      sabatoGiornate += frazione; // sabato: canale a parte (attivazioni)
      continue;
    }
    let op = perOp.get(c.staffId);
    if (!op) {
      op = { chiave: c.staffId, label: c.operatore, giornate: 0, interventiAcea: 0, valore: 0, valoreFeriale: 0, resa: null };
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
  const euroFer = new Map(euroFerialePerOperatore.map((e) => [e.chiave, e.valore]));
  for (const op of perOp.values()) {
    op.giornate = round2(op.giornate);
    op.valore = euro.get(op.chiave) ?? 0;
    op.valoreFeriale = round2(euroFer.get(op.chiave) ?? 0);
    op.resa = op.giornate > 0 ? round2(op.valoreFeriale / op.giornate) : null;
  }
  const perOperatore = [...perOp.values()].sort((a, b) => b.valore - a.valore || b.giornate - a.giornate);
  const perGiorno = [...perG.values()]
    .map((g) => ({ ...g, dedicate: round2(g.dedicate), saturazione: round2(g.saturazione) }))
    .sort((a, b) => (a.data < b.data ? -1 : 1));
  const totaleGiornate = round2(perOperatore.reduce((s, o) => s + o.giornate, 0));
  return {
    totaleGiornate,
    operatoriAttivi: perOperatore.length,
    valoreFeriale: round2(extra.valoreFeriale),
    sabato: { giornate: round2(sabatoGiornate), valore: round2(extra.sabatoValore) },
    perOperatore,
    perGiorno,
  };
}
```

- [ ] **Step 4: Verificare il verde del modulo**

Run: `npx vitest run lib/produzione/aggregaPersonale.test.ts`
Atteso: PASS (12 test).

- [ ] **Step 5: Aggiornare il call-site in `load.ts`**

In `lib/produzione/load.ts`:

1. Estendi due import in testa:

```typescript
import { aggregaPersonale, giornoSettimana, type ProduzionePersonale, type RigaLavoro } from './aggregaPersonale';
import { aggregaProduzione, deduplicaMassivePerMatricola, type Aggregato, type ProduzioneAggregata, type RigaProduzione } from './aggregaProduzione';
```

(la riga `import { aggregaPersonale, type ProduzionePersonale, type RigaLavoro } from './aggregaPersonale';` e quella di aggregaProduzione esistono già: aggiungi `giornoSettimana` e `type Aggregato`.)

2. Sostituisci la riga (attuale ~257):

```typescript
  const produzione = aggregaProduzione(deduplicaMassivePerMatricola(produzioneRighe));
```

con:

```typescript
  const righeDedup = deduplicaMassivePerMatricola(produzioneRighe);
  const produzione = aggregaProduzione(righeDedup);
```

3. Sostituisci la riga (attuale ~361):

```typescript
  const personale = aggregaPersonale(righeLavoro, produzione.perOperatore);
```

con:

```typescript
  // Split € feriale/sabato sulle stesse righe (dedup) della produzione: la resa deve essere
  // feriale/feriale (spec 2026-07-02); la domenica resta solo nel totale generale.
  const euroFer = new Map<string, number>();
  let valFeriale = 0;
  let valSabato = 0;
  for (const rp of righeDedup) {
    const gs = giornoSettimana(rp.data);
    if (gs >= 1 && gs <= 5) {
      valFeriale += rp.valore;
      if (rp.staffId) euroFer.set(rp.staffId, (euroFer.get(rp.staffId) ?? 0) + rp.valore);
    } else if (gs === 6) {
      valSabato += rp.valore;
    }
  }
  const euroFerialePerOperatore: Aggregato[] = [...euroFer.entries()].map(([chiave, v]) => ({
    chiave, label: chiave, conteggio: 0, valore: v,
  }));
  const personale = aggregaPersonale(righeLavoro, produzione.perOperatore, euroFerialePerOperatore, {
    valoreFeriale: valFeriale,
    sabatoValore: valSabato,
  });
```

- [ ] **Step 6: Verifica tipi e suite**

Run: `npx tsc --noEmit` → 0 errori.
Run: `npx vitest run lib/produzione` → tutti PASS (i test excel usano fixture con cast `as unknown as Dati`, quindi compilano; falliranno a runtime SOLO quando Task 4 leggerà i campi nuovi — per ora restano verdi).

- [ ] **Step 7: Commit**

```bash
git add lib/produzione/aggregaPersonale.ts lib/produzione/aggregaPersonale.test.ts lib/produzione/load.ts
git commit -m "feat(produzione-economica): giornate-uomo solo feriali, sabato a parte, resa feriale"
```

---

### Task 2: `aggregaEsiti` + raccolta righe esito nel loader

**Files:**
- Create: `lib/produzione/aggregaEsiti.ts`
- Test: `lib/produzione/aggregaEsiti.test.ts`
- Modify: `lib/produzione/load.ts` (loop interventi ~224-259 e ritorno)
- Modify: `components/modules/performance/economica/tipi.ts`

**Interfaces:**
- Consumes: `Aggregato` da `./aggregaProduzione`; nel loader: `esitoOkDaIntervento` (già usato), variabili `staffId/operatore/data/esitoOk` già calcolate nel loop.
- Produces (usati da Task 4, 5):
  - `interface RigaEsito { staffId: string; operatore: string; esitoOk: boolean | null }`
  - `interface EsitoOperatore { chiave: string; label: string; assegnati: number; positivi: number; negativi: number; nonLavorati: number; valore: number }`
  - `function aggregaEsiti(righe: RigaEsito[], euroPerOperatore: Aggregato[]): EsitoOperatore[]` (ordinati per `assegnati` desc, tie-break `valore` desc)
  - `ProduzioneEconomica`/`DatiProduzione` acquisiscono `esiti: EsitoOperatore[]`

- [ ] **Step 1: Scrivere il test che fallisce**

Crea `lib/produzione/aggregaEsiti.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { aggregaEsiti, type RigaEsito } from './aggregaEsiti';

const r = (p: Partial<RigaEsito>): RigaEsito => ({ staffId: 's1', operatore: 'ROSSI', esitoOk: true, ...p });

describe('aggregaEsiti', () => {
  it('insieme vuoto → nessun operatore', () => {
    expect(aggregaEsiti([], [])).toEqual([]);
  });

  it('conta positivi/negativi/non lavorati sull\'assegnato', () => {
    const righe = [
      r({ esitoOk: true }),
      r({ esitoOk: true }),
      r({ esitoOk: false }),
      r({ esitoOk: null }),
    ];
    const out = aggregaEsiti(righe, [{ chiave: 's1', label: 'ROSSI', conteggio: 2, valore: 500 }]);
    expect(out).toEqual([
      { chiave: 's1', label: 'ROSSI', assegnati: 4, positivi: 2, negativi: 1, nonLavorati: 1, valore: 500 },
    ]);
  });

  it('operatore senza € produzione → valore 0', () => {
    const out = aggregaEsiti([r({ esitoOk: null })], []);
    expect(out[0].valore).toBe(0);
    expect(out[0].nonLavorati).toBe(1);
  });

  it('ordina per assegnati desc, poi valore desc', () => {
    const righe = [
      r({ staffId: 'a', operatore: 'A' }),
      r({ staffId: 'b', operatore: 'B' }),
      r({ staffId: 'b', operatore: 'B' }),
      r({ staffId: 'c', operatore: 'C' }),
    ];
    const out = aggregaEsiti(righe, [
      { chiave: 'a', label: 'A', conteggio: 1, valore: 10 },
      { chiave: 'c', label: 'C', conteggio: 1, valore: 99 },
    ]);
    expect(out.map((o) => o.chiave)).toEqual(['b', 'c', 'a']);
  });

  it('righe senza staffId vengono scartate', () => {
    expect(aggregaEsiti([r({ staffId: '' })], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run lib/produzione/aggregaEsiti.test.ts`
Atteso: FAIL (modulo inesistente).

- [ ] **Step 3: Implementazione**

Crea `lib/produzione/aggregaEsiti.ts`:

```typescript
// PURA: esiti per operatore sulla base ASSEGNATA (design 2026-07-02). Base = ogni riga di
// `interventi` con committente effettivo 'acea' e operatore, nel range: positivi (eseguito ok),
// negativi (lavorato ko), non lavorati (mai chiusi — il fenomeno "saturazione" da mostrare alla
// dirigenza). Conteggio per RIGA, nessuna dedup per matricola: è una vista di carico, non di fatturato.

import type { Aggregato } from './aggregaProduzione';

export interface RigaEsito {
  staffId: string;
  operatore: string;
  esitoOk: boolean | null; // true=positivo, false=lavorato-negativo, null=assegnato mai lavorato
}

export interface EsitoOperatore {
  chiave: string; // staffId
  label: string; // display name
  assegnati: number; // positivi + negativi + nonLavorati
  positivi: number;
  negativi: number;
  nonLavorati: number;
  valore: number; // € produzione TOTALE dell'operatore nel periodo (stesso numero del grafico €)
}

export function aggregaEsiti(righe: RigaEsito[], euroPerOperatore: Aggregato[]): EsitoOperatore[] {
  const m = new Map<string, EsitoOperatore>();
  for (const r of righe) {
    if (!r.staffId) continue;
    let e = m.get(r.staffId);
    if (!e) {
      e = { chiave: r.staffId, label: r.operatore, assegnati: 0, positivi: 0, negativi: 0, nonLavorati: 0, valore: 0 };
      m.set(r.staffId, e);
    }
    e.assegnati += 1;
    if (r.esitoOk === true) e.positivi += 1;
    else if (r.esitoOk === false) e.negativi += 1;
    else e.nonLavorati += 1;
  }
  const euro = new Map(euroPerOperatore.map((e) => [e.chiave, e.valore]));
  for (const e of m.values()) e.valore = euro.get(e.chiave) ?? 0;
  return [...m.values()].sort((a, b) => b.assegnati - a.assegnati || b.valore - a.valore);
}
```

- [ ] **Step 4: Verificare il verde**

Run: `npx vitest run lib/produzione/aggregaEsiti.test.ts`
Atteso: PASS (5 test).

- [ ] **Step 5: Cablare il loader**

In `lib/produzione/load.ts`:

1. Import in testa:

```typescript
import { aggregaEsiti, type EsitoOperatore, type RigaEsito } from './aggregaEsiti';
```

2. In `ProduzioneEconomica`, dopo `personale: ProduzionePersonale;` aggiungi:

```typescript
  esiti: EsitoOperatore[];
```

3. Nel loop interventi: subito PRIMA della riga `const produzioneRighe: RigaProduzione[] = [];` (attuale ~224) aggiungi:

```typescript
  const righeEsito: RigaEsito[] = [];
```

e dentro il loop, subito DOPO il blocco `if (odl) { … }` (attuale ~241-249) e PRIMA del commento `// Produzione = positivo nel range`, aggiungi:

```typescript
    // Esiti sull'assegnato (design 2026-07-02): ogni riga ACEA con operatore nel range,
    // qualsiasi esito (anche mai lavorata). Niente dedup: vista di carico assegnato.
    if (staffId && data && data >= from && data <= to) {
      righeEsito.push({ staffId, operatore, esitoOk });
    }
```

4. Dopo la riga `const personale = aggregaPersonale(...);` (fine del blocco del Task 1) aggiungi:

```typescript
  const esiti = aggregaEsiti(righeEsito, produzione.perOperatore);
```

5. Aggiungi `esiti,` all'oggetto di ritorno (dopo `personale,`).

- [ ] **Step 6: Estendere `tipi.ts`**

In `components/modules/performance/economica/tipi.ts`:

```typescript
import type { EsitoOperatore } from '@/lib/produzione/aggregaEsiti';
```

e in `DatiProduzione`, dopo `personale: ProduzionePersonale;`:

```typescript
  esiti: EsitoOperatore[];
```

- [ ] **Step 7: Verifica**

Run: `npx tsc --noEmit` → 0 errori.
Run: `npx vitest run lib/produzione` → tutti PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/produzione/aggregaEsiti.ts lib/produzione/aggregaEsiti.test.ts lib/produzione/load.ts components/modules/performance/economica/tipi.ts
git commit -m "feat(produzione-economica): esiti per operatore sull'assegnato (aggregaEsiti nel payload)"
```

---

### Task 3: card KPI «N op × M gg» + riga Sabati

**Files:**
- Modify: `components/modules/performance/economica/KpiDirezione.tsx`
- Modify: `components/modules/performance/economica/PersonaleImpegno.tsx`

**Interfaces:**
- Consumes: `personale.totaleGiornate/operatoriAttivi/valoreFeriale/sabato` (Task 1); `eur`/`num` da `./tipi`.
- Produces: solo UI (nessun contratto nuovo).

- [ ] **Step 1: KpiDirezione — card personale e resa feriale**

In `components/modules/performance/economica/KpiDirezione.tsx` sostituisci le righe:

```tsx
  const giornate = dati.personale.totaleGiornate;
  const resa = giornate > 0 ? prod / giornate : null;
```

con:

```tsx
  const giornate = dati.personale.totaleGiornate;
  const resa = giornate > 0 ? dati.personale.valoreFeriale / giornate : null;
```

e le due card:

```tsx
      <Card titolo="Giornate-uomo" valore={num(giornate)} nota={`${num(dati.personale.operatoriAttivi)} operatori`} />
      <Card titolo="Resa €/giornata" valore={resa == null ? '—' : eur(resa)} nota="Produzione / giornate" />
```

con:

```tsx
      <Card
        titolo="Personale impiegato"
        valore={`${num(dati.personale.operatoriAttivi)} op × ${num(Math.round(giornate))} gg`}
        nota="giornate feriali lun–ven; giorni misti pro-quota"
      />
      <Card titolo="Resa €/giornata" valore={resa == null ? '—' : eur(resa)} nota="produzione feriale / giornate feriali" />
```

- [ ] **Step 2: PersonaleImpegno — nota feriale + riga Sabati**

In `components/modules/performance/economica/PersonaleImpegno.tsx`:

1. Sostituisci la nota metodologica (attuale ~63-65):

```tsx
        <p className="mt-1 text-[10px] text-[var(--brand-text-subtle)]">
          Giornate = quota di interventi ACEA lavorati sul totale lavorato nel giorno (gli assegnati non eseguiti non contano).
        </p>
```

con:

```tsx
        <p className="mt-1 text-[10px] text-[var(--brand-text-subtle)]">
          Giornate = quota di interventi ACEA lavorati sul totale lavorato nel giorno, nei soli giorni feriali lun–ven
          (gli assegnati non eseguiti non contano).
        </p>
```

2. Nella card di destra ("Impegno nel tempo"), subito dopo la chiusura del blocco condizionale del grafico (dopo `)}` che chiude l'empty-state/grafico, prima del `</div>` della card) aggiungi:

```tsx
        {(dati.personale.sabato.giornate > 0 || dati.personale.sabato.valore > 0) && (
          <p className="mt-1 text-[10px] text-[var(--brand-text-subtle)]">
            Sabati (attivazioni): {num(dati.personale.sabato.giornate)} gg · {eur(dati.personale.sabato.valore)} — esclusi da giornate e resa.
          </p>
        )}
```

- [ ] **Step 3: Verifica**

Run: `npx tsc --noEmit` → 0 errori.
Run: `npx eslint components/modules/performance/economica/KpiDirezione.tsx components/modules/performance/economica/PersonaleImpegno.tsx` → 0 errori.

- [ ] **Step 4: Commit**

```bash
git add components/modules/performance/economica/KpiDirezione.tsx components/modules/performance/economica/PersonaleImpegno.tsx
git commit -m "feat(produzione-economica): card Personale impiegato (op × gg feriali) + riga Sabati"
```

---

### Task 4: Excel — colonne esiti, riga Sabati, totale feriale (entrambe le vie)

**Files:**
- Modify: `lib/produzione/exportExcel.ts` (blocco "Dati - personale", attuale ~140-153)
- Modify: `lib/produzione/excelInject.ts` (`fogliPersonale`, attuale ~209-229)
- Modify: `lib/produzione/exportExcel.test.ts` (fixture + assert)
- Modify: `lib/produzione/excelInject.test.ts` (fixture + assert)

**Interfaces:**
- Consumes: `dati.personale` esteso (Task 1), `dati.esiti` (Task 2).
- Produces: foglio "Dati - personale" a 9 colonne (`Operatore, Giornate (feriali), Interventi ACEA, Produzione €, Resa €/gg, Assegnati, Positivi, Negativi, Non lavorati`) + riga `Sabati (attivazioni)` + riga `TOTALE (feriali)` con `valoreFeriale`.

- [ ] **Step 1: Aggiornare fixture e test (falliranno a runtime)**

In ENTRAMBI i file `lib/produzione/exportExcel.test.ts` e `lib/produzione/excelInject.test.ts`, nella fixture `dati`:

1. sostituisci il blocco `personale: { … }` con:

```typescript
  personale: {
    totaleGiornate: 1.5,
    operatoriAttivi: 1,
    valoreFeriale: 250,
    sabato: { giornate: 0.5, valore: 50 },
    perOperatore: [{ chiave: 's1', label: 'ROSSI', giornate: 1.5, interventiAcea: 3, valore: 300, valoreFeriale: 250, resa: 166.67 }],
    perGiorno: [{ data: '2026-06-01', dedicate: 1, saturazione: 0.5, operatori: 2 }],
  },
  esiti: [{ chiave: 's1', label: 'ROSSI', assegnati: 5, positivi: 3, negativi: 1, nonLavorati: 1, valore: 300 }],
```

2. In `exportExcel.test.ts`, sostituisci il test `include i fogli personale e SAL per giorno` con:

```typescript
  it('include i fogli personale (esiti + sabati) e SAL per giorno', async () => {
    const buf = await buildWorkbookProduzione(dati);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as ArrayBuffer);
    const pe = wb.getWorksheet('Dati - personale');
    expect(pe).toBeDefined();
    expect(pe!.getCell('A1').value).toBe('Operatore');
    expect(pe!.getCell('F1').value).toBe('Assegnati');
    expect(pe!.getCell('A2').value).toBe('ROSSI');
    expect(pe!.getCell('B2').value).toBe(1.5); // giornate feriali
    expect(pe!.getCell('E2').value).toBe(166.67); // resa feriale €/gg
    expect(pe!.getCell('F2').value).toBe(5); // assegnati
    expect(pe!.getCell('G2').value).toBe(3); // positivi
    expect(pe!.getCell('H2').value).toBe(1); // negativi
    expect(pe!.getCell('I2').value).toBe(1); // non lavorati
    expect(pe!.getCell('A3').value).toBe('Sabati (attivazioni)');
    expect(pe!.getCell('B3').value).toBe(0.5);
    expect(pe!.getCell('D3').value).toBe(50);
    expect(pe!.getCell('A4').value).toBe('TOTALE (feriali)');
    expect(pe!.getCell('D4').value).toBe(250); // valoreFeriale
    const sg = wb.getWorksheet('Dati - SAL giorni');
    expect(sg).toBeDefined();
    expect(sg!.getCell('A2').value).toBe('2026-06-01');
    expect(sg!.getCell('C2').value).toBe(200);
  });
```

3. In `excelInject.test.ts`, nel test `fogliPersonale mappa personale e SAL per giorno`, sostituisci gli assert con:

```typescript
    const fogli = fogliPersonale(dati);
    expect(fogli.map((f) => f.nome)).toEqual(['Dati - personale', 'Dati - SAL giorni']);
    expect(fogli[0].righe[0]).toEqual([
      'Operatore', 'Giornate (feriali)', 'Interventi ACEA', 'Produzione EUR', 'Resa EUR/gg',
      'Assegnati', 'Positivi', 'Negativi', 'Non lavorati',
    ]);
    expect(fogli[0].righe[1]).toEqual(['ROSSI', 1.5, 3, 300, 166.67, 5, 3, 1, 1]);
    expect(fogli[0].righe[2]).toEqual(['Sabati (attivazioni)', 0.5, '', 50, '', '', '', '', '']);
    expect(fogli[0].righe[3]).toEqual(['TOTALE (feriali)', 1.5, '', 250, '', '', '', '', '']);
    expect(fogli[1].righe[1]).toEqual(['2026-06-01', 2, 200]);
```

- [ ] **Step 2: Verificare che falliscano**

Run: `npx vitest run lib/produzione/exportExcel.test.ts lib/produzione/excelInject.test.ts`
Atteso: FAIL (colonne/righe nuove assenti).

- [ ] **Step 3: Implementare `exportExcel.ts`**

Sostituisci il blocco `// ── DATI: personale …` (dalla riga `const pe = wb.addWorksheet('Dati - personale');` fino a `peTot.eachCell(...);` inclusa) con:

```typescript
  const pe = wb.addWorksheet('Dati - personale');
  pe.columns = [{ width: 32 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 13 }];
  intestazione(pe.addRow(['Operatore', 'Giornate (feriali)', 'Interventi ACEA', 'Produzione €', 'Resa €/gg', 'Assegnati', 'Positivi', 'Negativi', 'Non lavorati']));
  const esitiByOp = new Map(dati.esiti.map((e) => [e.chiave, e]));
  for (const o of dati.personale.perOperatore) {
    const e = esitiByOp.get(o.chiave);
    const r = pe.addRow([o.label, o.giornate, o.interventiAcea, o.valore, o.resa ?? '', e?.assegnati ?? 0, e?.positivi ?? 0, e?.negativi ?? 0, e?.nonLavorati ?? 0]);
    r.getCell(4).numFmt = EUR;
    if (o.resa != null) r.getCell(5).numFmt = EUR;
  }
  const peSab = pe.addRow(['Sabati (attivazioni)', dati.personale.sabato.giornate, '', dati.personale.sabato.valore, '', '', '', '', '']);
  peSab.getCell(4).numFmt = EUR;
  const peTot = pe.addRow(['TOTALE (feriali)', dati.personale.totaleGiornate, '', dati.personale.valoreFeriale, '', '', '', '', '']);
  peTot.eachCell((c, col) => {
    c.font = { bold: true };
    if (col === 4) c.numFmt = EUR;
  });
```

- [ ] **Step 4: Implementare `fogliPersonale` in `excelInject.ts`**

Sostituisci il primo elemento dell'array in `fogliPersonale` (l'oggetto `nome: 'Dati - personale'`) con:

```typescript
    {
      nome: 'Dati - personale',
      righe: [
        ['Operatore', 'Giornate (feriali)', 'Interventi ACEA', 'Produzione EUR', 'Resa EUR/gg', 'Assegnati', 'Positivi', 'Negativi', 'Non lavorati'],
        ...dati.personale.perOperatore.map((o): Array<string | number> => {
          const e = dati.esiti.find((x) => x.chiave === o.chiave);
          return [o.label, o.giornate, o.interventiAcea, o.valore, o.resa ?? '', e?.assegnati ?? 0, e?.positivi ?? 0, e?.negativi ?? 0, e?.nonLavorati ?? 0];
        }),
        ['Sabati (attivazioni)', dati.personale.sabato.giornate, '', dati.personale.sabato.valore, '', '', '', '', ''],
        ['TOTALE (feriali)', dati.personale.totaleGiornate, '', dati.personale.valoreFeriale, '', '', '', '', ''],
      ],
    },
```

- [ ] **Step 5: Verificare il verde**

Run: `npx vitest run lib/produzione/exportExcel.test.ts lib/produzione/excelInject.test.ts` → PASS.
Run: `npx tsc --noEmit` → 0 errori.

- [ ] **Step 6: Commit**

```bash
git add lib/produzione/exportExcel.ts lib/produzione/excelInject.ts lib/produzione/exportExcel.test.ts lib/produzione/excelInject.test.ts
git commit -m "feat(produzione-economica): Excel personale con esiti, riga Sabati e totale feriale"
```

---

### Task 5: componente `EsitiOperatore` + integrazione tab e presentazione

**Files:**
- Modify: `components/modules/performance/palette.ts` (additivo: `danger`)
- Create: `components/modules/performance/economica/EsitiOperatore.tsx`
- Modify: `components/modules/performance/PerformanceEconomica.tsx` (dopo il blocco PersonaleImpegno, ~riga 172-175)
- Modify: `components/modules/performance/economica/PresentazioneProduzione.tsx` (sezione dopo PersonaleImpegno + footer)

**Interfaces:**
- Consumes: `dati.esiti: EsitoOperatore[]` (Task 2), `useChartColors()` (che acquisisce `danger`), `eur`/`num` da `./tipi`.
- Produces: `default function EsitiOperatore({ dati }: { dati: DatiProduzione })`.

- [ ] **Step 1: palette — aggiungere `danger` (stesso pattern di warning/success)**

In `components/modules/performance/palette.ts` (modifiche ADDITIVE nei 3 punti già esistenti):
1. In `interface ResolvedChartColors`: `/** Colore risolto per --danger (esiti negativi). */ danger: string;`
2. In `readTokens()`: `danger: resolve('--danger'),`
3. In `FALLBACK`: `danger: '#dc2626',`

- [ ] **Step 2: Creare `EsitiOperatore.tsx`**

Crea `components/modules/performance/economica/EsitiOperatore.tsx`:

```tsx
'use client';
import { Bar, BarChart, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { EsitoOperatore } from '@/lib/produzione/aggregaEsiti';
import { useChartColors, chartTooltipContent, chartItemStyle, chartLabelStyle } from '../palette';
import { eur, num, type DatiProduzione } from './tipi';

const MAX_OPERATORI = 12;

/** Esiti sull'ASSEGNATO per operatore: barre impilate al 100% (positivi/negativi/non lavorati)
 *  con la produzione € del periodo come etichetta. Base = ogni intervento ACEA assegnato. */
export default function EsitiOperatore({ dati }: { dati: DatiProduzione }) {
  const cc = useChartColors();
  const righe = dati.esiti.slice(0, MAX_OPERATORI);

  const pct = (v: number, tot: number) => (tot > 0 ? `${Math.round((v / tot) * 100)}%` : '0%');

  return (
    <div className="rounded-xl border border-[var(--brand-border)] p-3">
      <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Esiti sull'assegnato per operatore</h3>
      {righe.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Nessun dato nel periodo.</p>
      ) : (
        <div style={{ width: '100%', height: Math.max(200, righe.length * 34) }}>
          <ResponsiveContainer>
            <BarChart data={righe} layout="vertical" stackOffset="expand" margin={{ top: 4, right: 96, bottom: 4, left: 8 }}>
              <XAxis type="number" tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} tick={{ fill: cc.brandTextMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={130} tick={{ fill: cc.brandTextMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v, name, p) => {
                  const e = p?.payload as EsitoOperatore | undefined;
                  const n = Number(v);
                  return [`${num(n)} (${pct(n, e?.assegnati ?? 0)})`, String(name)];
                }}
                labelFormatter={(l, payload) => {
                  const e = payload?.[0]?.payload as EsitoOperatore | undefined;
                  return e ? `${l} — ${num(e.assegnati)} assegnati · ${eur(e.valore)}` : String(l);
                }}
                contentStyle={chartTooltipContent}
                itemStyle={chartItemStyle}
                labelStyle={chartLabelStyle}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="positivi" stackId="e" name="Positivi" fill={cc.success} />
              <Bar dataKey="negativi" stackId="e" name="Negativi" fill={cc.danger} />
              <Bar dataKey="nonLavorati" stackId="e" name="Non lavorati" fill={cc.brandTextMuted} radius={[0, 4, 4, 0]}>
                <LabelList dataKey="valore" position="right" formatter={(v: unknown) => eur(Number(v))} style={{ fill: cc.brandTextMuted, fontSize: 10 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-1 text-[10px] text-[var(--brand-text-subtle)]">
        Base = interventi ACEA assegnati nel periodo (positivi + negativi + mai lavorati). € = produzione del periodo.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Integrazione nella tab**

In `components/modules/performance/PerformanceEconomica.tsx`:
1. Import: `import EsitiOperatore from './economica/EsitiOperatore';` (accanto agli altri import `./economica/`).
2. Dopo il blocco:

```tsx
          {/* Personale impegnato */}
          <div className="mb-4">
            <PersonaleImpegno dati={dati} />
          </div>
```

aggiungi:

```tsx
          {/* Esiti sull'assegnato per operatore */}
          <div className="mb-4">
            <EsitiOperatore dati={dati} />
          </div>
```

- [ ] **Step 4: Integrazione nella presentazione**

In `components/modules/performance/economica/PresentazioneProduzione.tsx`:
1. Import: `import EsitiOperatore from './EsitiOperatore';`
2. Dopo la `<section>` di `PersonaleImpegno` aggiungi:

```tsx
            <section className="break-inside-avoid">
              <EsitiOperatore dati={dati} />
            </section>
```

3. Aggiorna il footer (attuale ~83-86) sostituendo la frase finale:

```tsx
            <p className="text-[10px] text-[var(--brand-text-subtle)]">
              Fonte: gestionale (interventi + snapshot master/portale ACEA). SAL = ordini COMPLETATI con causale di
              scostamento pagata (E%). Giornate-uomo = quota di interventi ACEA lavorati sul totale lavorato, nei soli
              giorni feriali lun–ven (sabato = attivazioni, mostrato a parte; domenica esclusa).
            </p>
```

- [ ] **Step 5: Verifica**

Run: `npx tsc --noEmit` → 0 errori.
Run: `npx eslint components/modules/performance/economica/EsitiOperatore.tsx components/modules/performance/PerformanceEconomica.tsx components/modules/performance/economica/PresentazioneProduzione.tsx components/modules/performance/palette.ts` → 0 errori.

- [ ] **Step 6: Commit**

```bash
git add components/modules/performance/palette.ts components/modules/performance/economica/EsitiOperatore.tsx components/modules/performance/PerformanceEconomica.tsx components/modules/performance/economica/PresentazioneProduzione.tsx
git commit -m "feat(produzione-economica): grafico esiti sull'assegnato per operatore (tab + presentazione)"
```

---

### Task 6: verifica finale end-to-end

**Files:** nessuna modifica prevista (solo fix di ciò che emerge).

- [ ] **Step 1: Gate statici completi**

Run: `npx tsc --noEmit` → 0 errori.
Run: `npx vitest run lib/produzione` → tutti PASS (inclusi i 12 di aggregaPersonale e i 5 di aggregaEsiti).
Run: `npx eslint components/modules/performance lib/produzione` → nessun errore NUOVO (baseline altrove rossa: contano i file toccati).

- [ ] **Step 2: Build**

Run: `npm run build`
Atteso: exit 0 (nel worktree serve `.env.local` copiato dal checkout principale — vedi nota controller; la build fallisce in "Collecting page data" senza env, su route pre-esistenti).

- [ ] **Step 3: Verifica numerica con dati reali (facoltativa ma consigliata)**

Come fatto per la verifica del 122,32: test scratch temporaneo che chiama `caricaProduzioneEconomica('2026-06-02','2026-07-02')` e stampa `personale.totaleGiornate` (atteso: ≤ 122,32 — i sabati escono), `personale.sabato`, `esiti` (Gioele NON deve comparire). RIMUOVERE il file scratch dopo la verifica.

- [ ] **Step 4: Commit di eventuali fix**

Fix mirati per ciò che emerge, poi commit.

---

## Note per l'esecuzione

- **Worktree da `origin/main`** (EnterWorktree nativo, base fresh). ⚠️ MAI junction di `node_modules`: `npm ci`. Copiare `.env.local` dal checkout principale per la build.
- **Primo commit nel worktree**: spec + questo piano (poi rimuovere le copie untracked dal checkout principale).
- Implementer: modello **sonnet** come floor (haiku ha confabulato in un task analogo — vedi ledger 02/07).
- Fine: PR verso main (squash, come #67), merge, pull nel checkout principale, pulizia worktree/branch.
