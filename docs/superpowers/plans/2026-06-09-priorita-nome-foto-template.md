# Priorità nome foto configurabile per template — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere di scegliere nel template la sequenza ordinata di identificativi (PDR / Matricola / ODL / Indirizzo) usata per rinominare le foto scaricate.

**Architecture:** La sequenza è salvata in una nuova colonna `foto_id_priority` (jsonb) su `rapportino_template`. Le funzioni di naming in `fotoNaming.ts` accettano un parametro opzionale `priority`; lista vuota o assente → fallback all'ordine storico. La priorità si legge sempre dal template corrente (live) nei due punti di consumo: upload intervento manuale e ZIP foto admin. Niente snapshot, niente colonna su `rapportini`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Postgres jsonb), Zod, Vitest, React 19.

**Vincoli operativi:**
- La migration SQL va **creata come file** in `supabase/migrations/`, ma **NON eseguita** su produzione dall'agente (il Supabase MCP punta ad altro progetto). L'esecuzione la fa l'utente.
- `npm run lint` è già rosso su main per problemi preesistenti: il gate è "nessun nuovo problema dai file toccati" → verifica con `npx eslint <path>` mirato.
- **NON** fare `git push` senza ok esplicito dell'utente.

---

## File Structure

**Modificati:**
- `lib/interventi/manuali/fotoNaming.ts` — tipo `FotoIdCampo`, costanti `FOTO_ID_CAMPI` / `FOTO_ID_PRIORITY_DEFAULT`, parametro `priority` in `identificativoFoto` e `nomeFotoFile`.
- `lib/interventi/manuali/fotoNaming.test.ts` — nuovi casi per `priority`.
- `lib/interventi/manuali/risolviTemplateCommittente.ts` — campo `foto_id_priority` opzionale su `TemplateRow`.
- `lib/rapportini/templateSchema.ts` — `FotoIdPrioritySchema` + campo in `TemplateSchema`.
- `app/api/admin/rapportino-template/route.ts` — GET/POST/PATCH includono `foto_id_priority`.
- `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` — stato, helper, card "Priorità nome foto".
- `app/api/r/[token]/intervento-manuale/route.ts` — legge priorità live e la passa al naming.
- `app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts` — legge priorità via `template_id` e la passa al naming.

**Creati:**
- `supabase/migrations/20260609000000_template_foto_id_priority.sql` — nuova colonna.

---

## Task 1: Core naming logic con priorità

**Files:**
- Modify: `lib/interventi/manuali/fotoNaming.ts`
- Test: `lib/interventi/manuali/fotoNaming.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

In `lib/interventi/manuali/fotoNaming.test.ts`, aggiungi in fondo al file questi nuovi blocchi (lascia intatti i `describe` esistenti — verificano la retro-compatibilità senza `priority`):

```ts
describe('identificativoFoto con priority', () => {
  it('priority singola usa quel campo ignorando gli altri', () => {
    expect(
      identificativoFoto({ pdr: '12345', matricola: 'M99', odl: 'O77' }, ['odl']),
    ).toBe('O77');
  });

  it('priority a sequenza: salta i vuoti e prende il primo valorizzato', () => {
    expect(
      identificativoFoto({ pdr: '', matricola: '', odl: 'O77', indirizzo: 'Via X' }, ['pdr', 'odl', 'indirizzo']),
    ).toBe('O77');
  });

  it('priority vuota → ordine storico (PDR prima)', () => {
    expect(
      identificativoFoto({ pdr: '12345', matricola: 'M99' }, []),
    ).toBe('12345');
  });

  it('priority indirizzo → indirizzo normalizzato', () => {
    expect(
      identificativoFoto({ matricola: 'M99', indirizzo: 'Via San Giovanni, 3' }, ['indirizzo']),
    ).toBe('ViaSanGiovanni3');
  });

  it('priority valorizzata ma identificativi tutti vuoti → "intervento"', () => {
    expect(identificativoFoto({ pdr: '', odl: '' }, ['pdr', 'odl'])).toBe('intervento');
  });
});

