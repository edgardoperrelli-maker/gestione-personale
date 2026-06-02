# Design — Geocoding interventi (server-side, auto + correzione)

- **Data:** 2026-06-02
- **Stato:** approvato dall'utente · pronto per il piano di implementazione
- **Autore:** Edgardo Perrelli (con Claude)
- **Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Supabase (service role) · Vitest · Nominatim/Photon
- **Collegato a:** [Coordinamento operatori & tracciatura interventi](2026-06-01-coordinamento-operatori-interventi-design.md) §5.2 · [UI Import Interventi](2026-06-02-ui-import-interventi-design.md) · [Connettore committenti](2026-06-01-connettore-committenti-automazione-design.md)

---

## 1. Contesto e obiettivo

Dopo l'import, gli `interventi` hanno `indirizzo/comune/cap` ma spesso **non** hanno `lat/lng` (l'Excel raramente li porta). Senza coordinate non sono mappabili né ottimizzabili. Questo è il **TODO #2** del piano interventi: popolare `lat/lng` geocodificando gli indirizzi.

Vincoli emersi dall'esplorazione:
- `geocodeTask`/`geocodingCache` esistenti sono **client-only** (`geocodingCache.ts` ha `'use client'` e usa `createClientComponentClient`). La mappa oggi geocodifica nel browser.
- Il geocoder è **rate-limited a 1 req/sec** (Nominatim → Photon, con fallback e cache su `geocoding_cache`).
- L'import diventerà **automatico e headless** col connettore Playwright → la geocodifica deve poter girare **server-side**, senza browser.

## 2. Decisioni (confermate dall'utente)

