# Risanamento — Fase 5a (Chiusura) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. **Sessioni concorrenti**: verificare `git branch --show-current` = `feat/risanamento-fase5a` prima di OGNI commit; se diverso, NON committare.

**Goal:** Chiudere un rapportino risanamento: validare le foto obbligatorie, confermare i punti gas, inviare e archiviare i misuratori lavorati.

**Architecture:** Helper puro `righeIncomplete` (riusato client+server). `POST /invia` esteso: per `tipo='risanamento'` aggiunge gate foto (409) e archivio (ref→archivio + delete ref). `RisanamentoView` ottiene un footer "Invia" con check foto + modale conteggio punti gas.

**Tech Stack:** Next.js 15, TypeScript, Supabase, React 19, Vitest.

**Vincoli:** Nessuna migration nuova (`risanamento_misuratori_archivio` esiste, Fase 1). Gate: unit test helper, `tsc`, `eslint` (file nuovi), `npm run build`. Branch `feat/risanamento-fase5a`. NO push senza ok.

---

## File Structure
- Create: `utils/rapportini/righeIncomplete.ts` (+ test) — validazione foto obbligatorie per scope.
- Modify: `app/api/r/[token]/invia/route.ts` — select `tipo` + gate risanamento + archivio.
- Modify: `components/modules/rapportini/risanamento/RisanamentoView.tsx` — footer invio + check + modale punti gas.

---

## Task 1: Helper righeIncomplete (TDD)

**Files:** Create `utils/rapportini/righeIncomplete.ts` + `utils/rapportini/righeIncomplete.test.ts`

- [ ] **Step 1: Test che fallisce** — `utils/rapportini/righeIncomplete.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { righeIncomplete } from './righeIncomplete';

const campi = [
  { chiave: 'prima', etichetta: 'Prima', tipo: 'foto', ordine: 1, scope_foto: 'misuratore', obbligatoria: true },
  { chiave: 'dopo', etichetta: 'Dopo', tipo: 'foto', ordine: 2, scope_foto: 'misuratore', obbligatoria: true },
  { chiave: 'resina', etichetta: 'Resina', tipo: 'foto', ordine: 3, scope_foto: 'fase', obbligatoria: true },
  { chiave: 'interc', etichetta: 'Intercettazione', tipo: 'foto', ordine: 4, scope_foto: 'accessoria' },
] as never;

const voce = { id: 'v1', via: 'Via Roma 1', risposte: { resina: 'path/r.jpg' } };

describe('righeIncomplete', () => {
  it('riga senza foto obbligatoria → incompleta', () => {
    const r = righeIncomplete([voce] as never, [{ id: 'r1', voce_id: 'v1', matricola: 'M1', risposte: { prima: 'p.jpg' } }] as never, campi);
    expect(r.ok).toBe(false);
    expect(r.dettagli[0]).toMatchObject({ tipo: 'riga', matricola: 'M1', campiMancanti: ['Dopo'] });
  });
  it('riga completa + fase presente → ok', () => {
    const r = righeIncomplete([voce] as never, [{ id: 'r1', voce_id: 'v1', matricola: 'M1', risposte: { prima: 'p.jpg', dopo: 'd.jpg' } }] as never, campi);
    expect(r.ok).toBe(true);
    expect(r.dettagli).toEqual([]);
  });
  it('civico con fase obbligatoria mancante → incompleto', () => {
    const voceNoFase = { id: 'v1', via: 'Via Roma 1', risposte: {} };
    const r = righeIncomplete([voceNoFase] as never, [{ id: 'r1', voce_id: 'v1', matricola: 'M1', risposte: { prima: 'p.jpg', dopo: 'd.jpg' } }] as never, campi);
    expect(r.ok).toBe(false);
    expect(r.dettagli.some((d) => d.tipo === 'civico' && d.campiMancanti.includes('Resina'))).toBe(true);
  });
  it('accessorie ignorate', () => {
    const r = righeIncomplete([voce] as never, [{ id: 'r1', voce_id: 'v1', matricola: 'M1', risposte: { prima: 'p.jpg', dopo: 'd.jpg' } }] as never, campi);
    expect(r.ok).toBe(true);
  });
  it('nessuna riga → ok', () => {
    const r = righeIncomplete([voce] as never, [] as never, campi);
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Esegui** `npx vitest run utils/rapportini/righeIncomplete.test.ts` → FAIL.

- [ ] **Step 3: Implementa** — `utils/rapportini/righeIncomplete.ts`:
```ts
import { campiPerScope } from './campiScope';
import type { TemplateCampo } from './buildVoci';

