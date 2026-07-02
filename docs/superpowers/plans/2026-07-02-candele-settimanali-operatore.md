# Candele settimanali per operatore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nel modulo Produzione economica ACEA: nuovo grafico "a candele" — per ogni operatore, una riga di 7 barre (una per giorno di una settimana navigabile lunedì–domenica) che mostra quanti interventi ACEA aveva assegnati e come sono andati (positivo/negativo/mai lavorato), con l'€ prodotto (dedup matricola) nel tooltip.

**Architecture:** Nuovo modulo puro `aggregaCandele` (conteggio per-riga, NON normalizzato, sempre 7 giorni per operatore) + nuovo loader indipendente `loadCandele.ts` (query scoperta al range richiesto, NON condiviso con `caricaProduzioneEconomica`) + nuovo endpoint dedicato `GET /api/admin/acea/produzione/candele?from&to` + nuovo componente client `CandeleSettimanali.tsx` che — a differenza di tutti gli altri componenti di `economica/` — NON prende `dati` come prop: gestisce da solo stato-settimana e fetch, perché il filtro periodo è esplicitamente scollegato dal periodo (mensile/range) del resto della pagina. Prima di tutto questo, si estrae in `lib/produzione/settimana.ts` la logica "lunedì della settimana" già duplicata due volte (`serieTrend.ts` privata, `PersonaleImpegno.tsx` inline) — questa feature è il terzo consumatore, il trigger già segnalato come follow-up nella review finale della PR #68.

**Tech Stack:** Next.js 15, React client components, Recharts ^3.8.1 (barre impilate NON normalizzate, `stackId` condiviso, niente `stackOffset="expand"`), vitest. Nessuna dipendenza nuova, nessuna migrazione DB.

**Spec di riferimento:** `docs/superpowers/specs/2026-07-02-candele-settimanali-operatore-design.md`

## Global Constraints

- **Lingua italiana** per codice, commenti e copy UI.
- **Baseline lint/test ROSSA su main** (problemi pre-esistenti altrove): gate = "nessun NUOVO problema" — verifiche mirate (`npx tsc --noEmit` deve dare 0, `npx vitest run lib/produzione` tutto verde, `npx eslint <file toccati>` 0), MAI pretendere il verde globale.
- **NON toccare `tools/limitazioni-sync/`** (blindati).
- **Regole business vincolanti (dalla spec, verbatim)**:
  - Corpo della candela = **CONTEGGIO** (non €) di interventi ACEA assegnati quel giorno a quell'operatore, impilato in 3 segmenti REALI (positivi/negativi/non lavorati), **NON normalizzati al 100%** (a differenza di `aggregaEsiti`/`EsitiOperatore`): l'altezza deve variare col volume reale del giorno.
  - L'€ resta **SOLO nel tooltip**, mai come etichetta sempre visibile.
  - I 3 segmenti (conteggi) sono costruiti **SENZA dedup matricola, SENZA saracinesche master** — stessa regola di `aggregaEsiti` (vista di carico). L'€ nel tooltip è invece **DEDUP per matricola** — stessa regola della card Produzione (fatturato reale).
  - Filtro riga = `attivitaCanonica(...).committenteEff === 'acea' && attivo` — stesso filtro di produzione/esiti.
  - Periodo = settimana **lunedì–domenica ISO**, navigabile con frecce ← →, **MAI più di 7 giorni**; default = settimana che contiene "oggi".
  - Livello di aggregazione = **piccoli multipli**: TUTTI gli operatori insieme (nessun selettore singolo, nessun cap tipo `MAX_OPERATORI`).
  - Endpoint dedicato, fetch indipendente dal resto della pagina (il filtro periodo è scollegato dal periodo di pagina).
  - `CandeleSettimanali.tsx` NON prende `dati` come prop — eccezione voluta rispetto a tutti gli altri componenti di `economica/`, va documentata nel codice.
  - Presente in tab **e** presentazione, stesso componente; le frecce restano **cliccabili in presentazione** (unica eccezione interattiva — deroga esplicita alla regola "presentazione = sempre statica"). `print:hidden` va **solo sui due bottoni freccia**, MAI sull'etichetta "Settimana del …" (che deve continuare a comparire in stampa/PDF: "foto del momento e del filtro applicato").
  - Colori: riuso `cc.success` (verde) / `cc.danger` (rosso) / `cc.brandTextMuted` (grigio) da `useChartColors()` — nessun token nuovo.
- Per i prop SVG recharts usare SOLO i colori risolti di `useChartColors()` (mai stringhe `var(...)`).
- Import con alias `@/`. Next 15.
- Commit frequenti in italiano. **MAI `git push`/`git remote` dagli implementer.**

## File Structure

