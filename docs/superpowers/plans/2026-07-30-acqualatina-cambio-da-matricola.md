# AcquaLatina — cambio misuratore dal `+`, guidato dal master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dal campo l'operatore AcquaLatina cerca una matricola col tasto `+`. Se il misuratore è nel master del committente il cambio parte e il rapportino si autopopola; se non c'è, l'esecuzione **si blocca** con l'invito a contattare l'ufficio. La richiesta approvata dal backoffice resta **da assegnare** finché l'assegnazione manuale sul sistema AcquaLatina non viene registrata con una spunta massiva.

**Architecture:** il censimento AcquaLatina **non è una tabella nuova**: sono le righe `template_master_righe` dei file caricati da `/impostazioni/template-master` con `template_master.committente='acqualatina'` e `attivo=true`. Il lookup si usa **al contrario** rispetto a com'è nato (là ODL → riga, qui matricola → ODL), quindi serve un indice su `matricola` e una funzione pura nuova per il verdetto. Il verdetto ha quattro gradini e la sua logica sta tutta in `lib/acqualatina/lookupMaster.ts`, cosí la stessa funzione decide online (server) e offline (cache IndexedDB). Lo stato «da assegnare» è una **colonna**, non uno stato: `interventi_manuali.assegnato_committente_at`.

**Tech Stack:** Next.js (route handler `runtime='nodejs'`, `supabaseAdmin`), React client components, IndexedDB (`lib/offline/*`), ExcelJS per l'export, Vitest.

---

## Decisioni prese (interviste 1–9)

| # | Decisione | Conseguenza |
|---|---|---|
| 1 | Non censito → **blocco secco**: avviso «contatta l'ufficio», nessun bottone per procedere | Nessuna coda nuova, nessuno stato nuovo, nessuna automazione di segnalazione |
| 2 | Lookup a **4 gradini**: letterale → liscio · normalizzato → conferma · simili → conferma · zero → blocco | `lib/acqualatina/lookupMaster.ts` |
| 3 | Cascata ODL: dedup per ODL → se ODL diversi scelta su **indirizzo** → se indirizzi identici **blocco** | Un ODL sbagliato è un'assegnazione sbagliata sul sistema del committente |
| 4 | Doppia conferma = **doppio tocco sulla matricola** (indirizzo e ODL come contesto nella scheda) | Vale per i gradini 2 e 3, stessa schermata con arità diversa |
| 5 | Offline: blocca **solo se la cache c'è**; cache assente → si procede, verdetto duro al POST | Ricontrollo server + `400` con motivo specifico |
| 6 | Censimento = `template_master_righe` (committente `acqualatina`, master `attivo`), matricole nulle escluse | Indice nuovo su `matricola` |
| 7 | Autofill completo dal master: matricola, ODL, via, comune, CAP; calibro **DN15** di default; attività dal gruppo | Nessun campo nuovo: coincide con l'anagrafica del template AcquaLatina |
| 8 | Il `+` offre **AcquaLatina** come quarto committente | `CommittenteManuale` cresce di un valore |
| 9 | «Da assegnare» è una **colonna** (`assegnato_committente_at`), non uno stato | `interventi.stato='da_assegnare'` esiste ma su un altro asse: `OPEN_STATES` lo conta come lavoro **aperto** |

L'intervento continua a nascere **dentro l'approvazione**, con `stato:'completato'`: fra approvazione e spunta sta in Storico e nei KPI come completato (confermato).

---

## File Structure

**Nuovi:**
- `lib/acqualatina/lookupMaster.ts` (+`.test.ts`) — verdetto a 4 gradini + cascata ODL (PURA).
- `lib/acqualatina/censimentoMaster.ts` — I/O: righe master AcquaLatina attive → `CensitoMisuratore[]`.
- `app/api/r/[token]/cerca-master/route.ts` — lookup online.
- `app/api/r/[token]/censimento-master/route.ts` — proiezione completa per la cache offline.
- `lib/offline/censimentoMaster.ts` — cache IndexedDB (chiave `'acqualatina'`).
- `components/modules/rapportini/acqualatina/CercaMatricolaAcqualatina.tsx` — passo di ricerca.
- `app/api/admin/interventi-manuali/da-assegnare/route.ts` — export XLSX + spunta massiva.
- `supabase/migrations/20260730180000_acqualatina_lookup_matricola.sql`.

**Modificati:**
- `lib/interventi/manuali/types.ts` — `CommittenteManuale` + `'acqualatina'`.
- `lib/interventi/manuali/attivitaPerCommittente.ts` — default `SOSTITUZIONE MISURATORI`.
- `lib/interventi/manuali/anagraficaValida.ts` — AcquaLatina come `lim_massive` (la matricola basta).
- `components/modules/rapportini/ModaleInterventoManuale.tsx` — quarto committente, passo ricerca.
- `app/api/r/[token]/intervento-manuale/route.ts` — ri-verifica master al POST.
- `lib/offline/syncPlan.ts` — `motivoManuale400` passa il nuovo codice errore.
- `components/modules/lista-attesa/RegistroAutorizzazioni.tsx` — colonna/badge «Da assegnare», export, spunta massiva.
- `app/api/admin/interventi-manuali/route.ts` — espone `assegnato_committente_at`.

**Non toccati (deliberatamente):** `app/api/r/[token]/cerca-limitazione/route.ts`, `app/api/r/[token]/censimento/route.ts`, `CercaMatricolaLimitazione.tsx`, `limitazione_misuratori_ref`. Il percorso ACEA è in produzione e ha semantica opposta (blocco morbido, «inserisci a mano»): resta invariato byte per byte.

## Note gate

Baseline: `npx tsc --noEmit` ha 2 errori preesistenti su `.next/types/.../template-rapportini`. Verifica **mirata**: `npx eslint <file>`, `npx vitest run <testfile>`.

