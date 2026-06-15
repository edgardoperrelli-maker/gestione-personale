# Modulo Appuntamenti dedicato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spostare la gestione appuntamenti in un modulo dedicato `/hub/appuntamenti` e lasciare nel cronoprogramma solo una striscia compatta di conteggi per giorno, cliccabile.

**Architecture:** Si riusano i componenti esistenti `AppointmentDayCards` e `AppointmentModal` (spostati nella cartella del nuovo modulo) e l'API `/api/appointments` invariata. Il cronoprogramma perde tutta la UI di dettaglio appuntamenti e mostra `AppointmentCountStrip` (conteggi cliccabili → `/hub/appuntamenti?date=`).

**Tech Stack:** Next.js 15 (app router, client components), TypeScript, React, Supabase, TailwindCSS, vitest.

**Riferimento spec:** `docs/superpowers/specs/2026-06-15-appuntamenti-modulo-dedicato-design.md`

**WORKTREE:** lavorare SOLO in `C:\Users\Edgardo\Desktop\gestione-personale-main\.claude\worktrees\appuntamenti` (branch `feat/appuntamenti-modulo`). Mai toccare la dir principale (sessione concorrente attiva). Verificare `git branch --show-current` == `feat/appuntamenti-modulo` prima di ogni commit; stage solo i file nominati (mai `git add -A`).

**Baseline rossa nota:** `npx vitest run` e `npm run lint` completi sono già rossi su file pre-esistenti (es. `playwright.config.ts` manca `@playwright/test`). Il gate è "nessun nuovo problema dai file del WP": verificare i propri file con `npx tsc --noEmit` (grep sui file toccati) e i test del WP con `npx vitest run <file>`.

---

## Task 1: Sposta i componenti appuntamenti nella cartella del nuovo modulo

**Files:**
- Move: `components/modules/cronoprogramma-personale/AppointmentDayCards.tsx` → `components/modules/appuntamenti/AppointmentDayCards.tsx`
- Move: `components/modules/cronoprogramma-personale/AppointmentModal.tsx` → `components/modules/appuntamenti/AppointmentModal.tsx`
- Modify: il nuovo `AppointmentDayCards.tsx` (un import relativo)
- Modify: `components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx` (due import)

- [ ] **Step 1: Sposta i due file con git mv**

```bash
git mv components/modules/cronoprogramma-personale/AppointmentDayCards.tsx components/modules/appuntamenti/AppointmentDayCards.tsx
git mv components/modules/cronoprogramma-personale/AppointmentModal.tsx components/modules/appuntamenti/AppointmentModal.tsx
```
(`git mv` crea la cartella `appuntamenti/` automaticamente.)

- [ ] **Step 2: Correggi l'import relativo in AppointmentDayCards**

In `components/modules/appuntamenti/AppointmentDayCards.tsx`, la riga:
```tsx
import { fmtDay } from './utils';
```
diventa:
```tsx
import { fmtDay } from '@/components/modules/cronoprogramma-personale/utils';
```
(`AppointmentModal.tsx` usa solo import assoluti `@/...` → NON va modificato.)

- [ ] **Step 3: Aggiorna i due import nel workspace**

In `components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx`, sostituisci:
```tsx
import AppointmentDayCards from './AppointmentDayCards';
import AppointmentModal from './AppointmentModal';
```
con:
```tsx
import AppointmentDayCards from '@/components/modules/appuntamenti/AppointmentDayCards';
import AppointmentModal from '@/components/modules/appuntamenti/AppointmentModal';
```

- [ ] **Step 4: Typecheck**

Run (dal worktree): `npx tsc --noEmit 2>&1 | grep -iE "appointment|cronoprogramma" || echo OK-no-nuovi-errori`
Expected: `OK-no-nuovi-errori` (nessun errore sui file toccati).

- [ ] **Step 5: Commit** (dopo aver verificato `git branch --show-current` == `feat/appuntamenti-modulo`)

```bash
git add components/modules/appuntamenti/AppointmentDayCards.tsx components/modules/appuntamenti/AppointmentModal.tsx components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx
git commit -m "refactor(appuntamenti): sposta AppointmentDayCards/Modal in modules/appuntamenti"
```

---

## Task 2: Registra il modulo `appuntamenti`

**Files:**
- Modify: `lib/moduleAccess.ts`
- Modify: `components/layout/moduleIcons.tsx`

- [ ] **Step 1: Aggiungi la chiave al tipo `AppModuleKey`**

