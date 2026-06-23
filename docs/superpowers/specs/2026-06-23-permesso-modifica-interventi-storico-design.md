# Permesso "Modifica interventi" assegnabile (storico interventi)

**Data:** 2026-06-23
**Stato:** Design approvato (entrambe le tappe in questa sessione)
**Caso d'uso scatenante:** abilitare l'utenza **Mara Boccia** (operatore) a modificare gli interventi dalla lista/storico, senza renderla Admin Plus.

---

## 1. Problema

Nel modulo **Interventi** (`/hub/interventi`, "Storico interventi") le azioni di gestione
di una voce sono oggi riservate agli **Admin Plus**:

- ✎ **modifica** anagrafica/esiti di una voce (modale modifica),
- 📷 **upload foto** aggiuntive (modale foto),
- 🗑 **cancellazione** completa e irreversibile della riga (voce + intervento + foto).

Il gate è lo stesso identico per tutte e tre: `canManageUsers(role)` → vero **solo per `admin_plus`**.
Questo è verificato in tre punti:

- `app/hub/interventi/page.tsx` → calcola `isAdminPlus` e lo passa al client (mostra/nasconde ✎ 🗑 e l'upload).
- `app/api/admin/interventi/storico/voce/[voceId]/route.ts` → `requireAdminPlus()` su GET/PATCH/DELETE.
- `app/api/admin/interventi/storico/voce/[voceId]/foto/route.ts` → `requireAdminPlus()` sul POST (upload); il GET è già aperto a tutti via `requireUser()`.

Non esiste un permesso "modifica storico" a sé stante: è **fuso** dentro `admin_plus`. Promuovere
Mara ad Admin Plus le darebbe anche accesso a **Utenze** (creazione/eliminazione account) e al
cruscotto **Premialità** (compensi) — troppo per il bisogno reale.

## 2. Obiettivo

1. Scorporare un permesso granulare **"può modificare interventi"** che abilita **modifica + foto**
   ma **non** la cancellazione.
2. Renderlo **assegnabile per-utente dalla pagina Utenze** (toggle), coerente col sistema di permessi
   per-modulo già esistente (`app_metadata`).
3. La **cancellazione** (🗑) resta ancorata ad **Admin Plus** (azione distruttiva).
4. Attivare il permesso per **Mara Boccia**.

### Decisione: niente whitelist hardcoded

In una prima ipotesi il permesso si sarebbe sbloccato con una whitelist di username nel codice
(`['mara.boccia']`) da rimuovere in un secondo momento. Poiché realizziamo **subito anche il toggle
in Utenze**, la whitelist è debito tecnico inutile: il permesso nasce direttamente come **flag in
`app_metadata`** e Mara si attiva spuntando il toggle. Un solo deploy, nessuna SQL manuale.

## 3. Modello del permesso

Unico punto di verità: un nuovo helper puro in `lib/moduleAccess.ts`.

```ts
/**
 * Può modificare/aggiungere foto alle voci dello storico interventi (NON cancellare).
 * Vero per gli Admin Plus (sempre) o per chi ha il flag `modificaInterventi` nei metadata.
 */
export function canEditStorico(
  role: AssignableRole | null | undefined,
  appMetadata: unknown,
): boolean {
  if (canManageUsers(role)) return true;            // admin_plus: sempre
  const meta = extractAppMetadata(appMetadata);
  return meta?.modificaInterventi === true;          // flag per-utente
}
```

- **Admin Plus**: sempre `true` (comportamento odierno invariato).
- **Admin semplice / Operatore**: `true` solo se `app_metadata.modificaInterventi === true`.
- La **cancellazione** continua a usare `canManageUsers` (Admin Plus), *non* `canEditStorico`.

Il flag è un booleano top-level in `app_metadata` accanto a `role` e `allowedModules`. Un singolo
booleano è sufficiente (YAGNI): se in futuro servissero altri permessi-azione, si valuterà un
sotto-oggetto `permessi`.

`extractAppMetadata` viene esteso per dichiarare il campo opzionale `modificaInterventi`.

## 4. Tappa A — Separazione dei gate (backend + frontend storico)

### 4.1 Backend — voce route
`app/api/admin/interventi/storico/voce/[voceId]/route.ts`:

- Nuovo gate locale `requireEditStorico()` (clona `requireAdminPlus()` ma valuta `canEditStorico(role, user.app_metadata)`); messaggio 403 "Riservato a chi può modificare gli interventi.".
- **GET** e **PATCH** → `requireEditStorico()`.
- **DELETE** → **invariato** (`requireAdminPlus()`).

### 4.2 Backend — foto route
`app/api/admin/interventi/storico/voce/[voceId]/foto/route.ts`:

- **POST** (upload) → sostituisce `requireAdminPlus()` con `requireEditStorico()`.
- **GET** → invariato (`requireUser()`).

> Entrambe le route ottengono già `user` dal client Supabase e leggono il `profile.role`.
> Il gate calcola `role = resolveAssignableRole(profile?.role, user.app_metadata?.role)` e poi
> `canEditStorico(role, user.app_metadata)` (l'intero `app_metadata` serve a leggere il flag `modificaInterventi`).

### 4.3 Frontend — pagina e componenti
`app/hub/interventi/page.tsx`:

- Calcola **due** flag e li passa al client:
  - `isAdminPlus = canManageUsers(role)` → governa **solo** il 🗑.
  - `puoModificare = canEditStorico(role, user?.app_metadata)` → governa ✎ e 📷.

`components/modules/interventi/StoricoInterventiClient.tsx`:
- Nuova prop `puoModificare: boolean` (oltre a `isAdminPlus`).
- Pulsante ✎ + render della modale di modifica → `puoModificare`.
- Passa `puoModificare` a `ModaleFotoVoce` (per l'upload).
- 🗑 e relativa conferma → restano su `isAdminPlus`.

`components/modules/interventi/StoricoTabella.tsx`:
- Riceve `puoModificare`; mostra ✎ se `puoModificare`, 🗑 se `isAdminPlus`.

`components/modules/interventi/ModaleFotoVoce.tsx`:
- La prop che oggi si chiama `isAdminPlus` (usata per mostrare l'upload) viene **rinominata in `puoCaricare`** e alimentata da `puoModificare`. La sola lettura foto resta per tutti.

**Esito atteso:** un operatore con il flag attivo vede ✎ e l'upload foto, **non** vede 🗑.

## 5. Tappa B — Toggle assegnabile in Utenze

### 5.1 `lib/moduleAccess.ts` — `buildAppMetadataUpdate`
Estendere la firma e il ritorno per **preservare/aggiornare** il flag insieme a ruolo e moduli
(non dipendere dal merge implicito di Supabase):

```ts
buildAppMetadataUpdate(
  currentMetadataRole, currentAllowedModules, currentModificaInterventi,
  requestedRole, requestedModules, requestedModificaInterventi,
): { role; allowedModules; modificaInterventi }
```

- `modificaInterventi` finale = `requestedModificaInterventi` se booleano, altrimenti il corrente, altrimenti `false`.
- Invariante aggiuntivo: per i ruoli admin/admin_plus il flag è ininfluente (hanno comunque il permesso via `canManageUsers` per plus); si conserva comunque il valore richiesto senza forzature.

### 5.2 `app/api/admin/users/route.ts`
- **GET**: includere `modificaInterventi: u.app_metadata?.modificaInterventi === true` in ogni riga utente.
- **POST** (crea): leggere `body.modificaInterventi` e salvarlo in `app_metadata`.
- **PATCH** (aggiorna):
  - leggere `currentModificaInterventi` da `current.user.app_metadata`,
  - estendere la condizione che costruisce `updates.app_metadata` con `|| typeof body.modificaInterventi === 'boolean'`,
  - passare i nuovi argomenti a `buildAppMetadataUpdate`.

### 5.3 `app/impostazioni/utenze/UtenzeClient.tsx`
- `UserRow` (+ `EditRow`) e lo stato `form`: nuovo campo booleano `modificaInterventi`.
- **Toggle dedicato** "Può modificare gli interventi" (checkbox con descrizione breve: *"Permette di correggere dati/esiti e aggiungere foto nello storico, senza poter cancellare."*), reso:
  - nel form **Nuova utenza** (sotto i moduli),
  - nel **pannello di modifica** di ogni utente (sotto i moduli, sopra la action bar).
- Per gli utenti **Admin Plus** il toggle è mostrato **spuntato e disabilitato** con tooltip *"Gli Admin Plus possono sempre modificare"* (coerente col pattern "Segue il ruolo" dei moduli).
- `handleCreate` e `handleSave`: includere `modificaInterventi` nel payload JSON.

## 6. Flusso dati (utente operatore con flag attivo)

```
Utenze (Admin Plus) → toggle ON su Mara → PATCH /api/admin/users
   → buildAppMetadataUpdate → app_metadata.modificaInterventi = true
Mara apre /hub/interventi
   → page.tsx: puoModificare = canEditStorico(role, app_metadata) = true
   → vede ✎ e upload foto; NON vede 🗑
Mara salva una modifica → PATCH .../voce/[voceId]
   → requireEditStorico() passa → update voce + propagazione intervento (invariata)
Mara tenta cancellazione → impossibile (pulsante assente; DELETE comunque 403 Admin Plus)
```

## 7. Sicurezza / edge case

- **Cancellazione**: doppio presidio invariato — pulsante nascosto (client) **e** gate `requireAdminPlus` (server).
- **Admin Plus**: nessun cambiamento; `canEditStorico` resta `true` per loro a prescindere dal flag.
- **Admin semplice**: oggi *non* poteva modificare lo storico (non è admin_plus) e continua a non poterlo **finché non gli si attiva il flag** — comportamento coerente e ora configurabile.
- **Persistenza flag**: `buildAppMetadataUpdate` ricostruisce l'intero `app_metadata` dai valori correnti+richiesti, quindi aggiornare i soli moduli non azzera il flag e viceversa.
- **Accesso al modulo**: il flag abilita *azioni*, non l'accesso. Se Mara non vede la voce *Interventi* in sidebar, va spuntato il **modulo `interventi`** in Utenze (permesso separato). Il modulo `interventi` non è `adminOnly`, quindi rientra nei default operatore.

## 8. Test

- **Unit** `lib/moduleAccess.test.ts` (file già esistente) — `canEditStorico`:
  - admin_plus → `true` (anche senza flag),
  - operatore con `modificaInterventi: true` → `true`,
  - operatore senza flag / metadata vuoti / `false` → `false`,
  - admin semplice senza flag → `false`.
- **Unit** `buildAppMetadataUpdate`: il flag si preserva quando si aggiornano i soli moduli; si aggiorna quando richiesto esplicitamente.
- Baseline lint/test del repo è in parte rossa: verifica **mirata** con `npx vitest run lib/moduleAccess.test.ts`.

## 9. File toccati (checklist per il piano)

**Logica/permessi**
- `lib/moduleAccess.ts` — `canEditStorico`, `extractAppMetadata` (+ campo), `buildAppMetadataUpdate` (firma estesa).
- `lib/moduleAccess.test.ts` — nuovi test.

**Backend**
- `app/api/admin/interventi/storico/voce/[voceId]/route.ts` — gate GET/PATCH.
- `app/api/admin/interventi/storico/voce/[voceId]/foto/route.ts` — gate POST.
- `app/api/admin/users/route.ts` — GET/POST/PATCH per il flag.

**Frontend**
- `app/hub/interventi/page.tsx` — due flag.
- `components/modules/interventi/StoricoInterventiClient.tsx` — prop `puoModificare`.
- `components/modules/interventi/StoricoTabella.tsx` — ✎ vs 🗑.
- `components/modules/interventi/ModaleFotoVoce.tsx` — prop `puoCaricare`.
- `app/impostazioni/utenze/UtenzeClient.tsx` — toggle nel form e nel pannello.

## 10. Passo operativo dopo il deploy

1. Login come Admin Plus → **Impostazioni → Utenze**.
2. Espandere **Mara Boccia**, verificare che il modulo **Interventi** sia spuntato.
3. Attivare il toggle **"Può modificare gli interventi"** → **Salva modifiche**.
4. Mara: hard refresh (cache SW) → in `/hub/interventi` compaiono ✎ e upload foto.

## 11. Fuori scope

- Permesso granulare per la **cancellazione** (resta Admin Plus).
- Audit log delle modifiche da parte di non-admin (eventuale follow-up).
- Permessi-azione granulari per altri moduli (si generalizzerà solo se servirà).
