# NewOperatorModal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add operator creation modal to `/impostazioni/personale` with form validation, geocoding, and API integration.

**Architecture:** Three files: NewOperatorModal component (form + state + geocoding + submit), PersonaleClient integration (modal state + button + handler), POST endpoint in route.ts (validation + insert).

**Tech Stack:** Next.js App Router, React hooks, Supabase admin, geocodeTask utility.

---

## File Structure

```
app/impostazioni/personale/
  ├── NewOperatorModal.tsx (NEW)
  ├── PersonaleClient.tsx (MODIFY)
  └── page.tsx (no changes)

app/api/admin/personale/
  └── route.ts (MODIFY: add POST handler)
```

---

## Task 1: Create NewOperatorModal.tsx — Basic Structure

**Files:**
- Create: `app/impostazioni/personale/NewOperatorModal.tsx`

- [ ] **Step 1: Create file with component skeleton and props**

Create `app/impostazioni/personale/NewOperatorModal.tsx`:

```typescript
'use client';

import { useState } from 'react';
import type { Staff } from '@/types';

type Props = {
  onClose: () => void;
  onCreated: (newStaff: Staff) => void;
};

export default function NewOperatorModal({ onClose, onCreated }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [validFrom, setValidFrom] = useState<string | null>(null);
  const [validTo, setValidTo] = useState<string | null>(null);
  const [startAddress, setStartAddress] = useState<string | null>(null);
  const [startCap, setStartCap] = useState<string | null>(null);
  const [startCity, setStartCity] = useState<string | null>(null);
  const [homeAddress, setHomeAddress] = useState<string | null>(null);
  const [homeCap, setHomeCap] = useState<string | null>(null);
  const [homeCity, setHomeCity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="fixed inset-0 z-50">
      {/* overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      
      {/* modal */}
      <div className="absolute left-1/2 top-1/2 w-[min(680px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold">Nuovo Operatore</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-neutral-600 hover:text-black"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        <form className="px-5 py-4 space-y-4">
          {/* Nome */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
              Nome e Cognome
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Nome operatore..."
              className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                Valido dal
              </label>
              <input
                type="date"
                value={validFrom ?? ''}
                onChange={(e) => setValidFrom(e.target.value || null)}
                className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                Valido fino al
              </label>
              <input
                type="date"
                value={validTo ?? ''}
                onChange={(e) => setValidTo(e.target.value || null)}
                className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Magazzino */}
          <div>
            <label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
              Indirizzo magazzino
            </label>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_120px_200px]">
              <div>
                <input
                  type="text"
                  value={startAddress ?? ''}
                  onChange={(e) => setStartAddress(e.target.value || null)}
                  placeholder="Via, piazza, civico..."
                  className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={startCap ?? ''}
                  onChange={(e) => setStartCap(e.target.value || null)}
                  placeholder="CAP"
                  className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={startCity ?? ''}
                  onChange={(e) => setStartCity(e.target.value || null)}
                  placeholder="Città"
                  className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Casa */}
          <div>
            <label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
              Indirizzo casa (reperibile)
            </label>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_120px_200px]">
              <div>
                <input
                  type="text"
                  value={homeAddress ?? ''}
                  onChange={(e) => setHomeAddress(e.target.value || null)}
                  placeholder="Via, piazza, civico..."
                  className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={homeCap ?? ''}
                  onChange={(e) => setHomeCap(e.target.value || null)}
                  placeholder="CAP"
                  className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={homeCity ?? ''}
                  onChange={(e) => setHomeCity(e.target.value || null)}
                  placeholder="Città"
                  className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Error feedback */}
          {error && (
            <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
              {error}
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-primary-hover)] disabled:opacity-50"
            >
              {loading ? 'Creazione...' : 'Crea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify component renders without errors**

Open `app/impostazioni/personale/page.tsx` in browser. No errors in console yet (no modal shown, just skeleton exists).

---

## Task 2: Add Local Validations

**Files:**
- Modify: `app/impostazioni/personale/NewOperatorModal.tsx:1-250`

- [ ] **Step 1: Extract validation logic into helper functions**

Add at top of file after imports:

```typescript
function validateDisplayName(name: string): string | null {
  if (!name.trim()) {
    return 'Nome operatore richiesto.';
  }
  return null;
}

function validateDateRange(from: string | null, to: string | null): string | null {
  if (from && to && from > to) {
    return 'La data fine validità non può precedere la data inizio.';
  }
  return null;
}
```

- [ ] **Step 2: Create handleSubmit function with validations**

Inside component, before return statement, add:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  // Clear previous error
  setError(null);
  
  // Validate displayName
  const nameError = validateDisplayName(displayName);
  if (nameError) {
    setError(nameError);
    return;
  }
  
  // Validate date range
  const dateError = validateDateRange(validFrom, validTo);
  if (dateError) {
    setError(dateError);
    return;
  }
  
  // TODO: Geocodificazione e submit
};
```

