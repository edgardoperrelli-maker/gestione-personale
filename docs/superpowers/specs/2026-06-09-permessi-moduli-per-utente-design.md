# Permessi: ruoli precompilati + moduli abilitabili per-utente

- **Data:** 2026-06-09
- **Stato:** design approvato in brainstorming, in attesa di review dello spec
- **Branch:** `feat/permessi-moduli-per-utente`

## Problema

Oggi nel modulo Impostazioni → Utenze il **ruolo decide rigidamente i moduli**, con
forzature applicate a ogni salvataggio in `normalizeAllowedModules()`
([lib/moduleAccess.ts](../../../lib/moduleAccess.ts)):

- agli **admin** vengono sempre aggiunti *tutti* i moduli admin (non se ne può togliere
  nessuno);
- agli **operatori** vengono sempre rimossi `impostazioni`/`live`/`lista-attesa` e
  viene **forzato `sopralluoghi` sempre attivo**.

Risultato: le checkbox dei moduli nella pagina Utenze sono in gran parte decorative.
L'admin non ha un vero controllo per-utente.

L'obiettivo: **il ruolo deve solo precompilare** un set di default, e poi si deve poter
**abilitare/disabilitare liberamente i moduli per ogni utente**.

## Decisioni prese (brainstorming)

1. **I toggle dei moduli sono la fonte di verità** per ciò che ogni utente vede e può
   aprire. Il ruolo serve solo a: (a) precompilare i toggle, (b) pilotare la premialità
   (`admin_plus`), (c) definire il tier dati `profile.role` per la RLS.
2. **`Impostazioni` resta legato al ruolo admin**: un operatore non lo riceverà mai.
   Guard di sezione (layout/middleware) restano basati sul ruolo admin.
3. **Live, Lista attesa, Misuratori** diventano **liberamente assegnabili anche agli
   operatori**: i loro guard di pagina passano da controllo-ruolo a controllo-modulo.
4. **Pre-fill ruolo:** operatore → *vuoto*; admin/admin_plus → *tutti e 10*.
5. **Anti-lockout: entrambe le barriere.** Vedi punto 7 — collocate sul ruolo
   `admin_plus`, perché la gestione Utenze è sua esclusiva.
6. **La sezione Utenze è esclusiva di `admin_plus`.** Un admin normale vede la sezione
   Impostazioni (Personale, Territori, Hotel, …) ma **non** la gestione Utenze, e l'API
   `/api/admin/users` richiede `admin_plus`.

## Modello finale

### Ruoli
Invariati come tipi (`admin_plus`, `admin`, `operatore`); a livello di autorizzazione
`admin_plus` ≡ `admin` (vedi `resolveUserRole`). Novità: **solo `admin_plus` gestisce
le Utenze**.

### Regole per modulo

| Modulo | Accesso | Pre-fill operatore | Note |
|---|---|---|---|
| dashboard, hotel-calendar, rapportini, mappa, interventi, sopralluoghi | Toggle libero per chiunque | escluso (vuoto) | Niente più forzatura (sopralluoghi non più imposto) |
| live, lista-attesa, misuratori | Toggle libero **anche per operatori** | escluso (vuoto) | Guard di pagina → su modulo. Badge "sensibile" in UI |
| impostazioni | **Solo ruolo admin/admin_plus** | mai | Checkbox bloccata in UI: ✓ per admin, ✗ per operatore. Guard sezione invariati |

### Sotto-gate: Utenze = `admin_plus`
Il modulo `impostazioni` apre l'**intera sezione** per admin e admin_plus, ma la
sotto-pagina **Utenze** e la sua API sono riservate ad `admin_plus`.

## Modifiche dettagliate

### 1. `lib/moduleAccess.ts` (core)

- **Flag modulo:** mantieni `adminOnly` su live/lista-attesa/misuratori/impostazioni con
  nuova semantica = "sensibile" (escluso dai default operatore + badge UI). Aggiungi
  `requiresAdminRole?: boolean`, impostato **solo** su `impostazioni` (gate di ruolo
  forte).
- **`normalizeAllowedModules(input, role)`** → solo validazione contro `ALL_MODULE_KEYS`,
  con **un unico invariante**: `impostazioni` ∈ risultato ⟺ `isAdminAssignableRole(role)`.
  Nessun'altra forzatura (niente più `sopralluoghi` imposto, niente rimozione di
  live/lista-attesa per gli operatori).

  ```ts
  export function normalizeAllowedModules(input: unknown, role?: AssignableRole | null): AppModuleKey[] {
    const raw = Array.isArray(input) ? input : [];
    const set = new Set<AppModuleKey>(ALL_MODULE_KEYS.filter((k) => raw.includes(k)));
    if (isAdminAssignableRole(role)) set.add('impostazioni');
    else set.delete('impostazioni');
    return ALL_MODULE_KEYS.filter((k) => set.has(k)); // ordine stabile
  }
  ```

- **`prefillModulesForRole(role)`** (template UI): admin/admin_plus → tutti e 10;
  operatore → `[]`.
