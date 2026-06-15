# Modulo Appuntamenti dedicato + cronoprogramma alleggerito

**Data:** 2026-06-15
**Stato:** Spec approvata in brainstorming, da rivedere prima del piano

## Problema

Nel Cronoprogramma (`app/dashboard/page.tsx` → `CronoprogrammaWorkspace`) la striscia degli appuntamenti (`AppointmentDayCards`, alta 140px) occupa molto spazio verticale mostrando il dettaglio di ogni appuntamento. L'utente vuole **ottimizzare lo spazio**: spostare la gestione appuntamenti in un **modulo dedicato** e lasciare nel cronoprogramma **solo il conteggio** per giorno.

## Obiettivo

1. Nuovo modulo **"Appuntamenti"** (`/hub/appuntamenti`) con la gestione completa: calendario settimanale + crea/visualizza/elimina/sposta.
2. Cronoprogramma: al posto della striscia di card, una **striscia compatta di conteggi** (1 numero per giorno), **cliccabile** per aprire il modulo Appuntamenti su quel giorno.

## Decisioni prese (brainstorming)

- Il numero conta gli **appuntamenti** del giorno (la striscia attuale).
- Creazione/modifica/elimina/drag appuntamenti vivono **solo** nel nuovo modulo; il pulsante "+ Appuntamento" sparisce dal cronoprogramma.
- Il conteggio nel cronoprogramma è **cliccabile** → `/hub/appuntamenti?date=<giorno>`.
- Il modulo è un **calendario settimanale** che **riusa** `AppointmentDayCards` + `AppointmentModal`.

## Cosa NON cambia

- Tabella `appointments` e API `/api/appointments` (GET `?from&to`, POST, PATCH, DELETE): invariate.
- I componenti `AppointmentDayCards` e `AppointmentModal`: invariati nel comportamento (vengono solo **spostati** di cartella).

---

## Architettura

```
   Cronoprogramma                         Modulo Appuntamenti (/hub/appuntamenti)
   (solo conteggi, read-only)             (gestione completa)
        │ GET /api/appointments?from&to        │ GET/POST/PATCH/DELETE /api/appointments
        ▼ (conta .length per giorno)           ▼
   AppointmentCountStrip  ── click ─►  page legge ?date=  →  AppointmentDayCards + AppointmentModal
```

### 1. Registrazione modulo

