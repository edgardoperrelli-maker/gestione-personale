# Motore "Gruppo attività" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tassonomia unica (committente, descrizione → gruppo attività) applicata a import Excel (rifiuto bloccante), inserimenti manuali (lista chiusa obbligatoria), flusso pianificazione (derivazione soft) e storico DB (backfill + canonicalizzazione), con template Excel scaricabile e guard SQL estesa.

**Architecture:** Tabella `attivita_tassonomia` a DB (fonte di verità) + libreria pura `lib/attivita/` (normalizzazione riusa `normalizzaAttivita` del listino) + hook nei tre punti di creazione interventi (`/api/interventi/import`, `taskToIntervento`, `richiestaToIntervento`). Migration in due file: schema+seed, poi backfill dati (con protezione dello strato alias `acea_attivita_alias` usato da produzione economica).

**Tech Stack:** Next.js (App Router, route nodejs), Supabase (Postgres + MCP per le migration), exceljs (già in deps) per il template, vitest.

**Spec:** `docs/superpowers/specs/2026-07-20-motore-gruppo-attivita-design.md`

## Global Constraints

- Branch di lavoro: `feat/motore-gruppo-attivita` creato da `origin/main` aggiornato.
- Repo **PUBBLICO**: nei test/fixture solo nomi di attività (nessun dato di produzione: niente matricole, ODL reali, indirizzi, nomi di persone).
- Test: `npx vitest run <file>` per singolo file; suite completa `npm test` solo nel task finale. Il lint di repo ha una baseline rossa storica: NON è un gate; non introdurre nuovi errori nei file toccati.
- **Le migration NON vengono applicate dai subagent**: il file SQL viene creato nel repo; l'applicazione su Supabase (progetto `aceztqfebringeaebvce`) la fa la sessione principale al checkpoint indicato, con le query di verifica del task.
- Normalizzazione descrizioni: si riusa `normalizzaAttivita` (`lib/produzione/normalizzaAttivita.ts`): chiave = maiuscolo, spazi collassati, **senza accenti**. (Deviazione dichiarata dallo spec §3.1 che diceva "accenti conservati": si allinea alla chiave già usata dal listino/alias — stessa chiave, zero doppioni. Equivalente SQL: `upper(regexp_replace(unaccent(trim(s)), '\s+', ' ', 'g'))` con estensione `unaccent`.)
- I valori committente in tassonomia sono minuscoli (`acea`, `italgas`) come nella tabella `interventi`. `lim_massive` NON è in tassonomia: equivale ad `acea` in fase di lookup.
- Messaggi UI in italiano, coerenti col tono esistente.

---

### Task 1: Migration schema + seed tassonomia

**Files:**
- Create: `supabase/migrations/20260720150000_attivita_tassonomia.sql`

**Interfaces:**
- Produces: tabella `attivita_tassonomia (id uuid pk, committente text, descrizione text, descrizione_norm text, gruppo text, attivo boolean default true)` con unique `(committente, descrizione_norm)`; colonna `interventi.gruppo_attivita text null`; 60 righe seed.

- [ ] **Step 1: Crea il file migration**

```sql
-- supabase/migrations/20260720150000_attivita_tassonomia.sql
-- Tassonomia attività: (committente, descrizione) -> gruppo. Fonte di verità unica per
-- import (validazione bloccante), inserimenti manuali (lista chiusa) e classificazione.
-- Spec: docs/superpowers/specs/2026-07-20-motore-gruppo-attivita-design.md

create extension if not exists unaccent with schema public;

-- Normalizzazione IDENTICA alla chiave TS di lib/produzione/normalizzaAttivita.ts:
-- maiuscolo, spazi collassati, senza accenti. IMMUTABLE: si usa la forma a due argomenti
-- di unaccent col dizionario esplicito (la forma a un argomento è solo STABLE).
create or replace function attivita_norm(s text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(public.unaccent('public.unaccent'::regdictionary, trim(coalesce(s, ''))), '\s+', ' ', 'g'))
$$;

create table if not exists attivita_tassonomia (
  id uuid primary key default gen_random_uuid(),
  committente text not null check (committente in ('acea', 'italgas', 'altro')),
  descrizione text not null,          -- forma CANONICA (quella che si scrive su interventi)
  descrizione_norm text not null,     -- attivita_norm(descrizione), popolata dal trigger sotto
  gruppo text not null,               -- es. 'LIMITAZIONI MASSIVE'
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (committente, descrizione_norm)
);

-- descrizione_norm sempre coerente con descrizione (anche su insert manuali future)
create or replace function attivita_tassonomia_norm_trigger()
returns trigger language plpgsql as $$
begin
  new.descrizione_norm := attivita_norm(new.descrizione);
  return new;
end $$;
create trigger trg_attivita_tassonomia_norm
  before insert or update of descrizione on attivita_tassonomia
  for each row execute function attivita_tassonomia_norm_trigger();

-- RLS come le altre tabelle di servizio: lettura autenticati, scrittura solo service role.
alter table attivita_tassonomia enable row level security;
create policy attivita_tassonomia_select on attivita_tassonomia
  for select to authenticated using (true);

-- Colonna sul bersaglio operativo. NULL = storico non classificato (i nuovi flussi la valorizzano).
alter table interventi add column if not exists gruppo_attivita text;

-- SEED: 60 descrizioni dal file di riferimento (canonica = variante più frequente nello storico).
insert into attivita_tassonomia (committente, descrizione, gruppo) values
  ('acea', 'Limitazione flusso idrico', 'DUNNING'),
  ('acea', 'Sospensione fornitura', 'DUNNING'),
  ('acea', 'Regolarizzazione flusso idrico', 'DUNNING'),
  ('acea', 'Rimozione misuratore per morosità', 'DUNNING'),
  ('acea', 'Riattivazione fornitura', 'DUNNING'),
  ('acea', 'Rimozione impianto abusivo', 'DUNNING'),
  ('acea', 'RESINE', 'DUNNING'),
  ('acea', 'Rim Mis/Mod radio per morosità', 'DUNNING'),
  ('acea', 'Limitazione Massiva su Impianto', 'LIMITAZIONI MASSIVE'),
  ('acea', 'LIMITAZIONI MASSIVE', 'LIMITAZIONI MASSIVE'),
  ('acea', 'LIMITAZIONE MASSIVA', 'LIMITAZIONI MASSIVE'),
  ('italgas', 'WFM LAVORI Attività lavori Impresa/coll', 'AGENDA AEREA'),
  ('italgas', 'S-PR-003 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-003 A Sonda', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-MR-002 A Sonda', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-004 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'DIS001 - Disattivazione primo passaggio', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-MR-002 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-077 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-007 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'UT MOROSITA'' PRIMO PASSAGGIO', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-001 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'DIS00N - DISATTIVAZIONE SUCCESSIVO PASSAGGIO', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-022 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-019 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-MR-002', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-AI-022 - SOST PROG CONT ATTIVO < G6 PER TELELETTURA GN B', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-053 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-004 B', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'UT MOROSITA'' RIPASSO', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-004', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-004 C', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-009 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-MR-002 B', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-MR-003 A Sonda', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-003', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-009 B', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-MR-002 C', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-003 B', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'DIS00N', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-AI-049 - Verifica misuratore in campo', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-007', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-AI-022', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-AI-022 - Sost prog cont attivo < G6 per Telelettura', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-MR-002 - RIATTIVAZ. SERVIZIO SOSPESO PER MOROSITA''', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-007 B', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-AI-009', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-AI-022 - Sost prog cont attivo < G6 per Telelettura GN C', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-AI-042 - Sostituzione mensola', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-MR-003 A', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-001', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-009', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-009 C', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-019 B', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'S-PR-077', 'ATTIVITA'' ALLA CLIENTELA'),
  ('italgas', 'BONIFICHE', 'BONIFICHE'),
  ('italgas', 'BONIFICHE EXTRA', 'BONIFICHE EXTRA'),
  ('italgas', 'Regolarizzazione flusso idrico', 'BONIFICHE EXTRA'),
  ('italgas', 'PICARRO', 'P.I.'),
  ('italgas', 'PRONTO INTERVENTO', 'P.I.')
on conflict (committente, descrizione_norm) do nothing;
```

Nota: `descrizione_norm` è valorizzata dal trigger anche durante il seed (before insert).

- [ ] **Step 2: Commit del file**

