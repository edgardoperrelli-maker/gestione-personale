# Torre: propagazione esiti + dettaglio arricchito — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Far riflettere alla torre gli esiti già registrati nei rapportini (conteggi ✅/❌ e colori), correggere l'invio rapportino perché chiuda con l'esito per-voce, e arricchire le righe del dettaglio sotto la mappa.

**Architecture:** Un mapping puro `esitoInterventoDaVoce` (riusa `voceEsitoColore`) condiviso da uno script di sync una-tantum e dalla rotta `invia`. Più una funzione pura `rigaDettaglio` per le righe arricchite. I colori riga/mappa esistono già.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase, Vitest, tsx.

**Convenzione commit:** ogni commit termina con riga vuota poi
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**Branch:** `fix/torre-esiti-e-dettaglio` (creato da main; spec già committata).
**Spec:** `docs/superpowers/specs/2026-06-03-torre-esiti-e-dettaglio-design.md`

---

## File Structure

| File | Tipo | Responsabilità |
|---|---|---|
| `lib/interventi/esitoDaVoce.ts` + test | nuovo | mapping puro voce→patch esito intervento |
| `app/api/r/[token]/invia/route.ts` | modifica | esito per-voce all'invio |
| `scripts/sync-esiti-rapportini.ts` | nuovo | propagazione una-tantum (lanciata dall'utente) |
| `lib/interventi/torreView.ts` + test | modifica | `rigaDettaglio` pura |
| `app/hub/torre/page.tsx` | modifica | query: +pdr,matricola_contatore,intervento_tipo,cap |
| `components/modules/torre/TorreControlloClient.tsx` | modifica | tipo +campi; righe dettaglio arricchite |

---

## Task 1: Mapping puro `esitoInterventoDaVoce`

**Files:** Create `lib/interventi/esitoDaVoce.ts`, `lib/interventi/esitoDaVoce.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `lib/interventi/esitoDaVoce.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { esitoInterventoDaVoce } from './esitoDaVoce';
import type { TemplateCampo } from '../../utils/rapportini/buildVoci';

const campi: TemplateCampo[] = [{ chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', ordine: 1, opzioni: ['SI', 'NO'] }];

describe('esitoInterventoDaVoce', () => {
  it('SI → Fatto (eseguito_positivo, nessun motivo)', () => {
    expect(esitoInterventoDaVoce({ eseguito: 'SI' }, campi)).toEqual({ esito: 'eseguito_positivo', esito_motivo: null });
  });
  it('NO + nota → Non fatto con motivo (trim)', () => {
    expect(esitoInterventoDaVoce({ eseguito: 'NO', note: ' Contatore interno ' }, campi)).toEqual({ esito: null, esito_motivo: 'Contatore interno' });
  });
  it('NO senza nota → motivo null', () => {
    expect(esitoInterventoDaVoce({ eseguito: 'NO' }, campi)).toEqual({ esito: null, esito_motivo: null });
  });
  it('nessuna risposta → null (neutro, non chiude)', () => {
    expect(esitoInterventoDaVoce({}, campi)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/interventi/esitoDaVoce.test.ts`
Expected: FAIL (modulo non risolto).

- [ ] **Step 3: Write the implementation**

Create `lib/interventi/esitoDaVoce.ts` (import RELATIVI di proposito, così lo script tsx gira senza alias):

```ts
// Mappa l'esito di una voce rapportino al patch dell'intervento.
// Import relativi (non @/) così è riusabile dallo script di sync via tsx senza config alias.
import { voceEsitoColore } from '../../utils/rapportini/voceColore';
import type { TemplateCampo } from '../../utils/rapportini/buildVoci';

export type PatchEsito = { esito: 'eseguito_positivo' | null; esito_motivo: string | null };

/**
 * verde → Fatto (eseguito_positivo); rossa → Non fatto (esito null + nota libera);
 * neutro → null (la voce non ha ancora un esito → non chiudere l'intervento).
 */
export function esitoInterventoDaVoce(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): PatchEsito | null {
  const colore = voceEsitoColore(risposte, campi);
  if (colore === 'verde') return { esito: 'eseguito_positivo', esito_motivo: null };
  if (colore === 'rossa') {
    const nota = typeof risposte?.note === 'string' ? risposte.note.trim() : '';
    return { esito: null, esito_motivo: nota || null };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/interventi/esitoDaVoce.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/esitoDaVoce.ts lib/interventi/esitoDaVoce.test.ts
git commit -m "feat(torre): esitoInterventoDaVoce — mapping puro voce rapportino → esito intervento"
```

---

## Task 2: Rotta `invia` chiude con esito per-voce

**Files:** Modify `app/api/r/[token]/invia/route.ts` (sostituzione integrale).

- [ ] **Step 1: Replace the file**

Sostituisci l'INTERO contenuto di `app/api/r/[token]/invia/route.ts` con:

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { esitoInterventoDaVoce } from '@/lib/interventi/esitoDaVoce';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, stato, data, campi_snapshot')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });
  const { error } = await supabaseAdmin.from('rapportini').update({ stato: 'inviato', submitted_at: new Date().toISOString() }).eq('id', rap.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Unificazione: chiudi ogni intervento collegato con l'esito DELLA SUA voce (Fatto/Non fatto).
  // Annullati invariati; voci senza esito (neutro) non chiudono.
  const campi = (rap.campi_snapshot ?? []) as TemplateCampo[];
  const { data: voci } = await supabaseAdmin
    .from('rapportino_voci')
    .select('intervento_id, risposte')
    .eq('rapportino_id', rap.id);
  const nowIso = new Date().toISOString();
  for (const v of (voci ?? []) as Array<{ intervento_id: string | null; risposte: Record<string, unknown> | null }>) {
    if (!v.intervento_id) continue;
    const patch = esitoInterventoDaVoce(v.risposte ?? {}, campi);
    if (!patch) continue;
    await supabaseAdmin
      .from('interventi')
      .update({ stato: 'completato', esito: patch.esito, esito_motivo: patch.esito_motivo, chiuso_at: nowIso })
      .eq('id', v.intervento_id)
      .neq('stato', 'annullato');
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify lint**

Run: `npm run lint`
Expected: nessun errore in `app/api/r/[token]/invia/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/r/[token]/invia/route.ts"
git commit -m "fix(rapportini): invio chiude ogni intervento con l'esito della sua voce (non tutto positivo)"
```

---

## Task 3: Script di sync una-tantum

**Files:** Create `scripts/sync-esiti-rapportini.ts`.

Nota: scrive su prod ed è lanciato dall'utente (`npx tsx`). L'implementer NON lo esegue (lo verifica solo a compilazione/lint). Idempotente.

- [ ] **Step 1: Write the script**

Create `scripts/sync-esiti-rapportini.ts`:

```ts
// Propaga gli esiti dei rapportini INVIATI agli interventi (collega voci↔interventi per odl
// e applica Fatto/Non fatto). WRITE idempotente. Uso: npx tsx scripts/sync-esiti-rapportini.ts [YYYY-MM-DD]
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { esitoInterventoDaVoce } from '../lib/interventi/esitoDaVoce';

function loadEnv() {
  try {
    const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch { /* ignore */ }
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Mancano env Supabase'); process.exit(1); }
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const data = process.argv[2] || new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
  const { data: raps } = await db
    .from('rapportini')
    .select('id, staff_id, staff_name, campi_snapshot')
    .eq('data', data)
    .eq('stato', 'inviato');
  console.log(`Rapportini inviati ${data}: ${raps?.length ?? 0}`);

  for (const r of (raps ?? []) as Array<{ id: string; staff_id: string; staff_name: string | null; campi_snapshot: unknown }>) {
    const campi = (r.campi_snapshot ?? []) as Parameters<typeof esitoInterventoDaVoce>[1];
    const { data: voci } = await db.from('rapportino_voci').select('id, odsin, risposte, intervento_id').eq('rapportino_id', r.id);
    const { data: ints } = await db.from('interventi').select('id, odl, stato').eq('data', data).eq('staff_id', r.staff_id);
    const byOdl = new Map<string, { id: string; stato: string }>();
    for (const i of (ints ?? []) as Array<{ id: string; odl: string | null; stato: string }>) {
      const k = (i.odl ?? '').trim();
      if (k) byOdl.set(k, { id: i.id, stato: i.stato });
    }
    let linkati = 0, fatti = 0, nonFatti = 0, neutri = 0, nomatch = 0;
    for (const v of (voci ?? []) as Array<{ id: string; odsin: string | null; risposte: Record<string, unknown> | null; intervento_id: string | null }>) {
      const k = (v.odsin ?? '').trim();
      const it = k ? byOdl.get(k) : undefined;
      if (!it) { nomatch++; continue; }
      if (v.intervento_id !== it.id) { await db.from('rapportino_voci').update({ intervento_id: it.id }).eq('id', v.id); linkati++; }
      if (it.stato === 'annullato' || it.stato === 'completato') continue; // preserva terminali / idempotente
      const patch = esitoInterventoDaVoce(v.risposte ?? {}, campi);
      if (!patch) { neutri++; continue; }
      await db.from('interventi')
        .update({ stato: 'completato', esito: patch.esito, esito_motivo: patch.esito_motivo, chiuso_at: new Date().toISOString() })
        .eq('id', it.id);
      if (patch.esito === 'eseguito_positivo') fatti++; else nonFatti++;
    }
    console.log(`  ${r.staff_name}: link+${linkati} fatti=${fatti} nonFatti=${nonFatti} neutri=${neutri} nomatch=${nomatch}`);
  }
  console.log('Sync completato.');
}

main();
```

- [ ] **Step 2: Verify it typechecks/lints (do NOT run it — prod write)**

Run: `npm run lint`
Expected: nessun errore in `scripts/sync-esiti-rapportini.ts`. Non eseguire lo script (scrittura su prod, la lancia l'utente).

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-esiti-rapportini.ts
git commit -m "feat(torre): script sync esiti rapportino→interventi (una-tantum, idempotente)"
```

---

## Task 4: Funzione pura `rigaDettaglio`

**Files:** Modify `lib/interventi/torreView.ts`, `lib/interventi/torreView.test.ts`.

- [ ] **Step 1: Write the failing test**

In fondo a `lib/interventi/torreView.test.ts`, aggiungi (e aggiorna l'import per includere `rigaDettaglio`):

Cambia la riga di import esistente:
```ts
import { coloreStato, raggruppaPerOperatore, filtraInterventi, operatoriVisibili, SENTINELLA_NON_ASSEGNATI } from './torreView';
```
in:
```ts
import { coloreStato, raggruppaPerOperatore, filtraInterventi, operatoriVisibili, rigaDettaglio, SENTINELLA_NON_ASSEGNATI } from './torreView';
```

Poi appendi:
```ts
describe('rigaDettaglio', () => {
  const base = { nominativo: null, odl: null, indirizzo: null, comune: null, cap: null, pdr: null, matricola_contatore: null, intervento_tipo: null, fascia_oraria: null };

  it('dati completi: primario=nominativo, secondario con tutti i campi', () => {
    const r = rigaDettaglio({ ...base, nominativo: 'Mario Rossi', odl: 'A1', indirizzo: 'Via X 1', comune: 'Roma', cap: '00100', pdr: 'P1', matricola_contatore: 'M1', intervento_tipo: 'Rimozione', fascia_oraria: '8-12' });
    expect(r.primario).toBe('Mario Rossi');
    expect(r.secondario).toBe('Via X 1, Roma 00100 · ODL A1 · PDR P1 · matr. M1 · Rimozione · 8-12');
  });

  it('nominativo vuoto → primario=ODL e ODL non ripetuto nel secondario', () => {
    const r = rigaDettaglio({ ...base, nominativo: '', odl: 'A1', indirizzo: 'Via Y', comune: 'Zagarolo' });
    expect(r.primario).toBe('A1');
    expect(r.secondario).toBe('Via Y, Zagarolo');
  });

  it('senza nominativo né ODL → primario=Intervento', () => {
    const r = rigaDettaglio({ ...base, comune: 'Zagarolo' });
    expect(r.primario).toBe('Intervento');
    expect(r.secondario).toBe('Zagarolo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/interventi/torreView.test.ts`
Expected: FAIL (`rigaDettaglio` non esportata).

- [ ] **Step 3: Add the implementation**

Appendi in fondo a `lib/interventi/torreView.ts`:
```ts
/**
 * Costruisce le due righe del dettaglio lavoro (stile rapportino).
 * primario = nominativo || ODL || "Intervento" (usa || così la stringa vuota ripiega);
 * secondario = indirizzo, comune CAP · ODL · PDR · matr. · attività · fascia (solo presenti,
 * ODL omesso se è già il primario).
 */
export function rigaDettaglio(it: {
  nominativo: string | null;
  odl: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  pdr: string | null;
  matricola_contatore: string | null;
  intervento_tipo: string | null;
  fascia_oraria: string | null;
}): { primario: string; secondario: string } {
  const t = (s: string | null | undefined) => (s ?? '').trim();
  const odl = t(it.odl);
  const primario = t(it.nominativo) || odl || 'Intervento';
  const luogo = [t(it.indirizzo), t(it.comune)].filter(Boolean).join(', ');
  const luogoCap = [luogo, t(it.cap)].filter(Boolean).join(' ');
  const parti = [
    luogoCap || null,
    odl && primario !== odl ? `ODL ${odl}` : null,
    t(it.pdr) ? `PDR ${t(it.pdr)}` : null,
    t(it.matricola_contatore) ? `matr. ${t(it.matricola_contatore)}` : null,
    t(it.intervento_tipo) || null,
    t(it.fascia_oraria) || null,
  ].filter(Boolean);
  return { primario, secondario: parti.join(' · ') };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/interventi/torreView.test.ts`
Expected: PASS (test esistenti + 3 nuovi).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/torreView.ts lib/interventi/torreView.test.ts
git commit -m "feat(torre): rigaDettaglio — righe dettaglio stile rapportino"
```

---

## Task 5: Query/tipo + righe dettaglio arricchite nel componente

**Files:** Modify `app/hub/torre/page.tsx`, `components/modules/torre/TorreControlloClient.tsx`.

- [ ] **Step 1: Estendi la query torre**

In `app/hub/torre/page.tsx`, trova:
```ts
    .select('id, odl, nominativo, indirizzo, comune, lat, lng, staff_id, stato, esito, esito_motivo, fascia_oraria, territorio_id')
```
e sostituisci con:
```ts
    .select('id, odl, nominativo, indirizzo, comune, cap, pdr, matricola_contatore, intervento_tipo, lat, lng, staff_id, stato, esito, esito_motivo, fascia_oraria, territorio_id')
```

- [ ] **Step 2: Estendi il tipo `TorreIntervento`**

In `components/modules/torre/TorreControlloClient.tsx`, trova:
```ts
export type TorreIntervento = {
  id: string;
  odl: string | null;
  nominativo: string | null;
  indirizzo: string | null;
  comune: string | null;
  lat: number | null;
  lng: number | null;
  staff_id: string | null;
  stato: string;
  esito: string | null;
  esito_motivo: string | null;
  fascia_oraria: string | null;
  territorio_id: string | null;
};
```
e sostituisci con:
```ts
export type TorreIntervento = {
  id: string;
  odl: string | null;
  nominativo: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  pdr: string | null;
  matricola_contatore: string | null;
  intervento_tipo: string | null;
  lat: number | null;
  lng: number | null;
  staff_id: string | null;
  stato: string;
  esito: string | null;
  esito_motivo: string | null;
  fascia_oraria: string | null;
  territorio_id: string | null;
};
```

- [ ] **Step 3: Importa `rigaDettaglio`**

Trova:
```ts
import { coloreStato, raggruppaPerOperatore, filtraInterventi, operatoriVisibili, SENTINELLA_NON_ASSEGNATI, type TonoTorre } from '@/lib/interventi/torreView';
```
e sostituisci con:
```ts
import { coloreStato, raggruppaPerOperatore, filtraInterventi, operatoriVisibili, rigaDettaglio, SENTINELLA_NON_ASSEGNATI, type TonoTorre } from '@/lib/interventi/torreView';
```

- [ ] **Step 4: Righe dettaglio arricchite**

Trova il blocco della riga (dentro `itemsMappa.map`):
```tsx
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
```
e sostituiscilo con:
```tsx
                  const tono = TONO[coloreStato(it.stato, it.esito)];
                  const ko = it.stato === 'completato' && it.esito !== 'eseguito_positivo';
                  const riga = rigaDettaglio(it);
                  return (
                    <li key={it.id} className="flex items-center gap-2 px-3 py-2 text-sm" style={{ backgroundColor: tono.bg }}>
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 self-start rounded-full" style={{ backgroundColor: tono.dot }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium" style={{ color: 'var(--brand-text-main)' }}>{riga.primario}</div>
                        {riga.secondario && (
                          <div className="truncate text-xs" style={{ color: 'var(--brand-text-muted)' }}>{riga.secondario}</div>
                        )}
                        {ko && it.esito_motivo && (
                          <div className="truncate text-xs" style={{ color: tono.fg }}>{it.esito_motivo}</div>
                        )}
                      </div>
                      <span className="shrink-0 self-start text-xs font-medium" style={{ color: tono.fg }}>
                        {it.stato === 'completato' ? tono.label : labelStato(it.stato)}
                      </span>
                    </li>
                  );
```

- [ ] **Step 5: Verify lint + tests**

Run: `npm run lint`
Expected: nessun errore in `page.tsx` e `TorreControlloClient.tsx`.

Run: `npx vitest run lib/interventi/torreView.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/hub/torre/page.tsx components/modules/torre/TorreControlloClient.tsx
git commit -m "feat(torre): righe dettaglio arricchite (ODL, indirizzo, PDR, matricola, attività, fascia)"
```

---

## Task 6: Verifica finale

- [ ] **Step 1: Suite completa** — Run: `npm run test` → tutti verdi (inclusi `esitoInterventoDaVoce`, `rigaDettaglio`).
- [ ] **Step 2: Lint** — Run: `npm run lint` → nessun nuovo errore.
- [ ] **Step 3:** Riepilogo: ricordare all'utente di lanciare `npx tsx scripts/sync-esiti-rapportini.ts` (scrittura su prod) per propagare gli esiti già registrati, e di fare push per deployare il codice.

---

## Note di esecuzione

- `esitoInterventoDaVoce` usa import relativi apposta (lo script gira sotto `tsx` senza configurare gli alias `@/`, come `backfill-interventi.ts`).
- Lo script di sync NON va eseguito dall'implementer (scrittura su prod, bloccata; la lancia l'utente). Si verifica solo lint/typecheck.
- I colori riga + pallini mappa per esito esistono già: dopo il sync diventano verdi/rossi da soli.
