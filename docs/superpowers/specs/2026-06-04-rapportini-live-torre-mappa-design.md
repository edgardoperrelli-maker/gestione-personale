# Spec — Rapportini davvero live (torre + mappa monitoraggio)

Data: 2026-06-04
Stato: approvata per implementazione (design validato con l'utente)

## Obiettivo

Rendere gli interventi **veramente live**: man mano che l'operatore compila il rapportino
interattivo (`/r/[token]`) e ogni voce viene **autosalvata**, lo stato dell'intervento
(Fatto / Non fatto / Da fare) deve riflettersi **subito** nella torre di controllo
(`/hub/torre`) e in una mappa di monitoraggio del giorno — non più solo a fine giornata
all'invio del rapportino.

Aggiornamento di torre e mappa: **Realtime + polling ogni 5 minuti + tasto "Aggiorna ora"**.

## Contesto / diagnosi (dall'esplorazione)

Esistono due modi con cui un intervento viene "chiuso":

1. **Agenda operatore** (`app/agenda/[token]` → bottoni Fatto/Non fatto):
   `POST /api/agenda/[token]/intervento` scrive **subito** su `interventi`
   (`stato`, `esito`, `chiuso_at`). Già live.
2. **Rapportino interattivo** (`app/r/[token]` → `RapportinoForm`, autosave debounce 800ms):
   - l'autosave di ogni voce ([app/api/r/[token]/voce/route.ts](../../../app/api/r/%5Btoken%5D/voce/route.ts))
     scrive **solo** su `rapportino_voci.risposte`;
   - la tabella `interventi` viene aggiornata **solo all'invio finale**
     ([app/api/r/[token]/invia/route.ts:21-38](../../../app/api/r/%5Btoken%5D/invia/route.ts))
     che cicla sulle voci e usa `esitoInterventoDaVoce` per chiudere ogni intervento.

**Causa radice**: la torre ascolta `interventi` via Supabase Realtime
([TorreControlloClient.tsx:58-86](../../../components/modules/torre/TorreControlloClient.tsx)),
ma l'autosave del rapportino tocca solo `rapportino_voci`. Quindi nessun aggiornamento
appare finché non si invia il rapportino. **Un polling da solo non basterebbe**: senza scrivere
su `interventi`, non c'è nulla di nuovo da rileggere.

Fatti utili:
- `esitoInterventoDaVoce(risposte, campi)` ([lib/interventi/esitoDaVoce.ts](../../../lib/interventi/esitoDaVoce.ts))
  → `{ esito: 'eseguito_positivo', esito_motivo: null }` (verde/Fatto) ·
  `{ esito: null, esito_motivo: nota }` (rossa/Non fatto) · `null` (neutro/non chiudere).
- `coloreStato(stato, esito)` ([lib/interventi/torreView.ts:7-13](../../../lib/interventi/torreView.ts))
  mappa stato→tono cromatico (riusabile dalla mappa monitoraggio).
- Realtime su `interventi` **già abilitato**
  ([migration 20260603020000](../../../supabase/migrations/20260603020000_realtime_interventi.sql)).
- `Task` ([utils/routing/types.ts](../../../utils/routing/types.ts)) **non** ha `stato`/`esito`;
  `mapInterventoToTask` ([lib/interventi/mappaInterventi.ts:28-47](../../../lib/interventi/mappaInterventi.ts))
  non li mappa.
- L'endpoint `GET /api/interventi/da-pianificare` filtra `stato IN (da_assegnare, assegnato)`
  e non ritorna `esito`: inadatto al monitoraggio (i completati sparirebbero invece di colorarsi).

## Decisioni di design (validate con l'utente)

1. **Quale mappa**: entrambe — la mappa interna alla torre (già live con la fix) **e** una
   nuova vista mappa di monitoraggio.
2. **Stato durante la compilazione**: l'intervento resta **"Da fare"** finché la voce non ha
   un esito valido, poi mostra Fatto/Non fatto live. **Nessuno stato intermedio "in corso"**.
3. **Riapertura**: se l'operatore azzera una voce già Fatto/Non fatto (torna neutro), l'intervento
   **torna a "Da fare"** (`stato='assegnato'`). L'intervento è uno **specchio fedele e live** della voce.
4. **Refresh**: ibrido **Realtime + polling 5 min + tasto manuale** su torre e mappa.
5. **Dove la mappa monitoraggio**: **vista dedicata** `/hub/mappa?vista=monitoraggio`, componente
   nuovo e snello, **senza** toccare `MappaOperatoriClient` (~3300 righe, flusso pianificazione).

## Architettura — tre parti indipendenti

### Parte 1 — Propagazione live dell'autosave (il cuore)

**Logica pura** (in `lib/interventi/esitoDaVoce.ts`, TDD):

```ts
export type PatchInterventoLive =
  | { azione: 'completa'; esito: 'eseguito_positivo' | null; esito_motivo: string | null }
  | { azione: 'riapri' };

// Riusa esitoInterventoDaVoce: patch non-null → completa; null (neutro) → riapri.
export function patchInterventoLiveDaVoce(
  risposte: Record<string, unknown>,
  campi: TemplateCampo[],
): PatchInterventoLive
```

**Endpoint** [app/api/r/[token]/voce/route.ts](../../../app/api/r/%5Btoken%5D/voce/route.ts):
dopo l'`update` su `rapportino_voci.risposte` (invariato), in aggiunta:
- estendere le `select` per recuperare `rapportino_voci.intervento_id` e `rapportini.campi_snapshot`;
- calcolare `patchInterventoLiveDaVoce(risposte, campi_snapshot)`;
- se `intervento_id` presente, applicare su `interventi` (con `supabaseAdmin`, `.eq('id', intervento_id)` + filtro per ramo):
  - **completa** → `{ stato:'completato', esito, esito_motivo, chiuso_at: now }`, filtro `.neq('stato','annullato')` (chiude qualsiasi stato tranne annullato);
  - **riapri** → `{ stato:'assegnato', esito:null, esito_motivo:null, chiuso_at:null }`, filtro `.eq('stato','completato')` (annulla solo una *nostra* precedente chiusura, senza declassare stati intermedi gestiti da altri flussi);
- l'aggiornamento di `interventi` **non deve far fallire** l'autosave della voce: in caso di errore
  sulla propagazione, loggare e rispondere comunque `ok` al salvataggio voce (la voce è la fonte di verità,
  la propagazione è derivata e verrà comunque riapplicata all'invio finale).

`invia/route.ts` resta **invariato** (idempotente: riapplica gli stessi esiti).

### Parte 2 — Torre di controllo: tasto + polling 5 min

[TorreControlloClient.tsx](../../../components/modules/torre/TorreControlloClient.tsx) mantiene la
subscription Realtime esistente e aggiunge:
- **tasto "Aggiorna ora"** in header;
- **polling ogni 5 min** via `setInterval`, **in pausa** quando `document.hidden` (visibilitychange),
  con refetch immediato al ritorno in foreground;
- **"ultimo aggiornamento HH:MM"** accanto al badge Live esistente.

Tasto e polling chiamano un nuovo endpoint condiviso e fanno `setItems(...)` (stesso state già aggiornato dal Realtime).

### Parte 3 — Mappa: vista dedicata "Monitoraggio oggi"

- **Tipo `Task`**: aggiungere `stato?: string` ed `esito?: string | null`.
- **`mapInterventoToTask`**: mappare `stato: row.stato`, `esito: row.esito ?? null`
  (estendere `InterventoGeoRow`/`COLONNE` con `esito` se non già coperto da `InterventoRow`).
- **Endpoint** nuovo `GET /api/interventi/giorno?data=YYYY-MM-DD` (admin-only, come la torre):
  ritorna **tutti** gli interventi del giorno geocodificati, con i campi della torre
  (`id, odl, nominativo, indirizzo, comune, cap, pdr, matricola_contatore, intervento_tipo,
  lat, lng, staff_id, stato, esito, esito_motivo, fascia_oraria, territorio_id`).
  **Usato da torre (Parte 2) e mappa monitoraggio**.
- **Server**: `app/hub/mappa/page.tsx` aggiunge `vista === 'monitoraggio'` + una **card** nella landing.
- **Client**: nuovo componente snello `components/modules/mappa/MonitoraggioMappaClient.tsx` che:
  - monta una mappa Leaflet con marker colorati per `coloreStato(stato, esito)` (riuso torreView);
  - sottoscrive Realtime su `interventi` (filtro `data=eq.<oggi>`), come la torre;
  - polling 5 min + tasto "Aggiorna ora" + "ultimo aggiornamento" + **legenda**
    (🟢 Fatto · 🔴 Non fatto · 🟡 Da fare · 🔵 In corso · ⚪ Annullato);
  - selettore data (default oggi, Europe/Rome).
  - Per riuso, la logica marker può essere estratta condividendo l'approccio di
    [TorreMappa.tsx](../../../components/modules/torre/TorreMappa.tsx).

## File toccati

| Tipo | File | Modifica |
|---|---|---|
| logica+test | `lib/interventi/esitoDaVoce.ts` (+`.test.ts`) | `patchInterventoLiveDaVoce` + test |
| tipi | `utils/routing/types.ts` | `Task.stato?`, `Task.esito?` |
| mapper | `lib/interventi/mappaInterventi.ts` | mappa `stato`/`esito` (+`esito` in `InterventoGeoRow`/COLONNE) |
| API | `app/api/r/[token]/voce/route.ts` | propagazione live su `interventi` |
| API (nuovo) | `app/api/interventi/giorno/route.ts` | interventi del giorno (tutti gli stati), admin-only |
| UI | `components/modules/torre/TorreControlloClient.tsx` | tasto + polling 5 min + last-update |
| UI (nuovo) | `components/modules/mappa/MonitoraggioMappaClient.tsx` | mappa monitoraggio live |
| UI | `app/hub/mappa/page.tsx` | vista `monitoraggio` + card landing |

Realtime su `interventi`: **già abilitato** (nessuna nuova migration).

## Test (vitest, TDD)

- `patchInterventoLiveDaVoce`: verde → `completa`+`eseguito_positivo`; rossa → `completa`+`esito:null`+motivo
  (con trim); neutro/vuoto → `riapri`. (estende `esitoDaVoce.test.ts`)
- `mapInterventoToTask`: propaga `stato`/`esito` (incl. `esito` null quando assente).
- `coloreStato`: già coperto da `torreView.test.ts` (riuso).

Le route handler e i componenti con Leaflet/Realtime non sono coperti da unit test (come il resto del
progetto); la logica decisionale vive in funzioni pure testate.

## Edge cases

- **Token scaduto/inviato**: l'autosave già risponde 409 e non propaga (check `tokenStatus` esistente).
- **Voce senza `intervento_id`**: nessuna propagazione (come l'invio finale: `if (!intervento_id) continue`).
- **Intervento annullato**: mai toccato (`neq('stato','annullato')`).
- **Riapertura**: un intervento già `completato` torna `assegnato` se la voce diventa neutra; non si reinventano
  stati (`in_viaggio`/`sul_posto`/`in_esecuzione` restano possibili da altri flussi e sono colorati come "In corso").
- **Polling**: in pausa quando la scheda è in background; refetch al ritorno per evitare dati stantii.
- **Errore propagazione interventi**: non rompe l'autosave della voce (la voce resta salvata).

## Retrocompatibilità / sicurezza

- L'autosave usa già `supabaseAdmin`; mantenuto `neq('stato','annullato')`.
- Nuovo endpoint `/api/interventi/giorno`: stesso guard admin della torre (`requireUser` + ruolo admin).
- `invia/route.ts` invariato e idempotente: riapplica gli stessi esiti, nessun conflitto con la propagazione live.
- Nessuna modifica a `MappaOperatoriClient` (flusso pianificazione intatto).
- Se Realtime non è attivo, polling 5 min + tasto garantiscono comunque l'aggiornamento.

## Fuori scope (follow-up)

- Stato intermedio "in corso" generato dal rapportino.
- Storico/replay, notifiche push, drill-down per intervento dalla mappa monitoraggio.
- Live sulla mappa di **pianificazione** (`vista=pianifica`): resta strumento di pianificazione.
