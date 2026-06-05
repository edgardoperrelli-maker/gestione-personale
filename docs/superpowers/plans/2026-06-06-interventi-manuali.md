# Interventi Manuali — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere all'operatore di caricare interventi manuali dal rapportino digitale, con governance ibrida (approvazione admin + corsia "Liberi"), foto obbligatorie, e registro autorizzazioni; una volta approvati diventano interventi canonici.

**Architecture:** L'operatore carica via FAB una richiesta (anagrafica + esiti + foto) che — salvo corsia "Liberi" — attende l'approvazione di un admin; approvata, diventa un `interventi` canonico (`origine='manuale'`) riusando la pipeline esistente (`taskToIntervento`-style). La coda/registro/realtime lato admin riusano i pattern già presenti (`supabaseAdmin`, `requireAdmin`, `useInterventiFeed`). Le foto vanno su un bucket Supabase privato con naming deterministico. La logica decisionale (risoluzione template, mapping richiesta→intervento, naming foto, validazione, blocco-invio) è estratta in **funzioni pure testabili** con vitest.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Supabase (Postgres + Storage + Realtime) · Tailwind v4 · vitest · jszip.

**Spec di riferimento:** [docs/superpowers/specs/2026-06-06-interventi-manuali-design.md](../specs/2026-06-06-interventi-manuali-design.md)

**Branch:** `feat/interventi-manuali-operatore`

---

## Contratto condiviso (vincoli per tutti i task)

**DB client & auth:**
- `import { supabaseAdmin } from '@/lib/supabaseAdmin'` → service role, bypassa RLS. Usare nelle route server.
- Route `/api/r/[token]/*` = **pubbliche protette dal token** (NO `requireAdmin`). Pattern: leggi `rapportini` per token, valida `tokenStatus(rap, new Date().toISOString()) === 'valido'` (da `@/utils/rapportini/tokenStatus`), altrimenti `409`.
- Route admin: `import { requireAdmin } from '@/lib/apiAuth'`. Pattern: `const auth = await requireAdmin(); if (auth instanceof NextResponse) return auth; const { user } = auth;`
- Ogni route handler: `export const runtime = 'nodejs';`

**Tipi & riuso:**
- `TemplateCampo` da `@/utils/rapportini/buildVoci`: `{ chiave; etichetta; tipo: 'crocetta'|'testo'|'select'|'numero'; opzioni?; ordine }` — esteso in Fase 2 con `tipo:'foto'` e `obbligatoria?: boolean`.
- Creazione intervento canonico: pattern `@/lib/interventi/taskToIntervento` (`InterventoDaMappa`). Campi `interventi`: committente, odl, pdr, nominativo, indirizzo, comune, cap, lat, lng, fascia_oraria, matricola_contatore, intervento_tipo, data, staff_id, stato, piano_id, territorio_id, created_from_mappa, **origine** (nuovo). Manuali → `origine='manuale'`, `created_from_mappa=false`.

**Test:** vitest (`npm test` = `vitest run`). Config `vitest.config.ts` + mock `vitest.server-only-mock.js`. Privilegiare **test unit su funzioni pure**.

**Convenzione commit:** `feat(interventi-manuali): …` / `test(interventi-manuali): …`.

---

## File structure

**Nuovi — logica pura (lib/interventi/manuali/):**
- `types.ts` — tipi richiesta/foto/stati (Fase 1)
- `risolviTemplateCommittente.ts` — risoluzione template per committente + fallback (Fase 1)
- `richiestaToIntervento.ts` — mapping richiesta → record interventi (Fase 1)
- `rapportinoInviabile.ts` — calcolo "rapportino inviabile / voci in sospeso" (Fase 1)
- `fotoNaming.ts` — nome file `etichetta_identificativo` (Fase 2)
- `validaFotoObbligatorie.ts` — verifica slot obbligatori presenti (Fase 2)
- `useRichiesteManualiFeed.ts` — hook realtime coda admin (Fase 3)

**Nuovi — route operatore:**
- `app/api/r/[token]/intervento-manuale/route.ts` (Fase 1; multipart+foto in Fase 2; corsia liberi in Fase 4)
- `app/api/r/[token]/intervento-manuale/[id]/annulla/route.ts` (Fase 1)

**Nuovi — route admin:**
- `app/api/admin/interventi-manuali/route.ts` GET coda/registro (Fase 1)
- `app/api/admin/interventi-manuali/[id]/approva/route.ts` (Fase 1)
- `app/api/admin/interventi-manuali/[id]/rifiuta/route.ts` (Fase 1)
- `app/api/admin/interventi-manuali/[id]/prendi/route.ts` (Fase 3)
- `app/api/admin/interventi-manuali/[id]/rilascia/route.ts` (Fase 3)
- `app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts` (Fase 3)

**Nuovi — componenti:**
- `components/modules/rapportini/FabInterventoManuale.tsx` (Fase 1)
- `components/modules/rapportini/ModaleInterventoManuale.tsx` (Fase 1; step foto Fase 2)
- `components/modules/rapportini/CampoFoto.tsx` (Fase 2)
- `components/modules/torre/CodaRichiesteManuali.tsx` (Fase 1; realtime/presa carico Fase 3)
- `components/modules/torre/PannelloRevisioneRichiesta.tsx` (Fase 1)
- `components/modules/torre/RegistroAutorizzazioni.tsx` (Fase 3)
- `components/layout/CampanelloRichieste.tsx` (Fase 3)

**Nuovi — migrazioni SQL (supabase/migrations/):**
- `<ts>_interventi_manuali.sql` — tabella + alter voci/interventi/template (Fase 1)
- `<ts>_interventi_manuali_foto.sql` — tabella foto + bucket privato + policy (Fase 2)
- `<ts>_interventi_manuali_realtime.sql` — publication realtime (Fase 3)
- `<ts>_lucchetti_manuali_liberi.sql` — alter `mappa_piani_lucchetti` (Fase 4)

**Modifiche:**
- `utils/rapportini/buildVoci.ts` — `TemplateCampo` + foto/obbligatoria (Fase 2)
- `components/modules/rapportini/CampoInput.tsx` — tipo foto (Fase 2)
- `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` — config slot foto + committente (Fase 2)
- `app/r/[token]/page.tsx` — passa template/committenti, monta FAB+modale (Fase 1)
- `components/modules/rapportini/RapportinoLista.tsx` / `VoceFocus.tsx` — badge Sospeso/Rifiutato + blocco compilazione (Fase 1)
- `app/api/r/[token]/invia/route.ts` — blocco invio con voci `in_attesa` (Fase 1)
- `app/hub/torre/page.tsx` — monta coda (Fase 1) + registro (Fase 3)
- `components/layout/TopBar.tsx` — campanello (Fase 3)
- `components/modules/mappa/RiepilogoRapportini.tsx` / `riepilogo/CardTerritorio.tsx` — icona ZIP foto (Fase 3)
- `components/modules/mappa/ManualAssignmentsModal.tsx` + `app/api/mappa/piani/route.ts` — corsia "Liberi" (Fase 4)

---

## Implementazione (task)

## Fase 1 — Fondamenta + flusso core

> Senza foto, senza realtime, senza corsia liberi (corsia esiste a schema ma resta `normale`).
> Stack: Next.js 15 App Router, React 19, TS, Supabase (`@/lib/supabaseAdmin`), Tailwind v4, vitest.
> `npm test` = `vitest run`. Le route `/api/r/[token]/*` sono pubbliche protette dal token; le route admin usano `requireAdmin`.
> Convenzione commit: `feat(interventi-manuali): …`.

---

### Task 1.1: Migrazione SQL — tabella `interventi_manuali` + ALTER voci/interventi/template