```bash
git add supabase/migrations/20260720150000_attivita_tassonomia.sql
git commit -m "feat(tassonomia): schema attivita_tassonomia + colonna gruppo_attivita + seed 60 descrizioni"
```

- [ ] **Step 3 (MAIN SESSION, checkpoint): applica la migration su Supabase e verifica**

Applicare via MCP `apply_migration` con il contenuto del file. Poi verificare:

```sql
select committente, gruppo, count(*) from attivita_tassonomia group by 1,2 order by 1,2;
```
Atteso: acea|DUNNING=8, acea|LIMITAZIONI MASSIVE=3, italgas|AGENDA AEREA=1,
italgas|ATTIVITA' ALLA CLIENTELA=43, italgas|BONIFICHE=1, italgas|BONIFICHE EXTRA=2, italgas|P.I.=2 (tot 60).

```sql
select attivita_norm('  Rimozione   misuratore per morosità ') as k;
```
Atteso: `RIMOZIONE MISURATORE PER MOROSITA` (spazi collassati, senza accento).

---

### Task 2: Libreria pura tassonomia

**Files:**
- Create: `lib/attivita/tassonomia.ts`
- Test: `lib/attivita/tassonomia.test.ts`

**Interfaces:**
- Consumes: `normalizzaAttivita` da `@/lib/produzione/normalizzaAttivita`.
- Produces (usati dai task 5, 6, 9, 10):
  - `type TassonomiaRiga = { committente: string; descrizione: string; descrizioneNorm: string; gruppo: string; attivo: boolean }`
  - `chiaveTassonomia(s: string | null | undefined): string` — chiave normalizzata ('' se vuoto)
  - `buildTassonomiaIndex(righe: TassonomiaRiga[]): Map<string, TassonomiaRiga>` — chiave `${committenteEquivalente}|${descrizioneNorm}`, solo `attivo`
  - `committenteEquivalente(committente: string | null | undefined): string` — lowercase; `lim_massive` → `acea`
  - `risolviGruppo(committente: string | null | undefined, descrizione: string | null | undefined, index: Map<string, TassonomiaRiga>): TassonomiaRiga | null` — lookup per il committente; per `altro` (fuori tassonomia) prova acea poi italgas

- [ ] **Step 1: Scrivi i test**

```typescript
// lib/attivita/tassonomia.test.ts
import { describe, it, expect } from 'vitest';
import {
  chiaveTassonomia, buildTassonomiaIndex, committenteEquivalente, risolviGruppo,
  type TassonomiaRiga,
} from './tassonomia';

const riga = (over: Partial<TassonomiaRiga> = {}): TassonomiaRiga => ({
  committente: 'acea',
  descrizione: 'Limitazione Massiva su Impianto',
  descrizioneNorm: 'LIMITAZIONE MASSIVA SU IMPIANTO',
  gruppo: 'LIMITAZIONI MASSIVE',
  attivo: true,
  ...over,
});

describe('chiaveTassonomia', () => {
  it('maiuscolo, spazi collassati, senza accenti (stessa chiave del listino)', () => {
    expect(chiaveTassonomia('  Rimozione   misuratore per morosità ')).toBe('RIMOZIONE MISURATORE PER MOROSITA');
  });
  it('vuoto/null → stringa vuota', () => {
    expect(chiaveTassonomia('')).toBe('');
    expect(chiaveTassonomia(null)).toBe('');
  });
});

describe('committenteEquivalente', () => {
  it('lim_massive equivale ad acea', () => {
    expect(committenteEquivalente('lim_massive')).toBe('acea');
  });
  it('normalizza il case', () => {
    expect(committenteEquivalente('ITALGAS')).toBe('italgas');
  });
});

describe('risolviGruppo', () => {
  const index = buildTassonomiaIndex([
    riga(),
    riga({ committente: 'acea', descrizione: 'Regolarizzazione flusso idrico', descrizioneNorm: 'REGOLARIZZAZIONE FLUSSO IDRICO', gruppo: 'DUNNING' }),
    riga({ committente: 'italgas', descrizione: 'Regolarizzazione flusso idrico', descrizioneNorm: 'REGOLARIZZAZIONE FLUSSO IDRICO', gruppo: 'BONIFICHE EXTRA' }),
    riga({ committente: 'italgas', descrizione: 'BONIFICHE', descrizioneNorm: 'BONIFICHE', gruppo: 'BONIFICHE' }),
    riga({ committente: 'italgas', descrizione: 'S-PR-003 A Sonda', descrizioneNorm: 'S-PR-003 A SONDA', gruppo: "ATTIVITA' ALLA CLIENTELA" }),
    riga({ committente: 'acea', descrizione: 'RESINE', descrizioneNorm: 'RESINE', gruppo: 'DUNNING', attivo: false }),
  ]);

  it('match case/spazi-insensitive → riga canonica', () => {
    const r = risolviGruppo('acea', ' limitazione massiva SU impianto ', index);
    expect(r?.gruppo).toBe('LIMITAZIONI MASSIVE');
    expect(r?.descrizione).toBe('Limitazione Massiva su Impianto');
  });
  it('ambiguità risolta per committente', () => {
    expect(risolviGruppo('acea', 'Regolarizzazione flusso idrico', index)?.gruppo).toBe('DUNNING');
    expect(risolviGruppo('italgas', 'Regolarizzazione flusso idrico', index)?.gruppo).toBe('BONIFICHE EXTRA');
  });
  it('lim_massive usa la tassonomia acea', () => {
    expect(risolviGruppo('lim_massive', 'LIMITAZIONI MASSIVE', buildTassonomiaIndex([riga({ descrizione: 'LIMITAZIONI MASSIVE', descrizioneNorm: 'LIMITAZIONI MASSIVE' })]))?.gruppo).toBe('LIMITAZIONI MASSIVE');
  });
  it("committente 'altro': prova acea poi italgas", () => {
    expect(risolviGruppo('altro', 'BONIFICHE', index)?.gruppo).toBe('BONIFICHE');
    expect(risolviGruppo('altro', 'Limitazione Massiva su Impianto', index)?.gruppo).toBe('LIMITAZIONI MASSIVE');
  });
  it('descrizione sconosciuta o vuota → null', () => {
    expect(risolviGruppo('acea', 'ATTIVITA INVENTATA', index)).toBeNull();
    expect(risolviGruppo('acea', '', index)).toBeNull();
    expect(risolviGruppo('acea', null, index)).toBeNull();
  });
  it('le righe non attive sono escluse', () => {
    expect(risolviGruppo('acea', 'RESINE', index)).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui i test → devono FALLIRE**

Run: `npx vitest run lib/attivita/tassonomia.test.ts`
Expected: FAIL (modulo inesistente).

- [ ] **Step 3: Implementa**

```typescript
// lib/attivita/tassonomia.ts
// PURA: lookup della tassonomia attività (committente, descrizione) -> gruppo.
// La chiave è la STESSA del listino (normalizzaAttivita): maiuscolo, spazi collassati,
// senza accenti. Equivalente SQL: attivita_norm() (migration 20260720150000).
import { normalizzaAttivita } from '@/lib/produzione/normalizzaAttivita';

export type TassonomiaRiga = {
  committente: string;
  descrizione: string;       // forma canonica (quella da scrivere su interventi)
  descrizioneNorm: string;
  gruppo: string;
  attivo: boolean;
};

/** Chiave normalizzata di una descrizione ('' se vuota). */
export function chiaveTassonomia(s: string | null | undefined): string {
  return normalizzaAttivita(s)?.key ?? '';
}

/** lim_massive è un marcatore di canale, non un committente: in tassonomia equivale ad acea. */
export function committenteEquivalente(committente: string | null | undefined): string {
  const c = String(committente ?? '').trim().toLowerCase();
  return c === 'lim_massive' ? 'acea' : c;
}

const key = (committente: string, descrizioneNorm: string) => `${committente}|${descrizioneNorm}`;

/** Indice delle sole righe attive, per lookup O(1). */
export function buildTassonomiaIndex(righe: TassonomiaRiga[]): Map<string, TassonomiaRiga> {
  const m = new Map<string, TassonomiaRiga>();
  for (const r of righe ?? []) {
    if (!r.attivo) continue;
    m.set(key(committenteEquivalente(r.committente), r.descrizioneNorm), r);
  }
  return m;
}

