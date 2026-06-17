# Storico interventi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere al modulo `/hub/interventi` una pagina di sola consultazione che mostra tutti gli interventi (programmati + manuali) di default del giorno corrente, con ricerca DB su tutto lo storico e filtri server-side, con indicatore di caricamento.

**Architecture:** Helper puri (parsing filtri, normalizzazione riga, ordinamento, paginazione) testati con vitest; un endpoint server `GET /api/interventi/storico` che interroga `interventi` + `interventi_manuali` (non promossi) e restituisce righe normalizzate paginate; una pagina server che carica la lista staff e un componente client (`StoricoInterventiClient` + `StoricoFiltri` + `StoricoTabella`) che fa fetch, mostra spinner e tabella.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase (auth-helpers + RLS), vitest, Tailwind (CSS variables del tema).

**Note trasversali:**
- Baseline lint/test del repo è rossa: i gate valgono come "nessun nuovo problema dai file di questo piano" (eslint/vitest mirati ai file nuovi).
- Nessuna migrazione SQL, nessun cambio di permessi.
- Sola lettura: niente assegnazione/export/modifica da questa pagina.
- Branch: `feat/storico-interventi` (già creato, contiene la spec).

---

## File Structure

**Nuovi:**
- `lib/interventi/storico/types.ts` — tipi `RigaStorico`, righe DB di input, opzioni UI (committente/stato/esito), set stati.
- `lib/interventi/storico/filtri.ts` + `.test.ts` — `parseFiltriStorico`, `risolviFinestra`, `interrogaInterventi`, `interrogaManuali`, `puliziaQ`.
- `lib/interventi/storico/normalizza.ts` + `.test.ts` — `anagraficaManuale`, `interventoToRigaStorico`, `manualeToRigaStorico`, `labelStatoStorico`, `labelEsitoStorico`, `ordinaRighe`, `filtraManualiInMemoria`, `slicePagina`.
- `app/api/interventi/storico/route.ts` — endpoint GET.
- `components/modules/interventi/StoricoFiltri.tsx` — pannello filtri (presentazionale, controllato).
- `components/modules/interventi/StoricoTabella.tsx` — tabella (presentazionale).
- `components/modules/interventi/StoricoInterventiClient.tsx` — orchestratore client (stato + fetch + spinner + paginazione).
- `app/hub/interventi/storico/page.tsx` — pagina server.

**Modificati:**
- `app/hub/interventi/page.tsx` — link "Storico interventi".
- `app/hub/interventi/lista/page.tsx` — link "Storico interventi".

---

## Task 1: Tipi e opzioni

**Files:**
- Create: `lib/interventi/storico/types.ts`

- [ ] **Step 1: Creare il file dei tipi e delle costanti**

```typescript
// lib/interventi/storico/types.ts
// Tipi e costanti condivisi della consultazione "Storico interventi".

/** Forma unificata di una riga storica (programmato o manuale non promosso). */
export type RigaStorico = {
  id: string;
  origine: 'programmato' | 'manuale';
  committente: string | null;
  data: string | null; // YYYY-MM-DD
  odl: string | null;
  pdr: string | null;
  matricola: string | null;
  nominativo: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  attivita: string | null;
  fascia_oraria: string | null;
  esecutoreId: string | null;
  esecutoreNome: string | null;
  stato: string | null;
  statoLabel: string;
  esito: string | null;
  esitoLabel: string;
  motivo: string | null;
};

/** Riga grezza letta da `interventi`. */
export type InterventoStoricoRow = {
  id: string;
  origine: string | null;
  committente: string | null;
  data: string | null;
  odl: string | null;
  pdr: string | null;
  matricola_contatore: string | null;
  nominativo: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  intervento_tipo: string | null;
  fascia_oraria: string | null;
  staff_id: string | null;
  stato: string | null;
  esito: string | null;
  esito_motivo: string | null;
};

/** Riga grezza letta da `interventi_manuali` (non promossa: intervento_id NULL). */
export type ManualeStoricoRow = {
  id: string;
  committente: string | null;
  data: string | null;
  staff_id: string | null;
  staff_name: string | null;
  stato: string | null;
  motivo_rifiuto: string | null;
  dati_correnti: Record<string, unknown> | null;
  dati_operatore: Record<string, unknown> | null;
};

export const COMMITTENTE_OPZIONI: { value: string; label: string }[] = [
  { value: 'acea', label: 'Acea' },
  { value: 'italgas', label: 'Italgas' },
  { value: 'altro', label: 'Altro' },
  { value: 'lim_massive', label: 'Lim. massive' },
];

/** Stati possibili sulla tabella `interventi`. */
export const STATI_INTERVENTI = [
  'da_assegnare', 'assegnato', 'in_viaggio', 'sul_posto', 'in_esecuzione', 'completato', 'annullato',
] as const;

/** Stati possibili su `interventi_manuali` non promossi. */
export const STATI_MANUALI = ['in_attesa', 'rifiutato', 'annullato'] as const;

export const STATO_LABELS: Record<string, string> = {
  da_assegnare: 'Da assegnare',
  assegnato: 'Assegnato',
  in_viaggio: 'In viaggio',
  sul_posto: 'Sul posto',
  in_esecuzione: 'In esecuzione',
  completato: 'Completato',
  annullato: 'Annullato',
  in_attesa: 'In attesa (manuale)',
  rifiutato: 'Rifiutato (manuale)',
};

export const STATO_OPZIONI: { value: string; label: string }[] = [
  { value: 'da_assegnare', label: 'Da assegnare' },
  { value: 'assegnato', label: 'Assegnato' },
  { value: 'in_viaggio', label: 'In viaggio' },
  { value: 'sul_posto', label: 'Sul posto' },
  { value: 'in_esecuzione', label: 'In esecuzione' },
  { value: 'completato', label: 'Completato' },
  { value: 'annullato', label: 'Annullato' },
  { value: 'in_attesa', label: 'In attesa (manuale)' },
  { value: 'rifiutato', label: 'Rifiutato (manuale)' },
];

export const ESITO_LABELS: Record<string, string> = {
  eseguito_positivo: 'Eseguito positivo',
  accesso_negato: 'Accesso negato',
  contatore_non_trovato: 'Contatore non trovato',
  dati_ubicazione_insufficienti: 'Dati ubicazione insufficienti',
  accesso_a_vuoto: 'Accesso a vuoto',
  rinviato: 'Rinviato',
};

export const ESITO_OPZIONI: { value: string; label: string }[] =
  Object.entries(ESITO_LABELS).map(([value, label]) => ({ value, label }));

/** Risposta dell'endpoint storico. */
export type RispostaStorico = {
  righe: RigaStorico[];
  total: number;
  troncato: boolean;
  pageSize: number;
};
```