| File | Ruolo | Azione |
|---|---|---|
| `lib/produzione/settimana.ts` (+`.test.ts`) | PURO: `lunediSettimana` + `giorniSettimana` condivisi (estrazione DRY, 3° consumatore) | Create (Task 1) |
| `lib/produzione/serieTrend.ts` | Sostituisce la `lunediDi` privata con l'import da `settimana.ts` | Modify (Task 2) |
| `components/modules/performance/economica/PersonaleImpegno.tsx` | Sostituisce il calcolo inline del lunedì con l'import da `settimana.ts` | Modify (Task 2) |
| `lib/produzione/aggregaCandele.ts` (+`.test.ts`) | PURO: conteggi (non dedup) + € (dedup, dal loader) per operatore×giorno, sempre 7 giorni | Create (Task 3) |
| `lib/produzione/loadCandele.ts` | Loader indipendente: query scoperta al range, dedup matricola per l'€ | Create (Task 4) |
| `app/api/admin/acea/produzione/candele/route.ts` | `GET ?from&to`, `requireAdminPlus`, validazione ≤7 giorni | Create (Task 5) |
| `components/modules/performance/economica/CandeleSettimanali.tsx` | UI: piccoli multipli, frecce settimana, fetch autonomo (nessuna prop `dati`) | Create (Task 6) |
| `components/modules/performance/PerformanceEconomica.tsx` | Integra `CandeleSettimanali` dopo `EsitiOperatore` | Modify (Task 6) |
| `components/modules/performance/economica/PresentazioneProduzione.tsx` | Integra `CandeleSettimanali` (frecce interattive) dopo `EsitiOperatore` | Modify (Task 6) |