**Files:**
- Create: `supabase/migrations/20260606000000_interventi_manuali.sql`
- Test: `lib/interventi/manuali/migrationShape.test.ts` (smoke test: il file SQL esiste e contiene gli statement chiave; non c'è DB in CI)

Il progetto non ha un harness DB in test: le migrazioni storiche non hanno test SQL. Aggiungiamo un test "di forma" che legge il file e verifica che le clausole critiche siano presenti (tabella, indici, RLS, trigger, ALTER). Questo previene regressioni di copia-incolla e tipi storti.

- [ ] (a) Scrivi il test che fallisce — `lib/interventi/manuali/migrationShape.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260606000000_interventi_manuali.sql'),
  'utf8',
);

describe('migrazione interventi_manuali', () => {
  it('crea la tabella interventi_manuali', () => {
    expect(sql).toMatch(/create table if not exists interventi_manuali/i);
  });
  it('vincola committente e stato', () => {
    expect(sql).toMatch(/committente text[^,]*check \(committente in \('acea','italgas','altro'\)\)/i);
    expect(sql).toMatch(/stato text[^,]*check \(stato in \('in_attesa','approvato','rifiutato','auto_liberi','annullato'\)\)/i);
  });
  it('vincola corsia con default normale', () => {
    expect(sql).toMatch(/corsia text[^,]*check \(corsia in \('normale','liberi'\)\)[^,]*default 'normale'/i);
  });
  it('crea gli indici richiesti', () => {
    expect(sql).toMatch(/idx_interventi_manuali_stato/i);
    expect(sql).toMatch(/idx_interventi_manuali_rapportino/i);
    expect(sql).toMatch(/idx_interventi_manuali_data/i);
    expect(sql).toMatch(/idx_interventi_manuali_staff_data/i);
  });
  it('abilita RLS for all to authenticated', () => {
    expect(sql).toMatch(/alter table interventi_manuali enable row level security/i);
    expect(sql).toMatch(/for all to authenticated using \(true\) with check \(true\)/i);
  });
  it('aggancia il trigger updated_at', () => {
    expect(sql).toMatch(/create trigger interventi_manuali_set_updated_at before update on interventi_manuali/i);
  });
  it('ALTER voci/interventi/template', () => {
    expect(sql).toMatch(/alter table rapportino_voci\s+add column if not exists manuale boolean not null default false/i);
    expect(sql).toMatch(/add column if not exists approvazione_stato text/i);
    expect(sql).toMatch(/add column if not exists richiesta_id uuid/i);
    expect(sql).toMatch(/alter table interventi\s+add column if not exists origine text not null default 'pianificato'/i);
    expect(sql).toMatch(/alter table rapportino_template\s+add column if not exists committente text/i);
  });
});
```
- [ ] (b) Esegui e verifica FAIL — `Run: npx vitest run lib/interventi/manuali/migrationShape.test.ts`. Expected: FAIL con `ENOENT` (il file SQL non esiste ancora).
- [ ] (c) Implementazione minimale — crea `supabase/migrations/20260606000000_interventi_manuali.sql`:
```sql
-- Interventi manuali — richieste create dall'operatore sul rapportino e approvate dalla torre.
-- Fase 1: fondamenta + flusso core. Foto/realtime/corsia liberi: fasi successive.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ─────────────────────────────────────────────────────────────
-- interventi_manuali: richiesta + snapshot dati operatore/correnti
-- ─────────────────────────────────────────────────────────────
create table if not exists interventi_manuali (
  id uuid primary key default gen_random_uuid(),
  rapportino_id uuid references rapportini(id) on delete cascade,
  voce_id uuid references rapportino_voci(id) on delete set null,
  intervento_id uuid references interventi(id) on delete set null,
  piano_id uuid references mappa_piani(id) on delete set null,
  staff_id text,
  staff_name text,
  committente text not null check (committente in ('acea','italgas','altro')),
  template_id uuid references rapportino_template(id) on delete set null,
  data date,
  dati_operatore jsonb not null default '{}',
  dati_correnti jsonb not null default '{}',
  note text,
  stato text not null default 'in_attesa'
    check (stato in ('in_attesa','approvato','rifiutato','auto_liberi','annullato')),
  corsia text not null default 'normale' check (corsia in ('normale','liberi')),
  preso_in_carico_da uuid,
  preso_in_carico_at timestamptz,
  deciso_da uuid,
  deciso_at timestamptz,
  motivo_rifiuto text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_interventi_manuali_stato on interventi_manuali (stato);
create index if not exists idx_interventi_manuali_rapportino on interventi_manuali (rapportino_id);
create index if not exists idx_interventi_manuali_data on interventi_manuali (data);
create index if not exists idx_interventi_manuali_staff_data on interventi_manuali (staff_id, data);

drop trigger if exists interventi_manuali_set_updated_at on interventi_manuali;
create trigger interventi_manuali_set_updated_at before update on interventi_manuali
  for each row execute function public.set_updated_at();

alter table interventi_manuali enable row level security;
drop policy if exists "interventi_manuali_all_auth" on interventi_manuali;
create policy "interventi_manuali_all_auth" on interventi_manuali
  for all to authenticated using (true) with check (true);

-- ─────────────────────────────────────────────────────────────
-- ALTER tabelle esistenti (additivi, retro-compatibili)
-- ─────────────────────────────────────────────────────────────
alter table rapportino_voci
  add column if not exists manuale boolean not null default false;
alter table rapportino_voci
  add column if not exists approvazione_stato text
    check (approvazione_stato is null or approvazione_stato in ('in_attesa','approvato','rifiutato'));
alter table rapportino_voci
  add column if not exists richiesta_id uuid references interventi_manuali(id) on delete set null;
create index if not exists idx_voci_richiesta on rapportino_voci (richiesta_id);

alter table interventi
  add column if not exists origine text not null default 'pianificato'
    check (origine in ('pianificato','manuale','import'));

alter table rapportino_template
  add column if not exists committente text
    check (committente is null or committente in ('acea','italgas','altro'));
```
- [ ] (d) Esegui e verifica PASS — `Run: npx vitest run lib/interventi/manuali/migrationShape.test.ts`. Expected: tutti i test verdi.
- [ ] (e) Commit — `git add supabase/migrations/20260606000000_interventi_manuali.sql lib/interventi/manuali/migrationShape.test.ts && git commit -m "feat(interventi-manuali): migrazione tabella interventi_manuali + ALTER voci/interventi/template"`

---

### Task 1.2: Tipi TS condivisi — `lib/interventi/manuali/types.ts`

**Files:**
- Create: `lib/interventi/manuali/types.ts`
- Test: `lib/interventi/manuali/types.test.ts` (type-level smoke test: assegnazioni valide compilano e i literal union sono corretti a runtime via array di guardia)

- [ ] (a) Scrivi il test che fallisce — `lib/interventi/manuali/types.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  STATI_RICHIESTA,
  CORSIE_RICHIESTA,
  type StatoRichiesta,
  type CorsiaRichiesta,
  type DatiInterventoManuale,
  type RigaRichiesta,
} from './types';

describe('types interventi manuali', () => {
  it('STATI_RICHIESTA elenca i 5 stati', () => {
    expect(STATI_RICHIESTA).toEqual(['in_attesa', 'approvato', 'rifiutato', 'auto_liberi', 'annullato']);
  });
  it('CORSIE_RICHIESTA elenca le 2 corsie', () => {
    expect(CORSIE_RICHIESTA).toEqual(['normale', 'liberi']);
  });
  it('DatiInterventoManuale separa anagrafica e risposte', () => {
    const d: DatiInterventoManuale = {
      committente: 'italgas',
      anagrafica: { nominativo: 'Mario Rossi', via: 'Via Roma 1', comune: 'Roma' },
      risposte: { att_cess: true, note: 'urgente' },
    };
    expect(d.anagrafica.nominativo).toBe('Mario Rossi');
    expect(d.risposte.att_cess).toBe(true);
  });
  it('RigaRichiesta usa StatoRichiesta e CorsiaRichiesta', () => {
    const r: RigaRichiesta = {
      id: 'r1', rapportino_id: 'rap1', voce_id: 'v1', intervento_id: null,
      staff_id: 's1', staff_name: 'Mario', committente: 'acea', data: '2026-06-06',
      stato: 'in_attesa' as StatoRichiesta, corsia: 'normale' as CorsiaRichiesta,
      dati_operatore: {}, dati_correnti: {}, note: null, motivo_rifiuto: null,
      created_at: '2026-06-06T10:00:00Z',
    };
    expect(r.stato).toBe('in_attesa');
    expect(r.corsia).toBe('normale');
  });
});
```
- [ ] (b) Esegui e verifica FAIL — `Run: npx vitest run lib/interventi/manuali/types.test.ts`. Expected: FAIL (modulo `./types` inesistente).
- [ ] (c) Implementazione minimale — `lib/interventi/manuali/types.ts`:
```ts
// Tipi condivisi per le richieste di intervento manuale.
import type { InfoChiave } from '@/utils/rapportini/infoCampi';

export const STATI_RICHIESTA = ['in_attesa', 'approvato', 'rifiutato', 'auto_liberi', 'annullato'] as const;
export type StatoRichiesta = (typeof STATI_RICHIESTA)[number];

export const CORSIE_RICHIESTA = ['normale', 'liberi'] as const;
export type CorsiaRichiesta = (typeof CORSIE_RICHIESTA)[number];

export type CommittenteManuale = 'acea' | 'italgas' | 'altro';

/** Anagrafica compilata dall'operatore: sottoinsieme delle chiavi info, tutte string. */
export type AnagraficaManuale = Partial<Record<InfoChiave, string>>;

/** Payload "dati" di una richiesta: anagrafica (info_campi) + risposte (campi template). */
export type DatiInterventoManuale = {
  committente: CommittenteManuale;
  anagrafica: AnagraficaManuale;
  risposte: Record<string, unknown>;
};

/** Riga di richiesta come letta dal DB (camel dei campi usati da UI/route). */
export type RigaRichiesta = {
  id: string;
  rapportino_id: string | null;
  voce_id: string | null;
  intervento_id: string | null;
  staff_id: string | null;
  staff_name: string | null;
  committente: CommittenteManuale;
  data: string | null;
  stato: StatoRichiesta;
  corsia: CorsiaRichiesta;
  dati_operatore: Record<string, unknown>;
  dati_correnti: Record<string, unknown>;
  note: string | null;
  motivo_rifiuto: string | null;
  created_at: string;
};
```
- [ ] (d) Esegui e verifica PASS — `Run: npx vitest run lib/interventi/manuali/types.test.ts`. Expected: verde.
- [ ] (e) Commit — `git add lib/interventi/manuali/types.ts lib/interventi/manuali/types.test.ts && git commit -m "feat(interventi-manuali): tipi condivisi StatoRichiesta/CorsiaRichiesta/DatiInterventoManuale"`

---

### Task 1.3: `risolviTemplateCommittente` (PURA) — scelta template per committente

**Files:**
- Create: `lib/interventi/manuali/risolviTemplateCommittente.ts`
- Test: `lib/interventi/manuali/risolviTemplateCommittente.test.ts`

Regola: tra i template `active`, scegli quello col `committente` richiesto; se nessuno combacia, ripiega su un template `is_default` attivo; altrimenti `null`.

- [ ] (a) Scrivi il test che fallisce — `lib/interventi/manuali/risolviTemplateCommittente.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { risolviTemplateCommittente, type TemplateRow } from './risolviTemplateCommittente';

const tpl = (id: string, committente: string | null, is_default = false, active = true): TemplateRow =>
  ({ id, committente, is_default, active });

describe('risolviTemplateCommittente', () => {
  it('match esatto sul committente attivo', () => {
    const list = [tpl('a', 'acea'), tpl('b', 'italgas'), tpl('d', null, true)];
    expect(risolviTemplateCommittente('italgas', list)).toBe('b');
  });
  it('nessun match committente → ripiega sul default attivo', () => {
    const list = [tpl('a', 'acea'), tpl('d', null, true)];
    expect(risolviTemplateCommittente('altro', list)).toBe('d');
  });
  it('ignora i template non attivi nel match committente', () => {
    const list = [tpl('a', 'acea', false, false), tpl('d', null, true)];
    expect(risolviTemplateCommittente('acea', list)).toBe('d');
  });
  it('ignora i default non attivi', () => {
    const list = [tpl('d', null, true, false)];
    expect(risolviTemplateCommittente('acea', list)).toBeNull();
  });
  it('nessun candidato → null', () => {
    expect(risolviTemplateCommittente('acea', [])).toBeNull();
  });
  it('a parità preferisce il committente esatto al default', () => {
    const list = [tpl('d', null, true), tpl('a', 'acea')];
    expect(risolviTemplateCommittente('acea', list)).toBe('a');
  });
});
```
- [ ] (b) Esegui e verifica FAIL — `Run: npx vitest run lib/interventi/manuali/risolviTemplateCommittente.test.ts`. Expected: FAIL (modulo inesistente).
- [ ] (c) Implementazione minimale — `lib/interventi/manuali/risolviTemplateCommittente.ts`:
```ts
// PURA: dato il committente e la lista template, ritorna l'id del template da usare.
// Priorità: template attivo con committente esatto → template attivo is_default → null.
import type { CommittenteManuale } from './types';

export type TemplateRow = {
  id: string;
  committente: string | null;
  is_default: boolean;
  active: boolean;
};

export function risolviTemplateCommittente(
  committente: CommittenteManuale,
  templates: TemplateRow[],
): string | null {
  const attivi = templates.filter((t) => t.active);
  const esatto = attivi.find((t) => t.committente === committente);
  if (esatto) return esatto.id;
  const def = attivi.find((t) => t.is_default);
  return def ? def.id : null;
}
```
- [ ] (d) Esegui e verifica PASS — `Run: npx vitest run lib/interventi/manuali/risolviTemplateCommittente.test.ts`. Expected: verde.
- [ ] (e) Commit — `git add lib/interventi/manuali/risolviTemplateCommittente.ts lib/interventi/manuali/risolviTemplateCommittente.test.ts && git commit -m "feat(interventi-manuali): risolviTemplateCommittente pura (match committente/default)"`

---

### Task 1.4: `richiestaToIntervento` (PURA) — record `interventi` da richiesta approvata

**Files:**
- Create: `lib/interventi/manuali/richiestaToIntervento.ts`
- Test: `lib/interventi/manuali/richiestaToIntervento.test.ts`

Speculare a `taskToIntervento`, ma per i manuali: legge l'anagrafica da `dati_correnti.anagrafica`, imposta `origine='manuale'`, `created_from_mappa=false`, `stato='assegnato'`.

- [ ] (a) Scrivi il test che fallisce — `lib/interventi/manuali/richiestaToIntervento.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { richiestaToIntervento } from './richiestaToIntervento';
import type { DatiInterventoManuale } from './types';

const dati: DatiInterventoManuale = {
  committente: 'italgas',
  anagrafica: {
    nominativo: 'Mario Rossi', odl: 'ODL9', pdr: 'PDR1', matricola: 'M1',
    via: 'Via Roma 1', comune: 'Roma', cap: '00100', fascia_oraria: '9-12',
    attivita: 'Sostituzione', coordinate: '41.9, 12.5',
  },
  risposte: { att_cess: true },
};
const ctx = { committente: 'italgas' as const, data: '2026-06-06', staff_id: 's1', piano_id: 'p1', territorio_id: 'terr1' };

describe('richiestaToIntervento', () => {
  it('mappa anagrafica → record intervento manuale', () => {
    expect(richiestaToIntervento(dati, ctx)).toMatchObject({
      committente: 'italgas',
      odl: 'ODL9',
      pdr: 'PDR1',
      nominativo: 'Mario Rossi',
      indirizzo: 'Via Roma 1',
      comune: 'Roma',
      cap: '00100',
      lat: 41.9,
      lng: 12.5,
      fascia_oraria: '9-12',
      matricola_contatore: 'M1',
      intervento_tipo: 'Sostituzione',
      data: '2026-06-06',
      staff_id: 's1',
      stato: 'assegnato',
      piano_id: 'p1',
      territorio_id: 'terr1',
      origine: 'manuale',
      created_from_mappa: false,
    });
  });
  it('odl vuoto/spazi → null', () => {
    const d = { ...dati, anagrafica: { ...dati.anagrafica, odl: '   ' } };
    expect(richiestaToIntervento(d, ctx).odl).toBeNull();
  });
  it('coordinate assenti o non parseabili → lat/lng null', () => {
    const d = { ...dati, anagrafica: { ...dati.anagrafica, coordinate: undefined } };
    const r = richiestaToIntervento(d, ctx);
    expect(r.lat).toBeNull();
    expect(r.lng).toBeNull();
  });
  it('piano_id e territorio_id opzionali → null', () => {
    const r = richiestaToIntervento(dati, { committente: 'acea', data: '2026-06-06', staff_id: 's1' });
    expect(r.piano_id).toBeNull();
    expect(r.territorio_id).toBeNull();
    expect(r.origine).toBe('manuale');
  });
});
```
- [ ] (b) Esegui e verifica FAIL — `Run: npx vitest run lib/interventi/manuali/richiestaToIntervento.test.ts`. Expected: FAIL (modulo inesistente).
- [ ] (c) Implementazione minimale — `lib/interventi/manuali/richiestaToIntervento.ts`:
```ts
// PURA: dai dati correnti di una richiesta manuale approvata, costruisce il record
// per la tabella canonica `interventi`. Speculare a lib/interventi/taskToIntervento.ts,
// ma origine='manuale' e created_from_mappa=false. L'I/O (insert) sta nella route.
import type { DatiInterventoManuale } from './types';

export type ContextInterventoManuale = {
  committente: 'acea' | 'italgas' | 'altro';
  data: string;
  staff_id: string;
  piano_id?: string | null;
  territorio_id?: string | null;
};

export type InterventoManualeRecord = {
  committente: string;
  odl: string | null;
  pdr: string | null;
  nominativo: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  lat: number | null;
  lng: number | null;
  fascia_oraria: string | null;
  matricola_contatore: string | null;
  intervento_tipo: string | null;
  data: string;
  staff_id: string;
  stato: 'assegnato';
  piano_id: string | null;
  territorio_id: string | null;
  origine: 'manuale';
  created_from_mappa: false;
};

const trimOrNull = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
};

/** Parsa "lat, lng" → [lat, lng] numerici, altrimenti [null, null]. */
function parseCoord(raw: string | null | undefined): [number | null, number | null] {
  if (!raw) return [null, null];
  const m = raw.split(',').map((p) => Number(p.trim()));
  if (m.length !== 2 || !Number.isFinite(m[0]) || !Number.isFinite(m[1])) return [null, null];
  return [m[0], m[1]];
}

export function richiestaToIntervento(
  dati: DatiInterventoManuale,
  ctx: ContextInterventoManuale,
): InterventoManualeRecord {
  const a = dati.anagrafica;
  const [lat, lng] = parseCoord(a.coordinate);
  return {
    committente: ctx.committente,
    odl: trimOrNull(a.odl),
    pdr: trimOrNull(a.pdr),
    nominativo: trimOrNull(a.nominativo),
    indirizzo: trimOrNull(a.via),
    comune: trimOrNull(a.comune),
    cap: trimOrNull(a.cap),
    lat,
    lng,
    fascia_oraria: trimOrNull(a.fascia_oraria),
    matricola_contatore: trimOrNull(a.matricola),
    intervento_tipo: trimOrNull(a.attivita),
    data: ctx.data,
    staff_id: ctx.staff_id,
    stato: 'assegnato',
    piano_id: ctx.piano_id ?? null,
    territorio_id: ctx.territorio_id ?? null,
    origine: 'manuale',
    created_from_mappa: false,
  };
}
```
- [ ] (d) Esegui e verifica PASS — `Run: npx vitest run lib/interventi/manuali/richiestaToIntervento.test.ts`. Expected: verde.
- [ ] (e) Commit — `git add lib/interventi/manuali/richiestaToIntervento.ts lib/interventi/manuali/richiestaToIntervento.test.ts && git commit -m "feat(interventi-manuali): richiestaToIntervento pura (record interventi origine manuale)"`

---

### Task 1.5: `rapportinoInviabile` (PURA) — blocco invio con voci in sospeso

**Files:**
- Create: `lib/interventi/manuali/rapportinoInviabile.ts`
- Test: `lib/interventi/manuali/rapportinoInviabile.test.ts`

Regola: data la lista delle voci con `approvazione_stato`, `inviabile=false` se almeno una è `in_attesa`; `inSospeso` = quante `in_attesa`. Voci `null`/`approvato`/`rifiutato` non bloccano.

- [ ] (a) Scrivi il test che fallisce — `lib/interventi/manuali/rapportinoInviabile.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { rapportinoInviabile } from './rapportinoInviabile';

describe('rapportinoInviabile', () => {
  it('nessuna voce manuale → inviabile, 0 in sospeso', () => {
    expect(rapportinoInviabile([{ approvazione_stato: null }, { approvazione_stato: null }]))
      .toEqual({ inviabile: true, inSospeso: 0 });
  });
  it('una in_attesa → non inviabile', () => {
    expect(rapportinoInviabile([{ approvazione_stato: 'in_attesa' }, { approvazione_stato: null }]))
      .toEqual({ inviabile: false, inSospeso: 1 });
  });
  it('conta tutte le in_attesa', () => {
    expect(rapportinoInviabile([
      { approvazione_stato: 'in_attesa' },
      { approvazione_stato: 'in_attesa' },
      { approvazione_stato: 'approvato' },
    ])).toEqual({ inviabile: false, inSospeso: 2 });
  });
  it('approvato/rifiutato non bloccano', () => {
    expect(rapportinoInviabile([{ approvazione_stato: 'approvato' }, { approvazione_stato: 'rifiutato' }]))
      .toEqual({ inviabile: true, inSospeso: 0 });
  });
  it('lista vuota → inviabile', () => {
    expect(rapportinoInviabile([])).toEqual({ inviabile: true, inSospeso: 0 });
  });
});
```
- [ ] (b) Esegui e verifica FAIL — `Run: npx vitest run lib/interventi/manuali/rapportinoInviabile.test.ts`. Expected: FAIL (modulo inesistente).
- [ ] (c) Implementazione minimale — `lib/interventi/manuali/rapportinoInviabile.ts`:
```ts
// PURA: il rapportino è inviabile solo se nessuna voce è in attesa di approvazione.
export type VoceApprovazione = { approvazione_stato: string | null };

export function rapportinoInviabile(
  voci: VoceApprovazione[],
): { inviabile: boolean; inSospeso: number } {
  const inSospeso = voci.filter((v) => v.approvazione_stato === 'in_attesa').length;
  return { inviabile: inSospeso === 0, inSospeso };
}
```
- [ ] (d) Esegui e verifica PASS — `Run: npx vitest run lib/interventi/manuali/rapportinoInviabile.test.ts`. Expected: verde.
- [ ] (e) Commit — `git add lib/interventi/manuali/rapportinoInviabile.ts lib/interventi/manuali/rapportinoInviabile.test.ts && git commit -m "feat(interventi-manuali): rapportinoInviabile pura (blocco invio con voci in sospeso)"`

---

### Task 1.6: Route `POST /api/r/[token]/intervento-manuale` — crea richiesta + voce

**Files:**
- Create: `app/api/r/[token]/intervento-manuale/route.ts`
- Create: `lib/interventi/manuali/buildVoceManuale.ts` (PURA: dai dati operatore costruisce la riga `rapportino_voci`)
- Test: `lib/interventi/manuali/buildVoceManuale.test.ts`

La logica testabile (mappatura anagrafica → colonne voce) va in una funzione pura; la route fa solo validazione token + due insert. Le colonne anagrafiche di `rapportino_voci` sono: `nominativo, matricola, pdr, odsin, via, comune, cap, recapito, attivita, accessibilita, fascia_oraria` (nota: la colonna ODL nella tabella voci si chiama `odsin`).

- [ ] (a) Scrivi il test che fallisce — `lib/interventi/manuali/buildVoceManuale.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildVoceManuale } from './buildVoceManuale';
import type { DatiInterventoManuale } from './types';

const dati: DatiInterventoManuale = {
  committente: 'acea',
  anagrafica: {
    nominativo: 'Mario Rossi', matricola: 'M1', pdr: 'PDR1', odl: 'ODL9',
    via: 'Via Roma 1', comune: 'Roma', cap: '00100', recapito: '333',
    attivita: 'Sostituzione', accessibilita: 'Libero', fascia_oraria: '9-12',
    coordinate: '41.9, 12.5',
  },
  risposte: { att_cess: true, note: 'urgente' },
};

describe('buildVoceManuale', () => {
  it('mappa anagrafica → colonne voce (odl→odsin) + manuale/approvazione', () => {
    const v = buildVoceManuale({ rapportinoId: 'rap1', richiestaId: 'req1', ordine: 7, dati });
    expect(v).toMatchObject({
      rapportino_id: 'rap1',
      richiesta_id: 'req1',
      ordine: 7,
      manuale: true,
      approvazione_stato: 'in_attesa',
      nominativo: 'Mario Rossi',
      matricola: 'M1',
      pdr: 'PDR1',
      odsin: 'ODL9',
      via: 'Via Roma 1',
      comune: 'Roma',
      cap: '00100',
      recapito: '333',
      attivita: 'Sostituzione',
      accessibilita: 'Libero',
      fascia_oraria: '9-12',
      risposte: { att_cess: true, note: 'urgente' },
    });
  });
  it('porta la coordinata nel raw_json e marca _nuovo', () => {
    const v = buildVoceManuale({ rapportinoId: 'rap1', richiestaId: 'req1', ordine: 1, dati });
    expect(v.raw_json).toMatchObject({ coordinate: '41.9, 12.5', _nuovo: true });
  });
  it('campi assenti → null/undefined senza crash', () => {
    const vuoto: DatiInterventoManuale = { committente: 'altro', anagrafica: {}, risposte: {} };
    const v = buildVoceManuale({ rapportinoId: 'rap1', richiestaId: 'req1', ordine: 1, dati: vuoto });
    expect(v.nominativo ?? null).toBeNull();
    expect(v.risposte).toEqual({});
  });
});
```
- [ ] (b) Esegui e verifica FAIL — `Run: npx vitest run lib/interventi/manuali/buildVoceManuale.test.ts`. Expected: FAIL (modulo inesistente).
- [ ] (c) Implementazione minimale — crea `lib/interventi/manuali/buildVoceManuale.ts`:
```ts
// PURA: costruisce la riga rapportino_voci per una richiesta manuale.
// La colonna ODL della tabella voci si chiama `odsin` (storico). La coordinata
// committente va nel raw_json (coerente con coordinateFromRaw). _nuovo=true → badge "Nuovo".
import type { DatiInterventoManuale } from './types';

export type VoceManualeInsert = {
  rapportino_id: string;
  richiesta_id: string;
  ordine: number;
  manuale: true;
  approvazione_stato: 'in_attesa';
  nominativo: string | null;
  matricola: string | null;
  pdr: string | null;
  odsin: string | null;
  via: string | null;
  comune: string | null;
  cap: string | null;
  recapito: string | null;
  attivita: string | null;
  accessibilita: string | null;
  fascia_oraria: string | null;
  raw_json: Record<string, unknown>;
  risposte: Record<string, unknown>;
};

const v = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t === '' ? null : t;
};

export function buildVoceManuale(args: {
  rapportinoId: string;
  richiestaId: string;
  ordine: number;
  dati: DatiInterventoManuale;
}): VoceManualeInsert {
  const a = args.dati.anagrafica;
  const raw_json: Record<string, unknown> = { _nuovo: true };
  if (v(a.coordinate)) raw_json.coordinate = v(a.coordinate);
  return {
    rapportino_id: args.rapportinoId,
    richiesta_id: args.richiestaId,
    ordine: args.ordine,
    manuale: true,
    approvazione_stato: 'in_attesa',
    nominativo: v(a.nominativo),
    matricola: v(a.matricola),
    pdr: v(a.pdr),
    odsin: v(a.odl),
    via: v(a.via),
    comune: v(a.comune),
    cap: v(a.cap),
    recapito: v(a.recapito),
    attivita: v(a.attivita),
    accessibilita: v(a.accessibilita),
    fascia_oraria: v(a.fascia_oraria),
    raw_json,
    risposte: args.dati.risposte ?? {},
  };
}
```
- [ ] (d) Esegui e verifica PASS — `Run: npx vitest run lib/interventi/manuali/buildVoceManuale.test.ts`. Expected: verde.
- [ ] (e) Implementa la route — crea `app/api/r/[token]/intervento-manuale/route.ts` (usa il modulo puro appena testato; pattern token preso da `app/api/r/[token]/invia/route.ts`):
```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { risolviTemplateCommittente, type TemplateRow } from '@/lib/interventi/manuali/risolviTemplateCommittente';
import { buildVoceManuale } from '@/lib/interventi/manuali/buildVoceManuale';
import type { DatiInterventoManuale, CommittenteManuale } from '@/lib/interventi/manuali/types';

export const runtime = 'nodejs';

const COMMITTENTI: CommittenteManuale[] = ['acea', 'italgas', 'altro'];

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, staff_id, staff_name, data, piano_id, stato, riaperto_at')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  const body = (await req.json()) as Partial<DatiInterventoManuale> & { note?: string };
  const committente = body.committente as CommittenteManuale | undefined;
  if (!committente || !COMMITTENTI.includes(committente))
    return NextResponse.json({ error: 'committente_non_valido' }, { status: 400 });
  const dati: DatiInterventoManuale = {
    committente,
    anagrafica: body.anagrafica ?? {},
    risposte: body.risposte ?? {},
  };

  const { data: templates } = await supabaseAdmin
    .from('rapportino_template')
    .select('id, committente, is_default, active');
  const templateId = risolviTemplateCommittente(committente, (templates ?? []) as TemplateRow[]);
  if (!templateId) return NextResponse.json({ error: 'template_mancante' }, { status: 409 });

  const { data: req2, error: eReq } = await supabaseAdmin
    .from('interventi_manuali')
    .insert({
      rapportino_id: rap.id,
      piano_id: rap.piano_id,
      staff_id: rap.staff_id,
      staff_name: rap.staff_name,
      committente,
      template_id: templateId,
      data: rap.data,
      dati_operatore: dati,
      dati_correnti: dati,
      note: body.note ?? null,
      stato: 'in_attesa',
      corsia: 'normale',
    })
    .select('id')
    .single();
  if (eReq) return NextResponse.json({ error: eReq.message }, { status: 500 });

  const { data: maxRow } = await supabaseAdmin
    .from('rapportino_voci')
    .select('ordine')
    .eq('rapportino_id', rap.id)
    .order('ordine', { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordine = ((maxRow?.ordine as number | undefined) ?? 0) + 1;

  const voce = buildVoceManuale({ rapportinoId: rap.id, richiestaId: req2!.id, ordine, dati });
  const { data: voceRow, error: eVoce } = await supabaseAdmin
    .from('rapportino_voci')
    .insert(voce)
    .select('id')
    .single();
  if (eVoce) return NextResponse.json({ error: eVoce.message }, { status: 500 });

  await supabaseAdmin.from('interventi_manuali').update({ voce_id: voceRow!.id }).eq('id', req2!.id);

  return NextResponse.json({ id: req2!.id, voceId: voceRow!.id });
}
```
- [ ] (f) Verifica type-check route — `Run: npx tsc --noEmit -p tsconfig.json`. Expected: nessun errore nei file `app/api/r/[token]/intervento-manuale/route.ts` e `lib/interventi/manuali/*`.
- [ ] (g) Commit — `git add app/api/r/[token]/intervento-manuale/route.ts lib/interventi/manuali/buildVoceManuale.ts lib/interventi/manuali/buildVoceManuale.test.ts && git commit -m "feat(interventi-manuali): route POST crea richiesta + voce in sospeso"`

---

### Task 1.7: Route `POST /api/r/[token]/intervento-manuale/[id]/annulla`

**Files:**
- Create: `app/api/r/[token]/intervento-manuale/[id]/annulla/route.ts`

Annulla una richiesta ancora `in_attesa`: stato→`annullato` ed elimina la voce collegata. Solo se la richiesta appartiene al rapportino del token (difesa-in-profondità).

- [ ] (a) Implementa la route (no logica pura nuova; pattern token come 1.6) — `app/api/r/[token]/intervento-manuale/[id]/annulla/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, stato, data, riaperto_at')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  const { data: richiesta } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, stato, voce_id, rapportino_id')
    .eq('id', id)
    .maybeSingle();
  if (!richiesta || richiesta.rapportino_id !== rap.id)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (richiesta.stato !== 'in_attesa')
    return NextResponse.json({ error: 'non_annullabile' }, { status: 409 });

  await supabaseAdmin.from('interventi_manuali').update({ stato: 'annullato' }).eq('id', id);
  if (richiesta.voce_id) {
    await supabaseAdmin.from('rapportino_voci').delete().eq('id', richiesta.voce_id);
  }
  return NextResponse.json({ ok: true });
}
```
- [ ] (b) Verifica type-check — `Run: npx tsc --noEmit -p tsconfig.json`. Expected: nessun errore in `app/api/r/[token]/intervento-manuale/[id]/annulla/route.ts`.
- [ ] (c) Commit — `git add app/api/r/[token]/intervento-manuale/[id]/annulla/route.ts && git commit -m "feat(interventi-manuali): route annulla richiesta in_attesa + rimuove voce"`

---

### Task 1.8: Estendi `POST /api/r/[token]/invia` — 409 se voci in sospeso

**Files:**
- Modify: `app/api/r/[token]/invia/route.ts`

Prima dell'update a `inviato`, carica `approvazione_stato` delle voci e usa `rapportinoInviabile`: se ci sono `in_attesa`, ritorna 409 `{error:'voci_in_sospeso', inSospeso}`.

- [ ] (a) Scrivi/aggiorna il test della funzione pura per coprire il caso 409 — già coperto da `lib/interventi/manuali/rapportinoInviabile.test.ts` (Task 1.5). Verifica che resti verde dopo l'integrazione — `Run: npx vitest run lib/interventi/manuali/rapportinoInviabile.test.ts`. Expected: verde.
- [ ] (b) Modifica la route. Aggiungi l'import in cima a `app/api/r/[token]/invia/route.ts` accanto agli altri import:
```ts
import { rapportinoInviabile } from '@/lib/interventi/manuali/rapportinoInviabile';
```
- [ ] (c) Nel corpo della `POST`, subito DOPO il check `tokenStatus(...) !== 'valido'` e PRIMA dell'`update({ stato: 'inviato' ... })`, inserisci il gate sulle voci in sospeso:
```ts
  const { data: vociApprovazione } = await supabaseAdmin
    .from('rapportino_voci')
    .select('approvazione_stato')
    .eq('rapportino_id', rap.id);
  const gate = rapportinoInviabile(
    ((vociApprovazione ?? []) as Array<{ approvazione_stato: string | null }>),
  );
  if (!gate.inviabile)
    return NextResponse.json({ error: 'voci_in_sospeso', inSospeso: gate.inSospeso }, { status: 409 });
```
- [ ] (d) Verifica type-check + tutti i test rapportini — `Run: npx tsc --noEmit -p tsconfig.json && npx vitest run lib/interventi/manuali utils/rapportini/tokenStatus.test.ts`. Expected: nessun errore TS; test verdi.
- [ ] (e) Commit — `git add app/api/r/[token]/invia/route.ts && git commit -m "feat(interventi-manuali): invia bloccato (409 voci_in_sospeso) se richieste non decise"`

---

### Task 1.9: Route `GET /api/admin/interventi-manuali` — lista filtrata

**Files:**
- Create: `app/api/admin/interventi-manuali/route.ts`
- Create: `lib/interventi/manuali/listaQuery.ts` (PURA: normalizza i query param in un filtro validato)
- Test: `lib/interventi/manuali/listaQuery.test.ts`

La validazione/normalizzazione dei filtri va in una funzione pura testata; la route applica i filtri a `supabaseAdmin`.

- [ ] (a) Scrivi il test che fallisce — `lib/interventi/manuali/listaQuery.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseFiltroLista } from './listaQuery';

describe('parseFiltroLista', () => {
  it('default: stato in_attesa, nessun range/staff', () => {
    expect(parseFiltroLista(new URLSearchParams())).toEqual({
      stato: 'in_attesa', from: null, to: null, staff: null,
    });
  });
  it('stato valido viene preso', () => {
    expect(parseFiltroLista(new URLSearchParams({ stato: 'approvato' })).stato).toBe('approvato');
  });
  it('stato sconosciuto → fallback in_attesa', () => {
    expect(parseFiltroLista(new URLSearchParams({ stato: 'pippo' })).stato).toBe('in_attesa');
  });
  it('stato=tutti → null (nessun filtro stato)', () => {
    expect(parseFiltroLista(new URLSearchParams({ stato: 'tutti' })).stato).toBeNull();
  });
  it('from/to validi (YYYY-MM-DD) passano, formati errati → null', () => {
    const f = parseFiltroLista(new URLSearchParams({ from: '2026-06-01', to: 'xx' }));
    expect(f.from).toBe('2026-06-01');
    expect(f.to).toBeNull();
  });
  it('staff trim, vuoto → null', () => {
    expect(parseFiltroLista(new URLSearchParams({ staff: ' s1 ' })).staff).toBe('s1');
    expect(parseFiltroLista(new URLSearchParams({ staff: '  ' })).staff).toBeNull();
  });
});
```
- [ ] (b) Esegui e verifica FAIL — `Run: npx vitest run lib/interventi/manuali/listaQuery.test.ts`. Expected: FAIL (modulo inesistente).
- [ ] (c) Implementazione minimale — `lib/interventi/manuali/listaQuery.ts`:
```ts
// PURA: normalizza i query param della lista admin in un filtro validato.
// stato='tutti' → null (nessun filtro). Date non ISO → null. Stato ignoto → in_attesa.
import { STATI_RICHIESTA, type StatoRichiesta } from './types';

export type FiltroLista = {
  stato: StatoRichiesta | null;
  from: string | null;
  to: string | null;
  staff: string | null;
};

const isIsoDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

export function parseFiltroLista(sp: URLSearchParams): FiltroLista {
  const rawStato = sp.get('stato');
  let stato: StatoRichiesta | null;
  if (rawStato === 'tutti') stato = null;
  else if (rawStato && (STATI_RICHIESTA as readonly string[]).includes(rawStato)) stato = rawStato as StatoRichiesta;
  else stato = 'in_attesa';

  const from = sp.get('from');
  const to = sp.get('to');
  const staff = (sp.get('staff') ?? '').trim();

  return {
    stato,
    from: from && isIsoDate(from) ? from : null,
    to: to && isIsoDate(to) ? to : null,
    staff: staff === '' ? null : staff,
  };
}
```
- [ ] (d) Esegui e verifica PASS — `Run: npx vitest run lib/interventi/manuali/listaQuery.test.ts`. Expected: verde.
- [ ] (e) Implementa la route (pattern `requireAdmin` da `app/api/mappa/rapportini/genera/route.ts` e `lib/apiAuth.ts`) — `app/api/admin/interventi-manuali/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { parseFiltroLista } from '@/lib/interventi/manuali/listaQuery';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const filtro = parseFiltroLista(new URL(req.url).searchParams);
  let q = supabaseAdmin
    .from('interventi_manuali')
    .select('id, rapportino_id, voce_id, intervento_id, staff_id, staff_name, committente, data, stato, corsia, dati_operatore, dati_correnti, note, motivo_rifiuto, created_at')
    .order('created_at', { ascending: false });

  if (filtro.stato) q = q.eq('stato', filtro.stato);
  if (filtro.from) q = q.gte('data', filtro.from);
  if (filtro.to) q = q.lte('data', filtro.to);
  if (filtro.staff) q = q.eq('staff_id', filtro.staff);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ richieste: data ?? [] });
}
```
- [ ] (f) Verifica type-check — `Run: npx tsc --noEmit -p tsconfig.json`. Expected: nessun errore nei file nuovi.
- [ ] (g) Commit — `git add app/api/admin/interventi-manuali/route.ts lib/interventi/manuali/listaQuery.ts lib/interventi/manuali/listaQuery.test.ts && git commit -m "feat(interventi-manuali): GET admin lista richieste con filtri stato/from/to/staff"`

---

### Task 1.10: Route `POST /api/admin/interventi-manuali/[id]/approva`

**Files:**
- Create: `app/api/admin/interventi-manuali/[id]/approva/route.ts`

Body `{ dati_correnti }`: crea l'intervento canonico via `richiestaToIntervento` + insert; aggiorna la voce (`intervento_id`, `approvazione_stato='approvato'`); aggiorna la richiesta (`stato='approvato'`, `dati_correnti`, `deciso_da`, `deciso_at`). Riusa la funzione pura testata al Task 1.4.

- [ ] (a) Implementa la route — `app/api/admin/interventi-manuali/[id]/approva/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { richiestaToIntervento } from '@/lib/interventi/manuali/richiestaToIntervento';
import type { DatiInterventoManuale, CommittenteManuale } from '@/lib/interventi/manuali/types';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;

  const body = (await req.json()) as { dati_correnti?: DatiInterventoManuale };

  const { data: richiesta } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, stato, voce_id, piano_id, staff_id, data, committente, dati_correnti')
    .eq('id', id)
    .maybeSingle();
  if (!richiesta) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (richiesta.stato !== 'in_attesa')
    return NextResponse.json({ error: 'gia_decisa' }, { status: 409 });

  const dati = (body.dati_correnti ?? richiesta.dati_correnti) as DatiInterventoManuale;
  const committente = (dati.committente ?? richiesta.committente) as CommittenteManuale;

  const record = richiestaToIntervento(dati, {
    committente,
    data: (richiesta.data as string),
    staff_id: String(richiesta.staff_id ?? ''),
    piano_id: (richiesta.piano_id as string | null) ?? null,
  });

  const { data: intRow, error: eInt } = await supabaseAdmin
    .from('interventi')
    .insert(record)
    .select('id')
    .single();
  if (eInt) return NextResponse.json({ error: eInt.message }, { status: 500 });

  const decisoAt = new Date().toISOString();

  if (richiesta.voce_id) {
    await supabaseAdmin
      .from('rapportino_voci')
      .update({ intervento_id: intRow!.id, approvazione_stato: 'approvato' })
      .eq('id', richiesta.voce_id);
  }

  const { error: eReq } = await supabaseAdmin
    .from('interventi_manuali')
    .update({
      stato: 'approvato',
      dati_correnti: dati,
      intervento_id: intRow!.id,
      deciso_da: user.id,
      deciso_at: decisoAt,
    })
    .eq('id', id);
  if (eReq) return NextResponse.json({ error: eReq.message }, { status: 500 });

  return NextResponse.json({ ok: true, interventoId: intRow!.id });
}
```
- [ ] (b) Verifica type-check — `Run: npx tsc --noEmit -p tsconfig.json`. Expected: nessun errore in `app/api/admin/interventi-manuali/[id]/approva/route.ts`.
- [ ] (c) Commit — `git add app/api/admin/interventi-manuali/[id]/approva/route.ts && git commit -m "feat(interventi-manuali): POST admin approva (crea intervento + aggiorna voce/richiesta)"`

---

### Task 1.11: Route `POST /api/admin/interventi-manuali/[id]/rifiuta`

**Files:**
- Create: `app/api/admin/interventi-manuali/[id]/rifiuta/route.ts`

Body `{ motivo }`: aggiorna la richiesta (`stato='rifiutato'`, `motivo_rifiuto`, `deciso_da`, `deciso_at`) e la voce (`approvazione_stato='rifiutato'`).

- [ ] (a) Implementa la route — `app/api/admin/interventi-manuali/[id]/rifiuta/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;

  const body = (await req.json()) as { motivo?: string };
  const motivo = (body.motivo ?? '').trim();

  const { data: richiesta } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, stato, voce_id')
    .eq('id', id)
    .maybeSingle();
  if (!richiesta) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (richiesta.stato !== 'in_attesa')
    return NextResponse.json({ error: 'gia_decisa' }, { status: 409 });

  const decisoAt = new Date().toISOString();
  const { error: eReq } = await supabaseAdmin
    .from('interventi_manuali')
    .update({ stato: 'rifiutato', motivo_rifiuto: motivo || null, deciso_da: user.id, deciso_at: decisoAt })
    .eq('id', id);
  if (eReq) return NextResponse.json({ error: eReq.message }, { status: 500 });

  if (richiesta.voce_id) {
    await supabaseAdmin
      .from('rapportino_voci')
      .update({ approvazione_stato: 'rifiutato' })
      .eq('id', richiesta.voce_id);
  }
  return NextResponse.json({ ok: true });
}
```
- [ ] (b) Verifica type-check — `Run: npx tsc --noEmit -p tsconfig.json`. Expected: nessun errore in `app/api/admin/interventi-manuali/[id]/rifiuta/route.ts`.
- [ ] (c) Commit — `git add app/api/admin/interventi-manuali/[id]/rifiuta/route.ts && git commit -m "feat(interventi-manuali): POST admin rifiuta (motivo + aggiorna voce/richiesta)"`

---

### Task 1.12: `FabInterventoManuale` — bottone "+" flottante

**Files:**
- Create: `components/modules/rapportini/FabInterventoManuale.tsx`
- Create: `lib/interventi/manuali/fabAbilitato.ts` (PURA: regola di abilitazione del FAB)
- Test: `lib/interventi/manuali/fabAbilitato.test.ts`

La condizione di abilitazione è pura e testabile; il componente è solo presentazione.

- [ ] (a) Scrivi il test che fallisce — `lib/interventi/manuali/fabAbilitato.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { fabAbilitato } from './fabAbilitato';

describe('fabAbilitato', () => {
  it('rapportino modificabile → abilitato', () => {
    expect(fabAbilitato({ readOnly: false, bloccato: false, inviato: false })).toBe(true);
  });
  it('readOnly → disabilitato', () => {
    expect(fabAbilitato({ readOnly: true, bloccato: false, inviato: false })).toBe(false);
  });
  it('bloccato (409) → disabilitato', () => {
    expect(fabAbilitato({ readOnly: false, bloccato: true, inviato: false })).toBe(false);
  });
  it('inviato → disabilitato', () => {
    expect(fabAbilitato({ readOnly: false, bloccato: false, inviato: true })).toBe(false);
  });
});
```
- [ ] (b) Esegui e verifica FAIL — `Run: npx vitest run lib/interventi/manuali/fabAbilitato.test.ts`. Expected: FAIL (modulo inesistente).
- [ ] (c) Implementazione minimale — `lib/interventi/manuali/fabAbilitato.ts`:
```ts
// PURA: il FAB "+" è attivo solo quando il rapportino è ancora compilabile.
export function fabAbilitato(s: { readOnly: boolean; bloccato: boolean; inviato: boolean }): boolean {
  return !s.readOnly && !s.bloccato && !s.inviato;
}
```
- [ ] (d) Esegui e verifica PASS — `Run: npx vitest run lib/interventi/manuali/fabAbilitato.test.ts`. Expected: verde.
- [ ] (e) Implementa il componente (stile coerente con `RapportinoLista.tsx`: var(--brand-primary), testo `oklch(0.16_0.06_245)`) — `components/modules/rapportini/FabInterventoManuale.tsx`:
```tsx
'use client';

export function FabInterventoManuale({ abilitato, onClick }: { abilitato: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!abilitato}
      aria-label="Aggiungi intervento manuale"
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-primary)] text-[oklch(0.16_0.06_245)] shadow-lg transition enabled:hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
```
- [ ] (f) Verifica manuale build/type — `Run: npx tsc --noEmit -p tsconfig.json`. Expected: nessun errore nei file nuovi.
- [ ] (g) Commit — `git add components/modules/rapportini/FabInterventoManuale.tsx lib/interventi/manuali/fabAbilitato.ts lib/interventi/manuali/fabAbilitato.test.ts && git commit -m "feat(interventi-manuali): FAB '+' flottante + regola fabAbilitato pura"`

---

### Task 1.13: `ModaleInterventoManuale` — modale a step (committente → anagrafica → esiti → invio)

**Files:**
- Create: `components/modules/rapportini/ModaleInterventoManuale.tsx`
- Create: `lib/interventi/manuali/anagraficaCampi.ts` (PURA: ordina/etichetta i campi anagrafica da mostrare)
- Test: `lib/interventi/manuali/anagraficaCampi.test.ts`

La selezione dei campi anagrafica da `infoCampi` è pura e testabile; il resto è UI. Riusa `CampoInput` per gli esiti del template (è già il componente per i `TemplateCampo`).

- [ ] (a) Scrivi il test che fallisce — `lib/interventi/manuali/anagraficaCampi.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { anagraficaCampi } from './anagraficaCampi';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';

describe('anagraficaCampi', () => {
  it('snapshot vuoto → 11 campi storici ordinati (coordinate esclusa)', () => {
    const campi = anagraficaCampi(null);
    expect(campi.map((c) => c.chiave)).not.toContain('coordinate');
    expect(campi[0].chiave).toBe('nominativo');
    expect(campi.length).toBe(11);
  });
  it('rispetta ordine ed etichette dello snapshot', () => {
    const snap: TemplateInfoCampo[] = [
      { chiave: 'pdr', etichetta: 'Punto', ordine: 2 },
      { chiave: 'nominativo', etichetta: 'Cliente', ordine: 1 },
    ];
    const campi = anagraficaCampi(snap);
    expect(campi.map((c) => c.chiave)).toEqual(['nominativo', 'pdr']);
    expect(campi[0].etichetta).toBe('Cliente');
  });
  it('include coordinate se presente nello snapshot', () => {
    const snap: TemplateInfoCampo[] = [{ chiave: 'coordinate', etichetta: 'COORDINATE', ordine: 1 }];
    expect(anagraficaCampi(snap).map((c) => c.chiave)).toContain('coordinate');
  });
});
```
- [ ] (b) Esegui e verifica FAIL — `Run: npx vitest run lib/interventi/manuali/anagraficaCampi.test.ts`. Expected: FAIL (modulo inesistente).
- [ ] (c) Implementazione minimale — `lib/interventi/manuali/anagraficaCampi.ts` (riusa `resolveInfoCampi`, già testato in `utils/rapportini/infoCampi.ts`):
```ts
// PURA: lista ordinata dei campi anagrafica da mostrare nella modale manuale.
// Delega a resolveInfoCampi (gestisce default 11 storici, alias, ordine, etichette).
import { resolveInfoCampi, type TemplateInfoCampo } from '@/utils/rapportini/infoCampi';

export function anagraficaCampi(
  snapshot: TemplateInfoCampo[] | null | undefined,
): TemplateInfoCampo[] {
  return resolveInfoCampi(snapshot);
}
```
- [ ] (d) Esegui e verifica PASS — `Run: npx vitest run lib/interventi/manuali/anagraficaCampi.test.ts`. Expected: verde.
- [ ] (e) Implementa il componente modale (riusa `CampoInput`; stile coerente con `VoceFocus.tsx`/`CampoInput.tsx`) — `components/modules/rapportini/ModaleInterventoManuale.tsx`:
```tsx
'use client';

import { useMemo, useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import { CampoInput } from './CampoInput';
import { anagraficaCampi } from '@/lib/interventi/manuali/anagraficaCampi';
import type { CommittenteManuale, DatiInterventoManuale, AnagraficaManuale } from '@/lib/interventi/manuali/types';

const COMMITTENTI: { value: CommittenteManuale; label: string }[] = [
  { value: 'italgas', label: 'Italgas' },
  { value: 'acea', label: 'Acea' },
  { value: 'altro', label: 'Altro' },
];

const inputCls =
  'w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2 text-base text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none';

export function ModaleInterventoManuale({
  token,
  infoCampi,
  campiPerCommittente,
  onClose,
  onCreata,
}: {
  token: string;
  infoCampi: TemplateInfoCampo[];
  /** Campi esito (template) per committente; se non noto si usa []. */
  campiPerCommittente: Partial<Record<CommittenteManuale, TemplateCampo[]>>;
  onClose: () => void;
  onCreata: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [committente, setCommittente] = useState<CommittenteManuale | null>(null);
  const [anagrafica, setAnagrafica] = useState<AnagraficaManuale>({});
  const [risposte, setRisposte] = useState<Record<string, unknown>>({});
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const campiAnag = useMemo(() => anagraficaCampi(infoCampi), [infoCampi]);
  const campiEsito = committente ? campiPerCommittente[committente] ?? [] : [];

  const invia = async () => {
    if (!committente) return;
    setInviando(true);
    setErrore(null);
    try {
      const payload: DatiInterventoManuale = { committente, anagrafica, risposte };
      const res = await fetch(`/api/r/${token}/intervento-manuale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      onCreata();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Invio non riuscito');
    } finally {
      setInviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal>
      <div className="max-h-[90dvh] w-full max-w-[480px] overflow-y-auto rounded-t-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--brand-text-main)]">Nuovo intervento</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-[var(--brand-text-muted)]">Chiudi</button>
        </div>

        {step === 1 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-[var(--brand-text-muted)]">Committente</p>
            <div className="grid grid-cols-3 gap-2">
              {COMMITTENTI.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => { setCommittente(c.value); setStep(2); }}
                  className={`min-h-[50px] rounded-xl border p-3 text-sm font-semibold transition ${
                    committente === c.value
                      ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
                      : 'border-[var(--brand-border)] bg-[var(--brand-surface-muted)] text-[var(--brand-text-main)]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {campiAnag.map((c) => (
              <div key={c.chiave}>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">{c.etichetta}</label>
                <input
                  type="text"
                  value={anagrafica[c.chiave] ?? ''}
                  onChange={(e) => setAnagrafica((prev) => ({ ...prev, [c.chiave]: e.target.value }))}
                  className={inputCls}
                />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setStep(1)} className="rounded-xl border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] px-4 py-3 font-bold text-[var(--brand-text-main)]">Indietro</button>
              <button type="button" onClick={() => setStep(3)} className="flex-1 rounded-xl bg-[var(--brand-primary)] px-4 py-3 font-semibold text-[oklch(0.16_0.06_245)]">Avanti</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3.5">
            {campiEsito.length === 0 && (
              <p className="text-sm text-[var(--brand-text-muted)]">Nessun campo esito per questo committente: la richiesta verrà inviata per approvazione.</p>
            )}
            {campiEsito.map((campo) => (
              <CampoInput key={campo.chiave} campo={campo} valore={risposte[campo.chiave]} disabilitato={inviando} onChange={(v) => setRisposte((prev) => ({ ...prev, [campo.chiave]: v }))} />
            ))}
            {errore && <p className="text-sm font-medium text-[var(--danger)]">Errore: {errore}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setStep(2)} disabled={inviando} className="rounded-xl border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] px-4 py-3 font-bold text-[var(--brand-text-main)] disabled:opacity-50">Indietro</button>
              <button type="button" onClick={invia} disabled={inviando} className="flex-1 rounded-xl bg-[var(--brand-primary)] px-4 py-3 font-semibold text-[oklch(0.16_0.06_245)] disabled:opacity-50">
                {inviando ? 'Invio…' : 'Invia richiesta'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```
- [ ] (f) Verifica manuale type/build — `Run: npx tsc --noEmit -p tsconfig.json`. Expected: nessun errore nei file nuovi. (Verifica visiva rimandata al Task 1.14 quando il modale è montato.)
- [ ] (g) Commit — `git add components/modules/rapportini/ModaleInterventoManuale.tsx lib/interventi/manuali/anagraficaCampi.ts lib/interventi/manuali/anagraficaCampi.test.ts && git commit -m "feat(interventi-manuali): modale a step committente/anagrafica/esiti + anagraficaCampi pura"`

---

### Task 1.14: Monta FAB + modale in `app/r/[token]/page.tsx`

**Files:**
- Modify: `app/r/[token]/page.tsx` (carica i template con `committente` e passa `templatesPerCommittente`/staff/piano/data)
- Modify: `components/modules/rapportini/RapportinoForm.tsx` (riceve i dati manuali e monta FAB + modale)

La pagina è un Server Component: carica i template attivi (con `committente` e `campi`) e li passa al form. Il form gestisce lo stato `modaleAperta` e monta FAB+modale usando `fabAbilitato`.

- [ ] (a) Aggiorna la query template nella pagina. In `app/r/[token]/page.tsx`, DOPO il blocco che risolve `infoCampiLive`/`titoloCampi` (dopo la riga `}` di chiusura del `if (rap.template_id) { … }`), aggiungi il caricamento dei template per committente:
```ts
  // Template attivi per committente → alimentano la modale "intervento manuale".
  const { data: tplManuali } = await supabaseAdmin
    .from('rapportino_template')
    .select('committente, campi')
    .eq('active', true);
  const templatesPerCommittente: Partial<Record<'acea' | 'italgas' | 'altro', TemplateCampo[]>> = {};
  for (const t of (tplManuali ?? []) as Array<{ committente: string | null; campi: unknown }>) {
    if (t.committente === 'acea' || t.committente === 'italgas' || t.committente === 'altro') {
      templatesPerCommittente[t.committente] = ((t.campi ?? []) as TemplateCampo[]);
    }
  }
```
- [ ] (b) Passa le nuove prop al form. Nel JSX di ritorno della pagina, estendi `<RapportinoForm … />` con:
```tsx
        infoCampiManuale={infoCampiLive}
        templatesPerCommittente={templatesPerCommittente}
```
(Le prop `token` e `rapportino.data` sono già passate; `staff_name` è già in `rapportino`. La data ISO è `rap.data`, già disponibile via `rapportino={{ staff_name: rap.staff_name, data: rap.data }}`.)
- [ ] (c) Estendi il tipo `Props` e la firma di `RapportinoForm.tsx`. Aggiungi gli import in cima:
```ts
import { FabInterventoManuale } from './FabInterventoManuale';
import { ModaleInterventoManuale } from './ModaleInterventoManuale';
import { fabAbilitato } from '@/lib/interventi/manuali/fabAbilitato';
import type { CommittenteManuale } from '@/lib/interventi/manuali/types';
```
Aggiungi al type `Props` (dopo `readOnly: boolean;`):
```ts
  infoCampiManuale?: TemplateInfoCampo[];
  templatesPerCommittente?: Partial<Record<CommittenteManuale, TemplateCampo[]>>;
```
Aggiungi i parametri destrutturati nella firma del componente (dopo `readOnly: readOnlyIniziale,`):
```ts
  infoCampiManuale = [],
  templatesPerCommittente = {},
```
- [ ] (d) Aggiungi lo stato e il render del FAB/modale. Dopo la riga `const [filtro, setFiltro] = useState<Filtro>('tutti');` aggiungi:
```ts
  const [modaleAperta, setModaleAperta] = useState(false);
```
Poi, nel `return` principale (quello con `<div className="mx-auto max-w-[480px]">`), subito PRIMA della chiusura `</div>` finale, monta FAB e modale (visibili solo in vista lista per non coprire la navigazione del focus):
```tsx
      {vista === 'lista' && (
        <FabInterventoManuale
          abilitato={fabAbilitato({ readOnly, bloccato, inviato })}
          onClick={() => setModaleAperta(true)}
        />
      )}
      {modaleAperta && (
        <ModaleInterventoManuale
          token={token}
          infoCampi={infoCampiManuale}
          campiPerCommittente={templatesPerCommittente}
          onClose={() => setModaleAperta(false)}
          onCreata={() => {
            setModaleAperta(false);
            window.location.reload();
          }}
        />
      )}
```
- [ ] (e) Verifica type-check — `Run: npx tsc --noEmit -p tsconfig.json`. Expected: nessun errore. Poi verifica build pagina pubblica — `Run: npx next build` (oppure verifica manuale: avvia `npm run dev`, apri un link `/r/<token>` valido, controlla che il FAB "+" compaia in basso a destra e che la modale apra/avanzi tra gli step).
- [ ] (f) Commit — `git add app/r/[token]/page.tsx components/modules/rapportini/RapportinoForm.tsx && git commit -m "feat(interventi-manuali): monta FAB + modale sulla pagina pubblica rapportino"`

---

### Task 1.15: Badge "Sospeso"/"Rifiutato" + blocco compilazione voci manuali

**Files:**
- Create: `lib/interventi/manuali/badgeVoce.ts` (PURA: mappa `approvazione_stato` → badge + flag bloccata)
- Test: `lib/interventi/manuali/badgeVoce.test.ts`
- Modify: `components/modules/rapportini/RapportinoForm.tsx` (propaga `approvazione_stato`/`motivo_rifiuto`/`manuale` nelle righe e nel focus)
- Modify: `components/modules/rapportini/RapportinoLista.tsx` (badge nella riga)
- Modify: `components/modules/rapportini/VoceFocus.tsx` (badge + motivo + blocco compilazione)

La regola "che badge mostrare e se la voce è bloccata" è pura e testata; i componenti la consumano.

- [ ] (a) Scrivi il test che fallisce — `lib/interventi/manuali/badgeVoce.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { badgeVoceManuale } from './badgeVoce';

describe('badgeVoceManuale', () => {
  it('in_attesa → badge Sospeso + bloccata', () => {
    expect(badgeVoceManuale('in_attesa')).toEqual({ label: '⏳ Sospeso', tono: 'attesa', bloccata: true });
  });
  it('rifiutato → badge Rifiutato, non bloccata', () => {
    expect(badgeVoceManuale('rifiutato')).toEqual({ label: '✗ Rifiutato', tono: 'rifiutato', bloccata: false });
  });
  it('approvato → nessun badge, non bloccata', () => {
    expect(badgeVoceManuale('approvato')).toBeNull();
  });
  it('null (voce normale) → nessun badge', () => {
    expect(badgeVoceManuale(null)).toBeNull();
  });
});
```
- [ ] (b) Esegui e verifica FAIL — `Run: npx vitest run lib/interventi/manuali/badgeVoce.test.ts`. Expected: FAIL (modulo inesistente).
- [ ] (c) Implementazione minimale — `lib/interventi/manuali/badgeVoce.ts`:
```ts
// PURA: badge e blocco compilazione per una voce manuale, da approvazione_stato.
// in_attesa → "Sospeso" (compilazione bloccata fino alla decisione torre).
// rifiutato → "Rifiutato" (resta visibile col motivo; non bloccata).
// approvato/null → nessun badge.
export type BadgeVoce = { label: string; tono: 'attesa' | 'rifiutato'; bloccata: boolean };

export function badgeVoceManuale(approvazioneStato: string | null): BadgeVoce | null {
  if (approvazioneStato === 'in_attesa') return { label: '⏳ Sospeso', tono: 'attesa', bloccata: true };
  if (approvazioneStato === 'rifiutato') return { label: '✗ Rifiutato', tono: 'rifiutato', bloccata: false };
  return null;
}
```
- [ ] (d) Esegui e verifica PASS — `Run: npx vitest run lib/interventi/manuali/badgeVoce.test.ts`. Expected: verde.
- [ ] (e) Propaga i campi manuali nel modello. In `app/r/[token]/page.tsx`, estendi la `select` delle voci e il mapping:
  - Nella `.select(...)` di `rapportino_voci` aggiungi `, manuale, approvazione_stato, richiesta_id, motivo_richiesta` → NB: il motivo vive su `interventi_manuali`, non sulla voce; per semplicità Fase 1 carica il motivo via join logico: aggiungi dopo il mapping `voci` un fetch dei motivi:
```ts
  const richiesteIds = (vociRows ?? [])
    .map((v) => (v as { richiesta_id?: string | null }).richiesta_id)
    .filter((x): x is string => Boolean(x));
  const motivoByRichiesta: Record<string, string | null> = {};
  if (richiesteIds.length > 0) {
    const { data: reqRows } = await supabaseAdmin
      .from('interventi_manuali')
      .select('id, motivo_rifiuto')
      .in('id', richiesteIds);
    for (const r of (reqRows ?? []) as Array<{ id: string; motivo_rifiuto: string | null }>) {
      motivoByRichiesta[r.id] = r.motivo_rifiuto;
    }
  }
```
  - Aggiungi al `VoceRow` type i campi `manuale?: boolean | null; approvazione_stato?: string | null; richiesta_id?: string | null;` e nel `.map` che produce `voci` aggiungi:
```ts
    manuale: Boolean(v.manuale),
    approvazione_stato: v.approvazione_stato ?? null,
    motivo_rifiuto: v.richiesta_id ? (motivoByRichiesta[v.richiesta_id] ?? null) : null,
```
- [ ] (f) Estendi il tipo `Voce` e le righe in `RapportinoForm.tsx`. Aggiungi al type `Voce` (dopo `nuovo?: boolean;`):
```ts
  manuale?: boolean;
  approvazione_stato?: string | null;
  motivo_rifiuto?: string | null;
```
Importa il badge in cima: `import { badgeVoceManuale } from '@/lib/interventi/manuali/badgeVoce';`. Nel `useMemo` che costruisce `righe`, aggiungi al record restituito `badge: badgeVoceManuale(v.approvazione_stato ?? null)`. Nel passaggio a `<VoceFocus … />`, aggiungi le prop:
```tsx
          approvazioneStato={voci[indiceCorrente].approvazione_stato ?? null}
          motivoRifiuto={voci[indiceCorrente].motivo_rifiuto ?? null}
```
E nel calcolo `disabilitato` passato a VoceFocus, combina col blocco voce:
```tsx
          disabilitato={disabilitato || (badgeVoceManuale(voci[indiceCorrente].approvazione_stato ?? null)?.bloccata ?? false)}
```
- [ ] (g) Mostra il badge nella riga lista. In `RapportinoLista.tsx`, estendi `RigaVoce` con `badge?: { label: string; tono: 'attesa' | 'rifiutato' } | null;` e, nel blocco titolo (dentro lo `<span className="flex min-w-0 items-center gap-1.5">`, accanto al badge "Nuovo"), aggiungi:
```tsx
                    {r.badge && (
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-none ${r.badge.tono === 'attesa' ? 'bg-[var(--warning-soft)] text-[var(--brand-text-main)]' : 'bg-[var(--danger-soft)] text-[var(--danger)]'}`}>
                        {r.badge.label}
                      </span>
                    )}