- [ ] **Step 2: Verificare che compili (typecheck)**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "storico/types" || echo "OK nessun errore sul file"`
Expected: "OK nessun errore sul file"

- [ ] **Step 3: Commit**

```bash
git add lib/interventi/storico/types.ts
git commit -m "feat(storico): tipi e opzioni della consultazione interventi"
```

---

## Task 2: Parsing filtri (puro, TDD)

**Files:**
- Create: `lib/interventi/storico/filtri.ts`
- Test: `lib/interventi/storico/filtri.test.ts`

- [ ] **Step 1: Scrivere i test che falliscono**

```typescript
// lib/interventi/storico/filtri.test.ts
import { describe, it, expect } from 'vitest';
import { parseFiltriStorico, risolviFinestra, interrogaInterventi, interrogaManuali, puliziaQ } from './filtri';

const OGGI = '2026-06-17';

describe('parseFiltriStorico', () => {
  it('default vuoto: q vuota, date nulle, page 0', () => {
    const f = parseFiltriStorico(new URLSearchParams(), OGGI);
    expect(f).toEqual({ q: '', data: null, dal: null, al: null, esecutore: null, comune: '', committente: null, stato: null, esito: null, page: 0 });
  });
  it('q trimmata; range date validi; valori invalidi → null', () => {
    const f = parseFiltriStorico(new URLSearchParams({ q: '  200123  ', dal: '2026-06-01', al: 'xx', committente: 'acea', stato: 'completato', esito: 'rinviato', esecutore: ' s1 ', comune: ' Roma ', page: '3' }), OGGI);
    expect(f.q).toBe('200123');
    expect(f.dal).toBe('2026-06-01');
    expect(f.al).toBeNull();
    expect(f.committente).toBe('acea');
    expect(f.stato).toBe('completato');
    expect(f.esito).toBe('rinviato');
    expect(f.esecutore).toBe('s1');
    expect(f.comune).toBe('Roma');
    expect(f.page).toBe(3);
  });
  it('committente/stato/esito non riconosciuti → null', () => {
    const f = parseFiltriStorico(new URLSearchParams({ committente: 'pippo', stato: 'x', esito: 'y' }), OGGI);
    expect(f.committente).toBeNull();
    expect(f.stato).toBeNull();
    expect(f.esito).toBeNull();
  });
});

describe('risolviFinestra', () => {
  it('q presente → nessun vincolo data (tutto lo storico)', () => {
    const f = parseFiltriStorico(new URLSearchParams({ q: 'abc', dal: '2026-06-01' }), OGGI);
    expect(risolviFinestra(f, OGGI)).toEqual({ eq: null, gte: null, lte: null });
  });
  it('senza q e senza date → giorno corrente', () => {
    const f = parseFiltriStorico(new URLSearchParams(), OGGI);
    expect(risolviFinestra(f, OGGI)).toEqual({ eq: OGGI, gte: null, lte: null });
  });
  it('range date → gte/lte', () => {
    const f = parseFiltriStorico(new URLSearchParams({ dal: '2026-06-01', al: '2026-06-10' }), OGGI);
    expect(risolviFinestra(f, OGGI)).toEqual({ eq: null, gte: '2026-06-01', lte: '2026-06-10' });
  });
});

describe('interrogaInterventi / interrogaManuali', () => {
  it('di default interroga entrambe', () => {
    const f = parseFiltriStorico(new URLSearchParams(), OGGI);
    expect(interrogaInterventi(f)).toBe(true);
    expect(interrogaManuali(f)).toBe(true);
  });
  it('esito impostato → niente manuali (esito è solo interventi)', () => {
    const f = parseFiltriStorico(new URLSearchParams({ esito: 'rinviato' }), OGGI);
    expect(interrogaManuali(f)).toBe(false);
    expect(interrogaInterventi(f)).toBe(true);
  });
  it('stato manuale (in_attesa) → niente interventi', () => {
    const f = parseFiltriStorico(new URLSearchParams({ stato: 'in_attesa' }), OGGI);
    expect(interrogaInterventi(f)).toBe(false);
    expect(interrogaManuali(f)).toBe(true);
  });
  it('stato condiviso (annullato) → entrambe', () => {
    const f = parseFiltriStorico(new URLSearchParams({ stato: 'annullato' }), OGGI);
    expect(interrogaInterventi(f)).toBe(true);
    expect(interrogaManuali(f)).toBe(true);
  });
});

describe('puliziaQ', () => {
  it('trim e rimozione caratteri che rompono il filtro PostgREST', () => {
    expect(puliziaQ('  ab,c(%)*  ')).toBe('ab c');
  });
  it('stringa vuota resta vuota', () => {
    expect(puliziaQ('   ')).toBe('');
  });
});
```

- [ ] **Step 2: Eseguire i test per verificarne il fallimento**

Run: `npx vitest run lib/interventi/storico/filtri.test.ts`
Expected: FAIL (modulo `./filtri` inesistente).

- [ ] **Step 3: Implementare `filtri.ts`**

```typescript
// lib/interventi/storico/filtri.ts
// PURA: parsing e validazione dei filtri della consultazione storico.
import { COMMITTENTE_OPZIONI, STATI_INTERVENTI, STATI_MANUALI, ESITO_LABELS } from './types';