/**
 * Risolve (committente, descrizione) → riga di tassonomia, o null se sconosciuta.
 * 'altro' non ha righe proprie: prova acea poi italgas (accetta qualsiasi attività nota).
 */
export function risolviGruppo(
  committente: string | null | undefined,
  descrizione: string | null | undefined,
  index: Map<string, TassonomiaRiga>,
): TassonomiaRiga | null {
  const k = chiaveTassonomia(descrizione);
  if (!k) return null;
  const c = committenteEquivalente(committente);
  if (c === 'altro') {
    return index.get(key('acea', k)) ?? index.get(key('italgas', k)) ?? null;
  }
  return index.get(key(c, k)) ?? null;
}
```

- [ ] **Step 4: Esegui i test → devono PASSARE**

Run: `npx vitest run lib/attivita/tassonomia.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/attivita/tassonomia.ts lib/attivita/tassonomia.test.ts
git commit -m "feat(tassonomia): lookup puro (committente, descrizione) -> gruppo"
```

---

### Task 3: Migration backfill dati (gruppo + canonicalizzazione + committente)

**Files:**
- Create: `supabase/migrations/20260720151000_backfill_gruppo_attivita.sql`

**Interfaces:**
- Consumes: tabella e funzione del Task 1.
- Produces: `interventi.gruppo_attivita` popolato; `intervento_tipo` canonicalizzato; committente corretto (acea→italgas, altro→italgas) dove la tassonomia è univoca; righe alias clonate in `acea_attivita_alias` per i nuovi `(committente_orig, chiave)`.

- [ ] **Step 1: Crea il file migration**

```sql
-- supabase/migrations/20260720151000_backfill_gruppo_attivita.sql
-- Backfill dello storico secondo la tassonomia (spec §4). Idempotente.
-- ORDINE OBBLIGATO: prima i fix committente (con clone alias), POI gruppo+canonica,
-- così il lookup usa il committente corretto.

-- ── Passo A: clona gli alias per i committente che stanno per cambiare ──────────────
-- Lo strato produzione economica (lib/produzione/attivitaCanonica.ts) risolve per
-- (committente_orig, chiave). Cambiando committente acea→italgas su righe interventi,
-- la coppia cercata diventa (italgas, chiave): se l'alias esiste solo come (acea, chiave)
-- la risoluzione degraderebbe a fallback (macrogruppo perso). Cloniamo PRIMA.
insert into acea_attivita_alias (committente_orig, chiave, committente_eff, macrogruppo, attivita_pulita, voce, attivo, note)
select 'italgas', a.chiave, a.committente_eff, a.macrogruppo, a.attivita_pulita, a.voce, a.attivo,
       'clone da acea per riclassificazione committente (migration 20260720151000)'
from acea_attivita_alias a
where a.committente_orig = 'acea'
  and a.chiave in (
    select t.descrizione_norm from attivita_tassonomia t where t.committente = 'italgas'
  )
  and not exists (
    select 1 from acea_attivita_alias b
    where b.committente_orig = 'italgas' and b.chiave = a.chiave
  );

-- ── Passo B: correzione committente dove la tassonomia è univoca ────────────────────
-- Righe acea/altro la cui descrizione esiste SOLO sotto italgas (mai sotto acea):
-- il file di riferimento le riclassifica italgas. lim_massive NON si tocca (spec §4.5).
update interventi i
set committente = 'italgas'
where i.committente in ('acea', 'altro')
  and attivita_norm(i.intervento_tipo) <> ''
  and exists (
    select 1 from attivita_tassonomia t
    where t.committente = 'italgas' and t.descrizione_norm = attivita_norm(i.intervento_tipo) and t.attivo
  )
  and not exists (
    select 1 from attivita_tassonomia t
    where t.committente = 'acea' and t.descrizione_norm = attivita_norm(i.intervento_tipo) and t.attivo
  );

-- ── Passo C: gruppo_attivita + canonicalizzazione descrizione ───────────────────────
-- lim_massive usa la tassonomia acea (equivalenza di canale).
update interventi i
set gruppo_attivita = t.gruppo,
    intervento_tipo = t.descrizione
from attivita_tassonomia t
where t.attivo
  and t.descrizione_norm = attivita_norm(i.intervento_tipo)
  and t.committente = case when i.committente = 'lim_massive' then 'acea' else i.committente end
  and (i.gruppo_attivita is distinct from t.gruppo or i.intervento_tipo is distinct from t.descrizione);
```

- [ ] **Step 2: Commit del file**

```bash
git add supabase/migrations/20260720151000_backfill_gruppo_attivita.sql
git commit -m "feat(tassonomia): backfill gruppo_attivita, canonicalizzazione, fix committente (alias preservati)"
```

- [ ] **Step 3 (MAIN SESSION, checkpoint): pre-verifica, applicazione, post-verifica**

PRIMA di applicare, fotografa la baseline di regressione (filtro export attuale):

```sql
select count(*) as baseline_export from interventi
where stato='completato'
  and (committente='lim_massive' or intervento_tipo ilike '%limitaz%' or intervento_tipo ilike '%massiv%');
```

Applica la migration via MCP. POI verifica:

```sql
-- 1) copertura: quanti classificati / non classificati
select gruppo_attivita, count(*) from interventi group by 1 order by 2 desc;
-- Atteso: gruppi valorizzati sul grosso; NULL residuo = storico con tipo vuoto/ignoto (riportare il numero).

-- 2) regressione export: NON deve scendere sotto baseline_export
select count(*) as post_export from interventi
where stato='completato'
  and (committente='lim_massive' or intervento_tipo ilike '%limitaz%' or intervento_tipo ilike '%massiv%');

-- 3) lim_massive intatto
select count(*) from interventi where committente='lim_massive';
-- Atteso: 2114 (1892 manuale + 222 import), invariato.

-- 4) niente descrizioni "quasi uguali" residue: ogni tipo mappato è già canonico
select count(*) from interventi i
join attivita_tassonomia t
  on t.descrizione_norm = attivita_norm(i.intervento_tipo)
 and t.committente = case when i.committente='lim_massive' then 'acea' else i.committente end
where i.intervento_tipo <> t.descrizione;
-- Atteso: 0.
```

Se `post_export < baseline_export`: STOP, indagare prima di procedere (non dovrebbe accadere: le canoniche massive contengono tutte "limitaz"/"massiv").

---

### Task 4: Parser — riconoscere descrizione e gruppo attività

**Files:**
- Modify: `utils/routing/excelParser.ts` (riga 176 `attivita`; blocco formato "Massiva" righe 110-156; `ColMap` righe 56-75; costruzione task righe 284-308)
- Modify: `utils/routing/types.ts` (riga 23 circa, dopo `attivita`)
- Test: `utils/routing/excelParser.test.ts` (esiste? se non esiste, crearlo)

**Interfaces:**
- Produces: `Task.attivita` valorizzato anche con header `Operazione testo breve` / `DESCRIZIONE ATTIVITÀ`; nuovo campo `Task.gruppoFile?: string` (colonna `GRUPPO ATTIVITA'` del template, usata solo per il check di coerenza in import).

- [ ] **Step 1: Scrivi i test (funzione `detectFormat` esportata)**

```typescript
// utils/routing/excelParser.test.ts (aggiungere al file se esiste, altrimenti crearlo)
import { describe, it, expect } from 'vitest';
import { detectFormat } from './excelParser';

describe('detectFormat — colonna attività', () => {
  const base = ['Ordine', 'Indirizzo', 'Località', 'cap', 'matricola'];
  it("riconosce 'Operazione testo breve' (estrazioni ACEA)", () => {
    const m = detectFormat([...base, 'Operazione testo breve']);
    expect(m?.attivita).toBe(5);
  });
  it("riconosce 'DESCRIZIONE ATTIVITÀ' (template import)", () => {
    const m = detectFormat([...base, 'DESCRIZIONE ATTIVITÀ']);
    expect(m?.attivita).toBe(5);
  });
  it("riconosce la colonna GRUPPO ATTIVITA' del template", () => {
    const m = detectFormat([...base, 'DESCRIZIONE ATTIVITÀ', "GRUPPO ATTIVITA'"]);
    expect(m?.gruppoFile).toBe(6);
  });
  it("i pattern storici restano validi ('attività')", () => {
    const m = detectFormat([...base, 'Attività']);
    expect(m?.attivita).toBe(5);
  });
});
```