- [ ] **Step 3: Wire form onSubmit**

Change `<form className="px-5 py-4 space-y-4">` to:

```typescript
<form className="px-5 py-4 space-y-4" onSubmit={handleSubmit}>
```

- [ ] **Step 4: Test validation locally**

In browser:
- Click "Crea" without filling name → error "Nome operatore richiesto."
- Fill name, set validFrom = "2026-05-01", validTo = "2026-04-01" → click "Crea" → error "La data fine validità non può precedere..."
- Fill both name and valid dates → error clears, proceed to geocoding step

---

## Task 3: Add Geocoding Logic

**Files:**
- Modify: `app/impostazioni/personale/NewOperatorModal.tsx:1-250`

- [ ] **Step 1: Add geocodeTask import**

At top after imports:

```typescript
import { geocodeTask } from '@/utils/routing';
```

- [ ] **Step 2: Create geocoding helper function**

Before `handleSubmit`, add:

```typescript
async function geocodeAddresses() {
  let startLat: number | null = null;
  let startLng: number | null = null;
  let homeLat: number | null = null;
  let homeLng: number | null = null;

  // Geocode magazzino if any field is filled
  if (startAddress || startCap || startCity) {
    const g = await geocodeTask({
      id: 'new-staff-magazzino',
      odl: '',
      indirizzo: startAddress ?? '',
      cap: startCap ?? '',
      citta: startCity ?? '',
      priorita: 0,
      fascia_oraria: '',
    });
    startLat = g.lat ?? null;
    startLng = g.lng ?? null;
  }

  // Geocode casa if any field is filled
  if (homeAddress || homeCap || homeCity) {
    const g = await geocodeTask({
      id: 'new-staff-casa',
      odl: '',
      indirizzo: homeAddress ?? '',
      cap: homeCap ?? '',
      citta: homeCity ?? '',
      priorita: 0,
      fascia_oraria: '',
    });
    homeLat = g.lat ?? null;
    homeLng = g.lng ?? null;
  }

  return { startLat, startLng, homeLat, homeLng };
}
```

- [ ] **Step 3: Call geocoding in handleSubmit**

Replace `// TODO: Geocodificazione e submit` with:

```typescript
setLoading(true);

try {
  const { startLat, startLng, homeLat, homeLng } = await geocodeAddresses();

  // TODO: Send to API
```

And before the closing `return` of `handleSubmit`, add:

```typescript
} catch (err) {
  setError(err instanceof Error ? err.message : 'Errore geocodificazione.');
} finally {
  setLoading(false);
}
```

- [ ] **Step 4: Test geocoding calls**

In browser:
- Fill only magazzino fields (address, CAP, city) → click "Crea" → check browser network tab, geocodeTask request is sent
- Fill only casa fields → geocodeTask for casa is sent
- Fill both → both geocode requests sent

---

## Task 4: Add API Submit and Error Handling

**Files:**
- Modify: `app/impostazioni/personale/NewOperatorModal.tsx:1-250`

- [ ] **Step 1: Add API call in handleSubmit**

Replace `// TODO: Send to API` with:

```typescript
const body = {
  displayName,
  validFrom,
  validTo,
  startAddress,
  startCap,
  startCity,
  startLat,
  startLng,
  homeAddress,
  homeCap,
  homeCity,
  homeLat,
  homeLng,
};

const res = await fetch('/api/admin/personale', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const json = await res.json() as { error?: string; staff?: Staff };

if (!res.ok) {
  throw new Error(json.error ?? 'Errore creazione operatore.');
}

// Success: call callback and close modal
if (json.staff) {
  onCreated(json.staff);
}
```

- [ ] **Step 2: Test API submission (will fail without POST handler)**