---

### Task 1: `lookupMaster` — il verdetto a 4 gradini (PURA, TDD)

**Files:**
- Create: `lib/acqualatina/lookupMaster.ts`
- Test: `lib/acqualatina/lookupMaster.test.ts`

- [ ] **Step 1: Scrivi il test (fallisce)**

```ts
import { describe, it, expect } from 'vitest';
import { lookupMaster, type RigaMaster } from './lookupMaster';

const R = (o: Partial<RigaMaster>): RigaMaster =>
  ({ odl: '', matricola: '', indirizzo: '', comune: '', cap: '', ...o });

describe('lookupMaster', () => {
  const righe = [
    R({ odl: 'A1', matricola: '99A023041', indirizzo: 'VIA ROMA 1', comune: 'TERRACINA' }),
    R({ odl: 'B2', matricola: 'C-100 200', indirizzo: 'VIA PO 2', comune: 'TERRACINA' }),
  ];

  it('gradino 1 — match letterale: via libera, nessuna conferma', () => {
    const v = lookupMaster('99A023041', righe);
    expect(v.esito).toBe('letterale');
    if (v.esito === 'letterale') expect(v.riga.odl).toBe('A1');
  });

  it('gradino 2 — normalizzato ma non letterale: conferma su UN candidato', () => {
    const v = lookupMaster('c100200', righe);
    expect(v.esito).toBe('conferma');
    if (v.esito === 'conferma') expect(v.candidati.map((r) => r.odl)).toEqual(['B2']);
  });

  it('gradino 3 — prefisso variabile: conferma sui simili', () => {
    const v = lookupMaster('A023041', righe);
    expect(v.esito).toBe('conferma');
    if (v.esito === 'conferma') expect(v.candidati.map((r) => r.odl)).toEqual(['A1']);
  });

  it('gradino 4 — nessun candidato: blocco', () => {
    expect(lookupMaster('ZZZ99999', righe).esito).toBe('assente');
  });

  it('q vuota o troppo corta → assente (mai un match casuale)', () => {
    expect(lookupMaster('', righe).esito).toBe('assente');
    expect(lookupMaster('99', righe).esito).toBe('assente');
  });

  it('cascata: stessa matricola, STESSO odl su due righe → riga singola (duplicato innocuo)', () => {
    const dup = [
      R({ odl: 'A1', matricola: '99A023041', indirizzo: 'VIA ROMA 1' }),
      R({ odl: 'A1', matricola: '99A023041', comune: 'TERRACINA' }), // campi complementari
    ];
    const v = lookupMaster('99A023041', dup);
    expect(v.esito).toBe('letterale');
    // fusione difensiva: i vuoti della prima si riempiono dalla seconda
    if (v.esito === 'letterale') {
      expect(v.riga.indirizzo).toBe('VIA ROMA 1');
      expect(v.riga.comune).toBe('TERRACINA');
    }
  });

  it('cascata: ODL diversi e indirizzi DIVERSI → scelta all operatore', () => {
    const due = [
      R({ odl: 'A1', matricola: 'M1', indirizzo: 'VIA ROMA 1', comune: 'TERRACINA' }),
      R({ odl: 'A2', matricola: 'M1', indirizzo: 'VIA PO 9', comune: 'TERRACINA' }),
    ];
    const v = lookupMaster('M1', due);
    expect(v.esito).toBe('conferma');
    if (v.esito === 'conferma') expect(v.candidati.map((r) => r.odl).sort()).toEqual(['A1', 'A2']);
  });

  it('cascata: ODL diversi e indirizzi IDENTICI → ambiguo, blocco', () => {
    const due = [
      R({ odl: 'A1', matricola: 'M1', indirizzo: 'VIA ROMA 1', comune: 'TERRACINA' }),
      R({ odl: 'A2', matricola: 'M1', indirizzo: 'via roma  1', comune: 'terracina' }),
    ];
    const v = lookupMaster('M1', due);
    expect(v.esito).toBe('ambiguo');
    if (v.esito === 'ambiguo') expect(v.odl.sort()).toEqual(['A1', 'A2']);
  });

  it('righe senza matricola: ignorate, non producono match', () => {
    expect(lookupMaster('M1', [R({ odl: 'X', matricola: '' })]).esito).toBe('assente');
  });

  it('il match letterale NON scavalca l ambiguita di ODL', () => {
    const due = [
      R({ odl: 'A1', matricola: 'M1', indirizzo: 'VIA ROMA 1' }),
      R({ odl: 'A2', matricola: 'M1', indirizzo: 'VIA PO 9' }),
    ];
    expect(lookupMaster('M1', due).esito).toBe('conferma'); // non 'letterale'
  });
});
```

- [ ] **Step 2: Esegui → deve fallire**

Run: `npx vitest run lib/acqualatina/lookupMaster.test.ts`
Expected: FAIL (modulo non trovato).

- [ ] **Step 3: Implementa**

