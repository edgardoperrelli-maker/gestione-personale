# Studio di fattibilità — sostituire Leaflet con **mapcn**

_Data: 2026-07-21 · Branch: `claude/mapcn-library-integration-5120ng`_

> Analisi della libreria open source **mapcn**, verifica della sua integrità e valutazione
> della fattibilità di sostituire l'attuale libreria di mappe (**Leaflet 1.9.4**) del progetto.

> **Stato di avanzamento (aggiornato):** migrazione **completata**.
> - ✅ **Fase 0** — Fondamenta shadcn/mapcn (cn(), token, `components.json`, `components/ui/map.tsx`).
> - ✅ **Fase 1** — Mappe minori (`TorreMappa`, dashboard "Operatori di oggi") su `OperatorsMap`.
> - ✅ **Fase 2** — Mappa operativa principale (`MappaOperatoriClient`) su `PlanningMap`; **dipendenza
>   `leaflet` rimossa**. Verifiche: `tsc` 0 errori, `next build` OK (111 pagine).
>
> Lo studio sotto è il documento originale di fattibilità (mantenuto come riferimento).

---

## 1. Verdetto in sintesi

| Domanda | Risposta |
|---|---|
| mapcn è una libreria reale e affidabile? | **Sì**, ma con importanti caveat (vedi §2). |
| È un rimpiazzo "drop-in" di Leaflet? | **No.** Cambia motore (WebGL/vettoriale) e paradigma (React dichiarativo). |
| La migrazione è fattibile? | **Sì, ma non banale.** Riscrittura architetturale, non port riga-per-riga. |
| Effort stimato | **~230 righe** di logica mappa in `MappaOperatoriClient.tsx` (su 3.986) + 2 mappe minori + prerequisito shadcn. Stima **5–9 giorni/uomo**. |
| Raccomandazione | **Non urgente.** Procedere solo se si vogliono i vantaggi WebGL (molti marker/rotte, theming vettoriale). Altrimenti Leaflet resta adeguato. Se si procede: **pilota prima sulle mappe minori.** |

**Rischio numero uno (integrità):** ⚠️ **NON eseguire mai `npm install mapcn`.** Il nome `mapcn`
su npm è uno *squat* non correlato (vedi §2.3). mapcn si installa **solo** via CLI shadcn.

---

## 2. Verifica di integrità della libreria

### 2.1 Identità e salute del progetto (dati verificati)

| Voce | Valore |
|---|---|
| Repository | `github.com/AnmolSaini16/mapcn` (reale, verificato) |
| Autore | Anmoldeep Singh (handle `AnmolSaini16`) |
| Popolarità | **~10.900 star**, ~615 fork, ~10 issue aperte |
| Attività | **Molto attivo** — commit quasi giornalieri, ultimo commit **2026-07-20**, ~102 commit su `main` |
| Età | Creato nel 2026, **pre-1.0**, nessun tag/release semver, nessun changelog |
| Licenza | **MIT** (file `LICENSE`, Copyright © 2025 Anmoldeep Singh) |
| Motore sottostante | **MapLibre GL JS** (`maplibre-gl` ^5.15.0, BSD-3) — wrap diretto, senza `react-map-gl` |

