# Spec — Fase 2-B: Torre di controllo realtime

Data: 2026-06-03
Stato: approvata per implementazione (modalità autonoma su richiesta utente)

## Obiettivo

Una pagina di monitoraggio per l'ufficio (admin) che mostra **in tempo reale** lo stato degli interventi del giorno, raggruppati per operatore (board) e su una **mappa colorata**. Si aggiorna live quando gli operatori segnano Fatto/Non fatto dall'agenda (Fase 2-A).

## Contesto (dall'esplorazione)

- Realtime Supabase **non è ancora usato** nel progetto. Client browser: `lib/supabaseBrowser.ts` → `supabaseBrowser()` (`createClientComponentClient`).
- `interventi` ha `lat`, `lng`, `staff_id`, `stato`, `esito`, `data`, anagrafica; indice `(data, staff_id)`.
- Helper stato esistenti: `labelStato`, `badgeGeocode` in `lib/interventi/interventiView.ts`; palette operatori `OP_COLORS` in `MappaOperatoriClient.tsx` (componente però enorme, ~3000 righe → **non** lo riuso, faccio una mappa semplice dedicata).
- `/hub/*` è protetto dal middleware. Admin-only via check ruolo nel server component (come `app/impostazioni/layout.tsx`).

## Decisioni di design

1. **Rotta** — `/hub/torre` (server component). Check admin con `resolveUserRole`; non admin → redirect `/hub`.
2. **Dati iniziali** — interventi di oggi (`data = oggi` Europe/Rome) con `id, odl, nominativo, indirizzo, comune, lat, lng, staff_id, stato, esito, esito_motivo, fascia_oraria`; operatori `staff` validi oggi (id, display_name).
3. **Logica pura** — `lib/interventi/torreView.ts` (TDD):
   - `coloreStato(stato, esito)` → tono `'ok' | 'ko' | 'attesa' | 'corso' | 'annullato'`.
   - `raggruppaPerOperatore(interventi, operatori)` → `{ operatore, conteggi: {assegnati, fatti, nonFatti, totale}, interventi[] }[]` + gruppo "Non assegnati".
   - Funzioni pure, nessun accesso DB.
4. **Realtime** — client `supabaseBrowser().channel('torre-interventi').on('postgres_changes', { event: '*', schema: 'public', table: 'interventi', filter: 'data=eq.<oggi>' }, cb).subscribe()`. Sul cambiamento aggiorna lo stato locale (upsert/replace dell'intervento per id). `removeChannel` allo smontaggio.
   - **Migration** `20260603020000_realtime_interventi.sql`: `alter publication supabase_realtime add table interventi;`
5. **Board** — una card per operatore con header (nome + conteggi: Assegnati N · ✅ Fatti N · ❌ Non fatti N) e lista interventi con badge stato/esito colorato. In coda, gruppo "Non assegnati". Aggiornamento live.
6. **Mappa** — Leaflet caricato dinamicamente (`import('leaflet')`, come il pattern esistente), marker per intervento con `lat/lng` colorati per `coloreStato`. Aggiornamento live. Se un intervento non ha coordinate, compare solo nella board. La mappa è secondaria: prima la board, poi la mappa.
7. **Tono → colore** (riuso variabili tema):
   - `ok` (completato+eseguito_positivo) → success
   - `ko` (completato+esito KO) → danger
   - `attesa` (assegnato) → ambra/warning
   - `corso` (in_viaggio/sul_posto/in_esecuzione) → info
   - `annullato`/`da_assegnare` → muted

## Architettura

- `lib/interventi/torreView.ts` — logica pura + test.
- `supabase/migrations/20260603020000_realtime_interventi.sql` — abilita Realtime su `interventi`.
- `app/hub/torre/page.tsx` — server component (guard admin + caricamento iniziale).
- `components/modules/torre/TorreControlloClient.tsx` — client: board + mappa + subscription Realtime.

## Test (vitest, TDD)
- `torreView`: `coloreStato` per ogni combinazione stato/esito; `raggruppaPerOperatore` (conteggi corretti, gruppo non assegnati, operatori senza interventi inclusi a zero).

## Retrocompatibilità / sicurezza
- Solo lettura sugli interventi (la torre non scrive). Admin-only.
- La subscription è filtrata su `data=oggi`; nessun dato storico in streaming.
- Se Realtime non è abilitato sul DB (migration non applicata), la board mostra comunque lo stato iniziale (degrada a non-live).

## Fuori scope (follow-up)
- Storico/replay, filtri per territorio, notifiche push, drill-down per intervento.