export type VoceLite = { id: string; via?: string | null; risposte: Record<string, unknown> | null };
export type RigaLite = { id: string; voce_id: string; matricola: string | null; risposte: Record<string, unknown> | null };
export type DettaglioIncompleto = { tipo: 'riga' | 'civico'; civico: string; matricola?: string; campiMancanti: string[] };

function fotoPresente(risposte: Record<string, unknown> | null, chiave: string): boolean {
  const v = risposte?.[chiave];
  return typeof v === 'string' && v.trim().length > 0;
}

/** Verifica i campi foto OBBLIGATORI: misuratore→per riga, fase→per civico con righe; accessorie ignorate. */
export function righeIncomplete(
  voci: VoceLite[],
  righe: RigaLite[],
  campiSnapshot: TemplateCampo[],
): { ok: boolean; dettagli: DettaglioIncompleto[] } {
  const scope = campiPerScope(campiSnapshot);
  const misObb = scope.misuratore.filter((c) => c.obbligatoria === true);
  const faseObb = scope.fase.filter((c) => c.obbligatoria === true);
  const dettagli: DettaglioIncompleto[] = [];
  const voceById = new Map(voci.map((v) => [v.id, v]));

  for (const r of righe) {
    const mancanti = misObb.filter((c) => !fotoPresente(r.risposte, c.chiave)).map((c) => c.etichetta);
    if (mancanti.length) {
      const v = voceById.get(r.voce_id);
      dettagli.push({ tipo: 'riga', civico: v?.via ?? '', matricola: r.matricola ?? '', campiMancanti: mancanti });
    }
  }
  if (faseObb.length) {
    const vociConRighe = new Set(righe.map((r) => r.voce_id));
    for (const v of voci) {
      if (!vociConRighe.has(v.id)) continue;
      const mancanti = faseObb.filter((c) => !fotoPresente(v.risposte, c.chiave)).map((c) => c.etichetta);
      if (mancanti.length) dettagli.push({ tipo: 'civico', civico: v.via ?? '', campiMancanti: mancanti });
    }
  }
  return { ok: dettagli.length === 0, dettagli };
}
```

- [ ] **Step 4: Esegui** `npx vitest run utils/rapportini/righeIncomplete.test.ts` → PASS (5/5).
- [ ] **Step 5: Lint** `npx eslint utils/rapportini/righeIncomplete.ts utils/rapportini/righeIncomplete.test.ts --max-warnings=0` → vuoto.
- [ ] **Step 6: Commit** (verifica branch)
```bash
git add utils/rapportini/righeIncomplete.ts utils/rapportini/righeIncomplete.test.ts
git commit -m "feat(risanamento): helper validazione foto obbligatorie (righe + fasi)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Estendi /invia (gate + archivio risanamento)

**Files:** Modify `app/api/r/[token]/invia/route.ts`

- [ ] **Step 1: Import + select tipo.** In cima aggiungi `import { righeIncomplete } from '@/utils/rapportini/righeIncomplete';`. Nella `.select(...)` di `rapportini` (riga 14) aggiungi `, tipo`.

- [ ] **Step 2: Gate risanamento.** SUBITO DOPO il blocco `voci_in_sospeso` (dopo la riga `if (!gate.inviabile) ...return 409`), prima dell'`update({ stato: 'inviato' ...})`, inserisci:
```ts
  // Risanamento: gate foto obbligatorie (righe misuratore + fasi civico).
  if ((rap as { tipo?: string }).tipo === 'risanamento') {
    const campiSnap = ((rap as { campi_snapshot?: unknown }).campi_snapshot ?? []) as TemplateCampo[];
    const [{ data: vRis }, { data: rRis }] = await Promise.all([
      supabaseAdmin.from('rapportino_voci').select('id, via, risposte').eq('rapportino_id', rap.id),
      supabaseAdmin.from('rapportino_righe').select('id, voce_id, matricola, risposte').eq('rapportino_id', rap.id),
    ]);
    const val = righeIncomplete((vRis ?? []) as never, (rRis ?? []) as never, campiSnap);
    if (!val.ok) return NextResponse.json({ error: 'foto_mancanti', dettagli: val.dettagli }, { status: 409 });
  }
```