- [ ] **Step 2: Esegui → FAIL**

Run: `npx vitest run utils/routing/excelParser.test.ts`
Expected: FAIL (`gruppoFile` non esiste; 'Operazione testo breve' non riconosciuta).

- [ ] **Step 3: Implementa**

In `utils/routing/excelParser.ts`:

1. In `ColMap` aggiungi `gruppoFile: number | null;` (dopo `attivita`).
2. Riga 176, sostituisci il pattern `attivita` e aggiungi `gruppoFile`:

```typescript
    attivita: findCol(headers, [
      /^descrizione attivit/,       // template import (nuovo)
      /^operazione testo breve$/,   // estrazioni ACEA / master DUNNING
      /^attivit/, /^tipo.*(odl|servizio|intervento)/, /^servizio$/, /^tipo$/,
    ]),
    gruppoFile: findCol(headers, [/^gruppo attivit/]),
```

3. Nei DUE rami del formato "Massiva" (righe ~111-155) e nel ramo ATTGIORN (righe ~86-108): aggiungi `gruppoFile: null,` accanto ad `attivita` (ATTGIORN mantiene `attivita: ATTGIORN_COL.ATTIVITA`); nel formato Massiva sostituisci `attivita: null` con `attivita: findCol(headers, [/^descrizione attivit/, /^operazione testo breve$/])` (gli export >80 colonne possono avere l'operazione con header leggibile).
4. Nella costruzione del task (riga ~299) aggiungi dopo `attivita`:

```typescript
      gruppoFile: colMap.gruppoFile != null ? (str(row[colMap.gruppoFile]) || undefined) : undefined,
```

In `utils/routing/types.ts`, dopo `attivita?: string;`:

```typescript
  /** Colonna GRUPPO ATTIVITA' del template import (solo check di coerenza; il server la ricalcola). */
  gruppoFile?: string;
```

- [ ] **Step 4: Esegui → PASS**

Run: `npx vitest run utils/routing/excelParser.test.ts`
Expected: PASS. Poi `npx vitest run utils/routing` per non aver rotto gli altri test del modulo.

- [ ] **Step 5: Commit**

```bash
git add utils/routing/excelParser.ts utils/routing/excelParser.test.ts utils/routing/types.ts
git commit -m "feat(parser): riconosce Operazione testo breve / DESCRIZIONE ATTIVITA' + colonna gruppo del template"
```

---

### Task 5: Validazione import (pura)

**Files:**
- Create: `lib/attivita/validaImport.ts`
- Test: `lib/attivita/validaImport.test.ts`

**Interfaces:**
- Consumes: `risolviGruppo`, `buildTassonomiaIndex`, `TassonomiaRiga` (Task 2); `Task` da `@/utils/routing/types`.
- Produces (usati dal Task 6):
  - `type ErroreImport = { tipo: 'descrizione_mancante' | 'descrizione_sconosciuta' | 'gruppo_incoerente'; valore: string; righe: number[]; atteso?: string }`
  - `type EsitoValidazione = { ok: true; righe: Array<{ task: Task; descrizioneCanonica: string; gruppo: string }> } | { ok: false; errori: ErroreImport[] }`
  - `validaImport(tasks: Task[], committente: string, index: Map<string, TassonomiaRiga>): EsitoValidazione`

- [ ] **Step 1: Scrivi i test**

```typescript
// lib/attivita/validaImport.test.ts
import { describe, it, expect } from 'vitest';
import { validaImport } from './validaImport';
import { buildTassonomiaIndex, type TassonomiaRiga } from './tassonomia';
import type { Task } from '@/utils/routing/types';

const T = (over: Partial<Task>): Task => ({
  id: 'row-1', ordine: 1, odl: '1', indirizzo: 'VIA DI PROVA 1', cap: '00000', citta: 'COMUNE DEMO',
  priorita: 0, fascia_oraria: '', ...over,
} as Task);

const index = buildTassonomiaIndex([
  { committente: 'acea', descrizione: 'Limitazione Massiva su Impianto', descrizioneNorm: 'LIMITAZIONE MASSIVA SU IMPIANTO', gruppo: 'LIMITAZIONI MASSIVE', attivo: true },
  { committente: 'acea', descrizione: 'Sospensione fornitura', descrizioneNorm: 'SOSPENSIONE FORNITURA', gruppo: 'DUNNING', attivo: true },
] as TassonomiaRiga[]);

describe('validaImport', () => {
  it('file valido: righe arricchite con canonica e gruppo', () => {
    const esito = validaImport([T({ attivita: ' limitazione massiva su impianto ' })], 'acea', index);
    expect(esito.ok).toBe(true);
    if (esito.ok) {
      expect(esito.righe[0].descrizioneCanonica).toBe('Limitazione Massiva su Impianto');
      expect(esito.righe[0].gruppo).toBe('LIMITAZIONI MASSIVE');
    }
  });
  it('descrizione mancante → errore con righe (1-based dal campo ordine)', () => {
    const esito = validaImport([T({ attivita: '' }), T({ ordine: 2, attivita: undefined })], 'acea', index);
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.errori[0].tipo).toBe('descrizione_mancante');
      expect(esito.errori[0].righe).toEqual([1, 2]);
    }
  });
  it('descrizione sconosciuta → errore aggregato per valore', () => {
    const esito = validaImport(
      [T({ attivita: 'ATTIVITA INVENTATA' }), T({ ordine: 2, attivita: 'attivita inventata' })],
      'acea', index,
    );
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.errori).toHaveLength(1);
      expect(esito.errori[0].tipo).toBe('descrizione_sconosciuta');
      expect(esito.errori[0].righe).toEqual([1, 2]);
    }
  });
  it('gruppo del file incoerente col derivato → errore con atteso', () => {
    const esito = validaImport([T({ attivita: 'Sospensione fornitura', gruppoFile: 'LIMITAZIONI MASSIVE' })], 'acea', index);
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.errori[0].tipo).toBe('gruppo_incoerente');
      expect(esito.errori[0].atteso).toBe('DUNNING');
    }
  });
  it('gruppo del file uguale (case-insensitive) → ok', () => {
    const esito = validaImport([T({ attivita: 'Sospensione fornitura', gruppoFile: 'dunning' })], 'acea', index);
    expect(esito.ok).toBe(true);
  });
  it('UN solo errore invalida TUTTO il file (nessun parziale)', () => {
    const esito = validaImport(
      [T({ attivita: 'Sospensione fornitura' }), T({ ordine: 2, attivita: 'IGNOTA' })],
      'acea', index,
    );
    expect(esito.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui → FAIL**

Run: `npx vitest run lib/attivita/validaImport.test.ts`
Expected: FAIL (modulo inesistente).

- [ ] **Step 3: Implementa**

```typescript
// lib/attivita/validaImport.ts
// PURA: validazione bloccante dell'import contro la tassonomia (spec §6).
// Un solo errore → l'INTERO file è rifiutato (nessun import parziale).
import type { Task } from '@/utils/routing/types';
import { chiaveTassonomia, risolviGruppo, type TassonomiaRiga } from './tassonomia';

export type ErroreImport = {
  tipo: 'descrizione_mancante' | 'descrizione_sconosciuta' | 'gruppo_incoerente';
  valore: string;      // il testo incriminato ('' per descrizione_mancante)
  righe: number[];     // numeri riga dal campo Task.ordine (ordine nel file)
  atteso?: string;     // solo gruppo_incoerente: il gruppo derivato dalla tassonomia
};

export type EsitoValidazione =
  | { ok: true; righe: Array<{ task: Task; descrizioneCanonica: string; gruppo: string }> }
  | { ok: false; errori: ErroreImport[] };

export function validaImport(
  tasks: Task[],
  committente: string,
  index: Map<string, TassonomiaRiga>,
): EsitoValidazione {
  const righeOk: Array<{ task: Task; descrizioneCanonica: string; gruppo: string }> = [];
  const mancanti: number[] = [];
  const sconosciute = new Map<string, number[]>();   // chiave norm → righe
  const incoerenti: ErroreImport[] = [];

  for (const t of tasks ?? []) {
    const riga = t.ordine;
    const descr = String(t.attivita ?? '').trim();
    if (!descr) { mancanti.push(riga); continue; }
    const ris = risolviGruppo(committente, descr, index);
    if (!ris) {
      const k = chiaveTassonomia(descr);
      if (!sconosciute.has(k)) sconosciute.set(k, []);
      sconosciute.get(k)!.push(riga);
      continue;
    }
    const gruppoFile = String(t.gruppoFile ?? '').trim();
    if (gruppoFile && gruppoFile.toUpperCase() !== ris.gruppo.toUpperCase()) {
      incoerenti.push({ tipo: 'gruppo_incoerente', valore: gruppoFile, righe: [riga], atteso: ris.gruppo });
      continue;
    }
    righeOk.push({ task: t, descrizioneCanonica: ris.descrizione, gruppo: ris.gruppo });
  }

  const errori: ErroreImport[] = [];
  if (mancanti.length) errori.push({ tipo: 'descrizione_mancante', valore: '', righe: mancanti });
  for (const [k, righe] of sconosciute) errori.push({ tipo: 'descrizione_sconosciuta', valore: k, righe });
  errori.push(...incoerenti);

  return errori.length > 0 ? { ok: false, errori } : { ok: true, righe: righeOk };
}
```

- [ ] **Step 4: Esegui → PASS**

Run: `npx vitest run lib/attivita/validaImport.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/attivita/validaImport.ts lib/attivita/validaImport.test.ts
git commit -m "feat(import): validazione bloccante contro la tassonomia (rifiuto totale, errori strutturati)"
```

---

### Task 6: Route import — 422 + arricchimento

**Files:**
- Create: `lib/attivita/caricaTassonomia.ts`
- Modify: `app/api/interventi/import/route.ts` (righe 20-36 `taskToDescrittivi`; righe 71-92 dopo il parse)

**Interfaces:**
- Consumes: `validaImport` (Task 5), `buildTassonomiaIndex`, `TassonomiaRiga` (Task 2).
- Produces: `caricaTassonomia(): Promise<TassonomiaRiga[]>` (usata anche dai Task 8, 9, 10); risposta `422 { error: 'file_non_conforme', errori: ErroreImport[] }` per la UI (Task 7).

- [ ] **Step 1: Crea il loader (thin, niente test: solo I/O)**

```typescript
// lib/attivita/caricaTassonomia.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { TassonomiaRiga } from './tassonomia';

/** Carica le righe di tassonomia (anche non attive: filtra buildTassonomiaIndex). */
export async function caricaTassonomia(): Promise<TassonomiaRiga[]> {
  const { data, error } = await supabaseAdmin
    .from('attivita_tassonomia')
    .select('committente, descrizione, descrizione_norm, gruppo, attivo');
  if (error) throw error;
  return ((data ?? []) as Array<{ committente: string; descrizione: string; descrizione_norm: string; gruppo: string; attivo: boolean }>)
    .map((r) => ({
      committente: r.committente,
      descrizione: r.descrizione,
      descrizioneNorm: r.descrizione_norm,
      gruppo: r.gruppo,
      attivo: r.attivo,
    }));
}
```

- [ ] **Step 2: Aggancia la validazione nella route**

In `app/api/interventi/import/route.ts`:

1. Import in testa:

```typescript
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';
import { buildTassonomiaIndex } from '@/lib/attivita/tassonomia';
import { validaImport } from '@/lib/attivita/validaImport';
```

2. Dopo il blocco `if (tasks.length === 0) …` (riga ~82), PRIMA della dedup:

```typescript
    // Guardrail tassonomia (spec §6): il file è accettato SOLO se ogni riga ha una
    // descrizione attività riconosciuta; un solo errore rifiuta TUTTO il file.
    const index = buildTassonomiaIndex(await caricaTassonomia());
    const esito = validaImport(tasks, committente, index);
    if (!esito.ok) {
      return NextResponse.json({ error: 'file_non_conforme', errori: esito.errori }, { status: 422 });
    }
    // Da qui in poi si lavora con descrizione CANONICA + gruppo derivato.
    const arricchiti = new Map<Task, { descrizioneCanonica: string; gruppo: string }>();
    for (const r of esito.righe) arricchiti.set(r.task, { descrizioneCanonica: r.descrizioneCanonica, gruppo: r.gruppo });
```

3. `taskToDescrittivi` diventa parametrico (riga 21):

```typescript
function taskToDescrittivi(t: Task, extra?: { descrizioneCanonica: string; gruppo: string }) {
  return {
    odl: nrm(t.odl),
    pdr: nrm(t.pdr),
    nominativo: nrm(t.nominativo),
    matricola_contatore: nrm(t.matricola),
    indirizzo: nrm(t.indirizzo),
    comune: nrm(t.citta),
    cap: nrm(t.cap),
    fascia_oraria: nrm(t.fascia_oraria),
    codice_servizio: nrm(t.codice),
    intervento_tipo: extra ? extra.descrizioneCanonica : nrm(t.attivita),
    gruppo_attivita: extra ? extra.gruppo : null,
    lat: typeof t.lat === 'number' ? t.lat : null,
    lng: typeof t.lng === 'number' ? t.lng : null,
  };
}
```

4. Nei due siti d'uso (riga ~110 `baseRiga` e riga ~126 `toUpdate`), passa l'arricchimento:

```typescript
    const baseRiga = (t: Task) => ({
      ...taskToDescrittivi(t, arricchiti.get(t)),
      committente,
      data,
      lotto,
      import_batch_id: batchId,
    });
```

e

```typescript
      .map(([odl, t]) => ({ id: esistenti.get(odl)!, descrittivi: { ...taskToDescrittivi(t, arricchiti.get(t)), import_batch_id: batchId } }));
```

- [ ] **Step 3: Verifica che compili e che i test del modulo passino**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "app/api/interventi/import"` → nessun errore nuovo.
Run: `npx vitest run lib/attivita` → PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/attivita/caricaTassonomia.ts app/api/interventi/import/route.ts
git commit -m "feat(import): rifiuto 422 file non conforme + intervento_tipo canonico e gruppo_attivita"
```

---

### Task 7: UI import — modale errore + bottone template

**Files:**
- Create: `components/modules/interventi/ModaleErroreImport.tsx`
- Modify: `app/hub/interventi/page.tsx` (handler del submit: dove gestisce `!res.ok`)

**Interfaces:**
- Consumes: payload 422 `{ error: 'file_non_conforme', errori: ErroreImport[] }` (Task 6); endpoint `GET /api/interventi/template` (Task 8, il bottone può precedere: il link darà 404 finché il Task 8 non è deployato nello stesso branch).

- [ ] **Step 1: Crea la modale (presentational, nessuna fetch)**

```tsx
// components/modules/interventi/ModaleErroreImport.tsx
'use client';

import type { ErroreImport } from '@/lib/attivita/validaImport';

const TITOLI: Record<ErroreImport['tipo'], string> = {
  descrizione_mancante: 'Righe senza descrizione attività',
  descrizione_sconosciuta: 'Descrizione attività non riconosciuta',
  gruppo_incoerente: 'Gruppo attività non coerente',
};

/** Elenca al massimo 8 numeri riga, poi "e altre N". */
function righeLabel(righe: number[]): string {
  const prime = righe.slice(0, 8).join(', ');
  return righe.length > 8 ? `${prime} e altre ${righe.length - 8}` : prime;
}

export function ModaleErroreImport({ errori, onClose }: { errori: ErroreImport[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">File rifiutato</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Il file non rispetta la tassonomia attività: correggi le righe indicate e ricaricalo.
          Nessuna riga è stata importata.
        </p>
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
          {errori.map((e, i) => (
            <li key={i} className="rounded-lg border border-red-200 bg-red-50 p-2 dark:border-red-900 dark:bg-red-950/40">
              <div className="font-medium">{TITOLI[e.tipo]}</div>
              {e.valore ? <div className="font-mono text-xs">«{e.valore}»</div> : null}
              {e.atteso ? <div className="text-xs">Atteso: «{e.atteso}»</div> : null}
              <div className="text-xs text-zinc-500">Righe file: {righeLabel(e.righe)}</div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          Le descrizioni valide sono nel foglio «Leggenda» del template scaricabile.
        </p>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white hover:bg-zinc-700">
            Ho capito
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Aggancia nella pagina import**

In `app/hub/interventi/page.tsx`:
1. Individua l'handler del submit: `grep -n "res.ok\|response.ok\|fetch(" app/hub/interventi/page.tsx`.
2. Aggiungi stato + import in testa al componente client:

```tsx
import { ModaleErroreImport } from '@/components/modules/interventi/ModaleErroreImport';
import type { ErroreImport } from '@/lib/attivita/validaImport';
// nello stato del componente:
const [erroriImport, setErroriImport] = useState<ErroreImport[] | null>(null);
```

3. Nel ramo `!res.ok` dell'handler, PRIMA della gestione errore generica:

```tsx
      if (res.status === 422) {
        const body = await res.json().catch(() => null);
        if (body?.error === 'file_non_conforme' && Array.isArray(body.errori)) {
          setErroriImport(body.errori);
          return; // niente messaggio generico: la modale spiega tutto
        }
      }
```

4. Nel JSX, accanto al bottone di upload, il link template:

```tsx
<a
  href="/api/interventi/template"
  className="text-sm underline text-zinc-600 hover:text-zinc-900 dark:text-zinc-300"
  download
>
  Scarica template
</a>
```

5. In fondo al JSX: `{erroriImport ? <ModaleErroreImport errori={erroriImport} onClose={() => setErroriImport(null)} /> : null}`

- [ ] **Step 3: Verifica compilazione**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "hub/interventi|ModaleErroreImport"` → nessun errore nuovo.

- [ ] **Step 4: Commit**

```bash
git add components/modules/interventi/ModaleErroreImport.tsx app/hub/interventi/page.tsx
git commit -m "feat(import-ui): modale di rifiuto file non conforme + link scarica template"
```

---

### Task 8: Template Excel (builder puro + route)

**Files:**
- Create: `lib/attivita/templateImport.ts`
- Create: `app/api/interventi/template/route.ts`
- Test: `lib/attivita/templateImport.test.ts`

**Interfaces:**
- Consumes: `TassonomiaRiga` (Task 2); exceljs (dipendenza già presente).
- Produces: `buildTemplateImport(tassonomia: TassonomiaRiga[], righeDati?: number): Promise<Buffer>`; endpoint `GET /api/interventi/template` (autenticato con `requireUser`, come l'import).

- [ ] **Step 1: Scrivi i test (struttura del workbook prodotto)**

```typescript
// lib/attivita/templateImport.test.ts
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildTemplateImport, COLONNE_TEMPLATE } from './templateImport';
import type { TassonomiaRiga } from './tassonomia';

const TASSONOMIA: TassonomiaRiga[] = [
  { committente: 'acea', descrizione: 'Limitazione Massiva su Impianto', descrizioneNorm: 'LIMITAZIONE MASSIVA SU IMPIANTO', gruppo: 'LIMITAZIONI MASSIVE', attivo: true },
  { committente: 'italgas', descrizione: 'BONIFICHE', descrizioneNorm: 'BONIFICHE', gruppo: 'BONIFICHE', attivo: true },
  { committente: 'italgas', descrizione: 'RITIRATA', descrizioneNorm: 'RITIRATA', gruppo: 'X', attivo: false },
];

async function carica(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

describe('buildTemplateImport', () => {
  it('due fogli: Interventi e Leggenda', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Interventi', 'Leggenda']);
  });
  it('header del foglio Interventi = COLONNE_TEMPLATE', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA));
    const ws = wb.getWorksheet('Interventi')!;
    const header = (ws.getRow(1).values as unknown[]).slice(1).map(String);
    expect(header).toEqual([...COLONNE_TEMPLATE]);
  });
  it('la colonna GRUPPO ha la formula di lookup sulla Leggenda', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA, 5));
    const ws = wb.getWorksheet('Interventi')!;
    const idxGruppo = COLONNE_TEMPLATE.indexOf("GRUPPO ATTIVITA'") + 1;
    const cell = ws.getRow(2).getCell(idxGruppo);
    expect(String((cell.value as { formula?: string })?.formula ?? '')).toContain('VLOOKUP');
  });
  it('la Leggenda contiene solo righe attive, con chiave upper in colonna A', async () => {
    const wb = await carica(await buildTemplateImport(TASSONOMIA));
    const ws = wb.getWorksheet('Leggenda')!;
    const valori: string[] = [];
    for (let r = 2; r <= ws.rowCount; r++) valori.push(String(ws.getRow(r).getCell(2).value ?? ''));
    expect(valori).toContain('Limitazione Massiva su Impianto');
    expect(valori).toContain('BONIFICHE');
    expect(valori).not.toContain('RITIRATA');
    expect(String(ws.getRow(2).getCell(1).value)).toBe(String(ws.getRow(2).getCell(2).value).toUpperCase());
  });
});
```

(Nota: `载` è solo un helper locale di load, rinominalo `carica` nell'implementazione reale del test.)

- [ ] **Step 2: Esegui → FAIL**

Run: `npx vitest run lib/attivita/templateImport.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementa**

