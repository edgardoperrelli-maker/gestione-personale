# Affidabilità foto richiesta manuale — Parte A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Il server della route "intervento-manuale" non deve mai perdere una foto inviata dall'operatore.

**Architecture:** Due livelli di difesa nella route operatore. (1) *Eredità*: i campi del "+" si risolvono come `override (template solo_manuale) se valorizzato, altrimenti standard (template del rapportino)`, identico al client. (2) *Mai scartare*: la route persiste OGNI parte `foto:*` ricevuta, anche per slot non previsti dal template. Tre helper puri testati + il wiring nella route. Nessuna migration, nessuna modifica al client.

**Tech Stack:** Next.js route handler (Node runtime), Supabase (Postgres + Storage), TypeScript, vitest.

---

### Task 1: Helper eredità campi manuali

**Files:**
- Create: `lib/interventi/manuali/risolviCampiManuali.ts`
- Test: `lib/interventi/manuali/risolviCampiManuali.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { risolviCampiManuali } from './risolviCampiManuali';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const fotoA: TemplateCampo = { tipo: 'foto', chiave: 'a', etichetta: 'A', ordine: 1 } as TemplateCampo;
const fotoB: TemplateCampo = { tipo: 'foto', chiave: 'b', etichetta: 'B', ordine: 1 } as TemplateCampo;

describe('risolviCampiManuali', () => {
  it('usa override quando ha almeno un campo', () => {
    expect(risolviCampiManuali([fotoA], [fotoB])).toEqual([fotoA]);
  });
  it('eredita lo standard quando override è vuoto', () => {
    expect(risolviCampiManuali([], [fotoB])).toEqual([fotoB]);
  });
  it('eredita lo standard quando override è null/undefined', () => {
    expect(risolviCampiManuali(null, [fotoB])).toEqual([fotoB]);
    expect(risolviCampiManuali(undefined, [fotoB])).toEqual([fotoB]);
  });
  it('ritorna [] quando entrambi vuoti/assenti', () => {
    expect(risolviCampiManuali([], [])).toEqual([]);
    expect(risolviCampiManuali(null, null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/interventi/manuali/risolviCampiManuali.test.ts`
Expected: FAIL — "Cannot find module './risolviCampiManuali'".

- [ ] **Step 3: Write minimal implementation**

```ts
// PURA: eredità campi del "+" — l'override (template solo_manuale) vince se valorizzato,
// altrimenti si eredita lo standard (template del rapportino). Stessa logica del client.
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export function risolviCampiManuali(
  override: TemplateCampo[] | null | undefined,
  standard: TemplateCampo[] | null | undefined,
): TemplateCampo[] {
  return override && override.length > 0 ? override : (standard ?? []);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/interventi/manuali/risolviCampiManuali.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/manuali/risolviCampiManuali.ts lib/interventi/manuali/risolviCampiManuali.test.ts
git commit -m "feat(manuali): helper eredità campi manuali (override else standard)"
```

---

### Task 2: Helper foto ricevute (estrazione + etichetta)

**Files:**
- Create: `lib/interventi/manuali/fotoRicevute.ts`
- Test: `lib/interventi/manuali/fotoRicevute.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { partiFotoRicevute, etichettaSlotFoto } from './fotoRicevute';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

describe('partiFotoRicevute', () => {
  it('estrae solo le parti foto:* con file non vuoto', () => {
    const form = new FormData();
    form.append('dati', JSON.stringify({ committente: 'lim_massive' }));
    form.append('foto:lettura', new Blob(['xx'], { type: 'image/jpeg' }), 'lettura.jpg');
    form.append('foto:sigillo', new Blob(['yy'], { type: 'image/jpeg' }), 'sigillo.jpg');
    form.append('foto:vuota', new Blob([], { type: 'image/jpeg' }), 'vuota.jpg');
    const out = partiFotoRicevute(form);
    expect(out.map((p) => p.chiave).sort()).toEqual(['lettura', 'sigillo']);
    expect(out.every((p) => p.file.size > 0)).toBe(true);
  });
  it('ritorna [] senza parti foto', () => {
    const form = new FormData();
    form.append('dati', '{}');
    expect(partiFotoRicevute(form)).toEqual([]);
  });
});

describe('etichettaSlotFoto', () => {
  const campi: TemplateCampo[] = [
    { tipo: 'foto', chiave: 'lettura', etichetta: 'Lettura misuratore', ordine: 1 } as TemplateCampo,
    { tipo: 'testo', chiave: 'note', etichetta: 'Note', ordine: 2 } as TemplateCampo,
  ];
  it('usa l’etichetta del campo foto se la chiave combacia', () => {
    expect(etichettaSlotFoto('lettura', campi)).toBe('Lettura misuratore');
  });
  it('fallback alla chiave se lo slot non è un campo foto noto', () => {
    expect(etichettaSlotFoto('sconosciuto', campi)).toBe('sconosciuto');
    expect(etichettaSlotFoto('note', campi)).toBe('note'); // 'note' non è tipo foto
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/interventi/manuali/fotoRicevute.test.ts`
Expected: FAIL — "Cannot find module './fotoRicevute'".

