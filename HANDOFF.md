# Handoff — KPI/Produzione economica: limitazioni massive multi-comune (Labico) (2026-07-21)

> Documento di ripresa per una NUOVA chat: è autosufficiente, la sessione precedente non c'è più.
> Stato repo alla scrittura: `main` @ `b0ee176` (include PR #133 mapcn, **#134 questo lavoro**,
> #135 bonifiche extra). PR #134 **MERGIATA e deployata**, working tree pulito.

## Goal

Trattare **Labico come Zagarolo ovunque** nel modulo KPI / Produzione economica (richiesta
**precauzionale**: nessun bug puntuale, ma togliere ogni special-case per comune), e far sì
che il task di allineamento accodato all'agente dalla Produzione economica legga **entrambi**
i comuni delle massive (Labico + Zagarolo), non solo Zagarolo.

## Current status

**COMPLETATO e in produzione (PR #134).** Verificato sul DB prod (Supabase `aceztqfebringeaebvce`):
il giro dell'agente ha girato su Labico e i conteggi tornano. Nessun bug aperto sul filone.
`npx vitest run` = **1977 verdi, 0 rossi** (i 6 rossi preesistenti di `tools/limitazioni-sync`
sono stati **sistemati** in questa sessione). `tsc --noEmit` pulito.

## Done

- **Generalizzazione data-driven** (`lib/produzione/attivitaCanonica.ts`): il guard "riga `acea`
  senza testo attività → limitazione massiva" passa da hardcode `comune === 'ZAGAROLO'` a
  `massiveComuni.has(comune)`. Nuovo helper server-only `lib/produzione/comuniMassive.ts`
  (`caricaComuniMassive()`: `agente_file_colonne.is_master` → `comuniMaster()` → set di chiavi
  normalizzate). `load.ts` e `loadCandele.ts` lo caricano e lo passano a OGNI chiamata di
  `attivitaCanonica`. Qualsiasi comune con un master è ora trattato come Zagarolo; i comuni
  senza master restano estranei (`italgas`). Set vuoto → degrado coerente.
- **Bottone allineamento** (`components/modules/performance/PerformanceEconomica.tsx`): "Zagarolo"
  → **"Limitazioni massive"**, accoda `target='TUTTI'` a `/api/admin/agente/acea-stato`. "Dunning"
  resta separato. Un solo giro Playwright riversa l'export su TUTTI i master massive e ne pusha
  lo snapshot. Zero cambi backend (`acea-stato` e l'agente supportavano già `TUTTI`).
- **Fix cross-platform** (`tools/limitazioni-sync/lib/comuni.mjs`): `comuneDaFile` usa
  `path.win32.basename/extname` (i path Windows dei master SharePoint su runner POSIX). Questo
  ha **risolto i 6 test rossi preesistenti** (`comuni.test.ts` ×3, `risolviMaster.test.ts` ×3,
  che cascavano da quest'unico bug).
- **Commenti** `ZAGAROLO`-only → "massive (Labico/Zagarolo)" in `load.ts`, `saracinescaProdotta.ts`,
  `acea-assegnazioni/route.ts`, `listino/scopri/route.ts`. Nessun cambio di logica.
- **Test**: `attivitaCanonica.test.ts` aggiornato alla nuova firma + casi Labico e set-vuoto.

## Nessun cambio necessario (già a posto, verificato sui dati)

- `saracinescaProdotta` è già comune-agnostica: si "accende" per Labico appena l'agente gira sul
  suo master (sbloccato dal bottone → `TUTTI`). `LABICO.xlsx` ha le stesse colonne di
  `ZAGAROLO.xlsx` (`esito`/`saracinesca`/`Odl saracinesca`).
- Audit a 3 vie: gli ODL Labico erano già coperti (il master DUNNING abbraccia tutti i comuni).
- Performance operatori (`lib/performance/load.ts`): conta tutti i completati, Labico incluso.

## Verifiche fatte in sessione (Supabase MCP, sola lettura)

1. **Il giro su Labico è andato** (ore 11:50): `agente_run` mostra `acea-stato` seguito da **due**
   `acea-master` — la firma di `target=TUTTI` (i giri precedenti a comune singolo ne avevano uno).
   Tutte le righe master di Labico ri-raccolte, con `esito`/`saracinesca` popolati dal master
   (il DUNNING li avrebbe lasciati vuoti → prova che ha letto `LABICO.xlsx`).
2. **Conteggi riconciliati**: ogni limitazione positiva Labico risolve a `committente_eff='acea'`
   (**0 scartate** su italgas — incluse le righe senza testo, prima escluse), **matricole tutte
   distinte** (niente doppio conteggio), **0 collisioni matricola cross-comune** (dedup globale
   sana). Decomposizione del montante massive per comune: Zagarolo dominante, **Labico seconda
   fetta pulita**, il resto rumore (1 riga per comune estraneo).
3. I numeri **salgono** tra una query e l'altra: è **dato vivo** (rapportini chiusi in giornata,
   `ultima_data`=oggi), non un errore.

## Contesto precedente ancora aperto (filone diverso, non toccato)

Dalla sessione "Azioni operatori" (PR #127/#130/#131): configurare con l'utente la **prima foto
condizionale reale** (es. saracinesca spuntata → foto obbligatoria) nel flusso giusto e
verificarla su un giro. Vedi ROADMAP per le rifiniture per-voce.

## What worked

- **Grilling prima di implementare**: ha evitato di "riparare" i € (già corretti — entrambi i
  committenti `acea`/`lim_massive` alias→acea, stessa tariffa massiva). Il gap reale era operativo (giro su
  Labico) + la generalizzazione del guard, non i conteggi.
- **Verifica DB via Supabase MCP** (`execute_sql`, sola lettura) prima di decidere il fix: ha
  ribaltato l'ipotesi iniziale (Labico NON era escluso dai €) e reso le domande precise.
- **`path.win32`** per parsing di path Windows testati su POSIX: fix di una riga, cascata risolta.

## What did NOT work / trappole

- **Ricostruire la pipeline in SQL con LEFT JOIN sull'alias**: fan-out sui duplicati di chiave
  (committente_orig, chiave) → conteggi gonfiati. Rimedio: pre-dedup dell'alias con
  `GROUP BY (committente_orig, chiave)` (come la Map dell'app, una entry per chiave).
- **`origin/main` locale stantìo** in giornate multi-sessione: `git fetch origin main` prima di
  qualsiasi ripartenza. Main è avanzato di 3 PR sotto i piedi (#133/#134/#135).
- **Non c'è service key nell'ambiente cloud**: la pagina Produzione economica non è eseguibile
  qui; verifica fatta ricostruendo la logica di `load.ts` in SQL contro il DB prod.

## Key decisions

- **Data-driven (b)** invece della lista hardcoded `['ZAGAROLO','LABICO']`: aggiungere un comune
  = aggiungere un master, zero modifiche al codice. Coerente con "il comune È il file master".
- **`target='TUTTI'`** per il bottone (non i due comuni espliciti): include ogni comune futuro;
  il controllo per singolo comune resta sulla pagina Agente.
- **Saracinesca: nessun cambio di codice** — è già comune-agnostica, basta il giro su Labico.
- La pagina mostra il **montante aggregato**, senza distinzione per master (e all'utente **non
  serve**): la verifica per-comune si fa a DB, non in UI.

## Key files & commands

- `lib/produzione/attivitaCanonica.ts` — guard massive data-driven (5° param `massiveComuni`).
- `lib/produzione/comuniMassive.ts` — `caricaComuniMassive()` (fonte: `agente_file_colonne.is_master`).
- `lib/produzione/load.ts` + `loadCandele.ts` — caricano e passano `comuniMassive`.
- `components/modules/performance/PerformanceEconomica.tsx` — bottone "Limitazioni massive" (`TUTTI`).
- `tools/limitazioni-sync/lib/comuni.mjs` — `comuneDaFile` con `path.win32`.
- `app/api/admin/agente/acea-stato/route.ts` — accetta `dunning | TUTTI | <COMUNE>`.
- `tools/limitazioni-sync/lib/acea/risolviMaster.mjs` + `eseguiGiroAcea.mjs` — target → N master.
- `npx vitest run` → **1977 verdi** (i 6 lim-sync ora passano). `npx tsc --noEmit` pulito.
- Verifica giro (SQL, progetto `aceztqfebringeaebvce`):
  `select tipo, creato_il from agente_run order by creato_il desc limit 6;`
  (un `acea-stato` + due `acea-master` ravvicinati = giro su TUTTI i comuni massive).

## Open questions

- Nessuna sul filone limitazioni massive: chiuso e verificato.
- Prima foto condizionale reale (filone Azioni operatori): quando la configura l'utente?

## Next step

Nessun passo obbligato su questo filone. Se serve, alla prossima esigenza sulle massive:
aggiungere un comune = mettere il suo `<COMUNE>.xlsx` nella cartella master (l'agente lo scansiona,
`is_master=true`) → entra da solo in conteggi, audit e allineamento `TUTTI`, zero codice.

## Warnings (invarianti da non violare)

- **Mai re-hardcodare `comune === 'ZAGAROLO'`** in `attivitaCanonica` (o simili): i comuni massive
  sono data-driven da `comuniMaster()`/`caricaComuniMassive()`.
- **Non disattivare la voce tassonomia `LIMITAZIONI MASSIVE`**: l'export
  `api/export/limitazioni-massive` è ancorato al literal `gruppo_attivita='LIMITAZIONI MASSIVE'`.
- **Non reintrodurre un bottone per-comune** in Produzione economica: uno solo, "Limitazioni
  massive" = `TUTTI`.
- `comuneDaFile` in `tools/limitazioni-sync` deve restare su `path.win32` (path Windows su POSIX).
- Repo **PUBBLICO**: mai dati di produzione (matricole/ODL/nomi) né importi in commit o PR.