**`lib/moduleAccess.ts`:**
- Aggiungere `'appuntamenti'` al tipo `AppModuleKey`.
- Aggiungere a `APP_MODULES` (dopo `lista-attesa`):
  ```ts
  {
    key: 'appuntamenti',
    href: '/hub/appuntamenti',
    label: 'Appuntamenti',
    description: 'Gestione e pianificazione appuntamenti',
    section: 'modules',
    matchPrefixes: ['/hub/appuntamenti'],
  }
  ```
  (adattare i nomi-campo all'esatta forma degli altri oggetti `APP_MODULES`).
- Aggiungere `'appuntamenti'` a `DEFAULT_ALLOWED_MODULES` (così i nuovi utenti lo vedono).

**`components/layout/moduleIcons.tsx`:** aggiungere una voce `appuntamenti` al record `MODULE_ICONS` (icona calendario/segnaposto coerente con le altre, `h-5 w-5`, `stroke="currentColor"`).

La Sidebar (`components/layout/Sidebar.tsx`) e `lib/appNavigation.ts` si popolano da soli: nessuna modifica.

**Permessi (passo manuale post-deploy):** il modulo è gated come gli altri (`getAllowedModulesForUser`/`canAccessPath`). Gli utenti **esistenti** non hanno `'appuntamenti'` nel loro `app_metadata.allowedModules`, quindi non lo vedranno finché non lo si abilita da **Impostazioni → Utenze** (il toggle compare in automatico una volta registrata la chiave). Da documentare nella consegna; nessuna SQL necessaria se si usa la UI Utenze.

### 2. Spostamento componenti appuntamenti

Spostare (con `git mv`) in una nuova cartella `components/modules/appuntamenti/`:
- `components/modules/cronoprogramma-personale/AppointmentDayCards.tsx` → `components/modules/appuntamenti/AppointmentDayCards.tsx`
- `components/modules/cronoprogramma-personale/AppointmentModal.tsx` → `components/modules/appuntamenti/AppointmentModal.tsx`

Aggiornare gli import interni:
- `AppointmentDayCards` importa `fmtDay` da `'./utils'` (utils del cronoprogramma) → diventa `'@/components/modules/cronoprogramma-personale/utils'` (NON duplicare l'util).
- Verificare gli altri import relativi di `AppointmentModal` (es. `Button`, types) e correggerli se relativi alla vecchia cartella.

Il tipo `Appointment` (oggi duplicato in `AppointmentDayCards`, `AppointmentModal` e `CronoprogrammaWorkspace`) resta dov'è per ogni file (nessuna unificazione in questo WP per limitare lo scope); la pagina nuova ridefinisce lo stesso shape.

### 3. Nuova pagina `app/hub/appuntamenti/page.tsx`

Client component che incapsula la gestione appuntamenti **estratta** dal `CronoprogrammaWorkspace`:

- **Stato:** `appointments`, `territories`, `selectedAppointment`, `showCreateModal`, `newAppointmentDate`, `anchor` (lunedì della settimana visibile).
- **Query param `?date`:** all'avvio, se presente un `date=YYYY-MM-DD` valido, `anchor` = inizio settimana che contiene quel giorno; altrimenti settimana corrente. (Usare `useSearchParams`; la pagina va avvolta in `<Suspense>` come richiede Next per `useSearchParams`, oppure seguire il pattern già usato in altre pagine `/hub/*`.)
- **Fetch appuntamenti:** `GET /api/appointments?from=<lun>&to=<dom>` ad ogni cambio settimana.
- **Fetch territori:** per la modale di creazione (come fa oggi il cronoprogramma: da Supabase `territories` o `/api/territories` se esiste — riusare il metodo già presente nel workspace).
- **Toolbar:** `‹ settimana ›`, "Oggi", "**+ Nuovo appuntamento**".
- **Render:** `AppointmentDayCards` per i 7 giorni della settimana con:
  - `onAppointmentClick` → apre `AppointmentModal mode="view"` (con `onDelete`).
  - `onAppointmentDrop(id, newDate)` → `PATCH /api/appointments` + aggiorna stato (logica identica a `handleAppointmentDrop` attuale).
  - `onNewAppointment(date)` → apre `AppointmentModal mode="create"` con `defaultDate`.
- **Modali:** `AppointmentModal` view + create (riuso), con gli handler `handleAppointmentDelete` / `handleAppointmentCreated` spostati qui.

### 4. Cronoprogramma alleggerito

**`CronoprogrammaWorkspace.tsx`:** rimuovere tutto il ramo "dettaglio appuntamenti", lasciando solo il conteggio:
- RIMUOVERE: import e render di `AppointmentDayCards`; import e render di `AppointmentModal` (i due blocchi view/create); stati `showAppointmentModal`, `selectedAppointment`, `newAppointmentDate`; handler `handleAppointmentDrop`, `handleAppointmentDelete`, `handleAppointmentCreated`; prop `onNewAppointment` passata a `CronoToolbar`.
- MANTENERE: lo stato `appointments` e il fetch `GET /api/appointments?from&to` (serve per i conteggi). 
- AGGIUNGERE: render di `<AppointmentCountStrip days={daysArray.slice(0, 7)} appointments={appointments} />` al posto di `AppointmentDayCards`.

**`CronoToolbar.tsx`:** rimuovere il pulsante "+ Appuntamento" e la prop `onNewAppointment`.

**Nuovo `components/modules/cronoprogramma-personale/AppointmentCountStrip.tsx`:**
- Props: `days: Date[]`, `appointments: { data: string }[]`.
- Render: `grid grid-cols-7`, per ogni giorno una cella **compatta** (~ una riga) con weekday+giorno e un chip col **conteggio** (`appointments.filter(a => a.data === iso).length`).
- Ogni cella è un **link** a `/hub/appuntamenti?date=<iso>` (usare `next/link` o `useRouter().push`). Conteggio 0 → chip spento/grigio ma cella comunque cliccabile.
- Coerenza tema: stessi token (`--brand-border`, `--brand-surface`, `--brand-primary-soft`, ecc.).

---

## Error handling

- Pagina Appuntamenti: se il fetch fallisce, mostrare stato vuoto + log (nessun crash). Le mutazioni (create/drop/delete) seguono il pattern attuale (aggiornano lo stato locale solo su risposta OK).
- `?date` malformato → fallback a settimana corrente (nessun errore).
- Cronoprogramma: se il fetch appuntamenti fallisce, i conteggi restano a 0 (il modulo continua a funzionare).

## Testing

- **Helper puro testato:** `weekStart(date): Date` (lunedì della settimana) o riuso di `startOfWeek` già presente in `cronoprogramma-personale/utils`; se si introduce un helper nuovo (es. parsing `?date` → anchor), test vitest dedicato. Niente logica complessa nuova → test minimi.
- **Smoke manuale (dopo deploy + abilitazione modulo in Utenze):**
  1. Sidebar mostra "Appuntamenti"; la pagina apre il calendario settimana.
  2. Crea un appuntamento → compare nella card del giorno; spostalo via drag → cambia giorno; aprilo → eliminalo.
  3. Cronoprogramma: la striscia alta è sparita, resta una riga compatta coi numeri; il pulsante "+ Appuntamento" non c'è più.
  4. Click sul numero di un giorno → apre `/hub/appuntamenti` su quella settimana/giorno.

## Out of scope (follow-up)

- Vista **mensile** del modulo Appuntamenti (v1 = settimana).
- Unificazione del tipo `Appointment` in un unico file condiviso.
- Modifica (edit) di un appuntamento esistente oltre a sposta/elimina (oggi la modale fa view+create+delete; l'edit completo non è richiesto).
- Conteggio appuntamenti nelle viste cronoprogramma diverse dalla striscia (la striscia conteggi è unica e vale per tutte le viste, come oggi).

## File toccati (sintesi)

- **Nuovi:** `app/hub/appuntamenti/page.tsx`, `components/modules/appuntamenti/AppointmentDayCards.tsx` (spostato), `components/modules/appuntamenti/AppointmentModal.tsx` (spostato), `components/modules/cronoprogramma-personale/AppointmentCountStrip.tsx`.
- **Modificati:** `lib/moduleAccess.ts`, `components/layout/moduleIcons.tsx`, `components/modules/cronoprogramma-personale/CronoprogrammaWorkspace.tsx`, `components/modules/cronoprogramma-personale/CronoToolbar.tsx`.
- **Rimossi (spostati):** i due file Appointment* dalla cartella `cronoprogramma-personale/`.