- [ ] **Step 3: Archivio.** SUBITO DOPO l'`update({ stato: 'inviato', submitted_at })` (e il suo error-check), inserisci (best-effort in try/catch):
```ts
  // Risanamento: archivia i misuratori lavorati (righe con ref_id): copia ref→archivio + rimuovi da ref.
  if ((rap as { tipo?: string }).tipo === 'risanamento') {
    try {
      const { data: righeRef } = await supabaseAdmin
        .from('rapportino_righe').select('ref_id').eq('rapportino_id', rap.id).not('ref_id', 'is', null);
      const refIds = [...new Set(((righeRef ?? []) as Array<{ ref_id: number | null }>).map((r) => r.ref_id).filter((x): x is number => x != null))];
      if (refIds.length) {
        const { data: refs } = await supabaseAdmin
          .from('risanamento_misuratori_ref')
          .select('id, matricola, pdr, nominativo, indirizzo, civico, comune, cap, import_id')
          .in('id', refIds);
        if (refs && refs.length) {
          const archivio = (refs as Array<{ id: number; matricola: string; pdr: string | null; nominativo: string | null; indirizzo: string | null; civico: string | null; comune: string | null; cap: string | null; import_id: string | null }>).map((r) => ({
            matricola: r.matricola, pdr: r.pdr ?? '', nominativo: r.nominativo ?? '',
            indirizzo: r.indirizzo ?? '', civico: r.civico ?? '', comune: r.comune ?? '', cap: r.cap ?? '',
            import_id: r.import_id, ref_id_originale: r.id, rapportino_id: rap.id,
          }));
          await supabaseAdmin.from('risanamento_misuratori_archivio').insert(archivio);
          await supabaseAdmin.from('risanamento_misuratori_ref').delete().in('id', refs.map((r) => r.id));
        }
      }
    } catch (e) {
      console.error('[risanamento] archivio fallito (invio comunque ok):', e);
    }
  }
```

- [ ] **Step 4: Type-check** `npx tsc --noEmit 2>&1 | grep -i "invia/route"` → vuoto. (`TemplateCampo` è già importato nel file.)
- [ ] **Step 5: Lint** `npx eslint "app/api/r/[token]/invia/route.ts" --max-warnings=0` → vuoto.
- [ ] **Step 6: Commit** (verifica branch)
```bash
git add "app/api/r/[token]/invia/route.ts"
git commit -m "feat(risanamento): chiusura con gate foto + archivio misuratori lavorati" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: UI invio in RisanamentoView

**Files:** Modify `components/modules/rapportini/risanamento/RisanamentoView.tsx`

Leggi il file. Importa `righeIncomplete` e il suo tipo `DettaglioIncompleto` da `@/utils/rapportini/righeIncomplete`.

- [ ] **Step 1: Stato.** Aggiungi:
```tsx
  const [inviando, setInviando] = useState(false);
  const [inviato, setInviato] = useState(readOnly);
  const [modalePuntiGas, setModalePuntiGas] = useState(false);
  const [incompleti, setIncompleti] = useState<DettaglioIncompleto[]>([]);
```

- [ ] **Step 2: Calcolo righe incomplete + punti gas** (con `useMemo`). Per le voci usa le risposte aggiornate (lo stato `vociRisposte` per le fasi); costruisci le voci-lite con quelle risposte:
```tsx
  const vociLite = useMemo(
    () => voci.map((v) => ({ id: v.id, via: v.via, risposte: (vociRisposte[v.id] ?? v.risposte ?? {}) as Record<string, unknown> })),
    [voci, vociRisposte],
  );
  const validazione = useMemo(() => righeIncomplete(vociLite, righe as never, campi), [vociLite, righe, campi]);
  const puntiGas = righe.length;
  const nCivici = new Set(righe.map((r) => r.voce_id)).size;
```
(Adatta `vociRisposte`/`v.via` ai nomi reali nel componente; se `vociRisposte` non esiste con quel nome, usa la struttura presente per le risposte-voce.)

- [ ] **Step 3: Handler invio.**
```tsx
  const onInviaClick = () => {
    setErrore(null);
    if (!validazione.ok) { setIncompleti(validazione.dettagli); return; }
    setIncompleti([]);
    setModalePuntiGas(true);
  };
  const confermaInvio = async () => {
    setModalePuntiGas(false); setInviando(true); setErrore(null);
    try {
      const res = await fetch(`/api/r/${token}/invia`, { method: 'POST' });
      if (res.status === 409) {
        const body = await res.json() as { error?: string; dettagli?: DettaglioIncompleto[] };
        if (body.error === 'foto_mancanti') { setIncompleti(body.dettagli ?? []); return; }
        setErrore('Invio non possibile.'); return;
      }
      if (!res.ok) { setErrore('Invio fallito.'); return; }
      setInviato(true);
    } catch { setErrore('Errore di rete.'); } finally { setInviando(false); }
  };