describe('nomeFotoFile con priority', () => {
  it('usa la priority per scegliere l\'identificativo (ODL prima del PDR)', () => {
    const nome = nomeFotoFile(
      'Foto contatore',
      { pdr: '12345', odl: 'ODL 9001' },
      'jpg',
      ['odl', 'pdr'],
    );
    expect(nome).toBe('ODL9001_FotoContatore.jpg');
  });

  it('priority vuota → identico al comportamento storico', () => {
    const nome = nomeFotoFile('Foto contatore', { pdr: '12345' }, 'jpg', []);
    expect(nome).toBe('12345_FotoContatore.jpg');
  });
});

describe('costanti foto id', () => {
  it('FOTO_ID_PRIORITY_DEFAULT è l\'ordine storico', () => {
    expect(FOTO_ID_PRIORITY_DEFAULT).toEqual(['pdr', 'matricola', 'odl', 'indirizzo']);
  });

  it('FOTO_ID_CAMPI elenca i 4 identificativi con etichetta', () => {
    expect(FOTO_ID_CAMPI.map((c) => c.chiave)).toEqual(['pdr', 'matricola', 'odl', 'indirizzo']);
  });
});
```

Aggiorna anche la riga di import in cima al file di test:

```ts
import {
  normalizzaAscii,
  nomeFotoFile,
  identificativoFoto,
  FOTO_ID_CAMPI,
  FOTO_ID_PRIORITY_DEFAULT,
} from './fotoNaming';
```

- [ ] **Step 2: Esegui i test per verificare che falliscano**

Run: `npx vitest run lib/interventi/manuali/fotoNaming.test.ts`
Expected: FAIL — `FOTO_ID_CAMPI`/`FOTO_ID_PRIORITY_DEFAULT` non esportati e `identificativoFoto` non accetta il 2° argomento.

- [ ] **Step 3: Implementa la logica**

In `lib/interventi/manuali/fotoNaming.ts`, sotto l'interfaccia `IdentificativiFoto` (dopo la riga 7), aggiungi tipo e costanti:

```ts
/** Le 4 chiavi identificativo selezionabili come priorità nome foto. */
export type FotoIdCampo = 'pdr' | 'matricola' | 'odl' | 'indirizzo';

/** Etichette UI dei 4 identificativi (unica fonte di verità per l'editor template). */
export const FOTO_ID_CAMPI: { chiave: FotoIdCampo; etichetta: string }[] = [
  { chiave: 'pdr', etichetta: 'PDR' },
  { chiave: 'matricola', etichetta: 'Matricola' },
  { chiave: 'odl', etichetta: 'ODS/ODL' },
  { chiave: 'indirizzo', etichetta: 'Indirizzo' },
];

/** Ordine storico, usato quando la priorità del template è vuota/assente. */
export const FOTO_ID_PRIORITY_DEFAULT: FotoIdCampo[] = ['pdr', 'matricola', 'odl', 'indirizzo'];
```

Sostituisci la funzione `identificativoFoto` (righe 25-32) con:

```ts
/**
 * Primo identificativo non vuoto secondo `priority`. Se `priority` è vuota o assente,
 * usa l'ordine storico PDR → matricola → ODL → indirizzo. Fallback finale: "intervento".
 */
export function identificativoFoto(
  ids: IdentificativiFoto,
  priority?: FotoIdCampo[] | null,
): string {
  const ordine = priority && priority.length > 0 ? priority : FOTO_ID_PRIORITY_DEFAULT;
  for (const chiave of ordine) {
    const norm = normalizzaAscii(String(ids[chiave] ?? '').trim());
    if (norm) return norm;
  }
  return 'intervento';
}
```

Sostituisci la funzione `nomeFotoFile` (righe 40-49) con (propaga `priority`):

```ts
export function nomeFotoFile(
  etichettaSlot: string,
  ids: IdentificativiFoto,
  ext: string,
  priority?: FotoIdCampo[] | null,
): string {
  const id = identificativoFoto(ids, priority);
  const base = normalizzaAscii(etichettaSlot) || 'foto';
  const estensione = String(ext ?? '').trim().replace(/^\./, '').toLowerCase() || 'jpg';
  return `${id}_${base}.${estensione}`;
}
```

- [ ] **Step 4: Esegui i test per verificare che passino**

Run: `npx vitest run lib/interventi/manuali/fotoNaming.test.ts`
Expected: PASS — tutti i test (vecchi + nuovi).

- [ ] **Step 5: Lint dei file toccati**

Run: `npx eslint lib/interventi/manuali/fotoNaming.ts lib/interventi/manuali/fotoNaming.test.ts --max-warnings=0`
Expected: nessun output (zero problemi).

- [ ] **Step 6: Commit**

```bash
git add lib/interventi/manuali/fotoNaming.ts lib/interventi/manuali/fotoNaming.test.ts
git commit -m "feat(foto): identificativoFoto/nomeFotoFile accettano priority configurabile

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Schema Zod + API template