- [ ] **Step 3: Write minimal implementation**

```ts
// PURA: estrazione delle foto ricevute dalla FormData e risoluzione etichetta slot.
// Serve al "mai scartare": il server salva OGNI parte foto:* ricevuta, anche slot
// non previsti dal template.
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

/** Tutte le parti `foto:<chiave>` con un file non vuoto, indipendenti dal template. */
export function partiFotoRicevute(form: FormData): Array<{ chiave: string; file: File }> {
  const out: Array<{ chiave: string; file: File }> = [];
  for (const [key, value] of form.entries()) {
    const m = /^foto:(.+)$/.exec(key);
    if (!m) continue;
    if (typeof value === 'string') continue;
    const file = value as File;
    if (file.size > 0) out.push({ chiave: m[1], file });
  }
  return out;
}

/** Etichetta dello slot foto se la chiave combacia con un campo `tipo==='foto'`; altrimenti la chiave. */
export function etichettaSlotFoto(chiave: string, campi: TemplateCampo[]): string {
  const campo = (campi ?? []).find((c) => c.tipo === 'foto' && c.chiave === chiave);
  return campo?.etichetta ?? chiave;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/interventi/manuali/fotoRicevute.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/interventi/manuali/fotoRicevute.ts lib/interventi/manuali/fotoRicevute.test.ts
git commit -m "feat(manuali): helper foto ricevute (estrai parti foto:* + etichetta slot)"
```

---

### Task 3: Wiring nella route — eredità standard

**Files:**
- Modify: `app/api/r/[token]/intervento-manuale/route.ts`

- [ ] **Step 1: Aggiungi `template_id` alla select del rapportino**

Sostituisci (righe ~26-30):

```ts
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, staff_id, staff_name, data, piano_id, stato, riaperto_at')
    .eq('token', token)
    .maybeSingle();
```

con:

```ts
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, staff_id, staff_name, data, piano_id, stato, riaperto_at, template_id')
    .eq('token', token)
    .maybeSingle();
```

- [ ] **Step 2: Importa l’helper eredità**

Aggiungi tra gli import in cima al file:

```ts
import { risolviCampiManuali } from '@/lib/interventi/manuali/risolviCampiManuali';
```

- [ ] **Step 3: Carica lo standard e calcola `effectiveCampi`**

Subito DOPO il blocco che individua `templateRow`/`campiTemplate`/`slotFoto` (righe ~77-80), sostituisci:

```ts
  // Individua i campi foto del template selezionato.
  const templateRow = (templates ?? []).find((t) => t.id === templateId);
  const campiTemplate = ((templateRow as { campi?: unknown })?.campi ?? []) as TemplateCampo[];
  const slotFoto = campiFoto(campiTemplate);
```

con:

```ts
  // Override = campi del template solo_manuale del committente.
  const templateRow = (templates ?? []).find((t) => t.id === templateId);
  const overrideCampi = ((templateRow as { campi?: unknown })?.campi ?? []) as TemplateCampo[];

  // Standard = campi del template del rapportino, letti LIVE (eredità come il client:
  // override vuoto → si eredita lo standard).
  let standardCampi: TemplateCampo[] = [];
  let standardPriority: FotoIdCampo[] = [];
  if (rap.template_id) {
    const { data: tplStd } = await supabaseAdmin
      .from('rapportino_template')
      .select('campi, foto_id_priority')
      .eq('id', rap.template_id)
      .maybeSingle();
    if (tplStd) {
      standardCampi = ((tplStd.campi ?? []) as TemplateCampo[]);
      standardPriority = ((tplStd.foto_id_priority ?? []) as FotoIdCampo[]);
    }
  }
  const ereditaStandard = !(overrideCampi.length > 0);
  const campiEffettivi = risolviCampiManuali(overrideCampi, standardCampi);
  const slotFoto = campiFoto(campiEffettivi);
```

- [ ] **Step 4: Usa `campiEffettivi` nella validazione obbligatorie**