```typescript
// lib/attivita/templateImport.ts
// Builder del template di import (spec §5): 2 fogli. Il GRUPPO nel file è "di conforto"
// (formula VLOOKUP sulla Leggenda, si svuota se la descrizione è sbagliata); la verità
// resta la validazione server (validaImport).
import ExcelJS from 'exceljs';
import type { TassonomiaRiga } from './tassonomia';

export const COLONNE_TEMPLATE = [
  'ODL/ODS', 'PDR', 'MATRICOLA', 'NOMINATIVO', 'INDIRIZZO', 'COMUNE', 'CAP',
  'DESCRIZIONE ATTIVITÀ', "GRUPPO ATTIVITA'",
] as const;

const RIGHE_DEFAULT = 300;

export async function buildTemplateImport(
  tassonomia: TassonomiaRiga[],
  righeDati: number = RIGHE_DEFAULT,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet('Interventi');
  ws.addRow([...COLONNE_TEMPLATE]);
  ws.getRow(1).font = { bold: true };
  const colDescr = COLONNE_TEMPLATE.indexOf('DESCRIZIONE ATTIVITÀ') + 1;
  const colGruppo = COLONNE_TEMPLATE.indexOf("GRUPPO ATTIVITA'") + 1;
  const letteraDescr = ws.getColumn(colDescr).letter;
  for (let r = 2; r <= righeDati + 1; r++) {
    // UPPER+TRIM avvicina la chiave della Leggenda (che è l'upper della canonica).
    ws.getRow(r).getCell(colGruppo).value = {
      formula: `IFERROR(VLOOKUP(UPPER(TRIM(${letteraDescr}${r})),Leggenda!$A:$C,3,FALSE),"")`,
    } as ExcelJS.CellFormulaValue;
  }
  ws.columns.forEach((c) => { c.width = 22; });

  const attive = (tassonomia ?? []).filter((t) => t.attivo);
  const wl = wb.addWorksheet('Leggenda');
  wl.addRow(['CHIAVE', 'DESCRIZIONE ATTIVITÀ', 'GRUPPO', 'COMMITTENTE']);
  wl.getRow(1).font = { bold: true };
  for (const t of attive) {
    wl.addRow([t.descrizione.toUpperCase(), t.descrizione, t.gruppo, t.committente.toUpperCase()]);
  }
  wl.columns.forEach((c) => { c.width = 40; });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
```