```
- [ ] (h) Badge + motivo + blocco nel focus. In `VoceFocus.tsx`, aggiungi alle prop della firma `approvazioneStato: string | null;` e `motivoRifiuto: string | null;`, importa `import { badgeVoceManuale } from '@/lib/interventi/manuali/badgeVoce';`, calcola `const badge = badgeVoceManuale(approvazioneStato);` e, subito sotto l'`<h1>` del titolo (dentro la `<section>`), aggiungi:
```tsx
          {badge && (
            <div className={`mt-2 rounded-lg px-3 py-2 text-sm font-semibold ${badge.tono === 'attesa' ? 'bg-[var(--warning-soft)] text-[var(--brand-text-main)]' : 'bg-[var(--danger-soft)] text-[var(--danger)]'}`}>
              {badge.label}
              {badge.tono === 'attesa' && ' — in attesa di approvazione dalla centrale'}
              {badge.tono === 'rifiutato' && motivoRifiuto ? ` · ${motivoRifiuto}` : ''}
            </div>
          )}
```
(Il blocco compilazione effettivo arriva da `disabilitato`, già propagato al Task 1.15.f, quindi i `CampoInput` risultano `disabilitato` quando la voce è in attesa.)
- [ ] (i) Verifica — `Run: npx vitest run lib/interventi/manuali/badgeVoce.test.ts && npx tsc --noEmit -p tsconfig.json`. Expected: test verdi e nessun errore TS. (Verifica visiva opzionale: con una richiesta in_attesa, la riga mostra "⏳ Sospeso" e il focus disabilita i campi.)
- [ ] (j) Commit — `git add lib/interventi/manuali/badgeVoce.ts lib/interventi/manuali/badgeVoce.test.ts app/r/[token]/page.tsx components/modules/rapportini/RapportinoForm.tsx components/modules/rapportini/RapportinoLista.tsx components/modules/rapportini/VoceFocus.tsx && git commit -m "feat(interventi-manuali): badge Sospeso/Rifiutato e blocco compilazione voci manuali"`

---

### Task 1.16: Componenti torre — `CodaRichiesteManuali` + `PannelloRevisioneRichiesta`

**Files:**
- Create: `components/modules/torre/CodaRichiesteManuali.tsx` (lista richieste `in_attesa`, refresh manuale)
- Create: `components/modules/torre/PannelloRevisioneRichiesta.tsx` (form editabile dei campi + Approva/Rifiuta)
- Create: `lib/interventi/manuali/datiFormRevisione.ts` (PURA: deriva i valori iniziali del form da `dati_correnti`)
- Test: `lib/interventi/manuali/datiFormRevisione.test.ts`

La preparazione dei valori iniziali del form di revisione (anagrafica + risposte) è pura e testata; i componenti gestiscono fetch/azioni.

- [ ] (a) Scrivi il test che fallisce — `lib/interventi/manuali/datiFormRevisione.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { datiFormRevisione } from './datiFormRevisione';
import type { RigaRichiesta } from './types';

const base: RigaRichiesta = {
  id: 'r1', rapportino_id: 'rap1', voce_id: 'v1', intervento_id: null,
  staff_id: 's1', staff_name: 'Mario', committente: 'acea', data: '2026-06-06',
  stato: 'in_attesa', corsia: 'normale',
  dati_operatore: { committente: 'acea', anagrafica: { nominativo: 'Mario' }, risposte: { att_cess: true } },
  dati_correnti: { committente: 'acea', anagrafica: { nominativo: 'Mario Rossi' }, risposte: { att_cess: false } },
  note: null, motivo_rifiuto: null, created_at: '2026-06-06T10:00:00Z',
};

describe('datiFormRevisione', () => {
  it('usa dati_correnti se presenti', () => {
    const d = datiFormRevisione(base);
    expect(d.anagrafica.nominativo).toBe('Mario Rossi');
    expect(d.risposte.att_cess).toBe(false);
    expect(d.committente).toBe('acea');
  });
  it('ripiega su dati_operatore se dati_correnti vuoto', () => {
    const r = { ...base, dati_correnti: {} as Record<string, unknown> };
    const d = datiFormRevisione(r);
    expect(d.anagrafica.nominativo).toBe('Mario');
    expect(d.risposte.att_cess).toBe(true);
  });
  it('manca tutto → struttura vuota con committente della riga', () => {
    const r = { ...base, dati_operatore: {} as Record<string, unknown>, dati_correnti: {} as Record<string, unknown> };
    const d = datiFormRevisione(r);
    expect(d.anagrafica).toEqual({});
    expect(d.risposte).toEqual({});
    expect(d.committente).toBe('acea');
  });
});
```
- [ ] (b) Esegui e verifica FAIL — `Run: npx vitest run lib/interventi/manuali/datiFormRevisione.test.ts`. Expected: FAIL (modulo inesistente).
- [ ] (c) Implementazione minimale — `lib/interventi/manuali/datiFormRevisione.ts`:
```ts
// PURA: valori iniziali del form di revisione torre.
// Preferisce dati_correnti (eventuali correzioni precedenti); ripiega su dati_operatore.
import type { RigaRichiesta, DatiInterventoManuale } from './types';

function asDati(raw: unknown): DatiInterventoManuale | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<DatiInterventoManuale>;
  if (!o.anagrafica && !o.risposte) return null;
  return {
    committente: (o.committente ?? 'altro') as DatiInterventoManuale['committente'],
    anagrafica: o.anagrafica ?? {},
    risposte: o.risposte ?? {},
  };
}

export function datiFormRevisione(riga: RigaRichiesta): DatiInterventoManuale {
  const correnti = asDati(riga.dati_correnti);
  const operatore = asDati(riga.dati_operatore);
  const base = correnti ?? operatore;
  return {
    committente: (base?.committente ?? riga.committente) as DatiInterventoManuale['committente'],
    anagrafica: base?.anagrafica ?? {},
    risposte: base?.risposte ?? {},
  };
}
```
- [ ] (d) Esegui e verifica PASS — `Run: npx vitest run lib/interventi/manuali/datiFormRevisione.test.ts`. Expected: verde.
- [ ] (e) Implementa `PannelloRevisioneRichiesta.tsx` (riusa `CampoInput`; per gli esiti carica i campi template della richiesta via committente — qui passati come prop `campiEsito`) — `components/modules/torre/PannelloRevisioneRichiesta.tsx`:
```tsx
'use client';

