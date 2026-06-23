# Permesso "Modifica interventi" assegnabile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare all'utenza Mara Boccia (e a chiunque altro via toggle in Utenze) il permesso di modificare ✎ e aggiungere foto 📷 alle voci dello storico interventi, senza poter cancellare 🗑 e senza renderla Admin Plus.

**Architecture:** Si scorpora un permesso granulare `canEditStorico` (unico punto di verità in `lib/moduleAccess.ts`) che è vero per gli Admin Plus o per chi ha il flag booleano `modificaInterventi` in `app_metadata`. I gate di modifica/foto delle route storico passano a questo permesso; la cancellazione resta su `requireAdminPlus`. Il flag si gestisce con un toggle nella pagina Utenze, salvato via l'endpoint PATCH già esistente.

**Tech Stack:** Next.js (App Router, route handlers `runtime = 'nodejs'`), React client components, Supabase Auth (`app_metadata`), Vitest, TypeScript, Tailwind con CSS variables `--brand-*`.

## Global Constraints

- **La cancellazione (🗑 / DELETE voce) resta riservata ad Admin Plus** (`requireAdminPlus` / `canManageUsers`). Non spostarla mai su `canEditStorico`.
- Il permesso è un **flag booleano top-level** `modificaInterventi` in `app_metadata` (accanto a `role` e `allowedModules`). Nessuna whitelist hardcoded, **nessuna SQL/migration**.
- **Admin Plus** ha sempre il permesso (implicito), a prescindere dal flag. Admin semplice e operatore lo hanno solo col flag.
- UI e messaggi in **italiano**.
- **Baseline lint/test del repo è in parte ROSSA**: i gate "verde" valgono come *"nessun nuovo problema introdotto dai file toccati"*. Verifica mirata con `npx vitest run lib/moduleAccess.test.ts` e `npx eslint <file toccati>`.
- **Seguire i pattern esistenti**: ogni route handler duplica localmente la sua funzione-gate (come già fa `requireAdminPlus` in 3 file). Non estrarre un helper condiviso.
- `buildAppMetadataUpdate`: i nuovi parametri del flag vanno **in coda** (append), per non rompere le 6 chiamate posizionali esistenti.

---

## File Structure

**Logica/permessi (test unit)**
- `lib/moduleAccess.ts` — nuovo `canEditStorico`; `extractAppMetadata` con campo `modificaInterventi`; `buildAppMetadataUpdate` con flag (append in coda).
- `lib/moduleAccess.test.ts` — test per `canEditStorico` e per il flag in `buildAppMetadataUpdate`.

**Backend (route handlers)**
- `app/api/admin/interventi/storico/voce/[voceId]/route.ts` — gate GET/PATCH → `requireEditStorico`; DELETE invariato.
- `app/api/admin/interventi/storico/voce/[voceId]/foto/route.ts` — gate POST → `requireEditStorico`.
- `app/api/admin/users/route.ts` — GET/POST/PATCH leggono/scrivono il flag.

**Frontend**
- `app/hub/interventi/page.tsx` — calcola due flag (`isAdminPlus`, `puoModificare`).
- `components/modules/interventi/StoricoInterventiClient.tsx` — prop `puoModificare`.
- `components/modules/interventi/StoricoTabella.tsx` — ✎ su `puoModificare`, 🗑 su `isAdminPlus`.
- `components/modules/interventi/ModaleFotoVoce.tsx` — prop `puoCaricare` (rinomina di `isAdminPlus`).
- `app/impostazioni/utenze/UtenzeClient.tsx` — toggle "Può modificare gli interventi".

---

## Task 1: Helper `canEditStorico` (logica pura, TDD)

**Files:**
- Modify: `lib/moduleAccess.ts`
- Test: `lib/moduleAccess.test.ts`

**Interfaces:**
- Consumes: `canManageUsers(role)`, `extractAppMetadata(value)` (esistenti).
- Produces: `canEditStorico(role: AssignableRole | null | undefined, appMetadata: unknown): boolean`.