```

- [ ] **Step 4: Footer + pannelli** (nella vista lista civici, in fondo; non in sola lettura). Mostra:
  - se `inviato`: banner "Rapportino inviato ✓" (sola lettura).
  - altrimenti un footer fisso con il numero punti gas e il bottone "Invia rapportino" (`onClick={onInviaClick}`, `disabled={inviando}`).
  - se `incompleti.length`: pannello rosso "Mancano foto" con righe (`civico` + `matricola` + `campiMancanti`) e civici (`civico` + `campiMancanti`).
```tsx
  {!readOnly && !inviato && (
    <div className="sticky bottom-0 border-t border-[var(--brand-border)] bg-[var(--brand-surface)] p-3">
      {incompleti.length > 0 && (
        <div className="mb-2 rounded-xl border border-[var(--danger)] bg-[var(--danger)]/10 p-3 text-xs text-[var(--danger)]">
          <p className="mb-1 font-semibold">Mancano foto obbligatorie:</p>
          <ul className="space-y-0.5">
            {incompleti.map((d, i) => (
              <li key={i}>{d.tipo === 'riga' ? `Misuratore ${d.matricola} (${d.civico})` : `Civico ${d.civico}`}: {d.campiMancanti.join(', ')}</li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" onClick={onInviaClick} disabled={inviando}
        className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 font-semibold text-white disabled:opacity-50">
        {inviando ? 'Invio…' : `Invia rapportino (${puntiGas} punti gas)`}
      </button>
    </div>
  )}
  {inviato && (
    <div className="m-3 rounded-xl border border-[var(--success)] bg-[var(--success)]/10 p-4 text-center text-sm font-semibold text-[var(--success)]">Rapportino inviato ✓</div>
  )}
```

- [ ] **Step 5: Modale conteggio punti gas.**
```tsx
  {modalePuntiGas && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--brand-surface)] p-5">
        <p className="mb-2 text-base font-semibold text-[var(--brand-text-main)]">Conferma invio</p>
        <p className="mb-4 text-sm text-[var(--brand-text-soft)]">Rilevati <b>{puntiGas} punti gas</b> ({puntiGas} misuratori in {nCivici} civici). Confermi l'invio del rapportino?</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setModalePuntiGas(false)} className="flex-1 rounded-xl border border-[var(--brand-border)] px-4 py-2.5 text-sm font-semibold">Annulla</button>
          <button type="button" onClick={confermaInvio} className="flex-1 rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white">Conferma</button>
        </div>
      </div>
    </div>
  )}
```

- [ ] **Step 6: Type-check** `npx tsc --noEmit 2>&1 | grep -i "RisanamentoView"` → vuoto.
- [ ] **Step 7: Lint** `npx eslint "components/modules/rapportini/risanamento/RisanamentoView.tsx" --max-warnings=0` → vuoto.
- [ ] **Step 8: Commit** (verifica branch)
```bash
git add "components/modules/rapportini/risanamento/RisanamentoView.tsx"
git commit -m "feat(risanamento): footer invio + check foto + modale conteggio punti gas" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Verifica finale

- [ ] **Step 1:** `npx vitest run utils/rapportini/righeIncomplete.test.ts` → PASS.
- [ ] **Step 2:** `npx tsc --noEmit 2>&1 | grep -Ei "righeIncomplete|invia/route|RisanamentoView"` → nessun errore introdotto.
- [ ] **Step 3:** eslint sui file nuovi → puliti.
- [ ] **Step 4:** `npm run build` → ok.
- [ ] **Step 5:** Riepilogo: 5a pronta; resta solo la 5b (PDF con foto). Il flusso invio+archivio si verifica sul DB reale dopo le migration.

---

## Self-review (copertura spec 5a)
- Helper validazione foto → Task 1 ✓
- Conteggio punti gas + conferma → Task 3 (modale) ✓
- Gate server + archivio → Task 2 ✓
- UI invio (footer, check, esiti) → Task 3 ✓
- Confine (no PDF) → nessun task lo tocca ✓
- Standard invariato (gate/archivio solo se tipo='risanamento') → Task 2 ✓

## Note tipi
- `righeIncomplete(voci, righe, campiSnapshot)` → `{ ok, dettagli: DettaglioIncompleto[] }`; `DettaglioIncompleto = { tipo:'riga'|'civico', civico, matricola?, campiMancanti }`. Stesso helper client (Task 3) e server (Task 2).
- `/invia` 409 con `{ error:'foto_mancanti', dettagli }` consumato dal client (Task 3).
- Archivio: campi di `risanamento_misuratori_archivio` (Fase 1) — `matricola, pdr, nominativo, indirizzo, civico, comune, cap, import_id, ref_id_originale, rapportino_id`.
