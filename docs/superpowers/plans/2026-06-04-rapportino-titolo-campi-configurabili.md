# Titolo voce + campi rapportino configurabili — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere configurabile per template l'**intestazione (titolo) di ogni voce** del rapportino, e far sì che la config di **visualizzazione** (titolo + campi anagrafici) venga letta **live dal template** così da valere anche sui rapportini già generati.

**Architecture:** Helper puro `titoloVoce` (primo campo non vuoto di una lista di priorità, altrimenti "Voce N"). Una colonna additiva `titolo_campi` su `rapportino_template`. La rotta pubblica carica il template collegato (in modo **non fatale**) e passa `titolo_campi` + `info_campi` **correnti** al form; i campi compilabili restano dal `campi_snapshot` congelato. Admin: nuova sezione "Intestazione della card".

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind 4 · Supabase · zod · Vitest.

**Spec:** [docs/superpowers/specs/2026-06-04-rapportino-titolo-campi-configurabili-design.md](../specs/2026-06-04-rapportino-titolo-campi-configurabili-design.md)

**Nota baseline:** lint del progetto già rosso su errori preesistenti → i gate usano `npx eslint <file toccati>` (solo i file del WP) e `npx tsc --noEmit` (baseline pulito, exit 0).

---

## File structure

| File | Responsabilità | Stato |
|---|---|---|
| `utils/rapportini/infoCampi.ts` | aggiunge `titoloVoce` | modifica |
| `utils/rapportini/infoCampi.test.ts` | test di `titoloVoce` | modifica |
| `components/modules/rapportini/RapportinoForm.tsx` | usa `titoloVoce`; nuova prop `titoloCampi` | modifica |
| `components/modules/rapportini/VoceFocus.tsx` | usa `titoloVoce`; nuova prop `titoloCampi` | modifica |
| `app/r/[token]/page.tsx` | carica template (non fatale) + passa props live | modifica |
| `supabase/migrations/<ts>_rapportino_titolo_campi.sql` | colonna `titolo_campi` | **nuovo** |
| `app/api/admin/rapportino-template/route.ts` | accetta/persiste `titolo_campi` | modifica |
| `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` | sezione "Intestazione della card" | modifica |

---

## Task 1: Helper `titoloVoce` (TDD)