- [ ] **Step 1: Aggiungi `canEditStorico` all'import del test**

In `lib/moduleAccess.test.ts`, estendi l'import esistente (righe 2-10) aggiungendo `canEditStorico`:

```ts
import {
  resolveUserRole,
  canAccessPathFromMetadata,
  buildAppMetadataUpdate,
  normalizeAllowedModules,
  prefillModulesForRole,
  fallbackModulesForRole,
  canManageUsers,
  canEditStorico,
} from './moduleAccess';
```

- [ ] **Step 2: Scrivi il test che fallisce**

Aggiungi in coda a `lib/moduleAccess.test.ts`:

```ts
describe('canEditStorico', () => {
  it('admin_plus può sempre, anche senza flag', () => {
    expect(canEditStorico('admin_plus', null)).toBe(true);
    expect(canEditStorico('admin_plus', { role: 'admin_plus' })).toBe(true);
  });
  it('operatore con flag modificaInterventi=true può', () => {
    expect(canEditStorico('operatore', { role: 'operatore', modificaInterventi: true })).toBe(true);
  });
  it('operatore senza flag / flag false / metadata vuoti NON può', () => {
    expect(canEditStorico('operatore', { role: 'operatore' })).toBe(false);
    expect(canEditStorico('operatore', { role: 'operatore', modificaInterventi: false })).toBe(false);
    expect(canEditStorico('operatore', null)).toBe(false);
    expect(canEditStorico('operatore', undefined)).toBe(false);
  });
  it('admin semplice senza flag NON può (solo admin_plus è implicito)', () => {
    expect(canEditStorico('admin', { role: 'admin' })).toBe(false);
  });
  it('admin semplice con flag può', () => {
    expect(canEditStorico('admin', { role: 'admin', modificaInterventi: true })).toBe(true);
  });
});
```

- [ ] **Step 3: Esegui il test e verifica che fallisce**

Run: `npx vitest run lib/moduleAccess.test.ts`
Expected: FAIL — `canEditStorico is not a function` / import non risolto.

- [ ] **Step 4: Estendi `extractAppMetadata` e implementa `canEditStorico`**

In `lib/moduleAccess.ts`, modifica `extractAppMetadata` (attualmente righe ~257-260) per dichiarare il nuovo campo:

```ts
function extractAppMetadata(value: unknown): { allowedModules?: unknown; role?: unknown; modificaInterventi?: unknown } | null {
  if (!value || typeof value !== 'object') return null;
  return value as { allowedModules?: unknown; role?: unknown; modificaInterventi?: unknown };
}
```

Poi aggiungi `canEditStorico` subito **dopo** `canManageUsers` (riga ~207):

```ts
/**
 * Può modificare/aggiungere foto alle voci dello storico interventi (NON cancellare).
 * Vero per gli Admin Plus (sempre) o per chi ha il flag `modificaInterventi` nei metadata.
 * La cancellazione resta separata (canManageUsers).
 */
export function canEditStorico(
  role: AssignableRole | null | undefined,
  appMetadata: unknown,
): boolean {
  if (canManageUsers(role)) return true;
  return extractAppMetadata(appMetadata)?.modificaInterventi === true;
}
```

- [ ] **Step 5: Esegui il test e verifica che passa**

Run: `npx vitest run lib/moduleAccess.test.ts`
Expected: PASS (tutti i `describe`, inclusi quelli preesistenti).

- [ ] **Step 6: Commit**

```bash
git add lib/moduleAccess.ts lib/moduleAccess.test.ts
git commit -m "feat(permessi): helper canEditStorico (modifica storico separata da admin_plus)"
```

---

## Task 2: Flag `modificaInterventi` in `buildAppMetadataUpdate` (logica pura, TDD)

**Files:**
- Modify: `lib/moduleAccess.ts`
- Test: `lib/moduleAccess.test.ts`