**Nota per il controller (non per gli implementer)**: primo commit nel worktree = `docs/superpowers/specs/2026-07-02-candele-settimanali-operatore-design.md` + questo piano; subito dopo RIMUOVERE le copie untracked dal checkout principale (lezione PR #67/#68: bloccano il `git pull` post-merge — verificare byte-per-byte prima di cancellare).

---

### Task 1: `lib/produzione/settimana.ts` — estrazione DRY

**Files:**
- Create: `lib/produzione/settimana.ts`
- Test: `lib/produzione/settimana.test.ts`

**Interfaces:**
- Consumes: nessuna dipendenza da altri moduli del progetto.
- Produces (usati da Task 2, 4, 6):
  - `function lunediSettimana(iso: string): string` — lunedì ISO della settimana di `iso` (UTC), stessa implementazione di `lunediDi` in `serieTrend.ts`.
  - `function giorniSettimana(lunedi: string): string[]` — le 7 date ISO da `lunedi` a `lunedi+6`.

- [ ] **Step 1: Scrivere il test che fallisce**

Crea `lib/produzione/settimana.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { lunediSettimana, giorniSettimana } from './settimana';

describe('lunediSettimana', () => {
  it('un lunedì restituisce se stesso', () => {
    expect(lunediSettimana('2026-06-01')).toBe('2026-06-01'); // 2026-06-01 è lunedì
  });

  it('un giorno infrasettimanale torna al lunedì della stessa settimana', () => {
    expect(lunediSettimana('2026-06-03')).toBe('2026-06-01'); // mercoledì
  });

  it('la domenica torna al lunedì precedente (6 giorni indietro)', () => {
    expect(lunediSettimana('2026-06-07')).toBe('2026-06-01');
  });
});

describe('giorniSettimana', () => {
  it('restituisce i 7 giorni da lunedì a domenica', () => {
    expect(giorniSettimana('2026-06-01')).toEqual([
      '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07',
    ]);
  });

  it('attraversa correttamente il cambio mese', () => {
    expect(giorniSettimana('2026-06-29')).toEqual([
      '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05',
    ]);
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run lib/produzione/settimana.test.ts`
Atteso: FAIL (modulo `./settimana` inesistente).

- [ ] **Step 3: Implementazione**

Crea `lib/produzione/settimana.ts`:

```typescript
// PURA: helper condivisi per calcoli "settimana lunedì–domenica" (ISO). Estratta perché usata da
// TRE consumatori indipendenti: serieTrend.ts (raggruppamento settimanale del trend), PersonaleImpegno
// (impegno nel tempo settimanale) e aggregaCandele/loadCandele (candele settimanali per operatore,
// design 2026-07-02) — terzo consumatore che ha motivato l'estrazione (già segnalata come follow-up
// nella review finale della PR #68).

/** Lunedì (ISO) della settimana di un giorno 'YYYY-MM-DD', calcolato in UTC. */
export function lunediSettimana(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const g = (d.getUTCDay() + 6) % 7; // 0=lunedì
  d.setUTCDate(d.getUTCDate() - g);
  return d.toISOString().slice(0, 10);
}

/** Le 7 date ISO da `lunedi` a `lunedi+6` (settimana lunedì–domenica). */
export function giorniSettimana(lunedi: string): string[] {
  const d = new Date(`${lunedi}T00:00:00Z`);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
```

- [ ] **Step 4: Verificare il verde**

Run: `npx vitest run lib/produzione/settimana.test.ts`
Atteso: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add lib/produzione/settimana.ts lib/produzione/settimana.test.ts
git commit -m "feat(produzione-economica): estrae lunediSettimana/giorniSettimana condivisi"
```

---

### Task 2: Sostituire le duplicazioni esistenti con `settimana.ts`

**Files:**
- Modify: `lib/produzione/serieTrend.ts`
- Modify: `components/modules/performance/economica/PersonaleImpegno.tsx`

**Interfaces:**
- Consumes: `lunediSettimana` da `./settimana` (Task 1).
- Produces: nessun contratto nuovo — refactor puro, stesso comportamento, verificato dai test esistenti (`serieTrend.test.ts`) invariati.

- [ ] **Step 1: `serieTrend.ts` — rimuovere la `lunediDi` privata**

In `lib/produzione/serieTrend.ts`, aggiungi l'import in testa (dopo l'import esistente di `Aggregato`):

```typescript
import type { Aggregato } from './aggregaProduzione';
import { lunediSettimana } from './settimana';
```

Rimuovi interamente il blocco:

```typescript
/** Lunedì (ISO) della settimana di un giorno 'YYYY-MM-DD'. */
function lunediDi(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const g = (d.getUTCDay() + 6) % 7; // 0=lunedì
  d.setUTCDate(d.getUTCDate() - g);
  return d.toISOString().slice(0, 10);
}
```

E in `raggruppaPerSettimana`, sostituisci `const k = lunediDi(g.chiave);` con:

```typescript
    const k = lunediSettimana(g.chiave);
```

- [ ] **Step 2: Verificare che i test esistenti restino verdi**

Run: `npx vitest run lib/produzione/serieTrend.test.ts`
Atteso: PASS (5 test, invariati — stesso algoritmo, solo import diverso).

- [ ] **Step 3: `PersonaleImpegno.tsx` — rimuovere il calcolo inline del lunedì**

In `components/modules/performance/economica/PersonaleImpegno.tsx`, aggiungi l'import (accanto agli altri import in testa):

```typescript
import { lunediSettimana } from '@/lib/produzione/settimana';
```

Nel blocco `impegno` (`useMemo`), sostituisci:

```typescript
    for (const x of g) {
      const d = new Date(`${x.data}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      const k = d.toISOString().slice(0, 10);
      const acc = m.get(k) ?? { chiave: k, dedicate: 0, saturazione: 0 };
      acc.dedicate += x.dedicate;
      acc.saturazione += x.saturazione;
      m.set(k, acc);
    }
```

con:

```typescript
    for (const x of g) {
      const k = lunediSettimana(x.data);
      const acc = m.get(k) ?? { chiave: k, dedicate: 0, saturazione: 0 };
      acc.dedicate += x.dedicate;
      acc.saturazione += x.saturazione;
      m.set(k, acc);
    }
```

- [ ] **Step 4: Verifica statica**

Run: `npx tsc --noEmit` → 0 errori.
Run: `npx eslint lib/produzione/serieTrend.ts components/modules/performance/economica/PersonaleImpegno.tsx` → 0 errori.
Run: `npx vitest run lib/produzione` → tutti PASS (nessuna regressione).

- [ ] **Step 5: Commit**

```bash
git add lib/produzione/serieTrend.ts components/modules/performance/economica/PersonaleImpegno.tsx
git commit -m "refactor(produzione-economica): usa lunediSettimana condivisa in serieTrend e PersonaleImpegno"
```

---

### Task 3: `lib/produzione/aggregaCandele.ts` — modulo puro

**Files:**
- Create: `lib/produzione/aggregaCandele.ts`
- Test: `lib/produzione/aggregaCandele.test.ts`

**Interfaces:**
- Consumes: nessuna dipendenza da altri moduli del progetto (tipi tutti locali).
- Produces (usati da Task 4, 6):
  - `interface RigaCandela { staffId: string; operatore: string; data: string; esitoOk: boolean | null; valoreDedup: number }`
  - `interface CandelaGiorno { data: string; positivi: number; negativi: number; nonLavorati: number; assegnati: number; valore: number }`
  - `interface CandelaOperatore { chiave: string; label: string; giorni: CandelaGiorno[] }`
  - `function aggregaCandele(righe: RigaCandela[], settimana: string[]): CandelaOperatore[]` — `giorni` ha SEMPRE `settimana.length` elementi nello stesso ordine di `settimana`; operatori ordinati per totale `assegnati` nella settimana, desc.

- [ ] **Step 1: Scrivere il test che fallisce**

Crea `lib/produzione/aggregaCandele.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { aggregaCandele, type RigaCandela } from './aggregaCandele';

const SETTIMANA = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'];

const r = (p: Partial<RigaCandela>): RigaCandela => ({
  staffId: 's1', operatore: 'ROSSI', data: '2026-06-01', esitoOk: true, valoreDedup: 0, ...p,
});

describe('aggregaCandele', () => {
  it('insieme vuoto → nessun operatore', () => {
    expect(aggregaCandele([], SETTIMANA)).toEqual([]);
  });

  it('un operatore ha sempre 7 giorni, anche a zero', () => {
    const out = aggregaCandele([r({})], SETTIMANA);
    expect(out).toHaveLength(1);
    expect(out[0].giorni).toHaveLength(7);
    expect(out[0].giorni.map((g) => g.data)).toEqual(SETTIMANA);
  });

  it('conta positivi/negativi/non lavorati per giorno', () => {
    const out = aggregaCandele([
      r({ data: '2026-06-01', esitoOk: true }),
      r({ data: '2026-06-01', esitoOk: true }),
      r({ data: '2026-06-01', esitoOk: false }),
      r({ data: '2026-06-02', esitoOk: null }),
    ], SETTIMANA);
    const lun = out[0].giorni.find((g) => g.data === '2026-06-01')!;
    expect(lun).toMatchObject({ positivi: 2, negativi: 1, nonLavorati: 0, assegnati: 3 });
    const mar = out[0].giorni.find((g) => g.data === '2026-06-02')!;
    expect(mar).toMatchObject({ positivi: 0, negativi: 0, nonLavorati: 1, assegnati: 1 });
  });

  it('somma valoreDedup per giorno, arrotondato a 2 decimali', () => {
    const out = aggregaCandele([
      r({ data: '2026-06-01', valoreDedup: 10.005 }),
      r({ data: '2026-06-01', valoreDedup: 5 }),
    ], SETTIMANA);
    expect(out[0].giorni[0].valore).toBe(15.01);
  });

  it('conteggi NON deduplicati, valore SÌ: 2 righe stesso caso dedup → assegnati=2, valore=1×prezzo', () => {
    // simula l'esito del loader dopo deduplicaMassivePerMatricola: la riga "vincitrice" porta il
    // valore, l'altra resta a 0 pur essendo un esito positivo reale (criterio di accettazione #2).
    const out = aggregaCandele([
      r({ data: '2026-06-01', esitoOk: true, valoreDedup: 50 }),
      r({ data: '2026-06-03', esitoOk: true, valoreDedup: 0 }),
    ], SETTIMANA);
    const tot = out[0].giorni.reduce((s, g) => s + g.assegnati, 0);
    const val = out[0].giorni.reduce((s, g) => s + g.valore, 0);
    expect(tot).toBe(2);
    expect(val).toBe(50);
  });

  it('riga con staffId vuoto viene scartata', () => {
    expect(aggregaCandele([r({ staffId: '' })], SETTIMANA)).toEqual([]);
  });

  it('riga con data fuori dalla settimana viene ignorata', () => {
    expect(aggregaCandele([r({ data: '2026-05-31' })], SETTIMANA)).toEqual([]);
  });

  it('ordina gli operatori per totale assegnati desc', () => {
    const out = aggregaCandele([
      r({ staffId: 'a', operatore: 'A', data: '2026-06-01' }),
      r({ staffId: 'b', operatore: 'B', data: '2026-06-01' }),
      r({ staffId: 'b', operatore: 'B', data: '2026-06-02' }),
    ], SETTIMANA);
    expect(out.map((o) => o.chiave)).toEqual(['b', 'a']);
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run lib/produzione/aggregaCandele.test.ts`
Atteso: FAIL (modulo `./aggregaCandele` inesistente).

- [ ] **Step 3: Implementazione**

Crea `lib/produzione/aggregaCandele.ts`:

```typescript
// PURA: candele settimanali per operatore (design 2026-07-02). Corpo = CONTEGGIO (non €) di
// interventi ACEA assegnati quel giorno a quell'operatore, impilato in 3 segmenti reali
// (positivi/negativi/non lavorati) — NON normalizzato al 100% (a differenza di aggregaEsiti):
// l'altezza deve variare col volume reale del giorno. L'€ (dedup matricola, calcolato dal loader)
// resta solo nel tooltip, mai come segmento/etichetta sempre visibile.

export interface RigaCandela {
  staffId: string;
  operatore: string;
  data: string; // 'YYYY-MM-DD'
  esitoOk: boolean | null;
  valoreDedup: number; // € SOLO se la riga sopravvive al dedup matricola, 0 altrimenti
}

export interface CandelaGiorno {
  data: string;
  positivi: number;
  negativi: number;
  nonLavorati: number;
  assegnati: number;
  valore: number;
}

export interface CandelaOperatore {
  chiave: string; // staffId
  label: string; // display name
  giorni: CandelaGiorno[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** `settimana` = i 7 giorni ISO: garantisce sempre `settimana.length` CandelaGiorno per operatore,
 *  nello stesso ordine, anche nei giorni a zero (niente buchi nell'asse X). */
export function aggregaCandele(righe: RigaCandela[], settimana: string[]): CandelaOperatore[] {
  const indiceGiorno = new Map(settimana.map((data, i) => [data, i]));
  const m = new Map<string, CandelaOperatore>();
  for (const r of righe) {
    if (!r.staffId) continue;
    const idx = indiceGiorno.get(r.data);
    if (idx === undefined) continue; // data fuori dalla settimana richiesta
    let op = m.get(r.staffId);
    if (!op) {
      op = {
        chiave: r.staffId,
        label: r.operatore,
        giorni: settimana.map((data) => ({ data, positivi: 0, negativi: 0, nonLavorati: 0, assegnati: 0, valore: 0 })),
      };
      m.set(r.staffId, op);
    }
    const giorno = op.giorni[idx];
    giorno.assegnati += 1;
    if (r.esitoOk === true) giorno.positivi += 1;
    else if (r.esitoOk === false) giorno.negativi += 1;
    else giorno.nonLavorati += 1;
    giorno.valore = round2(giorno.valore + r.valoreDedup);
  }
  return [...m.values()].sort((a, b) => {
    const totA = a.giorni.reduce((s, g) => s + g.assegnati, 0);
    const totB = b.giorni.reduce((s, g) => s + g.assegnati, 0);
    return totB - totA;
  });
}
```

- [ ] **Step 4: Verificare il verde**

Run: `npx vitest run lib/produzione/aggregaCandele.test.ts`
Atteso: PASS (8 test).

- [ ] **Step 5: Commit**

```bash
git add lib/produzione/aggregaCandele.ts lib/produzione/aggregaCandele.test.ts
git commit -m "feat(produzione-economica): aggregaCandele — conteggi+valore per operatore×giorno"
```

---

### Task 4: `lib/produzione/loadCandele.ts` — loader indipendente

**Files:**
- Create: `lib/produzione/loadCandele.ts`

**Interfaces:**
- Consumes: `esitoOkDaIntervento` da `@/lib/limitazione/exportLimMassive`; `prezzoPerData`/`valoreRiga`/`ListinoRiga` da `./valorizza`; `attivitaCanonica` da `./attivitaCanonica`; `caricaAliasAttivita` da `./aliasAttivita`; `deduplicaMassivePerMatricola`/`RigaProduzione` da `./aggregaProduzione`; `aggregaCandele`/`CandelaOperatore`/`RigaCandela` da `./aggregaCandele` (Task 3); `giorniSettimana` da `./settimana` (Task 1); `supabaseAdmin` da `@/lib/supabaseAdmin`.
- Produces (usato da Task 5): `function caricaCandeleSettimanali(from: string, to: string): Promise<{ from: string; to: string; operatori: CandelaOperatore[] }>`.

Nessun test dedicato per questo file: è un loader `server-only` che interroga Supabase, stesso pattern (non testato direttamente) di `lib/produzione/load.ts`. La correttezza numerica si verifica nel Task 7 con dati reali.

- [ ] **Step 1: Creare il file**

Crea `lib/produzione/loadCandele.ts`:

```typescript
import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { esitoOkDaIntervento } from '@/lib/limitazione/exportLimMassive';
import { prezzoPerData, valoreRiga, type ListinoRiga } from './valorizza';
import { attivitaCanonica } from './attivitaCanonica';
import { caricaAliasAttivita } from './aliasAttivita';
import { deduplicaMassivePerMatricola, type RigaProduzione } from './aggregaProduzione';
import { aggregaCandele, type CandelaOperatore, type RigaCandela } from './aggregaCandele';
import { giorniSettimana } from './settimana';

// Loader indipendente per le "candele settimanali per operatore" (design 2026-07-02): query
// scoperta al range richiesto (≤7 giorni), NON condivisa con caricaProduzioneEconomica (loader
// principale) per non accoppiare i due payload — il filtro periodo qui è esplicitamente
// scollegato dal periodo di pagina.

const PAGE = 1000;
// Stessa lista di caricaProduzioneEconomica in load.ts: duplicata qui (2 elementi soli, non vale
// la pena importarla e accoppiare i due loader).
const COMMITTENTI = ['acea', 'lim_massive'];

interface InterventoRow {
  id: string;
  odl: string | null;
  data: string | null;
  staff_id: string | null;
  intervento_tipo: string | null;
  esito: string | null;
  stato: string | null;
  committente: string | null;
  comune: string | null;
  matricola_contatore: string | null;
}

/** Giorno successivo di 'YYYY-MM-DD' (bound esclusivo per query robuste a date/timestamp). */
function giornoDopo(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function caricaInterventiSettimana(from: string, to: string): Promise<InterventoRow[]> {
  const rows: InterventoRow[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('id, odl, data, staff_id, intervento_tipo, esito, stato, committente, comune, matricola_contatore')
      .in('committente', COMMITTENTI)
      .gte('data', from)
      .lt('data', giornoDopo(to))
      .order('id', { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as InterventoRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

export async function caricaCandeleSettimanali(
  from: string,
  to: string,
): Promise<{ from: string; to: string; operatori: CandelaOperatore[] }> {
  const [listinoRes, interventi, staffRes, alias] = await Promise.all([
    supabaseAdmin.from('acea_listino').select('id, attivita, prezzo, valido_dal, valido_al, attivo').eq('committente', 'acea'),
    caricaInterventiSettimana(from, to),
    supabaseAdmin.from('staff').select('id, display_name'),
    caricaAliasAttivita(),
  ]);
  if (listinoRes.error) throw listinoRes.error;
  if (staffRes.error) throw staffRes.error;

  const listino: ListinoRiga[] = ((listinoRes.data ?? []) as Array<{
    id: string;
    attivita: string | null;
    prezzo: number;
    valido_dal: string;
    valido_al: string | null;
    attivo: boolean;
  }>)
    .filter((r) => r.attivita)
    .map((r) => ({
      id: r.id,
      attivita: r.attivita as string,
      prezzo: Number(r.prezzo),
      valido_dal: r.valido_dal,
      valido_al: r.valido_al,
      attivo: r.attivo,
    }));

  const staff = new Map<string, string>();
  for (const r of (staffRes.data ?? []) as Array<{ id: string; display_name: string | null }>) {
    staff.set(r.id, (r.display_name ?? '').trim() || 'Operatore');
  }

  const valore = (attivitaKey: string, data: string): number => {
    if (!attivitaKey) return 0;
    const sel = prezzoPerData(listino, attivitaKey, data);
    return sel ? valoreRiga(sel.prezzo) : 0;
  };

  const righeCandela: RigaCandela[] = [];
  const temporanee: RigaProduzione[] = [];
  // Object identity come chiave: deduplicaMassivePerMatricola filtra (out.push(r)) senza clonare,
  // quindi le righe sopravvissute sono LE STESSE referenze passate in `temporanee`.
  const candelaPerTemp = new Map<RigaProduzione, RigaCandela>();

  for (const it of interventi) {
    const canon = attivitaCanonica(it.committente, it.intervento_tipo, it.comune, alias);
    if (!canon || !canon.attivo || canon.committenteEff !== 'acea') continue;
    const staffId = it.staff_id ?? '';
    const data = (it.data ?? '').slice(0, 10);
    if (!staffId || !data) continue; // riga senza operatore o senza data (stesso pattern di aggregaEsiti/aggregaPersonale)
    const operatore = staff.get(staffId) ?? 'Sconosciuto';
    const esitoOk = esitoOkDaIntervento(it.stato, it.esito);

    const rigaCandela: RigaCandela = { staffId, operatore, data, esitoOk, valoreDedup: 0 };
    righeCandela.push(rigaCandela);

    // Solo le positive entrano nel dedup matricola (casi limite della spec): il conteggio sopra
    // resta corretto su OGNI riga, il dedup decide solo CHI porta l'€.
    if (esitoOk === true) {
      const temp: RigaProduzione = {
        odl: (it.odl ?? '').trim(),
        voce: null,
        kpi: null,
        attivitaKey: canon.attivitaKey,
        attivitaLabel: canon.attivitaPulita,
        matricola: it.matricola_contatore ?? '',
        data,
        staffId,
        operatore,
        territorioId: '',
        territorio: '',
        valore: valore(canon.attivitaKey, data),
      };
      temporanee.push(temp);
      candelaPerTemp.set(temp, rigaCandela);
    }
  }

  for (const sopravvissuta of deduplicaMassivePerMatricola(temporanee)) {
    const rigaCandela = candelaPerTemp.get(sopravvissuta);
    if (rigaCandela) rigaCandela.valoreDedup = sopravvissuta.valore;
  }

  const settimana = giorniSettimana(from);
  const operatori = aggregaCandele(righeCandela, settimana);
  return { from, to, operatori };
}
```

- [ ] **Step 2: Verifica statica**

Run: `npx tsc --noEmit` → 0 errori.
Run: `npx eslint lib/produzione/loadCandele.ts` → 0 errori.

- [ ] **Step 3: Commit**

```bash
git add lib/produzione/loadCandele.ts
git commit -m "feat(produzione-economica): loadCandele — loader indipendente per le candele settimanali"
```

---

### Task 5: `app/api/admin/acea/produzione/candele/route.ts` — endpoint

**Files:**
- Create: `app/api/admin/acea/produzione/candele/route.ts`

**Interfaces:**
- Consumes: `requireAdminPlus` da `@/lib/apiAuth`; `caricaCandeleSettimanali` da `@/lib/produzione/loadCandele` (Task 4).
- Produces (usato da Task 6): `GET /api/admin/acea/produzione/candele?from=YYYY-MM-DD&to=YYYY-MM-DD` → `200 { from, to, operatori }` oppure `400 { error }` (formato o intervallo) oppure `401/403` (auth, gestiti da `requireAdminPlus`) oppure `500 { error }`.

Nessun test dedicato: stesso pattern (route non testate direttamente) di `app/api/admin/acea/produzione/route.ts`. La validazione si verifica manualmente nel Task 7.

- [ ] **Step 1: Creare il file**

Crea `app/api/admin/acea/produzione/candele/route.ts`:

```typescript
import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdminPlus } from '@/lib/apiAuth';
import { caricaCandeleSettimanali } from '@/lib/produzione/loadCandele';

export const runtime = 'nodejs';

const MAX_GIORNI = 6; // (to - from) massimo consentito: 7 giorni inclusi

/** GET ?from&to (YYYY-MM-DD, intervallo ≤7 giorni): candele settimanali per operatore (design 2026-07-02). */
export async function GET(req: Request) {
  const auth = await requireAdminPlus();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from/to obbligatori (YYYY-MM-DD).' }, { status: 400 });
  }
  const diffGiorni = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
  if (diffGiorni < 0 || diffGiorni > MAX_GIORNI) {
    return NextResponse.json({ error: `Intervallo massimo ${MAX_GIORNI + 1} giorni (from..to).` }, { status: 400 });
  }

  try {
    const dati = await caricaCandeleSettimanali(from, to);
    return NextResponse.json(dati, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore candele settimanali.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verifica statica**

Run: `npx tsc --noEmit` → 0 errori.
Run: `npx eslint app/api/admin/acea/produzione/candele/route.ts` → 0 errori.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/acea/produzione/candele/route.ts
git commit -m "feat(produzione-economica): endpoint GET candele settimanali per operatore"
```

---

### Task 6: `CandeleSettimanali.tsx` + integrazione tab e presentazione

**Files:**
- Modify: `components/modules/performance/PerformanceEconomica.tsx`
- Modify: `components/modules/performance/economica/PresentazioneProduzione.tsx`
- Create: `components/modules/performance/economica/CandeleSettimanali.tsx`

**Interfaces:**
- Consumes: `lunediSettimana`/`giorniSettimana` da `@/lib/produzione/settimana` (Task 1); `type CandelaGiorno`/`CandelaOperatore` da `@/lib/produzione/aggregaCandele` (Task 3); `useChartColors`/`chartTooltipContent`/`chartItemStyle`/`chartLabelStyle` da `../palette`; `eur`/`num`/`giornoIT` da `./tipi`; `Button` da `@/components/Button`; endpoint `GET /api/admin/acea/produzione/candele?from&to` (Task 5).
- Produces: `export default function CandeleSettimanali()` — **nessuna prop** (eccezione voluta, documentata nel JSDoc del componente).

- [ ] **Step 1: Creare `CandeleSettimanali.tsx`**

Crea `components/modules/performance/economica/CandeleSettimanali.tsx`:

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Button from '@/components/Button';
import { giorniSettimana, lunediSettimana } from '@/lib/produzione/settimana';
import type { CandelaGiorno, CandelaOperatore } from '@/lib/produzione/aggregaCandele';
import { useChartColors, chartTooltipContent, chartItemStyle, chartLabelStyle } from '../palette';
import { eur, num, giornoIT } from './tipi';

interface RispostaCandele {
  from: string;
  to: string;
  operatori: CandelaOperatore[];
}

const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

/** Sposta una data ISO 'YYYY-MM-DD' di `n` giorni (UTC). */
function spostaGiorni(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Candele settimanali per operatore (design 2026-07-02). A differenza degli altri componenti di
 * `economica/`, NON prende `dati` come prop: gestisce da solo stato-settimana e fetch, perché il
 * filtro periodo è esplicitamente scollegato dal periodo (mensile/range) del resto della pagina.
 */
export default function CandeleSettimanali() {
  const cc = useChartColors();
  const [lunedi, setLunedi] = useState(() => lunediSettimana(new Date().toISOString().slice(0, 10)));
  const [dati, setDati] = useState<RispostaCandele | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const giorni = useMemo(() => giorniSettimana(lunedi), [lunedi]);
  const to = giorni[6];

  useEffect(() => {
    let vivo = true;
    setDati(null);
    setErrore(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/acea/produzione/candele?from=${lunedi}&to=${to}`, { cache: 'no-store' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
        if (vivo) setDati((await res.json()) as RispostaCandele);
      } catch (e) {
        if (vivo) setErrore(e instanceof Error ? e.message : 'Errore caricamento.');
      }
    })();
    return () => {
      vivo = false;
    };
  }, [lunedi, to]);

  return (
    <div className="rounded-xl border border-[var(--brand-border)] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium text-[var(--brand-text-main)]">Candele settimanali per operatore</h3>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 py-0 text-xs print:hidden"
            onClick={() => setLunedi((l) => spostaGiorni(l, -7))}
            aria-label="Settimana precedente"
          >
            ←
          </Button>
          <span className="text-xs text-[var(--brand-text-muted)]">
            Settimana del {giornoIT(giorni[0])} – {giornoIT(giorni[6])}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 py-0 text-xs print:hidden"
            onClick={() => setLunedi((l) => spostaGiorni(l, 7))}
            aria-label="Settimana successiva"
          >
            →
          </Button>
        </div>
      </div>

      {errore && <p className="text-sm text-[var(--danger)]">{errore}</p>}
      {!dati && !errore && <p className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Carico i dati…</p>}

      {dati && dati.operatori.length === 0 && (
        <p className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Nessun operatore con attività ACEA in questa settimana.</p>
      )}

      {dati && dati.operatori.length > 0 && (
        <div className="space-y-2">
          {dati.operatori.map((op) => (
            <div key={op.chiave} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-xs text-[var(--brand-text-muted)]" title={op.label}>
                {op.label}
              </span>
              <div style={{ width: '100%', height: 40 }}>
                <ResponsiveContainer>
                  <BarChart data={op.giorni} margin={{ top: 2, right: 4, bottom: 2, left: 4 }} barCategoryGap="20%">
                    <XAxis
                      dataKey="data"
                      tickFormatter={(_v, i) => GIORNI_BREVI[i] ?? ''}
                      tick={{ fill: cc.brandTextMuted, fontSize: 9 }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis hide domain={[0, 'auto']} />
                    <Tooltip
                      formatter={(v, name) => [num(Number(v)), String(name)]}
                      labelFormatter={(l, payload) => {
                        const g = payload?.[0]?.payload as CandelaGiorno | undefined;
                        if (!g) return String(l);
                        const idx = giorni.indexOf(g.data);
                        const nomeGiorno = idx >= 0 ? GIORNI_BREVI[idx] : '';
                        return `${nomeGiorno} ${giornoIT(g.data)} — ${num(g.assegnati)} assegnati · ${eur(g.valore)}`;
                      }}
                      contentStyle={chartTooltipContent}
                      itemStyle={chartItemStyle}
                      labelStyle={chartLabelStyle}
                    />
                    <Bar dataKey="positivi" stackId="c" name="Positivi" fill={cc.success} />
                    <Bar dataKey="negativi" stackId="c" name="Negativi" fill={cc.danger} />
                    <Bar dataKey="nonLavorati" stackId="c" name="Non lavorati" fill={cc.brandTextMuted} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-1 text-[10px] text-[var(--brand-text-subtle)]">
        Altezza = interventi ACEA assegnati (positivi + negativi + mai lavorati) per giorno, NON normalizzata.
        € nel tooltip = produzione dedup per matricola.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Integrazione nella tab**

In `components/modules/performance/PerformanceEconomica.tsx`:

1. Import (accanto agli altri import `./economica/`):

```tsx
import CandeleSettimanali from './economica/CandeleSettimanali';
```

2. Dopo il blocco:

```tsx
          {/* Esiti sull'assegnato per operatore */}
          <div className="mb-4">
            <EsitiOperatore dati={dati} />
          </div>
```

aggiungi:

```tsx
          {/* Candele settimanali per operatore (settimana navigabile, filtro indipendente dal periodo di pagina) */}
          <div className="mb-4">
            <CandeleSettimanali />
          </div>
```

- [ ] **Step 3: Integrazione nella presentazione**

In `components/modules/performance/economica/PresentazioneProduzione.tsx`:

1. Import:

```tsx
import CandeleSettimanali from './CandeleSettimanali';
```

2. Dopo la `<section>` di `EsitiOperatore` aggiungi:

```tsx
            <section className="break-inside-avoid">
              <CandeleSettimanali />
            </section>
```

- [ ] **Step 4: Verifica statica**

Run: `npx tsc --noEmit` → 0 errori.
Run: `npx eslint components/modules/performance/economica/CandeleSettimanali.tsx components/modules/performance/PerformanceEconomica.tsx components/modules/performance/economica/PresentazioneProduzione.tsx` → 0 errori.

- [ ] **Step 5: Commit**

```bash
git add components/modules/performance/economica/CandeleSettimanali.tsx components/modules/performance/PerformanceEconomica.tsx components/modules/performance/economica/PresentazioneProduzione.tsx
git commit -m "feat(produzione-economica): grafico candele settimanali per operatore (tab + presentazione)"
```

---

### Task 7: verifica finale end-to-end

**Files:** nessuna modifica prevista (solo fix di ciò che emerge).

- [ ] **Step 1: Gate statici completi**

Run: `npx tsc --noEmit` → 0 errori.
Run: `npx vitest run lib/produzione` → tutti PASS (inclusi i 5 di `settimana.test.ts` e gli 8 di `aggregaCandele.test.ts`).
Run: `npx eslint components/modules/performance lib/produzione app/api/admin/acea/produzione` → nessun errore NUOVO (baseline altrove rossa: contano i file toccati).

- [ ] **Step 2: Build**

Run: `npm run build`
Atteso: exit 0 (nel worktree serve `.env.local` copiato dal checkout principale — la build fallisce in "Collecting page data" senza env, su route pre-esistenti).

- [ ] **Step 3: Verifica numerica con dati reali**

Scratch test temporaneo (pattern già usato per PR #67/#68): importa `caricaCandeleSettimanali` con env caricato da `.env.local`, chiama con la settimana corrente (es. `caricaCandeleSettimanali('<lunedì corrente>', '<lunedì+6>')`), verifica:
- ogni `operatori[].giorni` ha esattamente 7 elementi;
- il totale `assegnati` della settimana per operatore è coerente con un conteggio manuale via Supabase MCP (query diretta su `interventi` filtrata committente/data/staff, stesso filtro `attivitaCanonica`);
- la somma di `valore` su tutti gli operatori/giorni della settimana è ≤ alla produzione totale della stessa settimana in `caricaProduzioneEconomica` (mai di più: il dedup può solo ridurre, mai aumentare).

RIMUOVERE il file scratch dopo la verifica.

- [ ] **Step 4: Verifica manuale in browser**

Con il dev server avviato (`npm run dev` o preview) e una sessione admin_plus già autenticata nel browser: aprire `/hub/performance` → tab Produzione economica ACEA, scorrere fino a "Candele settimanali per operatore":
- confermare che compaiono le barre impilate per ciascun operatore, 7 giorni ciascuna;
- cliccare ← e → e verificare che l'etichetta "Settimana del …" cambi di 7 giorni per volta e il lunedì resti sempre un lunedì;
- passare il mouse su una barra e verificare che il tooltip mostri giorno esteso, conteggi ed €;
- aprire `/presentazione/produzione-acea` e verificare che il grafico compaia anche lì, con le frecce ancora cliccabili (uniche interattive della pagina);
- nella stessa scheda browser (sessione autenticata), navigare direttamente a `/api/admin/acea/produzione/candele?from=2026-06-01&to=2026-06-20` (intervallo di 19 giorni) e verificare `400` con il messaggio "Intervallo massimo 7 giorni (from..to)."; poi a `/api/admin/acea/produzione/candele?from=2026-06-01&to=2026-06-07` (7 giorni esatti) e verificare `200` con `operatori[].giorni` a 7 elementi.

- [ ] **Step 5: Commit di eventuali fix**

Fix mirati per ciò che emerge, poi commit.

---

## Note per l'esecuzione

- **Worktree da `origin/main`** (EnterWorktree nativo, base fresh). ⚠️ MAI junction di `node_modules`: `npm ci`. Copiare `.env.local` dal checkout principale per la build.
- **Primo commit nel worktree**: spec + questo piano (poi rimuovere le copie untracked dal checkout principale — verificare byte-per-byte prima di cancellare).
- Implementer: modello **sonnet** come floor (haiku ha confabulato in un task analogo — vedi HANDOFF).
- Fine: PR verso main (squash, come #67/#68), merge, pull nel checkout principale, pulizia worktree/branch. Nessun riavvio agente necessario (questa feature non tocca `tools/limitazioni-sync/`).
