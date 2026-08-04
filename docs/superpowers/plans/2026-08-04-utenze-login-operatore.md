# Spec — Utenze operatore, login e home «Il mio giorno» (2026-08-04)

> Attua le voci 1–2 del piano [2026-08-04-app-mobile-capacitor.md](2026-08-04-app-mobile-capacitor.md)
> (decisioni §7). Branch: `feat/app-mobile-fase1`. Repo PUBBLICO: niente dati di
> produzione in commit/PR.

## Fatti dal codice (mappa 2026-08-04, run wf_07bfda9e)

- `staff` NON ha legame con `auth.users`: nessuna colonna `user_id` (`types.ts:1-20`).
- Creazione utenze già rodata in `POST /api/admin/users` (`app/api/admin/users/route.ts:111-169`):
  email fittizia `u_<username>@local.it`, `supabaseAdmin.auth.admin.createUser` con
  `app_metadata {role, allowedModules, modificaInterventi}`, upsert `profiles`.
  Reset = `updateUserById(userId, {password})` (`route.ts:230`). Tutto admin_plus-only.
- `/impostazioni/personale`: card espandibili per operatore; salvataggi via
  `/api/admin/personale` con guard `requireAdmin()` (ruolo `admin` = backoffice) +
  `supabaseAdmin`. Aggancio UI: sezione nel dettaglio dopo Centro di costo
  (`PersonaleClient.tsx:444-454`) + badge in header card (`:278-293`).
- Login: `LoginClient.tsx:68-71` → sempre `/hub`; nessuna ramificazione per ruolo.
  Middleware decide solo su `app_metadata` (`lib/moduleAccess.ts:388-393`).
- ⚠️ `getAllowedModulesForUser`: `allowedModules` ASSENTE ⇒ fallback = tutti i moduli
  non-adminOnly (`moduleAccess.ts:360-368`). Per il perimetro minimo la lista va
  passata ESPLICITA.
- `/r/[token]` è pubblica (fuori dal matcher), server component con `supabaseAdmin`;
  il token è colonna di `rapportini` (`{staff_id, data, token, stato, expires_at…}`).
  ⇒ la home operatore può riusarla per intero via link a `/r/<token>`.

## Tappe

### A — Ponte staff↔utente + API credenziali
1. Migration ADDITIVA (prima del deploy, sicura — nessun drop):
   `alter table staff add column user_id uuid unique references auth.users(id) on delete set null;`
2. Nuova route `app/api/admin/personale/credenziali/route.ts`, guard `requireAdmin()`
   (riuso da `app/api/admin/personale/route.ts`):
   - `POST {staffId, username, password?}` → crea utenza (riuso pattern
     `/api/admin/users`: `toEmail`, `createUser` con `email_confirm:true`,
     `app_metadata {role:'operatore', allowedModules:['oggi'], modificaInterventi:false,
     must_change_password:true}`), upsert `profiles`, `update staff set user_id`.
     Password: se assente la genera il server (10 char leggibili) e la RESTITUISCE
     UNA VOLTA nella risposta.
   - `PATCH {staffId, azione:'reset'}` → nuova password temporanea +
     `must_change_password:true`; risposta con la password una volta.
   - `DELETE {staffId}` → scollega (`staff.user_id=null`) SENZA cancellare l'utenza
     (delete utenze resta admin_plus in /impostazioni/utenze).
   - Audit via RPC `log_audit` (pattern `scripts/seedUsers.mjs:42-47`).
   - GET di lista: mappa `staff_id → {username, has_user}` per la UI (mai password).
3. `lib/moduleAccess.ts`: registra modulo `oggi` (path `/hub/oggi`, non-adminOnly,
   concedibile a operatore). Test: invarianti `normalizeAllowedModules` con `oggi`.

### B — UI credenziali in /impostazioni/personale
- Sezione «Credenziali app» nel dettaglio card (dopo Centro di costo, prima di
  StoricoTrasferte): stato (— / username), bottone «Crea utenza» (username proposto
  da `display_name` normalizzato), «Reset password» con dialog (pattern
  `UtenzeClient.tsx:799-848`); la password temporanea appare una volta con bottone
  copia. Badge «app» nell'header card se `user_id` presente.
- Stile: essenziale in primo piano, zero tecnicismi (regola UI backoffice).