**Interfaces:**
- Produces: `buildAppMetadataUpdate(currentMetadataRole, currentAllowedModules, requestedRole, requestedModules, currentModificaInterventi?, requestedModificaInterventi?): { role: AssignableRole; allowedModules: AppModuleKey[]; modificaInterventi: boolean }`
- Consumed by: Task 5 (`app/api/admin/users/route.ts`).

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi in coda a `lib/moduleAccess.test.ts`:

```ts
describe('buildAppMetadataUpdate — flag modificaInterventi', () => {
  it('default false quando non corrente né richiesto', () => {
    const out = buildAppMetadataUpdate('operatore', undefined, undefined, ['mappa']);
    expect(out.modificaInterventi).toBe(false);
  });
  it('preserva il flag corrente quando non richiesto esplicitamente', () => {
    const out = buildAppMetadataUpdate('operatore', ['mappa'], undefined, ['mappa'], true, undefined);
    expect(out.modificaInterventi).toBe(true);
  });
  it('accende il flag quando richiesto true', () => {
    const out = buildAppMetadataUpdate('operatore', undefined, undefined, ['mappa'], false, true);
    expect(out.modificaInterventi).toBe(true);
  });
  it('spegne il flag quando richiesto false anche se corrente true', () => {
    const out = buildAppMetadataUpdate('operatore', undefined, undefined, ['mappa'], true, false);
    expect(out.modificaInterventi).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscono**

Run: `npx vitest run lib/moduleAccess.test.ts`
Expected: FAIL — `out.modificaInterventi` è `undefined` (campo non ancora ritornato).

- [ ] **Step 3: Estendi `buildAppMetadataUpdate`**

In `lib/moduleAccess.ts`, sostituisci l'intera funzione `buildAppMetadataUpdate` (attualmente righe ~303-318) con:

```ts
export function buildAppMetadataUpdate(
  currentMetadataRole: unknown,
  currentAllowedModules: unknown,
  requestedRole: AssignableRole | undefined,
  requestedModules: unknown,
  currentModificaInterventi?: unknown,
  requestedModificaInterventi?: boolean,
): { role: AssignableRole; allowedModules: AppModuleKey[]; modificaInterventi: boolean } {
  const effectiveRole = requestedRole ?? resolveAssignableRole(undefined, currentMetadataRole);
  const modulesInput =
    Array.isArray(requestedModules) ? requestedModules :
    Array.isArray(currentAllowedModules) ? currentAllowedModules :
    prefillModulesForRole(effectiveRole);
  const modificaInterventi =
    typeof requestedModificaInterventi === 'boolean'
      ? requestedModificaInterventi
      : currentModificaInterventi === true;
  return {
    role: effectiveRole,
    allowedModules: normalizeAllowedModules(modulesInput, effectiveRole),
    modificaInterventi,
  };
}
```

- [ ] **Step 4: Esegui i test e verifica che passano**

Run: `npx vitest run lib/moduleAccess.test.ts`
Expected: PASS — inclusi i 6 test preesistenti di `buildAppMetadataUpdate` (controllano solo `.role`/`.allowedModules`, il campo extra non li rompe).

- [ ] **Step 5: Commit**

```bash
git add lib/moduleAccess.ts lib/moduleAccess.test.ts
git commit -m "feat(permessi): buildAppMetadataUpdate gestisce il flag modificaInterventi"
```

---

## Task 3: Gate backend storico (modifica + foto)

**Files:**
- Modify: `app/api/admin/interventi/storico/voce/[voceId]/route.ts`
- Modify: `app/api/admin/interventi/storico/voce/[voceId]/foto/route.ts`

**Interfaces:**
- Consumes: `canEditStorico` (Task 1), `resolveAssignableRole`, `canManageUsers` (esistenti).

- [ ] **Step 1: `voce/[voceId]/route.ts` — import + nuovo gate**

Estendi l'import da `@/lib/moduleAccess` (riga 7) aggiungendo `canEditStorico`:

```ts
import { resolveAssignableRole, canManageUsers, canEditStorico } from '@/lib/moduleAccess';
```

Aggiungi la funzione `requireEditStorico` subito **dopo** `requireAdminPlus` (dopo la riga 28):

```ts
/** Gate per modifica/foto: admin_plus OPPURE flag modificaInterventi. NON copre la cancellazione. */
async function requireEditStorico(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveAssignableRole(profile?.role, user.app_metadata?.role);
  if (!canEditStorico(role, user.app_metadata))
    return NextResponse.json({ error: 'Non hai i permessi per modificare gli interventi.' }, { status: 403 });
  return true;
}
```

- [ ] **Step 2: `voce/[voceId]/route.ts` — usa il gate su GET e PATCH**

In `GET` (riga 34) sostituisci:
```ts
  const guard = await requireAdminPlus();
