# Gestione pianificazioni & rapportini — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selettore template nell'editor; eliminazione per singolo operatore (con link invalidato); rapportino digitale con tutte le info dell'intervento; eliminazione sbloccata per i template predefiniti (con protezione sull'ultimo).

**Architecture:** Quattro modifiche indipendenti che riusano lo schema/i flussi esistenti. Una nuova rotta API per la rimozione per-operatore; le altre sono UI + query + un guard API. Nessuna tabella nuova.

**Tech Stack:** Next.js 15 (App Router), React 19, Supabase (service role), TypeScript, Tailwind 4 (tema Aurea `--brand-*`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-01-gestione-pianificazioni-rapportini-design.md`

---

## File Structure

| File | Responsabilità | Azione |
|---|---|---|
| `components/modules/mappa/MappaOperatoriClient.tsx` | Lista template + `<select>` accanto a Genera | Modify |
| `app/api/mappa/piani/operatore/route.ts` | `DELETE` rimozione per-operatore | Create |
| `components/modules/mappa/RegistroPianificazioni.tsx` | "Rimuovi" per operatore nel modal + reload lista | Modify |
| `app/r/[token]/page.tsx` | Query voci con tutti i campi | Modify |
| `components/modules/rapportini/RapportinoForm.tsx` | Tipo `Voce` + anagrafica completa | Modify |
| `app/api/admin/rapportino-template/route.ts` | `DELETE`: guard "ultimo" invece di `is_default` | Modify |
| `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` | Pulsante "Elimina" per tutti i template | Modify |

I 4 blocchi (A=editor template, B=elimina operatore, C=info complete, D=template) sono indipendenti; eseguibili in qualsiasi ordine.

---

## Task 1 (A): Selettore template nell'editor

**Files:** Modify `components/modules/mappa/MappaOperatoriClient.tsx`

- [ ] **Step 1: Stato lista template.** Subito dopo `const [rapTemplateId, setRapTemplateId] = useState('');` (≈riga 703) aggiungere:
```ts
  const [rapTemplates, setRapTemplates] = useState<{ id: string; nome: string; is_default?: boolean }[]>([]);
```

- [ ] **Step 2: Popolare la lista nell'effetto template.** Trovare l'effetto che carica i template (contiene `fetch('/api/admin/rapportino-template')` e `setRapTemplateId(def.id)`, ≈righe 1588-1599) e sostituirne il corpo `try` con:
```ts
      try {
        const res = await fetch('/api/admin/rapportino-template');
        const list = await res.json();
        const arr: Array<{ id: string; nome: string; is_default?: boolean }> = Array.isArray(list) ? list : [];
        setRapTemplates(arr);
        const def = arr.find((t) => t.is_default) ?? arr[0];
        if (def) setRapTemplateId(def.id);
      } catch {
        /* nessun template attivo */
      }
```

- [ ] **Step 3: Aggiungere il `<select>` accanto al pulsante Genera.** Trovare il blocco del pulsante (dentro `{savedDistribution && currentPianoId && ( ... )}`, con onClick `generaRapportini` e label `📋 Genera rapportini`/`↻ Rigenera rapportini`). Sostituire l'INTERO blocco `{savedDistribution && currentPianoId && ( <button ...>...</button> )}` con un frammento che antepone il select:
```tsx
                          {savedDistribution && currentPianoId && (
                            <>
                              <select
                                value={rapTemplateId}
                                onChange={(e) => setRapTemplateId(e.target.value)}
                                title="Modello rapportino"
                                className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1 text-xs text-[var(--brand-text-main)]"
                              >
                                {rapTemplates.length === 0 && <option value="">Nessun modello</option>}
                                {rapTemplates.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.nome}{t.is_default ? ' (default)' : ''}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={generaRapportini}
                                disabled={rapGenerating || !rapTemplateId}
                                title={!rapTemplateId ? 'Nessun modello attivo' : undefined}
                                className="rounded-lg border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--brand-primary)] hover:opacity-90 disabled:opacity-50"
                              >
                                {rapGenerating
                                  ? 'Genero…'
                                  : rapStato.length > 0
                                    ? '↻ Rigenera rapportini'
                                    : '📋 Genera rapportini'}
                              </button>
                            </>
                          )}
```

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` pulito.

- [ ] **Step 5: Commit**
```bash
git add components/modules/mappa/MappaOperatoriClient.tsx
git commit -m "feat(mappa): selettore template nell'editor rapportini" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 (B-API): `DELETE /api/mappa/piani/operatore`

**Files:** Create `app/api/mappa/piani/operatore/route.ts`

- [ ] **Step 1: Creare la rotta.**
```ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const runtime = 'nodejs';

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const pianoId = searchParams.get('pianoId');
    const staffId = searchParams.get('staffId');
    if (!pianoId || !staffId) {
      return NextResponse.json({ error: 'pianoId e staffId obbligatori' }, { status: 400 });
    }

    const { data: piano } = await supabaseAdmin
      .from('mappa_piani').select('data').eq('id', pianoId).maybeSingle();
    if (!piano) return NextResponse.json({ error: 'Piano non trovato' }, { status: 404 });

    // 1) Elimina il rapportino dell'operatore (cascade su voci → link non più valido)
    await supabaseAdmin.from('rapportini').delete().eq('piano_id', pianoId).eq('staff_id', staffId);

    // 2) Elimina la riga operatore del piano (operatore + suoi interventi)
    const { error: eOp } = await supabaseAdmin
      .from('mappa_piani_operatori').delete().eq('piano_id', pianoId).eq('staff_id', staffId);
    if (eOp) throw new Error(eOp.message);

    // 3) Azzera il contatore nel cronoprogramma
    await supabaseAdmin
      .from('mappa_distribuzioni')
      .update({ task_count: 0, updated_at: new Date().toISOString() })
      .eq('staff_id', staffId)
      .eq('data', (piano as { data: string }).data);

    // 4) Se non restano operatori → elimina il piano
    const { count } = await supabaseAdmin
      .from('mappa_piani_operatori')
      .select('staff_id', { count: 'exact', head: true })
      .eq('piano_id', pianoId);
    let pianoDeleted = false;
    if ((count ?? 0) === 0) {
      await supabaseAdmin.from('mappa_piani').delete().eq('id', pianoId);
      pianoDeleted = true;
    }

    return NextResponse.json({ ok: true, pianoDeleted });
  } catch (err: any) {
    console.error('[DELETE /api/mappa/piani/operatore]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` pulito.

- [ ] **Step 3: Commit**
```bash
git add app/api/mappa/piani/operatore/route.ts
git commit -m "feat(mappa): API rimozione singolo operatore dal piano (invalida link)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 (B-UI): "Rimuovi" operatore nel modal + reload lista

**Files:** Modify `components/modules/mappa/RegistroPianificazioni.tsx`

- [ ] **Step 1: Estrarre `loadPiani` e usarlo al mount.** Sostituire l'`useEffect` di caricamento iniziale (quello con `const fetchPiani = async () => { ... }; fetchPiani(); }, []);`, ≈righe 53-73) con un `useCallback` + effetto:
```ts
  const loadPiani = useCallback(async () => {
    try {
      const response = await fetch('/api/mappa/piani');
      if (!response.ok) {
        console.error('API error:', response.status, response.statusText);
        setPiani([]);
        return;
      }
      const data = await response.json();
      setPiani(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching piani:', error);
      setPiani([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPiani();
  }, [loadPiani]);
```
Aggiungere `useCallback` all'import di React in cima al file se non già presente (attualmente: `import { useEffect, useState } from 'react';` → `import { useCallback, useEffect, useState } from 'react';`).

- [ ] **Step 2: Passare `onChanged` al modal.** Dove si renderizza `<RapportiniModal ... />` (≈righe 296-302), aggiungere la prop:
```tsx
        <RapportiniModal
          piano={rapPiano}
          onClose={() => setRapPiano(null)}
          onRefreshAlerts={refreshAlerts}
          onChanged={loadPiani}
        />
```

- [ ] **Step 3: Estendere i props del modal.** Nella firma di `RapportiniModal({ piano, onClose, onRefreshAlerts }: {...})` aggiungere `onChanged`:
```ts
function RapportiniModal({
  piano,
  onClose,
  onRefreshAlerts,
  onChanged,
}: {
  piano: Piano;
  onClose: () => void;
  onRefreshAlerts: () => void;
  onChanged: () => void;
}) {
```

- [ ] **Step 4: Stato + handler rimozione.** Dentro `RapportiniModal`, accanto agli altri `useState` (dopo `const [copiedToken, setCopiedToken] = useState<string | null>(null);`) aggiungere:
```ts
  const [rimuoviStaffId, setRimuoviStaffId] = useState<string | null>(null);
  const [rimuovendo, setRimuovendo] = useState<string | null>(null);
```
e una funzione handler (accanto a `handleCopy`):
```ts
  const handleRimuovi = async (r: RapportinoStato) => {
    setRimuovendo(r.staff_id);
    setErrore(null);
    try {
      const res = await fetch(
        `/api/mappa/piani/operatore?pianoId=${piano.id}&staffId=${encodeURIComponent(r.staff_id)}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok || data?.error) {
        setErrore(data?.error ?? 'Errore durante la rimozione.');
        return;
      }
      onChanged();
      onRefreshAlerts();
      if (data.pianoDeleted) {
        onClose();
        return;
      }
      await caricaStato();
    } catch {
      setErrore('Errore durante la rimozione.');
    } finally {
      setRimuovendo(null);
      setRimuoviStaffId(null);
    }
  };
```

- [ ] **Step 5: Pulsante "Rimuovi" nella riga operatore.** Nel blocco azioni di ogni voce (il `<div className="flex shrink-0 items-center gap-1.5">` che contiene Copia/Esporta/WhatsApp, ≈righe 522-543), aggiungere DOPO il link WhatsApp, prima della chiusura `</div>`:
```tsx
                      {rimuoviStaffId === r.staff_id ? (
                        <span className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleRimuovi(r)}
                            disabled={rimuovendo === r.staff_id}
                            className="rounded border border-[var(--danger)] bg-[var(--danger-soft)] px-2 py-1 text-xs font-semibold text-[var(--danger)] hover:opacity-80 disabled:opacity-50"
                          >
                            {rimuovendo === r.staff_id ? '...' : 'Rimuovi?'}
                          </button>
                          <button
                            onClick={() => setRimuoviStaffId(null)}
                            className="rounded border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setRimuoviStaffId(r.staff_id)}
                          className="rounded border border-[var(--brand-border)] px-2.5 py-1 text-xs font-medium text-[var(--brand-text-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
                        >
                          Rimuovi
                        </button>
                      )}
```

- [ ] **Step 6: Typecheck** — `npx tsc --noEmit` pulito.

- [ ] **Step 7: Commit**
```bash
git add components/modules/mappa/RegistroPianificazioni.tsx
git commit -m "feat(mappa): rimozione singolo operatore dal modal rapportini" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 (C): Rapportino digitale con tutte le info

**Files:** Modify `app/r/[token]/page.tsx` + `components/modules/rapportini/RapportinoForm.tsx`

- [ ] **Step 1: Estendere il tipo `VoceRow` e la query** in `app/r/[token]/page.tsx`. Nel tipo `VoceRow` aggiungere i campi:
```ts
type VoceRow = {
  id: string;
  ordine: number;
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
  risposte: Record<string, unknown> | null;
};
```
Aggiornare la `select` delle voci (la riga `.select('id, ordine, nominativo, pdr, via, comune, cap, attivita, fascia_oraria, risposte')`) in:
```ts
    .select('id, ordine, nominativo, matricola, pdr, odsin, via, comune, cap, recapito, attivita, accessibilita, fascia_oraria, risposte')
```
e aggiornare il mapping `voci: FormVoce[] = (...).map((v) => ({ ... }))` aggiungendo i nuovi campi:
```ts
  const voci: FormVoce[] = ((vociRows ?? []) as VoceRow[]).map((v) => ({
    id: v.id,
    ordine: v.ordine,
    nominativo: v.nominativo ?? undefined,
    matricola: v.matricola ?? undefined,
    pdr: v.pdr ?? undefined,
    odsin: v.odsin ?? undefined,
    via: v.via ?? undefined,
    comune: v.comune ?? undefined,
    cap: v.cap ?? undefined,
    recapito: v.recapito ?? undefined,
    attivita: v.attivita ?? undefined,
    accessibilita: v.accessibilita ?? undefined,
    fascia_oraria: v.fascia_oraria ?? undefined,
    risposte: (v.risposte ?? {}) as Record<string, unknown>,
  }));
```

- [ ] **Step 2: Estendere il tipo `Voce` e l'anagrafica** in `components/modules/rapportini/RapportinoForm.tsx`. Aggiornare il tipo `Voce` (≈righe 8-19) aggiungendo i campi:
```ts
export type Voce = {
  id: string;
  ordine: number;
  nominativo?: string;
  matricola?: string;
  pdr?: string;
  odsin?: string;
  via?: string;
  comune?: string;
  cap?: string;
  recapito?: string;
  attivita?: string;
  accessibilita?: string;
  fascia_oraria?: string;
  risposte: Record<string, unknown>;
};
```
In `VoceCard`, sostituire l'array `anagrafica` (≈righe 328-336) con la lista completa:
```ts
  const anagrafica: { label: string; value?: string }[] = [
    { label: 'Nominativo', value: voce.nominativo },
    { label: 'Matricola', value: voce.matricola },
    { label: 'PDR', value: voce.pdr },
    { label: 'ODSIN', value: voce.odsin },
    { label: 'Via', value: voce.via },
    { label: 'Comune', value: voce.comune },
    { label: 'CAP', value: voce.cap },
    { label: 'Recapito', value: voce.recapito },
    { label: 'Attività', value: voce.attivita },
    { label: 'Accessibilità', value: voce.accessibilita },
    { label: 'Fascia oraria', value: voce.fascia_oraria },
  ].filter((r) => r.value != null && String(r.value).trim() !== '');
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` pulito.

- [ ] **Step 4: Commit**
```bash
git add app/r/[token]/page.tsx components/modules/rapportini/RapportinoForm.tsx
git commit -m "feat(rapportini): mostra tutte le info dell'intervento nel rapportino digitale" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 (D): Template predefiniti eliminabili (con protezione ultimo)

**Files:** Modify `app/api/admin/rapportino-template/route.ts` + `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`

- [ ] **Step 1: API `DELETE` — guard "ultimo" invece di `is_default`.** In `app/api/admin/rapportino-template/route.ts`, sostituire il corpo della `DELETE` (la parte dopo il controllo `id`):
```ts
  const { data: tpl } = await supabaseAdmin.from('rapportino_template').select('is_default').eq('id', id).maybeSingle();
  if (tpl?.is_default) return NextResponse.json({ error: 'Il template di default non è eliminabile' }, { status: 409 });
  const { error } = await supabaseAdmin.from('rapportino_template').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
```
con:
```ts
  const { count } = await supabaseAdmin
    .from('rapportino_template')
    .select('id', { count: 'exact', head: true });
  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: 'Non puoi eliminare l\'ultimo template rimasto' }, { status: 409 });
  }
  const { error } = await supabaseAdmin.from('rapportino_template').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
```

- [ ] **Step 2: UI — mostrare "Elimina" per tutti.** In `TemplateRapportiniClient.tsx`:
  - In `handleDelete`, rimuovere il blocco che blocca il default:
    ```ts
    if (tpl?.is_default) { showFeedback('error', 'Il template di default non è eliminabile'); return; }
    ```
    (lasciare il `confirm(...)` e la chiamata DELETE; l'errore 409 "ultimo template" viene già mostrato da `showFeedback('error', json.error ...)`).
  - Cambiare la condizione del pulsante "Elimina template" da `{!isNew && selectedTpl && !selectedTpl.is_default && (` a:
    ```tsx
              {!isNew && selectedTpl && (
    ```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` pulito.

- [ ] **Step 4: Commit**
```bash
git add app/api/admin/rapportino-template/route.ts app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx
git commit -m "feat(rapportini): template predefiniti eliminabili (protezione sull'ultimo)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Verifica end-to-end

**Files:** nessuno (verifica). Richiede app + Supabase (`npm run dev`).

- [ ] **Step 1: Suite + tipi**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 44 test PASS (nessun nuovo test in questo piano), nessun errore di tipo.

- [ ] **Step 2: A — Selettore template**
  - Editor → distribuisci → Salva → accanto a "Genera rapportini" c'è il **select** dei modelli (default pre-selezionato); scegli un modello diverso e genera → i rapportini usano quel modello.

- [ ] **Step 3: B — Rimozione operatore**
  - Registro → Rapportini di un piano con ≥2 operatori → "Rimuovi" su uno → conferma → l'operatore sparisce dalla lista; apri il suo vecchio link `/r/<token>` → "Rapportino non trovato"; gli altri operatori restano validi; in tabella il conteggio "Operatori" si aggiorna.
  - Rimuovi l'**ultimo** operatore → il modal si chiude e il piano sparisce dalla lista.

- [ ] **Step 4: C — Info complete**
  - Apri un `/r/<token>` → ogni voce mostra tutti i campi disponibili (Nominativo, Matricola, PDR, ODSIN, Via, Comune, CAP, Recapito, Attività, Accessibilità, Fascia oraria), solo i non vuoti.

- [ ] **Step 5: D — Template**
  - Impostazioni → Template rapportini → seleziona lo "Standard" → modifica un campo → Salva → ok (già funzionava); compare il pulsante **"Elimina template"** anche per lo Standard.
  - Elimina un template non-default → ok. Riduci fino all'ultimo e prova a eliminarlo → **bloccato** ("Non puoi eliminare l'ultimo template rimasto").

---

## Note per chi esegue

- **Nessuna SQL / migrazione.**
- B riusa la cascade `rapportini.piano_id → mappa_piani` solo per il caso "piano svuotato"; per il singolo operatore il rapportino viene eliminato **esplicitamente** (i rapportini non sono FK agli operatori). La rimozione opera sugli operatori che hanno un rapportino generato (quelli elencati nel modal); per togliere operatori prima della generazione si usa Riapri + deseleziona + Salva.
- D: dopo aver eliminato il default (con altri presenti) non c'è più un `is_default`; il picker dell'editor usa `is_default ?? primo`, quindi la generazione resta funzionante.
- C: i campi provengono dallo snapshot già salvato in `rapportino_voci` (popolato da `taskToVoce`); nessun cambiamento alla generazione.
- Coerenza tipi: `onChanged` (Task 3) passato dal padre = `loadPiani`; `RapportinoStato.staff_id` usato per la rimozione; `Voce` esteso (Task 4) combacia col mapping della pagina pubblica.