```ts
// PURA: verdetto del lookup matricola → riga di master AcquaLatina, a QUATTRO gradini
// (decisione 2) con la cascata ODL della decisione 3. La stessa funzione decide online
// (route /cerca-master) e offline (cache IndexedDB): il blocco deve essere identico nei
// due mondi, altrimenti «non censito» significherebbe due cose diverse.
//
// Gradini:
//   1. 'letterale'  — matricola identica carattere per carattere → si procede senza chiedere.
//   2/3. 'conferma' — normalizzata uguale, oppure solo simile (prefisso variabile del master):
//        l'operatore DEVE confermare (doppio tocco). Uno o piu candidati, stesso gesto.
//   4. 'assente'    — nessun candidato → blocco «contatta l'ufficio».
//   + 'ambiguo'     — piu ODL sulla stessa matricola e indirizzi indistinguibili: se il master
//        non distingue le righe nessuno in campo puo distinguerle → blocco, non si indovina.
import { normMatricola, matricoleSimili } from '@/lib/limitazione/matricoleSimili';

export type RigaMaster = {
  odl: string;
  matricola: string;
  indirizzo: string;
  comune: string;
  cap: string;
};

export type VerdettoMaster =
  | { esito: 'letterale'; riga: RigaMaster }
  | { esito: 'conferma'; candidati: RigaMaster[] }
  | { esito: 'ambiguo'; odl: string[] }
  | { esito: 'assente' };

const t = (v: unknown) => String(v ?? '').trim();

/** Chiave di confronto dell'indirizzo: maiuscolo, spazi compattati (il master e sporco di
 *  doppi spazi e minuscole). Serve solo a decidere se due righe sono distinguibili. */
const chiaveIndirizzo = (r: RigaMaster): string =>
  [r.indirizzo, r.comune, r.cap].map((v) => t(v).toUpperCase().replace(/\s+/g, ' ')).join('|');

/** Righe per ODL, con fusione DIFENSIVA dei campi: due righe dello stesso ODL sono un
 *  duplicato da doppio import, e i campi vuoti dell'una si riempiono dall'altra (mai
 *  sovrascritti i pieni). Stesso criterio di `costruisciMasterOdl`. */
function perOdl(righe: RigaMaster[]): Map<string, RigaMaster> {
  const m = new Map<string, RigaMaster>();
  for (const r of righe) {
    const odl = t(r.odl);
    const prima = m.get(odl);
    m.set(odl, prima ? {
      odl,
      matricola: prima.matricola || t(r.matricola),
      indirizzo: prima.indirizzo || t(r.indirizzo),
      comune: prima.comune || t(r.comune),
      cap: prima.cap || t(r.cap),
    } : { odl, matricola: t(r.matricola), indirizzo: t(r.indirizzo), comune: t(r.comune), cap: t(r.cap) });
  }
  return m;
}

export function lookupMaster(q: string, righe: RigaMaster[]): VerdettoMaster {
  const query = t(q);
  const nq = normMatricola(query);
  if (!nq) return { esito: 'assente' };

  // Le righe senza matricola non sono censimento: `matricola` e nullable in
  // template_master_righe (solo `odl` e NOT NULL).
  const conMatricola = (righe ?? []).filter((r) => t(r.matricola) !== '');

  const norm = conMatricola.filter((r) => normMatricola(r.matricola) === nq);
  const gruppi = perOdl(norm);

  if (gruppi.size === 1) {
    const riga = [...gruppi.values()][0];
    // Letterale = identico carattere per carattere su ALMENO una riga del gruppo.
    const letterale = norm.some((r) => t(r.matricola) === query);
    return letterale ? { esito: 'letterale', riga } : { esito: 'conferma', candidati: [riga] };
  }

  if (gruppi.size > 1) {
    const candidati = [...gruppi.values()];
    const chiavi = new Set(candidati.map(chiaveIndirizzo));
    // Indirizzi tutti uguali → il master non distingue le righe: dato rotto, non scelta.
    if (chiavi.size === 1) return { esito: 'ambiguo', odl: candidati.map((r) => r.odl) };
    return { esito: 'conferma', candidati };
  }

  // Nessun match normalizzato → simili (e' qui che entra il prefisso variabile del master).
  const simili = [...perOdl(matricoleSimili(query, conMatricola, 8)).values()];
  return simili.length === 0 ? { esito: 'assente' } : { esito: 'conferma', candidati: simili };
}
```

- [ ] **Step 4: Esegui → deve passare**

Run: `npx vitest run lib/acqualatina/lookupMaster.test.ts`
Expected: PASS (10 test).

- [ ] **Step 5: Commit**

```bash
git add lib/acqualatina/lookupMaster.ts lib/acqualatina/lookupMaster.test.ts
git commit -m "feat(acqualatina): verdetto del lookup matricola a quattro gradini

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FfBrfgeSf2pxqDmpvhyi1u"
```

---

### Task 2: Migration — indice sulla matricola + colonna «da assegnare»

**Files:**
- Create: `supabase/migrations/20260730180000_acqualatina_lookup_matricola.sql`

- [ ] **Step 1: Scrivi la migration**

```sql
-- Lookup INVERSO del master (matricola → ODL) e registrazione dell'assegnazione
-- sul sistema del committente.
--
-- (1) template_master_righe e nata per il verso opposto — si scrive l'ODS/ODL nel template
--     e il foglio compila matricola/indirizzo/comune/CAP — quindi ha l'indice su `odl` e
--     nessuno su `matricola`. Il "+" AcquaLatina cerca per matricola: senza indice il
--     lookup e una scansione del file master a ogni ricerca dal campo.
--     Indice PARZIALE: `matricola` e nullable e le righe nulle non sono censimento.
--
-- (2) assegnato_committente_at: l'assegnazione dell'ODL sul sistema AcquaLatina e un FATTO
--     ESTERNO, non una decisione sulla richiesta — quindi una colonna, non un valore in piu
--     su `stato`. `interventi.stato` ha gia 'da_assegnare' ma su un altro asse: OPEN_STATES
--     e STATI_APERTI lo contano come lavoro APERTO, e un intervento gia eseguito
--     ricomparirebbe come «da fare» in torre, consuntivazione e sweep.
--     NULL su riga approvata = da assegnare. Valorizzata = registrata.

create index if not exists template_master_righe_matricola_idx
  on template_master_righe (matricola)
  where matricola is not null;

alter table interventi_manuali
  add column if not exists assegnato_committente_at timestamptz;

-- Indice per la coda «da assegnare» del backoffice (approvati non ancora registrati).
create index if not exists interventi_manuali_da_assegnare_idx
  on interventi_manuali (data)
  where assegnato_committente_at is null;

comment on column interventi_manuali.assegnato_committente_at is
  'Istante in cui l''ODL e stato assegnato all''operatore sul sistema del committente '
  '(AcquaLatina: manuale, spunta massiva dal registro). NULL su riga approvata = da assegnare.';
```