```typescript
// app/api/interventi/template/route.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';
import { buildTemplateImport } from '@/lib/attivita/templateImport';

export const runtime = 'nodejs';

/** GET /api/interventi/template — template Excel con Leggenda sempre allineata alla tassonomia. */
export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const buf = await buildTemplateImport(await caricaTassonomia());
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template-import-interventi.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
```

- [ ] **Step 4: Esegui → PASS**

Run: `npx vitest run lib/attivita/templateImport.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/attivita/templateImport.ts lib/attivita/templateImport.test.ts app/api/interventi/template/route.ts
git commit -m "feat(template): xlsx 2 fogli con leggenda dalla tassonomia e gruppo auto via formula"
```

---

### Task 9: Flusso pianificazione — derivazione soft

**Files:**
- Modify: `lib/interventi/taskToIntervento.ts` (riga ~27 tipo record; riga ~49 mapping)
- Modify: chiamanti di `taskToIntervento` (individuati con `grep -rn "taskToIntervento(" lib/ app/ --include=*.ts`) per passare l'indice
- Test: `lib/interventi/taskToIntervento.test.ts` (esistente, estendere)

**Interfaces:**
- Consumes: `risolviGruppo`, `buildTassonomiaIndex` (Task 2).
- Produces: `taskToIntervento(task, ctx, indiceTassonomia?)` — parametro opzionale `indiceTassonomia?: Map<string, TassonomiaRiga>`; quando il lookup risolve, scrive `intervento_tipo` canonico + `gruppo_attivita`; quando NON risolve, comportamento identico a oggi (`task.attivita`, gruppo null). **Nessun blocco**: la pianificazione non si ferma (spec §8 — visibilità via guard).

