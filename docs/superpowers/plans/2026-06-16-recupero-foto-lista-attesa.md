# Recupero foto in Lista attesa (Parte C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development o superpowers:executing-plans. Steps con checkbox (`- [ ]`).

**Goal:** Permettere al backoffice di caricare foto per-slot a una richiesta manuale (in attesa o approvata) da Lista attesa, salvandole in `interventi_manuali_foto`.

**Architecture:** Nuova `POST` su `[id]/foto` (riusa `partiFotoRicevute`/`etichettaSlotFoto`), un componente uploader `CaricaFotoRichiesta` (riusa `CampoFoto`), un wrapper `RecuperoFotoRichiesta` (galleria + uploader) per il registro; wiring nel pannello di revisione e nel registro. Nessuna migration.

**Tech Stack:** Next.js route handler (Node), Supabase Storage + Postgres, React client, TypeScript.

---

### Task 1: POST upload foto (admin)

**Files:**
- Modify: `app/api/admin/interventi-manuali/[id]/foto/route.ts`

- [ ] **Step 1: Aggiungi import**

In cima al file, dopo gli import esistenti, aggiungi:

```ts
import { randomUUID } from 'node:crypto';
import { partiFotoRicevute, etichettaSlotFoto } from '@/lib/interventi/manuali/fotoRicevute';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
```

- [ ] **Step 2: Aggiungi l'handler POST in fondo al file**

```ts
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { data: richiesta } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, committente, template_id')
    .eq('id', id)
    .maybeSingle();
  if (!richiesta) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const form = await req.formData();
  const received = partiFotoRicevute(form);
  if (received.length === 0) return NextResponse.json({ error: 'nessuna_foto' }, { status: 400 });
  for (const { file } of received) {
    if (!file.type.startsWith('image/'))
      return NextResponse.json({ error: 'tipo_file_non_valido' }, { status: 400 });
  }

  // Etichette slot dal template della richiesta (fallback alla chiave).
  let campi: TemplateCampo[] = [];
  if (richiesta.template_id) {
    const { data: tpl } = await supabaseAdmin
      .from('rapportino_template').select('campi').eq('id', richiesta.template_id).maybeSingle();
    campi = ((tpl?.campi ?? []) as TemplateCampo[]);
  }

  for (const { chiave, file } of received) {
    // Sostituzione per-slot: rimuovi le foto esistenti di questo slot.
    const { data: esistenti } = await supabaseAdmin
      .from('interventi_manuali_foto')
      .select('storage_path')
      .eq('richiesta_id', id)
      .eq('slot_chiave', chiave);
    const oldPaths = ((esistenti ?? []) as Array<{ storage_path: string }>).map((r) => r.storage_path);
    if (oldPaths.length > 0) {
      await supabaseAdmin.storage.from('interventi-foto').remove(oldPaths);
      await supabaseAdmin.from('interventi_manuali_foto').delete().eq('richiesta_id', id).eq('slot_chiave', chiave);
    }

    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const storagePath = `${id}/${chiave}_${randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage
      .from('interventi-foto')
      .upload(storagePath, buf, { contentType: file.type || 'image/jpeg', upsert: true });
    if (upErr) return NextResponse.json({ error: 'upload_foto_fallito' }, { status: 502 });

    const { error: insErr } = await supabaseAdmin.from('interventi_manuali_foto').insert({
      richiesta_id: id,
      slot_chiave: chiave,
      slot_etichetta: etichettaSlotFoto(chiave, campi),
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type || 'image/jpeg',
      size: file.size,
    });
    if (insErr) {
      await supabaseAdmin.storage.from('interventi-foto').remove([storagePath]);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, count: received.length });
}
```

- [ ] **Step 3: Lint + typecheck**

Run: `npx eslint "app/api/admin/interventi-manuali/[id]/foto/route.ts"`
Expected: nessun errore.
Run: `npx tsc --noEmit 2>&1 | grep -i "interventi-manuali/\[id\]/foto" || echo "OK"`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add "app/api/admin/interventi-manuali/[id]/foto/route.ts"
git commit -m "feat(lista-attesa): POST upload foto admin per richiesta (per-slot, sostituzione)"
```