- [ ] **Step 2: Applica al progetto Supabase**

Applicare la migration al prod (`mcp__Supabase__apply_migration` o `run-migration.js`). Verifica: `select count(*) from template_master_righe where matricola is not null;` risponde senza seq-scan sul piano (`explain`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260730180000_acqualatina_lookup_matricola.sql
git commit -m "feat(acqualatina): indice sulla matricola del master e colonna assegnato_committente_at

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FfBrfgeSf2pxqDmpvhyi1u"
```

---

### Task 3: `censimentoMaster` — l'I/O sul master AcquaLatina

**Files:**
- Create: `lib/acqualatina/censimentoMaster.ts`

- [ ] **Step 1: Implementa**

Due funzioni: il **campione per la ricerca** (pre-filtro SQL, come fa `cerca-limitazione`) e la **proiezione completa** per la cache offline.

```ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { COMMITTENTE_ACQUALATINA } from './contratto';
import type { RigaMaster } from './lookupMaster';

const PAGINA = 1000;
const CAMPI = 'odl, matricola, indirizzo, comune, cap';

/** Escapa i metacaratteri ilike (% _ \) così l'input utente non agisce da wildcard. */
export function escLike(v: string): string {
  return v.replace(/[%_\\]/g, '\\$&');
}

const riga = (r: Record<string, unknown>): RigaMaster => ({
  odl: String(r.odl ?? '').trim(),
  matricola: String(r.matricola ?? '').trim(),
  indirizzo: String(r.indirizzo ?? '').trim(),
  comune: String(r.comune ?? '').trim(),
  cap: String(r.cap ?? '').trim(),
});

/** Id dei file master ATTIVI del committente. Master spento (`attivo=false`) = fuori dal
 *  lookup senza cancellarne le righe: e la semantica dell'interruttore in
 *  /impostazioni/template-master, e va rispettata anche qui. */
export async function masterAttivi(committente = COMMITTENTE_ACQUALATINA): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('template_master')
    .select('id')
    .eq('committente', committente)
    .eq('attivo', true);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

/**
 * Candidati per la ricerca. Due fonti unite, come in /cerca-limitazione:
 *  (a) pre-filtro SQL ilike '%q%' = "candidato contiene q" — copre il prefisso variabile
 *      del master (q=A023041 trova 99A023041) restando leggero su dataset grandi;
 *  (b) campione ordinato (fino a 2000) per il caso inverso "q contiene candidato".
 * Il taglio e l'ordine li decide `lookupMaster`; qui si raccoglie soltanto.
 */
export async function candidatiPerRicerca(q: string, masterIds: string[]): Promise<RigaMaster[]> {
  if (masterIds.length === 0) return [];
  const [like, campione] = await Promise.all([
    supabaseAdmin.from('template_master_righe').select(CAMPI)
      .in('master_id', masterIds).not('matricola', 'is', null)
      .ilike('matricola', `%${escLike(q)}%`).limit(50),
    supabaseAdmin.from('template_master_righe').select(CAMPI)
      .in('master_id', masterIds).not('matricola', 'is', null)
      .order('matricola', { ascending: true }).limit(2000),
  ]);
  const perChiave = new Map<string, RigaMaster>();
  for (const r of [...(like.data ?? []), ...(campione.data ?? [])] as Array<Record<string, unknown>>) {
    const m = riga(r);
    perChiave.set(`${m.odl}|${m.matricola}`, m);
  }
  return [...perChiave.values()];
}

/** Proiezione COMPLETA per la cache offline (paginata: PostgREST tronca a 1000). */
export async function proiezioneCompleta(masterIds: string[]): Promise<RigaMaster[]> {
  if (masterIds.length === 0) return [];
  const out: RigaMaster[] = [];
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await supabaseAdmin
      .from('template_master_righe').select(CAMPI)
      .in('master_id', masterIds).not('matricola', 'is', null)
      .order('id', { ascending: true }).range(from, from + PAGINA - 1);
    if (error) throw error;
    const batch = (data ?? []) as Array<Record<string, unknown>>;
    out.push(...batch.map(riga));
    if (batch.length < PAGINA) break;
  }
  return out;
}

/** Versione della cache: `<righe>:<master attivi>`. Un import nuovo o un master
 *  acceso/spento cambia il conteggio → il client riscarica. */
