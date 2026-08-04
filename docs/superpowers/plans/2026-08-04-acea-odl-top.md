# ODL TOP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** l'ufficio marca ODL come TOP dalla tabella del dunning ACEA e l'operatore se li trova evidenziati e in cima nel rapportino.

**Architecture:** un booleano `top` sul registro (`acea_ordini`), scritto in blocco da una rotta admin e letto **live** — sia dalla tabella d'ufficio sia dalla pagina dell'operatore, che risolve gli ODL delle sue voci contro il registro a ogni caricamento. Niente snapshot nella voce: il flag deve valere anche sugli ODL già in mano all'operatore.

**Tech Stack:** Next.js 15 (App Router, server components), Supabase/PostgREST, TypeScript, Vitest, Tailwind v4 con token `--status-*`.

## Global Constraints

- Spec di riferimento: `docs/superpowers/specs/2026-08-04-acea-odl-top-design.md`.
- La colonna `top` va su **entrambe** le tabelle del registro (`acea_ordini` e `acqualatina_ordini`): `app/api/acea/ordini/route.ts` usa una sola lista di colonne per leggerle, e aggiungerla a una sola spegne l'altra.
- **Rosso vietato** per il TOP: nel dunning significa già revoca da verificare e ordine scaduto. Si usa ambra (`--status-warn-soft`) **più** un badge testuale «TOP»: il significato non deve dipendere dalla sola tinta.
- Regola ODL multi-operazione: **almeno una riga TOP ⇒ la voce è TOP**.
- La lettura del TOP lato operatore è **accessoria e resiliente**: se fallisce, niente badge e il rapportino funziona lo stesso.
- Ordinamento TOP-first **stabile**: dentro il gruppo TOP resta l'ordine del giro.
- Lingua di codice, commenti e UI: italiano, come tutto il repo.
- Test: Vitest. Comando singolo file: `npx vitest run <percorso> --reporter=dot`.
- Repo **pubblico**: mai dati di produzione (matricole, ODL veri, nomi) in codice, test o commit.

---

### Task 1: La colonna sul registro

**Files:**
- Create: `supabase/migrations/20260804110000_acea_ordini_top.sql`
- Create: `lib/acea/topMigrationShape.test.ts`
- Modify: `lib/acea/colonneTabella.ts` (tipo `RigaTabella`)
- Modify: `app/api/acea/ordini/route.ts` (costante `COLONNE`)

**Interfaces:**
- Consumes: niente (primo task).
- Produces: colonna DB `top boolean not null default false` su `acea_ordini` e `acqualatina_ordini`; campo `top?: boolean` su `RigaTabella`, servito dalla GET del registro.

- [ ] **Step 1: Scrivi il test di forma della migration**

`lib/acea/topMigrationShape.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20260804110000_acea_ordini_top.sql'),
  'utf8',
).replace(/--[^\n]*/g, '');

describe('migrazione TOP', () => {
  it('la colonna nasce su ENTRAMBE le tabelle del registro', () => {
    // La select di app/api/acea/ordini/route.ts è UNA per due tabelle: metterla solo di qua
    // farebbe fallire la query dell'altra, cioè spegnerebbe il registro AcquaLatina.
    expect(sql).toMatch(/alter table public\.acea_ordini\s+add column if not exists top boolean/i);
    expect(sql).toMatch(/alter table public\.acqualatina_ordini\s+add column if not exists top boolean/i);
  });

  it('default false e not null: «non TOP» non è un buco, è lo stato normale', () => {
    const occorrenze = sql.match(/top boolean not null default false/gi) ?? [];
    expect(occorrenze).toHaveLength(2);
  });

  it("l'indice è PARZIALE: le righe TOP sono poche decine su migliaia", () => {
    const idx = sql.match(/create index if not exists acea_ordini_top_idx[\s\S]*?;/i)?.[0] ?? '';
    expect(idx).not.toBe('');
    expect(idx).toMatch(/where top/i);
  });

  it('è additiva e rieseguibile: nessun drop, nessuna riga toccata', () => {
    expect(sql).not.toMatch(/drop column/i);
    expect(sql).not.toMatch(/\bupdate\b/i);
  });

  it("l'import di ACEA non deve conoscere il TOP: è una colonna NOSTRA", () => {
    /*
      È la ragione per cui il flag sopravvive al reimport: `applicaImport` scrive solo le colonne
      che arrivano dall'export del committente. Il giorno che qualcuno ci infilasse `top`, ogni
      import azzererebbe le marcature dell'ufficio senza dire niente — esattamente come già
      accade, per costruzione, agli ordini annullati.
    */
    const importer = readFileSync(resolve(__dirname, './applicaImport.ts'), 'utf8');
    expect(importer).not.toMatch(/\btop\b/);
  });
});
```