In `lib/moduleAccess.ts`, nel tipo `AppModuleKey` (righe ~11-21), aggiungi `'appuntamenti'` (es. dopo `'lista-attesa'`):
```ts
  | 'lista-attesa'
  | 'appuntamenti'
  | 'misuratori'
```

- [ ] **Step 2: Aggiungi la voce in `APP_MODULES`**

In `lib/moduleAccess.ts`, dentro l'array `APP_MODULES`, inserisci (dopo l'oggetto `lista-attesa`, prima di `misuratori`):
```ts
  {
    key: 'appuntamenti',
    href: '/hub/appuntamenti',
    label: 'Appuntamenti',
    description: 'Gestione e pianificazione appuntamenti',
    section: 'modules',
    matchPrefixes: ['/hub/appuntamenti'],
  },
```
Nota: NON è `adminOnly` → finisce automaticamente in `DEFAULT_ALLOWED_MODULES` (calcolato da `!adminOnly`) e diventa assegnabile per-utente. Nessun'altra modifica alle funzioni permessi.

- [ ] **Step 3: Aggiungi l'icona**

In `components/layout/moduleIcons.tsx`, nel record `MODULE_ICONS` (è `Record<AppModuleKey, ReactNode>`, quindi la nuova chiave è obbligatoria), aggiungi (es. dopo `'lista-attesa'`):
```tsx
  appuntamenti: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
      <circle cx="12" cy="14.5" r="2" />
    </svg>
  ),
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -iE "moduleAccess|moduleIcons" || echo OK-no-nuovi-errori`
Expected: `OK-no-nuovi-errori` (se manca l'icona, il `Record` tipizzato fallisce qui).

- [ ] **Step 5: Commit**

```bash
git add lib/moduleAccess.ts components/layout/moduleIcons.tsx
git commit -m "feat(appuntamenti): registra il modulo (chiave, voce APP_MODULES, icona)"
```

---

## Task 3: Helper puro `countAppointmentsByDay` (TDD)

**Files:**
- Create: `lib/appuntamenti.ts`
- Test: `lib/appuntamenti.test.ts`

- [ ] **Step 1: Scrivi i test (falliscono)**

Crea `lib/appuntamenti.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { countAppointmentsByDay } from './appuntamenti';

describe('countAppointmentsByDay', () => {
  it('conta per giorno e mette 0 sui giorni senza appuntamenti', () => {
    const r = countAppointmentsByDay(
      [{ data: '2026-06-15' }, { data: '2026-06-15' }, { data: '2026-06-16' }],
      ['2026-06-15', '2026-06-16', '2026-06-17']
    );
    expect(r).toEqual({ '2026-06-15': 2, '2026-06-16': 1, '2026-06-17': 0 });
  });
  it('ignora appuntamenti fuori dai giorni richiesti', () => {
    expect(countAppointmentsByDay([{ data: '2026-01-01' }], ['2026-06-15'])).toEqual({ '2026-06-15': 0 });
  });
  it('lista vuota → tutti 0', () => {
    expect(countAppointmentsByDay([], ['2026-06-15'])).toEqual({ '2026-06-15': 0 });
  });
});
```

- [ ] **Step 2: Run test (deve fallire)**

Run: `npx vitest run lib/appuntamenti.test.ts`
Expected: FAIL — modulo `./appuntamenti` non trovato.

- [ ] **Step 3: Implementa l'helper**

Crea `lib/appuntamenti.ts`:
```ts
/** Conta gli appuntamenti per ciascun giorno ISO (YYYY-MM-DD); i giorni senza restano a 0. */
export function countAppointmentsByDay(
  appointments: { data: string }[],
  isoDays: string[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const iso of isoDays) counts[iso] = 0;
  for (const a of appointments) {
    if (a.data in counts) counts[a.data] += 1;
  }
  return counts;
}
```

- [ ] **Step 4: Run test (deve passare)**

Run: `npx vitest run lib/appuntamenti.test.ts`
Expected: PASS (3 test verdi).

- [ ] **Step 5: Commit**

```bash
git add lib/appuntamenti.ts lib/appuntamenti.test.ts
git commit -m "feat(appuntamenti): helper countAppointmentsByDay (test verdi)"
```

---

## Task 4: Pagina `app/hub/appuntamenti/page.tsx`

**Files:**
- Create: `app/hub/appuntamenti/page.tsx`

- [ ] **Step 1: Crea la pagina**

Crea `app/hub/appuntamenti/page.tsx` con questo contenuto:
```tsx
'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import Button from '@/components/Button';
import AppointmentDayCards from '@/components/modules/appuntamenti/AppointmentDayCards';
import AppointmentModal from '@/components/modules/appuntamenti/AppointmentModal';
import { addDays, fmtDay, startOfWeek } from '@/components/modules/cronoprogramma-personale/utils';
import type { Territory } from '@/types';

type AppointmentTerritory = { id: string; name: string } | null;
type Appointment = {
  id: string;
  pdr: string;
  nome_cognome: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  lat: number | null;
  lng: number | null;
  data: string;
  fascia_oraria: string | null;
  tipo_intervento: string | null;
  territorio_id: string | null;
  note: string | null;
  status: 'pending' | 'confirmed';
  territories: AppointmentTerritory;
};

function parseDateParam(value: string | null): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function AppuntamentiInner() {
  const sb = supabaseBrowser();
  const searchParams = useSearchParams();

  const [anchor, setAnchor] = useState<Date>(() => startOfWeek(parseDateParam(searchParams.get('date'))));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newAppointmentDate, setNewAppointmentDate] = useState<string | undefined>(undefined);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchor, i)), [anchor]);
  const from = fmtDay(days[0]);
  const to = fmtDay(days[6]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/appointments?from=${from}&to=${to}`);
        const json = (await res.json()) as { appointments?: Appointment[] };
        if (alive && json.appointments) setAppointments(json.appointments);
      } catch (e) {
        console.error('Errore fetch appuntamenti:', e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [from, to]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await sb.from('territories').select('*').order('name', { ascending: true });
      if (alive && data) setTerritories(data as Territory[]);
    })();
    return () => {
      alive = false;
    };
  }, [sb]);

  const handleDrop = async (appointmentId: string, newDate: string) => {
    const res = await fetch('/api/appointments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: appointmentId, data: newDate }),
    });
    const json = (await res.json()) as { appointment?: Appointment };
    if (!res.ok || !json.appointment) return;
    setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? json.appointment! : a)));
  };

  const handleDelete = (id: string) => {
    setAppointments((prev) => prev.filter((a) => a.id !== id));
    setSelectedAppointment(null);
  };

  const handleCreated = (newAppt: Appointment) => {
    setAppointments((prev) => [...prev, newAppt].sort((a, b) => a.data.localeCompare(b.data)));
    setShowCreateModal(false);
    setNewAppointmentDate(undefined);
  };

  const title = `${days[0].toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })} - ${days[6].toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3 shadow-sm">
        <Button size="sm" onClick={() => setAnchor((a) => addDays(a, -7))}>{'<'}</Button>
        <div className="text-lg font-semibold tracking-tight">{title}</div>
        <Button size="sm" onClick={() => setAnchor((a) => addDays(a, 7))}>{'>'}</Button>
        <Button size="sm" variant="soft" onClick={() => setAnchor(startOfWeek(new Date()))}>Oggi</Button>
        <div className="ml-auto">
          <Button size="sm" onClick={() => { setNewAppointmentDate(undefined); setShowCreateModal(true); }}>
            + Nuovo appuntamento
          </Button>
        </div>
      </div>

      <AppointmentDayCards
        days={days}
        appointments={appointments}
        onAppointmentClick={(a) => { setSelectedAppointment(a); setShowCreateModal(false); }}
        onAppointmentDrop={handleDrop}
        onNewAppointment={(date) => { setNewAppointmentDate(date); setShowCreateModal(true); }}
      />

      {selectedAppointment && (
        <AppointmentModal
          mode="view"
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onDelete={handleDelete}
        />
      )}

      {showCreateModal && (
        <AppointmentModal
          mode="create"
          defaultDate={newAppointmentDate}
          territories={territories}
          onClose={() => { setShowCreateModal(false); setNewAppointmentDate(undefined); }}
          onCreate={handleCreated}
        />
      )}
    </div>
  );
}

export default function AppuntamentiPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-[var(--brand-text-muted)]">Caricamento…</div>}>
      <AppuntamentiInner />
    </Suspense>
  );
}
```