> Nota licenza: il `package.json` del repo **non ha campo `license`** ed è `"private": true`
> (è l'app Next.js della documentazione, versione 0.1.0). La concessione MIT arriva **solo** dal
> file `LICENSE`. Con il modello copy-paste, assicurarsi che l'header MIT accompagni i file copiati.

### 2.2 Modello di distribuzione

mapcn **non è un pacchetto npm**. È una collezione di componenti in stile **shadcn/ui** ("possiedi il
codice"): si esegue la CLI shadcn contro il registry ospitato, es.

```bash
npx shadcn@latest add https://mapcn.dev/maps/map.json   # oppure: shadcn add @mapcn/map
```

che **copia il sorgente del componente nel tuo repo** (`components/ui/map.tsx`) e installa
`maplibre-gl` come dipendenza. **Prerequisito:** un progetto con **Tailwind CSS + shadcn/ui già
configurati** (deve esistere `components.json` e l'helper `cn()`).

### 2.3 ⚠️ Segnalazioni di integrità (ordinate per gravità)

1. **NPM NAMESQUAT (critico).** Il nome `mapcn` sul registro npm pubblico è un **placeholder di
   squatting non correlato**: versione 0.0.1, maintainer `atool <i@hust.cc>`, pubblicato 2026-05-14,
   descrizione letterale *"npm package name robbery"*, 219 byte, 2 file, nessun README. Chi esegue
   `npm install mapcn` aspettandosi la libreria mappe ottiene **codice sconosciuto sotto un nome che
   sembra affidabile**. → Installare **esclusivamente** via CLI shadcn contro l'URL ufficiale.

2. **Bus factor = 1.** Progetto sostanzialmente mono-autore. Nessun co-maintainer evidenziato.
   Rischio di singolo punto di rottura per una dipendenza di produzione. (Conteggio esatto
   contributor non verificabile: grafico GitHub non caricabile in ambiente headless.)

3. **Progetto giovane / pre-1.0.** Nessuna linea di release stabile, nessun tag semver, nessun
   changelog. Le API dei componenti possono cambiare tra una copia e l'altra.

4. **Modello copy-paste = nessuna propagazione automatica delle patch.** I componenti vivono nel tuo
   repo: fix di sicurezza upstream non arrivano da soli, vanno re-importati e riconciliati a mano.
   Buono per il controllo/no-lock-in, ma la manutenzione è a tuo carico.

5. **Fetch remoto in fase di install (superficie supply-chain).** L'`add` scarica il sorgente da un
   URL live su `mapcn.dev` e lo scrive nell'albero sorgente. `mapcn.dev` è dietro protezione
   Cloudflare (403 ai client non-browser), il che **ostacola una review/diff automatizzata** del
   codice prima del commit. → Mitigazione: rivedere il componente in un browser reale, poi
   **pinnare/committare** il sorgente copiato in git.

6. **Rischio transitivo stretto ma reale.** La dipendenza runtime che entra nella tua app è
   essenzialmente **`maplibre-gl`** (libreria grande, reputata, attivamente mantenuta, BSD-3,
   **nessun CVE noto**). Le dipendenze pesanti nel `package.json` del repo (next 16, recharts, shiki,
   radix, ecc.) appartengono al **sito docs** e **non** entrano nella tua app.

**Verdetto integrità:** repository reale, popolare, MIT, molto attivo. Adottabile in produzione
**a condizione di**: (a) installare solo via CLI shadcn — **mai** `npm install mapcn`; (b) rivedere e
pinnare in git il sorgente copiato; (c) mettere in conto aggiornamenti manuali; (d) trattare
`maplibre-gl` come il footprint runtime reale.

---

## 3. Architettura tecnica e parità funzionale

**Paradigma:** componenti React dichiarativi (stile shadcn) sopra il MapLibre GL imperativo.
Escape hatch: hook **`useMap()`** che restituisce l'istanza `maplibre-gl` grezza per tutto ciò
che non è wrappato (`fitBounds`, `addSource`/`addLayer`, ecc.).

**Componenti forniti:** `Map` (+ `useMap`), `MapMarker`, `MarkerContent` (HTML custom),
`MarkerPopup`, `MarkerTooltip`, `MarkerLabel`, `MapPopup`, `MapControls` (zoom/bussola/locate/
fullscreen), `MapRoute` (polyline via GeoJSON LineString), `MapArc`, `MapGeoJSON` (poligoni
fill+outline), `MapClusterLayer` (clustering GPU nativo).

### Mappatura funzionale Leaflet → mapcn/MapLibre

| Funzione usata oggi (Leaflet) | Equivalente mapcn/MapLibre | Note |
|---|---|---|
| `L.map` / `tileLayer` | `<Map>` (basemap CARTO integrata) | ✅ diretto |
| `circleMarker` (staff, task) | ❌ nessun componente dedicato | Usare **circle layer GPU** (`useMap()+addLayer({type:'circle'})`) o `MapClusterLayer`. `MapGeoJSON` gestisce solo poligoni. |
| `marker` + `divIcon` (pin numerati HTML) | `MapMarker`/`MarkerContent` **oppure** symbol layer | ⚠️ **il punto più difficile** (vedi §5) |
| `polyline` (rotte tratteggiate) | **`MapRoute`** | ✅ ben coperto, GPU, `dashArray` supportato |
| `bindPopup(html)` | `MarkerPopup`/`MapPopup` (JSX) | Ristrutturare da stringa HTML a JSX |
| `fitBounds` | ❌ nessun helper | Chiamare `useMap().fitBounds(...)` a mano |
| `on('click')` per-marker | click a **livello layer** (`e.features[0].properties`) | Le closure per-marker vanno spostate in `feature.properties` |
| tema chiaro/scuro | ✅ **first-class** (auto light/dark, `setStyle`) | Vantaggio: theming vettoriale a runtime |

### Differenze non funzionali chiave

- **Bundle:** `maplibre-gl` ≈ **210–290 KB gzip** vs Leaflet ≈ **42 KB gzip** → **~5–7×** più pesante.
  Rilevante per il **footprint di installazione della PWA** (il progetto usa Serwist/service worker).
- **SSR:** solo client (WebGL tocca `window`) → serve `'use client'` + `next/dynamic({ssr:false})`.
  **Stesso vincolo che il progetto già applica** con Leaflet — non è attrito nuovo.
- **Offline/PWA:** mapcn **non ha storia offline**. Il raster attuale è banale da cachare (Cache API
  per PNG). Il vettoriale richiede impacchettare lo style JSON + **glyph** (font PBF) + **sprite**
  (icone) + tile (es. **PMTiles**) e cacharli via Serwist → **downgrade in semplicità offline**
  (lavoro one-time moderato, non un blocco).
- **Rendering:** WebGL/GPU → **scala molto meglio** con migliaia di marker/feature e rotte lunghe,
  ma **richiede WebGL** (blank su device/browser che lo bloccano).

---

## 4. Stato attuale nel progetto (uso di Leaflet)

Leaflet 1.9.4, importato dinamicamente, in **6 file**:

| File | Righe | Uso mappa | Difficoltà migrazione |
|---|---:|---|---|
| `components/modules/mappa/MappaOperatoriClient.tsx` | 3.986 | **Mappa operativa principale** (di cui solo ~230 righe di logica Leaflet) | 🔴 **Alta** |
| `components/modules/live/TorreMappa.tsx` | 77 | circleMarker + popup + fitBounds | 🟡 Media |
| `components/modules/dashboard/TodayMapLeaflet.tsx` | 75 | quasi-duplicato di TorreMappa | 🟡 Media |
| `components/modules/dashboard/DashboardTodayMap.tsx` | 35 | wrapper `next/dynamic ssr:false` | 🟢 Triviale |
| `app/hub/mappa/page.tsx` | 398 | solo `import 'leaflet/dist/leaflet.css'` (RSC) | 🟢 Triviale |
| `utils/routing/types.ts` | 62 | tipi (nessun import Leaflet) | 🟢 Basso |

**Superficie API Leaflet:** piccola e convenzionale — `map`/`tileLayer`/`layerGroup`/`circleMarker`/
`marker`+`divIcon`/`polyline`/`bindPopup`/`on-click`/`fitBounds`/`panTo`/`openPopup`/`remove`/
`clearLayers`. **Nessun** plugin, **nessun** clustering, **nessun** evento a livello mappa, **nessun**
tooltip, **nessun** DomUtil.

**Fatto importante — il provider tile è già CARTO.** Tutte le mappe attuali caricano
`basemaps.cartocdn.com/rastertiles/voyager/...`. Quindi il default CARTO di mapcn **è la stessa
relazione già in essere**: la migrazione **non introduce nuova esposizione di licenza tile** (vedi §7).

**Motore di routing già renderer-neutrale.** `utils/routing` produce `polyline: Array<{lat,lng}>`
(geometria a linea retta, nearest-neighbor + 2-opt). Non richiede **alcuna modifica**. ⚠️ Unico
tranello: MapLibre/GeoJSON usa **`[lng, lat]`**, Leaflet usa `[lat, lng]` → **inversione di
coordinate** al confine routing→mappa (hotspot di bug silenzioso).

**shadcn NON è configurato.** Nessun `components.json`; `lib/utils.ts` **vuoto** (nessun `cn()`);
`clsx`/`tailwind-merge`/`class-variance-authority` non installati come dipendenze dirette. Tailwind v4
è sano, ma il tema è **class-based `html.light`** (dark-first) — **invertito** rispetto alla
convenzione `.dark` di shadcn. → Adottare mapcn richiede un **init shadcn da zero** + riconciliazione
di due sistemi di token e della convenzione di tema.

---

## 5. Analisi dell'effort di migrazione

Il grosso del lavoro è **architetturale**, concentrato in ~230 righe di `MappaOperatoriClient.tsx`
(init 1180-1204, marker staff 1207-1244, effetto distribuzione 1247-1379, rotta singola 1382-1409,
focus imperativo 1697-1704). Le altre ~3.750 righe (import Excel, geocoding, distribuzione k-means/
2-opt, modali, rapportini) sono **Leaflet-agnostiche e non si toccano**.

**I nodi più difficili:**

1. **Invertire il modello `clearLayers()`+ricostruisci-tutto** (imperativo) in
   **state → GeoJSON FeatureCollection → source/layer dichiarativi**. È l'opposto del paradigma
   MapLibre — riscrittura dei tre grandi `useEffect`, non port riga-per-riga.
2. **Pin numerati `divIcon` (HTML)** — nessun equivalente diretto: i symbol layer non rendono HTML
   arbitrario. Opzioni: (a) `<MapMarker>`/`MarkerContent` React (dichiarativo ma pesante per molti
   marker), oppure (b) **symbol layer** con `text-field` per l'indice + icone generate. **Elemento
   visivo più critico** (ordine di visita `idx+1` legato all'ordine di rotta).
3. **5 template di popup HTML** → componenti popup React (JSX + lookup su `feature.properties`).
4. **Styling calcolato per-feature** (raggio 9/7 se reperibile, colore per territorio/operatore,
   raggio/opacità se appuntamento) → **espressioni MapLibre data-driven** (`['case']`, `['match']`,
   `['get']`) con i valori spinti in `feature.properties`.
5. **Bridge dei due tocchi imperativi**: `fitBounds` on-data-change (4 punti) e
   `focusExcelTask` (`panTo`+`openPopup` per id, chiamato da un componente fratello via
   `excelMarkersRef`) → richiedono un **map-ref** + stato `selectedFeature` controllato (camera
   `flyTo` + popup controllato). La `excelMarkersRef` (Map<id, marker>) non ha analogo dichiarativo.
6. **Theming via token CSS**: oggi i colori sono risolti da `getComputedStyle` (né Leaflet né
   MapLibre leggono `var()`). Vanno ricomputati e **ri-applicati sul cambio tema** (`html.light`),
   inclusi i token territorio (oggi passati non risolti).

**Consiglio trasversale:** `TorreMappa` e `TodayMapLeaflet` sono quasi-duplicati → **unificarli in
un unico `<OperatorsMap>` dichiarativo** durante il port (migrare una volta, non due).

---

## 6. Rischi e mitigazioni

| Rischio | Gravità | Mitigazione |
|---|---|---|
| `npm install mapcn` → squat malevolo | 🔴 Alta | Installare solo via CLI shadcn; documentare il divieto nel repo |
| Bus factor 1 / progetto pre-1.0 | 🟡 Media | Modello copy-paste = codice tuo; pinnare in git, non dipendi dall'upstream |
| Nessuna propagazione patch | 🟡 Media | Processo manuale di re-`add` + diff a ogni update |
| Bundle +5–7× per una PWA | 🟡 Media | Lazy-load `ssr:false` (fuori dal critical path); trimmare il componente copiato |
| Offline vettoriale complesso | 🟡 Media | Estendere Serwist a style+glyph+sprite+PMTiles (one-time) |
| Inversione `[lat,lng]`→`[lng,lat]` | 🟡 Media | Helper centralizzato di conversione + test |
| WebGL non disponibile | 🟢 Bassa | Fallback/messaggio; raro sui target attuali |
| shadcn assente + tema invertito | 🟡 Media | Init shadcn isolato; mappare i token `--brand-*`/`html.light` |

---

## 7. Costi e licenze dei tile

**Premessa che ribalta il dubbio comune:** l'app **usa già CARTO** oggi (raster voyager). Quindi il
default CARTO di mapcn (positron/dark-matter vettoriali) **non aggiunge alcun nuovo obbligo di
licenza** — la questione CARTO Enterprise è una **condizione pre-esistente**, non creata dallo switch.

| Opzione | Costo | Uso commerciale | Note |
|---|---|---|---|
| **CARTO CDN** (default mapcn = status quo) | €0 runtime, no API key | ⚠️ Richiede CARTO Enterprise (prezzo sales-gated) | Già la situazione attuale |
| **Protomaps PMTiles self-host** | Solo storage/egress (~centesimi/mese) | ✅ **Sì** (CC0 style, dati OSM ODbL, attribuzione) | **Percorso zero-cost consigliato**, MapLibre-compatibile |
| Self-host tileserver-gl/OpenMapTiles | Solo VPS | ✅ Sì | Controllo totale |
| `blank` (senza basemap) | €0 | ✅ Sì | Solo data-viz |
| MapTiler | Free tier **non-commerciale** | Commerciale da ~$25/mese | API key |
| Stadia Maps | Free tier **non-commerciale** | Commerciale da ~$20/mese | API key |
| `tile.openstreetmap.org` | €0 | ❌ **Vietato** in produzione (OSMF policy) | Non usare |

**Esiste un percorso zero-cost e commercial-safe:** self-hosting **Protomaps PMTiles** (un unico file
planet su S3/R2 + CDN via HTTP range request), che si innesta direttamente nella prop `styles` di mapcn.

---

## 8. Raccomandazione e piano a fasi

**Raccomandazione:** la migrazione è **fattibile ma non urgente**. Leaflet oggi è adeguato al carico.
Adottare mapcn **ha senso se** si vogliono: rendering GPU per molti marker/rotte, theming vettoriale
light/dark a runtime, rotte lunghe più fluide. **Non** ha senso come semplice "modernizzazione" a
parità di funzioni: il costo (riscrittura dichiarativa + prerequisito shadcn + bundle + offline) supera
il beneficio se la mappa resta semplice.

**Se si procede — approccio a rischio crescente:**

1. **Fase 0 — Fondamenta (0.5–1 gg):** init shadcn (`components.json`, `cn()` in `lib/utils.ts`,
   `clsx`+`tailwind-merge`), riconciliare token/tema (`html.light` ↔ `.dark`). Decidere il provider
   tile (consigliato: **PMTiles self-host** o mantenere CARTO come oggi).
2. **Fase 1 — Pilota sulle mappe minori (1–2 gg):** migrare `TodayMapLeaflet` + `TorreMappa` in un
   unico `<OperatorsMap>` mapcn. Basso rischio, valida il pattern SSR/tema/offline end-to-end.
3. **Fase 2 — Mappa principale (3–5 gg):** riscrivere le ~230 righe di `MappaOperatoriClient` in
   modello source/layer GeoJSON; affrontare i 6 nodi del §5 (pin numerati, popup JSX, paint
   data-driven, bridge `fitBounds`/`focus`, theming token). `utils/routing` invariato (attenzione
   all'inversione coordinate).
4. **Fase 3 — PWA/offline (1 gg):** estendere Serwist a style+glyph+sprite+tile; verificare il
   footprint del bundle.
5. **Fase 4 — Cleanup:** rimuovere `leaflet` e `@types/leaflet`, uniformare il pattern SSR.

**Prossimo passo consigliato:** dare l'ok alla **Fase 0 + Fase 1** come proof-of-concept a basso
rischio, poi decidere sulla mappa principale con dati reali di bundle/offline alla mano.