- [ ] **Step 2: Lancia il test e verifica che FALLISCA**

Run: `npx vitest run lib/acea/topMigrationShape.test.ts --reporter=dot`
Expected: FAIL — `ENOENT: no such file or directory ... 20260804110000_acea_ordini_top.sql`

- [ ] **Step 3: Scrivi la migration**

`supabase/migrations/20260804110000_acea_ordini_top.sql`:

```sql
-- Gli ODL che ACEA segnala come TOP.
--
-- ACEA indica certe attività come prioritarie. Finora quella segnalazione moriva in ufficio —
-- arrivava per telefono, chi pianificava se la ricordava, e l'operatore apriva il rapportino
-- trovando una voce identica a tutte le altre. L'unico canale era la colonna `note`, che è prosa
-- libera: buona per «citofonare interno 4», inadatta a una proprietà su cui si vuole ordinare.
--
-- Booleano e non un livello di priorità: ACEA dice TOP o non dice niente, e inventare una scala
-- che il committente non usa vorrebbe dire tenerne allineata una che nessuno popola.
--
-- SU ENTRAMBE LE TABELLE, e non è simmetria estetica: `app/api/acea/ordini/route.ts` legge i due
-- registri con UNA sola lista di colonne. Aggiungerla solo qui farebbe fallire la query di là,
-- cioè spegnerebbe il registro AcquaLatina. Il bottone per marcare resta comunque sulle sole
-- viste ACEA: di là la colonna esiste e vale `false`.
alter table public.acea_ordini
  add column if not exists top boolean not null default false;

alter table public.acqualatina_ordini
  add column if not exists top boolean not null default false;

comment on column public.acea_ordini.top is
  'Ordine segnalato TOP da ACEA: evidenziato in tabella e in cima al rapportino dell''operatore.';

-- La domanda è sempre «quali di questi ODL sono TOP»: indice PARZIALE, perché le righe marcate
-- sono poche decine su migliaia e le altre non hanno niente da dire a questa domanda.
create index if not exists acea_ordini_top_idx
  on public.acea_ordini (odl)
  where top;

create index if not exists acqualatina_ordini_top_idx
  on public.acqualatina_ordini (odl)
  where top;
```

- [ ] **Step 4: Lancia il test e verifica che PASSI**

Run: `npx vitest run lib/acea/topMigrationShape.test.ts --reporter=dot`
Expected: PASS (4 test)

- [ ] **Step 5: Aggiungi il campo al tipo di riga**

In `lib/acea/colonneTabella.ts`, dentro `export type RigaTabella = {`, subito dopo il campo `note`:

```ts
  /**
   * Segnalato TOP da ACEA: da lavorare per primo. Lo marca l'ufficio in blocco dalla selezione,
   * e l'operatore se lo ritrova evidenziato e in cima alle voci del rapportino. Opzionale: il
   * registro c'era prima di questa colonna.
   */
  top?: boolean;
```

- [ ] **Step 6: Chiedi la colonna nella GET del registro**

In `app/api/acea/ordini/route.ts`, nella costante `COLONNE`, sulla riga che elenca `'testo_ordine', 'centro_lavoro', 'note',` aggiungi `'top'` in coda:

```ts
  'testo_ordine', 'centro_lavoro', 'note', 'top',
```

- [ ] **Step 7: Applica la migration in produzione**

⚠️ Additiva: si può applicare **prima** del deploy senza rompere il codice vecchio (che semplicemente ignora la colonna). L'inverso — droppare prima del deploy — è la trappola già pagata il 04/08.

Applicare con il tool Supabase MCP `apply_migration`, nome `acea_ordini_top`, progetto `aceztqfebringeaebvce`, corpo identico al file.

Verifica: `select count(*) from information_schema.columns where table_schema='public' and table_name in ('acea_ordini','acqualatina_ordini') and column_name='top'` → deve dare `2`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260804110000_acea_ordini_top.sql lib/acea/topMigrationShape.test.ts lib/acea/colonneTabella.ts app/api/acea/ordini/route.ts
git commit -m "feat(acea): la colonna top sul registro ordini"
```

---

### Task 2: Le funzioni pure

**Files:**
- Create: `lib/acea/top.ts`
- Create: `lib/acea/top.test.ts`

**Interfaces:**
- Consumes: niente.
- Produces:
  - `normOdlTop(v: string | null | undefined): string` — ODL normalizzato per il confronto.
  - `odlTop(righe: readonly { odl: string | null; top?: boolean | null }[]): Set<string>`
  - `ordinaTopPrima<T extends { top?: boolean }>(righe: readonly T[]): T[]` — stabile.

- [ ] **Step 1: Scrivi i test**

`lib/acea/top.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { odlTop, ordinaTopPrima } from './top';