In browser:
- Fill complete form with all valid data → click "Crea" → expect 404 or error (POST handler doesn't exist yet)
- Check network tab shows POST to `/api/admin/personale` with correct body

---

## Task 5: Add ESC Key Handler and Polish

**Files:**
- Modify: `app/impostazioni/personale/NewOperatorModal.tsx:1-250`

- [ ] **Step 1: Add useEffect for ESC key**

After state declarations, add:

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [onClose]);
```

- [ ] **Step 2: Add useEffect import**

Change import from:
```typescript
import { useState } from 'react';
```

To:
```typescript
import { useState, useEffect } from 'react';
```

- [ ] **Step 3: Test ESC key**

In browser:
- Open modal → press ESC → modal closes
- Verify overlay click also closes (already implemented)
- Verify "Annulla" button closes

---

## Task 6: Integrate Modal into PersonaleClient

**Files:**
- Modify: `app/impostazioni/personale/PersonaleClient.tsx:1-30`

- [ ] **Step 1: Add modal state**

After line 29 (`const [feedback, setFeedback] = useState<Feedback>(null);`), add:

```typescript
const [showNewModal, setShowNewModal] = useState(false);
```

- [ ] **Step 2: Add import for NewOperatorModal**

At top of file after imports (around line 6), add:

```typescript
import NewOperatorModal from './NewOperatorModal';
```

- [ ] **Step 3: Add handleOperatorCreated handler**

After `showFeedback` function (around line 59), add:

```typescript
const handleOperatorCreated = (newStaff: Staff) => {
  setRows((prev) =>
    [...prev, newStaff].sort((a, b) =>
      a.display_name.localeCompare(b.display_name, 'it', { sensitivity: 'base' })
    )
  );
  setShowNewModal(false);
};
```

- [ ] **Step 4: Test handler logic**

In code: verify `localeCompare` with 'it' locale is correct for Italian sorting. No browser test yet (modal not visible).

---

## Task 7: Add Button and Modal Rendering

**Files:**
- Modify: `app/impostazioni/personale/PersonaleClient.tsx:152-198`

- [ ] **Step 1: Add "+ Nuovo Operatore" button**

Inside the filter buttons div (after line 196), add:

```typescript
<button
  type="button"
  onClick={() => setShowNewModal(true)}
  className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-primary-hover)]"
>
  + Nuovo Operatore
