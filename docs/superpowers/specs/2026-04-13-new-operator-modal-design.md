# Design: NewOperatorModal per Personale

**Data:** 2026-04-13  
**Scope:** Aggiungere funzionalità di creazione nuovo operatore dentro `/impostazioni/personale` senza nuove route

---

## Obiettivo

Permettere agli admin di creare un nuovo operatore (record `staff`) tramite un modal all'interno della pagina `/impostazioni/personale`. Il nuovo operatore appare immediatamente nella lista ordinato alfabeticamente, senza reload della pagina.

---

## Architettura

### File da modificare

| Azione | File | Responsabilità |
|--------|------|---|
| **CREA** | `app/impostazioni/personale/NewOperatorModal.tsx` | Modal client con form, validazioni locali, geocodificazione, submit API |
| **MODIFICA** | `app/impostazioni/personale/PersonaleClient.tsx` | Stato del modal, bottone "Nuovo Operatore", callback per aggiungere operatore alla lista |
| **MODIFICA** | `app/api/admin/personale/route.ts` | Handler POST per creazione nuovo operatore staff |

### Flow dati

```
PersonaleClient (state: showNewModal, lista rows)
    ↓
[bottone "+ Nuovo Operatore"] → setShowNewModal(true)
    ↓
NewOperatorModal (props: onClose, onCreated)
    ├─ Form locale (state camelCase)
    ├─ Validazioni locali
    ├─ geocodeTask (se indirizzi compilati)
    └─ POST /api/admin/personale
         ↓ (successo)
    onCreated(newStaff) → PersonaleClient aggiorna rows, chiude modal
         ↓ (errore)
    Mostra messaggio di errore inline (persiste)
```

---

## 1. NewOperatorModal.tsx

### Props

```typescript
type Props = {
  onClose: () => void;
  onCreated: (newStaff: Staff) => void;
};
```

### Stato interno

- **Form fields (camelCase):**
  - `displayName: string` (obbligatorio)
  - `validFrom: string | null` (opzionale, default null)
  - `validTo: string | null` (opzionale, default null)
  - `startAddress: string | null`
  - `startCap: string | null`
  - `startCity: string | null`
  - `homeAddress: string | null`
  - `homeCap: string | null`
  - `homeCity: string | null`

- **Stato UI:**
  - `error: string | null` — messaggio di errore (persiste fino a dismissione)
  - `loading: boolean` — durante submit

### Validazioni locali (pre-submit)

1. **displayName richiesto:**
   - Se vuoto o solo spazi: mostra errore "Nome operatore richiesto."
   - Blocca submit

2. **Validità date coerente:**
   - Se entrambe `validFrom` e `validTo` sono presenti: `validFrom <= validTo`
   - Se `validFrom > validTo`: mostra errore "La data fine validità non può precedere la data inizio."
   - Blocca submit

### Geocodificazione

**Se almeno uno tra `startAddress`, `startCap`, `startCity` è compilato:**
```typescript
const g = await geocodeTask({
  id: `new-staff-magazzino`,
  odl: '',
  indirizzo: startAddress ?? '',
  cap: startCap ?? '',
  citta: startCity ?? '',
  priorita: 0,
  fascia_oraria: '',
});
const startLat = g.lat ?? null;
const startLng = g.lng ?? null;
```

**Se almeno uno tra `homeAddress`, `homeCap`, `homeCity` è compilato:**
```typescript
const g = await geocodeTask({
  id: `new-staff-casa`,
  odl: '',
  indirizzo: homeAddress ?? '',
  cap: homeCap ?? '',
  citta: homeCity ?? '',
  priorita: 0,
  fascia_oraria: '',
});
const homeLat = g.lat ?? null;
const homeLng = g.lng ?? null;
```

**Nota:** Se geocodificazione fallisce (lat/lng null), il form continua comunque (non è bloccante). L'utente vede un avviso nel feedback di successo.

### Submit