**Files:**
- Modify: `utils/rapportini/infoCampi.ts`
- Test: `utils/rapportini/infoCampi.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

In coda a `utils/rapportini/infoCampi.test.ts` aggiungi `titoloVoce` all'import esistente da `./infoCampi`, poi aggiungi:

```ts
describe('titoloVoce', () => {
  it('titoloCampi vuoto → nominativo, poi pdr, poi "Voce N"', () => {
    expect(titoloVoce({ nominativo: 'ROSSI MARIO' }, [], 0)).toBe('ROSSI MARIO');
    expect(titoloVoce({ pdr: 'PDR1' }, [], 0)).toBe('PDR1');
    expect(titoloVoce({}, [], 4)).toBe('Voce 5');
  });
  it('usa il primo campo NON vuoto della lista di priorità', () => {
    expect(titoloVoce({ odl: 'ODL9', via: 'Via Roma' }, ['odl', 'via'], 0)).toBe('ODL9');
    expect(titoloVoce({ via: 'Via Roma' }, ['odl', 'via'], 0)).toBe('Via Roma');
  });
  it('lista configurata con tutti i campi vuoti → "Voce N" (niente fallback a nominativo)', () => {
    expect(titoloVoce({ nominativo: 'IGNORATO' }, ['odl', 'via'], 2)).toBe('Voce 3');
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run utils/rapportini/infoCampi.test.ts`
Expected: FAIL — `titoloVoce is not a function` / import non risolto.

- [ ] **Step 3: Implementa l'helper**

In fondo a `utils/rapportini/infoCampi.ts` aggiungi:

```ts
/**
 * Titolo della voce: valore del primo campo non vuoto tra `titoloCampi` (lista di priorità).
 * Se `titoloCampi` è vuoto → comportamento storico (nominativo → pdr). Ultimo fallback: "Voce N".
 */
export function titoloVoce(
  voce: VoceInfo,
  titoloCampi: InfoChiave[],
  indice: number,
): string {
  const chiavi = titoloCampi.length > 0 ? titoloCampi : (['nominativo', 'pdr'] as InfoChiave[]);
  for (const c of chiavi) {
    const v = valoreInfo(voce, c);
    if (v) return v;
  }
  return `Voce ${indice + 1}`;
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run utils/rapportini/infoCampi.test.ts`
Expected: PASS (test esistenti + 3 nuovi).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/infoCampi.ts utils/rapportini/infoCampi.test.ts
git commit -m "feat(rapportino): helper titoloVoce (titolo voce da lista di priorità)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Render — `RapportinoForm` + `VoceFocus` usano `titoloVoce`

La prop `titoloCampi` è **opzionale** in `RapportinoForm` (default `[]`) così `page.tsx` (che la passerà nel Task 3) continua a compilare anche prima di essere aggiornata.

**Files:**
- Modify: `components/modules/rapportini/RapportinoForm.tsx`
- Modify: `components/modules/rapportini/VoceFocus.tsx`

- [ ] **Step 1: `RapportinoForm.tsx` — import**

Sostituisci (riga 5):
```tsx
import { partitionInfoCampi, valoreInfo, type TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
```
con:
```tsx
import { partitionInfoCampi, titoloVoce, valoreInfo, type InfoChiave, type TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
```

- [ ] **Step 2: `RapportinoForm.tsx` — Props + destructure**

Nel tipo `Props` sostituisci:
```tsx
  infoCampi: TemplateInfoCampo[];
  readOnly: boolean;
};
```
con:
```tsx
  infoCampi: TemplateInfoCampo[];
  titoloCampi?: InfoChiave[];
  readOnly: boolean;
};
```

Nella destructure della funzione sostituisci:
```tsx
  infoCampi,
  readOnly: readOnlyIniziale,
}: Props) {
```
con:
```tsx
  infoCampi,
  titoloCampi = [],
  readOnly: readOnlyIniziale,
}: Props) {
```

- [ ] **Step 3: `RapportinoForm.tsx` — righe VM usa `titoloVoce`**

Sostituisci (riga ~180):
```tsx
        const titolo = valoreInfo(v, 'nominativo') || valoreInfo(v, 'pdr') || `Voce ${idx + 1}`;
```
con:
```tsx
        const titolo = titoloVoce(v, titoloCampi, idx);
```

E aggiorna le dipendenze della `useMemo` di `righe` (riga ~186-187): sostituisci `[voci, campi]` con `[voci, campi, titoloCampi]`.

- [ ] **Step 4: `RapportinoForm.tsx` — passa `titoloCampi` a `VoceFocus`**

Nel render di `<VoceFocus ... >` aggiungi la prop dopo `dettaglio={dettaglio}`:
```tsx
          dettaglio={dettaglio}
          titoloCampi={titoloCampi}
```

- [ ] **Step 5: `VoceFocus.tsx` — import**

Sostituisci (riga 3):
```tsx
import { valoreInfo, type TemplateInfoCampo, type VoceInfo } from '@/utils/rapportini/infoCampi';
```
con:
```tsx
import { titoloVoce, valoreInfo, type InfoChiave, type TemplateInfoCampo, type VoceInfo } from '@/utils/rapportini/infoCampi';
```

- [ ] **Step 6: `VoceFocus.tsx` — prop + uso**

Nel tipo dei props (dopo `dettaglio: TemplateInfoCampo[];`) aggiungi:
```tsx
  dettaglio: TemplateInfoCampo[];
  titoloCampi: InfoChiave[];
```
Nella destructure (dopo `dettaglio,`) aggiungi `titoloCampi,`.
Sostituisci (riga ~38):
```tsx
  const titolo = valoreInfo(voce, 'nominativo') || valoreInfo(voce, 'pdr') || `Voce ${indice + 1}`;
```
con:
```tsx
  const titolo = titoloVoce(voce, titoloCampi, indice);
```

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit` → Expected: exit 0
Run: `npx eslint components/modules/rapportini/RapportinoForm.tsx components/modules/rapportini/VoceFocus.tsx` → Expected: clean

- [ ] **Step 8: Commit**

```bash
git add components/modules/rapportini/RapportinoForm.tsx components/modules/rapportini/VoceFocus.tsx
git commit -m "feat(rapportino): titolo voce da titoloVoce (prop titoloCampi)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `page.tsx` — carica template (non fatale) + passa config live

**Files:**
- Modify: `app/r/[token]/page.tsx`

- [ ] **Step 1: import del tipo `InfoChiave`**

Sostituisci (riga 4):
```tsx
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
```
con:
```tsx
import type { InfoChiave, TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
```

- [ ] **Step 2: aggiungi `template_id` alla select del rapportino**

Sostituisci (riga 84):
```tsx
    .select('id, staff_name, data, stato, expires_at, campi_snapshot, info_snapshot')
```
con:
```tsx
    .select('id, staff_name, data, stato, expires_at, campi_snapshot, info_snapshot, template_id')
```

- [ ] **Step 3: carica il template (non fatale) e calcola le props live**

Subito **dopo** il blocco `const campiSnapshot = (...).sort(...)` (riga ~132-134) e **prima** del `return (`, inserisci:

```tsx
  // Config di visualizzazione letta LIVE dal template collegato → vale anche sui rapportini già
  // generati. Non fatale: se il template è stato cancellato o la colonna non esiste ancora
  // (migrazione non applicata → select in errore), si resta sullo snapshot congelato + titolo storico.
  let infoCampiLive = (rap.info_snapshot ?? []) as TemplateInfoCampo[];
  let titoloCampi: InfoChiave[] = [];
  if (rap.template_id) {
    const { data: tpl } = await supabaseAdmin
      .from('rapportino_template')
      .select('titolo_campi, info_campi')
      .eq('id', rap.template_id)
      .maybeSingle();
    if (tpl) {
      if (Array.isArray(tpl.info_campi) && tpl.info_campi.length > 0) {
        infoCampiLive = tpl.info_campi as TemplateInfoCampo[];
      }
      if (Array.isArray(tpl.titolo_campi)) {
        titoloCampi = tpl.titolo_campi as InfoChiave[];
      }
    }
  }
```

- [ ] **Step 4: passa le props live al form**

Sostituisci:
```tsx
        campiSnapshot={campiSnapshot}
        infoCampi={(rap.info_snapshot ?? []) as TemplateInfoCampo[]}
        readOnly={stato === 'inviato'}
```
con:
```tsx
        campiSnapshot={campiSnapshot}
        infoCampi={infoCampiLive}
        titoloCampi={titoloCampi}
        readOnly={stato === 'inviato'}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit` → exit 0
Run: `npx eslint "app/r/[token]/page.tsx"` → clean

- [ ] **Step 6: Commit**

```bash
git add "app/r/[token]/page.tsx"
git commit -m "feat(rapportino): config display live dal template (titolo + info) con fallback" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Migrazione SQL `titolo_campi`

**Files:**
- Create: `supabase/migrations/<ts>_rapportino_titolo_campi.sql` (usa un timestamp `YYYYMMDDHHMMSS` successivo all'ultima migrazione presente, es. `20260605000000`)

- [ ] **Step 1: Crea il file di migrazione**

```sql
-- Aggiunge la config dell'intestazione (titolo) della voce al template rapportino.
-- titolo_campi = lista ordinata di chiavi InfoChiave; il titolo userà il primo campo non vuoto.
-- Additiva e retro-compatibile: il codice esistente la ignora.
alter table rapportino_template
  add column if not exists titolo_campi jsonb not null default '[]'::jsonb;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): rapportino_template.titolo_campi (intestazione voce configurabile)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> Nota deploy: la SQL va applicata sul DB **prod** dall'utente (la lancia lui) **prima** del push del codice. Il render pubblico è comunque difensivo (Task 3): se la colonna non c'è, resta il comportamento attuale.

---

## Task 5: API `rapportino-template` — accetta `titolo_campi`

**Files:**
- Modify: `app/api/admin/rapportino-template/route.ts`

- [ ] **Step 1: schema zod**

Dopo `const InfoCampoSchema = z.object({...});` (riga ~34) aggiungi:
```ts
const TitoloCampiSchema = z.array(z.enum([
  'nominativo', 'matricola', 'pdr', 'odl', 'via',
  'comune', 'cap', 'recapito', 'attivita', 'accessibilita', 'fascia_oraria',
])).default([]);
```
Nel `TemplateSchema` aggiungi il campo (dopo `info_campi: ...`):
```ts
  info_campi: z.array(InfoCampoSchema).default([]),
  titolo_campi: TitoloCampiSchema,
  active: z.boolean().optional().default(true),
```

- [ ] **Step 2: GET — select**

Sostituisci (riga ~44):
```ts
    .select('id, nome, campi, info_campi, is_default, active, created_at, updated_at')
```
con:
```ts
    .select('id, nome, campi, info_campi, titolo_campi, is_default, active, created_at, updated_at')
```

- [ ] **Step 3: POST — insert**

Sostituisci (riga ~55):
```ts
    .insert({ nome: parsed.data.nome, campi: parsed.data.campi, info_campi: parsed.data.info_campi, active: parsed.data.active }).select('id').single();
```
con:
```ts
    .insert({ nome: parsed.data.nome, campi: parsed.data.campi, info_campi: parsed.data.info_campi, titolo_campi: parsed.data.titolo_campi, active: parsed.data.active }).select('id').single();
```

- [ ] **Step 4: PATCH — patch loop**

Sostituisci (riga ~67):
```ts
  for (const k of ['nome', 'campi', 'info_campi', 'active'] as const) if (k in parsed.data) patch[k] = (parsed.data as any)[k];
```
con:
```ts
  for (const k of ['nome', 'campi', 'info_campi', 'titolo_campi', 'active'] as const) if (k in parsed.data) patch[k] = (parsed.data as any)[k];
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit` → exit 0
Run: `npx eslint "app/api/admin/rapportino-template/route.ts"` → clean (nessun NUOVO problema; il file usa già `as any` preesistente)

- [ ] **Step 6: Commit**

```bash
git add "app/api/admin/rapportino-template/route.ts"
git commit -m "feat(rapportino): API template accetta titolo_campi" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Admin — sezione "Intestazione della card"

**Files:**
- Modify: `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`

- [ ] **Step 1: tipo `Template` + import `InfoChiave`**

L'import da `@/utils/rapportini/infoCampi` (righe 4-10) include già `InfoChiave`. Nel tipo `Template` aggiungi il campo (dopo `info_campi?: TemplateInfoCampo[];`):
```tsx
  info_campi?: TemplateInfoCampo[];
  titolo_campi?: InfoChiave[];
```

- [ ] **Step 2: stato + load/new**

Dopo `const [infoCampi, setInfoCampi] = useState<TemplateInfoCampo[]>([]);` (riga 48) aggiungi:
```tsx
  const [titoloCampi, setTitoloCampi] = useState<InfoChiave[]>([]);
```
In `loadTemplate` (dopo `setInfoCampi(resolveInfoCampi(tpl.info_campi));`) aggiungi:
```tsx
    setTitoloCampi(tpl.titolo_campi ?? []);
```
In `startNew` (dopo `setInfoCampi(infoCampiDefault());`) aggiungi:
```tsx
    setTitoloCampi([]);
```

- [ ] **Step 3: helpers titolo**

Dopo `function moveInfo(...) {...}` (riga ~148) aggiungi:
```tsx
  function toggleTitolo(chiave: InfoChiave) {
    setTitoloCampi((prev) => (prev.includes(chiave) ? prev.filter((c) => c !== chiave) : [...prev, chiave]));
  }

  function moveTitolo(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    setTitoloCampi((prev) => {
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }
```

- [ ] **Step 4: payload (handleSave + auto-save) + deps**

In `handleSave` `payload` (dopo `info_campi: infoCampi.map(...),`, riga ~168) aggiungi:
```tsx
        info_campi: infoCampi.map((c, i) => ({ ...c, ordine: i + 1 })),
        titolo_campi: titoloCampi,
```
Nell'auto-save `payload` (dopo `info_campi: infoCampi.map(...),`, riga ~236) aggiungi la stessa riga:
```tsx
          info_campi: infoCampi.map((c, i) => ({ ...c, ordine: i + 1 })),
          titolo_campi: titoloCampi,
```
Aggiorna le deps della `useEffect` di auto-save (riga ~250): sostituisci `[nome, campi, infoCampi, isNew, selectedId]` con `[nome, campi, infoCampi, titoloCampi, isNew, selectedId]`.

- [ ] **Step 5: UI della sezione**

Subito **dopo** il blocco `{/* ── Nome template ── */}` e **prima** di `{/* ── Informazioni da mostrare ── */}` (riga ~346) inserisci:

```tsx
            {/* ── Intestazione della card ──────────────────────────────────────── */}
            <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
              <h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Intestazione della card</h3>
              <p className="mb-4 text-xs text-[var(--brand-text-muted)]">
                Il titolo di ogni voce userà il <b>primo campo non vuoto</b> di questa lista (in ordine).
                Se tutti vuoti → &quot;Voce N&quot;. Lista vuota = comportamento storico (Nominativo, poi PDR).
              </p>

              <div className="space-y-2">
                {titoloCampi.length === 0 && (
                  <p className="text-xs text-[var(--brand-text-muted)]">Nessun campo selezionato: titolo storico (Nominativo → PDR → &quot;Voce N&quot;).</p>
                )}
                {titoloCampi.map((chiave, idx) => {
                  const def = INFO_CAMPI_DISPONIBILI.find((d) => d.chiave === chiave);
                  return (
                    <div key={chiave} className="flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
                      <span className="flex-1 text-sm font-medium text-[var(--brand-text-main)]">{idx + 1}. {def?.etichettaDefault ?? chiave}</span>
                      <span className="w-28 shrink-0 text-xs text-[var(--brand-text-muted)]">{chiave}</span>
                      <button type="button" onClick={() => moveTitolo(idx, -1)} disabled={idx === 0}
                        className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30" title="Sposta su">▲</button>
                      <button type="button" onClick={() => moveTitolo(idx, 1)} disabled={idx === titoloCampi.length - 1}
                        className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30" title="Sposta giù">▼</button>
                      <button type="button" onClick={() => toggleTitolo(chiave)}
                        className="rounded-lg border border-[var(--danger)] px-2 py-1 text-xs text-[var(--danger)] transition hover:bg-[var(--danger-soft)]">Rimuovi</button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {INFO_CAMPI_DISPONIBILI.filter((d) => !titoloCampi.includes(d.chiave)).map((d) => (
                  <button key={d.chiave} type="button" onClick={() => toggleTitolo(d.chiave)}
                    className="rounded-lg border border-dashed border-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)]">
                    ＋ {d.etichettaDefault}
                  </button>
                ))}
              </div>
            </div>

```

- [ ] **Step 6: Typecheck + lint**

Run: `npx tsc --noEmit` → exit 0
Run: `npx eslint "app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx"` → clean

- [ ] **Step 7: Commit**

```bash
git add "app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx"
git commit -m "feat(rapportino): admin — sezione Intestazione della card (titolo_campi)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Verifica finale + nota deploy

**Files:** nessuno (solo verifica).

- [ ] **Step 1: Suite completa + typecheck + lint dei file toccati**

Run: `npm test` → Expected: tutti PASS (inclusi i nuovi `titoloVoce`)
Run: `npx tsc --noEmit` → Expected: exit 0
Run: `npx eslint utils/rapportini/infoCampi.ts components/modules/rapportini/RapportinoForm.tsx components/modules/rapportini/VoceFocus.tsx "app/r/[token]/page.tsx" "app/api/admin/rapportino-template/route.ts" "app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx"` → Expected: clean

- [ ] **Step 2: Build di produzione (con env)**

Copia `.env.local` dal repo padre nel worktree, poi `npm run build` → Expected: build ok, rotte `/r/[token]` e `/impostazioni/template-rapportini` compilano. Rimuovi `.env.local` dopo.

- [ ] **Step 3: Verifica manuale**

- Admin (`/impostazioni/template-rapportini`): aprendo un template appare "Intestazione della card"; aggiungo/riordino/rimuovo campi; il salvataggio automatico funziona; ricaricando la config persiste.
- Pubblico (`/r/<token>` di un rapportino **già generato** del template modificato): il **titolo** della voce riflette la config (es. ODS/ODL invece di "Voce N") **senza rigenerare**; l'anagrafica riflette i campi del template.
- Config titolo **vuota** → titolo storico (Nominativo → PDR → "Voce N").

- [ ] **Step 4: Nota deploy (migrazione)**

Prima del push su main: l'utente applica la SQL `titolo_campi` sul DB **prod** (Supabase). Il codice è difensivo, ma applicare la migrazione prima evita che l'admin GET (che ora seleziona `titolo_campi`) vada in errore. La SQL viene consegnata all'utente su richiesta.

---

## Self-review (eseguita in scrittura)

- **Spec coverage:** titolo configurabile (Task 1,2,5,6), config live/retroattiva (Task 3), migrazione (Task 4), niente campi raw_json nuovi (rispettato), campi compilabili congelati (Task 3 non tocca `campiSnapshot`). ✔
- **No placeholder:** ogni step ha codice/comandi reali (il `<ts>` del nome migrazione è una convenzione di timestamp, con esempio). ✔
- **Coerenza tipi:** `titoloVoce(voce, titoloCampi: InfoChiave[], indice)` usato identico in infoCampi/RapportinoForm/VoceFocus; prop `titoloCampi` opzionale nel form (default `[]`) e richiesta in VoceFocus (il form la passa sempre); `titolo_campi` (DB/API/admin) ↔ `titoloCampi` (props React) coerenti. ✔
- **Niente modifiche** ad autosave, `/voce`, `/invia`, `campi_snapshot`. ✔