import { useMemo, useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import { CampoInput } from '@/components/modules/rapportini/CampoInput';
import { anagraficaCampi } from '@/lib/interventi/manuali/anagraficaCampi';
import { datiFormRevisione } from '@/lib/interventi/manuali/datiFormRevisione';
import type { RigaRichiesta, DatiInterventoManuale, AnagraficaManuale } from '@/lib/interventi/manuali/types';

const inputCls =
  'w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2 text-base text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none';

export function PannelloRevisioneRichiesta({
  riga,
  infoCampi,
  campiEsito,
  onDecisa,
}: {
  riga: RigaRichiesta;
  infoCampi: TemplateInfoCampo[];
  campiEsito: TemplateCampo[];
  onDecisa: () => void;
}) {
  const iniziali = useMemo(() => datiFormRevisione(riga), [riga]);
  const [anagrafica, setAnagrafica] = useState<AnagraficaManuale>(iniziali.anagrafica);
  const [risposte, setRisposte] = useState<Record<string, unknown>>(iniziali.risposte);
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const campiAnag = useMemo(() => anagraficaCampi(infoCampi), [infoCampi]);

  const approva = async () => {
    setBusy(true); setErrore(null);
    try {
      const dati_correnti: DatiInterventoManuale = { committente: iniziali.committente, anagrafica, risposte };
      const res = await fetch(`/api/admin/interventi-manuali/${riga.id}/approva`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dati_correnti }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onDecisa();
    } catch (e) { setErrore(e instanceof Error ? e.message : 'Errore'); } finally { setBusy(false); }
  };

  const rifiuta = async () => {
    setBusy(true); setErrore(null);
    try {
      const res = await fetch(`/api/admin/interventi-manuali/${riga.id}/rifiuta`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onDecisa();
    } catch (e) { setErrore(e instanceof Error ? e.message : 'Errore'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
      <p className="text-sm font-semibold text-[var(--brand-text-muted)]">{riga.staff_name ?? riga.staff_id} · {riga.committente} · {riga.data}</p>
      {campiAnag.map((c) => (
        <div key={c.chiave}>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">{c.etichetta}</label>
          <input type="text" value={anagrafica[c.chiave] ?? ''} onChange={(e) => setAnagrafica((p) => ({ ...p, [c.chiave]: e.target.value }))} className={inputCls} />
        </div>
      ))}
      {campiEsito.map((campo) => (
        <CampoInput key={campo.chiave} campo={campo} valore={risposte[campo.chiave]} disabilitato={busy} onChange={(v) => setRisposte((p) => ({ ...p, [campo.chiave]: v }))} />
      ))}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Motivo rifiuto (se rifiuti)</label>
        <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls} />
      </div>
      {errore && <p className="text-sm font-medium text-[var(--danger)]">Errore: {errore}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={rifiuta} disabled={busy} className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 font-bold text-[var(--danger)] disabled:opacity-50">Rifiuta</button>
        <button type="button" onClick={approva} disabled={busy} className="flex-1 rounded-xl bg-[var(--brand-primary)] px-4 py-3 font-semibold text-[oklch(0.16_0.06_245)] disabled:opacity-50">{busy ? '…' : 'Approva'}</button>
      </div>
    </div>
  );
}
```
- [ ] (f) Implementa `CodaRichiesteManuali.tsx` (lista `in_attesa`, refresh manuale; usa la route GET del Task 1.9) — `components/modules/torre/CodaRichiesteManuali.tsx`:
```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { PannelloRevisioneRichiesta } from './PannelloRevisioneRichiesta';
import type { RigaRichiesta, CommittenteManuale } from '@/lib/interventi/manuali/types';

export function CodaRichiesteManuali({
  infoCampi,
  campiPerCommittente,
}: {
  infoCampi: TemplateInfoCampo[];
  campiPerCommittente: Partial<Record<CommittenteManuale, TemplateCampo[]>>;
}) {
  const [richieste, setRichieste] = useState<RigaRichiesta[]>([]);
  const [caricando, setCaricando] = useState(false);
  const [aperta, setAperta] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setCaricando(true);
    try {
      const res = await fetch('/api/admin/interventi-manuali?stato=in_attesa', { cache: 'no-store' });
      if (res.ok) {
        const j = (await res.json()) as { richieste: RigaRichiesta[] };
        setRichieste(j.richieste ?? []);
      }
    } finally {
      setCaricando(false);
    }
  }, []);

  useEffect(() => { void carica(); }, [carica]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-[var(--brand-text-main)]">Richieste manuali · in attesa ({richieste.length})</h2>
        <button type="button" onClick={() => void carica()} disabled={caricando} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-text-muted)] disabled:opacity-50">
          {caricando ? 'Aggiorno…' : 'Aggiorna'}
        </button>
      </div>
      {richieste.length === 0 ? (
        <p className="text-sm text-[var(--brand-text-muted)]">Nessuna richiesta in attesa.</p>
      ) : (
        <ul className="space-y-2">
          {richieste.map((r) => (
            <li key={r.id} className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)]">
              <button type="button" onClick={() => setAperta((a) => (a === r.id ? null : r.id))} className="flex w-full items-center justify-between gap-2 p-3 text-left">
                <span className="text-sm font-semibold text-[var(--brand-text-main)]">{r.staff_name ?? r.staff_id} · {r.committente}</span>
                <span className="text-xs text-[var(--brand-text-muted)]">{r.data}</span>
              </button>
              {aperta === r.id && (
                <div className="px-3 pb-3">
                  <PannelloRevisioneRichiesta
                    riga={r}
                    infoCampi={infoCampi}
                    campiEsito={campiPerCommittente[r.committente] ?? []}
                    onDecisa={() => { setAperta(null); void carica(); }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```
- [ ] (g) Verifica — `Run: npx vitest run lib/interventi/manuali/datiFormRevisione.test.ts && npx tsc --noEmit -p tsconfig.json`. Expected: test verdi e nessun errore TS nei file nuovi.
- [ ] (h) Commit — `git add components/modules/torre/CodaRichiesteManuali.tsx components/modules/torre/PannelloRevisioneRichiesta.tsx lib/interventi/manuali/datiFormRevisione.ts lib/interventi/manuali/datiFormRevisione.test.ts && git commit -m "feat(interventi-manuali): torre — coda richieste + pannello revisione (approva/rifiuta)"`

---

### Task 1.17: Monta `CodaRichiesteManuali` in `app/hub/torre/page.tsx`

**Files:**
- Modify: `app/hub/torre/page.tsx` (carica info_campi + template per committente e monta la coda sopra la torre)

La torre page è un Server Component che già verifica admin e monta `TorreControlloClient`. Aggiungiamo il caricamento di `infoCampi` (dal template di default) e dei campi esito per committente, e montiamo `CodaRichiesteManuali` avvolgendo l'output.

- [ ] (a) Aggiungi gli import in cima a `app/hub/torre/page.tsx`:
```ts
import { CodaRichiesteManuali } from '@/components/modules/torre/CodaRichiesteManuali';
import { resolveInfoCampi, type TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
```
- [ ] (b) Prima del `return`, dopo il blocco che costruisce `operatori`, carica template/info per la coda:
```ts
  const { data: tplRows } = await supabase
    .from('rapportino_template')
    .select('committente, campi, info_campi, is_default')
    .eq('active', true);
  const tpl = (tplRows ?? []) as Array<{ committente: string | null; campi: unknown; info_campi: unknown; is_default: boolean }>;
  const tplDefault = tpl.find((t) => t.is_default) ?? tpl[0];
  const infoCampiTorre: TemplateInfoCampo[] = resolveInfoCampi((tplDefault?.info_campi ?? null) as TemplateInfoCampo[] | null);
  const campiPerCommittente: Partial<Record<'acea' | 'italgas' | 'altro', TemplateCampo[]>> = {};
  for (const t of tpl) {
    if (t.committente === 'acea' || t.committente === 'italgas' || t.committente === 'altro') {
      campiPerCommittente[t.committente] = ((t.campi ?? []) as TemplateCampo[]);
    }
  }
```
- [ ] (c) Avvolgi il `return` montando la coda sopra la torre:
```tsx
  return (
    <div className="space-y-4">
      <CodaRichiesteManuali infoCampi={infoCampiTorre} campiPerCommittente={campiPerCommittente} />
      <TorreControlloClient data={data} interventi={rows} operatori={operatori} territori={territori} />
    </div>
  );
```
- [ ] (d) Verifica — `Run: npx tsc --noEmit -p tsconfig.json`. Expected: nessun errore. (Verifica manuale: come admin apri `/hub/torre`, deve comparire in alto "Richieste manuali · in attesa (N)"; "Aggiorna" ricarica la lista; aprendo una richiesta compaiono i campi editabili e i bottoni Approva/Rifiuta.)
- [ ] (e) Esegui l'intera suite per regressioni — `Run: npm test`. Expected: nessun fallimento nei moduli toccati (`lib/interventi/manuali/*`); la baseline preesistente resta invariata.
- [ ] (f) Commit — `git add app/hub/torre/page.tsx && git commit -m "feat(interventi-manuali): monta la coda richieste manuali nella torre di controllo"`

## Fase 2 — Foto obbligatorie

> Scope: **solo interventi manuali**. Estende il tipo campo del template con `'foto'` + `obbligatoria`, crea storage privato + tabella allegati, e aggancia cattura/compressione/validazione/upload a quanto creato in Fase 1.
> Convenzioni: vitest (`npm test` = `vitest run`), test UNIT su funzioni pure. Route `/api/r/[token]/*` protette dal token (`tokenStatus(...) === 'valido'` else 409), `export const runtime = 'nodejs'`. DB server-side via `import { supabaseAdmin } from '@/lib/supabaseAdmin'`. Commit: `feat(interventi-manuali): …` / `test(interventi-manuali): …`.
> Baseline lint già rossa su `main`: il gate è "nessun nuovo problema dai file del WP" → verifica con `npx eslint <path>`.
> I task che toccano file **creati in Fase 1** (route `intervento-manuale`, `ModaleInterventoManuale.tsx`) sono marcati **Modify**: mostrano le sole aggiunte coerenti col contratto di Fase 1.

---

### Task 2.1: Estendi `TemplateCampo` con il tipo `'foto'` e il flag `obbligatoria`

**Files:**
- Modify: `utils/rapportini/buildVoci.ts`
- Test: `utils/rapportini/buildVoci.test.ts` (esistente — si aggiunge un blocco)

Step:

- [ ] **Test che fallisce.** Aggiungi in coda a `utils/rapportini/buildVoci.test.ts` un blocco che verifica che un campo `foto` con `obbligatoria` sia tipizzato/accettato (compila + valori corretti a runtime):

```ts
import { describe, it, expect } from 'vitest';
import { taskToVoce, mergeVoci, type Voce, type TemplateCampo } from './buildVoci';

// … blocchi esistenti taskToVoce / mergeVoci invariati …

describe('TemplateCampo tipo foto', () => {
  it('accetta un campo di tipo foto con flag obbligatoria', () => {
    const campo: TemplateCampo = {
      chiave: 'foto_contatore',
      etichetta: 'Foto contatore',
      tipo: 'foto',
      obbligatoria: true,
      ordine: 1,
    };
    expect(campo.tipo).toBe('foto');
    expect(campo.obbligatoria).toBe(true);
  });

  it('obbligatoria è opzionale (campo foto facoltativo)', () => {
    const campo: TemplateCampo = {
      chiave: 'foto_panoramica',
      etichetta: 'Foto panoramica',
      tipo: 'foto',
      ordine: 2,
    };
    expect(campo.tipo).toBe('foto');
    expect(campo.obbligatoria).toBeUndefined();
  });
});
```

- [ ] **Verifica FAIL** (il tipo `'foto'` e `obbligatoria` non esistono ancora → errore di compilazione TS):
  `npx vitest run utils/rapportini/buildVoci.test.ts -t "tipo foto"`

- [ ] **Implementazione.** In `utils/rapportini/buildVoci.ts` estendi l'interfaccia (le altre righe del file restano invariate):

```ts
export interface TemplateCampo {
  chiave: string; etichetta: string;
  tipo: 'crocetta' | 'testo' | 'select' | 'numero' | 'foto';
  opzioni?: string[];
  obbligatoria?: boolean; // usato dai campi tipo 'foto': slot obbligatorio o facoltativo
  ordine: number;
}
```

- [ ] **Verifica PASS:** `npx vitest run utils/rapportini/buildVoci.test.ts -t "tipo foto"`
- [ ] **Lint pulito sul file toccato:** `npx eslint utils/rapportini/buildVoci.ts utils/rapportini/buildVoci.test.ts`
- [ ] **Commit:** `feat(interventi-manuali): TemplateCampo supporta tipo foto e flag obbligatoria`

---

### Task 2.2: Migrazione `interventi_manuali_foto` + bucket privato + policy storage

**Files:**
- Create: `supabase/migrations/20260606000001_interventi_manuali_foto.sql`

> Nota consegna SQL (memoria utente): la SQL si lancia al PC; **non** la si esegue qui, **non** la si incolla in chat se non su richiesta esplicita. Il Supabase MCP punta al progetto "aurea", **non** al DB prod. Questo task **scrive solo il file** di migrazione (nessun comando DB).
> La tabella `interventi_manuali` esiste già (creata in Fase 1 — migrazione `…_interventi_manuali.sql`): qui si crea solo la tabella **foto** + lo **storage**.

Step:

- [ ] **Scrivi il file** `supabase/migrations/20260606000001_interventi_manuali_foto.sql` (pattern coerente con `20260502000000_rapportini_interattivi.sql` per RLS e con `20260603020000_realtime_interventi.sql` per i blocchi idempotenti `do $$`):

```sql
-- Fase 2 — Foto obbligatorie (solo interventi manuali)
-- (1) tabella allegati interventi_manuali_foto
-- (2) bucket Storage PRIVATO 'interventi-foto'
-- (3) policy storage.objects per authenticated sul bucket

-- (1) Allegati foto delle richieste manuali ───────────────────────────────────
create table if not exists interventi_manuali_foto (
  id uuid primary key default gen_random_uuid(),
  richiesta_id uuid not null references interventi_manuali(id) on delete cascade,
  slot_chiave text not null,
  slot_etichetta text not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size int,
  created_at timestamptz not null default now()
);
create index if not exists idx_interventi_manuali_foto_richiesta
  on interventi_manuali_foto (richiesta_id);

alter table interventi_manuali_foto enable row level security;
drop policy if exists "imf_all_auth" on interventi_manuali_foto;
create policy "imf_all_auth" on interventi_manuali_foto
  for all to authenticated using (true) with check (true);

-- (2) Bucket privato 'interventi-foto' (idempotente) ──────────────────────────
insert into storage.buckets (id, name, public)
values ('interventi-foto', 'interventi-foto', false)
on conflict (id) do nothing;

-- (3) Policy storage.objects per authenticated sul bucket privato ─────────────
drop policy if exists "interventi_foto_select" on storage.objects;
create policy "interventi_foto_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'interventi-foto');

drop policy if exists "interventi_foto_insert" on storage.objects;
create policy "interventi_foto_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'interventi-foto');

drop policy if exists "interventi_foto_delete" on storage.objects;
create policy "interventi_foto_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'interventi-foto');
```

- [ ] **Verifica (statica, niente DB):** la migrazione segue il pattern del repo (RLS `for all to authenticated`, `if not exists`, `on conflict do nothing`); l'upload runtime usa `supabaseAdmin` (service role → bypassa RLS), le policy coprono gli accessi `authenticated` lato admin/signed URL.
- [ ] **Commit:** `feat(interventi-manuali): migrazione foto interventi manuali + bucket privato e policy storage`

---

### Task 2.3: `fotoNaming.ts` — nome file logico `Etichetta_identificativo.ext` (PURA)

**Files:**
- Create: `lib/interventi/manuali/fotoNaming.ts`
- Test: `lib/interventi/manuali/fotoNaming.test.ts`

> Naming (design §8): `<EtichettaSlotNormalizzata>_<identificativo>.<ext>`; `identificativo` = **primo non vuoto** tra **PDR → matricola → ODL → indirizzo**, fallback `'intervento'`. Normalizzazione ASCII: niente accenti/spazi/caratteri speciali.

Step:

- [ ] **Test che fallisce.** Crea `lib/interventi/manuali/fotoNaming.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizzaAscii, nomeFotoFile } from './fotoNaming';

describe('normalizzaAscii', () => {
  it('rimuove accenti e spazi', () => {
    expect(normalizzaAscii('Foto contatore')).toBe('FotoContatore');
    expect(normalizzaAscii('Attività à è ì ò ù')).toBe('AttivitaAEIOU');
  });
  it('rimuove i caratteri speciali', () => {
    expect(normalizzaAscii('Via G. D\'Annunzio, 12/B')).toBe('ViaGDAnnunzio12B');
  });
  it('stringa vuota o solo simboli → stringa vuota', () => {
    expect(normalizzaAscii('  ')).toBe('');
    expect(normalizzaAscii('***')).toBe('');
  });
});

describe('nomeFotoFile', () => {
  it('usa il PDR quando presente (priorità massima)', () => {
    const nome = nomeFotoFile(
      'Foto contatore',
      { pdr: '12345', matricola: 'M99', odl: 'O77', indirizzo: 'Via Roma 1' },
      'jpg',
    );
    expect(nome).toBe('FotoContatore_12345.jpg');
  });

  it('usa la matricola se manca il PDR', () => {
    const nome = nomeFotoFile('Foto sigillo', { matricola: 'MAT-77' }, 'jpg');
    expect(nome).toBe('FotoSigillo_MAT77.jpg');
  });

  it('usa l\'ODL se mancano PDR e matricola', () => {
    const nome = nomeFotoFile('Foto matricola', { odl: 'ODL 9001' }, 'png');
    expect(nome).toBe('FotoMatricola_ODL9001.png');
  });

  it('usa l\'indirizzo se mancano PDR, matricola e ODL', () => {
    const nome = nomeFotoFile('Foto panoramica', { indirizzo: 'Via San Giovanni, 3' }, 'jpg');
    expect(nome).toBe('FotoPanoramica_ViaSanGiovanni3.jpg');
  });

  it('fallback a "intervento" se nessun identificativo', () => {
    const nome = nomeFotoFile('Foto contatore', {}, 'jpg');
    expect(nome).toBe('FotoContatore_intervento.jpg');
  });

  it('normalizza etichette con accenti/spazi e identificativo', () => {
    const nome = nomeFotoFile('Foto attività à', { pdr: 'PDR 0042' }, 'JPEG');
    expect(nome).toBe('FotoAttivitaA_PDR0042.jpeg');
  });

  it('etichetta vuota → "foto" come base', () => {
    const nome = nomeFotoFile('   ', { pdr: '7' }, 'jpg');
    expect(nome).toBe('foto_7.jpg');
  });
});
```

- [ ] **Verifica FAIL:** `npx vitest run lib/interventi/manuali/fotoNaming.test.ts`

- [ ] **Implementazione.** Crea `lib/interventi/manuali/fotoNaming.ts`:

```ts
/** Identificativi disponibili per nominare la foto, in ordine di priorità. */
export interface IdentificativiFoto {
  pdr?: string | null;
  matricola?: string | null;
  odl?: string | null;
  indirizzo?: string | null;
}

/**
 * Normalizza una stringa in ASCII "file-safe": rimuove accenti (decomposizione
 * Unicode), spazi e ogni carattere che non sia [A-Za-z0-9]. Non altera il case.
 * Es. "Foto contatore" → "FotoContatore"; "Via D'Annunzio, 12/B" → "ViaDAnnunzio12B".
 */
export function normalizzaAscii(input: string): string {
  return (input ?? '')
    .normalize('NFD')               // separa lettera + diacritico
    .replace(/[̀-ͯ]/g, '') // rimuove i diacritici
    .replace(/[^A-Za-z0-9]/g, '');   // tiene solo alfanumerici ASCII
}

/** Primo identificativo non vuoto, nell'ordine PDR → matricola → ODL → indirizzo. */
function identificativoFoto(ids: IdentificativiFoto): string {
  const candidati = [ids.pdr, ids.matricola, ids.odl, ids.indirizzo];
  for (const c of candidati) {
    const norm = normalizzaAscii(String(c ?? '').trim());
    if (norm) return norm;
  }
  return 'intervento';
}

/**
 * Nome file logico della foto: `<EtichettaSlotNormalizzata>_<identificativo>.<ext>`.
 * - etichetta normalizzata ASCII (fallback "foto" se vuota dopo normalizzazione);
 * - identificativo = primo non vuoto tra PDR → matricola → ODL → indirizzo (fallback "intervento");
 * - estensione in minuscolo, senza punto iniziale.
 */
export function nomeFotoFile(
  etichettaSlot: string,
  ids: IdentificativiFoto,
  ext: string,
): string {
  const base = normalizzaAscii(etichettaSlot) || 'foto';
  const id = identificativoFoto(ids);
  const estensione = String(ext ?? '').trim().replace(/^\./, '').toLowerCase() || 'jpg';
  return `${base}_${id}.${estensione}`;
}
```

- [ ] **Verifica PASS:** `npx vitest run lib/interventi/manuali/fotoNaming.test.ts`
- [ ] **Lint:** `npx eslint lib/interventi/manuali/fotoNaming.ts lib/interventi/manuali/fotoNaming.test.ts`
- [ ] **Commit:** `feat(interventi-manuali): naming file foto (etichetta_identificativo normalizzato)`

---

### Task 2.4: `validaFotoObbligatorie.ts` — verifica slot obbligatori presenti (PURA)

**Files:**
- Create: `lib/interventi/manuali/validaFotoObbligatorie.ts`
- Test: `lib/interventi/manuali/validaFotoObbligatorie.test.ts`

> Input: i campi del template di tipo `foto` + una mappa `slot_chiave → foto presente?`. Output: `{ ok, mancanti }` dove `mancanti` sono le **etichette** degli slot obbligatori senza foto. Riusata sia dalla modale (client, disabilita invio) sia dalla route (server, 422).

Step:

- [ ] **Test che fallisce.** Crea `lib/interventi/manuali/validaFotoObbligatorie.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { campiFoto, validaFotoObbligatorie } from './validaFotoObbligatorie';

const campi: TemplateCampo[] = [
  { chiave: 'att_cess', etichetta: 'ATT/CESS', tipo: 'crocetta', ordine: 1 },
  { chiave: 'foto_contatore', etichetta: 'Foto contatore', tipo: 'foto', obbligatoria: true, ordine: 2 },
  { chiave: 'foto_sigillo', etichetta: 'Foto sigillo', tipo: 'foto', obbligatoria: true, ordine: 3 },
  { chiave: 'foto_extra', etichetta: 'Foto extra', tipo: 'foto', obbligatoria: false, ordine: 4 },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 5 },
];

describe('campiFoto', () => {
  it('filtra solo i campi di tipo foto, in ordine', () => {
    expect(campiFoto(campi).map((c) => c.chiave)).toEqual([
      'foto_contatore', 'foto_sigillo', 'foto_extra',
    ]);
  });
});

describe('validaFotoObbligatorie', () => {
  it('ok quando tutti gli slot obbligatori hanno una foto', () => {
    const res = validaFotoObbligatorie(campi, {
      foto_contatore: true,
      foto_sigillo: true,
      // foto_extra mancante ma facoltativo
    });
    expect(res).toEqual({ ok: true, mancanti: [] });
  });

  it('elenca le etichette degli obbligatori mancanti', () => {
    const res = validaFotoObbligatorie(campi, { foto_contatore: true });
    expect(res.ok).toBe(false);
    expect(res.mancanti).toEqual(['Foto sigillo']);
  });

  it('uno slot presente ma con valore falsy conta come mancante', () => {
    const res = validaFotoObbligatorie(campi, {
      foto_contatore: true,
      foto_sigillo: false,
    });
    expect(res.ok).toBe(false);
    expect(res.mancanti).toEqual(['Foto sigillo']);
  });

  it('nessun campo foto obbligatorio → sempre ok', () => {
    const soloFacoltativi: TemplateCampo[] = [
      { chiave: 'foto_extra', etichetta: 'Foto extra', tipo: 'foto', obbligatoria: false, ordine: 1 },
    ];
    expect(validaFotoObbligatorie(soloFacoltativi, {})).toEqual({ ok: true, mancanti: [] });
  });
});
```

- [ ] **Verifica FAIL:** `npx vitest run lib/interventi/manuali/validaFotoObbligatorie.test.ts`

- [ ] **Implementazione.** Crea `lib/interventi/manuali/validaFotoObbligatorie.ts`:

```ts
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export interface EsitoValidazioneFoto {
  ok: boolean;
  /** Etichette degli slot obbligatori privi di foto. */
  mancanti: string[];
}

/** I soli campi del template di tipo 'foto', preservando l'ordine del template. */
export function campiFoto(campi: TemplateCampo[]): TemplateCampo[] {
  return (campi ?? []).filter((c) => c.tipo === 'foto');
}

/**
 * Verifica che ogni slot foto `obbligatoria === true` abbia una foto presente.
 * @param campi    campi del template (si filtrano i `tipo === 'foto'`)
 * @param presenti mappa `slot_chiave → boolean` (true se per quello slot c'è una foto)
 */
export function validaFotoObbligatorie(
  campi: TemplateCampo[],
  presenti: Record<string, boolean>,
): EsitoValidazioneFoto {
  const mancanti = campiFoto(campi)
    .filter((c) => c.obbligatoria === true && presenti[c.chiave] !== true)
    .map((c) => c.etichetta);
  return { ok: mancanti.length === 0, mancanti };
}
```

- [ ] **Verifica PASS:** `npx vitest run lib/interventi/manuali/validaFotoObbligatorie.test.ts`
- [ ] **Lint:** `npx eslint lib/interventi/manuali/validaFotoObbligatorie.ts lib/interventi/manuali/validaFotoObbligatorie.test.ts`
- [ ] **Commit:** `feat(interventi-manuali): validazione foto obbligatorie (ok + mancanti)`

---

### Task 2.5: `CampoFoto.tsx` — cattura/libreria + preview + compressione client

**Files:**
- Create: `lib/interventi/manuali/compressioneFoto.ts` (PURA — solo il calcolo dimensioni target, testabile)
- Test: `lib/interventi/manuali/compressioneFoto.test.ts`
- Create: `components/modules/rapportini/CampoFoto.tsx`

> La compressione effettiva usa `<canvas>`/`Image`/`toBlob` (browser, non testabile in vitest jsdom in modo affidabile). Estraiamo la sola **matematica** del ridimensionamento (lato lungo ~1600px, mantieni aspect ratio, mai upscale) in una funzione pura e la testiamo; il componente la usa.

Step:

- [ ] **Test che fallisce.** Crea `lib/interventi/manuali/compressioneFoto.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dimensioniTarget, LATO_LUNGO_MAX } from './compressioneFoto';

describe('dimensioniTarget', () => {
  it('riduce in orizzontale mantenendo le proporzioni', () => {
    expect(dimensioniTarget(3200, 2400)).toEqual({ width: 1600, height: 1200 });
  });

  it('riduce in verticale (lato lungo = altezza)', () => {
    expect(dimensioniTarget(2400, 3200)).toEqual({ width: 1200, height: 1600 });
  });

  it('non ingrandisce immagini più piccole del massimo', () => {
    expect(dimensioniTarget(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('immagine quadrata al limite resta invariata', () => {
    expect(dimensioniTarget(1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it('arrotonda all\'intero', () => {
    const d = dimensioniTarget(2000, 1333); // scala = 1600/2000 = 0.8 → 1066.4
    expect(d).toEqual({ width: 1600, height: 1066 });
  });

  it('LATO_LUNGO_MAX è 1600', () => {
    expect(LATO_LUNGO_MAX).toBe(1600);
  });
});
```

- [ ] **Verifica FAIL:** `npx vitest run lib/interventi/manuali/compressioneFoto.test.ts`

- [ ] **Implementazione (funzione pura).** Crea `lib/interventi/manuali/compressioneFoto.ts`:

```ts
/** Lato lungo massimo (px) per le foto compresse lato client. */
export const LATO_LUNGO_MAX = 1600;
/** Qualità JPEG usata da `toBlob` nel componente. */
export const JPEG_QUALITA = 0.8;

export interface Dimensioni {
  width: number;
  height: number;
}

/**
 * Calcola le dimensioni target ridimensionando in modo che il lato lungo
 * non superi `max` (default `LATO_LUNGO_MAX`), mantenendo l'aspect ratio.
 * Non ingrandisce mai (scala ≤ 1). Risultato arrotondato all'intero.
 */
export function dimensioniTarget(
  width: number,
  height: number,
  max: number = LATO_LUNGO_MAX,
): Dimensioni {
  const latoLungo = Math.max(width, height);
  const scala = latoLungo > max ? max / latoLungo : 1;
  return {
    width: Math.round(width * scala),
    height: Math.round(height * scala),
  };
}
```

- [ ] **Verifica PASS:** `npx vitest run lib/interventi/manuali/compressioneFoto.test.ts`

- [ ] **Implementazione (componente).** Crea `components/modules/rapportini/CampoFoto.tsx`. Usa la classe input/label del progetto (coerente con `CampoInput.tsx`), due input file (scatto `capture="environment"` + libreria), preview via `URL.createObjectURL`, e comprime su canvas riusando `dimensioniTarget`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { dimensioniTarget, JPEG_QUALITA } from '@/lib/interventi/manuali/compressioneFoto';

/** Comprime un file immagine su canvas: lato lungo ~1600px, JPEG q≈0.8. */
async function comprimiImmagine(file: File): Promise<File> {
  const dataUrl: string = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('immagine non valida'));
    i.src = dataUrl;
  });

  const { width, height } = dimensioniTarget(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file; // fallback: nessuna compressione possibile
  ctx.drawImage(img, 0, 0, width, height);

  const blob: Blob | null = await new Promise((res) =>
    canvas.toBlob((b) => res(b), 'image/jpeg', JPEG_QUALITA),
  );
  if (!blob) return file;

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}

export function CampoFoto({
  campo,
  file,
  disabilitato,
  onChange,
}: {
  campo: { chiave: string; etichetta: string; obbligatoria?: boolean };
  file: File | null;
  disabilitato: boolean;
  onChange: (file: File | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [elaboro, setElaboro] = useState(false);
  const scattoRef = useRef<HTMLInputElement>(null);
  const libreriaRef = useRef<HTMLInputElement>(null);

  // Genera/revoca l'object URL per la preview al cambio file.
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function handleFiles(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    setElaboro(true);
    try {
      onChange(await comprimiImmagine(f));
    } finally {
      setElaboro(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--brand-text-main)]">{campo.etichetta}</span>
        {campo.obbligatoria && (
          <span className="rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-xs font-bold text-[var(--danger)]">
            obbligatoria
          </span>
        )}
      </div>

      {preview && (
        <img
          src={preview}
          alt={campo.etichetta}
          className="mb-2 max-h-48 w-full rounded-lg object-cover"
        />
      )}

      {/* Input nascosti: scatto (capture) + libreria */}
      <input
        ref={scattoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={disabilitato || elaboro}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={libreriaRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabilitato || elaboro}
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabilitato || elaboro}
          onClick={() => scattoRef.current?.click()}
          className="rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition hover:opacity-90 disabled:opacity-50"
        >
          {preview ? 'Rifai scatto' : '📷 Scatta'}
        </button>
        <button
          type="button"
          disabled={disabilitato || elaboro}
          onClick={() => libreriaRef.current?.click()}
          className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary)] disabled:opacity-50"
        >
          🖼️ Libreria
        </button>
        {preview && !disabilitato && (
          <button
            type="button"
            disabled={elaboro}
            onClick={() => onChange(null)}
            className="rounded-lg border border-[var(--danger)] px-3 py-1.5 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)] disabled:opacity-50"
          >
            Rimuovi
          </button>
        )}
        {elaboro && <span className="self-center text-xs text-[var(--brand-text-muted)]">Elaborazione…</span>}
      </div>
    </div>
  );
}
```

- [ ] **Lint:** `npx eslint lib/interventi/manuali/compressioneFoto.ts lib/interventi/manuali/compressioneFoto.test.ts components/modules/rapportini/CampoFoto.tsx`
- [ ] **Commit:** `feat(interventi-manuali): CampoFoto con cattura/libreria, preview e compressione client`

---

### Task 2.6: Step "Foto" nella `ModaleInterventoManuale` (Modify — file di Fase 1)

**Files:**
- Modify: `components/modules/rapportini/ModaleInterventoManuale.tsx` (creato in Fase 1)

> Aggiunte coerenti con il contratto di Fase 1 (modale a step; lo step "Foto" è l'ultimo prima dell'invio). Mostra uno slot `CampoFoto` per ogni campo `tipo === 'foto'` del template risolto dal committente; raccoglie i `File` in stato `Record<slot_chiave, File>`; disabilita l'invio finché `validaFotoObbligatorie` non è `ok`.

Step:

- [ ] **Aggiunte agli import** (in testa al componente di Fase 1):

```tsx
import { CampoFoto } from './CampoFoto';
import { campiFoto, validaFotoObbligatorie } from '@/lib/interventi/manuali/validaFotoObbligatorie';
```

- [ ] **Stato delle foto** (accanto agli altri `useState` della modale di Fase 1). `campi` è il template risolto dal committente (già presente in Fase 1):

```tsx
const [foto, setFoto] = useState<Record<string, File>>({});
const slotFoto = campiFoto(campi); // campi: TemplateCampo[] del template selezionato

const esitoFoto = validaFotoObbligatorie(campi, Object.fromEntries(
  slotFoto.map((c) => [c.chiave, foto[c.chiave] != null]),
));
```

- [ ] **Render dello step "Foto"** (nuovo step, dopo "lavorazioni/esiti"):

```tsx
{step === 'foto' && (
  <div className="space-y-3">
    <p className="text-sm text-[var(--brand-text-muted)]">
      Carica le foto richieste. Quelle contrassegnate come <b>obbligatorie</b> servono per inviare la richiesta.
    </p>
    {slotFoto.length === 0 && (
      <p className="text-sm text-[var(--brand-text-muted)]">Questo template non richiede foto.</p>
    )}
    {slotFoto.map((c) => (
      <CampoFoto
        key={c.chiave}
        campo={c}
        file={foto[c.chiave] ?? null}
        disabilitato={inviando}
        onChange={(f) =>
          setFoto((prev) => {
            const next = { ...prev };
            if (f) next[c.chiave] = f;
            else delete next[c.chiave];
            return next;
          })
        }
      />
    ))}
    {!esitoFoto.ok && (
      <p className="text-xs font-medium text-[var(--danger)]">
        Mancano: {esitoFoto.mancanti.join(', ')}
      </p>
    )}
  </div>
)}
```

- [ ] **Pulsante invio** (estende il footer della modale di Fase 1 — `inviando` è lo stato di submit già presente):

```tsx
<button
  type="button"
  disabled={inviando || !esitoFoto.ok}
  onClick={handleInvia}
  className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition hover:opacity-90 disabled:opacity-50"
>
  {inviando ? 'Invio…' : 'Invia richiesta'}
</button>
```

- [ ] **`handleInvia`: invio MULTIPART** (estende l'handler di Fase 1: parte JSON `dati` + un file per slot). La route di Task 2.7 legge esattamente questo formato:

```tsx
const fd = new FormData();
fd.append('dati', JSON.stringify({ committente, anagrafica, risposte, note }));
for (const c of slotFoto) {
  const f = foto[c.chiave];
  if (f) fd.append(`foto:${c.chiave}`, f, f.name);
}
const res = await fetch(`/api/r/${token}/intervento-manuale`, { method: 'POST', body: fd });
// gestione esito come in Fase 1 (422 = foto obbligatorie mancanti → mostra messaggio)
```

- [ ] **Verifica manuale (UI):** lo step "Foto" mostra uno slot per campo foto; l'invio resta disabilitato finché gli obbligatori non hanno foto; il `FormData` contiene `dati` + `foto:<slot>`.
- [ ] **Lint:** `npx eslint components/modules/rapportini/ModaleInterventoManuale.tsx`
- [ ] **Commit:** `feat(interventi-manuali): step foto nella modale con validazione obbligatorie e invio multipart`

---

### Task 2.7: Route `intervento-manuale` → MULTIPART + upload foto (Modify — file di Fase 1)

**Files:**
- Modify: `app/api/r/[token]/intervento-manuale/route.ts` (creato in Fase 1)

> Estende la route di Fase 1 da JSON a **multipart**: `dati` (JSON) + parti `foto:<slot>`. Mantiene il guard token di Fase 1 (`tokenStatus(...) === 'valido'` else 409) e `export const runtime = 'nodejs'`. Aggiunge: validazione foto obbligatorie (422), upload su `supabaseAdmin.storage.from('interventi-foto')`, INSERT `interventi_manuali_foto` con `file_name = nomeFotoFile(...)`.

Step:

- [ ] **Aggiunte agli import** (in testa alla route di Fase 1):

```ts
import { campiFoto, validaFotoObbligatorie } from '@/lib/interventi/manuali/validaFotoObbligatorie';
import { nomeFotoFile } from '@/lib/interventi/manuali/fotoNaming';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
```

- [ ] **Parsing multipart** (sostituisce il `await req.json()` di Fase 1). Pattern `formData()` come in `app/hub/rapportini/save/route.tsx`:

```ts
const form = await req.formData();
const dati = JSON.parse(String(form.get('dati') ?? '{}')) as {
  committente: 'acea' | 'italgas' | 'altro';
  anagrafica: { pdr?: string; matricola?: string; odl?: string; indirizzo?: string; comune?: string; [k: string]: unknown };
  risposte: Record<string, unknown>;
  note?: string;
};

// `template` risolto dal committente come in Fase 1 (risolviTemplateCommittente).
const campi = (template.campi ?? []) as TemplateCampo[];
const slotFoto = campiFoto(campi);

// Raccoglie le parti file "foto:<slot>"
const fileBySlot = new Map<string, File>();
for (const c of slotFoto) {
  const parte = form.get(`foto:${c.chiave}`);
  if (parte instanceof File && parte.size > 0) fileBySlot.set(c.chiave, parte);
}
```

- [ ] **Validazione foto obbligatorie → 422**:

```ts
const esito = validaFotoObbligatorie(campi, Object.fromEntries(
  slotFoto.map((c) => [c.chiave, fileBySlot.has(c.chiave)]),
));
if (!esito.ok) {
  return NextResponse.json(
    { error: 'Foto obbligatorie mancanti', mancanti: esito.mancanti },
    { status: 422 },
  );
}
```

- [ ] **Crea la richiesta** (logica di Fase 1: INSERT `interventi_manuali` → `richiesta.id`), **poi** carica le foto e inserisci i record. `storage_path = <richiesta_id>/<slot>_<id>.<ext>`; `file_name = nomeFotoFile(...)` (design §8):

```ts
const ids = {
  pdr: dati.anagrafica.pdr,
  matricola: dati.anagrafica.matricola,
  odl: dati.anagrafica.odl,
  indirizzo: dati.anagrafica.indirizzo,
};

for (const c of slotFoto) {
  const f = fileBySlot.get(c.chiave);
  if (!f) continue; // slot facoltativo non compilato

  const ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
  const storagePath = `${richiesta.id}/${c.chiave}_${richiesta.id}.${ext}`;
  const buf = Buffer.from(await f.arrayBuffer());

  const { error: upErr } = await supabaseAdmin.storage
    .from('interventi-foto')
    .upload(storagePath, buf, { contentType: f.type || 'image/jpeg', upsert: true });
  if (upErr) {
    return NextResponse.json({ error: `Upload foto fallito: ${upErr.message}` }, { status: 502 });
  }

  const { error: insErr } = await supabaseAdmin.from('interventi_manuali_foto').insert({
    richiesta_id: richiesta.id,
    slot_chiave: c.chiave,
    slot_etichetta: c.etichetta,
    storage_path: storagePath,
    file_name: nomeFotoFile(c.etichetta, ids, ext),
    mime_type: f.type || 'image/jpeg',
    size: f.size,
  });
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
}
```

- [ ] **Verifica manuale:** chiamata senza una foto obbligatoria → 422 con `mancanti`; chiamata completa → 200, file nel bucket `interventi-foto` sotto `<richiesta_id>/…` e righe in `interventi_manuali_foto` con `file_name` corretto.
- [ ] **Lint:** `npx eslint "app/api/r/[token]/intervento-manuale/route.ts"`
- [ ] **Commit:** `feat(interventi-manuali): route intervento-manuale multipart con upload foto e validazione 422`

---

### Task 2.8: Config template — tipo campo "foto" + selettore committente

**Files:**
- Modify: `components/modules/rapportini/CampoInput.tsx`
- Modify: `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`

> UI per: (a) aggiungere un campo `foto` con flag **obbligatoria** nell'editor template; (b) un selettore `committente` del template (`acea` / `italgas` / `altro` / nessuno). Il render preview del campo foto in `CampoInput.tsx` è un segnaposto (la cattura vera è in `CampoFoto`, lato operatore).

Step:

- [ ] **`CampoInput.tsx` — preview del tipo `foto`.** Aggiungi un ramo prima del `return` finale (textarea), riusando `labelEl` già definito nel componente:

```tsx
if (campo.tipo === 'foto') {
  return (
    <div>
      {labelEl}
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2 text-sm text-[var(--brand-text-muted)]">
        <span aria-hidden>📷</span>
        <span>Slot foto{campo.obbligatoria ? ' (obbligatoria)' : ''}</span>
      </div>
    </div>
  );
}
```

- [ ] **`TemplateRapportiniClient.tsx` — etichetta del tipo "foto"** in `TIPO_LABELS` (così appare nel `<select>` dei tipi, già presente):

```tsx
const TIPO_LABELS: Record<TemplateCampo['tipo'], string> = {
  crocetta: 'Crocetta',
  testo: 'Testo libero',
  select: 'Selezione',
  numero: 'Numero',
  foto: 'Foto',
};
```

- [ ] **`TemplateRapportiniClient.tsx` — flag "obbligatoria" per i campi foto.** Aggiungi, nella card del campo, subito dopo il blocco "Row 2: opzioni (solo se tipo=select)", un blocco analogo per il foto:

```tsx
{/* Row 2b: flag obbligatoria (solo se tipo=foto) */}
{campo.tipo === 'foto' && (
  <label className="mb-3 flex items-center gap-2 text-sm text-[var(--brand-text-main)]">
    <input
      type="checkbox"
      checked={campo.obbligatoria === true}
      onChange={(e) => updateCampo(idx, { obbligatoria: e.target.checked })}
      className="h-4 w-4 accent-[var(--brand-primary)]"
    />
    Foto obbligatoria
  </label>
)}
```

- [ ] **`TemplateRapportiniClient.tsx` — selettore committente del template.** Estendi il tipo `Template` e lo stato, e aggiungi una card UI accanto a "Nome template".

  Tipo + stato:

```tsx
type Committente = 'acea' | 'italgas' | 'altro';

type Template = {
  id: string;
  nome: string;
  committente?: Committente | null; // marca il template per un committente (null = nessuno/Standard)
  campi: TemplateCampo[];
  info_campi?: TemplateInfoCampo[];
  titolo_campi?: InfoChiave[];
  is_default: boolean;
  active: boolean;
};

// accanto agli altri useState:
const [committente, setCommittente] = useState<Committente | ''>('');
```

  In `loadTemplate`/`startNew` allinea lo stato:

```tsx
// in loadTemplate(tpl):
setCommittente(tpl.committente ?? '');
// in startNew():
setCommittente('');
```

  UI (nuova card dopo "Nome template"):

```tsx
<div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
  <h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Committente</h3>
  <p className="mb-4 text-xs text-[var(--brand-text-muted)]">
    Associa il template a un committente per gli interventi manuali. &quot;Nessuno&quot; = template generico (Standard).
  </p>
  <select
    value={committente}
    onChange={(e) => setCommittente(e.target.value as Committente | '')}
    className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
  >
    <option value="">— Nessuno —</option>
    <option value="acea">Acea</option>
    <option value="italgas">Italgas</option>
    <option value="altro">Altro</option>
  </select>
</div>
```

  Includi `committente` nei due `payload` (in `handleSave` e nell'auto-save `useEffect`) e fra le dipendenze dell'effetto:

```tsx
// nei payload di handleSave e dell'auto-save:
committente: committente || null,
// dipendenze auto-save:
}, [nome, committente, campi, infoCampi, titoloCampi, isNew, selectedId]);
```

- [ ] **Verifica manuale (UI):** nell'editor si può scegliere tipo "Foto", spuntare "Foto obbligatoria", e impostare il committente; salvataggio/auto-save inviano `obbligatoria` (nei `campi`) e `committente`.
- [ ] **Lint:** `npx eslint components/modules/rapportini/CampoInput.tsx app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`
- [ ] **Commit:** `feat(interventi-manuali): config template — campo foto (obbligatoria) e selettore committente`

---

### Chiusura Fase 2

- [ ] `npm test` verde (nuovi unit: `fotoNaming`, `validaFotoObbligatorie`, `compressioneFoto`, `buildVoci`).
- [ ] `npx eslint` pulito su **tutti** i file toccati in Fase 2 (no nuovi problemi rispetto alla baseline).
- [ ] La migrazione `…_interventi_manuali_foto.sql` è scritta ma **non** eseguita qui (SQL al PC dell'utente; consegna in chat solo su richiesta esplicita).

## Fase 3 — Realtime, presa in carico, registro, export ZIP

> Scope: badge **realtime** ai 4 admin, **presa in carico** informativa (prendi/rilascia/override), **registro autorizzazioni** con filtri, **export ZIP foto** per rapportino.
> Costruisce su Fasi 1-2 (già fatte): tabella `interventi_manuali` (con `preso_in_carico_da/at`, `deciso_da/at`, `stato in_attesa/approvato/rifiutato/auto_liberi/annullato`), tabella `interventi_manuali_foto` (`richiesta_id, slot_chiave, slot_etichetta, storage_path, file_name, mime_type, size`), bucket privato `interventi-foto`, route `GET /api/admin/interventi-manuali` → `{ richieste: RigaRichiesta[] }`, componente `components/modules/torre/CodaRichiesteManuali.tsx`, tipi `lib/interventi/manuali/types.ts`.
> Stack: Next.js 15 App Router, React 19, TS, Supabase (Postgres+Storage+Realtime), Tailwind v4, vitest, `jszip` (già in dipendenze). `npm test` = `vitest run`.
> Route admin: `import { requireAdmin } from '@/lib/apiAuth'`; pattern `const auth = await requireAdmin(); if (auth instanceof NextResponse) return auth; const { user } = auth;`. `export const runtime = 'nodejs';`. DB server-side: `import { supabaseAdmin } from '@/lib/supabaseAdmin'`.
> Route dinamiche Next.js 15: firma `{ params }: { params: Promise<{ id: string }> }` + `const { id } = await params;` (come `app/api/r/[token]/voce/route.ts`).
> Realtime client: `supabaseBrowser()` da `@/lib/supabaseBrowser`, canale `postgres_changes` con filtro + polling fallback (pattern `lib/interventi/useInterventiFeed.ts`).
> Migrazione di questa fase: `supabase/migrations/20260606000002_interventi_manuali_realtime.sql` (le `…000000`/`…000001` sono di Fasi 1-2). **La SQL si lancia al PC dell'utente**: questi task **scrivono solo il file** (nessun comando DB; il Supabase MCP punta ad "aurea", non al prod).
> Baseline lint già rossa su `main`: il gate è "nessun nuovo problema dai file del WP" → verifica con `npx eslint <path>`.
> Commit: `feat(interventi-manuali): …` / `test(interventi-manuali): …`. I task realtime/UI estraggono la logica pura testata (`mergeRichiesteFeed`, `puoiPrendere`, `etichettaPresaInCarico`, `filtraRegistro`, `buildZipEntries`); gli step di sola UI usano `npx tsc --noEmit -p tsconfig.json` + verifica manuale esplicita.

---

### Task 3.1: Migrazione `20260606000002_interventi_manuali_realtime.sql` — publication realtime

**Files:**
- Create: `supabase/migrations/20260606000002_interventi_manuali_realtime.sql`
- Test: `lib/interventi/manuali/realtimeMigrationShape.test.ts` (smoke test di forma: il file esiste e contiene gli statement chiave; niente DB in CI, come `migrationShape.test.ts` di Fase 1)

> Pattern identico a `supabase/migrations/20260603020000_realtime_interventi.sql` (blocco `do $$ … pg_publication_tables … alter publication supabase_realtime add table …`), ma sulla tabella `interventi_manuali`.

Step:

- [ ] **Test che fallisce.** Crea `lib/interventi/manuali/realtimeMigrationShape.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260606000002_interventi_manuali_realtime.sql'),
  'utf8',
);

describe('migrazione realtime interventi_manuali', () => {
  it('aggiunge la tabella alla publication in modo idempotente', () => {
    expect(sql).toMatch(/pg_publication_tables/i);
    expect(sql).toMatch(/pubname\s*=\s*'supabase_realtime'/i);
    expect(sql).toMatch(/tablename\s*=\s*'interventi_manuali'/i);
    expect(sql).toMatch(/alter publication supabase_realtime add table interventi_manuali/i);
  });
  it('è racchiusa in un blocco do $$ … end $$', () => {
    expect(sql).toMatch(/do \$\$/i);
    expect(sql).toMatch(/end \$\$;/i);
  });
});
```

- [ ] **Verifica FAIL:** `npx vitest run lib/interventi/manuali/realtimeMigrationShape.test.ts` → FAIL con `ENOENT` (file SQL inesistente).

- [ ] **Implementazione.** Crea `supabase/migrations/20260606000002_interventi_manuali_realtime.sql`:

```sql
-- Fase 3 — abilita Supabase Realtime sulla tabella interventi_manuali (badge admin).
-- Idempotente: aggiunge la tabella alla publication solo se non già presente.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'interventi_manuali'
  ) then
    alter publication supabase_realtime add table interventi_manuali;
  end if;
end $$;
```

- [ ] **Verifica PASS:** `npx vitest run lib/interventi/manuali/realtimeMigrationShape.test.ts`
- [ ] **Lint:** `npx eslint lib/interventi/manuali/realtimeMigrationShape.test.ts`
- [ ] **Commit:** `feat(interventi-manuali): migrazione publication realtime su interventi_manuali`

> Nota: la SQL **non** viene eseguita qui (la lancia l'utente al PC). Il file di migrazione è l'unico deliverable.

---

### Task 3.2: `mergeRichiesteFeed` (PURA) + hook `useRichiesteManualiFeed`

**Files:**
- Create: `lib/interventi/manuali/mergeRichiesteFeed.ts` (PURA: upsert/replace/delete + ordinamento di una riga realtime nella lista)
- Test: `lib/interventi/manuali/mergeRichiesteFeed.test.ts`
- Create: `lib/interventi/manuali/useRichiesteManualiFeed.ts` (hook realtime, replica `useInterventiFeed`)

> La logica pura è il merge della lista alla ricezione di un evento `postgres_changes` (INSERT/UPDATE/DELETE) **mantenendo solo le righe `stato='in_attesa'`** (una richiesta approvata/rifiutata/annullata esce dalla coda) e l'ordinamento per `created_at` decrescente. L'hook fa fetch iniziale, subscription e polling fallback.
> La riga della coda estende `RigaRichiesta` con i campi di presa in carico (servono alla UI di Task 3.6); il `select` della route va esteso in Task 3.5(b).

Step:

- [ ] **Test che fallisce.** Crea `lib/interventi/manuali/mergeRichiesteFeed.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mergeRichiesteFeed, type RigaCoda } from './mergeRichiesteFeed';

const riga = (p: Partial<RigaCoda>): RigaCoda => ({
  id: 'r1', rapportino_id: 'rap1', voce_id: null, intervento_id: null,
  staff_id: 's1', staff_name: 'Mario', committente: 'acea', data: '2026-06-06',
  stato: 'in_attesa', corsia: 'normale', dati_operatore: {}, dati_correnti: {},
  note: null, motivo_rifiuto: null, created_at: '2026-06-06T10:00:00Z',
  preso_in_carico_da: null, preso_in_carico_at: null, ...p,
});

describe('mergeRichiesteFeed', () => {
  it('INSERT di una in_attesa la aggiunge ordinata per created_at desc', () => {
    const prev = [riga({ id: 'a', created_at: '2026-06-06T09:00:00Z' })];
    const next = mergeRichiesteFeed(prev, 'INSERT', riga({ id: 'b', created_at: '2026-06-06T11:00:00Z' }), null);
    expect(next.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('UPDATE di una riga esistente la sostituisce e ri-ordina', () => {
    const prev = [riga({ id: 'a', created_at: '2026-06-06T09:00:00Z' }), riga({ id: 'b', created_at: '2026-06-06T08:00:00Z' })];
    const aggiornata = riga({ id: 'b', created_at: '2026-06-06T08:00:00Z', preso_in_carico_da: 'admin1' });
    const next = mergeRichiesteFeed(prev, 'UPDATE', aggiornata, null);
    expect(next.find((r) => r.id === 'b')?.preso_in_carico_da).toBe('admin1');
    expect(next).toHaveLength(2);
  });

  it('UPDATE che porta la riga fuori da in_attesa la rimuove dalla coda', () => {
    const prev = [riga({ id: 'a' }), riga({ id: 'b' })];
    const approvata = riga({ id: 'b', stato: 'approvato' });
    const next = mergeRichiesteFeed(prev, 'UPDATE', approvata, null);
    expect(next.map((r) => r.id)).toEqual(['a']);
  });

  it('INSERT/UPDATE di una riga non in_attesa non entra in coda', () => {
    const prev = [riga({ id: 'a' })];
    const next = mergeRichiesteFeed(prev, 'INSERT', riga({ id: 'z', stato: 'auto_liberi' }), null);
    expect(next.map((r) => r.id)).toEqual(['a']);
  });

  it('DELETE rimuove per old.id', () => {
    const prev = [riga({ id: 'a' }), riga({ id: 'b' })];
    const next = mergeRichiesteFeed(prev, 'DELETE', null, { id: 'a' });
    expect(next.map((r) => r.id)).toEqual(['b']);
  });

  it('UPDATE di una riga non presente ma ancora in_attesa la inserisce', () => {
    const prev = [riga({ id: 'a', created_at: '2026-06-06T07:00:00Z' })];
    const next = mergeRichiesteFeed(prev, 'UPDATE', riga({ id: 'c', created_at: '2026-06-06T12:00:00Z' }), null);
    expect(next.map((r) => r.id)).toEqual(['c', 'a']);
  });
});
```

- [ ] **Verifica FAIL:** `npx vitest run lib/interventi/manuali/mergeRichiesteFeed.test.ts` → FAIL (modulo inesistente).

- [ ] **Implementazione (pura).** Crea `lib/interventi/manuali/mergeRichiesteFeed.ts`:

```ts
// PURA: applica un evento realtime (postgres_changes) alla lista della coda
// mantenendo solo le richieste in stato 'in_attesa', ordinate per created_at desc.
import type { RigaRichiesta } from './types';

/** Riga della coda: RigaRichiesta + campi di presa in carico (informativi). */
export type RigaCoda = RigaRichiesta & {
  preso_in_carico_da: string | null;
  preso_in_carico_at: string | null;
};

export type EventoFeed = 'INSERT' | 'UPDATE' | 'DELETE';

function ordina(list: RigaCoda[]): RigaCoda[] {
  return list.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

/**
 * Restituisce la nuova lista coda dopo l'evento.
 * - DELETE: rimuove per `old.id`.
 * - INSERT/UPDATE con `stato !== 'in_attesa'`: la riga esce dalla coda (rimossa se presente).
 * - INSERT/UPDATE con `stato === 'in_attesa'`: upsert + riordino per created_at desc.
 */
export function mergeRichiesteFeed(
  prev: RigaCoda[],
  evento: EventoFeed,
  nuova: RigaCoda | null,
  old: { id?: string } | null,
): RigaCoda[] {
  if (evento === 'DELETE') {
    const oldId = old?.id;
    return oldId ? prev.filter((r) => r.id !== oldId) : prev;
  }
  if (!nuova?.id) return prev;
  const senza = prev.filter((r) => r.id !== nuova.id);
  if (nuova.stato !== 'in_attesa') return senza; // uscita dalla coda
  return ordina([...senza, nuova]);
}
```

- [ ] **Verifica PASS:** `npx vitest run lib/interventi/manuali/mergeRichiesteFeed.test.ts`

- [ ] **Implementazione (hook).** Crea `lib/interventi/manuali/useRichiesteManualiFeed.ts` (replica di `lib/interventi/useInterventiFeed.ts`: fetch iniziale da `GET /api/admin/interventi-manuali?stato=in_attesa`, subscription `postgres_changes` filtro `stato=eq.in_attesa`, polling 60s con pausa in background):

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { mergeRichiesteFeed, type RigaCoda } from './mergeRichiesteFeed';

export type RichiesteManualiFeed = {
  richieste: RigaCoda[];
  count: number;
  live: boolean;
  /** Status HTTP dell'ultima fetch fallita (es. 403); null se ok. */
  error: number | null;
  refresh: () => Promise<void>;
};

/**
 * Feed realtime delle richieste manuali `in_attesa` per gli admin.
 * Fetch iniziale + subscription Realtime (`interventi_manuali`, filtro stato=in_attesa)
 * + polling fallback ogni 60s (in pausa quando la scheda è in background).
 * Modellato su `lib/interventi/useInterventiFeed.ts`; la logica di merge è in `mergeRichiesteFeed`.
 */
export function useRichiesteManualiFeed(): RichiesteManualiFeed {
  const [richieste, setRichieste] = useState<RigaCoda[]>([]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/interventi-manuali?stato=in_attesa', { cache: 'no-store' });
      if (!res.ok) { setError(res.status); return; }
      const json = (await res.json()) as { richieste?: RigaCoda[] };
      setRichieste(json.richieste ?? []);
      setError(null);
    } catch {
      /* errore di rete: ritenta al prossimo polling */
    }
  }, []);

  // Fetch iniziale
  useEffect(() => { void refresh(); }, [refresh]);

  // Realtime su interventi_manuali in_attesa (INSERT/UPDATE/DELETE)
  useEffect(() => {
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel('richieste-manuali-attesa')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'interventi_manuali', filter: 'stato=eq.in_attesa' },
        (payload) => {
          setRichieste((prev) =>
            mergeRichiesteFeed(
              prev,
              payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
              (payload.new as RigaCoda) ?? null,
              (payload.old as { id?: string }) ?? null,
            ),
          );
        },
      )
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => { void supabase.removeChannel(channel); };
  }, []);

  // Polling 60s, in pausa quando la scheda è in background
  useEffect(() => {
    const INTERVAL = 60 * 1000;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => void refresh(), INTERVAL); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => { if (document.hidden) stop(); else { void refresh(); start(); } };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [refresh]);

  return { richieste, count: richieste.length, live, error, refresh };
}
```

> Nota filtro realtime: con la subscription filtrata `stato=eq.in_attesa`, un UPDATE che cambia `stato` da `in_attesa` ad altro arriva come evento sulla **vecchia** riga (`old.stato='in_attesa'`); `mergeRichiesteFeed` la rimuove perché `nuova.stato !== 'in_attesa'`. Il polling 60s riconcilia comunque eventuali eventi persi.

- [ ] **Verifica TS:** `npx tsc --noEmit -p tsconfig.json` → nessun errore nei file nuovi.
- [ ] **Lint:** `npx eslint lib/interventi/manuali/mergeRichiesteFeed.ts lib/interventi/manuali/mergeRichiesteFeed.test.ts lib/interventi/manuali/useRichiesteManualiFeed.ts`
- [ ] **Commit:** `feat(interventi-manuali): feed realtime richieste manuali (mergeRichiesteFeed puro + hook)`

---

### Task 3.3: `puoiPrendere` (PURA) + route `POST /api/admin/interventi-manuali/[id]/prendi`

**Files:**
- Create: `lib/interventi/manuali/presaInCarico.ts` (PURA: decide se un admin può prendere in carico)
- Test: `lib/interventi/manuali/presaInCarico.test.ts`
- Create: `app/api/admin/interventi-manuali/[id]/prendi/route.ts`

> Decisione pura: un admin può prendere in carico se la richiesta è **libera** (`preso_da` null), se **già sua** (idempotente), oppure se passa `override=true`. Se è di un **altro** admin e niente override → no (la route risponde 409 `{error:'gia_in_gestione', da}`).

Step:

- [ ] **Test che fallisce.** Crea `lib/interventi/manuali/presaInCarico.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { puoiPrendere } from './presaInCarico';

describe('puoiPrendere', () => {
  it('libera (preso_da null) → sì', () => {
    expect(puoiPrendere(null, 'u1', false)).toBe(true);
  });
  it('già presa dallo stesso utente → sì (idempotente)', () => {
    expect(puoiPrendere('u1', 'u1', false)).toBe(true);
  });
  it('presa da altro senza override → no', () => {
    expect(puoiPrendere('u2', 'u1', false)).toBe(false);
  });
  it('presa da altro con override → sì', () => {
    expect(puoiPrendere('u2', 'u1', true)).toBe(true);
  });
  it('override su richiesta libera → sì', () => {
    expect(puoiPrendere(null, 'u1', true)).toBe(true);
  });
});
```

- [ ] **Verifica FAIL:** `npx vitest run lib/interventi/manuali/presaInCarico.test.ts` → FAIL (modulo inesistente).

- [ ] **Implementazione (pura).** Crea `lib/interventi/manuali/presaInCarico.ts`:

```ts
/**
 * PURA: un admin può prendere in carico la richiesta se è libera, se è già sua
 * (idempotente), oppure se forza con override. Se è di un altro admin e niente
 * override → false (la route risponde 409 'gia_in_gestione').
 * @param presoDa  uuid dell'admin che la sta gestendo, o null se libera
 * @param userId   uuid dell'admin corrente
 * @param override true per riprendere una richiesta già in gestione da altri
 */
export function puoiPrendere(presoDa: string | null, userId: string, override: boolean): boolean {
  if (!presoDa) return true;
  if (presoDa === userId) return true;
  return override === true;
}
```

- [ ] **Verifica PASS:** `npx vitest run lib/interventi/manuali/presaInCarico.test.ts`

- [ ] **Implementazione (route).** Crea `app/api/admin/interventi-manuali/[id]/prendi/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { puoiPrendere } from '@/lib/interventi/manuali/presaInCarico';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as { override?: boolean };
  const override = body.override === true;

  // Stato corrente della presa in carico
  const { data: riga, error: selErr } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, preso_in_carico_da')
    .eq('id', id)
    .maybeSingle();
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!riga) return NextResponse.json({ error: 'Richiesta inesistente.' }, { status: 404 });

  if (!puoiPrendere(riga.preso_in_carico_da, user.id, override)) {
    return NextResponse.json({ error: 'gia_in_gestione', da: riga.preso_in_carico_da }, { status: 409 });
  }

  const { error: updErr } = await supabaseAdmin
    .from('interventi_manuali')
    .update({ preso_in_carico_da: user.id, preso_in_carico_at: new Date().toISOString() })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, preso_in_carico_da: user.id });
}
```

- [ ] **Verifica TS:** `npx tsc --noEmit -p tsconfig.json` → nessun errore nei file nuovi.
- [ ] **Verifica manuale:** come admin A, POST `…/[id]/prendi` su richiesta libera → 200 + `preso_in_carico_da=A`. Da admin B senza override → 409 `{error:'gia_in_gestione', da:A}`. Da B con `{override:true}` → 200, `preso_in_carico_da=B`.
- [ ] **Lint:** `npx eslint lib/interventi/manuali/presaInCarico.ts lib/interventi/manuali/presaInCarico.test.ts "app/api/admin/interventi-manuali/[id]/prendi/route.ts"`
- [ ] **Commit:** `feat(interventi-manuali): presa in carico richiesta (puoiPrendere puro + route prendi con 409/override)`

---

### Task 3.4: Route `POST /api/admin/interventi-manuali/[id]/rilascia`

**Files:**
- Create: `app/api/admin/interventi-manuali/[id]/rilascia/route.ts`

> Azzera `preso_in_carico_da` e `preso_in_carico_at`. Rilascio manuale (design §9: nessuna scadenza automatica). Sempre permesso a un admin (il forcing reale è il blocco-invio del rapportino); l'eventuale override avviene su `prendi`.

Step:

- [ ] **Implementazione (route).** Crea `app/api/admin/interventi-manuali/[id]/rilascia/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { error } = await supabaseAdmin
    .from('interventi_manuali')
    .update({ preso_in_carico_da: null, preso_in_carico_at: null })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Verifica TS:** `npx tsc --noEmit -p tsconfig.json` → nessun errore nei file nuovi.
- [ ] **Verifica manuale:** POST `…/[id]/rilascia` → 200; in DB `preso_in_carico_da`/`preso_in_carico_at` tornano `null`; il realtime `UPDATE` arriva alla coda (riga torna "libera").
- [ ] **Lint:** `npx eslint "app/api/admin/interventi-manuali/[id]/rilascia/route.ts"`
- [ ] **Commit:** `feat(interventi-manuali): route rilascia presa in carico (azzera preso_in_carico_*)`

---

### Task 3.5: `CampanelloRichieste` + Modify `TopBar.tsx` (badge realtime)

**Files:**
- Create: `components/layout/CampanelloRichieste.tsx`
- Modify: `components/layout/TopBar.tsx` (monta il campanello, solo per admin)
- Modify: `app/api/admin/interventi-manuali/route.ts` (estende il `select` con i campi di presa in carico, così il feed e la coda li hanno)

> Il campanello usa `useRichiesteManualiFeed`; badge col `count`; al click naviga alla torre (`/hub/torre`), dove vive la coda. Va mostrato solo agli admin: `TopBar` riceve già `roleLabel`; aggiungiamo una prop esplicita `isAdmin`.

Step:

- [ ] **(a) Estendi il `select` della route GET** in `app/api/admin/interventi-manuali/route.ts` aggiungendo i due campi di presa in carico (il resto della route di Fase 1 resta invariato), così `RigaCoda` è popolata:

```ts
  let q = supabaseAdmin
    .from('interventi_manuali')
    .select('id, rapportino_id, voce_id, intervento_id, staff_id, staff_name, committente, data, stato, corsia, dati_operatore, dati_correnti, note, motivo_rifiuto, created_at, preso_in_carico_da, preso_in_carico_at')
    .order('created_at', { ascending: false });
```

- [ ] **(b) Implementa `CampanelloRichieste.tsx`.** Stile coerente con i bottoni icona della `TopBar` (`h-9 w-9`, `--brand-border`, `--brand-text-main`):

```tsx
'use client';

import { useRichiesteManualiFeed } from '@/lib/interventi/manuali/useRichiesteManualiFeed';

/** Campanello admin: badge realtime col numero di richieste manuali in attesa; apre la torre. */
export default function CampanelloRichieste() {
  const { count, live } = useRichiesteManualiFeed();

  return (
    <a
      href="/hub/torre"
      aria-label={`Richieste manuali in attesa: ${count}`}
      title={live ? `${count} richieste in attesa` : `${count} richieste in attesa (offline)`}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border transition hover:bg-[var(--brand-primary-soft)]"
      style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count > 0 && (
        <span
          className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-[18px] text-white"
          style={{ backgroundColor: 'var(--danger)' }}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </a>
  );
}
```

- [ ] **(c) Monta il campanello in `TopBar.tsx`.** Aggiungi l'import e la prop `isAdmin`, e renderizza il campanello prima del toggle tema:

```tsx
import CampanelloRichieste from './CampanelloRichieste';
```

```tsx
type TopBarProps = {
  userName: string;
  roleLabel?: string;
  isAdmin?: boolean;
  onLogout: () => void | Promise<void>;
  /** Apre il drawer della sidebar su mobile. */
  onOpenMobile: () => void;
};

export default function TopBar({ userName, roleLabel = 'Operatore', isAdmin = false, onLogout, onOpenMobile }: TopBarProps) {
```

Nel blocco azioni a destra (dentro `<div className="flex min-w-0 items-center gap-2 sm:gap-3">`), subito **prima** del bottone toggle tema:

```tsx
          {isAdmin && <CampanelloRichieste />}
```

- [ ] **(d) Passa `isAdmin` dal montaggio della `TopBar`.** Cerca chi rende `<TopBar …>` (`npx tsc --noEmit` segnalerà la prop mancante se obbligatoria — qui è opzionale con default `false`, quindi nessuna rottura) e passa il flag admin già disponibile nel layout:

```tsx
// nel componente che monta TopBar (es. shell dell'hub), dove il ruolo è noto:
<TopBar userName={userName} roleLabel={roleLabel} isAdmin={role === 'admin'} onLogout={onLogout} onOpenMobile={openMobile} />
```

> Trova il file con `Grep` pattern `<TopBar` (probabile in `components/layout/*` o `app/**/layout.tsx`); aggiungi `isAdmin={…}` riusando il `role`/flag admin già risolto lì. Se il ruolo non è disponibile in quel punto, mantieni `isAdmin` opzionale: il campanello semplicemente non compare finché non gli si passa il flag (nessuna regressione).

- [ ] **Verifica TS:** `npx tsc --noEmit -p tsconfig.json` → nessun errore.
- [ ] **Verifica manuale:** come admin, in `TopBar` compare il campanello; con ≥1 richiesta `in_attesa` mostra il badge col numero; creando una richiesta da un secondo browser/operatore il badge **si aggiorna in realtime** (o entro 60s via polling); click → naviga a `/hub/torre`. Come operatore (non admin) il campanello **non** compare.
- [ ] **Lint:** `npx eslint components/layout/CampanelloRichieste.tsx components/layout/TopBar.tsx app/api/admin/interventi-manuali/route.ts`
- [ ] **Commit:** `feat(interventi-manuali): campanello realtime in TopBar con badge richieste in attesa`

---

### Task 3.6: `etichettaPresaInCarico` (PURA) + Modify `CodaRichiesteManuali.tsx` (realtime + prendi/rilascia/override)

**Files:**
- Create: `lib/interventi/manuali/etichettaPresaInCarico.ts` (PURA: etichetta "in gestione da …" / stato pulsanti)
- Test: `lib/interventi/manuali/etichettaPresaInCarico.test.ts`
- Modify: `components/modules/torre/CodaRichiesteManuali.tsx` (creato in Fase 1)

> La coda di Fase 1 fa fetch+refresh manuale e apre `PannelloRevisioneRichiesta`. Fase 3 la fa diventare **realtime** (`useRichiesteManualiFeed`) e aggiunge, per riga, l'indicatore "in gestione da …" + i bottoni **Prendi** / **Rilascia** / **Override**. La scelta di cosa mostrare è pura e testata.
> Per mostrare il **nome** dell'admin (non l'uuid), la coda riceve una mappa `adminNomi: Record<uuid, string>` come nuova prop (popolata dal montaggio in Task 3.7). `userId` dell'admin corrente arriva anch'esso come prop.

Step:

- [ ] **Test che fallisce.** Crea `lib/interventi/manuali/etichettaPresaInCarico.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { statoPresaInCarico } from './etichettaPresaInCarico';

const nomi = { u1: 'Anna', u2: 'Marco' };

describe('statoPresaInCarico', () => {
  it('libera → nessuna etichetta, mostra Prendi', () => {
    expect(statoPresaInCarico(null, 'u1', nomi)).toEqual({
      etichetta: null, miaPresa: false, presaDaAltro: false,
      mostraPrendi: true, mostraRilascia: false, mostraOverride: false,
    });
  });
  it('presa da me → "in gestione (tu)", mostra Rilascia', () => {
    const s = statoPresaInCarico('u1', 'u1', nomi);
    expect(s.etichetta).toBe('In gestione: tu');
    expect(s.miaPresa).toBe(true);
    expect(s.mostraRilascia).toBe(true);
    expect(s.mostraPrendi).toBe(false);
    expect(s.mostraOverride).toBe(false);
  });
  it('presa da altro → "in gestione: <nome>", mostra Override', () => {
    const s = statoPresaInCarico('u2', 'u1', nomi);
    expect(s.etichetta).toBe('In gestione: Marco');
    expect(s.presaDaAltro).toBe(true);
    expect(s.mostraOverride).toBe(true);
    expect(s.mostraPrendi).toBe(false);
    expect(s.mostraRilascia).toBe(false);
  });
  it('presa da altro sconosciuto (uuid non in mappa) → fallback "un altro operatore"', () => {
    const s = statoPresaInCarico('u9', 'u1', nomi);
    expect(s.etichetta).toBe('In gestione: un altro operatore');
    expect(s.presaDaAltro).toBe(true);
  });
});
```

- [ ] **Verifica FAIL:** `npx vitest run lib/interventi/manuali/etichettaPresaInCarico.test.ts` → FAIL (modulo inesistente).

- [ ] **Implementazione (pura).** Crea `lib/interventi/manuali/etichettaPresaInCarico.ts`:

```ts
export type StatoPresa = {
  /** Testo "In gestione: …" o null se libera. */
  etichetta: string | null;
  miaPresa: boolean;
  presaDaAltro: boolean;
  mostraPrendi: boolean;
  mostraRilascia: boolean;
  mostraOverride: boolean;
};

/**
 * PURA: deriva etichetta e visibilità dei pulsanti per la presa in carico.
 * @param presoDa  uuid admin che la gestisce, o null
 * @param userId   uuid admin corrente
 * @param nomi     mappa uuid→nome admin (per mostrare il nome invece dell'uuid)
 */
export function statoPresaInCarico(
  presoDa: string | null,
  userId: string,
  nomi: Record<string, string>,
): StatoPresa {
  if (!presoDa) {
    return { etichetta: null, miaPresa: false, presaDaAltro: false, mostraPrendi: true, mostraRilascia: false, mostraOverride: false };
  }
  if (presoDa === userId) {
    return { etichetta: 'In gestione: tu', miaPresa: true, presaDaAltro: false, mostraPrendi: false, mostraRilascia: true, mostraOverride: false };
  }
  const nome = nomi[presoDa] ?? 'un altro operatore';
  return { etichetta: `In gestione: ${nome}`, miaPresa: false, presaDaAltro: true, mostraPrendi: false, mostraRilascia: false, mostraOverride: true };
}
```

- [ ] **Verifica PASS:** `npx vitest run lib/interventi/manuali/etichettaPresaInCarico.test.ts`

- [ ] **Implementazione (Modify componente).** Riscrivi `components/modules/torre/CodaRichiesteManuali.tsx` usando il feed realtime e i controlli di presa in carico. Mantiene `PannelloRevisioneRichiesta` (Fase 1) e le sue prop, aggiunge `userId` e `adminNomi`:

```tsx
'use client';

import { useState } from 'react';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { PannelloRevisioneRichiesta } from './PannelloRevisioneRichiesta';
import { useRichiesteManualiFeed } from '@/lib/interventi/manuali/useRichiesteManualiFeed';
import { statoPresaInCarico } from '@/lib/interventi/manuali/etichettaPresaInCarico';
import type { CommittenteManuale } from '@/lib/interventi/manuali/types';

export function CodaRichiesteManuali({
  infoCampi,
  campiPerCommittente,
  userId,
  adminNomi,
}: {
  infoCampi: TemplateInfoCampo[];
  campiPerCommittente: Partial<Record<CommittenteManuale, TemplateCampo[]>>;
  userId: string;
  adminNomi: Record<string, string>;
}) {
  const { richieste, count, live, refresh } = useRichiesteManualiFeed();
  const [aperta, setAperta] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const prendi = async (id: string, override = false) => {
    setBusyId(id);
    try {
      await fetch(`/api/admin/interventi-manuali/${id}/prendi`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ override }),
      });
      await refresh();
    } finally { setBusyId(null); }
  };
  const rilascia = async (id: string) => {
    setBusyId(id);
    try {
      await fetch(`/api/admin/interventi-manuali/${id}/rilascia`, { method: 'POST' });
      await refresh();
    } finally { setBusyId(null); }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-[var(--brand-text-main)]">
          Richieste manuali · in attesa ({count})
          <span className={`ml-2 inline-block h-2 w-2 rounded-full align-middle ${live ? 'bg-[var(--success)]' : 'bg-[var(--brand-text-muted)]'}`} title={live ? 'Realtime attivo' : 'Realtime non attivo (polling)'} />
        </h2>
        <button type="button" onClick={() => void refresh()} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-text-muted)]">
          Aggiorna
        </button>
      </div>
      {richieste.length === 0 ? (
        <p className="text-sm text-[var(--brand-text-muted)]">Nessuna richiesta in attesa.</p>
      ) : (
        <ul className="space-y-2">
          {richieste.map((r) => {
            const presa = statoPresaInCarico(r.preso_in_carico_da, userId, adminNomi);
            const busy = busyId === r.id;
            return (
              <li key={r.id} className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)]">
                <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <button type="button" onClick={() => setAperta((a) => (a === r.id ? null : r.id))} className="flex items-center gap-2 text-left">
                    <span className="text-sm font-semibold text-[var(--brand-text-main)]">{r.staff_name ?? r.staff_id} · {r.committente}</span>
                    <span className="text-xs text-[var(--brand-text-muted)]">{r.data}</span>
                  </button>
                  <div className="flex items-center gap-2">
                    {presa.etichetta && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${presa.miaPresa ? 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]' : 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]'}`}>
                        {presa.etichetta}
                      </span>
                    )}
                    {presa.mostraPrendi && (
                      <button type="button" disabled={busy} onClick={() => void prendi(r.id)} className="rounded-lg bg-[var(--brand-primary)] px-2.5 py-1 text-xs font-semibold text-[oklch(0.16_0.06_245)] disabled:opacity-50">Prendi</button>
                    )}
                    {presa.mostraRilascia && (
                      <button type="button" disabled={busy} onClick={() => void rilascia(r.id)} className="rounded-lg border border-[var(--brand-border)] px-2.5 py-1 text-xs font-semibold text-[var(--brand-text-muted)] disabled:opacity-50">Rilascia</button>
                    )}
                    {presa.mostraOverride && (
                      <button type="button" disabled={busy} onClick={() => void prendi(r.id, true)} className="rounded-lg border border-[var(--danger)] px-2.5 py-1 text-xs font-semibold text-[var(--danger)] disabled:opacity-50">Override</button>
                    )}
                  </div>
                </div>
                {aperta === r.id && (
                  <div className="px-3 pb-3">
                    <PannelloRevisioneRichiesta
                      riga={r}
                      infoCampi={infoCampi}
                      campiEsito={campiPerCommittente[r.committente] ?? []}
                      onDecisa={() => { setAperta(null); void refresh(); }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

> `RigaCoda` (ritornata dal feed) estende `RigaRichiesta`, quindi è compatibile con la prop `riga: RigaRichiesta` di `PannelloRevisioneRichiesta` (Fase 1).

- [ ] **Verifica PASS (pura) + TS:** `npx vitest run lib/interventi/manuali/etichettaPresaInCarico.test.ts && npx tsc --noEmit -p tsconfig.json`
- [ ] **Verifica manuale:** la coda mostra il pallino realtime; "Prendi" imposta "In gestione: tu" e mostra "Rilascia"; da un altro admin la stessa riga mostra "In gestione: <nome>" + "Override"; le nuove richieste compaiono senza ricaricare.
- [ ] **Lint:** `npx eslint lib/interventi/manuali/etichettaPresaInCarico.ts lib/interventi/manuali/etichettaPresaInCarico.test.ts components/modules/torre/CodaRichiesteManuali.tsx`
- [ ] **Commit:** `feat(interventi-manuali): coda realtime con presa in carico (prendi/rilascia/override)`

---

### Task 3.7: Aggiorna il montaggio della coda + `RegistroAutorizzazioni` (Modify `app/hub/torre/page.tsx`)

**Files:**
- Create: `lib/interventi/manuali/filtraRegistro.ts` (PURA: filtri operatore/data/stato/committente)
- Test: `lib/interventi/manuali/filtraRegistro.test.ts`
- Create: `components/modules/torre/RegistroAutorizzazioni.tsx`
- Modify: `app/hub/torre/page.tsx` (passa `userId`/`adminNomi` alla coda; monta il registro)

> La coda di Task 3.6 ora richiede `userId` e `adminNomi`: la torre page (Server Component, già verifica admin) deve fornirli. Aggiungiamo anche il **registro autorizzazioni**: storico filtrabile (operatore/data/stato/committente) che usa `GET /api/admin/interventi-manuali` con `stato=tutti`. La logica di filtro client è pura e testata; l'export è un download CSV/Excel client-side coerente con le altre liste.

Step:

- [ ] **Test che fallisce.** Crea `lib/interventi/manuali/filtraRegistro.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { filtraRegistro, type FiltriRegistro } from './filtraRegistro';
import type { RigaRichiesta } from './types';

const riga = (p: Partial<RigaRichiesta>): RigaRichiesta => ({
  id: 'r', rapportino_id: null, voce_id: null, intervento_id: null,
  staff_id: 's1', staff_name: 'Mario Rossi', committente: 'acea', data: '2026-06-06',
  stato: 'approvato', corsia: 'normale', dati_operatore: {}, dati_correnti: {},
  note: null, motivo_rifiuto: null, created_at: '2026-06-06T10:00:00Z', ...p,
});
const vuoto: FiltriRegistro = { operatore: '', stato: '', committente: '', from: '', to: '' };

describe('filtraRegistro', () => {
  it('filtri vuoti → tutto invariato', () => {
    const list = [riga({ id: 'a' }), riga({ id: 'b' })];
    expect(filtraRegistro(list, vuoto)).toHaveLength(2);
  });
  it('filtra per operatore (staff_id)', () => {
    const list = [riga({ id: 'a', staff_id: 's1' }), riga({ id: 'b', staff_id: 's2' })];
    expect(filtraRegistro(list, { ...vuoto, operatore: 's1' }).map((r) => r.id)).toEqual(['a']);
  });
  it('filtra per stato', () => {
    const list = [riga({ id: 'a', stato: 'approvato' }), riga({ id: 'b', stato: 'rifiutato' })];
    expect(filtraRegistro(list, { ...vuoto, stato: 'rifiutato' }).map((r) => r.id)).toEqual(['b']);
  });
  it('filtra per committente', () => {
    const list = [riga({ id: 'a', committente: 'acea' }), riga({ id: 'b', committente: 'italgas' })];
    expect(filtraRegistro(list, { ...vuoto, committente: 'italgas' }).map((r) => r.id)).toEqual(['b']);
  });
  it('filtra per range data (inclusivo)', () => {
    const list = [riga({ id: 'a', data: '2026-06-01' }), riga({ id: 'b', data: '2026-06-10' }), riga({ id: 'c', data: '2026-06-06' })];
    expect(filtraRegistro(list, { ...vuoto, from: '2026-06-05', to: '2026-06-08' }).map((r) => r.id)).toEqual(['c']);
  });
  it('combina più filtri (AND)', () => {
    const list = [
      riga({ id: 'a', staff_id: 's1', stato: 'approvato', committente: 'acea' }),
      riga({ id: 'b', staff_id: 's1', stato: 'rifiutato', committente: 'acea' }),
    ];
    expect(filtraRegistro(list, { ...vuoto, operatore: 's1', stato: 'approvato' }).map((r) => r.id)).toEqual(['a']);
  });
});
```

- [ ] **Verifica FAIL:** `npx vitest run lib/interventi/manuali/filtraRegistro.test.ts` → FAIL (modulo inesistente).

- [ ] **Implementazione (pura).** Crea `lib/interventi/manuali/filtraRegistro.ts`:

```ts
// PURA: applica i filtri del registro autorizzazioni (AND tra i campi valorizzati).
import type { RigaRichiesta } from './types';

export type FiltriRegistro = {
  operatore: string;   // staff_id; '' = tutti
  stato: string;       // StatoRichiesta; '' = tutti
  committente: string; // CommittenteManuale; '' = tutti
  from: string;        // YYYY-MM-DD; '' = nessun limite inferiore
  to: string;          // YYYY-MM-DD; '' = nessun limite superiore
};

export function filtraRegistro(righe: RigaRichiesta[], f: FiltriRegistro): RigaRichiesta[] {
  return (righe ?? []).filter((r) => {
    if (f.operatore && r.staff_id !== f.operatore) return false;
    if (f.stato && r.stato !== f.stato) return false;
    if (f.committente && r.committente !== f.committente) return false;
    if (f.from && (r.data ?? '') < f.from) return false;
    if (f.to && (r.data ?? '') > f.to) return false;
    return true;
  });
}
```

- [ ] **Verifica PASS:** `npx vitest run lib/interventi/manuali/filtraRegistro.test.ts`

- [ ] **Implementazione (componente).** Crea `components/modules/torre/RegistroAutorizzazioni.tsx`. Fetch `GET /api/admin/interventi-manuali?stato=tutti`, filtri client (riusa `filtraRegistro`), export CSV via Blob (pattern download `URL.createObjectURL` come in `MappaOperatoriClient`):

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { filtraRegistro, type FiltriRegistro } from '@/lib/interventi/manuali/filtraRegistro';
import { STATI_RICHIESTA } from '@/lib/interventi/manuali/types';
import type { RigaRichiesta } from '@/lib/interventi/manuali/types';

const selCls = 'rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs';

function toCsv(righe: RigaRichiesta[]): string {
  const head = ['Data', 'Operatore', 'Committente', 'Stato', 'Note', 'Motivo rifiuto', 'Creato'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = righe.map((r) => [r.data, r.staff_name ?? r.staff_id, r.committente, r.stato, r.note, r.motivo_rifiuto, r.created_at].map(esc).join(','));
  return [head.join(','), ...rows].join('\r\n');
}

export function RegistroAutorizzazioni() {
  const [righe, setRighe] = useState<RigaRichiesta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtri, setFiltri] = useState<FiltriRegistro>({ operatore: '', stato: '', committente: '', from: '', to: '' });

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/interventi-manuali?stato=tutti', { cache: 'no-store' });
      const j = res.ok ? ((await res.json()) as { richieste?: RigaRichiesta[] }) : { richieste: [] };
      setRighe(j.richieste ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void carica(); }, [carica]);

  const operatori = useMemo(() => {
    const m = new Map<string, string>();
    righe.forEach((r) => { if (r.staff_id) m.set(r.staff_id, r.staff_name ?? r.staff_id); });
    return [...m.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [righe]);

  const filtrate = useMemo(() => filtraRegistro(righe, filtri), [righe, filtri]);

  const esporta = () => {
    const blob = new Blob([toCsv(filtrate)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `registro-autorizzazioni-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-[var(--brand-text-main)]">Registro autorizzazioni</h2>
        <button type="button" onClick={esporta} disabled={filtrate.length === 0} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-text-main)] disabled:opacity-50">⤓ Esporta CSV</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className={selCls} value={filtri.operatore} onChange={(e) => setFiltri((f) => ({ ...f, operatore: e.target.value }))}>
          <option value="">Tutti gli operatori</option>
          {operatori.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
        <select className={selCls} value={filtri.stato} onChange={(e) => setFiltri((f) => ({ ...f, stato: e.target.value }))}>
          <option value="">Tutti gli stati</option>
          {STATI_RICHIESTA.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={selCls} value={filtri.committente} onChange={(e) => setFiltri((f) => ({ ...f, committente: e.target.value }))}>
          <option value="">Tutti i committenti</option>
          <option value="acea">Acea</option>
          <option value="italgas">Italgas</option>
          <option value="altro">Altro</option>
        </select>
        <input type="date" aria-label="Dal" className={selCls} value={filtri.from} max={filtri.to || undefined} onChange={(e) => setFiltri((f) => ({ ...f, from: e.target.value }))} />
        <span className="text-xs text-[var(--brand-text-muted)]">→</span>
        <input type="date" aria-label="Al" className={selCls} value={filtri.to} min={filtri.from || undefined} onChange={(e) => setFiltri((f) => ({ ...f, to: e.target.value }))} />
      </div>
      {loading ? (
        <p className="text-sm text-[var(--brand-text-muted)]">Caricamento…</p>
      ) : filtrate.length === 0 ? (
        <p className="text-sm text-[var(--brand-text-muted)]">Nessuna richiesta per i filtri selezionati.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--brand-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Data</th>
                <th className="px-3 py-2 text-left font-semibold">Operatore</th>
                <th className="px-3 py-2 text-left font-semibold">Committente</th>
                <th className="px-3 py-2 text-left font-semibold">Stato</th>
                <th className="px-3 py-2 text-left font-semibold">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--brand-border)]">
              {filtrate.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">{r.data}</td>
                  <td className="px-3 py-2">{r.staff_name ?? r.staff_id}</td>
                  <td className="px-3 py-2">{r.committente}</td>
                  <td className="px-3 py-2">{r.stato}</td>
                  <td className="px-3 py-2 text-[var(--brand-text-muted)]">{r.motivo_rifiuto ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Modify `app/hub/torre/page.tsx`.** La page già risolve `user` e (Fase 1) costruisce `infoCampiTorre`/`campiPerCommittente`. Aggiungi: (1) la mappa `adminNomi` dai profili admin; (2) passa `userId={user.id}` e `adminNomi` alla coda; (3) monta `RegistroAutorizzazioni`.

  Import (in cima):

```tsx
import { RegistroAutorizzazioni } from '@/components/modules/torre/RegistroAutorizzazioni';
```

  Prima del `return`, dopo i blocchi di Fase 1, costruisci la mappa nome admin (uuid→nome):

```ts
  const { data: adminRows } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'admin');
  const adminNomi: Record<string, string> = {};
  for (const a of (adminRows ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
    adminNomi[a.id] = a.full_name ?? a.email ?? a.id;
  }
```

> Verifica con `Grep`/`Read` le colonne reali di `profiles` (Fase 1 usa `profiles.role`). Se `full_name` non esiste, ripiega su `email` o sull'unico campo nome disponibile; l'importante è la mappa `uuid→stringa`.

  Aggiorna il montaggio della coda e aggiungi il registro:

```tsx
  return (
    <div className="space-y-4">
      <CodaRichiesteManuali
        infoCampi={infoCampiTorre}
        campiPerCommittente={campiPerCommittente}
        userId={user.id}
        adminNomi={adminNomi}
      />
      <TorreControlloClient data={data} interventi={rows} operatori={operatori} territori={territori} />
      <RegistroAutorizzazioni />
    </div>
  );
```

- [ ] **Verifica PASS (pura) + TS:** `npx vitest run lib/interventi/manuali/filtraRegistro.test.ts && npx tsc --noEmit -p tsconfig.json`
- [ ] **Verifica manuale:** in `/hub/torre` la coda mostra le etichette presa-in-carico con i **nomi** admin; sotto la torre compare il "Registro autorizzazioni" con i filtri (operatore/stato/committente/data) e "Esporta CSV" che scarica le righe filtrate.
- [ ] **Lint:** `npx eslint lib/interventi/manuali/filtraRegistro.ts lib/interventi/manuali/filtraRegistro.test.ts components/modules/torre/RegistroAutorizzazioni.tsx app/hub/torre/page.tsx`
- [ ] **Commit:** `feat(interventi-manuali): registro autorizzazioni con filtri/export + nomi admin nella coda`

---

### Task 3.8: `buildZipEntries` (PURA) + route `GET /api/admin/rapportini/[rapportinoId]/foto-zip`

**Files:**
- Create: `lib/interventi/manuali/buildZipEntries.ts` (PURA: assegnazione nomi/sottocartelle ZIP su collisione)
- Test: `lib/interventi/manuali/buildZipEntries.test.ts`
- Create: `app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts`

> Naming ZIP (design §8): i file usano `file_name` (già `Etichetta_identificativo.ext`); su **collisione** di `file_name`, le foto vanno in sottocartelle `<identificativo>/` per intervento. La funzione pura calcola il path finale di ogni entry; la route scarica i blob dal bucket privato e li impacchetta con `jszip`.
> `identificativo` per la sottocartella = la parte dopo l'underscore di `file_name` senza estensione (es. `FotoContatore_12345.jpg` → `12345`), normalizzata; fallback alla `richiesta_id` se non estraibile.

Step:

- [ ] **Test che fallisce.** Crea `lib/interventi/manuali/buildZipEntries.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildZipEntries, type FotoZip } from './buildZipEntries';

const f = (p: Partial<FotoZip>): FotoZip => ({
  richiesta_id: 'req1', storage_path: 'req1/foto_contatore_req1.jpg',
  file_name: 'FotoContatore_12345.jpg', ...p,
});

describe('buildZipEntries', () => {
  it('nomi unici → entry alla radice dello ZIP', () => {
    const entries = buildZipEntries([
      f({ file_name: 'FotoContatore_12345.jpg', storage_path: 'a.jpg' }),
      f({ file_name: 'FotoSigillo_12345.jpg', storage_path: 'b.jpg' }),
    ]);
    expect(entries.map((e) => e.zipPath)).toEqual(['FotoContatore_12345.jpg', 'FotoSigillo_12345.jpg']);
  });

  it('nomi coincidenti → sottocartella per identificativo', () => {
    const entries = buildZipEntries([
      f({ richiesta_id: 'A', file_name: 'FotoContatore_12345.jpg', storage_path: 'A.jpg' }),
      f({ richiesta_id: 'B', file_name: 'FotoContatore_12345.jpg', storage_path: 'B.jpg' }),
    ]);
    // entrambe collidono su 'FotoContatore_12345.jpg' → vanno sotto '<identificativo>/'
    expect(entries.map((e) => e.zipPath).sort()).toEqual([
      '12345/FotoContatore_12345.jpg',
      '12345/FotoContatore_12345.jpg',
    ].sort());
  });

  it('collisione anche dentro la stessa sottocartella → suffisso progressivo', () => {
    const entries = buildZipEntries([
      f({ richiesta_id: 'A', file_name: 'Foto_77.jpg', storage_path: 'A.jpg' }),
      f({ richiesta_id: 'B', file_name: 'Foto_77.jpg', storage_path: 'B.jpg' }),
      f({ richiesta_id: 'C', file_name: 'Foto_77.jpg', storage_path: 'C.jpg' }),
    ]);
    const paths = entries.map((e) => e.zipPath);
    // tutti distinti: stessa sottocartella '77/' ma nomi de-duplicati
    expect(new Set(paths).size).toBe(3);
    expect(paths.every((p) => p.startsWith('77/'))).toBe(true);
  });

  it('preserva storage_path per il download', () => {
    const entries = buildZipEntries([f({ storage_path: 'req1/x.jpg', file_name: 'A_1.jpg' })]);
    expect(entries[0].storagePath).toBe('req1/x.jpg');
  });

  it('lista vuota → nessuna entry', () => {
    expect(buildZipEntries([])).toEqual([]);
  });
});
```

- [ ] **Verifica FAIL:** `npx vitest run lib/interventi/manuali/buildZipEntries.test.ts` → FAIL (modulo inesistente).

- [ ] **Implementazione (pura).** Crea `lib/interventi/manuali/buildZipEntries.ts`:

```ts
// PURA: calcola il path di ciascuna foto dentro lo ZIP.
// Regola (design §8): si usa file_name; su collisione di file_name si separano
// in sottocartelle '<identificativo>/'; eventuali collisioni residue ricevono un
// suffisso progressivo ' (n)' prima dell'estensione. storagePath è preservato per il download.

export type FotoZip = {
  richiesta_id: string;
  storage_path: string;
  file_name: string;
};

export type ZipEntry = {
  storagePath: string; // sorgente nel bucket (per il download)
  zipPath: string;     // destinazione nell'archivio
};

/** Identificativo per la sottocartella: parte dopo l'ultimo '_' senza estensione; fallback richiesta_id. */
function identificativoDa(fileName: string, fallback: string): string {
  const senzaExt = fileName.replace(/\.[^.]+$/, '');
  const us = senzaExt.lastIndexOf('_');
  const id = us >= 0 ? senzaExt.slice(us + 1) : '';
  return id || fallback;
}

function splitExt(fileName: string): { base: string; ext: string } {
  const m = fileName.match(/^(.*?)(\.[^.]+)?$/);
  return { base: m?.[1] ?? fileName, ext: m?.[2] ?? '' };
}

export function buildZipEntries(foto: FotoZip[]): ZipEntry[] {
  // 1) quali file_name collidono (compaiono >1 volta)?
  const conta = new Map<string, number>();
  for (const f of foto) conta.set(f.file_name, (conta.get(f.file_name) ?? 0) + 1);

  // 2) assegna il path, de-duplicando i path finali con suffisso progressivo
  const usati = new Set<string>();
  const entries: ZipEntry[] = [];

  for (const f of foto) {
    const collide = (conta.get(f.file_name) ?? 0) > 1;
    const cartella = collide ? `${identificativoDa(f.file_name, f.richiesta_id)}/` : '';
    let candidato = `${cartella}${f.file_name}`;

    if (usati.has(candidato)) {
      const { base, ext } = splitExt(f.file_name);
      let n = 2;
      while (usati.has(`${cartella}${base} (${n})${ext}`)) n += 1;
      candidato = `${cartella}${base} (${n})${ext}`;
    }

    usati.add(candidato);
    entries.push({ storagePath: f.storage_path, zipPath: candidato });
  }

  return entries;
}
```

- [ ] **Verifica PASS:** `npx vitest run lib/interventi/manuali/buildZipEntries.test.ts`

- [ ] **Implementazione (route).** Crea `app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts`. Trova le richieste manuali del rapportino, le loro foto, scarica i blob dal bucket privato e impacchetta con `jszip`:

```ts
import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { buildZipEntries, type FotoZip } from '@/lib/interventi/manuali/buildZipEntries';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ rapportinoId: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { rapportinoId } = await params;

  // 1) richieste manuali del rapportino
  const { data: richieste, error: reqErr } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id')
    .eq('rapportino_id', rapportinoId);
  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 });
  const ids = (richieste ?? []).map((r) => r.id);
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Nessun intervento manuale per questo rapportino.' }, { status: 404 });
  }

  // 2) foto di quelle richieste
  const { data: fotoRows, error: fotoErr } = await supabaseAdmin
    .from('interventi_manuali_foto')
    .select('richiesta_id, storage_path, file_name')
    .in('richiesta_id', ids);
  if (fotoErr) return NextResponse.json({ error: fotoErr.message }, { status: 500 });
  const foto = (fotoRows ?? []) as FotoZip[];
  if (foto.length === 0) {
    return NextResponse.json({ error: 'Nessuna foto da scaricare.' }, { status: 404 });
  }

  // 3) calcola i path nello ZIP (gestione collisioni → sottocartelle)
  const entries = buildZipEntries(foto);

  // 4) scarica i blob dal bucket privato e impacchetta
  const zip = new JSZip();
  for (const e of entries) {
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from('interventi-foto')
      .download(e.storagePath);
    if (dlErr || !blob) {
      return NextResponse.json({ error: `Download foto fallito: ${e.storagePath}` }, { status: 502 });
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    zip.file(e.zipPath, buf);
  }

  const archive = await zip.generateAsync({ type: 'nodebuffer' });
  const fileName = `foto-rapportino-${rapportinoId}.zip`;
  return new NextResponse(new Uint8Array(archive), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
```

- [ ] **Verifica PASS (pura) + TS:** `npx vitest run lib/interventi/manuali/buildZipEntries.test.ts && npx tsc --noEmit -p tsconfig.json`
- [ ] **Verifica manuale:** GET `…/api/admin/rapportini/<id>/foto-zip` su un rapportino con interventi manuali → scarica uno ZIP con i file rinominati; con due interventi che generano lo stesso `file_name`, i file finiscono in sottocartelle `<identificativo>/`. Rapportino senza foto → 404.
- [ ] **Lint:** `npx eslint lib/interventi/manuali/buildZipEntries.ts lib/interventi/manuali/buildZipEntries.test.ts "app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts"`
- [ ] **Commit:** `feat(interventi-manuali): export ZIP foto rapportino (buildZipEntries puro + route foto-zip)`

---

### Task 3.9: Icona "scarica foto (ZIP)" nel riepilogo rapportini (Modify `RiepilogoRapportini.tsx` + `CardTerritorio.tsx`)

**Files:**
- Modify: `components/modules/mappa/riepilogo/CardTerritorio.tsx` (aggiunge l'icona ZIP accanto alle azioni esistenti)

> Il pannello azioni per rapportino in `CardTerritorio.tsx` ha già un link export Excel `<a href="/api/mappa/rapportini/export?rapportinoId=…">⤓</a>`. Aggiungiamo accanto un'icona che apre la route foto-zip. È un semplice `<a href>` (download nativo), quindi **nessuna nuova prop** in `RiepilogoRapportini.tsx`: la modifica è isolata in `CardTerritorio`.

Step:

- [ ] **Modify `CardTerritorio.tsx`.** Nel blocco delle azioni per rapportino (dentro `<div className="flex shrink-0 items-center gap-1.5 text-[11px]">`), subito **dopo** il link Excel esistente:

```tsx
                    <a href={`/api/mappa/rapportini/export?rapportinoId=${r.id}`} className="rounded border border-[var(--brand-border)] px-2 py-0.5">⤓</a>
                    <a
                      href={`/api/admin/rapportini/${r.id}/foto-zip`}
                      title="Scarica foto interventi manuali (ZIP)"
                      className="rounded border border-[var(--brand-border)] px-2 py-0.5"
                    >🖼️</a>
```

> Nota: la route risponde 404 se il rapportino non ha foto manuali; il link è sempre presente (coerente con le altre azioni "best effort" della card). Se in futuro `RapRiepilogo` esponesse un conteggio foto, si potrà nasconderlo a zero — fuori scope ora (nessun campo del genere oggi).

- [ ] **Verifica TS:** `npx tsc --noEmit -p tsconfig.json` → nessun errore.
- [ ] **Verifica manuale:** nel "Riepilogo rapportini" (`/hub/mappa` vista riepilogo), accanto a copia/Excel/WhatsApp/👁/⤓ di ogni rapportino compare l'icona 🖼️; cliccandola su un rapportino con interventi manuali parte il download dello ZIP; su uno senza foto il browser riceve il 404 JSON (nessun crash della pagina).
- [ ] **Lint:** `npx eslint components/modules/mappa/riepilogo/CardTerritorio.tsx`
- [ ] **Commit:** `feat(interventi-manuali): icona scarica foto ZIP nel riepilogo rapportini`

---

### Chiusura Fase 3

- [ ] `npm test` verde — nuovi unit: `mergeRichiesteFeed`, `presaInCarico`, `etichettaPresaInCarico`, `filtraRegistro`, `buildZipEntries`, `realtimeMigrationShape`.
- [ ] `npx tsc --noEmit -p tsconfig.json` pulito.
- [ ] `npx eslint` pulito su **tutti** i file toccati in Fase 3 (no nuovi problemi rispetto alla baseline rossa di `main`).
- [ ] La migrazione `…_interventi_manuali_realtime.sql` è scritta ma **non** eseguita qui (SQL al PC dell'utente; consegna in chat solo su richiesta esplicita). Senza la publication attiva, il feed funziona comunque via **polling 60s** (degrado controllato).
- [ ] Verifica e2e manuale del flusso: operatore crea richiesta → badge realtime sull'admin → admin prende in carico (altro admin vede "in gestione: <nome>" + Override) → approva/rifiuta → la riga esce dalla coda e compare nel registro → export ZIP foto dal riepilogo.

## Fase 4 — Corsia "Liberi"

> Scope: la corsia **Liberi** per-operatore-per-piano. Quando attiva su `(piano_id, staff_id)`, le richieste manuali di quell'operatore **saltano l'approvazione**: l'intervento canonico e la voce approvata nascono subito, la richiesta è terminale `auto_liberi`/`corsia='liberi'`. Altrimenti resta il ramo `normale` (richiesta `in_attesa` + voce sospesa) già esistente da Fase 1.
> Si appoggia ai contratti di Fase 1: `richiestaToIntervento` (PURA, `lib/interventi/manuali/richiestaToIntervento.ts`), `buildVoceManuale` (PURA), e la route `POST /api/r/[token]/intervento-manuale/route.ts` (in Fase 2 diventata multipart con foto). Estende il lucchetto esistente (`mappa_piani_lucchetti`, `ManualAssignmentsModal.tsx`, `MappaOperatoriClient.tsx`, `app/api/mappa/piani/route.ts` + `rulePayload.ts`).
> Stack: Next.js 15 App Router, React 19, TS, Supabase (`import { supabaseAdmin } from '@/lib/supabaseAdmin'`), Tailwind v4, vitest. `npm test` = `vitest run`. Route `/api/r/[token]/*` pubbliche protette dal token; `export const runtime = 'nodejs'`. Commit: `feat(interventi-manuali): …`.
> Baseline lint già rossa su `main`: il gate è "nessun nuovo problema dai file del WP" → verifica con `npx eslint <path>`. Niente DB in CI: la migrazione si verifica con un test "di forma" (come Fase 1) e si lancia al PC dell'utente, non qui.

---

### Task 4.1: Migrazione `20260606000003_lucchetti_manuali_liberi.sql` — colonna `manuali_liberi`

**Files:**
- Create: `supabase/migrations/20260606000003_lucchetti_manuali_liberi.sql`
- Test: `lib/interventi/manuali/migrationLiberiShape.test.ts` (smoke test di forma: nessun DB in CI, come `migrationShape.test.ts` di Fase 1)

> Estensione di `mappa_piani_lucchetti` (creata in `20260501000000_mappa_assegnazioni_manuali.sql`: PK `(piano_id, staff_id)`, colonna `aperto boolean not null default true`). Aggiunge `manuali_liberi boolean not null default false`: additiva, retro-compatibile, idempotente.

- [ ] (a) Scrivi il test che fallisce — `lib/interventi/manuali/migrationLiberiShape.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260606000003_lucchetti_manuali_liberi.sql'),
  'utf8',
);

describe('migrazione lucchetti_manuali_liberi', () => {
  it('aggiunge la colonna manuali_liberi a mappa_piani_lucchetti', () => {
    expect(sql).toMatch(
      /alter table mappa_piani_lucchetti\s+add column if not exists manuali_liberi boolean not null default false/i,
    );
  });
});
```
- [ ] (b) Esegui e verifica FAIL — `Run: npx vitest run lib/interventi/manuali/migrationLiberiShape.test.ts`. Expected: FAIL con `ENOENT` (il file SQL non esiste ancora).
- [ ] (c) Implementazione minimale — crea `supabase/migrations/20260606000003_lucchetti_manuali_liberi.sql`:
```sql
-- Fase 4 — Corsia "Liberi".
-- Estende mappa_piani_lucchetti (creata in 20260501000000_mappa_assegnazioni_manuali.sql):
-- per ogni (piano_id, staff_id), se manuali_liberi=true gli interventi manuali di quell'operatore
-- in quel piano saltano l'approvazione admin (corsia 'liberi'). Additiva, idempotente.
alter table mappa_piani_lucchetti
  add column if not exists manuali_liberi boolean not null default false;
```
- [ ] (d) Esegui e verifica PASS — `Run: npx vitest run lib/interventi/manuali/migrationLiberiShape.test.ts`. Expected: verde.
- [ ] (e) Nota consegna SQL: la migrazione **non** si esegue qui (DB prod al PC dell'utente; il Supabase MCP punta ad "aurea", non al prod). Il deploy applicativo è Vercel su push a `main`; la SQL la lancia l'utente.
- [ ] (f) Commit — `git add supabase/migrations/20260606000003_lucchetti_manuali_liberi.sql lib/interventi/manuali/migrationLiberiShape.test.ts && git commit -m "feat(interventi-manuali): migrazione manuali_liberi su mappa_piani_lucchetti"`

---

### Task 4.2: `decisioneCorsia` (PURA) — riga lucchetto → corsia

**Files:**
- Create: `lib/interventi/manuali/decisioneCorsia.ts`
- Test: `lib/interventi/manuali/decisioneCorsia.test.ts`

> Regola: data la riga `mappa_piani_lucchetti` di `(piano_id, staff_id)` (o `null` se non esiste), ritorna `'liberi'` se e solo se `manuali_liberi === true`; in ogni altro caso (riga assente, campo assente/`null`/`false`) ritorna `'normale'`. Default conservativo: senza opt-in esplicito si resta in approvazione. `CorsiaRichiesta` è il tipo già definito in Fase 1 (`lib/interventi/manuali/types.ts`).

- [ ] (a) Scrivi il test che fallisce — `lib/interventi/manuali/decisioneCorsia.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { decisioneCorsia } from './decisioneCorsia';

describe('decisioneCorsia', () => {
  it('manuali_liberi true → liberi', () => {
    expect(decisioneCorsia({ manuali_liberi: true })).toBe('liberi');
  });
  it('manuali_liberi false → normale', () => {
    expect(decisioneCorsia({ manuali_liberi: false })).toBe('normale');
  });
  it('riga senza il campo → normale', () => {
    expect(decisioneCorsia({})).toBe('normale');
  });
  it('campo null/undefined → normale', () => {
    expect(decisioneCorsia({ manuali_liberi: null })).toBe('normale');
    expect(decisioneCorsia({ manuali_liberi: undefined })).toBe('normale');
  });
  it('riga assente (null) → normale', () => {
    expect(decisioneCorsia(null)).toBe('normale');
  });
  it('riga assente (undefined) → normale', () => {
    expect(decisioneCorsia(undefined)).toBe('normale');
  });
});
```
- [ ] (b) Esegui e verifica FAIL — `Run: npx vitest run lib/interventi/manuali/decisioneCorsia.test.ts -t "decisioneCorsia"`. Expected: FAIL (modulo `./decisioneCorsia` inesistente).
- [ ] (c) Implementazione minimale — crea `lib/interventi/manuali/decisioneCorsia.ts`:
```ts
// PURA: dalla riga lucchetto di (piano_id, staff_id) decide la corsia della richiesta manuale.
// 'liberi' SOLO se manuali_liberi === true (opt-in esplicito); altrimenti 'normale'
// (riga assente, campo assente/null/false). L'I/O (lettura riga) sta nella route.
import type { CorsiaRichiesta } from './types';

export type RigaLucchettoLiberi = { manuali_liberi?: boolean | null } | null | undefined;

export function decisioneCorsia(riga: RigaLucchettoLiberi): CorsiaRichiesta {
  return riga?.manuali_liberi === true ? 'liberi' : 'normale';
}
```
- [ ] (d) Esegui e verifica PASS — `Run: npx vitest run lib/interventi/manuali/decisioneCorsia.test.ts -t "decisioneCorsia"`. Expected: verde.
- [ ] (e) Verifica type-check — `Run: npx tsc --noEmit -p tsconfig.json`. Expected: nessun errore (il tipo `CorsiaRichiesta` esiste da Fase 1).
- [ ] (f) Commit — `git add lib/interventi/manuali/decisioneCorsia.ts lib/interventi/manuali/decisioneCorsia.test.ts && git commit -m "feat(interventi-manuali): decisioneCorsia pura (riga lucchetto → liberi/normale)"`

---

### Task 4.3: Persisti `manuali_liberi` nel salvataggio piano (POST + PUT)

**Files:**
- Modify: `app/api/mappa/piani/route.ts` — GET (select), POST e PUT salvano `manuali_liberi`
- Modify: `app/api/mappa/piani/rulePayload.ts` — `buildLockRows` accetta la mappa `manualiLiberi`
- Test: `app/api/mappa/piani/rulePayload.test.ts` (nuovo: la logica testabile è `buildLockRows`; la route fa solo I/O)

> Oggi `buildLockRows(pianoId, lucchetti)` mappa `Record<staffId, aperto>` → righe `{ piano_id, staff_id, aperto }`. La Fase 4 aggiunge una **seconda** mappa `Record<staffId, manuali_liberi>`: l'insieme delle righe è l'**unione** delle chiavi delle due mappe (un operatore può avere la corsia liberi anche senza aver mai toccato il lucchetto `aperto`, e viceversa — il design §4.6 chiede l'upsert della riga lucchetto per qualsiasi operatore del piano). Manteniamo retro-compatibilità: `manualiLiberi` è opzionale.

- [ ] (a) Scrivi il test che fallisce — crea `app/api/mappa/piani/rulePayload.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildLockRows } from './rulePayload';

describe('buildLockRows con manuali_liberi', () => {
  it('senza manualiLiberi: righe lucchetto storiche con manuali_liberi=false (default)', () => {
    expect(buildLockRows('p1', { s1: true, s2: false })).toEqual([
      { piano_id: 'p1', staff_id: 's1', aperto: true, manuali_liberi: false },
      { piano_id: 'p1', staff_id: 's2', aperto: false, manuali_liberi: false },
    ]);
  });

  it('unisce le chiavi di aperto e manualiLiberi', () => {
    const rows = buildLockRows('p1', { s1: false }, { s1: true, s2: true });
    expect(rows).toContainEqual({ piano_id: 'p1', staff_id: 's1', aperto: false, manuali_liberi: true });
    // s2 ha solo la corsia liberi → aperto torna al default true
    expect(rows).toContainEqual({ piano_id: 'p1', staff_id: 's2', aperto: true, manuali_liberi: true });
    expect(rows).toHaveLength(2);
  });

  it('manuali_liberi default false quando lo staff non è nella mappa liberi', () => {
    const rows = buildLockRows('p1', { s1: true }, { s2: true });
    expect(rows).toContainEqual({ piano_id: 'p1', staff_id: 's1', aperto: true, manuali_liberi: false });
    expect(rows).toContainEqual({ piano_id: 'p1', staff_id: 's2', aperto: true, manuali_liberi: true });
  });

  it('manualiLiberi non-oggetto è ignorata (back-compat)', () => {
    expect(buildLockRows('p1', { s1: true }, null)).toEqual([
      { piano_id: 'p1', staff_id: 's1', aperto: true, manuali_liberi: false },
    ]);
  });

  it('entrambe vuote → nessuna riga', () => {
    expect(buildLockRows('p1', {}, {})).toEqual([]);
  });
});
```
- [ ] (b) Esegui e verifica FAIL — `Run: npx vitest run app/api/mappa/piani/rulePayload.test.ts -t "manuali_liberi"`. Expected: FAIL (firma a 2 argomenti / nessuna chiave `manuali_liberi`).
- [ ] (c) Implementazione — sostituisci `buildLockRows` in `app/api/mappa/piani/rulePayload.ts` (le altre export `RegolaSchema`/`parseRegole`/`buildRuleRows` restano invariate):
```ts
export function buildLockRows(
  pianoId: string,
  lucchetti: unknown,
  manualiLiberi?: unknown,
) {
  const aperti = lucchetti && typeof lucchetti === 'object' ? (lucchetti as Record<string, unknown>) : {};
  const liberi = manualiLiberi && typeof manualiLiberi === 'object' ? (manualiLiberi as Record<string, unknown>) : {};
  const staffIds = new Set<string>([...Object.keys(aperti), ...Object.keys(liberi)].filter((s) => s.length > 0));
  return [...staffIds].map((staffId) => ({
    piano_id: pianoId,
    staff_id: staffId,
    aperto: aperti[staffId] !== false,
    manuali_liberi: liberi[staffId] === true,
  }));
}
```
- [ ] (d) Esegui e verifica PASS — `Run: npx vitest run app/api/mappa/piani/rulePayload.test.ts -t "manuali_liberi"`. Expected: verde.
- [ ] (e) Modifica la route `app/api/mappa/piani/route.ts`. (e.1) Nel `GET`, includi la colonna nella select dei lucchetti (riga attuale `.select('piano_id, staff_id, aperto')`):
```ts
    const { data: lockRows } = await supabaseAdmin
      .from('mappa_piani_lucchetti')
      .select('piano_id, staff_id, aperto, manuali_liberi')
      .in('piano_id', pianoIds);
```
- [ ] (f) (e.2) Nel `POST`, estrai `manualiLiberi` dal body e passalo a `buildLockRows`. La riga di destructuring attuale è:
```ts
    const { data: isoData, territorio, note, stato = 'bozza', operatori, regole, lucchetti } = body;
```
diventa (aggiungi `manualiLiberi`):
```ts
    const { data: isoData, territorio, note, stato = 'bozza', operatori, regole, lucchetti, manualiLiberi } = body;
```
e la build delle righe lucchetto (attuale `const lockRows = buildLockRows(pianoId, lucchetti);`) diventa:
```ts
    const lockRows = buildLockRows(pianoId, lucchetti, manualiLiberi);
```
- [ ] (g) (e.3) Nel `PUT`, stessa coppia di modifiche. Destructuring attuale:
```ts
    const { id, data: isoData, territorio, note, stato = 'confermato', operatori, regole, lucchetti } = body;
```
diventa:
```ts
    const { id, data: isoData, territorio, note, stato = 'confermato', operatori, regole, lucchetti, manualiLiberi } = body;
```
e la build (attuale `const lockRows = buildLockRows(id, lucchetti);`) diventa:
```ts
    const lockRows = buildLockRows(id, lucchetti, manualiLiberi);
```
- [ ] (h) Verifica type-check + i due test pure — `Run: npx tsc --noEmit -p tsconfig.json && npx vitest run app/api/mappa/piani/rulePayload.test.ts`. Expected: nessun errore TS; test verdi.
- [ ] (i) Lint sui file toccati — `Run: npx eslint "app/api/mappa/piani/route.ts" "app/api/mappa/piani/rulePayload.ts" "app/api/mappa/piani/rulePayload.test.ts"`. Expected: nessun nuovo problema.
- [ ] (j) Commit — `git add "app/api/mappa/piani/route.ts" "app/api/mappa/piani/rulePayload.ts" "app/api/mappa/piani/rulePayload.test.ts" && git commit -m "feat(interventi-manuali): persisti manuali_liberi per operatore nel salvataggio piano"`

---

### Task 4.4: Toggle "Interventi manuali liberi" per operatore nel modale assegnazioni

**Files:**
- Modify: `components/modules/mappa/ManualAssignmentsModal.tsx` — prop + toggle accanto al lucchetto
- Modify: `components/modules/mappa/MappaOperatoriClient.tsx` — stato `operatorFreeLane` + callback + payload + prop al modale

> La sezione "Operatori · lucchetto" del modale mostra già, per ogni operatore, il toggle `🔓 Aperto / 🔒 Chiuso` (legato a `p.locks` / `p.onChangeLocks`). Si aggiunge **accanto** un toggle `🟢 Liberi / ⚪ Approva` legato a una nuova coppia di prop `manualiLiberi` / `onChangeManualiLiberi`, simmetrica. Il toggle liberi è indipendente dal pin (si applica a qualsiasi operatore del piano: design §4.6).

- [ ] (a) Verifica manuale (UI) — niente unit nuovo (logica decisionale già coperta da `decisioneCorsia`/`buildLockRows`). Il criterio di accettazione: ogni operatore della sezione "Operatori · lucchetto" mostra, accanto al toggle Aperto/Chiuso, un toggle Liberi/Approva il cui stato riflette `manualiLiberi[o.id]` e il cui click chiama `onChangeManualiLiberi`.

- [ ] (b) Modifica `components/modules/mappa/ManualAssignmentsModal.tsx`. (b.1) Estendi il type `Props` (dopo `onChangeLocks`):
```ts
type Props = {
  open: boolean;
  onClose: () => void;
  operators: OperatorLite[];
  tasks: Task[];
  rules: ManualRule[];
  locks: Record<string, boolean>;
  manualiLiberi: Record<string, boolean>;
  onChangeRules: (rules: ManualRule[]) => void;
  onChangeLocks: (locks: Record<string, boolean>) => void;
  onChangeManualiLiberi: (manualiLiberi: Record<string, boolean>) => void;
  onDistribute: () => void;
};
```
- [ ] (c) (b.2) Nella sezione "Operatori · lucchetto", sostituisci il blocco `p.operators.map(...)` per affiancare il toggle Liberi. Il blocco attuale (dalla `<h3>` al `</div>` di chiusura della lista) diventa:
```tsx
          <h3 className="mt-6 mb-2 text-[15px] font-semibold">Operatori · lucchetto · corsia</h3>
          <div className="space-y-2">
            {p.operators.map((o) => {
              const aperto = p.locks[o.id] !== false;
              const liberi = p.manualiLiberi[o.id] === true;
              const pinned = pinnedStaffIds.has(o.id);
              return (
                <div key={o.id} className="flex items-center justify-between rounded-xl border px-3 py-2.5" style={{ borderColor: C.border, opacity: pinned ? 1 : 0.6 }}>
                  <span className="text-[13.5px] font-semibold">{o.name}{pinned ? '' : ' · automatico'}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => p.onChangeManualiLiberi({ ...p.manualiLiberi, [o.id]: !liberi })}
                      title="Interventi manuali liberi: saltano l'approvazione della torre"
                      className="rounded-full px-3 py-1.5 text-[12px] font-semibold"
                      style={liberi
                        ? { background: 'oklch(0.74 0.21 145/.16)', color: 'oklch(0.52 0.21 145)' }
                        : { background: 'oklch(0.62 0.02 250/.16)', color: 'var(--brand-text-muted)' }}>
                      {liberi ? '🟢 Liberi' : '⚪ Approva'}
                    </button>
                    {pinned && (
                      <button onClick={() => p.onChangeLocks({ ...p.locks, [o.id]: !aperto })}
                        className="rounded-full px-3 py-1.5 text-[12px] font-semibold"
                        style={aperto
                          ? { background: 'oklch(0.74 0.21 145/.16)', color: 'oklch(0.52 0.21 145)' }
                          : { background: 'oklch(0.64 0.25 350/.16)', color: 'oklch(0.54 0.25 350)' }}>
                        {aperto ? '🔓 Aperto' : '🔒 Chiuso'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
```
- [ ] (d) Modifica `components/modules/mappa/MappaOperatoriClient.tsx`. (d.1) Accanto allo stato `operatorLocks` (riga `const [operatorLocks, setOperatorLocks] = useState<Record<string, boolean>>({});`) aggiungi:
```ts
  const [operatorFreeLane, setOperatorFreeLane] = useState<Record<string, boolean>>({});
```
- [ ] (e) (d.2) Nel payload di salvataggio piano (oggetto `payload` in `distributeToOps`, dove c'è `lucchetti: operatorLocks,`) aggiungi la mappa liberi:
```ts
      const payload = {
        data: planningDate,
        territorio: selectedPlanningTerritory?.name ?? null,
        note: '',
        stato: 'confermato',
        operatori,
        regole: manualRules,
        lucchetti: operatorLocks,
        manualiLiberi: operatorFreeLane,
      };
```
- [ ] (f) (d.3) Nel montaggio `<ManualAssignmentsModal ... />` (dove c'è `locks={operatorLocks}` / `onChangeLocks={setOperatorLocks}`) aggiungi le due prop nuove:
```tsx
        locks={operatorLocks}
        manualiLiberi={operatorFreeLane}
        onChangeRules={setManualRules}
        onChangeLocks={setOperatorLocks}
        onChangeManualiLiberi={setOperatorFreeLane}
```
- [ ] (g) (d.4) Idratazione dal piano salvato — quando un piano esistente viene ricaricato e si popolano `operatorLocks` dalle righe `lucchetti` (cerca `setOperatorLocks(` nel file, nel ramo di load del piano), popola in parallelo `operatorFreeLane` dalla stessa lista di righe lucchetto, mappando `manuali_liberi`. Esempio di forma (adatta alla variabile reale delle righe lucchetto del load, es. `piano.lucchetti`):
```ts
        setOperatorFreeLane(
          Object.fromEntries(
            (piano.lucchetti ?? [])
              .filter((l: { manuali_liberi?: boolean }) => l.manuali_liberi === true)
              .map((l: { staff_id: string }) => [l.staff_id, true]),
          ),
        );
```
> Nota: se al momento dell'esecuzione il load del piano non idrata ancora `operatorLocks` da `piano.lucchetti`, questo step (g) si limita ad allineare `operatorFreeLane` accanto a dove `operatorLocks` viene impostato; mantieni le due idratazioni adiacenti e coerenti.
- [ ] (h) Verifica type-check — `Run: npx tsc --noEmit -p tsconfig.json`. Expected: nessun errore (la prop `manualiLiberi`/`onChangeManualiLiberi` è ora richiesta dal modale ed è passata dal client).
- [ ] (i) Lint sui file toccati — `Run: npx eslint components/modules/mappa/ManualAssignmentsModal.tsx components/modules/mappa/MappaOperatoriClient.tsx`. Expected: nessun nuovo problema.
- [ ] (j) Verifica manuale (UI) — `npm run dev`, apri `/hub/mappa?vista=pianifica`, apri "Assegnazioni manuali": ogni operatore mostra il toggle Liberi/Approva accanto al lucchetto; il toggle cambia stato al click; "Distribuisci" salva il piano e il payload contiene `manualiLiberi`. Riaprendo il piano, gli operatori con corsia liberi risultano 🟢 Liberi.
- [ ] (k) Commit — `git add components/modules/mappa/ManualAssignmentsModal.tsx components/modules/mappa/MappaOperatoriClient.tsx && git commit -m "feat(interventi-manuali): toggle corsia liberi per operatore nel modale assegnazioni"`

---

### Task 4.5: Route `intervento-manuale` — ramo corsia liberi (intervento immediato)

**Files:**
- Modify: `app/api/r/[token]/intervento-manuale/route.ts` (creata in Fase 1, multipart in Fase 2)
- Create: `lib/interventi/manuali/buildVoceManuale.ts` resta invariato; **niente** nuovo modulo puro qui (la decisione è `decisioneCorsia`, già testata al Task 4.2).

> La route, dopo aver risolto `rap` (con `rap.id`, `rap.staff_id`, `rap.piano_id`, `rap.data`, `rap.staff_name`), validato il committente e costruito `dati`, e (Fase 2) validato/caricato le foto: legge `mappa_piani_lucchetti.manuali_liberi` per `(rap.piano_id, rap.staff_id)`, chiama `decisioneCorsia(...)` e si biforca.
> - **liberi**: crea SUBITO l'intervento canonico (`richiestaToIntervento` + insert in `interventi`), la richiesta con `stato='auto_liberi'`, `corsia='liberi'`, `intervento_id`, e la voce con `manuale=true`, `approvazione_stato='approvato'` + `intervento_id`.
> - **normale**: ramo esistente di Fase 1 (richiesta `stato='in_attesa'`, `corsia='normale'`, voce `approvazione_stato='in_attesa'`).
> La biforcazione condivide: il calcolo `ordine` della voce e `buildVoceManuale(...)` (la voce è la stessa; cambiano solo `approvazione_stato` e `intervento_id`, applicati con un patch post-insert nel ramo liberi). Se `rap.piano_id` è `null` (rapportino non collegato a un piano) → nessuna riga lucchetto → `decisioneCorsia(null)='normale'`: il fallback è il flusso con approvazione (conservativo).

- [ ] (a) Verifica di partenza dei test pure usati dalla route — `Run: npx vitest run lib/interventi/manuali/decisioneCorsia.test.ts lib/interventi/manuali/richiestaToIntervento.test.ts lib/interventi/manuali/buildVoceManuale.test.ts`. Expected: tutti verdi (la logica della Fase 4 si appoggia a queste funzioni pure già testate; la route fa solo I/O e orchestrazione).

- [ ] (b) Aggiungi gli import in testa a `app/api/r/[token]/intervento-manuale/route.ts` (accanto agli import di Fase 1/2):
```ts
import { decisioneCorsia } from '@/lib/interventi/manuali/decisioneCorsia';
import { richiestaToIntervento } from '@/lib/interventi/manuali/richiestaToIntervento';
import type { CommittenteManuale } from '@/lib/interventi/manuali/types';
```
> Se `richiestaToIntervento` / `CommittenteManuale` risultano già importati (Fase 2 non li importa, ma verificalo): non duplicare gli import.

- [ ] (c) Leggi la corsia e decidi. Inserisci questo blocco DOPO che `dati`, `committente`, `templateId` sono pronti e (Fase 2) DOPO la validazione/upload foto, ma PRIMA dell'INSERT della richiesta in `interventi_manuali`:
```ts
  // Corsia per (piano, operatore): se 'liberi', la richiesta salta l'approvazione.
  let corsia: 'normale' | 'liberi' = 'normale';
  if (rap.piano_id && rap.staff_id) {
    const { data: lock } = await supabaseAdmin
      .from('mappa_piani_lucchetti')
      .select('manuali_liberi')
      .eq('piano_id', rap.piano_id)
      .eq('staff_id', rap.staff_id)
      .maybeSingle();
    corsia = decisioneCorsia(lock as { manuali_liberi?: boolean | null } | null);
  }
```
- [ ] (d) Nel ramo **liberi** crea l'intervento canonico PRIMA della richiesta (così la richiesta nasce già con `intervento_id`). Inserisci subito dopo il blocco (c):
```ts
  // Ramo liberi: crea subito l'intervento canonico (origine='manuale').
  let interventoId: string | null = null;
  if (corsia === 'liberi') {
    const record = richiestaToIntervento(dati, {
      committente: committente as CommittenteManuale,
      data: rap.data as string,
      staff_id: String(rap.staff_id ?? ''),
      piano_id: (rap.piano_id as string | null) ?? null,
    });
    const { data: intRow, error: eInt } = await supabaseAdmin
      .from('interventi')
      .insert(record)
      .select('id')
      .single();
    if (eInt) return NextResponse.json({ error: eInt.message }, { status: 500 });
    interventoId = intRow!.id;
  }
```
- [ ] (e) Aggiorna l'INSERT della richiesta in `interventi_manuali` (Fase 1 forza `stato: 'in_attesa', corsia: 'normale'`): usa la corsia decisa e, nel ramo liberi, `stato='auto_liberi'` + `intervento_id`. Il blocco `.insert({ ... })` diventa:
```ts
  const { data: req2, error: eReq } = await supabaseAdmin
    .from('interventi_manuali')
    .insert({
      rapportino_id: rap.id,
      piano_id: rap.piano_id,
      staff_id: rap.staff_id,
      staff_name: rap.staff_name,
      committente,
      template_id: templateId,
      data: rap.data,
      dati_operatore: dati,
      dati_correnti: dati,
      note: body.note ?? null,
      stato: corsia === 'liberi' ? 'auto_liberi' : 'in_attesa',
      corsia,
      intervento_id: interventoId,
    })
    .select('id')
    .single();
  if (eReq) return NextResponse.json({ error: eReq.message }, { status: 500 });
```
> Nota Fase 2: con il body multipart `body.note` non esiste più; usa la fonte nota reale (`dati.note` o il campo `note` letto dal `form`/`dati`). Mantieni il valore già usato dal ramo Fase 1/2 esistente — qui si cambia solo `stato`/`corsia`/`intervento_id`.

- [ ] (f) Dopo l'INSERT della voce (la voce si costruisce come in Fase 1 con `buildVoceManuale({ rapportinoId: rap.id, richiestaId: req2!.id, ordine, dati })` e si inserisce ottenendo `voceRow.id`), nel ramo liberi promuovi la voce ad approvata e collegala all'intervento. Subito DOPO l'`update` di Fase 1 che imposta `voce_id` sulla richiesta:
```ts
  await supabaseAdmin.from('interventi_manuali').update({ voce_id: voceRow!.id }).eq('id', req2!.id);

  // Ramo liberi: la voce nasce approvata e già agganciata all'intervento canonico.
  if (corsia === 'liberi' && interventoId) {
    await supabaseAdmin
      .from('rapportino_voci')
      .update({ approvazione_stato: 'approvato', intervento_id: interventoId })
      .eq('id', voceRow!.id);
  }
```
> Coerenza: `buildVoceManuale` imposta sempre `approvazione_stato: 'in_attesa'` (Fase 1). Nel ramo liberi la si **sovrascrive** ad `'approvato'` con questo patch — speculare a ciò che fa la route admin `…/[id]/approva` (Task 1.10: `update({ intervento_id, approvazione_stato: 'approvato' })` sulla voce). Così `rapportinoInviabile` (Fase 1) NON conta la voce liberi come "in sospeso" e il rapportino resta inviabile.

- [ ] (g) Aggiorna la risposta della route per esporre la corsia e l'eventuale intervento creato (la `return NextResponse.json({ id: req2!.id, voceId: voceRow!.id })` di Fase 1 diventa):
```ts
  return NextResponse.json({ id: req2!.id, voceId: voceRow!.id, corsia, interventoId });
```
- [ ] (h) Verifica type-check — `Run: npx tsc --noEmit -p tsconfig.json`. Expected: nessun errore nel file route e nei moduli `lib/interventi/manuali/*`.
- [ ] (i) Lint sul file toccato — `Run: npx eslint "app/api/r/[token]/intervento-manuale/route.ts"`. Expected: nessun nuovo problema.
- [ ] (j) Verifica manuale (flusso end-to-end):
  - Operatore con corsia **liberi** sul suo piano → invio richiesta → in DB: `interventi_manuali.stato='auto_liberi'`, `corsia='liberi'`, `intervento_id` valorizzato; `rapportino_voci.approvazione_stato='approvato'` con `intervento_id`; esiste 1 riga `interventi` con `origine='manuale'`. La voce NON blocca l'invio del rapportino.
  - Operatore **senza** corsia liberi (o rapportino senza piano) → invio → `interventi_manuali.stato='in_attesa'`, `corsia='normale'`, nessun `interventi` creato; voce `approvazione_stato='in_attesa'` (blocca l'invio finché la torre non approva).
- [ ] (k) Commit — `git add "app/api/r/[token]/intervento-manuale/route.ts" && git commit -m "feat(interventi-manuali): corsia liberi nella route — intervento e voce approvati subito (auto_liberi)"`

---

### Chiusura Fase 4

- [ ] `npm test` verde (nuovi unit: `decisioneCorsia`, `rulePayload` con `manuali_liberi`, `migrationLiberiShape`; più i pure di Fase 1 riusati: `richiestaToIntervento`, `buildVoceManuale`).
- [ ] `npx tsc --noEmit -p tsconfig.json` senza errori.
- [ ] `npx eslint` pulito (nessun nuovo problema rispetto alla baseline) su tutti i file toccati.
- [ ] La migrazione `20260606000003_lucchetti_manuali_liberi.sql` è scritta ma **non** eseguita qui: la SQL la lancia l'utente al PC; il deploy applicativo è Vercel su push a `main`.

---

## Note di esecuzione

**Ordine:** eseguire le fasi in sequenza (1 → 4). Ogni fase è autonomamente testabile; la Fase 1 è già un flusso end-to-end (carica → approva → intervento). Export ZIP (Fase 3) e corsia liberi (Fase 4) estendono la route `intervento-manuale` creata in Fase 1 e resa multipart in Fase 2: applicare i Modify nell'ordine delle fasi.

**Test/gate (coerente col progetto):**
- Funzioni pure: `npx vitest run <path>` (FAIL→PASS per ogni task con logica).
- Niente harness DB in CI: le migrazioni SQL hanno uno "shape test" (lettura del file) e non vengono eseguite qui — la SQL si consegna all'utente su richiesta (Supabase MCP ≠ prod).
- Lint baseline `main` già rosso: gate per-file con `npx eslint <path>` sui soli file toccati, non `npm run lint` globale.
- Step UI/route senza logica pura: `npx tsc --noEmit` + verifica manuale esplicita.

**Punti da confermare a runtime (segnalati nei task, non placeholder):**
- Fase 3: file che monta `<TopBar>` per passare `isAdmin`, e colonne reali di `profiles` per i nomi admin (fallback a email/id).
- Fase 4: idratazione di `operatorFreeLane` dal piano ricaricato — aggancio indicato accanto a `setOperatorLocks`, da adattare alla variabile reale del load.

**Migrazioni (timestamp progressivi):** `20260606000000` (core), `…0001` (foto+bucket), `…0002` (realtime), `…0003` (lucchetti).