### C — Login ramificato + cambio password primo accesso
- `LoginClient.tsx`: dopo il sign-in leggi `app_metadata`: `must_change_password` →
  step inline «Imposta la tua password» (chiama la nuova
  `POST /api/account/cambia-password {newPassword}`: sessione utente + `supabaseAdmin`
  per set password e pulizia flag); poi ruolo `operatore` → `router.push('/hub/oggi')`,
  altrimenti `/hub`.
- `middleware.ts`: utente `operatore` su `/hub` esatto → redirect `/hub/oggi`.

### D — Home «Il mio giorno» (`/hub/oggi`)
- Server component: `user.id → staff (user_id) → rapportini (staff_id + data oggi)`.
- Riepilogo: n. voci totali/completate (`rapportino_voci`), note ufficio, conteggio
  ODL TOP, stato coda offline (client, `lib/offline`), bottone «Apri il rapportino»
  → `/r/<token>` (riuso TOTALE della pagina esistente, zero refactor).
- Empty state: «Nessun lavoro assegnato oggi».
- Design col metodo hallmark DENTRO il design system esistente (sobrio enterprise,
  cornice della shell, `<Button variant="primary">`); verifica su device-wall ai
  4 viewport (390/412/834/800).

### Ordine e verifica
- A → B → C → D; ogni tappa: vitest verdi sui file toccati + lint non peggiorato.
- Verifica finale su device wall: login operatore di test → /hub/oggi → rapportino.
- Utenza di test: creare in Supabase un operatore fittizio NON collegato a staff
  reali per le prove (mai screenshot con dati veri in PR).

## Design /hub/oggi (hallmark in-sistema, 2026-08-04)

Sistema BLOCCATO: tokens OKLCH di `app/globals.css` (sobrio enterprise, DESIGN.md),
Geist, cornice della shell (il modulo NON mette px/py né max-w). Niente colori/font
nuovi, niente metriche inventate, heading mai in corsivo.

Struttura mobile-first (una colonna; da ≥768px le card secondarie vanno su griglia
2 colonne con `minmax(0,1fr)`, la card giro resta piena — stessa pagina, zero layout
dedicati):

1. **Testata**: «Il mio giorno» + data estesa in italiano (es. «lunedì 4 agosto») +
   nome operatore in muted. Niente saluti/fluff.
2. **Card «Giro di oggi»** (principale): conteggi REALI (totale voci, completate,
   da fare) + barra avanzamento sottile (`--brand-primary`); se ODL TOP > 0 badge
   ambra (`--warning-soft`/`--warning`, coerente col resto); CTA
   `<Button variant="primary">` piena larghezza su mobile, min-height 48px:
   «Apri il rapportino» → link a `/r/<token>`; se stato inviato → «Rivedi il
   rapportino»; se scaduto → card informativa senza CTA.
3. **Card «Note dall'ufficio»**: solo se esistono note; lista semplice.
4. **Card «Sincronizzazione»**: stato coda offline da `lib/offline` (riusa
   l'indicatore esistente del portale operatore se è un componente esportabile;
   altrimenti conteggio outbox): verde soft «Tutto sincronizzato» / ambra
   «N in attesa».
5. **Empty state** (nessun rapportino oggi): icona lucide + «Nessun lavoro
   assegnato oggi» + «Quando l'ufficio ti assegna un giro lo troverai qui.»

Discipline: target touch ≥44px; 8 stati sugli interattivi (default/hover/
focus-visible/active/disabled/loading/error/success dove sensato); focus ring
visibile non animato; nessuno scroll orizzontale a 320–834px; `overflow-wrap`
sui testi lunghi.

Dati (server component, pattern `/r/[token]/page.tsx` e `/hub/live/page.tsx`):
gate auth + modulo `oggi`; `user.id → staff.user_id → staff.id`; rapportino del
giorno via `supabaseAdmin` su `rapportini (staff_id, data=oggi Europe/Rome)`;
voci da `rapportino_voci`; note e ODL TOP con le stesse query della pagina `/r`.

## Fuori scope (tappe successive del piano)
Scaffold Capacitor (voce 4, richiede ok librerie), push+notifiche (voce 5),
CI/CD (voce 6), rifiniture responsive estese (voce 3 — parte col device wall qui).