- **`fallbackModulesForRole(role)`** (solo quando `app_metadata.allowedModules` è
  **assente** — utenti legacy): admin/admin_plus → tutti e 10; operatore → set operativo
  non-`adminOnly` (i 6 moduli, comportamento attuale). **Asimmetria voluta**: i nuovi
  operatori partono vuoti, i legacy senza metadata conservano i 6 moduli per non perdere
  accesso.
- **`getAllowedModulesForUser(appMetadata, role)`** → se `allowedModules` non è un array,
  ritorna `fallbackModulesForRole`; altrimenti `normalizeAllowedModules`.
- **`canManageUsers(role)`** → `role === 'admin_plus'` (predicato per la sezione Utenze).
- **`canAccessPath(pathname, allowedModules, role)`** → rimuovi il blocco generico
  `adminOnly && role !== 'admin'`; mantieni il gate di ruolo **solo** per
  `requiresAdminRole`:

  ```ts
  const m = findModuleByPath(pathname);
  if (!m) return true;
  if (m.requiresAdminRole && role !== 'admin') return false; // solo impostazioni
  return allowedModules.includes(m.key);
  ```

- **`buildAppMetadataUpdate(currentMetadataRole, currentAllowedModules, requestedRole, requestedModules)`**
  → niente forzatura; se `requestedModules` non è un array preserva
  `currentAllowedModules` (o il pre-fill del ruolo). Applica `normalizeAllowedModules`
  con il ruolo effettivo (mantiene l'invariante `impostazioni`).

### 2. Gating di navigazione

- [middleware.ts](../../../middleware.ts): **nessuna modifica di codice** — la logica
  passa per `canAccessPath`, che ora gabella sui moduli (e su `requiresAdminRole` per
  `impostazioni`). NB: il middleware matcha `/impostazioni/utenze` sul modulo
  `impostazioni`; il sotto-gate `admin_plus` è a livello di pagina/API (sotto).
- [app/hub/live/page.tsx](../../../app/hub/live/page.tsx): `role !== 'admin'` →
  `!getAllowedModulesForUser(...).includes('live')` → redirect `/hub`.
- [app/hub/lista-attesa/page.tsx](../../../app/hub/lista-attesa/page.tsx): idem con
  `'lista-attesa'`.
- [app/hub/misuratori/page.tsx](../../../app/hub/misuratori/page.tsx): aggiungi guard
  server di coerenza (difesa in profondità) su `'misuratori'`; oggi è solo client
  (`AuthGate`) + middleware.
- [app/impostazioni/layout.tsx](../../../app/impostazioni/layout.tsx): **invariato** nel
  gate (resta `effectiveRole !== 'admin' → redirect`); sistema solo `roleLabel`
  (non più hardcoded `'Admin'`, usa `ASSIGNABLE_ROLE_LABELS`).

### 3. Sotto-gate Utenze = `admin_plus`

- [app/impostazioni/utenze/page.tsx](../../../app/impostazioni/utenze/page.tsx): rendi
  `async`, risolvi il ruolo e `if (!canManageUsers(resolveAssignableRole(...))) redirect('/impostazioni')`.
- [app/api/admin/users/route.ts](../../../app/api/admin/users/route.ts): `requireAdmin`
  → **`requireAdminPlus`** (controllo `resolveAssignableRole(...) === 'admin_plus'`) su
  tutti i metodi (GET/POST/PATCH/DELETE).
- [app/impostazioni/page.tsx](../../../app/impostazioni/page.tsx): converti a **server
  component**, risolvi il ruolo e **nascondi la card "Utenze"** ai non-`admin_plus`.
- [components/layout/SettingsSubNav.tsx](../../../components/layout/SettingsSubNav.tsx):
  prop `isAdminPlus`; nascondi il tab "Utenze" se falso. Passa il valore dal punto di
  montaggio (oggi [HotelClient](../../../app/impostazioni/hotel/HotelClient.tsx), via la
  sua pagina server).

> La sicurezza è nei guard **server** (pagina Utenze + API). Nascondere card/tab è UX:
> anche se un admin normale vedesse la card, il click verrebbe rediretto.

### 4. Anti-lockout (entrambe le barriere, lato server)

Collocate su `admin_plus` (gestione Utenze esclusiva). In
[app/api/admin/users/route.ts](../../../app/api/admin/users/route.ts):

- **PATCH** che declassa il target da `admin_plus` (requestedRole presente e ≠
  `admin_plus`, mentre il ruolo corrente è `admin_plus`):
  - target = utente loggato → 403 "Non puoi rimuovere a te stesso il ruolo Admin Plus."
  - conteggio `admin_plus` ≤ 1 → 403 "Deve restare almeno un Admin Plus."
- **DELETE** di un `admin_plus`:
  - self già bloccato (vincolo esistente);
  - conteggio `admin_plus` ≤ 1 → 403 "Deve restare almeno un Admin Plus."
- Conteggio via `supabaseAdmin.auth.admin.listUsers` + `resolveAssignableRole` su ogni
  utente.

### 5. UI Utenze ([UtenzeClient.tsx](../../../app/impostazioni/utenze/UtenzeClient.tsx))

- Rimuovi tutte le chiamate a `applyModules()` / forzatura. Un toggle aggiunge/rimuove e
  basta.
- Cambio ruolo (creazione **e** modifica) → moduli = `prefillModulesForRole(role)`.
- Checkbox `Impostazioni`: **bloccata** (disabled) e pilotata dal ruolo (✓ admin/admin_plus,
  ✗ operatore); helper "Segue il ruolo: sempre attivo per gli admin, mai per gli operatori".
- Checkbox live/lista-attesa/misuratori: **attive per tutti**, con badge "Sensibile".
- `currentUserId` aggiunto alla risposta GET: in UI **disabilita il cambio del proprio
  ruolo** (no auto-declassamento da admin_plus); gli errori "ultimo Admin Plus" arrivano
  dal server.
- Pulsantino "Reimposta ai default del ruolo" → riporta i toggle a `prefillModulesForRole`.
- Aggiorna testi guida (rimuovi il riferimento errato a "Impostazioni riservato agli
  admin" dove non pertinente).
- `availableModules` dalla GET include `adminOnly` e `requiresAdminRole` per pilotare
  badge e stato bloccato.

### 6. Rifinitura minore

- [app/hub/page.tsx](../../../app/hub/page.tsx): il promo "Live" oggi appare per `isAdmin`;
  cambialo per apparire se `allowedModules.includes('live')` (coerenza con il nuovo
  modello). Richiede di calcolare `allowedModules` nella pagina.

### 7. Test ([lib/moduleAccess.test.ts](../../../lib/moduleAccess.test.ts))

Riscrivi/aggiungi:

- `normalizeAllowedModules`: nessuna forzatura sui 9; `sopralluoghi` NON forzato;
  invariante `impostazioni` (admin ⇒ presente, operatore ⇒ assente).
- `canAccessPathFromMetadata`:
  - operatore con `allowedModules:['live']` → `/hub/live` = **true** (nuovo);
  - operatore senza `live` → `/hub/live` = false;
  - operatore → `/impostazioni` = false (gate ruolo);
  - admin → `/impostazioni` = true;
  - operatore con `['impostazioni']` (anomalia) → `/impostazioni` ancora false.
- `buildAppMetadataUpdate`:
  - admin, moduli `['dashboard']` → `impostazioni` reintegrato (invariante), role admin;
  - operatore, moduli `['dashboard','impostazioni']` → `impostazioni` rimosso, role operatore;
  - operatore, moduli `['live']` → `live` mantenuto (operatori ora possono).
- `canManageUsers`: true solo per `admin_plus`.
- `resolveUserRole`: invariati.

## Non-obiettivi / fuori perimetro

- **Nessuna SQL / nessuna modifica RLS.** `zone-ztl` scrive via client con RLS basata su
  `profile.role='admin'`: resta operabile da admin/admin_plus come oggi. Non si abilita
  per altri ruoli (non rientra nello scope).
- **Nessuna conversione** delle altre API della sezione Impostazioni (personale,
  territori, attività, hotel, hotel-room-prices, allegato10-codici, rapportino-template):
  restano su ruolo admin, accessibili ad admin e admin_plus.
- Feature admin **operative** fuori dalla sezione (sync interventi, riconsegna,
  approvazioni lista-attesa, sync misuratori) restano su ruolo admin + relativi moduli.

## File toccati (riassunto)

1. `lib/moduleAccess.ts`
2. `lib/moduleAccess.test.ts`
3. `app/impostazioni/utenze/page.tsx` (guard admin_plus)
4. `app/impostazioni/utenze/UtenzeClient.tsx`
5. `app/api/admin/users/route.ts` (requireAdminPlus + anti-lockout + currentUserId)
6. `app/impostazioni/page.tsx` (server + nascondi card Utenze)
7. `components/layout/SettingsSubNav.tsx` (+ punto di montaggio)
8. `app/hub/live/page.tsx`
9. `app/hub/lista-attesa/page.tsx`
10. `app/hub/misuratori/page.tsx`
11. `app/impostazioni/layout.tsx` (roleLabel)
12. `app/hub/page.tsx` (promo Live, minore)

## Rischi e mitigazioni

- **Regressione lockout legacy**: utenti senza `allowedModules` in metadata →
  `fallbackModulesForRole` evita che restino senza moduli.
- **Auto-declassamento Admin Plus**: bloccato in UI (proprio ruolo) e lato server
  (self + ultimo admin_plus).
- **Coerenza sidebar/sezione per `impostazioni`**: garantita dall'invariante in
  `normalizeAllowedModules`.
- **Gate lint**: `npm run lint` è già rosso su main (baseline ~89 errori preesistenti);
  il gate è "nessun nuovo problema dai file toccati" — verifica con `npx eslint <path>`.