```
con:
```ts
  const guard = await requireEditStorico();
```

In `PATCH` (riga 53) sostituisci allo stesso modo `requireAdminPlus()` → `requireEditStorico()`.

**NON toccare `DELETE` (riga 113): resta `requireAdminPlus()`.**

- [ ] **Step 3: `voce/[voceId]/foto/route.ts` — import + nuovo gate**

Estendi l'import da `@/lib/moduleAccess` (riga 11) aggiungendo `canEditStorico`:

```ts
import { resolveAssignableRole, canManageUsers, canEditStorico } from '@/lib/moduleAccess';
```

Aggiungi `requireEditStorico` subito **dopo** `requireAdminPlus` (dopo la riga 30) — stessa funzione del Step 1:

```ts
/** Gate per upload foto: admin_plus OPPURE flag modificaInterventi. */
async function requireEditStorico(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveAssignableRole(profile?.role, user.app_metadata?.role);
  if (!canEditStorico(role, user.app_metadata))
    return NextResponse.json({ error: 'Non hai i permessi per modificare gli interventi.' }, { status: 403 });
  return true;
}
```

- [ ] **Step 4: `voce/[voceId]/foto/route.ts` — usa il gate sul POST**

In `POST` (riga 103) sostituisci:
```ts
  const guard = await requireAdminPlus();
```
con:
```ts
  const guard = await requireEditStorico();
```

Lascia `requireAdminPlus` definita anche se ora non più referenziata sarebbe un warning lint: **rimuovi la funzione `requireAdminPlus`** (righe 20-30) da `foto/route.ts`, dato che il POST era il suo unico uso e il GET usa `requireUser`. Verifica che `canManageUsers` resti importato solo se ancora usato: in `foto/route.ts` non è più usato dopo la rimozione → **togli `canManageUsers` dall'import** lasciando `import { resolveAssignableRole, canEditStorico } from '@/lib/moduleAccess';`.

> In `voce/[voceId]/route.ts` invece `requireAdminPlus` resta (la usa DELETE), quindi lì `canManageUsers` resta importato.

- [ ] **Step 5: Lint mirato sui due file**

Run: `npx eslint app/api/admin/interventi/storico/voce/[voceId]/route.ts app/api/admin/interventi/storico/voce/[voceId]/foto/route.ts`
Expected: nessun errore/warning sui due file (in particolare nessun `no-unused-vars`).

- [ ] **Step 6: Commit**

```bash
git add "app/api/admin/interventi/storico/voce/[voceId]/route.ts" "app/api/admin/interventi/storico/voce/[voceId]/foto/route.ts"
git commit -m "feat(permessi): modifica e foto storico aperte a canEditStorico (delete resta admin_plus)"
```

---

## Task 4: Frontend storico — due flag (✎/📷 vs 🗑)

**Files:**
- Modify: `app/hub/interventi/page.tsx`
- Modify: `components/modules/interventi/StoricoInterventiClient.tsx`
- Modify: `components/modules/interventi/StoricoTabella.tsx`
- Modify: `components/modules/interventi/ModaleFotoVoce.tsx`

**Interfaces:**
- `StoricoInterventiClient` prop: `{ staff: Staff[]; isAdminPlus: boolean; puoModificare: boolean }`
- `StoricoTabella` prop: aggiunge `puoModificare: boolean`
- `ModaleFotoVoce` prop: `isAdminPlus` rinominata in `puoCaricare: boolean`

- [ ] **Step 1: `page.tsx` — import + due flag**

Estendi l'import (riga 5) aggiungendo `canEditStorico`:

```ts
import { canManageUsers, resolveAssignableRole, canEditStorico } from '@/lib/moduleAccess';
```

Sostituisci la riga 20:
```ts
  const isAdminPlus = canManageUsers(resolveAssignableRole(profile?.role, user?.app_metadata?.role));