</button>
```

- [ ] **Step 2: Add modal render**

Before closing `</div>` of the main container (before line 380), add:

```typescript
{showNewModal && (
  <NewOperatorModal
    onClose={() => setShowNewModal(false)}
    onCreated={handleOperatorCreated}
  />
)}
```

- [ ] **Step 3: Test button and modal visibility**

In browser at `/impostazioni/personale`:
- See "+ Nuovo Operatore" button
- Click button → modal appears
- Click "Annulla" or ESC → modal closes
- Verify button layout doesn't break (should be on same line as filters)

---

## Task 8: Implement POST Handler in route.ts

**Files:**
- Modify: `app/api/admin/personale/route.ts:119+`

- [ ] **Step 1: Add POST handler**

At end of file (after PATCH function), add:

```typescript
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as {
    displayName?: string;
    validFrom?: string | null;
    validTo?: string | null;
    startAddress?: string | null;
    startCap?: string | null;
    startCity?: string | null;
    startLat?: number | null;
    startLng?: number | null;
    homeAddress?: string | null;
    homeCap?: string | null;
    homeCity?: string | null;
    homeLat?: number | null;
    homeLng?: number | null;
  };

  // Validazione displayName
  const displayName = String(body.displayName ?? '').trim();
  if (!displayName) {
    return NextResponse.json({ error: 'Nome operatore richiesto.' }, { status: 400 });
  }

  // Normalizzazione e validazione date
  const validFrom = normalizeNullableDate(body.validFrom);
  const validTo = normalizeNullableDate(body.validTo);
  if (validFrom === '' || validTo === '') {
    return NextResponse.json({ error: 'Formato data non valido. Usa YYYY-MM-DD.' }, { status: 400 });
  }
  if (validFrom && validTo && validFrom > validTo) {
    return NextResponse.json({ error: 'La data fine validità non può precedere la data inizio.' }, { status: 400 });
  }

  // Normalizzazione coordinate magazzino
  const startLat = normalizeNullableNumber(body.startLat);
  const startLng = normalizeNullableNumber(body.startLng);
  if (Number.isNaN(startLat) || Number.isNaN(startLng)) {
    return NextResponse.json({ error: 'Coordinate magazzino non valide.' }, { status: 400 });
  }

  // Normalizzazione coordinate casa
  const homeLat = normalizeNullableNumber(body.homeLat);
  const homeLng = normalizeNullableNumber(body.homeLng);
  // Se casa è compilata, le coordinate devono essere valide
  const hasHomeAddress = !!(body.homeAddress || body.homeCap || body.homeCity);
  if (hasHomeAddress && (Number.isNaN(homeLat) || Number.isNaN(homeLng))) {
    return NextResponse.json({ error: 'Indirizzo casa compilato ma geocodificazione fallita.' }, { status: 400 });
  }

  // Insert
  const { data, error } = await supabaseAdmin
    .from('staff')
    .insert({
      display_name: displayName,
      valid_from: validFrom,
      valid_to: validTo,
      start_address: normalizeNullableString(body.startAddress),
      start_cap: normalizeNullableString(body.startCap),
      start_city: normalizeNullableString(body.startCity),
      start_lat: startLat,
      start_lng: startLng,
      home_address: normalizeNullableString(body.homeAddress),
      home_cap: normalizeNullableString(body.homeCap),
      home_city: normalizeNullableString(body.homeCity),
      home_lat: homeLat,
      home_lng: homeLng,
    })
    .select('id, display_name, valid_from, valid_to, start_address, start_cap, start_city, start_lat, start_lng, home_address, home_cap, home_city, home_lat, home_lng')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, staff: data });
}
```

- [ ] **Step 2: Verify PATCH handler is unchanged**

Scroll up and confirm `export async function PATCH(req: NextRequest)` at line 42 is identical to before. If modified, revert.

- [ ] **Step 3: Test POST handler**

In browser:
- Fill form with valid data → click "Crea" → modal closes, new operator appears in list
- Fill form with invalid date range → submit → error message shown
- Fill form but leave name empty → submit → error "Nome operatore richiesto."
- Check network tab: POST returns 200 with `{ ok: true, staff: {...} }`

---

## Task 9: End-to-End Verification Checklist

**Files:**
- Test: Full feature across all three files

- [ ] **Step 1: Modal opens and closes**

Open `/impostazioni/personale`:
- Click "+ Nuovo Operatore" → modal appears with title "Nuovo Operatore"
- Click ✕ button → modal closes
- Click "+ Nuovo Operatore" again → click overlay → modal closes
- Click "+ Nuovo Operatore" again → press ESC → modal closes
- **Result:** All three close methods work ✓

- [ ] **Step 2: Form validation works**

- Click "Crea" without filling name → error "Nome operatore richiesto." appears
- Fill name = "Marco Rossi"
- Fill validFrom = "2026-05-01", validTo = "2026-04-01"
- Click "Crea" → error "La data fine validità non può precedere..." appears
- Fix dates: validFrom = "2026-04-01", validTo = "2026-05-01"
- Click "Crea" → no validation error, proceeds to submit
- **Result:** Validations block invalid submissions ✓

- [ ] **Step 3: Geocoding happens when addresses filled**

- Fill only name = "Test" and magazzino address = "Via Roma 1, 50100, Firenze"
- Fill both dates
- Click "Crea" → check network tab: ONE geocodeTask request for magazzino
- **Result:** Geocoding called for magazzino ✓

- Repeat with only casa address → one geocodeTask for casa ✓
- Repeat with both → two geocodeTask calls ✓

- [ ] **Step 4: New operator appears in list**

- Fill complete form:
  - name = "Giovanni Bianchi"
  - validFrom = "2026-04-13"
  - validTo = "2026-12-31"
  - startAddress = "Via dei Servi 5"
  - startCap = "50122"
  - startCity = "Firenze"
  - No home address
- Click "Crea"
- Modal closes automatically
- New operator "Giovanni Bianchi" appears in list
- Verify it's alphabetically sorted (between existing names)
- **Result:** New operator inserted, sorted, visible without reload ✓

- [ ] **Step 5: API errors handled**

Force an API error (temporarily modify backend to return error):
- Fill form and submit → error message appears inline (in red box)
- Error persists (doesn't auto-close)
- Click "Annulla" → error clears, modal closes
- OR modify form and submit again → new request sent
- **Result:** Error handling works ✓

- [ ] **Step 6: PATCH endpoint unchanged**

- Edit existing operator (change date or address)
- Click "Salva" → existing PATCH functionality works
- Verify no changes to PATCH logic
- **Result:** PATCH unmodified ✓

- [ ] **Step 7: Auth guard works**

- If not logged in, attempt POST → get 401 "Non autenticato"
- If logged in as non-admin, POST → get 403 "Accesso riservato agli admin"
- If logged in as admin, POST → succeeds
- **Result:** requireAdmin guard working ✓

---

## Self-Review Against Spec

**Spec coverage:**
- ✓ NewOperatorModal.tsx created with form state (camelCase), validations, geocoding, submit
- ✓ PersonaleClient.tsx modified with modal state, button, handler, sorted insert
- ✓ POST /api/admin/personale added with full validation and insert logic
- ✓ All checklist items addressable through tests above

**Placeholder scan:**
- ✓ No TBD, TODO, or "add appropriate" left in tasks
- ✓ All code blocks complete and runnable
- ✓ All commands exact with expected output

**Type consistency:**
- ✓ Staff type used correctly
- ✓ Form state camelCase, API body camelCase, backend snake_case conversion
- ✓ `onCreated` callback receives full Staff object from backend
- ✓ Error state is `string | null` everywhere

**No spec gaps:**
- ✓ All 13 checklist items covered
- ✓ All edge cases (geocoding failure, no address, date validation) in tasks
- ✓ All styling (CSS variables, layout grid) follows existing patterns

---

Plan complete and saved to `docs/superpowers/plans/2026-04-13-new-operator-modal.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast feedback loops

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch through with checkpoints

Quale preferisci?