- [ ] **Step 2: Verifica gli helper importati esistono**

Run: `grep -nE "export (function|const) (startOfWeek|addDays|fmtDay)" components/modules/cronoprogramma-personale/utils.ts`
Expected: tutte e tre presenti. (Se `fmtDay`/`startOfWeek`/`addDays` hanno firma diversa da `(Date)`, adattare; sono le stesse usate da `CronoprogrammaWorkspace`.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -iE "hub/appuntamenti" || echo OK-no-nuovi-errori`
Expected: `OK-no-nuovi-errori`.

- [ ] **Step 4: Commit**

```bash
git add app/hub/appuntamenti/page.tsx
git commit -m "feat(appuntamenti): pagina /hub/appuntamenti (calendario settimana + CRUD, ?date)"
```

---

## Task 5: Componente `AppointmentCountStrip`

**Files:**
- Create: `components/modules/cronoprogramma-personale/AppointmentCountStrip.tsx`

- [ ] **Step 1: Crea il componente**

Crea `components/modules/cronoprogramma-personale/AppointmentCountStrip.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { fmtDay } from './utils';
import { countAppointmentsByDay } from '@/lib/appuntamenti';

export default function AppointmentCountStrip({
  days,
  appointments,
}: {
  days: Date[];
  appointments: { data: string }[];
}) {
  if (days.length === 0) return null;
  const isoDays = days.map(fmtDay);
  const counts = countAppointmentsByDay(appointments, isoDays);

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => {
        const iso = fmtDay(d);
        const n = counts[iso] ?? 0;
        return (
          <Link
            key={iso}
            href={`/hub/appuntamenti?date=${iso}`}
            title={`${n} appuntament${n === 1 ? 'o' : 'i'} — apri il modulo Appuntamenti`}
            className="flex items-center justify-between rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs shadow-sm transition hover:border-[var(--brand-primary-border)] hover:bg-[var(--brand-surface-muted)]"
          >
            <span className="font-semibold text-[var(--brand-text-main)]">
              {d.toLocaleDateString('it-IT', { weekday: 'short' })} {d.getDate()}
            </span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                n > 0
                  ? 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
                  : 'text-[var(--brand-text-muted)]'
              }`}
            >
              {n}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -iE "AppointmentCountStrip" || echo OK-no-nuovi-errori`
Expected: `OK-no-nuovi-errori`.

- [ ] **Step 3: Commit**

```bash
git add components/modules/cronoprogramma-personale/AppointmentCountStrip.tsx
git commit -m "feat(appuntamenti): AppointmentCountStrip (conteggi cliccabili per giorno)"
```

---

## Task 6: Alleggerisci il Cronoprogramma e la toolbar

**Files:**
- Modify: `components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx`
- Modify: `components/modules/cronoprogramma-personale/CronoToolbar.tsx`

- [ ] **Step 1: Workspace — sostituisci gli import dei componenti appuntamenti**

In `CronoprogrammaWorkspace.tsx` sostituisci:
```tsx
import AppointmentDayCards from '@/components/modules/appuntamenti/AppointmentDayCards';
import AppointmentModal from '@/components/modules/appuntamenti/AppointmentModal';
```
con:
```tsx
import AppointmentCountStrip from './AppointmentCountStrip';
```

- [ ] **Step 2: Workspace — rimuovi gli stati di dettaglio**

Rimuovi queste tre righe (lo stato `appointments` RESTA — serve per i conteggi):
```tsx
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [newAppointmentDate, setNewAppointmentDate] = useState<string | undefined>(undefined);
```

- [ ] **Step 3: Workspace — rimuovi i tre handler appuntamenti**

Rimuovi per intero le tre funzioni `handleAppointmentDrop`, `handleAppointmentDelete`, `handleAppointmentCreated` (il blocco contiguo):
```tsx
  const handleAppointmentDrop = async (appointmentId: string, newDate: string) => {
    const res = await fetch('/api/appointments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: appointmentId, data: newDate }),
    });
    const json = await res.json() as { appointment?: Appointment; error?: string };
    if (!res.ok || !json.appointment) return;
    setAppointments((prev) =>
      prev.map((a) => (a.id === appointmentId ? json.appointment! : a))
    );
  };

  const handleAppointmentDelete = (id: string) => {
    setAppointments((prev) => prev.filter((a) => a.id !== id));
    setSelectedAppointment(null);
  };

  const handleAppointmentCreated = (newAppt: Appointment) => {
    setAppointments((prev) =>
      [...prev, newAppt].sort((a, b) => a.data.localeCompare(b.data))
    );
    setShowAppointmentModal(false);
    setNewAppointmentDate(undefined);
  };
```

- [ ] **Step 4: Workspace — togli la prop `onNewAppointment` dalla toolbar**

Nel `<CronoToolbar ... />`, rimuovi le righe:
```tsx
          onNewAppointment={() => {
            setNewAppointmentDate(undefined);
            setShowAppointmentModal(true);
          }}
```

- [ ] **Step 5: Workspace — sostituisci la striscia di card con la striscia conteggi**

Sostituisci l'intero blocco:
```tsx
      <motion.div variants={staggerItem}>
        <AppointmentDayCards
          days={daysArray.slice(0, 7)}
          appointments={appointments}
          onAppointmentClick={(a) => {
            setSelectedAppointment(a);
            setShowAppointmentModal(false);
          }}
          onAppointmentDrop={handleAppointmentDrop}
          onNewAppointment={(date) => {
            setNewAppointmentDate(date);
            setShowAppointmentModal(true);
          }}
        />
      </motion.div>
```
con:
```tsx
      <motion.div variants={staggerItem}>
        <AppointmentCountStrip days={daysArray.slice(0, 7)} appointments={appointments} />
      </motion.div>
```

- [ ] **Step 6: Workspace — rimuovi le due modali appuntamento**

Rimuovi entrambi i blocchi in fondo al componente:
```tsx
      {/* Modal dettaglio appuntamento */}
      {selectedAppointment && (
        <AppointmentModal
          mode="view"
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onDelete={handleAppointmentDelete}
        />
      )}

      {/* Modal crea appuntamento */}
      {showAppointmentModal && (
        <AppointmentModal
          mode="create"
          defaultDate={newAppointmentDate}
          territories={territories}
          onClose={() => {
            setShowAppointmentModal(false);
            setNewAppointmentDate(undefined);
          }}
          onCreate={handleAppointmentCreated}
        />
      )}
```

- [ ] **Step 7: CronoToolbar — rimuovi `onNewAppointment` e il pulsante**

In `components/modules/cronoprogramma-personale/CronoToolbar.tsx`:
- Nella destrutturazione dei props, rimuovi la riga `onNewAppointment,`.
- Nel type dei props, rimuovi la riga `onNewAppointment: () => void;`.
- Rimuovi il pulsante:
```tsx
          <Button onClick={onNewAppointment} size="sm" variant="soft">
            + Appuntamento
          </Button>
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -iE "cronoprogramma|appointment" || echo OK-no-nuovi-errori`
Expected: `OK-no-nuovi-errori`. (Se restano riferimenti a simboli rimossi — `Appointment` type ancora usato dallo stato `appointments`: lasciarlo; `territories` ancora usato altrove nel workspace: lasciarlo.)

- [ ] **Step 9: Commit**

```bash
git add components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx components/modules/cronoprogramma-personale/CronoToolbar.tsx
git commit -m "feat(appuntamenti): cronoprogramma mostra solo i conteggi (rimosso dettaglio + Appuntamento)"
```

---

## Task 7: Verifica finale

- [ ] **Step 1: Test del WP**

Run: `npx vitest run lib/appuntamenti.test.ts`
Expected: PASS (3 verdi).

- [ ] **Step 2: Typecheck globale (solo nuovi errori sui file del WP)**

Run: `npx tsc --noEmit 2>&1 | grep -iE "appuntamenti|appointment|cronoprogramma|moduleAccess|moduleIcons" || echo OK-no-nuovi-errori`
Expected: `OK-no-nuovi-errori`.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: la compilazione dell'app va a buon fine. Un eventuale fallimento DEVE essere solo su file pre-esistenti del baseline (es. `playwright.config.ts` / `@playwright/test`), NON sui file di questa feature. Se l'errore cita un file del WP, va corretto.

- [ ] **Step 4: Smoke manuale (dopo deploy + abilitazione modulo in Utenze)**

1. Impostazioni → Utenze: abilita "Appuntamenti" al tuo utente. La voce compare nella sidebar.
2. `/hub/appuntamenti`: calendario settimana; crea un appuntamento → compare; trascinalo su un altro giorno → si sposta; aprilo → elimina. Prev/next settimana e "Oggi" funzionano.
3. Cronoprogramma (`/dashboard`): la striscia alta di card è sparita; resta una riga compatta coi numeri per giorno; niente più pulsante "+ Appuntamento".
4. Click sul numero di un giorno nel cronoprogramma → apre `/hub/appuntamenti?date=<giorno>` sulla settimana giusta.

- [ ] **Step 5: Working tree pulito**

Run: `git status`
Expected: tutto committato.

---

## Prossimo Passo

Tutti i task completati → usa **finishing-a-development-branch** per il merge (ff/rebase su origin/main) + push + cleanup worktree. Ricorda la consegna: dopo il deploy, abilitare il modulo "Appuntamenti" agli utenti che servono da Impostazioni → Utenze (nessuna SQL).