- [ ] **Step 1: Estendi i test esistenti**

Aggiungi in `lib/interventi/taskToIntervento.test.ts`:

```typescript
import { buildTassonomiaIndex, type TassonomiaRiga } from '@/lib/attivita/tassonomia';

const INDICE = buildTassonomiaIndex([
  { committente: 'acea', descrizione: 'Limitazione Massiva su Impianto', descrizioneNorm: 'LIMITAZIONE MASSIVA SU IMPIANTO', gruppo: 'LIMITAZIONI MASSIVE', attivo: true },
] as TassonomiaRiga[]);

describe('taskToIntervento — tassonomia', () => {
  it('attività riconosciuta → canonica + gruppo_attivita', () => {
    const r = taskToIntervento(task({ attivita: ' limitazione massiva su impianto ' }), ctx(), INDICE);
    expect(r.intervento_tipo).toBe('Limitazione Massiva su Impianto');
    expect(r.gruppo_attivita).toBe('LIMITAZIONI MASSIVE');
  });
  it('attività ignota → comportamento storico, gruppo null (soft)', () => {
    const r = taskToIntervento(task({ attivita: 'QUALCOSA' }), ctx(), INDICE);
    expect(r.intervento_tipo).toBe('QUALCOSA');
    expect(r.gruppo_attivita).toBeNull();
  });
  it('senza indice → gruppo null, nessun errore', () => {
    const r = taskToIntervento(task({ attivita: 'X' }), ctx());
    expect(r.gruppo_attivita).toBeNull();
  });
});
```

(`task()` e `ctx()` sono gli helper già presenti nel file di test; adeguare i nomi a quelli reali.)

- [ ] **Step 2: Esegui → FAIL**

Run: `npx vitest run lib/interventi/taskToIntervento.test.ts`
Expected: FAIL (`gruppo_attivita` non esiste; terzo parametro assente).

- [ ] **Step 3: Implementa**

In `lib/interventi/taskToIntervento.ts`: aggiungi al tipo record `gruppo_attivita: string | null;`, aggiungi il terzo parametro opzionale e sostituisci la riga 49:

```typescript
import { risolviGruppo, type TassonomiaRiga } from '@/lib/attivita/tassonomia';

// firma: taskToIntervento(task, ctx, indiceTassonomia?: Map<string, TassonomiaRiga>)
// nel body, al posto di `intervento_tipo: task.attivita ?? null`:
    ...(function classifica() {
      const ris = indiceTassonomia ? risolviGruppo(ctx.committente ?? 'acea', task.attivita, indiceTassonomia) : null;
      return {
        intervento_tipo: ris ? ris.descrizione : (task.attivita ?? null),
        gruppo_attivita: ris ? ris.gruppo : null,
      };
    })(),
```

(Se `ctx` non porta il committente, usare la costante già in uso nel chiamante — il flusso mappa è ACEA: `'acea'`. Verificare nel file reale e adeguare, mantenendo il default storico.)

Nei chiamanti individuati (attesi: `lib/interventi/planInterventiForPiano.ts` o `ensureInterventiForPiano.ts`): caricare `caricaTassonomia()` una volta per giro e passare `buildTassonomiaIndex(...)`. Se il chiamante è puro (planInterventi), il caricamento sta nel wrapper I/O (`ensureInterventiForPiano`) e l'indice viaggia come parametro opzionale con default `undefined`.

- [ ] **Step 4: Esegui → PASS (modulo intero)**

Run: `npx vitest run lib/interventi`
Expected: PASS (inclusi i test esistenti non toccati).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/taskToIntervento.ts lib/interventi/taskToIntervento.test.ts lib/interventi/planInterventiForPiano.ts lib/interventi/ensureInterventiForPiano.ts
git commit -m "feat(piano): derivazione soft gruppo_attivita + canonica nel flusso pianificazione"
```

---

### Task 10: Inserimento manuale — obbligo su tutti i percorsi

**Files:**
- Modify: `components/modules/rapportini/ModaleInterventoManuale.tsx` (campo attività → select obbligatoria)
- Modify: `components/modules/rapportini/RapportinoForm.tsx` (prop `tassonomia` pass-through)
- Modify: `app/r/[token]/page.tsx` (riga ~281: carica e passa `tassonomia`)
- Modify: `app/api/r/[token]/intervento-manuale/route.ts` (validazione server + gruppo)
- Modify: `lib/interventi/manuali/richiestaToIntervento.ts` (campo `gruppo_attivita`)
- Test: `lib/interventi/manuali/richiestaToIntervento.test.ts` (estendere)

**Interfaces:**
- Consumes: `risolviGruppo`, `buildTassonomiaIndex`, `TassonomiaRiga`, `caricaTassonomia`.
- Produces: `richiestaToIntervento(dati, ctx, indice?)` con `gruppo_attivita: string | null` nel record; la modale riceve `tassonomia: TassonomiaRiga[]` e rende la select obbligatoria.

- [ ] **Step 1: Estendi i test di richiestaToIntervento**

```typescript
// in lib/interventi/manuali/richiestaToIntervento.test.ts
import { buildTassonomiaIndex, type TassonomiaRiga } from '@/lib/attivita/tassonomia';

const INDICE = buildTassonomiaIndex([
  { committente: 'acea', descrizione: 'LIMITAZIONI MASSIVE', descrizioneNorm: 'LIMITAZIONI MASSIVE', gruppo: 'LIMITAZIONI MASSIVE', attivo: true },
] as TassonomiaRiga[]);

it('lim_massive + attività riconosciuta → canonica + gruppo', () => {
  const r = richiestaToIntervento(dati({ anagrafica: { attivita: ' limitazioni  massive ' } }), ctx({ committente: 'lim_massive' }), INDICE);
  expect(r.intervento_tipo).toBe('LIMITAZIONI MASSIVE');
  expect(r.gruppo_attivita).toBe('LIMITAZIONI MASSIVE');
});
it('attività ignota → testo com''è, gruppo null (retro-compat coda offline)', () => {
  const r = richiestaToIntervento(dati({ anagrafica: { attivita: 'LIBERA' } }), ctx({ committente: 'altro' }), INDICE);
  expect(r.intervento_tipo).toBe('LIBERA');
  expect(r.gruppo_attivita).toBeNull();
});
```

(`dati()`/`ctx()` = helper del file di test esistente; adeguare i nomi.)

- [ ] **Step 2: Esegui → FAIL**

Run: `npx vitest run lib/interventi/manuali/richiestaToIntervento.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementa richiestaToIntervento**

In `lib/interventi/manuali/richiestaToIntervento.ts`: aggiungi al tipo `InterventoManualeRecord` il campo `gruppo_attivita: string | null;`, terzo parametro `indice?: Map<string, TassonomiaRiga>` e sostituisci la riga 68:

```typescript
import { risolviGruppo, type TassonomiaRiga } from '@/lib/attivita/tassonomia';
// nel return:
    ...(function classifica() {
      const ris = indice ? risolviGruppo(ctx.committente, a.attivita, indice) : null;
      return {
        intervento_tipo: ris ? ris.descrizione : trimOrNull(a.attivita),
        gruppo_attivita: ris ? ris.gruppo : null,
      };
    })(),
```

- [ ] **Step 4: Validazione server nella route**

In `app/api/r/[token]/intervento-manuale/route.ts`, nel punto in cui i dati sono validati (dopo `anagraficaValida`, individuare con `grep -n "anagraficaValida" app/api/r/\[token\]/intervento-manuale/route.ts`):