describe('odlTop', () => {
  it('prende solo gli ODL marcati', () => {
    const set = odlTop([
      { odl: '111', top: true },
      { odl: '222', top: false },
      { odl: '333', top: null },
    ]);
    expect([...set]).toEqual(['111']);
  });

  it('basta UNA riga TOP: un ODL può avere più operazioni', () => {
    // La chiave del registro è (odl, numero_operazione), ma l'operatore ha in mano il solo ODL.
    // Se marcarne una non bastasse, l'ufficio dovrebbe sapere quale operazione scegliere.
    const set = odlTop([
      { odl: '444', top: false },
      { odl: '444', top: true },
    ]);
    expect(set.has('444')).toBe(true);
  });

  it('ignora gli ODL vuoti e normalizza spazi e maiuscole', () => {
    const set = odlTop([
      { odl: null, top: true },
      { odl: '  ', top: true },
      { odl: ' 555 ', top: true },
    ]);
    expect([...set]).toEqual(['555']);
  });
});

describe('ordinaTopPrima', () => {
  it('i TOP salgono in cima', () => {
    const righe = [
      { id: 'a', top: false },
      { id: 'b', top: true },
      { id: 'c', top: false },
    ];
    expect(ordinaTopPrima(righe).map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it("è STABILE: dentro ogni gruppo resta l'ordine del giro", () => {
    // L'ordine di partenza è quello geografico con cui l'operatore si muove: rimescolarlo
    // dentro il gruppo TOP gli farebbe fare chilometri in più per obbedire al badge.
    const righe = [
      { id: 'a', top: true },
      { id: 'b', top: false },
      { id: 'c', top: true },
      { id: 'd', top: false },
    ];
    expect(ordinaTopPrima(righe).map((r) => r.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('senza TOP non cambia niente, e non muta la lista in ingresso', () => {
    const righe = [{ id: 'a' }, { id: 'b' }];
    const fuori = ordinaTopPrima(righe);
    expect(fuori.map((r) => r.id)).toEqual(['a', 'b']);
    expect(fuori).not.toBe(righe);
  });
});
```

- [ ] **Step 2: Lancia i test e verifica che FALLISCANO**

Run: `npx vitest run lib/acea/top.test.ts --reporter=dot`
Expected: FAIL — `Failed to resolve import "./top"`

- [ ] **Step 3: Scrivi il modulo**

`lib/acea/top.ts`:

```ts
// PURA: gli ODL segnalati TOP da ACEA, e l'ordine in cui vanno letti.
//
// Il flag vive sul registro (`acea_ordini.top`) e NON viene fotografato dentro la voce del
// rapportino: deve valere anche sugli ODL già in mano all'operatore, che è il caso per cui la
// funzione esiste — ACEA segnala un ordine urgente a giro già partito.

/** ODL confrontabile: il registro e le voci non sono sempre scritti con gli stessi spazi. */
export function normOdlTop(v: string | null | undefined): string {
  return String(v ?? '').trim().toUpperCase();
}

/**
 * Gli ODL marcati, da righe di registro.
 *
 * Regola dell'OR: la chiave del registro è `(odl, numero_operazione)` e lo stesso ODL può avere
 * più righe. Ne basta UNA marcata — altrimenti l'ufficio dovrebbe sapere quale operazione
 * scegliere, che è esattamente la domanda che questa funzione toglie di mezzo.
 */
export function odlTop(
  righe: readonly { odl: string | null; top?: boolean | null }[],
): Set<string> {
  const set = new Set<string>();
  for (const r of righe) {
    if (r.top !== true) continue;
    const k = normOdlTop(r.odl);
    if (k !== '') set.add(k);
  }
  return set;
}

/**
 * I TOP davanti, gli altri dietro, senza rimescolare né gli uni né gli altri.
 *
 * La stabilità è il punto: l'ordine di partenza è quello del giro, cioè quello geografico con cui
 * l'operatore si muove. Un sort che riordinasse dentro il gruppo gli farebbe fare chilometri in
 * più per obbedire a un badge.
 */
export function ordinaTopPrima<T extends { top?: boolean }>(righe: readonly T[]): T[] {
  return [...righe.filter((r) => r.top === true), ...righe.filter((r) => r.top !== true)];
}
```

- [ ] **Step 4: Lancia i test e verifica che PASSINO**

Run: `npx vitest run lib/acea/top.test.ts --reporter=dot`
Expected: PASS (6 test)

- [ ] **Step 5: Commit**

```bash
git add lib/acea/top.ts lib/acea/top.test.ts
git commit -m "feat(acea): funzioni pure del flag TOP"
```

---

### Task 3: La rotta che marca

**Files:**
- Create: `app/api/acea/ordini/top/route.ts`
- Modify: `lib/audit/registra.ts` (union `NomeAzione`)

**Interfaces:**
- Consumes: `PROFILO_COMMESSA`/`parseFamiglia` da `lib/acea/famiglia`, `requireAdmin` da `lib/apiAuth`, `registraAzione`/`attoreDa` da `lib/audit/registra`.
- Produces: `POST /api/acea/ordini/top`, corpo `{ chiavi: string[]; top: boolean; famiglia?: string }`, risposta `{ ok: true, aggiornati: number, top: boolean }`.

- [ ] **Step 1: Aggiungi il nome azione all'audit**

In `lib/audit/registra.ts`, nella union `NomeAzione`, dopo `'rapportino.conflitto.sostituisci'`:

```ts
  | 'ordine.top';
```

(la riga precedente perde il `;` finale e prende un `|`, come le altre)

- [ ] **Step 2: Scrivi la rotta**

`app/api/acea/ordini/top/route.ts`:

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { PROFILO_COMMESSA, parseFamiglia } from '@/lib/acea/famiglia';
import { attoreDa, registraAzione } from '@/lib/audit/registra';

export const runtime = 'nodejs';

/**
 * POST /api/acea/ordini/top — segna (o toglie) il TOP su un blocco di righe.
 *
 * Corpo: `{ chiavi: ['odl|numero_operazione', …], top: boolean }`. La chiave è la stessa di
 * `/api/acea/celle`: il registro ha chiave composta, e le due rotte devono parlare la stessa
 * lingua o l'ufficio si trova due formati per lo stesso gesto.
 *
 * Stessa platea del resto della scrittura d'ufficio sul registro: `requireAdmin`.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const corpo = (await req.json().catch(() => ({}))) as {
      chiavi?: unknown; top?: unknown; famiglia?: unknown;
    };
    const chiavi = (Array.isArray(corpo.chiavi) ? corpo.chiavi : [])
      .map((v) => String(v ?? '').trim())
      .filter((v) => v.includes('|'));
    if (chiavi.length === 0) {
      return NextResponse.json({ error: 'Nessun ordine selezionato.' }, { status: 400 });
    }
    const top = corpo.top === true;
    const profilo = PROFILO_COMMESSA[parseFamiglia(corpo.famiglia)];

    // Una UPDATE per riga: la chiave è composta e PostgREST non sa esprimere un `in` su coppie.
    // Sono decine di righe per gesto, non migliaia — la stessa scelta fatta in `/api/acea/celle`.
    let aggiornati = 0;
    for (const chiave of chiavi) {
      const [odl, operazione] = chiave.split('|');
      const { data, error } = await supabaseAdmin
        .from(profilo.tabellaOrdini)
        .update({ top })
        .eq('odl', odl)
        .eq('numero_operazione', operazione)
        .select('odl');
      if (error) throw error;
      aggiornati += (data ?? []).length;
    }

    /*
      L'audit non è decorazione: «chi ha messo TOP su questo ordine?» è la domanda che arriva
      giorni dopo, e senza una riga qui la risposta sarebbe di nuovo «non si può sapere».
      `registraAzione` ingoia i suoi errori: un log rotto non deve far fallire la marcatura.
    */
    await registraAzione({
      azione: 'ordine.top',
      attore: attoreDa(auth.user),
      entita: 'acea_ordini',
      esito: 'ok',
      statoHttp: 200,
      dettaglio: { top, n: aggiornati, odl: chiavi.map((c) => c.split('|')[0]) },
      req,
    });

    return NextResponse.json({ ok: true, aggiornati, top });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore marcatura TOP.' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Verifica che il progetto compili**

Run: `npx tsc --noEmit`
Expected: nessun errore fuori da `.next/types` (lì restano 4 errori preesistenti di artefatti di build)

- [ ] **Step 4: Commit**

```bash
git add app/api/acea/ordini/top/route.ts lib/audit/registra.ts
git commit -m "feat(acea): rotta per segnare gli ODL come TOP"
```

---

### Task 4: L'ufficio marca e vede

**Files:**
- Modify: `components/modules/acea/BarraAzioni.tsx` (i due bottoni)
- Modify: `components/modules/acea/TabellaOrdini.tsx` (riga ambra + badge)
- Create: `lib/acea/topUiShape.test.ts`

**Interfaces:**
- Consumes: `POST /api/acea/ordini/top` (Task 3), `RigaTabella.top` (Task 1).
- Produces: nella barra della selezione due bottoni «Segna TOP» / «Togli TOP»; righe TOP in ambra con badge.

- [ ] **Step 1: Leggi la barra prima di toccarla**

Run: `rg -n "chiavi|onAnnullaSelezione|famiglia" components/modules/acea/BarraAzioni.tsx | head -40`
Serve a vedere come sono fatti i bottoni esistenti e da dove arrivano `chiavi` e `famiglia`: i due nuovi devono avere la stessa forma, non una loro.

- [ ] **Step 2: Scrivi il test di forma della UI**

`lib/acea/topUiShape.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const barra = readFileSync(
  resolve(__dirname, '../../components/modules/acea/BarraAzioni.tsx'),
  'utf8',
);
const tabella = readFileSync(
  resolve(__dirname, '../../components/modules/acea/TabellaOrdini.tsx'),
  'utf8',
);

describe('marcatura TOP dalla selezione', () => {
  it('i due bottoni esistono: si mette e si toglie', () => {
    // Senza il «Togli» una marcatura sbagliata resterebbe lì per sempre.
    expect(barra).toMatch(/Segna TOP/);
    expect(barra).toMatch(/Togli TOP/);
  });

  it("scrive sulla rotta giusta e porta la famiglia della vista", () => {
    expect(barra).toMatch(/\/api\/acea\/ordini\/top/);
    expect(barra).toMatch(/famiglia/);
  });
});

describe('evidenza TOP in tabella', () => {
  it('la riga TOP è AMBRA, mai rossa', () => {
    // Il rosso nel dunning è già revoca da verificare e ordine scaduto.
    const bloccoRiga = tabella.match(/const top = [\s\S]{0,1200}?status-warn-soft/)?.[0] ?? '';
    expect(bloccoRiga).not.toBe('');
    expect(bloccoRiga).not.toMatch(/status-ko-soft/);
  });

  it("il badge testuale c'è: il significato non dipende dal colore", () => {
    // Per chi legge in fretta e per chi i colori non li distingue.
    expect(tabella).toMatch(/>TOP</);
  });
});
```

- [ ] **Step 3: Lancia il test e verifica che FALLISCA**

Run: `npx vitest run lib/acea/topUiShape.test.ts --reporter=dot`
Expected: FAIL — «Segna TOP» non trovato

- [ ] **Step 4: Aggiungi i bottoni nella barra**

In `components/modules/acea/BarraAzioni.tsx`, accanto agli altri comandi che agiscono sulla selezione, con lo stato locale in cima al componente:

```tsx
  const [marcando, setMarcando] = useState(false);

  /**
   * Segna (o toglie) il TOP sulle righe spuntate.
   *
   * Non tocca la pianificazione: è una proprietà dell'ORDINE, non dell'uscita. Ricarica invece
   * di aggiornare a mano la riga — la tabella è virtualizzata e la sua verità è la fetch.
   */
  const segnaTop = useCallback(async (top: boolean) => {
    if (marcando || chiavi.length === 0) return;
    setMarcando(true);
    try {
      const res = await fetch('/api/acea/ordini/top', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chiavi, top, famiglia }),
      });
      const json = await res.json().catch(() => ({})) as { aggiornati?: number; error?: string };
      if (!res.ok) {
        toast.error(json.error ?? 'Marcatura TOP non riuscita.');
        return;
      }
      const n = json.aggiornati ?? chiavi.length;
      toast.success(top
        ? `${n} ${n === 1 ? 'ordine segnato' : 'ordini segnati'} TOP.`
        : `TOP tolto da ${n} ${n === 1 ? 'ordine' : 'ordini'}.`);
      onPianificato();
    } catch {
      toast.error('Marcatura TOP non riuscita (rete).');
    } finally {
      setMarcando(false);
    }
  }, [chiavi, famiglia, marcando, onPianificato]);
```

e nel JSX, dentro il gruppo dei comandi che compaiono con la selezione:

```tsx
          <Button variant="outline" size="sm" onClick={() => void segnaTop(true)} loading={marcando}>
            Segna TOP
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void segnaTop(false)} loading={marcando}>
            Togli TOP
          </Button>
```

Se `useState`/`useCallback`/`toast`/`Button` non sono già importati nel file, aggiungili agli import esistenti.

- [ ] **Step 5: Colora la riga in tabella**

In `components/modules/acea/TabellaOrdini.tsx`, nel corpo virtualizzato, subito dopo `const revoca = eRevocaDaVerificare(r);`:

```tsx
              /*
                ORDINE TOP: riga ambra, col badge accanto all'ODL.

                Ambra e non rossa: nel dunning il rosso è già revoca da verificare e scadenza
                superata, e un terzo significato sullo stesso colore non si distingue più. Il
                badge testuale accompagna sempre la tinta — il colore da solo non è
                un'informazione per chi non lo vede.
              */
              const top = r.top === true;
```

e nella catena delle classi della riga, fra la selezione e la revoca:

```tsx
                    scelta
                      ? 'bg-[var(--brand-primary-soft)]'
                      : revoca
                        ? 'bg-[var(--status-ko-soft)]'
                        : top
                          ? 'bg-[var(--status-warn-soft)]'
                          : 'hover:bg-[var(--brand-surface-muted)]'
```

La revoca resta **prima** del TOP: «questa riga forse non va lavorata affatto» batte «va lavorata per prima».

- [ ] **Step 6: Aggiungi il badge nella cella ODL**

Sempre in `TabellaOrdini.tsx`, dove si rende il testo della cella, per la sola colonna `odl`:

```tsx
                    {c.chiave === 'odl' && top && (
                      <span
                        className="mr-1.5 rounded-[var(--radius-sm)] bg-[var(--status-warn)] px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                        title="Segnalato TOP da ACEA: da lavorare per primo"
                      >TOP</span>
                    )}
```

- [ ] **Step 7: Lancia il test e verifica che PASSI**

Run: `npx vitest run lib/acea/topUiShape.test.ts --reporter=dot`
Expected: PASS (4 test)

- [ ] **Step 8: Guardalo davvero nel browser**

Avvia il preview (`preview_start`, config `gestione-personale`), vai su `/hub/acea`, spunta una riga, premi «Segna TOP». Attesi: toast di conferma, riga ambra col badge, e la riga resta ambra dopo un refresh (il flag è sul registro, non nello stato del client). Poi «Togli TOP» e verifica che torni bianca.

- [ ] **Step 9: Commit**

```bash
git add components/modules/acea/BarraAzioni.tsx components/modules/acea/TabellaOrdini.tsx lib/acea/topUiShape.test.ts
git commit -m "feat(acea): segna TOP dalla selezione, riga ambra in tabella"
```

---

### Task 5: L'operatore lo vede, e ce l'ha in cima

**Files:**
- Modify: `app/r/[token]/page.tsx` (lettura live + prop sulla voce)
- Modify: `components/modules/rapportini/RapportinoForm.tsx` (tipo `Voce`, mappa `RigaVoce`, ordinamento)
- Modify: `components/modules/rapportini/RapportinoLista.tsx` (tipo `RigaVoce`, pill TOP)
- Modify: `components/modules/rapportini/VoceCard.tsx` (banner TOP)
- Create: `lib/acea/topOperatoreShape.test.ts`

**Interfaces:**
- Consumes: `odlTop`, `ordinaTopPrima`, `normOdlTop` da `lib/acea/top` (Task 2); colonna `top` (Task 1).
- Produces: `Voce.top?: boolean` in `RapportinoForm`, `RigaVoce.top?: boolean` in `RapportinoLista`, prop `top?: boolean` su `VoceCard`.

- [ ] **Step 1: Scrivi il test di forma**

`lib/acea/topOperatoreShape.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pagina = readFileSync(resolve(__dirname, '../../app/r/[token]/page.tsx'), 'utf8');
const form = readFileSync(
  resolve(__dirname, '../../components/modules/rapportini/RapportinoForm.tsx'),
  'utf8',
);
const card = readFileSync(
  resolve(__dirname, '../../components/modules/rapportini/VoceCard.tsx'),
  'utf8',
);

describe('il TOP arriva all operatore', () => {
  it('la pagina lo legge DAL REGISTRO, non dalla voce', () => {
    // Fotografarlo in raw_json come la nota lo renderebbe cieco alle marcature fatte a giro
    // già partito, che sono il caso per cui la funzione esiste.
    expect(pagina).toMatch(/odlTop/);
    expect(pagina).toMatch(/from '@\/lib\/acea\/top'/);
  });

  it('la lettura è RESILIENTE: un flag decorativo non può spegnere il rapportino', () => {
    const blocco = pagina.match(/odlTop[\s\S]{0,900}/)?.[0] ?? '';
    expect(blocco).toMatch(/catch|error/);
  });

  it('le voci TOP vanno in cima, con ordinamento stabile', () => {
    expect(form).toMatch(/ordinaTopPrima/);
  });

  it('la card mostra un badge testuale, non solo un colore', () => {
    expect(card).toMatch(/TOP/);
  });
});
```

- [ ] **Step 2: Lancia il test e verifica che FALLISCA**

Run: `npx vitest run lib/acea/topOperatoreShape.test.ts --reporter=dot`
Expected: FAIL — `odlTop` non trovato in `page.tsx`

- [ ] **Step 3: Leggi il TOP nella pagina dell'operatore**

In `app/r/[token]/page.tsx`, dopo il caricamento di `vociRows` (la query su `rapportino_voci`) e accanto alle altre letture accessorie:

```tsx
  /*
    Gli ODL segnalati TOP da ACEA, letti ADESSO dal registro.

    Non viaggiano dentro la voce come la nota dell'ufficio, e di proposito: l'ufficio marca un
    ordine anche a giro già partito, e un valore fotografato all'ingresso non si aggiorna mai.
    Lettura accessoria e best-effort come le note tramandate: se salta, niente badge e il
    rapportino resta compilabile — un'evidenza non può impedire di lavorare.
  */
  const odlDaEvidenziare = new Set<string>();
  {
    const odlVoci = [...new Set(
      (vociRows ?? []).map((v) => normOdlTop(v.odl as string | null)).filter((o) => o !== ''),
    )];
    if (odlVoci.length > 0) {
      const { data: righeTop, error: eTop } = await supabaseAdmin
        .from('acea_ordini')
        .select('odl, top')
        .in('odl', odlVoci)
        .eq('top', true);
      if (eTop) console.error('[r/token] ODL TOP non letti:', eTop);
      else for (const o of odlTop((righeTop ?? []) as { odl: string | null; top?: boolean }[])) {
        odlDaEvidenziare.add(o);
      }
    }
  }
```

con l'import in testa al file:

```ts
import { normOdlTop, odlTop } from '@/lib/acea/top';
```

Poi, dove si costruisce ogni `FormVoce`, aggiungi il campo accanto a `notaUfficio`:

```ts
    top: odlDaEvidenziare.has(normOdlTop(v.odl as string | null)),
```

- [ ] **Step 4: Porta il flag fino alla lista**

In `components/modules/rapportini/RapportinoForm.tsx`:

1. nel tipo `Voce` esportato, accanto a `notaUfficio`, aggiungi:

```ts
  /** Ordine segnalato TOP da ACEA: badge e prima posizione in lista. */
  top?: boolean;
```

2. nella `useMemo` che costruisce `righe` (oggi `const righe: RigaVoce[] = useMemo(...)`), aggiungi `top: v.top` all'oggetto restituito, subito dopo `nota: v.notaUfficio,`, e avvolgi il risultato nell'ordinamento:

```ts
  const righe: RigaVoce[] = useMemo(
    () =>
      ordinaTopPrima(
        voci.map((v, idx) => {
          // …invariato…
        }),
      ),
    [voci, campi, titoloCampi, listaRapportino],
  );
```

`index` resta l'indice VERO della voce dentro `voci`, quindi `onApri(r.index)` continua ad aprire la card giusta anche dopo il riordino: si riordina la lista, non i dati.

3. import in testa:

```ts
import { ordinaTopPrima } from '@/lib/acea/top';
```

- [ ] **Step 5: Pill TOP nella riga della lista**

In `components/modules/rapportini/RapportinoLista.tsx`:

1. nel tipo `RigaVoce`, aggiungi `top?: boolean;`
2. una costante accanto alle altre pill:

```ts
const PILL_TOP = 'bg-[var(--status-warn)] text-white';
```

3. dentro `RigaVoceCard`, come **prima** pill della riga (prima di `r.annullato`):

```tsx
          {r.top && (
            <span className={`${PILL} ${PILL_TOP}`} title="Segnalato TOP da ACEA: da fare per primo">
              TOP
            </span>
          )}
```

- [ ] **Step 6: Banner TOP sulla card**

In `components/modules/rapportini/VoceCard.tsx`:

1. aggiungi `top` alla firma delle props (destrutturazione e tipo):

```ts
  top?: boolean;
```

2. subito **prima** del blocco `{notaUfficio && (`:

```tsx
      {top && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--status-warn)] bg-[var(--status-warn-soft)] px-3.5 py-2.5">
          <span className="rounded-[var(--radius-sm)] bg-[var(--status-warn)] px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">TOP</span>
          <p className="text-sm font-semibold text-[var(--brand-text-main)]">
            Segnalato da ACEA come prioritario: da fare per primo.
          </p>
        </div>
      )}
```

Prima della nota, non dopo: la priorità si legge per prima.

3. dove `VoceCard` viene usata (`VoceFocus.tsx`), passa `top={voce.top}` accanto a `notaUfficio={voce.notaUfficio}`.

- [ ] **Step 7: Lancia i test**

Run: `npx vitest run lib/acea --reporter=dot`
Expected: PASS — tutti i file `lib/acea/*.test.ts`, compresi i tre nuovi

- [ ] **Step 8: Verifica che compili e che la suite regga**

Run: `npx tsc --noEmit`
Expected: nessun errore fuori da `.next/types`

Run: `npx vitest run --reporter=dot`
Expected: tutti i test verdi (la baseline è 341 file / 3291 test, più i nuovi)

- [ ] **Step 9: Commit**

```bash
git add app/r/[token]/page.tsx components/modules/rapportini/RapportinoForm.tsx components/modules/rapportini/RapportinoLista.tsx components/modules/rapportini/VoceCard.tsx components/modules/rapportini/VoceFocus.tsx lib/acea/topOperatoreShape.test.ts
git commit -m "feat(rapportini): le voci TOP si vedono e vanno in cima"
```

---

### Task 6: Documentazione e verifica end-to-end

**Files:**
- Modify: `AGENTS.md`
- Modify: `HANDOFF.md`

**Interfaces:**
- Consumes: tutto quanto sopra.
- Produces: niente codice.

- [ ] **Step 1: Documenta la regola in AGENTS.md**

Nella sezione del modulo ACEA, dopo il paragrafo sulle note dell'ufficio:

```markdown
### ODL TOP
ACEA segnala certe attività come **TOP**. Il flag è `acea_ordini.top` (booleano), lo marca
l'ufficio **in blocco** dalla selezione della tabella (`POST /api/acea/ordini/top`, `requireAdmin`,
tracciato in `audit_azioni` come `ordine.top`).

⚠️ La colonna esiste su **entrambe** le tabelle del registro: `app/api/acea/ordini/route.ts` le
legge con una sola lista di colonne, e metterla solo su una spegne l'altra.

L'operatore lo legge **live** (`app/r/[token]/page.tsx` risolve gli ODL delle voci contro il
registro a ogni caricamento): un ordine marcato a giro già partito si vede subito. Badge testuale
+ ambra, mai rosso — nel dunning il rosso è già revoca e scaduto. Le voci TOP vanno **in cima**,
con ordinamento stabile. Regola per gli ODL multi-operazione: **almeno una riga TOP ⇒ voce TOP**.
```

- [ ] **Step 2: Aggiungi la sessione in HANDOFF.md**

Una sezione nuova in testa, sopra l'ultima, con: cosa fa la funzione, dove sta il flag, perché live e non fotografato, e il fatto che la colonna vale per due tabelle.

- [ ] **Step 3: Prova il giro completo nel browser**

Con il preview avviato:
1. `/hub/acea` → spunta due righe di uno stesso operatore → «Segna TOP» → righe ambra col badge.
2. Apri il rapportino di quell'operatore (link `/r/<token>`, oppure dal modulo Assistenza): le due voci devono avere il badge TOP ed essere **in cima**.
3. Togli il TOP a una delle due dalla tabella, ricarica la pagina dell'operatore: quella voce torna in posizione e perde il badge. È la prova che la lettura è live e non fotografata.
4. Controlla la console del browser e `preview_logs`: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md HANDOFF.md
git commit -m "docs: il flag TOP sugli ODL ACEA"
```

- [ ] **Step 5: PR**

```bash
git push -u origin feat/acea-odl-top
```

Poi apri la PR verso `main` descrivendo: cosa fa, perché il flag è live e non fotografato, che la migration è già applicata, e le verifiche fatte.