export async function versioneCensimento(masterIds: string[]): Promise<string> {
  if (masterIds.length === 0) return '0:0';
  const { count } = await supabaseAdmin
    .from('template_master_righe')
    .select('id', { count: 'exact', head: true })
    .in('master_id', masterIds).not('matricola', 'is', null);
  return `${count ?? 0}:${masterIds.length}`;
}
```

- [ ] **Step 2: Verifica tipi/lint**

Run: `npx tsc --noEmit` ed `npx eslint lib/acqualatina/censimentoMaster.ts`
Expected: nessun nuovo errore.

- [ ] **Step 3: Commit**

```bash
git add lib/acqualatina/censimentoMaster.ts
git commit -m "feat(acqualatina): lettura del master per il lookup matricola (ricerca e cache)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FfBrfgeSf2pxqDmpvhyi1u"
```

---

### Task 4: `GET /cerca-master` — il lookup online

**Files:**
- Create: `app/api/r/[token]/cerca-master/route.ts`

- [ ] **Step 1: Implementa**

Gate del token identico a `cerca-limitazione` (esiste, valido, modificabile). Il verdetto lo calcola `lookupMaster`; i candidati escono nella forma `CensitoMisuratore` così `autofillAnagrafica` funziona senza modifiche.

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { lookupMaster } from '@/lib/acqualatina/lookupMaster';
import { masterAttivi, candidatiPerRicerca } from '@/lib/acqualatina/censimentoMaster';
import type { CensitoMisuratore } from '@/lib/limitazione/autofillAnagrafica';

export const runtime = 'nodejs';

/** RigaMaster → forma attesa da autofillAnagrafica. Il master AcquaLatina non porta pdr
 *  ne nominativo (un misuratore d'acqua non ha punto di riconsegna gas) e non porta il
 *  calibro: quello lo mette `calibroConDefault` (DN15 di capitolato). */
const censito = (r: { odl: string; matricola: string; indirizzo: string; comune: string; cap: string }): CensitoMisuratore => ({
  matricola: r.matricola, odl: r.odl, indirizzo: r.indirizzo, comune: r.comune, cap: r.cap,
});

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ error: 'q obbligatorio' }, { status: 400 });

  const { data: rap } = await supabaseAdmin
    .from('rapportini').select('id, stato, data, riaperto_at').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  const masterIds = await masterAttivi();
  const verdetto = lookupMaster(q, await candidatiPerRicerca(q, masterIds));

  if (verdetto.esito === 'letterale')
    return NextResponse.json({ esito: 'letterale', misuratore: censito(verdetto.riga) });
  if (verdetto.esito === 'conferma')
    return NextResponse.json({ esito: 'conferma', candidati: verdetto.candidati.map(censito) });
  if (verdetto.esito === 'ambiguo')
    return NextResponse.json({ esito: 'ambiguo', odl: verdetto.odl });
  // Nessun master attivo per il committente e "assente" allo stesso modo: in entrambi i casi
  // il campo non puo eseguire e l'ufficio e l'unico che puo sbloccare. `masterVuoto` serve
  // solo a far scrivere all'ufficio il messaggio giusto nei log.
  return NextResponse.json({ esito: 'assente', masterVuoto: masterIds.length === 0 });
}
```

- [ ] **Step 2: Verifica tipi/lint**

Run: `npx tsc --noEmit` ed `npx eslint "app/api/r/[token]/cerca-master/route.ts"`

- [ ] **Step 3: Commit**

```bash
git add "app/api/r/[token]/cerca-master/route.ts"
git commit -m "feat(acqualatina): endpoint di ricerca matricola sul master del committente

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FfBrfgeSf2pxqDmpvhyi1u"
```

---

### Task 5: Cache offline del censimento AcquaLatina

**Files:**
- Create: `app/api/r/[token]/censimento-master/route.ts`
- Create: `lib/offline/censimentoMaster.ts`

Il blocco offline vale **solo se la cache c'è** (decisione 5): la cache diventa il fattore che decide se si lavora, quindi va scaricata prima di arrivare davanti al contatore.

- [ ] **Step 1: La route**

Specchia `app/api/r/[token]/censimento/route.ts`: gate leggero sul token (è dato di riferimento, non si guarda lo stato), `?v=<versione>` → `{ unchanged: true }` se coincide, altrimenti la proiezione completa.

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { masterAttivi, proiezioneCompleta, versioneCensimento } from '@/lib/acqualatina/censimentoMaster';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: rap } = await supabaseAdmin.from('rapportini').select('id').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const masterIds = await masterAttivi();
  const versione = await versioneCensimento(masterIds);
  if ((new URL(req.url).searchParams.get('v') ?? '') === versione)
    return NextResponse.json({ unchanged: true, versione });

  return NextResponse.json({ unchanged: false, versione, righe: await proiezioneCompleta(masterIds) });
}
```

- [ ] **Step 2: Il modulo di cache**

Copia fedele di `lib/offline/censimento.ts` con `CHIAVE = 'acqualatina'` (lo store `dbCensimento` è già indicizzato per chiave arbitraria: nessuna modifica a `lib/offline/db.ts`) e `RigaMaster` invece di `CensitoMisuratore`.

```ts
import { dbCensimento, indexedDbDisponibile } from './db';
import type { RigaMaster } from '@/lib/acqualatina/lookupMaster';

/** Chiave STABILE della cache (non il token del giorno → riuso cross-giorno). */
const CHIAVE = 'acqualatina';