**Files:**
- Modify: `lib/rapportini/templateSchema.ts`
- Modify: `app/api/admin/rapportino-template/route.ts`

- [ ] **Step 1: Aggiungi lo schema della priorità**

In `lib/rapportini/templateSchema.ts`, dopo `TitoloCampiSchema` (riga 26), aggiungi:

```ts
export const FotoIdPrioritySchema = z
  .array(z.enum(['pdr', 'matricola', 'odl', 'indirizzo']))
  .default([]);
```

Poi, dentro `TemplateSchema` (dopo la riga `titolo_campi: TitoloCampiSchema,`), aggiungi il campo:

```ts
  foto_id_priority: FotoIdPrioritySchema,
```

- [ ] **Step 2: GET — esponi la colonna**

In `app/api/admin/rapportino-template/route.ts`, nella `select` della `GET` (riga 24), aggiungi `foto_id_priority` alla lista colonne:

```ts
    .select('id, nome, committente, campi, info_campi, titolo_campi, foto_id_priority, is_default, active, solo_manuale, created_at, updated_at')
```

- [ ] **Step 3: POST — salva la colonna**

Nella `POST` (riga 34-35), aggiungi il campo all'oggetto `.insert({...})`:

```ts
    .insert({ nome: parsed.data.nome, committente: parsed.data.committente ?? null, campi: parsed.data.campi, info_campi: parsed.data.info_campi, titolo_campi: parsed.data.titolo_campi, foto_id_priority: parsed.data.foto_id_priority, active: parsed.data.active, solo_manuale: parsed.data.solo_manuale ?? false }).select('id').single();
```

- [ ] **Step 4: PATCH — includi la colonna nel patch**

Nella `PATCH` (riga 47), aggiungi `'foto_id_priority'` all'array delle chiavi copiate:

```ts
  for (const k of ['nome', 'committente', 'campi', 'info_campi', 'titolo_campi', 'foto_id_priority', 'active', 'solo_manuale'] as const) if (k in parsed.data) patch[k] = (parsed.data as any)[k];
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: nessun errore nei file toccati (eventuali errori preesistenti altrove sono fuori scope; non devono coinvolgere questi file).

- [ ] **Step 6: Lint dei file toccati**

Run: `npx eslint lib/rapportini/templateSchema.ts "app/api/admin/rapportino-template/route.ts" --max-warnings=0`
Expected: nessun output.

- [ ] **Step 7: Commit**

```bash
git add lib/rapportini/templateSchema.ts "app/api/admin/rapportino-template/route.ts"
git commit -m "feat(template): persiste foto_id_priority via schema e API admin

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Editor template — card "Priorità nome foto"

**Files:**
- Modify: `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`

- [ ] **Step 1: Estendi import e tipo Template**

Aggiungi una nuova riga di import da `fotoNaming` (è un modulo puro, senza `server-only`, quindi importabile nel client). In cima al file (dopo la riga 3 `import type { TemplateCampo } ...`), aggiungi:

```ts
import { nomeFotoFile, FOTO_ID_CAMPI, type FotoIdCampo } from '@/lib/interventi/manuali/fotoNaming';
```

Nel tipo `Template` (righe 18-28), aggiungi il campo dopo `titolo_campi?: InfoChiave[];`:

```ts
  foto_id_priority?: FotoIdCampo[];
```

- [ ] **Step 2: Aggiungi stato e integrazione load/new/save**

Dopo `const [titoloCampi, setTitoloCampi] = useState<InfoChiave[]>([]);` (riga 70), aggiungi:

```ts
  const [fotoIdPriority, setFotoIdPriority] = useState<FotoIdCampo[]>([]);
```

In `loadTemplate` (dopo `setTitoloCampi(tpl.titolo_campi ?? []);`, riga 95):

```ts
    setFotoIdPriority(tpl.foto_id_priority ?? []);
```