```typescript
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';
import { buildTassonomiaIndex, risolviGruppo } from '@/lib/attivita/tassonomia';
import { attivitaDefaultManuale } from '@/lib/interventi/manuali/attivitaPerCommittente';

    // Obbligo descrizione attività (spec §7) con retro-compat per la coda offline:
    // i payload vecchi (senza attività) usano il default storico del committente;
    // un'attività PRESENTE ma fuori tassonomia è un errore (client nuovo → lista chiusa).
    const indiceTassonomia = buildTassonomiaIndex(await caricaTassonomia());
    const attivitaRaw = String(dati.anagrafica?.attivita ?? '').trim()
      || attivitaDefaultManuale(dati.committente) || '';
    if (!attivitaRaw) {
      return NextResponse.json({ error: 'attivita_obbligatoria' }, { status: 400 });
    }
    if (!risolviGruppo(dati.committente, attivitaRaw, indiceTassonomia)) {
      return NextResponse.json({ error: 'attivita_sconosciuta', attivita: attivitaRaw }, { status: 400 });
    }
    dati.anagrafica.attivita = attivitaRaw;
```

e passare `indiceTassonomia` alla chiamata `richiestaToIntervento(...)` (individuare con grep nello stesso file).

- [ ] **Step 5: UI — select obbligatoria nella modale**

1. `app/r/[token]/page.tsx`: la pagina è un server component; aggiungi il caricamento e il pass-through:

```typescript
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';
// nel body async del componente:
const tassonomia = await caricaTassonomia().catch(() => []);
// alla riga ~281, nuovo prop:
<RapportinoForm ... tassonomia={tassonomia} />
```

2. `RapportinoForm.tsx`: aggiungi il prop `tassonomia?: TassonomiaRiga[]` e passalo dove monta `ModaleInterventoManuale` e `FabInterventoManuale` (individuare con `grep -n "ModaleInterventoManuale\|FabInterventoManuale" components/modules/rapportini/RapportinoForm.tsx`).
   Poi censisci TUTTI i siti di mount della modale nel repo — `grep -rn "ModaleInterventoManuale" components/ app/ --include=*.tsx` — e passa il prop in ognuno (atteso: RapportinoForm, FabInterventoManuale, `components/modules/lista-attesa/PannelloRevisioneRichiesta.tsx` — spec §7). Dove il contesto è un componente client senza accesso server, il prop arriva dal server component della pagina come per `/r/[token]`.
3. `ModaleInterventoManuale.tsx`: nuovo prop `tassonomia?: TassonomiaRiga[]`. Individua dove viene resa/seminata l'attività (`grep -n "attivita" components/modules/rapportini/ModaleInterventoManuale.tsx`) e sostituisci l'input libero con:

```tsx
{/* Descrizione attività: OBBLIGATORIA, lista chiusa dalla tassonomia (spec §7). */}
<label className="block text-sm font-medium">
  Descrizione attività <span className="text-red-600">*</span>
  <select
    required
    value={String(anagrafica.attivita ?? '')}
    onChange={(e) => setAnagrafica((a) => ({ ...a, attivita: e.target.value }))}
    className="mt-1 w-full rounded-lg border px-3 py-2"
  >
    <option value="">— scegli l'attività —</option>
    {opzioniAttivita.map((o) => (
      <option key={`${o.committente}|${o.descrizione}`} value={o.descrizione}>
        {o.descrizione} — {o.gruppo}
      </option>
    ))}
  </select>
</label>
```

con, sopra nel componente:

```tsx
import { committenteEquivalente } from '@/lib/attivita/tassonomia';
const opzioniAttivita = useMemo(() => {
  const ce = committente ? committenteEquivalente(committente) : null;
  const attive = (tassonomia ?? []).filter((t) => t.attivo);
  if (!ce) return [];
  if (ce === 'altro') return attive;                       // 'altro': tutte le attività note
  return attive.filter((t) => t.committente === ce);
}, [tassonomia, committente]);
```

e nel `handleInvia`, PRIMA dell'accodamento:

```tsx
    if (!String(anagrafica.attivita ?? '').trim()) {
      setErrore('Scegli la descrizione attività: è obbligatoria.');
      return;
    }
```

Mantieni la semina del default (`attivitaDefaultManuale`) come PRE-selezione quando il committente è `lim_massive` (il valore 'LIMITAZIONI MASSIVE' è in tassonomia): individuare il punto in cui è usato e lasciarlo, la select lo mostrerà già selezionato.

- [ ] **Step 6: Esegui test moduli toccati + compilazione**

Run: `npx vitest run lib/interventi/manuali` → PASS.
Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "ModaleInterventoManuale|RapportinoForm|intervento-manuale|r/\[token\]"` → nessun errore nuovo.

- [ ] **Step 7: Commit**

```bash
git add components/modules/rapportini/ModaleInterventoManuale.tsx components/modules/rapportini/RapportinoForm.tsx "app/r/[token]/page.tsx" "app/api/r/[token]/intervento-manuale/route.ts" lib/interventi/manuali/richiestaToIntervento.ts lib/interventi/manuali/richiestaToIntervento.test.ts
git commit -m "feat(manuali): descrizione attivita obbligatoria a lista chiusa su tutti i percorsi (+400 server)"
```

---

### Task 11: Guard SQL estesa

**Files:**
- Modify: `tools/limitazioni-sync/guard-limitazioni-non-esportate.sql`

- [ ] **Step 1: Aggiungi la seconda query alla guard**

In coda al file, dopo la query esistente:

```sql
-- ── Guard 2 (dal 2026-07-20): completati NON classificati dalla tassonomia ──────────
-- Caso Labico 17/07: committente='acea' con intervento_tipo VUOTO → invisibile sia al
-- filtro export sia alla Guard 1 (che riconosce solo gli stati ordine ACEA). Qui si
-- flagga OGNI completato che la tassonomia non risolve: gruppo_attivita NULL.
-- ATTESO: 0 righe con data >= 2026-07-20 (lo storico pregresso non classificabile può
-- restare NULL: è stato censito dalla migration 20260720151000).
select i.committente, coalesce(i.intervento_tipo,'') as tipo, i.comune,
       count(*) as completati,
       count(*) filter (where i.esito = 'eseguito_positivo') as positivi,
       min(i.data) as data_min, max(i.data) as data_max
from interventi i
where i.stato = 'completato'
  and i.gruppo_attivita is null
  and i.data >= '2026-07-20'
group by 1, 2, 3
order by completati desc;
```

- [ ] **Step 2: Verifica sintassi su Supabase (MAIN SESSION) e commit**

Eseguire la query su Supabase: deve tornare 0 righe (o solo righe spiegabili).

```bash
git add tools/limitazioni-sync/guard-limitazioni-non-esportate.sql
git commit -m "feat(guard): flagga completati senza gruppo_attivita (caso tipo-vuoto Labico)"
```

---

### Task 12: Verifica finale, PR

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: PASS (baseline: la suite era verde; nessun nuovo rosso nei moduli toccati).

- [ ] **Step 2: Compilazione completa**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun errore NUOVO rispetto a main (confrontare con `git stash && npx tsc --noEmit ; git stash pop` se in dubbio).

- [ ] **Step 3: Push e PR**

```bash
git push -u origin feat/motore-gruppo-attivita
gh pr create --title "Motore Gruppo attivita: tassonomia unica e guardrail import" --body "Spec: docs/superpowers/specs/2026-07-20-motore-gruppo-attivita-design.md

- tabella attivita_tassonomia (60 descrizioni, seed dal file di riferimento) + interventi.gruppo_attivita
- backfill storico: gruppo + canonicalizzazione descrizioni + fix committente (alias produzione preservati; lim_massive NON toccato)
- import: validazione bloccante 422 + modale errore + template xlsx con Leggenda
- manuali: descrizione obbligatoria a lista chiusa su tutti i percorsi (+400 server)
- pianificazione: derivazione soft gruppo/canonica
- guard SQL estesa (completati non classificati)

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 4 (MAIN SESSION): merge dopo ok utente, pull nel repo principale**

Il merge su main e il push finale richiedono l'ok esplicito dell'utente (regola repo). Dopo il merge: `git pull` nel repo principale (l'agente lim-sync gira da lì).

---

## Note per l'esecutore

- **Ordine**: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12. I task 4-5 e 8 sono paralleli tra loro dopo il 2; i checkpoint MAIN SESSION (1.3, 3.3, 11.2) vanno rispettati prima dei task che dipendono dai dati.
- I numeri di riga citati sono di main a `7d0fa6f`: verifica sempre col grep indicato prima di modificare.
- Fase 2 (NON in questo piano): filtro export agente su `gruppo_attivita`, riclassificazione `lim_massive`→`acea`, UI gestione tassonomia.