Sostituisci (righe ~94-99):

```ts
  const esito = haEsitoNegativo(dati.risposte, campiTemplate)
    ? { ok: true, mancanti: [] as string[] }
    : validaFotoObbligatorie(campiTemplate, Object.fromEntries(
        slotFoto.map((c) => [c.chiave, fileBySlot.has(c.chiave)]),
      ));
```

con (nota: `fileBySlot` viene rimosso nel Task 4; qui usiamo la presenza dalle parti ricevute, definite nel Task 4 come `received`):

```ts
  const presentiSet = new Set(received.map((r) => r.chiave));
  const esito = haEsitoNegativo(dati.risposte, campiEffettivi)
    ? { ok: true, mancanti: [] as string[] }
    : validaFotoObbligatorie(campiEffettivi, Object.fromEntries(
        slotFoto.map((c) => [c.chiave, presentiSet.has(c.chiave)]),
      ));
```

- [ ] **Step 5: Aggiorna `fotoPriority` per usare lo standard quando si eredita**

Sostituisci (riga ~137):

```ts
  const fotoPriority = ((templateRow as { foto_id_priority?: string[] | null } | undefined)?.foto_id_priority ?? []) as FotoIdCampo[];
```

con:

```ts
  const fotoPriority = ereditaStandard
    ? standardPriority
    : (((templateRow as { foto_id_priority?: string[] | null } | undefined)?.foto_id_priority ?? []) as FotoIdCampo[]);
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -i "intervento-manuale/route" || echo "OK route"`
Expected: nessun errore sul file (potrebbero esserci errori temporanei su `received`/`fileBySlot` finché non si completa il Task 4; procedere al Task 4 prima di considerare verde).

---

### Task 4: Wiring nella route — mai scartare (persisti ogni foto ricevuta)

**Files:**
- Modify: `app/api/r/[token]/intervento-manuale/route.ts`

- [ ] **Step 1: Importa gli helper foto ricevute**

Aggiungi tra gli import:

```ts
import { partiFotoRicevute, etichettaSlotFoto } from '@/lib/interventi/manuali/fotoRicevute';
```

- [ ] **Step 2: Sostituisci la raccolta per-slot con la raccolta di TUTTE le parti foto**

Sostituisci (righe ~87-92):

```ts
  // Raccoglie le parti file "foto:<slot>" dalla FormData.
  const fileBySlot = new Map<string, File>();
  for (const c of slotFoto) {
    const parte = form.get(`foto:${c.chiave}`);
    if (parte instanceof File && parte.size > 0) fileBySlot.set(c.chiave, parte);
  }
```

con:

```ts
  // Raccoglie TUTTE le parti "foto:<chiave>" ricevute (anche slot non previsti dal
  // template): il server non scarta mai una foto. La validazione obbligatorie resta
  // sui campi effettivi.
  const received = partiFotoRicevute(form);
```

- [ ] **Step 3: MIME check su tutte le foto ricevute**

Sostituisci (righe ~139-143):

```ts
  // I2: check MIME server-side per ogni foto prima dell'upload.
  for (const [, f] of fileBySlot) {
    if (!f.type.startsWith('image/'))
      return NextResponse.json({ error: 'tipo_file_non_valido' }, { status: 400 });
  }
```

con:

```ts
  // I2: check MIME server-side per ogni foto prima dell'upload.
  for (const { file } of received) {
    if (!file.type.startsWith('image/'))
      return NextResponse.json({ error: 'tipo_file_non_valido' }, { status: 400 });
  }
```

- [ ] **Step 4: Upload di OGNI foto ricevuta (non più per-slot)**

Sostituisci il loop di upload (righe ~158-188):

```ts
  for (const c of slotFoto) {
    const f = fileBySlot.get(c.chiave);
    if (!f) continue; // slot facoltativo non compilato

    const ext = (f.name.split('.').pop() ?? 'jpg').toLowerCase();
    // I1: storage_path usa identificativoFoto, non l'UUID della richiesta.
    const storagePath = `${richiestaId}/${c.chiave}_${identificativoFoto(ids, fotoPriority)}.${ext}`;
    const buf = Buffer.from(await f.arrayBuffer());

    const { error: upErr } = await supabaseAdmin.storage
      .from('interventi-foto')
      .upload(storagePath, buf, { contentType: f.type || 'image/jpeg', upsert: true });

    if (upErr) {
      // Rollback: elimina i file già caricati prima di rispondere con errore.
      if (pathCaricati.length > 0) {
        await supabaseAdmin.storage.from('interventi-foto').remove(pathCaricati);
      }
      return NextResponse.json({ error: 'upload_foto_fallito' }, { status: 502 });
    }

    pathCaricati.push(storagePath);
    fotoCaricate.push({
      storagePath,
      chiave: c.chiave,
      etichetta: c.etichetta,
      fileName: nomeFotoFile(c.etichetta, ids, ext, fotoPriority),
      mimeType: f.type || 'image/jpeg',
      size: f.size,
    });
  }
```