```
con:
```ts
  const role = resolveAssignableRole(profile?.role, user?.app_metadata?.role);
  const isAdminPlus = canManageUsers(role);
  const puoModificare = canEditStorico(role, user?.app_metadata);
```

Sostituisci il render (riga 30):
```tsx
      <StoricoInterventiClient staff={staff} isAdminPlus={isAdminPlus} puoModificare={puoModificare} />
```

- [ ] **Step 2: `StoricoInterventiClient.tsx` — prop e passaggi**

Cambia la firma (riga 49):
```tsx
export default function StoricoInterventiClient({ staff, isAdminPlus, puoModificare }: { staff: Staff[]; isAdminPlus: boolean; puoModificare: boolean }) {
```

Passa `puoModificare` a `StoricoTabella` (righe 188-194): aggiungi la prop `puoModificare={puoModificare}` accanto a `isAdminPlus`:
```tsx
        <StoricoTabella
          righe={righe}
          isAdminPlus={isAdminPlus}
          puoModificare={puoModificare}
          onFoto={(id) => setFotoVoceId(id)}
          onModifica={(id) => setModificaVoceId(id)}
          onCancella={cancella}
        />
```

Cambia `ModaleFotoVoce` (riga 224): da `isAdminPlus={isAdminPlus}` a `puoCaricare={puoModificare}`:
```tsx
      {fotoVoceId && <ModaleFotoVoce voceId={fotoVoceId} puoCaricare={puoModificare} onClose={() => setFotoVoceId(null)} />}
```

Cambia il gate della modale modifica (riga 225): da `isAdminPlus` a `puoModificare`:
```tsx
      {puoModificare && modificaVoceId && (
```

- [ ] **Step 3: `StoricoTabella.tsx` — prop + gate pulsanti**

Cambia la firma e il tipo (righe 39-47):
```tsx
export default function StoricoTabella({
  righe, isAdminPlus, puoModificare, onFoto, onModifica, onCancella,
}: {
  righe: RigaStorico[];
  isAdminPlus: boolean;
  puoModificare: boolean;
  onFoto: (voceId: string) => void;
  onModifica: (voceId: string) => void;
  onCancella: (voceId: string) => void;
}) {
```

Il pulsante ✎ (riga 91) passa da `{isAdminPlus && (` a `{puoModificare && (`:
```tsx
                  {puoModificare && (
                    <button
                      type="button"
                      onClick={() => onModifica(r.id)}
                      title="Modifica"
                      aria-label="Modifica"
                      className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
                    >
                      ✎
                    </button>
                  )}
```

Il pulsante 🗑 (riga 102) **resta** `{isAdminPlus && (` — non toccarlo.

- [ ] **Step 4: `ModaleFotoVoce.tsx` — rinomina prop**

Cambia la firma (righe 9-15):
```tsx
export default function ModaleFotoVoce({
  voceId, puoCaricare, onClose,
}: {
  voceId: string;
  puoCaricare: boolean;
  onClose: () => void;
}) {
```

Cambia il gate del blocco upload (riga 66): da `{isAdminPlus && (` a `{puoCaricare && (`:
```tsx
      {puoCaricare && (
```

- [ ] **Step 5: Lint + typecheck mirati**

Run: `npx eslint app/hub/interventi/page.tsx components/modules/interventi/StoricoInterventiClient.tsx components/modules/interventi/StoricoTabella.tsx components/modules/interventi/ModaleFotoVoce.tsx`
Expected: nessun errore sui file toccati.

Run: `npx tsc --noEmit`
Expected: nessun **nuovo** errore di tipo relativo a questi file (in particolare nessun errore su props mancanti/eccedenti `isAdminPlus`/`puoModificare`/`puoCaricare`).

- [ ] **Step 6: Commit**

```bash
git add app/hub/interventi/page.tsx components/modules/interventi/StoricoInterventiClient.tsx components/modules/interventi/StoricoTabella.tsx components/modules/interventi/ModaleFotoVoce.tsx
git commit -m "feat(permessi): storico mostra modifica/foto con puoModificare, delete resta admin_plus"
```

---

## Task 5: Backend Utenze — flag nel payload (GET/POST/PATCH)

**Files:**
- Modify: `app/api/admin/users/route.ts`

**Interfaces:**
- Consumes: `buildAppMetadataUpdate(... , currentModificaInterventi?, requestedModificaInterventi?)` (Task 2).
- Produces (GET): ogni riga utente include `modificaInterventi: boolean`. Consumato dal Task 6.

- [ ] **Step 1: GET — esponi il flag**

Nel `.map` di GET (righe 82-93), aggiungi al return della riga utente il campo:
```ts
      modificaInterventi: u.app_metadata?.modificaInterventi === true,
```
(per esempio subito dopo `allowedModules: getAllowedModulesForUser(u.app_metadata, role),`)

- [ ] **Step 2: POST — accetta e salva il flag**

Estendi il tipo del body (righe 114-119) aggiungendo `modificaInterventi?: boolean;`:
```ts
  const body = await req.json() as {
    username?: string;
    password?: string;
    role?: string;
    allowedModules?: AppModuleKey[];
    modificaInterventi?: boolean;
  };
```

Nella `createUser` (righe 133-138), aggiungi il flag in `app_metadata`:
```ts
    app_metadata: { role, allowedModules, modificaInterventi: body.modificaInterventi === true },
```

Nel return JSON dell'utente creato (righe 156-164), aggiungi:
```ts
      modificaInterventi: body.modificaInterventi === true,
```

- [ ] **Step 3: PATCH — leggi il corrente, estendi la condizione, passa il flag**

Estendi il tipo del body (righe 173-179) aggiungendo `modificaInterventi?: boolean;`.

Dopo aver letto `currentModules` (riga 188), aggiungi:
```ts
  const currentModifica = current?.user?.app_metadata?.modificaInterventi;
```

Sostituisci il blocco condizionale che costruisce `updates.app_metadata` (righe 213-220) con:
```ts
  if (requestedRole || Array.isArray(body.allowedModules) || typeof body.modificaInterventi === 'boolean') {
    updates.app_metadata = buildAppMetadataUpdate(
      currentMetaRole,
      currentModules,
      requestedRole,
      body.allowedModules,
      currentModifica,
      body.modificaInterventi,
    );
  }
```

- [ ] **Step 4: Lint mirato**

Run: `npx eslint app/api/admin/users/route.ts`
Expected: nessun errore sul file.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/users/route.ts
git commit -m "feat(permessi): endpoint Utenze legge/scrive il flag modificaInterventi"
```

---

## Task 6: Frontend Utenze — toggle "Può modificare gli interventi"

**Files:**
- Modify: `app/impostazioni/utenze/UtenzeClient.tsx`

**Interfaces:**
- Consumes (GET `/api/admin/users`): `modificaInterventi: boolean` per riga (Task 5).
- Invia (POST/PATCH): `modificaInterventi` nel payload.

- [ ] **Step 1: Estendi i tipi e lo stato**

In `UserRow` (righe 24-32) aggiungi il campo:
```ts
  modificaInterventi: boolean;
```

Nello stato `form` (righe 220-230) aggiungi `modificaInterventi: false`:
```ts
  const [form, setForm] = useState<{
    username: string;
    password: string;
    role: AssignableRole;
    allowedModules: AppModuleKey[];
    modificaInterventi: boolean;
  }>({
    username: '',
    password: '',
    role: 'operatore',
    allowedModules: prefillModulesForRole('operatore'),
    modificaInterventi: false,
  });
```

Nel reset del form dopo creazione (righe 352-357) aggiungi `modificaInterventi: false`:
```ts
      setForm({
        username: '',
        password: '',
        role: 'operatore',
        allowedModules: prefillModulesForRole('operatore'),
        modificaInterventi: false,
      });
```

- [ ] **Step 2: Aggiungi il campo ai payload POST e PATCH**

In `handleCreate`, payload (righe 332-337), aggiungi:
```ts
        modificaInterventi: form.modificaInterventi,
```

In `handleSave`, body (righe 372-378), aggiungi:
```ts
          modificaInterventi: user.modificaInterventi,
```

- [ ] **Step 3: Componente toggle riutilizzabile**

Aggiungi questo componente **prima** di `export default function UtenzeClient()` (cioè dopo il blocco `inputStyle`, riga ~203):

```tsx
// Toggle del permesso-azione "modifica interventi" (separato dai moduli di accesso).
// Per gli Admin Plus è sempre attivo e bloccato (segue il ruolo).
function TogglePermessoModifica({
  role, checked, onChange,
}: {
  role: AssignableRole;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const isPlus = role === 'admin_plus';
  const effective = isPlus ? true : checked;
  return (
    <label
      className="mt-5 flex items-start gap-2.5 rounded-[var(--radius-md)] border px-3 py-2.5 transition"
      style={{
        borderColor: effective ? 'var(--brand-primary)' : 'var(--brand-border)',
        backgroundColor: effective ? 'var(--brand-primary-soft)' : 'var(--brand-surface-muted)',
        cursor: isPlus ? 'default' : 'pointer',
        opacity: isPlus ? 0.7 : 1,
      }}
      title={isPlus ? 'Gli Admin Plus possono sempre modificare' : undefined}
    >
      <input
        type="checkbox"
        checked={effective}
        disabled={isPlus}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 shrink-0"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium" style={{ color: 'var(--brand-text-main)' }}>
          Può modificare gli interventi
        </span>
        <span className="block text-[11px]" style={{ color: 'var(--brand-text-muted)' }}>
          Correggere dati/esiti e aggiungere foto nello storico, senza poter cancellare.
        </span>
      </span>
    </label>
  );
}
```

- [ ] **Step 4: Inserisci il toggle nel form "Nuova utenza"**

Subito **dopo** il `<ModuleSelector ... onSelectGroup={selectCreateGroup} />` del blocco creazione (dopo riga 519, ancora dentro il `<div className="border-t ...">`), aggiungi:

```tsx
          <TogglePermessoModifica
            role={form.role}
            checked={form.modificaInterventi}
            onChange={(value) => setForm((prev) => ({ ...prev, modificaInterventi: value }))}
          />
```

- [ ] **Step 5: Inserisci il toggle nel pannello di modifica utente**

Subito **dopo** il `<ModuleSelector ... onSelectGroup={(keys, allSelected) => selectUserGroup(user.userId, keys, allSelected)} />` del pannello espanso (dopo riga 663, ancora dentro il `<div className="mt-5">`), aggiungi:

```tsx
                        <TogglePermessoModifica
                          role={user.role}
                          checked={user.modificaInterventi}
                          onChange={(value) => updateRow(user.userId, { modificaInterventi: value })}
                        />
```

- [ ] **Step 6: Lint + typecheck mirati**

Run: `npx eslint app/impostazioni/utenze/UtenzeClient.tsx`
Expected: nessun errore sul file.

Run: `npx tsc --noEmit`
Expected: nessun **nuovo** errore di tipo (in particolare `UserRow.modificaInterventi` coerente tra GET, stato e payload).

- [ ] **Step 7: Commit**

```bash
git add app/impostazioni/utenze/UtenzeClient.tsx
git commit -m "feat(permessi): toggle 'Può modificare gli interventi' in Utenze"
```

---

## Task 7: Verifica finale d'insieme

**Files:** nessuno (solo verifica; eventuali fix → commit dedicato).

- [ ] **Step 1: Test unit della logica**

Run: `npx vitest run lib/moduleAccess.test.ts`
Expected: PASS (vecchi + nuovi `canEditStorico` e flag).

- [ ] **Step 2: Lint mirato su tutti i file toccati**

Run:
```bash
npx eslint lib/moduleAccess.ts "app/api/admin/interventi/storico/voce/[voceId]/route.ts" "app/api/admin/interventi/storico/voce/[voceId]/foto/route.ts" app/api/admin/users/route.ts app/hub/interventi/page.tsx components/modules/interventi/StoricoInterventiClient.tsx components/modules/interventi/StoricoTabella.tsx components/modules/interventi/ModaleFotoVoce.tsx app/impostazioni/utenze/UtenzeClient.tsx
```
Expected: nessun errore/warning sui file toccati.

- [ ] **Step 3: Typecheck globale**

Run: `npx tsc --noEmit`
Expected: nessun **nuovo** errore rispetto al baseline (i tipi delle props e del flag combaciano end-to-end).

- [ ] **Step 4 (opzionale ma consigliato): Build Next**

Run: `npm run build`
Expected: build completata senza errori introdotti dai file toccati. Se il baseline build è già rotto per altre cause, confronta che gli unici errori non riguardino i file di questo piano.

---

## Verifica funzionale manuale (dopo il deploy)

Non è codice, ma chiude la feature:

1. Login come **Admin Plus** → **Impostazioni → Utenze**.
2. Espandere **Mara Boccia**; verificare che il modulo **Interventi** sia spuntato (altrimenti spuntarlo).
3. Attivare il toggle **"Può modificare gli interventi"** → **Salva modifiche**.
4. Login come **Mara** (o farle fare hard refresh per la cache del Service Worker) → in `/hub/interventi` devono comparire la matita ✎ e l'upload foto, **non** il cestino 🗑.
5. Controprova: un operatore **senza** il flag non vede ✎ né l'upload; un tentativo diretto di `PATCH .../voce/<id>` da non-abilitato torna **403**; un `DELETE` da non-Admin-Plus torna **403**.

---

## Self-Review (svolta in fase di scrittura del piano)

- **Copertura spec:** §3 `canEditStorico` → Task 1; §5.1 `buildAppMetadataUpdate` → Task 2; §4.1/§4.2 gate route → Task 3; §4.3 frontend storico → Task 4; §5.2 endpoint Utenze → Task 5; §5.3 toggle UI → Task 6; §8 test → Task 1/2/7; §10 passo operativo → sezione "Verifica funzionale manuale". Nessuna sezione scoperta.
- **Placeholder:** nessun TODO/TBD; ogni step di codice mostra il codice completo.
- **Coerenza tipi:** `canEditStorico(role, appMetadata)`, prop `puoModificare`/`puoCaricare`, `modificaInterventi: boolean` usati in modo identico tra Task 1↔3↔4 e Task 2↔5↔6.
- **Divergenza intenzionale dalla spec:** firma di `buildAppMetadataUpdate` con i parametri flag **in coda** (non interlacciati), per non rompere le 6 chiamate posizionali esistenti — vedi Global Constraints.