| Tema | Scelta |
|---|---|
| Esecuzione | **Server-side**, riusando il core del geocoder con cache lato server. |
| Avvio | **Automatico dopo l'import**, non bloccante; il lavoro è persistito a blocchi (non serve presidiare la pagina). |
| Volumi | Rotta **a blocchi** (chunk) per stare nei limiti serverless; il 100% non presidiato arriva col cron/worker. |
| Non trovati | **Non** solo un report: lista **a video con indirizzo editabile** → correggi il toponimo → **ritenta**. |
| SQL | La migration viene **consegnata a fine lavoro** (la lancia l'utente al PC), non applicata inline. |

## 3. Modello dati (migration consegnata a fine lavoro)

Su `public.interventi` si aggiungono due colonne di stato (oltre a `lat/lng/geocoded_at` già esistenti):

```sql
alter table public.interventi
  add column if not exists geocode_status text not null default 'pending'
    check (geocode_status in ('pending','ok','failed')),
  add column if not exists geocode_attempts integer not null default 0;

-- backfill: interventi con coordinate già presenti = 'ok'
update public.interventi
  set geocode_status = 'ok'
  where lat is not null and lng is not null and geocode_status <> 'ok';

-- indice per la coda dei pending
create index if not exists interventi_geocode_pending_idx
  on public.interventi (data, geocode_status)
  where geocode_status = 'pending';
```

Semantica: `pending` = da geocodificare · `ok` = `lat/lng` valorizzati (con `geocoded_at`) · `failed` = tentativo andato a vuoto (entra nella UI di correzione). `geocode_attempts` conta i tentativi.

## 4. Refactor cache → utilizzabile lato server

- In `utils/routing/geocoding.ts` si **estrae il core** runtime-agnostico `resolveCoordsFromProviders(indirizzo, cap, citta): Promise<{lat,lng}|null>` (solo `fetch` Nominatim/Photon + normalizzazione + rate-limit, **senza** dipendenze Supabase).
- `geocodeTask` (client, usato dalla mappa) **resta invariato**: continua a usare il core + la cache client.
- Nuovo `utils/routing/geocodingCacheServer.ts` con `getCachedCoordsServer` / `saveResolvedCoordsServer` basati su `supabaseAdmin` (service role), stesse chiavi/`lookup_key` della versione client (cache condivisa).
- Nuovo entry server `lib/interventi/geocodeServer.ts` → `geocodeIndirizzoServer(indirizzo, cap, citta)` = cache server → (miss) core → salva in cache. È il punto unico riusato da rotta e (futuro) worker.

## 5. Rotta a blocchi — `POST /api/interventi/geocode`

- Auth: `requireUser()` (`lib/apiAuth.ts`). `runtime='nodejs'`.
- Body: `{ batchId?: string, data?: string, limit?: number }` (`limit` default **25**: ~25s a 1/sec, dentro i limiti serverless).
- Seleziona fino a `limit` interventi nello scope con `lat is null and geocode_status <> 'failed'` (e `indirizzo` non vuoto).
- Per ciascuno: `geocodeIndirizzoServer(indirizzo, comune, cap)`.
  - successo → `lat/lng`, `geocoded_at=now()`, `geocode_status='ok'`, `geocode_attempts++`.
  - fallimento → `geocode_status='failed'`, `geocode_attempts++`.
- Risposta: `{ processati, ok, falliti, restanti }` (`restanti` = pending residui nello scope), così il client sa se continuare.

## 6. Auto-avvio + avanzamento (non bloccante)

- Dopo un import OK, la pagina `/hub/interventi` avvia un **loop client** che richiama `POST /api/interventi/geocode` con il `batchId` finché `restanti = 0`, aggiornando una **barra di avanzamento** (`processati/ok/falliti`). La form resta usabile.
- Ogni blocco è **persistito** server-side: lasciare la pagina non perde il lavoro fatto; il resto riprende al prossimo avvio. Un pulsante **"Riprendi geocodifica"** consente di far ripartire i `pending` residui (per `data`/batch) senza un nuovo import.
- In futuro, il **worker Playwright / un cron** chiamerà la stessa rotta in modo headless → completamento totalmente non presidiato.

## 7. UI "da correggere" (correzione toponimo + ritenta)

- Sezione su `/hub/interventi` che elenca gli interventi `geocode_status='failed'` (per `data`/batch corrente), con **campi indirizzo/comune/cap editabili** e pulsante **"Ritenta"**.
- `POST /api/interventi/geocode/retry` (`requireUser`): body `{ id, indirizzo, comune, cap }`.
  - ri-geocodifica l'indirizzo (corretto) via `geocodeIndirizzoServer`;
  - successo → aggiorna l'intervento (`lat/lng`, `indirizzo/comune/cap` corretti, `geocoded_at`, `geocode_status='ok'`) **e** salva la correzione in `geocoding_cache` (i prossimi import risolvono già); la riga esce dalla lista;
  - fallimento → resta in lista con messaggio.

## 8. Sicurezza

- Tutte le rotte `/api/interventi/geocode*` usano `requireUser()`; le scritture su `interventi` e `geocoding_cache` passano per `supabaseAdmin` (service role) lato server.
- Nessun dato sensibile esposto: si gestiscono solo indirizzi/coordinate.

## 9. Gestione errori

- Geocoder che non risolve → `status='failed'`, nessuna eccezione (il core già torna `null` sui fallimenti).
- Errore rete/provider sul singolo indirizzo → trattato come fallimento di quell'intervento, il blocco prosegue.
- Errore DB/inatteso a livello rotta → `500 { error }`; il loop client mostra l'errore e consente "Riprendi".
- Rate-limit 1/sec già garantito dal core (coda seriale).

## 10. Test (Vitest, logica pura)

- `statoDaRisultatoGeocode(coords | null) → 'ok' | 'failed'` — `lib/interventi/geocodeStatus.ts` (+ test).
- `formatGeocodeProgress({ processati, ok, falliti, restanti }) → string` — riepilogo leggibile (+ test).
- I parser di risposta provider sono già coperti; il core di rete non si unit-testa (I/O).

## 11. Fuori scope / note

- Cron/edge function per il 100% non presidiato **ora**: rinviato al worker Playwright, che riuserà la stessa rotta/logica (sezione 5).
- Correzione massiva degli indirizzi e dizionario toponimi: non in questo step (si corregge il singolo intervento; la correzione alimenta `geocoding_cache`).
- La migration §3 viene consegnata nel blocco SQL finale, da eseguire al PC.