In `startNew` (dopo `setTitoloCampi([]);`, riga 108):

```ts
    setFotoIdPriority([]);
```

In `handleSave`, nell'oggetto `payload` (dopo `titolo_campi: titoloCampi,`, riga 213):

```ts
        foto_id_priority: fotoIdPriority,
```

Nell'auto-save `useEffect`, nell'oggetto `payload` (dopo `titolo_campi: titoloCampi,`, riga 284):

```ts
          foto_id_priority: fotoIdPriority,
```

E aggiungi `fotoIdPriority` all'array di dipendenze dell'`useEffect` (riga 298), prima di `isNew`:

```ts
  }, [nome, committente, soloManuale, campi, infoCampi, titoloCampi, fotoIdPriority, isNew, selectedId]);
```

- [ ] **Step 3: Aggiungi gli helper toggle/move**

Dopo `moveTitolo` (riga 190, prima del commento `// ── Save ──`), aggiungi:

```ts
  function toggleFotoId(chiave: FotoIdCampo) {
    setFotoIdPriority((prev) =>
      prev.includes(chiave) ? prev.filter((c) => c !== chiave) : [...prev, chiave],
    );
  }

  function moveFotoId(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    setFotoIdPriority((prev) => {
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }
```

- [ ] **Step 4: Calcola l'anteprima del nome file**

Nella sezione render, dopo `const anteprimaRiga: RigaVoce = {...};` (riga 316), aggiungi:

```ts
  const haCampiFoto = campi.some((c) => c.tipo === 'foto');
  const etichettaFotoEsempio = campi.find((c) => c.tipo === 'foto')?.etichetta?.trim() || 'Foto contatore';
  const anteprimaNomeFoto = nomeFotoFile(
    etichettaFotoEsempio,
    { pdr: '12345', matricola: 'M-678', odl: 'ODL-900', indirizzo: 'Via Roma 1' },
    'jpg',
    fotoIdPriority,
  );
```

- [ ] **Step 5: Renderizza la card**

Inserisci questo blocco subito DOPO la chiusura della card "Lista azioni da fare" (cioè dopo `</div>` che chiude il blocco con `<VoceCampi ... />` dentro `AnteprimaBox`, riga 658) e PRIMA del blocco `{/* ── Azioni ── */}` (riga 660):

```tsx
            {/* ── Priorità nome foto (solo se ci sono campi foto) ───────────────── */}
            {haCampiFoto && (
              <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
                <h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Priorità nome foto</h3>
                <p className="mb-4 text-xs text-[var(--brand-text-muted)]">
                  Le foto vengono rinominate come <b>&lt;identificativo&gt;_&lt;tipo foto&gt;</b>. Scegli quale
                  identificativo usare (il <b>primo non vuoto</b> della lista, in ordine).
                  Lista vuota = ordine predefinito: PDR → Matricola → ODS/ODL → Indirizzo.
                </p>

                <div className="space-y-2">
                  {fotoIdPriority.length === 0 && (
                    <p className="text-xs text-[var(--brand-text-muted)]">
                      Nessun identificativo selezionato: ordine predefinito (PDR → Matricola → ODS/ODL → Indirizzo).
                    </p>
                  )}
                  {fotoIdPriority.map((chiave, idx) => {
                    const def = FOTO_ID_CAMPI.find((d) => d.chiave === chiave);
                    return (
                      <div key={chiave} className="flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
                        <span className="flex-1 text-sm font-medium text-[var(--brand-text-main)]">{idx + 1}. {def?.etichetta ?? chiave}</span>
                        <span className="w-28 shrink-0 text-xs text-[var(--brand-text-muted)]">{chiave}</span>
                        <button type="button" onClick={() => moveFotoId(idx, -1)} disabled={idx === 0}
                          className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30" title="Sposta su">▲</button>
                        <button type="button" onClick={() => moveFotoId(idx, 1)} disabled={idx === fotoIdPriority.length - 1}
                          className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30" title="Sposta giù">▼</button>
                        <button type="button" onClick={() => toggleFotoId(chiave)}
                          className="rounded-lg border border-[var(--danger)] px-2 py-1 text-xs text-[var(--danger)] transition hover:bg-[var(--danger-soft)]">Rimuovi</button>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {FOTO_ID_CAMPI.filter((d) => !fotoIdPriority.includes(d.chiave)).map((d) => (
                    <button key={d.chiave} type="button" onClick={() => toggleFotoId(d.chiave)}
                      className="rounded-lg border border-dashed border-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)]">
                      ＋ {d.etichetta}
                    </button>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-dashed border-[var(--brand-primary)] bg-[var(--brand-surface-muted)] p-3">
                  <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">Anteprima nome file</p>
                  <code className="text-sm text-[var(--brand-text-main)]">{anteprimaNomeFoto}</code>
                </div>
              </div>
            )}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: nessun errore nei file toccati.

- [ ] **Step 7: Lint del file toccato**

Run: `npx eslint "app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx" --max-warnings=0`
Expected: nessun output.

- [ ] **Step 8: Commit**

```bash
git add "app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx"
git commit -m "feat(template): card Priorità nome foto con anteprima live

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Consumo — upload intervento manuale