1. Esegui validazioni locali (displayName, date range)
2. Se fallisce: mostra errore inline, return
3. Se ok: esegui geocodificazione (se indirizzi compilati)
4. Prepara body (convert camelCase → snake_case per l'API):
   ```typescript
   {
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
   }
   ```
5. POST a `/api/admin/personale`
6. Se risposta ok:
   - Chiama `onCreated(json.staff)` con il record completo dal backend
   - Chiude il modal
7. Se errore:
   - Mostra messaggio di errore inline
   - Non chiude il modal

### Stile

**Pattern seguito:** SendRequestModal (overlay centrato, header/footer)

**Overlay + Modal structure:**
```html
<div className="fixed inset-0 z-50">
  <div className="absolute inset-0 bg-black/40" onClick={onClose} />
  <div className="absolute left-1/2 top-1/2 w-[min(680px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl">
    {/* Header */}
    {/* Form */}
    {/* Footer */}
  </div>
</div>
```

**Input fields (come PersonaleClient):**
- Label: `mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]`
- Input: `w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm`

**Bottoni:**
- Primario: `bg-[var(--brand-primary)] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-[var(--brand-primary-hover)] disabled:opacity-50`
- Secondario: `border border-[var(--brand-border)] text-sm rounded-lg px-3 py-2`

**Feedback errore (inline):**
```typescript
{error && (
  <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
    {error}
  </div>
)}
```

**Layout form:**
- Nome: full width
- Date (valido dal, valido fino): 2 colonne su desktop
- Magazzino (indirizzo, CAP, città): 3 colonne su desktop (pattern PersonaleClient: `lg:grid-cols-[minmax(0,1fr)_120px_200px]`)
- Casa (indirizzo, CAP, città): 3 colonne su desktop (stesso pattern)

### Chiusura modal

- Bottone ✕ in header: chiama `onClose()`
- Click overlay scuro: chiama `onClose()`
- Bottone "Annulla": chiama `onClose()`
- Bottone "Crea" (success): chiama `onCreated()` e chiude

**Nessun warning se ci sono campi compilati.**

---

## 2. PersonaleClient.tsx — Modifiche

### Stato aggiunto

```typescript
const [showNewModal, setShowNewModal] = useState(false);
```

### Handler aggiunto

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

### Bottone "Nuovo Operatore"

Aggiungere nel header, dopo il filtro validità:

```tsx
<button
  type="button"
  onClick={() => setShowNewModal(true)}
  className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-primary-hover)]"
>
  + Nuovo Operatore
</button>
```

### Modal nel return

Prima della chiusura del `<div className="space-y-6">`:

```tsx
{showNewModal && (
  <NewOperatorModal
    onClose={() => setShowNewModal(false)}
    onCreated={handleOperatorCreated}
  />
)}
```

### Import aggiunto

```typescript
import NewOperatorModal from './NewOperatorModal';
```

---

## 3. POST /api/admin/personale — Aggiungere handler

Aggiungere dopo il PATCH esistente (non toccarlo):

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

### Logica validazione coordinate

- Se `startLat` o `startLng` sono NaN → errore (geocodificazione magazzino fallita)
- Se `homeLat` o `homeLng` sono NaN ma nessun indirizzo casa compilato → ok (sono null)
- Se nessun indirizzo magazzino compilato → `startLat` e `startLng` restano null, ok

---

## Checklist di verifica finale

- [ ] Modal si apre cliccando "+ Nuovo Operatore" in PersonaleClient
- [ ] Modal si chiude con ESC, click overlay scuro, o bottone Annulla (nessun warning)
- [ ] `displayName` vuoto blocca il submit con messaggio inline
- [ ] `validFrom > validTo` blocca il submit con messaggio inline
- [ ] Geocodificazione viene chiamata solo se almeno un campo indirizzo compilato
- [ ] Geocodificazione fallita: form continua, successo mostra avviso ma salva con coordinates null
- [ ] Nuovo operatore appare nella lista ordinato alfabeticamente senza reload
- [ ] POST /api/admin/personale restituisce il record completo inserito
- [ ] Errori API mostrati inline, persistono fino a dismissione
- [ ] Successo auto-chiude il modal (come PersonaleClient feedback)
- [ ] PATCH esistente non è stato modificato
- [ ] Stile coerente con SendRequestModal (overlay centrato) e CSS variables PersonaleClient
- [ ] Nessuna nuova pagina, nessuna modifica a SettingsSubNav

---

## Edge cases e decisioni di design

1. **Geocodificazione parziale:** Se un indirizzo (magazzino o casa) è compilato ma la geocodificazione fallisce, il form salva comunque con coordinate null. L'utente vede un avviso nel feedback di successo.

2. **Nessun warning su ESC/chiusura:** Se l'utente ha compilato campi e chiude il modal, non chiede conferma. Eventuali dati compilati vanno persi.

3. **Errori persistenti:** Gli errori di validazione o API rimangono visibili finché l'utente non li dismiss o corregge il form e riprova.

4. **Ordinamento alfabetico:** Il nuovo operatore viene inserito in posizione ordinata (localeCompare italiano) senza necessità di reload.

5. **Conversione camelCase → snake_case:** Avviene al submit lato client prima di inviare al backend. Il backend riceve e restituisce snake_case.