export type FiltriStorico = {
  q: string;
  data: string | null;
  dal: string | null;
  al: string | null;
  esecutore: string | null;
  comune: string;
  committente: string | null;
  stato: string | null;
  esito: string | null;
  page: number;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const COMMITTENTI = new Set(COMMITTENTE_OPZIONI.map((o) => o.value));
const STATI = new Set<string>([...STATI_INTERVENTI, ...STATI_MANUALI]);
const ESITI = new Set(Object.keys(ESITO_LABELS));

function iso(v: string | null): string | null {
  return v && ISO.test(v) ? v : null;
}
function trimOrNull(v: string | null): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

/** Rimuove i caratteri che romperebbero un filtro `.or()/.ilike()` PostgREST. */
export function puliziaQ(q: string | null | undefined): string {
  return (q ?? '').replace(/[,()%*]/g, ' ').trim().replace(/\s+/g, ' ');
}

export function parseFiltriStorico(params: URLSearchParams, _oggi: string): FiltriStorico {
  const committenteRaw = params.get('committente') ?? '';
  const statoRaw = params.get('stato') ?? '';
  const esitoRaw = params.get('esito') ?? '';
  const pageNum = Number.parseInt(params.get('page') ?? '0', 10);
  return {
    q: (params.get('q') ?? '').trim(),
    data: iso(params.get('data')),
    dal: iso(params.get('dal')),
    al: iso(params.get('al')),
    esecutore: trimOrNull(params.get('esecutore')),
    comune: (params.get('comune') ?? '').trim(),
    committente: COMMITTENTI.has(committenteRaw) ? committenteRaw : null,
    stato: STATI.has(statoRaw) ? statoRaw : null,
    esito: ESITI.has(esitoRaw) ? esitoRaw : null,
    page: Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 0,
  };
}

/** Vincolo data da applicare alla query: con `q` si cerca su tutto lo storico. */
export function risolviFinestra(
  f: FiltriStorico,
  oggi: string,
): { eq: string | null; gte: string | null; lte: string | null } {
  if (f.q) return { eq: null, gte: null, lte: null };
  if (f.dal || f.al) return { eq: null, gte: f.dal, lte: f.al };
  return { eq: f.data ?? oggi, gte: null, lte: null };
}

/** Interroga `interventi` se nessun filtro stato esclusivo dei manuali lo impedisce. */
export function interrogaInterventi(f: FiltriStorico): boolean {
  return f.stato == null || (STATI_INTERVENTI as readonly string[]).includes(f.stato);
}

/** Interroga `interventi_manuali` solo se i filtri non li escludono. */
export function interrogaManuali(f: FiltriStorico): boolean {
  if (f.esito) return false;
  return f.stato == null || (STATI_MANUALI as readonly string[]).includes(f.stato);
}
```

- [ ] **Step 4: Eseguire i test (devono passare)**

Run: `npx vitest run lib/interventi/storico/filtri.test.ts`
Expected: PASS (tutti i test verdi).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/storico/filtri.ts lib/interventi/storico/filtri.test.ts
git commit -m "feat(storico): parsing e validazione filtri (TDD)"
```

---

## Task 3: Normalizzazione e ordinamento (puro, TDD)

**Files:**
- Create: `lib/interventi/storico/normalizza.ts`
- Test: `lib/interventi/storico/normalizza.test.ts`

- [ ] **Step 1: Scrivere i test che falliscono**

```typescript
// lib/interventi/storico/normalizza.test.ts
import { describe, it, expect } from 'vitest';
import {
  anagraficaManuale, interventoToRigaStorico, manualeToRigaStorico,
  labelStatoStorico, labelEsitoStorico, ordinaRighe, filtraManualiInMemoria, slicePagina,
} from './normalizza';
import type { InterventoStoricoRow, ManualeStoricoRow, RigaStorico } from './types';

const staff = new Map<string, string>([['s1', 'Mario Rossi']]);

describe('anagraficaManuale', () => {
  it('dati_correnti vince su dati_operatore', () => {
    const a = anagraficaManuale({
      dati_correnti: { anagrafica: { via: 'Via A', odl: '111' } },
      dati_operatore: { anagrafica: { via: 'Via B', matricola: 'M9', comune: 'Roma' } },
    });
    expect(a.via).toBe('Via A');
    expect(a.odl).toBe('111');
    expect(a.matricola).toBe('M9');
    expect(a.comune).toBe('Roma');
  });
  it('jsonb assenti → tutte stringhe vuote', () => {
    const a = anagraficaManuale({ dati_correnti: null, dati_operatore: null });
    expect(a.via).toBe('');
    expect(a.matricola).toBe('');
  });
});

describe('interventoToRigaStorico', () => {
  it('mappa i campi e risolve esecutore + label', () => {
    const row: InterventoStoricoRow = {
      id: 'i1', origine: 'pianificato', committente: 'acea', data: '2026-06-10',
      odl: '200999', pdr: 'P1', matricola_contatore: 'M1', nominativo: 'Tizio',
      indirizzo: 'Via Roma 1', comune: 'Roma', cap: '00100', intervento_tipo: 'Sostituzione',
      fascia_oraria: '8-12', staff_id: 's1', stato: 'completato', esito: 'eseguito_positivo', esito_motivo: null,
    };
    const r = interventoToRigaStorico(row, staff);
    expect(r.origine).toBe('programmato');
    expect(r.matricola).toBe('M1');
    expect(r.attivita).toBe('Sostituzione');
    expect(r.esecutoreNome).toBe('Mario Rossi');
    expect(r.statoLabel).toBe('Completato');
    expect(r.esitoLabel).toBe('Eseguito positivo');
  });
  it('origine=manuale (promosso) resta una sola riga marcata manuale', () => {
    const row = { id: 'i2', origine: 'manuale', committente: 'acea', data: '2026-06-10', odl: null, pdr: null, matricola_contatore: null, nominativo: null, indirizzo: null, comune: null, cap: null, intervento_tipo: null, fascia_oraria: null, staff_id: null, stato: 'completato', esito: null, esito_motivo: null } as InterventoStoricoRow;
    expect(interventoToRigaStorico(row, staff).origine).toBe('manuale');
  });
});

describe('manualeToRigaStorico', () => {
  it('estrae anagrafica dal jsonb, stato/esito/motivo dai campi richiesta', () => {
    const row: ManualeStoricoRow = {
      id: 'm1', committente: 'lim_massive', data: '2026-06-11', staff_id: 's1', staff_name: 'Mario R.',
      stato: 'rifiutato', motivo_rifiuto: 'doppione',
      dati_correnti: { anagrafica: { via: 'Via B', matricola: 'M2', comune: 'Fiumicino', odl: '300' } },
      dati_operatore: {},
    };
    const r = manualeToRigaStorico(row, staff);
    expect(r.origine).toBe('manuale');
    expect(r.indirizzo).toBe('Via B');
    expect(r.matricola).toBe('M2');
    expect(r.comune).toBe('Fiumicino');
    expect(r.statoLabel).toBe('Rifiutato (manuale)');
    expect(r.esito).toBeNull();
    expect(r.esitoLabel).toBe('—');
    expect(r.motivo).toBe('doppione');
    expect(r.esecutoreNome).toBe('Mario R.');
  });
});

describe('label helper', () => {
  it('labelStatoStorico noti + fallback + null', () => {
    expect(labelStatoStorico('completato')).toBe('Completato');
    expect(labelStatoStorico('in_attesa')).toBe('In attesa (manuale)');
    expect(labelStatoStorico('boh')).toBe('boh');
    expect(labelStatoStorico(null)).toBe('—');
  });
  it('labelEsitoStorico noti + null', () => {
    expect(labelEsitoStorico('accesso_negato')).toBe('Accesso negato');
    expect(labelEsitoStorico(null)).toBe('—');
  });
});

describe('ordinaRighe', () => {
  it('ordina per data desc, poi comune asc, poi indirizzo asc', () => {
    const base = (p: Partial<RigaStorico>): RigaStorico => ({
      id: '', origine: 'programmato', committente: null, data: null, odl: null, pdr: null, matricola: null,
      nominativo: null, indirizzo: null, comune: null, cap: null, attivita: null, fascia_oraria: null,
      esecutoreId: null, esecutoreNome: null, stato: null, statoLabel: '—', esito: null, esitoLabel: '—', motivo: null, ...p,
    });
    const out = ordinaRighe([
      base({ id: 'a', data: '2026-06-01', comune: 'Roma' }),
      base({ id: 'b', data: '2026-06-10', comune: 'Bari' }),
      base({ id: 'c', data: '2026-06-10', comune: 'Aosta' }),
    ]);
    expect(out.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('filtraManualiInMemoria', () => {
  const r = (p: Partial<RigaStorico>): RigaStorico => ({
    id: '', origine: 'manuale', committente: null, data: null, odl: null, pdr: null, matricola: null,
    nominativo: null, indirizzo: null, comune: null, cap: null, attivita: null, fascia_oraria: null,
    esecutoreId: null, esecutoreNome: null, stato: null, statoLabel: '—', esito: null, esitoLabel: '—', motivo: null, ...p,
  });
  it('filtra per q su odl/indirizzo/matricola/pdr/nominativo (case-insensitive)', () => {
    const righe = [r({ id: 'a', odl: '200ABC' }), r({ id: 'b', indirizzo: 'Via Verdi' })];
    expect(filtraManualiInMemoria(righe, '200abc', '').map((x) => x.id)).toEqual(['a']);
    expect(filtraManualiInMemoria(righe, 'verdi', '').map((x) => x.id)).toEqual(['b']);
  });
  it('filtra per comune (contains)', () => {
    const righe = [r({ id: 'a', comune: 'Roma' }), r({ id: 'b', comune: 'Fiumicino' })];
    expect(filtraManualiInMemoria(righe, '', 'fium').map((x) => x.id)).toEqual(['b']);
  });
});

describe('slicePagina', () => {
  it('estrae la pagina richiesta', () => {
    const righe = Array.from({ length: 5 }, (_, i) => ({ id: String(i) } as unknown as RigaStorico));
    expect(slicePagina(righe, 1, 2).map((r) => r.id)).toEqual(['2', '3']);
  });
});
```

- [ ] **Step 2: Eseguire i test per verificarne il fallimento**

Run: `npx vitest run lib/interventi/storico/normalizza.test.ts`
Expected: FAIL (modulo `./normalizza` inesistente).

- [ ] **Step 3: Implementare `normalizza.ts`**

```typescript
// lib/interventi/storico/normalizza.ts
// PURA: normalizzazione righe interventi/manuali → RigaStorico, label, ordinamento.
import { STATO_LABELS, ESITO_LABELS } from './types';
import type { InterventoStoricoRow, ManualeStoricoRow, RigaStorico } from './types';

const ANAG_KEYS = [
  'nominativo', 'matricola', 'pdr', 'odl', 'via', 'comune', 'cap', 'recapito', 'attivita', 'fascia_oraria',
] as const;
type AnagKey = (typeof ANAG_KEYS)[number];

function anagDi(d: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const a = (d as { anagrafica?: unknown } | null | undefined)?.anagrafica;
  return a && typeof a === 'object' ? (a as Record<string, unknown>) : {};
}

/** Anagrafica di una riga manuale: dati_correnti vince su dati_operatore. */
export function anagraficaManuale(
  riga: { dati_correnti?: Record<string, unknown> | null; dati_operatore?: Record<string, unknown> | null },
): Record<AnagKey, string> {
  const corr = anagDi(riga.dati_correnti);
  const op = anagDi(riga.dati_operatore);
  const out = {} as Record<AnagKey, string>;
  for (const k of ANAG_KEYS) out[k] = String((corr[k] ?? op[k]) ?? '').trim();
  return out;
}

export function labelStatoStorico(stato: string | null | undefined): string {
  if (!stato) return '—';
  return STATO_LABELS[stato] ?? stato;
}

export function labelEsitoStorico(esito: string | null | undefined): string {
  if (!esito) return '—';
  return ESITO_LABELS[esito] ?? esito;
}

function nz(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

export function interventoToRigaStorico(row: InterventoStoricoRow, staffById: Map<string, string>): RigaStorico {
  const origine: RigaStorico['origine'] = row.origine === 'manuale' ? 'manuale' : 'programmato';
  return {
    id: row.id,
    origine,
    committente: row.committente,
    data: row.data,
    odl: row.odl,
    pdr: row.pdr,
    matricola: row.matricola_contatore,
    nominativo: row.nominativo,
    indirizzo: row.indirizzo,
    comune: row.comune,
    cap: row.cap,
    attivita: row.intervento_tipo,
    fascia_oraria: row.fascia_oraria,
    esecutoreId: row.staff_id,
    esecutoreNome: row.staff_id ? (staffById.get(row.staff_id) ?? null) : null,
    stato: row.stato,
    statoLabel: labelStatoStorico(row.stato),
    esito: row.esito,
    esitoLabel: labelEsitoStorico(row.esito),
    motivo: nz(row.esito_motivo),
  };
}

export function manualeToRigaStorico(row: ManualeStoricoRow, staffById: Map<string, string>): RigaStorico {
  const a = anagraficaManuale(row);
  return {
    id: row.id,
    origine: 'manuale',
    committente: row.committente,
    data: row.data,
    odl: nz(a.odl),
    pdr: nz(a.pdr),
    matricola: nz(a.matricola),
    nominativo: nz(a.nominativo),
    indirizzo: nz(a.via),
    comune: nz(a.comune),
    cap: nz(a.cap),
    attivita: nz(a.attivita),
    fascia_oraria: nz(a.fascia_oraria),
    esecutoreId: row.staff_id,
    esecutoreNome: nz(row.staff_name) ?? (row.staff_id ? (staffById.get(row.staff_id) ?? null) : null),
    stato: row.stato,
    statoLabel: labelStatoStorico(row.stato),
    esito: null,
    esitoLabel: '—',
    motivo: nz(row.motivo_rifiuto),
  };
}

export function ordinaRighe(righe: RigaStorico[]): RigaStorico[] {
  return [...righe].sort((a, b) => {
    const da = a.data ?? '';
    const db = b.data ?? '';
    if (da !== db) return db.localeCompare(da); // data desc
    const ca = (a.comune ?? '').toLowerCase();
    const cb = (b.comune ?? '').toLowerCase();
    if (ca !== cb) return ca.localeCompare(cb); // comune asc
    return (a.indirizzo ?? '').toLowerCase().localeCompare((b.indirizzo ?? '').toLowerCase());
  });
}

/** Filtro in memoria per le righe manuali (q su anagrafica, comune contains). */
export function filtraManualiInMemoria(righe: RigaStorico[], q: string, comune: string): RigaStorico[] {
  const qq = q.trim().toLowerCase();
  const cc = comune.trim().toLowerCase();
  return righe.filter((r) => {
    if (qq) {
      const hay = `${r.odl ?? ''} ${r.indirizzo ?? ''} ${r.matricola ?? ''} ${r.pdr ?? ''} ${r.nominativo ?? ''}`.toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    if (cc && !(r.comune ?? '').toLowerCase().includes(cc)) return false;
    return true;
  });
}

export function slicePagina<T>(righe: T[], page: number, pageSize: number): T[] {
  const start = page * pageSize;
  return righe.slice(start, start + pageSize);
}
```

- [ ] **Step 4: Eseguire i test (devono passare)**

Run: `npx vitest run lib/interventi/storico/normalizza.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/storico/normalizza.ts lib/interventi/storico/normalizza.test.ts
git commit -m "feat(storico): normalizzazione/ordinamento righe (TDD)"
```

---

## Task 4: Endpoint `GET /api/interventi/storico`

**Files:**
- Create: `app/api/interventi/storico/route.ts`

- [ ] **Step 1: Implementare la route**

```typescript
// app/api/interventi/storico/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { requireUser } from '@/lib/apiAuth';
import { parseFiltriStorico, risolviFinestra, interrogaInterventi, interrogaManuali, puliziaQ } from '@/lib/interventi/storico/filtri';
import { interventoToRigaStorico, manualeToRigaStorico, ordinaRighe, filtraManualiInMemoria, slicePagina } from '@/lib/interventi/storico/normalizza';
import type { InterventoStoricoRow, ManualeStoricoRow, RigaStorico, RispostaStorico } from '@/lib/interventi/storico/types';

export const runtime = 'nodejs';

const PAGE_SIZE = 100;
const PAGE_DB = 1000;
const MAX_RIGHE = 5000;

const COLONNE_INT =
  'id, origine, committente, data, odl, pdr, matricola_contatore, nominativo, indirizzo, comune, cap, intervento_tipo, fascia_oraria, staff_id, stato, esito, esito_motivo';
const COLONNE_MAN =
  'id, committente, data, staff_id, staff_name, stato, motivo_rifiuto, intervento_id, dati_correnti, dati_operatore';

function oggiIso(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const oggi = oggiIso();
    const f = parseFiltriStorico(searchParams, oggi);
    const finestra = risolviFinestra(f, oggi);
    const qPulita = puliziaQ(f.q);

    const cookieStore = await cookies();
    const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
    const supabase = createRouteHandlerClient({ cookies: cookieMethods });

    const staffNames = new Map<string, string>();
    const { data: staffRows } = await supabase.from('staff').select('id, display_name');
    for (const s of (staffRows ?? []) as Array<{ id: string; display_name: string }>) {
      staffNames.set(s.id, s.display_name);
    }

    let troncato = false;
    const righe: RigaStorico[] = [];

    // --- interventi (programmati + manuali promossi) ---
    if (interrogaInterventi(f)) {
      for (let offset = 0; offset < MAX_RIGHE; offset += PAGE_DB) {
        let q = supabase
          .from('interventi')
          .select(COLONNE_INT)
          .order('data', { ascending: false })
          .order('comune', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + PAGE_DB - 1);
        if (finestra.eq) q = q.eq('data', finestra.eq);
        if (finestra.gte) q = q.gte('data', finestra.gte);
        if (finestra.lte) q = q.lte('data', finestra.lte);
        if (f.committente) q = q.eq('committente', f.committente);
        if (f.stato) q = q.eq('stato', f.stato);
        if (f.esito) q = q.eq('esito', f.esito);
        if (f.esecutore) q = q.eq('staff_id', f.esecutore);
        if (f.comune) q = q.ilike('comune', `%${puliziaQ(f.comune)}%`);
        if (qPulita) {
          q = q.or(
            `odl.ilike.%${qPulita}%,indirizzo.ilike.%${qPulita}%,matricola_contatore.ilike.%${qPulita}%,pdr.ilike.%${qPulita}%,nominativo.ilike.%${qPulita}%`,
          );
        }
        const { data: batch, error } = await q;
        if (error) throw error;
        const rows = (batch ?? []) as unknown as InterventoStoricoRow[];
        for (const r of rows) righe.push(interventoToRigaStorico(r, staffNames));
        if (rows.length < PAGE_DB) break;
        if (offset + PAGE_DB >= MAX_RIGHE) troncato = true;
      }
    }

    // --- interventi_manuali non promossi (in_attesa/rifiutato/annullato) ---
    if (interrogaManuali(f)) {
      let q = supabase
        .from('interventi_manuali')
        .select(COLONNE_MAN)
        .is('intervento_id', null)
        .order('data', { ascending: false })
        .limit(MAX_RIGHE);
      if (finestra.eq) q = q.eq('data', finestra.eq);
      if (finestra.gte) q = q.gte('data', finestra.gte);
      if (finestra.lte) q = q.lte('data', finestra.lte);
      if (f.committente) q = q.eq('committente', f.committente);
      if (f.stato) q = q.eq('stato', f.stato);
      if (f.esecutore) q = q.eq('staff_id', f.esecutore);
      const { data: manRows, error } = await q;
      if (error) throw error;
      const norm = ((manRows ?? []) as unknown as ManualeStoricoRow[]).map((r) => manualeToRigaStorico(r, staffNames));
      const filtrate = filtraManualiInMemoria(norm, qPulita, f.comune);
      righe.push(...filtrate);
    }

    const ordinate = ordinaRighe(righe);
    const total = ordinate.length;
    const pageRighe = slicePagina(ordinate, f.page, PAGE_SIZE);

    const risposta: RispostaStorico = { righe: pageRighe, total, troncato, pageSize: PAGE_SIZE };
    return NextResponse.json(risposta);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore caricamento storico.' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "api/interventi/storico" || echo "OK nessun errore sul file"`
Expected: "OK nessun errore sul file"

- [ ] **Step 3: Commit**

```bash
git add app/api/interventi/storico/route.ts
git commit -m "feat(storico): endpoint GET /api/interventi/storico (interventi + manuali)"
```

---

## Task 5: Componenti presentazionali (Filtri + Tabella)

**Files:**
- Create: `components/modules/interventi/StoricoFiltri.tsx`
- Create: `components/modules/interventi/StoricoTabella.tsx`

- [ ] **Step 1: Creare `StoricoFiltri.tsx`**

```tsx
// components/modules/interventi/StoricoFiltri.tsx
'use client';

import DatePicker from '@/components/ui/DatePicker';
import { COMMITTENTE_OPZIONI, STATO_OPZIONI, ESITO_OPZIONI } from '@/lib/interventi/storico/types';

export type StatoFiltriUI = {
  q: string; dal: string; al: string; esecutore: string; comune: string;
  committente: string; stato: string; esito: string;
};

type Staff = { id: string; display_name: string };

const sel =
  'rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm text-[var(--brand-text-main)]';

export default function StoricoFiltri({
  filtri, setFiltri, staff, onApplica, onPulisci, loading,
}: {
  filtri: StatoFiltriUI;
  setFiltri: (f: StatoFiltriUI) => void;
  staff: Staff[];
  onApplica: () => void;
  onPulisci: () => void;
  loading: boolean;
}) {
  const set = (patch: Partial<StatoFiltriUI>) => setFiltri({ ...filtri, ...patch });

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
      <div className="flex items-center gap-2">
        <input
          className={`${sel} flex-1`}
          placeholder="🔍 Cerca ODL / via / matricola / PDR / nominativo… (cerca su tutto lo storico)"
          value={filtri.q}
          onChange={(e) => set({ q: e.target.value })}
          aria-label="Ricerca interventi"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <DatePicker value={filtri.dal} onChange={(iso) => set({ dal: iso })} placeholder="Dal" ariaLabel="Dal" fullWidth />
        <DatePicker value={filtri.al} onChange={(iso) => set({ al: iso })} placeholder="Al" ariaLabel="Al" fullWidth />

        <select className={sel} value={filtri.esecutore} onChange={(e) => set({ esecutore: e.target.value })} aria-label="Esecutore">
          <option value="">Esecutore: tutti</option>
          {staff.map((s) => (<option key={s.id} value={s.id}>{s.display_name}</option>))}
        </select>

        <input className={sel} placeholder="Comune" value={filtri.comune} onChange={(e) => set({ comune: e.target.value })} aria-label="Comune" />

        <select className={sel} value={filtri.committente} onChange={(e) => set({ committente: e.target.value })} aria-label="Committente">
          <option value="">Committente: tutti</option>
          {COMMITTENTE_OPZIONI.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>

        <select className={sel} value={filtri.stato} onChange={(e) => set({ stato: e.target.value })} aria-label="Stato">
          <option value="">Stato: tutti</option>
          {STATO_OPZIONI.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>

        <select className={sel} value={filtri.esito} onChange={(e) => set({ esito: e.target.value })} aria-label="Esito">
          <option value="">Esito: tutti</option>
          {ESITO_OPZIONI.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onApplica}
          disabled={loading}
          className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Applica filtri
        </button>
        <button
          type="button"
          onClick={onPulisci}
          disabled={loading}
          className="rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm text-[var(--brand-text-main)] disabled:opacity-60"
        >
          Pulisci
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Creare `StoricoTabella.tsx`**

```tsx
// components/modules/interventi/StoricoTabella.tsx
'use client';

import type { RigaStorico } from '@/lib/interventi/storico/types';

const COLS: { key: keyof RigaStorico | 'origineLabel'; header: string }[] = [
  { key: 'data', header: 'Data' },
  { key: 'origineLabel', header: 'Origine' },
  { key: 'committente', header: 'Committente' },
  { key: 'odl', header: 'ODL' },
  { key: 'pdr', header: 'PDR' },
  { key: 'matricola', header: 'Matricola' },
  { key: 'nominativo', header: 'Nominativo' },
  { key: 'indirizzo', header: 'Indirizzo' },
  { key: 'comune', header: 'Comune' },
  { key: 'cap', header: 'CAP' },
  { key: 'attivita', header: 'Attività' },
  { key: 'fascia_oraria', header: 'Fascia oraria' },
  { key: 'esecutoreNome', header: 'Esecutore' },
  { key: 'statoLabel', header: 'Stato' },
  { key: 'esitoLabel', header: 'Esito' },
  { key: 'motivo', header: 'Motivo' },
];

function cella(r: RigaStorico, key: (typeof COLS)[number]['key']): string {
  if (key === 'origineLabel') return r.origine === 'manuale' ? 'Manuale' : 'Programmato';
  const v = r[key as keyof RigaStorico];
  return v == null || v === '' ? '—' : String(v);
}

export default function StoricoTabella({ righe }: { righe: RigaStorico[] }) {
  if (righe.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] py-12 text-center text-sm text-[var(--brand-text-muted)]">
        Nessun intervento trovato.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--brand-border)]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[var(--brand-surface-muted)] text-xs uppercase tracking-wide text-[var(--brand-text-muted)]">
          <tr>
            {COLS.map((c) => (<th key={c.header} className="whitespace-nowrap px-3 py-2 font-medium">{c.header}</th>))}
          </tr>
        </thead>
        <tbody>
          {righe.map((r) => (
            <tr key={r.id} className="border-t border-[var(--brand-border)] hover:bg-[var(--brand-surface-muted)]">
              {COLS.map((c) => (
                <td key={c.header} className="whitespace-nowrap px-3 py-2 text-[var(--brand-text-main)]">{cella(r, c.key)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "StoricoFiltri|StoricoTabella" || echo "OK nessun errore sui file"`
Expected: "OK nessun errore sui file"

- [ ] **Step 4: Commit**

```bash
git add components/modules/interventi/StoricoFiltri.tsx components/modules/interventi/StoricoTabella.tsx
git commit -m "feat(storico): componenti presentazionali filtri e tabella"
```

---

## Task 6: Orchestratore client

**Files:**
- Create: `components/modules/interventi/StoricoInterventiClient.tsx`

- [ ] **Step 1: Creare il componente**

```tsx
// components/modules/interventi/StoricoInterventiClient.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import StoricoFiltri, { type StatoFiltriUI } from './StoricoFiltri';
import StoricoTabella from './StoricoTabella';
import type { RigaStorico } from '@/lib/interventi/storico/types';

type Staff = { id: string; display_name: string };

const FILTRI_VUOTI: StatoFiltriUI = {
  q: '', dal: '', al: '', esecutore: '', comune: '', committente: '', stato: '', esito: '',
};

export default function StoricoInterventiClient({ staff }: { staff: Staff[] }) {
  const [filtri, setFiltri] = useState<StatoFiltriUI>(FILTRI_VUOTI);
  const [righe, setRighe] = useState<RigaStorico[]>([]);
  const [total, setTotal] = useState(0);
  const [troncato, setTroncato] = useState(false);
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carica = useCallback(async (f: StatoFiltriUI, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (f.q.trim()) {
        params.set('q', f.q.trim());
      } else {
        if (f.dal) params.set('dal', f.dal);
        if (f.al) params.set('al', f.al);
      }
      if (f.esecutore) params.set('esecutore', f.esecutore);
      if (f.comune.trim()) params.set('comune', f.comune.trim());
      if (f.committente) params.set('committente', f.committente);
      if (f.stato) params.set('stato', f.stato);
      if (f.esito) params.set('esito', f.esito);
      params.set('page', String(p));

      const res = await fetch(`/api/interventi/storico?${params.toString()}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Errore caricamento.');
      }
      const data = (await res.json()) as { righe: RigaStorico[]; total: number; troncato: boolean; pageSize: number };
      setRighe(Array.isArray(data.righe) ? data.righe : []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
      setTroncato(Boolean(data.troncato));
      setPageSize(typeof data.pageSize === 'number' ? data.pageSize : 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore caricamento.');
      setRighe([]);
      setTotal(0);
      setTroncato(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Caricamento iniziale: giorno corrente (filtri vuoti → default oggi lato server).
  useEffect(() => {
    void carica(FILTRI_VUOTI, 0);
  }, [carica]);

  // Debounce sulla ricerca testuale (parte da sola).
  const primaVolta = useRef(true);
  useEffect(() => {
    if (primaVolta.current) {
      primaVolta.current = false;
      return;
    }
    const t = setTimeout(() => {
      setPage(0);
      void carica(filtri, 0);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtri.q]);

  const applica = () => { setPage(0); void carica(filtri, 0); };
  const pulisci = () => { setFiltri(FILTRI_VUOTI); setPage(0); void carica(FILTRI_VUOTI, 0); };
  const vaiPagina = (p: number) => { setPage(p); void carica(filtri, p); };

  const totPagine = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <StoricoFiltri
        filtri={filtri}
        setFiltri={setFiltri}
        staff={staff}
        onApplica={applica}
        onPulisci={pulisci}
        loading={loading}
      />

      {troncato && (
        <div className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-2 text-sm text-[var(--warning)]">
          Troppi risultati: vengono mostrati i primi {total}. Restringi i filtri per vedere tutto.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="relative min-h-[120px]">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-3 rounded-2xl bg-[var(--brand-surface)]/70 text-sm text-[var(--brand-text-muted)]">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--brand-border)] border-t-[var(--brand-primary)]" />
            Caricamento…
          </div>
        )}
        <StoricoTabella righe={righe} />
      </div>

      <div className="flex items-center justify-between text-sm text-[var(--brand-text-muted)]">
        <span>{total} interventi</span>
        {totPagine > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => vaiPagina(Math.max(0, page - 1))}
              disabled={loading || page === 0}
              className="rounded-lg border border-[var(--brand-border)] px-3 py-1 disabled:opacity-50"
            >
              ←
            </button>
            <span>Pagina {page + 1} di {totPagine}</span>
            <button
              type="button"
              onClick={() => vaiPagina(Math.min(totPagine - 1, page + 1))}
              disabled={loading || page >= totPagine - 1}
              className="rounded-lg border border-[var(--brand-border)] px-3 py-1 disabled:opacity-50"
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "StoricoInterventiClient" || echo "OK nessun errore sul file"`
Expected: "OK nessun errore sul file"

- [ ] **Step 3: Commit**

```bash
git add components/modules/interventi/StoricoInterventiClient.tsx
git commit -m "feat(storico): orchestratore client (fetch + spinner + paginazione)"
```

---

## Task 7: Pagina server + link di navigazione

**Files:**
- Create: `app/hub/interventi/storico/page.tsx`
- Modify: `app/hub/interventi/page.tsx`
- Modify: `app/hub/interventi/lista/page.tsx`

- [ ] **Step 1: Creare la pagina server**

```tsx
// app/hub/interventi/storico/page.tsx
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import StoricoInterventiClient from '@/components/modules/interventi/StoricoInterventiClient';

export const dynamic = 'force-dynamic';

export default async function StoricoInterventiPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: staffRows } = await supabase
    .from('staff')
    .select('id, display_name')
    .order('display_name', { ascending: true });
  const staff = ((staffRows ?? []) as Array<{ id: string; display_name: string }>);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
            Storico interventi
          </h1>
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
            Tutti gli interventi transitati per l&apos;app (programmati e manuali). Di default il giorno corrente; usa la
            ricerca per cercare su tutto lo storico.
          </p>
        </div>
        <Link
          href="/hub/interventi/lista"
          className="inline-flex w-fit items-center rounded-2xl border px-4 py-2 text-sm font-medium transition"
          style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
        >
          ← Lista assegnazione
        </Link>
      </header>

      <StoricoInterventiClient staff={staff} />
    </main>
  );
}
```

- [ ] **Step 2: Aggiungere il link dalla landing import**

In `app/hub/interventi/page.tsx`, individuare il `<Link href="/hub/interventi/lista">` esistente (riga ~104) e aggiungere subito accanto un link allo storico. Mostrare il blocco prima/dopo per orientarsi:

Cercare:
```tsx
            <Link href="/hub/interventi/lista" ...>
```
e nello stesso contenitore aggiungere:
```tsx
            <Link
              href="/hub/interventi/storico"
              className="inline-flex items-center rounded-2xl border px-4 py-2 text-sm font-medium transition"
              style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
            >
              Storico interventi
            </Link>
```
(Se il link lista è dentro un contenitore flex, mantenere lo stesso wrapper; altrimenti racchiudere i due link in un `<div className="flex flex-wrap gap-2">`.)

- [ ] **Step 3: Aggiungere il link dalla pagina lista**

In `app/hub/interventi/lista/page.tsx`, nell'`<header>` accanto al link "Importa interventi" (riga ~75-82), aggiungere:
```tsx
        <Link
          href="/hub/interventi/storico"
          className="inline-flex w-fit items-center rounded-2xl border px-4 py-2 text-sm font-medium transition"
          style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
        >
          Storico interventi
        </Link>
```
(Racchiudere i due `<Link>` dell'header in un `<div className="flex flex-wrap gap-2">` se non lo sono già.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "interventi/storico/page|interventi/page|interventi/lista/page" || echo "OK nessun errore sui file"`
Expected: "OK nessun errore sui file"

- [ ] **Step 5: Commit**

```bash
git add app/hub/interventi/storico/page.tsx app/hub/interventi/page.tsx app/hub/interventi/lista/page.tsx
git commit -m "feat(storico): pagina /hub/interventi/storico + link di navigazione"
```

---

## Task 8: Verifica finale

**Files:** nessuno (verifica).

- [ ] **Step 1: ESLint mirato sui file nuovi/modificati**

Run:
```bash
npx eslint lib/interventi/storico app/api/interventi/storico/route.ts components/modules/interventi/StoricoInterventiClient.tsx components/modules/interventi/StoricoFiltri.tsx components/modules/interventi/StoricoTabella.tsx app/hub/interventi/storico/page.tsx
```
Expected: nessun errore (warning preesistenti del repo non pertinenti tollerati; nessun nuovo errore dai file di questo piano).

- [ ] **Step 2: Test unitari nuovi**

Run: `npx vitest run lib/interventi/storico/`
Expected: PASS (tutti i test dei due file storico verdi).

- [ ] **Step 3: Typecheck globale**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun NUOVO errore introdotto dai file del piano (confrontare con la baseline se necessario).

- [ ] **Step 4: Build / smoke run**

Avviare l'app in dev (`npm run dev`) e verificare manualmente su `/hub/interventi/storico`:
1. Al caricamento mostra solo gli interventi di **oggi** (con spinner durante il fetch).
2. Scrivendo un ODL/matricola/via noto nella ricerca, dopo ~400ms parte una nuova richiesta (spinner) e mostra i risultati di **tutto lo storico** (anche date diverse da oggi).
3. Impostando Dal/Al + "Applica filtri" si ricarica per il range.
4. Filtrando per Esecutore/Comune/Committente/Stato/Esito i risultati cambiano coerentemente.
5. Un intervento manuale **in attesa/rifiutato** compare con Origine = "Manuale".
6. "Pulisci" riporta a oggi.

- [ ] **Step 5: Aggiornare la memoria di progetto**

Creare/aggiornare il file di memoria `storico-interventi.md` (e una riga in `MEMORY.md`) con: feature DEPLOYATA, branch, SHA di merge, "no SQL", percorso `/hub/interventi/storico`, nota che unisce `interventi` + `interventi_manuali` non promossi.

- [ ] **Step 6: Finalizzare il branch**

Usare la skill `superpowers:finishing-a-development-branch` per decidere merge ff in `main` + push + eliminazione branch (coerente col metodo di progetto).

---

## Self-Review (svolto in fase di scrittura)

- **Copertura spec:** default oggi (Task 4 `risolviFinestra` + iniziale client Task 6); ricerca su tutto lo storico (`risolviFinestra` con `q` → nessun vincolo data, Task 2/4); filtri data/esecutore/comune/committente/stato/esito (Task 2 parse + Task 4 query + Task 5 UI); spinner ad ogni richiesta (Task 6); unione manuali+programmati senza duplicati (`intervento_id IS NULL` + colonna Origine, Task 3/4); colonne richieste (Task 5 `StoricoTabella`); niente troncamenti silenziosi (`troncato`, Task 4/6). 
- **Placeholder:** nessun TBD/TODO; ogni step ha codice/comando reale.
- **Coerenza tipi:** `RigaStorico`, `FiltriStorico`, `StatoFiltriUI`, `RispostaStorico` usati con gli stessi nomi/firme in tutti i task; funzioni (`parseFiltriStorico`, `risolviFinestra`, `interrogaInterventi/Manuali`, `interventoToRigaStorico`, `manualeToRigaStorico`, `filtraManualiInMemoria`, `slicePagina`, `ordinaRighe`, `puliziaQ`) definite prima dell'uso.