**Files:**
- Modify: `lib/interventi/manuali/risolviTemplateCommittente.ts`
- Modify: `app/api/r/[token]/intervento-manuale/route.ts`

- [ ] **Step 1: Estendi TemplateRow**

In `lib/interventi/manuali/risolviTemplateCommittente.ts`, nel tipo `TemplateRow` (righe 5-11), aggiungi il campo opzionale dopo `solo_manuale?: boolean | null;`:

```ts
  foto_id_priority?: string[] | null;
```

(Tipo generico `string[]` per evitare coupling; al punto d'uso si fa cast a `FotoIdCampo[]`.)

- [ ] **Step 2: Carica la colonna nella select dei template**

In `app/api/r/[token]/intervento-manuale/route.ts`, nella query dei template (riga 57-60), aggiungi `foto_id_priority` alla `select`:

```ts
  const { data: templates } = await supabaseAdmin
    .from('rapportino_template')
    .select('id, committente, is_default, active, campi, solo_manuale, foto_id_priority')
    .eq('solo_manuale', true);
```

- [ ] **Step 3: Importa FotoIdCampo e leggi la priorità**

Aggiorna l'import da `fotoNaming` (riga 10) per includere il tipo:

```ts
import { nomeFotoFile, identificativoFoto, type FotoIdCampo } from '@/lib/interventi/manuali/fotoNaming';
```

Subito dopo `const ids = {...};` (righe 90-95), aggiungi:

```ts
  const fotoPriority = ((templateRow as { foto_id_priority?: string[] | null } | undefined)?.foto_id_priority ?? []) as FotoIdCampo[];
```

- [ ] **Step 4: Passa la priorità ai due punti di naming**

Riga 122 — `storagePath` usa `identificativoFoto`; aggiungi il 2° argomento:

```ts
    const storagePath = `${richiestaId}/${c.chiave}_${identificativoFoto(ids, fotoPriority)}.${ext}`;
```

Riga 142 — `fileName` usa `nomeFotoFile`; aggiungi il 4° argomento:

```ts
      fileName: nomeFotoFile(c.etichetta, ids, ext, fotoPriority),
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: nessun errore nei file toccati.

- [ ] **Step 6: Lint dei file toccati**

Run: `npx eslint lib/interventi/manuali/risolviTemplateCommittente.ts "app/api/r/[token]/intervento-manuale/route.ts" --max-warnings=0`
Expected: nessun output.

- [ ] **Step 7: Commit**

```bash
git add lib/interventi/manuali/risolviTemplateCommittente.ts "app/api/r/[token]/intervento-manuale/route.ts"
git commit -m "feat(manuali): upload foto usa la priorità del template

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Consumo — ZIP foto admin

**Files:**
- Modify: `app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts`

- [ ] **Step 1: Importa FotoIdCampo**

Aggiorna l'import da `fotoNaming` (riga 6):

```ts
import { nomeFotoFile, type FotoIdCampo } from '@/lib/interventi/manuali/fotoNaming';
```

- [ ] **Step 2: Carica template_id col rapportino**

Nella select del rapportino (righe 18-22), aggiungi `template_id`:

```ts
  const { data: rap, error: rapErr } = await supabaseAdmin
    .from('rapportini')
    .select('id, campi_snapshot, template_id')
    .eq('id', rapportinoId)
    .maybeSingle();
```

- [ ] **Step 3: Leggi la priorità dal template (live)**

Subito dopo il blocco che calcola `campiFoto` (dopo riga 28, `const campiFoto = ...`), aggiungi:

```ts
  // Priorità nome foto: letta live dal template corrente. Template assente → default storico.
  let fotoPriority: FotoIdCampo[] = [];
  const templateId = (rap as { template_id?: string | null }).template_id;
  if (templateId) {
    const { data: tpl } = await supabaseAdmin
      .from('rapportino_template')
      .select('foto_id_priority')
      .eq('id', templateId)
      .maybeSingle();
    fotoPriority = ((tpl?.foto_id_priority ?? []) as FotoIdCampo[]);
  }
```

- [ ] **Step 4: Passa la priorità al naming**

Riga 75 — `nomeFotoFile`; aggiungi il 4° argomento:

```ts
        const fileName = nomeFotoFile(campo.etichetta, ids, ext, fotoPriority);
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: nessun errore nei file toccati.

- [ ] **Step 6: Lint del file toccato**

Run: `npx eslint "app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts" --max-warnings=0`
Expected: nessun output.

- [ ] **Step 7: Commit**

```bash
git add "app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts"
git commit -m "feat(foto-zip): nomi foto usano la priorità del template (lettura live)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Migration SQL

**Files:**
- Create: `supabase/migrations/20260609000000_template_foto_id_priority.sql`

- [ ] **Step 1: Crea il file di migration**

Contenuto di `supabase/migrations/20260609000000_template_foto_id_priority.sql`:

```sql
-- Priorità identificativi per il nome delle foto, configurabile per template.
-- Array ordinato di: 'pdr' | 'matricola' | 'odl' | 'indirizzo'. Vuoto = ordine storico.
ALTER TABLE rapportino_template
  ADD COLUMN IF NOT EXISTS foto_id_priority jsonb NOT NULL DEFAULT '[]'::jsonb;
```

- [ ] **Step 2: NON eseguire su produzione**

Il Supabase MCP punta ad altro progetto: **non** eseguire questa SQL contro il DB prod. L'esecuzione la fa l'utente. Se l'utente la richiede esplicitamente, consegnala in chat tutta insieme.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260609000000_template_foto_id_priority.sql
git commit -m "feat(db): colonna foto_id_priority su rapportino_template

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Verifica finale

**Files:** nessuno (solo verifica).

- [ ] **Step 1: Suite test del naming**

Run: `npx vitest run lib/interventi/manuali/fotoNaming.test.ts`
Expected: PASS (tutti).

- [ ] **Step 2: Type-check globale**

Run: `npx tsc --noEmit`
Expected: nessun errore introdotto dai file di questo piano.

- [ ] **Step 3: Lint mirato di tutti i file toccati**

Run:
```bash
npx eslint lib/interventi/manuali/fotoNaming.ts lib/interventi/manuali/fotoNaming.test.ts lib/interventi/manuali/risolviTemplateCommittente.ts lib/rapportini/templateSchema.ts "app/api/admin/rapportino-template/route.ts" "app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx" "app/api/r/[token]/intervento-manuale/route.ts" "app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts" --max-warnings=0
```
Expected: nessun output.

- [ ] **Step 4: Build di produzione (smoke)**

Run: `npm run build`
Expected: build completata senza errori.

- [ ] **Step 5: Riepilogo all'utente**

Comunica: SQL da lanciare (`20260609000000_template_foto_id_priority.sql`), e che il deploy/push su main richiede ok esplicito. NON pushare automaticamente.

---

## Self-review note (copertura spec)

- Tipo `FotoIdCampo` + costanti + `priority` su `identificativoFoto`/`nomeFotoFile` → Task 1 ✓
- Colonna DB `foto_id_priority` → Task 6 ✓
- Validazione Zod → Task 2 ✓
- API GET/POST/PATCH → Task 2 ✓
- Editor card condizionale + anteprima live + integrazione stato/auto-save → Task 3 ✓
- Consumo intervento manuale (live) → Task 4 ✓
- Consumo ZIP foto (live via template_id, fallback default) → Task 5 ✓
- Error handling (priority vuota → default; template cancellato → default; id vuoti → "intervento") → coperto da Task 1 (logica) + Task 5 (fallback template) ✓