export async function leggiCensimentoMasterLocale(): Promise<{ versione: string; righe: RigaMaster[] } | undefined> { /* come censimento.ts */ }
export async function salvaCensimentoMasterLocale(versione: string, righe: RigaMaster[], now: number): Promise<void> { /* idem */ }
/** Best-effort, solo ONLINE. No-op offline / senza IndexedDB / su errore. NON lancia mai. */
export async function aggiornaCensimentoMaster(token: string): Promise<void> { /* fetch /censimento-master?v= */ }
```

- [ ] **Step 3: Allinea la cache all'APERTURA DEL RAPPORTINO, non del passo ricerca**

In `components/modules/rapportini/RapportinoForm.tsx` chiama `void aggiornaCensimentoMaster(token)` in un `useEffect` di mount. Motivo: oggi `aggiornaCensimento` (ACEA) parte quando si apre il passo «Cerca matricola», cioè quando l'operatore è già davanti al contatore — e se lì è offline la cache resta vuota. Il rapportino invece si apre in ufficio o in auto, sotto rete.

- [ ] **Step 4: Verifica tipi/lint + commit**

```bash
git add "app/api/r/[token]/censimento-master/route.ts" lib/offline/censimentoMaster.ts components/modules/rapportini/RapportinoForm.tsx
git commit -m "feat(acqualatina): cache offline del censimento, allineata all'apertura del rapportino

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FfBrfgeSf2pxqDmpvhyi1u"
```

---

### Task 6: `CercaMatricolaAcqualatina` — blocco secco e doppio tocco

**Files:**
- Create: `components/modules/rapportini/acqualatina/CercaMatricolaAcqualatina.tsx`

Componente **nuovo**, non un ramo di `CercaMatricolaLimitazione`: quello ha semantica opposta (blocco morbido, «Inserisci a mano questa matricola», conflitto altro operatore, anti-duplicato ACEA) ed è in produzione. Si riusano `ScannerMisuratore`, `matchVociMatricola`, `autofillAnagrafica`.

- [ ] **Step 1: Il comportamento, stato per stato**

| Verdetto | Cosa si vede | Si può procedere? |
|---|---|---|
| task già tuo (`matchVociMatricola` sulle voci non rifiutate) | apre quella voce | — |
| `letterale` | autofill immediato, passo successivo | sì, senza chiedere |
| `conferma`, 1 candidato | scheda: matricola piena, indirizzo, comune, **ODL** → «È questo il misuratore?» Sì/No | sì, dopo il **secondo tocco** |
| `conferma`, N candidati | elenco (matricola · indirizzo · ODL) → tocca uno → la scheda di sopra | sì, dopo la scelta **e** la conferma |
| `ambiguo` | riquadro rosso: «Più ordini sulla stessa matricola (ODL …) — contatta l'ufficio» | **no** |
| `assente` | riquadro rosso: «Misuratore non censito — non eseguire l'intervento, contatta l'ufficio» | **no** |
| offline, cache presente | stesso verdetto calcolato in locale con `lookupMaster` | come sopra, blocco incluso |
| offline, cache assente | banner giallo: «Censimento non disponibile: la matricola verrà verificata alla sincronizzazione» + inserimento a mano | sì, **con riserva** |

- [ ] **Step 2: I due «No» non sono un annulla**

Su «No, non corrisponde» dalla scheda di conferma si ricade sul blocco (`assente`) con il testo diagnostico: «letta `<q>`, il master proponeva `<matricola>` in `<indirizzo>` — contatta l'ufficio». Non si torna alla lista candidati: se l'operatore ha detto che non è quell'impianto, riproporgli gli altri lo invita a cercarne uno che «somigli».

- [ ] **Step 3: Nel blocco NON ci sono bottoni per procedere**

Solo «Indietro». Nessun «Procedi comunque», nessun «Inserisci a mano» — è il bottone che oggi, sul percorso ACEA, produce gli interventi senza ODL assegnabile (decisione 1). L'unica eccezione è la riga «offline senza cache» della tabella sopra.

- [ ] **Step 4: Design**

`DESIGN.md` §7quater (variante campo): comandi ≥48px, `font-mono tabular-nums` sulle matricole, focus ring su ogni bottone, colori solo da token (`--danger`, `--danger-soft`, `--warning`, `--warning-soft`). Riusa il primitivo `Button`; le righe-elenco restano `<button>` a mano come in `CercaMatricolaLimitazione` (contenuto su due colonne a piena larghezza).

- [ ] **Step 5: Verifica tipi/lint + commit**

```bash
git add components/modules/rapportini/acqualatina/CercaMatricolaAcqualatina.tsx
git commit -m "feat(acqualatina): passo cerca matricola con blocco secco e doppia conferma

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FfBrfgeSf2pxqDmpvhyi1u"
```

---

### Task 7: AcquaLatina nel `+`

**Files:**
- Modify: `lib/interventi/manuali/types.ts`, `attivitaPerCommittente.ts`, `anagraficaValida.ts`
- Modify: `components/modules/rapportini/ModaleInterventoManuale.tsx`

- [ ] **Step 1: Il tipo**

```ts
export type CommittenteManuale = 'acea' | 'italgas' | 'altro' | 'lim_massive' | 'acqualatina';
```

Il CHECK del DB **è già pronto**: `20260727130000_acqualatina_commessa.sql` ha allargato `interventi_manuali_committente_check` e `interventi_committente_check` a `'acqualatina'`. Nessuna migration.

- [ ] **Step 2: Attività di default**

```ts
const ATTIVITA: Partial<Record<CommittenteManuale, string>> = {
  lim_massive: 'LIMITAZIONI MASSIVE',
  acqualatina: 'SOSTITUZIONE MISURATORI',
};
```

`opzioniAttivitaManuale` funziona **senza modifiche**: `committenteEquivalente('acqualatina')` restituisce `'acqualatina'` (passa-attraverso; solo `lim_massive` viene mappato su `acea`) e la tassonomia ha già le righe AcquaLatina inserite dalla migration della commessa.

- [ ] **Step 3: Anagrafica valida**

AcquaLatina entra nel ramo permissivo di `lim_massive` (basta un identificativo, l'indirizzo non è obbligatorio): `template_master_righe.indirizzo` e `comune` sono nullable, e una riga con matricola e ODL ma senza indirizzo passerebbe il blocco per poi essere rifiutata dalla validazione. L'identificativo di questa commessa è la matricola; l'ODL arriva dal master.

```ts
if (committente === 'lim_massive' || committente === 'acqualatina') return hasId;
```

- [ ] **Step 4: Il quarto bottone e il passo ricerca**

In `ModaleInterventoManuale.tsx`:

```ts
const COMMITTENTI: { value: CommittenteManuale; label: string }[] = [
  { value: 'italgas', label: 'Italgas' },
  { value: 'lim_massive', label: 'Limitazioni massive' },
  { value: 'acqualatina', label: 'AcquaLatina' },
  { value: 'altro', label: 'Altro' },
];
```

Il passo ricerca si sdoppia per committente — due componenti, due semantiche:

```ts
const passoCercaAcea = step === 2 && committente === 'lim_massive' && !cercaFatta;
const passoCercaAcqua = step === 2 && committente === 'acqualatina' && !cercaFatta;
const passoCerca = passoCercaAcea || passoCercaAcqua;   // il footer resta vuoto in entrambi
```

Nel render, `passoCercaAcqua` monta `CercaMatricolaAcqualatina` con `onTrovato`/`onApriAssegnato`/`onIndietro` come l'altro; `onManuale` **solo** nel caso offline-senza-cache.

- [ ] **Step 5: Nessun template nuovo**

Da verificare a schermo, non da costruire: `risolviTemplateCommittente('acqualatina', …)` restituisce `null` perché il template `ACQUALATINA SOSTITUZIONE MISURATORI` ha `committente=null` e `solo_manuale=false` (quindi `caricaTemplateManuali`, che filtra `solo_manuale=true`, non lo carica). Con `override` vuoto la modale **eredita `campiStandard`**, cioè il template del rapportino — che per un operatore AcquaLatina è esattamente quello giusto. È il comportamento documentato nel codice: *«Vuoto ⇒ eredita lo standard → modifico lo standard, segue il +»*. `template_id` resta `null` sulla richiesta (colonna nullable).

- [ ] **Step 6: Verifica tipi/lint + commit**

`npx tsc --noEmit` va guardato con attenzione qui: allargare `CommittenteManuale` fa emergere ogni `Record<CommittenteManuale, …>` non parziale. Sistemare i punti che il compilatore segnala, senza cambiare comportamento per gli altri tre committenti.

```bash
git add lib/interventi/manuali/types.ts lib/interventi/manuali/attivitaPerCommittente.ts lib/interventi/manuali/anagraficaValida.ts components/modules/rapportini/ModaleInterventoManuale.tsx
git commit -m "feat(acqualatina): il + offre il committente e il suo passo di ricerca

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FfBrfgeSf2pxqDmpvhyi1u"
```

---

### Task 8: Ri-verifica del master al POST (il verdetto duro)

**Files:**
- Modify: `app/api/r/[token]/intervento-manuale/route.ts`
- Modify: `lib/offline/syncPlan.ts` (+ test)

È la seconda metà della decisione 5: se l'operatore ha proceduto offline senza cache, il verdetto vero lo dà il server all'invio. Meccanismo già collaudato — è esattamente quello che fa l'anti-duplicato ACEA, e il commento in `leggiVerdettoEsecuzione` spiega perché serve: *«la ricerca puo essere avvenuta molto prima dell'invio effettivo»*.

- [ ] **Step 1: Il blocco nella route**

Accanto al blocco `COMMITTENTI_BLOCCO_ESECUZIONE` esistente (che resta ACEA-only), per `committente === 'acqualatina'`:

```ts
if (committente === 'acqualatina') {
  const matricolaQ = String((anagrafica as { matricola?: unknown }).matricola ?? '').trim();
  const masterIds = await masterAttivi();
  const verdetto = lookupMaster(matricolaQ, await candidatiPerRicerca(matricolaQ, masterIds));
  if (verdetto.esito === 'assente' || verdetto.esito === 'ambiguo') {
    return NextResponse.json({
      error: 'misuratore_non_censito',
      dettaglio: verdetto.esito === 'ambiguo'
        ? "Più ordini sulla stessa matricola: contatta l'ufficio."
        : "Misuratore non censito nel master AcquaLatina: contatta l'ufficio.",
    }, { status: 400 });
  }
}
```

**400 e non 409**, deliberatamente: `classificaEsito` dà a ogni 409 il motivo generico «Link scaduto o non più modificabile» — sbagliato e fuorviante per questo caso (è la ruga che l'anti-duplicato ACEA si porta già). Sul **400** il sync legge il corpo tramite `motivoManuale400` e mostra il motivo vero.

- [ ] **Step 2: Estendi `motivoManuale400`**

Oggi passa solo `attivita_obbligatoria` e `attivita_sconosciuta`:

```ts
const CODICI = new Set(['attivita_obbligatoria', 'attivita_sconosciuta', 'misuratore_non_censito']);
export function motivoManuale400(body: { error?: string; messaggio?: string; dettaglio?: string } | null): string | null {
  if (!body || !body.error || !CODICI.has(body.error)) return null;
  return messaggioErroreManuale(body, 400);
}
```

Verificare che `messaggioErroreManuale` renda il campo `dettaglio`; se legge solo `messaggio`, mandare il testo in `messaggio`.

- [ ] **Step 3: Test**

Aggiungi a `lib/offline/syncPlan.test.ts` (o crea il caso): `motivoManuale400({ error: 'misuratore_non_censito', dettaglio: '…' })` non è `null`. L'item di coda finisce `stato:'bloccato'` con quel motivo ed è escluso dai sync successivi (`.filter(i => i.stato !== 'bloccato')`) — nessun ritentativo infinito.

- [ ] **Step 4: Verifica + commit**

```bash
git add "app/api/r/[token]/intervento-manuale/route.ts" lib/offline/syncPlan.ts lib/offline/syncPlan.test.ts
git commit -m "feat(acqualatina): il server ri-verifica il master all'invio e blocca con motivo leggibile

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FfBrfgeSf2pxqDmpvhyi1u"
```

---

### Task 9: «Da assegnare» — export e spunta massiva

**Files:**
- Create: `app/api/admin/interventi-manuali/da-assegnare/route.ts`
- Modify: `app/api/admin/interventi-manuali/route.ts`, `components/modules/lista-attesa/RegistroAutorizzazioni.tsx`

L'approvazione **non cambia**: `stato` va a `approvato` e l'intervento nasce lì, con `stato:'completato'`. «Da assegnare» è la riga approvata con `assegnato_committente_at IS NULL`.

- [ ] **Step 1: Esponi la colonna**

`app/api/admin/interventi-manuali/route.ts`: aggiungi `assegnato_committente_at` alla select e al tipo `RigaRichiesta` in `lib/interventi/manuali/types.ts`.

- [ ] **Step 2: `GET /da-assegnare` → export XLSX**

`requireAdmin` come gli altri endpoint admin. Filtro: `stato='approvato' AND assegnato_committente_at IS NULL`, opzionalmente per committente e intervallo date. Colonne: **ODL**, **operatore destinatario** (`staff_name`), matricola, indirizzo, comune, data, committente. ExcelJS, come `buildTemplateImport`.

L'operatore destinatario è `staff_name` della richiesta: chi ha eseguito il cambio è chi deve risultare assegnatario sul sistema del committente. ODL e matricola stanno in `dati_correnti.anagrafica`.

- [ ] **Step 3: `POST /da-assegnare` → spunta massiva**

Corpo `{ ids: string[] }`. Aggiorna `assegnato_committente_at = now()` **solo** sulle righe `stato='approvato' AND assegnato_committente_at IS NULL` (guard nella `.eq()`, come il check-and-set dell'approvazione: due backoffice che spuntano insieme non si pestano). Risponde con quante righe hanno cambiato stato.

- [ ] **Step 4: UI nel registro**

In `RegistroAutorizzazioni.tsx` — dove ci sono già filtro stato, `StatoBadge` ed export:
- badge **«Da assegnare»** (tono `warn`) sulle righe approvate con timestamp nullo, derivato, non un valore di `stato`;
- voce **«Da assegnare»** nel filtro stato (filtro derivato, non un nuovo `StatoRichiesta`);
- bottone **«Esporta da assegnare»** accanto all'export esistente;
- selezione multipla + **«Segna come assegnati»**, abilitato solo con almeno una riga selezionata, con `window.confirm` che dice quante righe.

- [ ] **Step 5: Verifica + commit**

```bash
git add app/api/admin/interventi-manuali/da-assegnare/route.ts app/api/admin/interventi-manuali/route.ts lib/interventi/manuali/types.ts components/modules/lista-attesa/RegistroAutorizzazioni.tsx
git commit -m "feat(acqualatina): coda da assegnare - export e spunta massiva nel registro

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FfBrfgeSf2pxqDmpvhyi1u"
```

---

## Verifica finale

- [ ] `npx vitest run lib/acqualatina/lookupMaster.test.ts lib/offline/syncPlan.test.ts` → PASS.
- [ ] `npx tsc --noEmit` → solo i 2 errori baseline su `.next/types/.../template-rapportini`.
- [ ] `npx eslint` sui file toccati → 0 errori, 0 warning.
- [ ] **Il percorso ACEA è intatto**: `git diff` non tocca `cerca-limitazione`, `censimento/route.ts`, `CercaMatricolaLimitazione.tsx`, `limitazione_misuratori_ref`. Smoke: un `+` «Limitazioni massive» su una matricola non censita mostra ancora «Inserisci a mano questa matricola».
- [ ] **Smoke campo** (rapportino AcquaLatina, tema chiaro e scuro):
  - matricola del master scritta identica → nessuna domanda, si va ai dati con ODL, via, comune, CAP compilati e calibro DN15;
  - stessa matricola con un trattino in più → scheda di conferma, si procede solo dopo il secondo tocco;
  - matricola senza il prefisso del master → compare fra i candidati, poi conferma;
  - matricola inventata → riquadro rosso, **nessun bottone per procedere**, solo «Indietro»;
  - «No, non corrisponde» sulla scheda → blocco col testo diagnostico, non ritorno alla lista.
- [ ] **Smoke offline**: DevTools offline con cache scaricata → stesso blocco dell'online. Storage IndexedDB svuotato e offline → banner giallo, si procede, e al ritorno online l'item di coda diventa «da risolvere» con «Misuratore non censito…».
- [ ] **Smoke backoffice**: approva una richiesta AcquaLatina → badge «Da assegnare», compare nell'export con ODL e operatore; spunta massiva → il badge sparisce e la riga resta `approvato`. L'intervento è in Storico come completato da subito.

## Fuori scope

- **Anti-duplicato per AcquaLatina.** `COMMITTENTI_BLOCCO_ESECUZIONE` resta `['acea','lim_massive']`: un misuratore già sostituito non viene bloccato sul percorso AcquaLatina. È una scelta, non una dimenticanza — il blocco «già eseguito» ha una sua semantica ACEA (esito `eseguito_positivo` sugli interventi, `eseguito=SI` sulle voci) che va validata sui dati AcquaLatina prima di attivarla.
- **Automazione dell'assegnazione** sul sistema AcquaLatina. Resta manuale, fuori app: il committente non ha un cruscotto pilotabile come ACEA (`assegna-odl.mjs`). Quando ce l'avrà, valorizzerà lo stesso `assegnato_committente_at`.
- **Segnalazione tracciata del misuratore non censito.** Il blocco è secco e finisce lì: nessuna coda, nessuno stato, nessuna notifica. Costo accettato in sede di decisione: la deroga passa dal telefono e non compare nei dati.
- **Filtro del `+` per committente del rapportino.** I quattro bottoni si vedono tutti, anche a un operatore che sta su un altro committente. Sfrondare quella lista in base al rapportino è un lavoro a sé, che riguarda anche gli altri tre.
- **`pdr` e `nominativo`** nell'autofill AcquaLatina: il master non li porta e la commessa non li usa.
- **Blocco anche quando `template_master` non ha nessun file attivo per il committente**: oggi si comporta come «assente» (si blocca tutto). Se l'ufficio spegne per errore l'unico master, il campo si ferma. Un avviso in `/impostazioni/template-master` («questo è l'unico master attivo di AcquaLatina») è un miglioramento a parte.
