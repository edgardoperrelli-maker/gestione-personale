# Design — Lista interventi (sola lettura, filtrabile)

- **Data:** 2026-06-02
- **Stato:** approvato dall'utente · pronto per il piano di implementazione
- **Autore:** Edgardo Perrelli (con Claude)
- **Stack:** Next.js 15 (App Router, Server Component) · React 19 · TypeScript · Supabase (`createServerComponentClient`, RLS) · Tailwind 4 (tema Aurea `--brand-*`) · Vitest
- **Collegato a:** [Coordinamento operatori & tracciatura interventi](2026-06-01-coordinamento-operatori-interventi-design.md) §5.3 · [UI Import Interventi](2026-06-02-ui-import-interventi-design.md) · [Geocoding interventi](2026-06-02-geocoding-interventi-design.md)

---

## 1. Contesto e obiettivo

Gli `interventi` ora si **importano** (Excel → DB) e si **geocodificano**, ma non c'è ancora un modo per **vederli** nell'app. Questa è la prima parte del completamento della Fase 1: una **lista in sola lettura, filtrabile**, che dà visibilità sullo store DB ed è il **prerequisito** dell'assegnazione in-app (step successivo).

## 2. Decisioni (confermate dall'utente)

| Tema | Scelta |
|---|---|
| Ampiezza | **Sola lettura** (niente assegnazione/modifica/mappa in questo step). |
| Collocazione | **Sotto-rotta** `/hub/interventi/lista`, raggiungibile con un link dalla pagina import (additivo, non tocca il form import). |
| Lettura | **Server Component** + filtri via **search param URL** (coerente con `app/hub/page.tsx`; RLS sessione utente; nessuna nuova API). |
| Filtri | `data` (default **oggi**, Europe/Rome), `committente`, `stato`, `geocode`. |

## 3. Architettura & file

**Crea:**
- `app/hub/interventi/lista/page.tsx` — **server component**: legge `searchParams`, calcola `oggi` (Europe/Rome), normalizza i filtri con `parseInterventiFilters`, interroga `interventi` via `createServerComponentClient`, calcola i conteggi, renderizza filtri + conteggi + tabella.
- `components/modules/interventi/InterventiFilters.tsx` — **client component**: select/input per `data`/`committente`/`stato`/`geocode`; ad ogni cambio fa `router.push` aggiornando i search param (preservando gli altri) via `usePathname`/`useSearchParams`.
- `components/modules/interventi/InterventiTable.tsx` — **presentational** (nessun hook): riceve le righe e le rende in tabella; stato vuoto incluso.
- `lib/interventi/interventiView.ts` (+ `.test.ts`) — helper **puri**: `parseInterventiFilters`, `labelStato`, `badgeGeocode`.

**Modifica:**
- `app/hub/interventi/page.tsx` — aggiunge un link "Vedi lista interventi" → `/hub/interventi/lista`.

## 4. Helper puri (`lib/interventi/interventiView.ts`)

```ts
export type CommittenteFiltro = 'tutti' | 'acea' | 'italgas' | 'altro';
export type StatoFiltro = 'tutti' | 'da_assegnare' | 'assegnato' | 'in_viaggio'
  | 'sul_posto' | 'in_esecuzione' | 'completato' | 'annullato';
export type GeocodeFiltro = 'tutti' | 'ok' | 'failed' | 'pending';

export type InterventiFilters = {
  data: string;            // YYYY-MM-DD
  committente: CommittenteFiltro;
  stato: StatoFiltro;
  geocode: GeocodeFiltro;
};
```

- `parseInterventiFilters(sp, oggi)` — normalizza i raw search param; `data` valida `YYYY-MM-DD` altrimenti `oggi`; gli altri ricadono su `'tutti'` se non riconosciuti. È **puro** (riceve `oggi` come argomento → testabile in modo deterministico).
- `labelStato(stato)` — etichetta leggibile (es. `da_assegnare` → "Da assegnare").
- `badgeGeocode(status)` — `{ label, tone }` con `tone ∈ 'success'|'danger'|'muted'`: `ok`→("Geocodificato","success"), `failed`→("Da correggere","danger"), `pending`/null→("In attesa","muted").

## 5. Query (server component)

Su `interventi`, filtrata per `data` + (se ≠ `'tutti'`) `committente`/`stato`/`geocode_status`; `select` dei campi mostrati; `order by comune, indirizzo`; `limit 1000` (bound prudente). Conteggi derivati dalle righe caricate: **totale**, geocodifica **ok/failed/pending**.

## 6. UI (Aurea, pattern esistenti)

Header (titolo + link "Importa") · **barra filtri** (`InterventiFilters`) · riquadri **conteggio** (totale, geocodificati, da correggere, in attesa) · **tabella** (`InterventiTable`) con colonne: **ODL · Indirizzo · Comune · Committente · Stato** (badge via `labelStato`) **· Geocodifica** (badge via `badgeGeocode`) **· Nominativo · Fascia oraria**. Stato vuoto: "Nessun intervento per i filtri selezionati".

## 7. Gestione errori

- Errore query DB → box `--danger` con messaggio.
- Zero righe → stato vuoto (non un errore).
- `data` non valida nei param → ricade su oggi (gestito da `parseInterventiFilters`).

## 8. Test (Vitest, logica pura)

- `parseInterventiFilters`: default (param vuoti → oggi + tutti), valori validi, valori non riconosciuti (→ tutti), data malformata (→ oggi).
- `labelStato`: mappa gli stati noti; fallback ragionevole per valore sconosciuto.
- `badgeGeocode`: ok/failed/pending/null → label+tone attesi.
- Query e render (server + DB) non si unit-testano.

## 9. Sicurezza / accesso

- Pagina sotto `/hub` nel modulo `interventi` (già gated dal meccanismo `allowedModules`). Il server component legge con la sessione utente (RLS `interventi` = authenticated). Nessun service role necessario per la sola lettura.

## 10. Fuori scope (step successivi)

- Assegnazione operatore dalla riga (Fase 1, prossimo step).
- Mini-mappa degli interventi del giorno.
- Modifica inline / dettaglio intervento.
- Paginazione oltre il `limit 1000` (per ora i volumi giornalieri stanno sotto).