---

### Task 2: Componente uploader `CaricaFotoRichiesta`

**Files:**
- Create: `components/modules/lista-attesa/CaricaFotoRichiesta.tsx`

- [ ] **Step 1: Crea il componente**

```tsx
'use client';

import { useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { CampoFoto } from '@/components/modules/rapportini/CampoFoto';

export function CaricaFotoRichiesta({
  richiestaId,
  slotFoto,
  onCaricato,
}: {
  richiestaId: string;
  slotFoto: TemplateCampo[];
  onCaricato: () => void;
}) {
  const [foto, setFoto] = useState<Record<string, File>>({});
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const nSel = Object.keys(foto).length;

  if (slotFoto.length === 0) {
    return <p className="text-xs text-[var(--brand-text-muted)]">Nessuno slot foto per questo committente.</p>;
  }

  const carica = async () => {
    if (nSel === 0) return;
    setInviando(true);
    setErrore(null);
    try {
      const fd = new FormData();
      for (const [chiave, f] of Object.entries(foto)) fd.append(`foto:${chiave}`, f, f.name);
      const res = await fetch(`/api/admin/interventi-manuali/${richiestaId}/foto`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFoto({});
      onCaricato();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore');
    } finally {
      setInviando(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Carica foto (recupero)</p>
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
      {errore && <p className="text-sm font-medium text-[var(--danger)]">Errore: {errore}</p>}
      <button
        type="button"
        onClick={() => void carica()}
        disabled={inviando || nSel === 0}
        className="rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 font-semibold text-[oklch(0.16_0.06_245)] disabled:opacity-50"
      >
        {inviando ? 'Caricamento…' : `Carica ${nSel || ''} foto`}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `npx eslint components/modules/lista-attesa/CaricaFotoRichiesta.tsx`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add components/modules/lista-attesa/CaricaFotoRichiesta.tsx
git commit -m "feat(lista-attesa): componente CaricaFotoRichiesta (uploader per-slot, riusa CampoFoto)"
```

---

### Task 3: Uploader nel pannello di revisione (richieste in attesa)

**Files:**
- Modify: `components/modules/lista-attesa/PannelloRevisioneRichiesta.tsx`

- [ ] **Step 1: Import + `useCallback`**

Aggiungi `useCallback` all'import di React (riga 3):

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
```

Aggiungi gli import del componente e di `campiFoto`:

```tsx
import { campiFoto } from '@/lib/interventi/manuali/validaFotoObbligatorie';
import { CaricaFotoRichiesta } from './CaricaFotoRichiesta';
```

- [ ] **Step 2: Estrai `caricaFoto()` (rimpiazza la fetch inline nello useEffect)**

Sostituisci il blocco:

```tsx
  const [foto, setFoto] = useState<Array<{ id: string; etichetta: string; url: string | null }>>([]);
  useEffect(() => {
    let attivo = true;
    fetch(`/api/admin/interventi-manuali/${riga.id}/foto`)
      .then((r) => (r.ok ? r.json() : { foto: [] }))
      .then((j: { foto?: Array<{ id: string; etichetta: string; url: string | null }> }) => { if (attivo) setFoto(j.foto ?? []); })
      .catch(() => { /* foto opzionali: errore silenzioso */ });
    return () => { attivo = false; };
  }, [riga.id]);
```

con:

```tsx
  const [foto, setFoto] = useState<Array<{ id: string; etichetta: string; url: string | null }>>([]);
  const caricaFoto = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/interventi-manuali/${riga.id}/foto`, { cache: 'no-store' });
      const j = (r.ok ? await r.json() : { foto: [] }) as { foto?: Array<{ id: string; etichetta: string; url: string | null }> };
      setFoto(j.foto ?? []);
    } catch { /* foto opzionali: errore silenzioso */ }
  }, [riga.id]);
  useEffect(() => { void caricaFoto(); }, [caricaFoto]);
```

- [ ] **Step 3: Aggiungi l'uploader sotto la galleria foto**

Subito DOPO il blocco `{foto.length > 0 && ( ... )}` (la galleria), aggiungi:

```tsx
      <CaricaFotoRichiesta richiestaId={riga.id} slotFoto={campiFoto(campiEsito)} onCaricato={caricaFoto} />
```

- [ ] **Step 4: Lint + typecheck**

Run: `npx eslint components/modules/lista-attesa/PannelloRevisioneRichiesta.tsx`
Expected: nessun errore.
Run: `npx tsc --noEmit 2>&1 | grep -i "PannelloRevisioneRichiesta" || echo "OK"`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add components/modules/lista-attesa/PannelloRevisioneRichiesta.tsx
git commit -m "feat(lista-attesa): uploader foto recupero nel pannello di revisione"
```

---

### Task 4: Wrapper galleria+uploader e registro espandibile (richieste approvate)

**Files:**
- Create: `components/modules/lista-attesa/RecuperoFotoRichiesta.tsx`
- Modify: `components/modules/lista-attesa/RegistroAutorizzazioni.tsx`
- Modify: `app/hub/lista-attesa/page.tsx`

- [ ] **Step 1: Crea `RecuperoFotoRichiesta` (galleria + uploader)**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { CaricaFotoRichiesta } from './CaricaFotoRichiesta';

export function RecuperoFotoRichiesta({
  richiestaId,
  slotFoto,
}: {
  richiestaId: string;
  slotFoto: TemplateCampo[];
}) {
  const [foto, setFoto] = useState<Array<{ id: string; etichetta: string; url: string | null }>>([]);
  const caricaFoto = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/interventi-manuali/${richiestaId}/foto`, { cache: 'no-store' });
      const j = (r.ok ? await r.json() : { foto: [] }) as { foto?: Array<{ id: string; etichetta: string; url: string | null }> };
      setFoto(j.foto ?? []);
    } catch { /* opzionali */ }
  }, [richiestaId]);
  useEffect(() => { void caricaFoto(); }, [caricaFoto]);

  return (
    <div className="space-y-3">
      {foto.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {foto.map((f) => f.url && (
            <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" title={f.etichetta} className="block h-16 w-16 overflow-hidden rounded-lg border border-[var(--brand-border)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.etichetta} className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}
      <CaricaFotoRichiesta richiestaId={richiestaId} slotFoto={slotFoto} onCaricato={caricaFoto} />
    </div>
  );
}
```

- [ ] **Step 2: `RegistroAutorizzazioni` — prop, import, stato, colonna, riga espandibile**

In `RegistroAutorizzazioni.tsx`:

(a) Import:

```tsx
import { campiFoto } from '@/lib/interventi/manuali/validaFotoObbligatorie';
import { RecuperoFotoRichiesta } from './RecuperoFotoRichiesta';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { CommittenteManuale } from '@/lib/interventi/manuali/types';
```

(b) Firma del componente — accetta il prop:

```tsx
export function RegistroAutorizzazioni({ campiPerCommittente }: { campiPerCommittente: Partial<Record<CommittenteManuale, TemplateCampo[]>> }) {
```

(c) Stato riga espansa — dopo gli altri `useState`:

```tsx
  const [apertaId, setApertaId] = useState<string | null>(null);
```

(d) Header: aggiungi una `<th>` dopo `Motivo`:

```tsx
                <th className="px-3 py-2 text-left font-semibold">Foto</th>
```

(e) Riga: aggiungi la cella pulsante dopo la cella `Motivo`, e una riga di dettaglio. Sostituisci:

```tsx
                <tr key={r.id}>
                  <td className="px-3 py-2">{formatDataIt(r.data)}</td>
                  <td className="px-3 py-2">{r.staff_name ?? r.staff_id}</td>
                  <td className="px-3 py-2">{etichettaCommittente(r.committente)}</td>
                  <td className="px-3 py-2">{r.stato}</td>
                  <td className="px-3 py-2">{r.deciso_da_name ?? '—'}</td>
                  <td className="px-3 py-2 text-[var(--brand-text-muted)]">{r.deciso_at ? formatDataOraIt(r.deciso_at) : '—'}</td>
                  <td className="px-3 py-2 text-[var(--brand-text-muted)]">{r.motivo_rifiuto ?? ''}</td>
                </tr>
```

con:

```tsx
                <Fragment key={r.id}>
                  <tr>
                    <td className="px-3 py-2">{formatDataIt(r.data)}</td>
                    <td className="px-3 py-2">{r.staff_name ?? r.staff_id}</td>
                    <td className="px-3 py-2">{etichettaCommittente(r.committente)}</td>
                    <td className="px-3 py-2">{r.stato}</td>
                    <td className="px-3 py-2">{r.deciso_da_name ?? '—'}</td>
                    <td className="px-3 py-2 text-[var(--brand-text-muted)]">{r.deciso_at ? formatDataOraIt(r.deciso_at) : '—'}</td>
                    <td className="px-3 py-2 text-[var(--brand-text-muted)]">{r.motivo_rifiuto ?? ''}</td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => setApertaId((a) => (a === r.id ? null : r.id))} className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs font-semibold text-[var(--brand-text-muted)]">
                        {apertaId === r.id ? 'Chiudi' : '📷 Foto'}
                      </button>
                    </td>
                  </tr>
                  {apertaId === r.id && (
                    <tr>
                      <td colSpan={8} className="bg-[var(--brand-surface-muted)] px-3 py-3">
                        <RecuperoFotoRichiesta richiestaId={r.id} slotFoto={campiFoto(campiPerCommittente[r.committente] ?? [])} />
                      </td>
                    </tr>
                  )}
                </Fragment>
```

(f) Aggiungi `Fragment` all'import React (riga 3):

```tsx
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
```

- [ ] **Step 3: `page.tsx` — passa `campiPerCommittente` al registro**

In `app/hub/lista-attesa/page.tsx`, sostituisci:

```tsx
      <RegistroAutorizzazioni />
```

con:

```tsx
      <RegistroAutorizzazioni campiPerCommittente={campiPerCommittente} />
```

- [ ] **Step 4: Lint + typecheck**

Run: `npx eslint components/modules/lista-attesa/RecuperoFotoRichiesta.tsx components/modules/lista-attesa/RegistroAutorizzazioni.tsx app/hub/lista-attesa/page.tsx`
Expected: nessun errore.
Run: `npx tsc --noEmit 2>&1 | grep -iE "RegistroAutorizzazioni|RecuperoFotoRichiesta|lista-attesa/page" || echo "OK"`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add components/modules/lista-attesa/RecuperoFotoRichiesta.tsx components/modules/lista-attesa/RegistroAutorizzazioni.tsx app/hub/lista-attesa/page.tsx
git commit -m "feat(lista-attesa): registro con riga espandibile foto recupero (anche richieste approvate)"
```

---

### Task 5: Verifica complessiva

**Files:** nessuno (verifica)

- [ ] **Step 1: Suite + typecheck**

Run: `npx vitest run lib/interventi/manuali/`
Expected: tutti verdi (helper invariati).
Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `0`.

- [ ] **Step 2: Verifica funzionale post-deploy**

Caricare una foto per slot su una richiesta in attesa (pannello) e su una approvata (registro);
controllo read-only:

```sql
select richiesta_id, slot_chiave, slot_etichetta, to_char(created_at at time zone 'Europe/Rome','DD/MM HH24:MI') as quando
from interventi_manuali_foto where richiesta_id = '<id>' order by created_at;
```

Expected: le righe caricate compaiono con lo slot_etichetta corretto.

---

## Self-Review (esito)

- **Copertura spec:** POST upload per-slot+sostituzione → Task 1; uploader riutilizzabile → Task 2; in_attesa → Task 3; approvate (registro espandibile + prop) → Task 4; verifica → Task 5.
- **Placeholder:** nessuno; codice completo per ogni step.
- **Coerenza tipi:** `CaricaFotoRichiesta({richiestaId, slotFoto, onCaricato})`, `RecuperoFotoRichiesta({richiestaId, slotFoto})`, `RegistroAutorizzazioni({campiPerCommittente})`; `campiFoto`/`TemplateCampo`/`CommittenteManuale` importati dove usati; `Fragment` aggiunto. La POST riusa `partiFotoRicevute`/`etichettaSlotFoto` (firme già esistenti).