con:

```ts
  for (const { chiave, file: f } of received) {
    const ext = (f.name.split('.').pop() ?? 'jpg').toLowerCase();
    // I1: storage_path usa identificativoFoto, non l'UUID della richiesta.
    const storagePath = `${richiestaId}/${chiave}_${identificativoFoto(ids, fotoPriority)}.${ext}`;
    const buf = Buffer.from(await f.arrayBuffer());

    const { error: upErr } = await supabaseAdmin.storage
      .from('interventi-foto')
      .upload(storagePath, buf, { contentType: f.type || 'image/jpeg', upsert: true });

    if (upErr) {
      // Rollback: elimina i file già caricati prima di rispondere con errore.
      if (pathCaricati.length > 0) {
        await supabaseAdmin.storage.from('interventi-foto').remove(pathCaricati);
      }
      return NextResponse.json({ error: 'upload_foto_fallito' }, { status: 502 });
    }

    // Etichetta dal template effettivo se nota, altrimenti la chiave (mai scartare).
    const etichetta = etichettaSlotFoto(chiave, campiEffettivi);
    pathCaricati.push(storagePath);
    fotoCaricate.push({
      storagePath,
      chiave,
      etichetta,
      fileName: nomeFotoFile(etichetta, ids, ext, fotoPriority),
      mimeType: f.type || 'image/jpeg',
      size: f.size,
    });
  }
```

- [ ] **Step 5: Lint + typecheck mirati**

Run: `npx eslint "app/api/r/[token]/intervento-manuale/route.ts"`
Expected: nessun errore.

Run: `npx tsc --noEmit 2>&1 | grep -i "intervento-manuale/route" || echo "OK route"`
Expected: `OK route` (nessun errore sul file).

- [ ] **Step 6: Commit**

```bash
git add "app/api/r/[token]/intervento-manuale/route.ts"
git commit -m "fix(manuali): eredita lo standard + non scartare mai una foto ricevuta"
```

---

### Task 5: Verifica complessiva

**Files:** nessuno (verifica)

- [ ] **Step 1: Suite test del modulo + auth**

Run: `npx vitest run lib/interventi/manuali/ lib/auth/`
Expected: tutti i test verdi (inclusi i nuovi `risolviCampiManuali` e `fotoRicevute`).

- [ ] **Step 2: Typecheck globale (baseline invariata)**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: stesso conteggio della baseline (errori solo nei file e2e/playwright preesistenti, nessuno nei file toccati).

- [ ] **Step 3: Verifica in produzione dopo il deploy (read-only)**

Dopo il push e il deploy Vercel, una nuova richiesta manuale `lim_massive` con foto deve:
- comparire in `interventi_manuali_foto` (`select count(*) ... where richiesta_id = <nuova>`);
- mostrare le foto nel pannello di revisione di Lista attesa.

Query di controllo (Supabase MCP, progetto `aceztqfebringeaebvce`, read-only):

```sql
select im.id, to_char(im.created_at at time zone 'Europe/Rome','DD/MM HH24:MI') as creata,
       count(f.id) as n_foto
from interventi_manuali im
left join interventi_manuali_foto f on f.richiesta_id = im.id
where im.committente='lim_massive'
group by im.id, im.created_at
order by im.created_at desc
limit 5;
```

Expected: le richieste create dopo il deploy hanno `n_foto > 0`.

---

## Self-Review (esito)

- **Copertura spec:** Livello 1 (eredità) → Task 1 + Task 3; Livello 2 (mai scartare) → Task 2 + Task 4; validazione obbligatorie su campi effettivi → Task 3 Step 4; nessuna migration/modifica client → rispettato.
- **Placeholder:** nessuno; ogni step ha codice/comando concreto.
- **Coerenza tipi:** `risolviCampiManuali(override, standard)`, `partiFotoRicevute(form) → {chiave,file}[]`, `etichettaSlotFoto(chiave, campi)`, `campiEffettivi`, `received`, `standardPriority`, `ereditaStandard` usati coerentemente tra Task 3 e Task 4. `FotoIdCampo`/`TemplateCampo` già importati nella route.
