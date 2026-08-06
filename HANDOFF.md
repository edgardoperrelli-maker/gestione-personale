# Handoff — Env allineate e passaggio dal cloud al PC locale (2026-08-06)

> Catena: l'handoff precedente («App mobile Android/iOS», 2026-08-04) vive in
> `git show 2bcbf98:HANDOFF.md`. Da allora lo stream mobile è andato avanti da solo: il
> piano è su `main`, insieme al workflow iOS/TestFlight e alla rinomina dell'appId in
> `it.gestilab.personale` (commit `f7b15b7`); esistono `android/`, `ios/`, `fastlane/`.
> Le sue domande aperte sono riportate in fondo **da riverificare**: non risulta che
> siano state risolte, ma il lavoro è proseguito oltre quel documento.

## Goal

Avere progetto **e** variabili d'ambiente corrette sul PC di Edgardo, e proseguire lo
sviluppo da Claude Code **locale** invece che dal container cloud (effimero: quando la
sessione web si chiude, sparisce tutto quello che non è stato pushato).

## Current status

- Branch `claude/scarica-progetto-env-uygghj`, ultimo commit **`21a86db`**, **pushato**
  su GitHub, working tree pulito. È 1 commit avanti a `origin/main` (`6865514`).
  Nessuna PR aperta.
- Il container cloud ha repo + `.env.local` completo, ma **il PC non ha ancora niente**:
  il passaggio va fatto con i comandi qui sotto.

## Done

- **`.env.example` sul repo** (nuovo): elenca tutte e 15 le variabili lette dal codice,
  raggruppate per effetto reale se mancano (app non parte / link monco / funzione
  spenta), senza valori veri. Prima non esisteva: l'unico elenco stava nelle env Vercel
  e nel backup Drive, quindi una variabile mancante si scopriva solo trovando la
  funzione rotta.
- **`.gitignore`**: aggiunta l'eccezione `!.env.example` — la riga 3 `.env*` copriva
  anche il template. Verificato che `.env.local` **resta** ignorato (`git add` lo rifiuta).
- **`app/api/hotel-booking/request/route.ts`**: env e codice si contraddicevano.
  `SMTP_PORT=465` è TLS implicito, ma il trasporto forzava `secure: false` + STARTTLS →
  su quella porta il client attacca in chiaro un canale già cifrato e resta appeso fino
  al timeout. Ora `secure`/`requireTLS` derivano dalla porta: 465 e 587 funzionano
  entrambe.
- **`.env.local` nel container**: ricostruito ordinato e commentato, tolte 5 variabili
  di un altro progetto (`ALERT_FROM_NAME`, `ALERT_REPLY_TO`, `ALERT_TO`,
  `ATTREZZATURE_BUCKET`, `ATTREZZATURE_MASTER_KEY` — verificate assenti da tutto il
  codice) e il `VERCEL_OIDC_TOKEN` scaduto. I 9 valori reali sono stati **filtrati dalle
  righe originali, non ricopiati**: hash riga per riga identici.
- **Backup Drive**: caricato il file ripulito in `app/Personale/` come
  **`.env.local.NUOVO-2026-08-06`** (id `18ldm6TdAxtWYUelkWGOQpJ82asyxY7Hu`, 1665 byte,
  sha256 `61ada7e1…`), riscaricato e confrontato: identico byte per byte. Il vecchio
  `.env.local` (id `1exlnRt-7nvwV4yyBxQT5lIRMwEuAr8gO`, 2432 byte) è **intatto**.

## In progress / not yet done

1. **Portare progetto + env sul PC** (vedi «Setup sul PC»). ← prima cosa
2. **Swap del file su Drive**: sostituire il vecchio `.env.local` con il `NUOVO-`.
   Il modo pulito è farlo dal PC con `salva-env.ps1`, che gestisce da solo la copia
   `.OLD-<data>`.
3. **Due segreti da recuperare** dal dashboard Vercel del progetto e mettere in
   `.env.local`: `ATLAS_REPORT_SECRET` (senza, `/api/segnala` risponde 503 — la route è
   fail-closed) e `ASSIST_CHANNEL_SECRET` (ha un fallback funzionante su
   `SUPABASE_SERVICE_ROLE_KEY`, ma se in produzione è valorizzato gli id di sessione
   dell'assistenza non coincidono tra locale e prod).
4. Decidere se aprire una PR per `claude/scarica-progetto-env-uygghj`.

## Setup sul PC (comandi esatti, PowerShell)

```powershell
cd $HOME\Desktop
git clone https://github.com/edgardoperrelli-maker/gestione-personale.git gestione-personale-main
cd gestione-personale-main
git checkout claude/scarica-progetto-env-uygghj
npm install
```

⚠️ **La cartella deve chiamarsi `gestione-personale-main`**: è il nome che
`salva-env.ps1` si aspetta per questo progetto (tabella in `ISTRUZIONI-ENV.md`). Con un
nome diverso, `-Restore` lo segnala come assente e passa oltre senza dire altro.

Poi le env, in uno dei due modi:

```powershell
# A) dal backup Drive, per tutti i progetti in un colpo
powershell -File "G:\Il mio Drive\app\salva-env.ps1" -Restore -Only Personale

# B) a mano, prendendo il file già ripulito
copy "G:\Il mio Drive\app\Personale\.env.local.NUOVO-2026-08-06" .env.local
```

La via **A** rimette il file **vecchio** (quello con i residui) finché lo swap del
punto 2 non è fatto; la via **B** mette subito quello ripulito. Dopo aver aggiunto i due
segreti, riallineare il backup con `powershell -File "…\salva-env.ps1"` (senza
`-Restore`): copia solo ciò che è cambiato e mette da parte un `.OLD-<data>`.

Verifica: `npm run dev` → http://localhost:3000 mostra la login. In dev il service
worker **non** viene generato (atteso, vedi `next.config.mjs`); per provare la PWA
serve `npm run build && npm start`.

## What worked

- **Ricostruire `.env.local` filtrando le righe originali** (`grep -E "^CHIAVE="` da una
  copia) invece di ritrascrivere i valori: elimina il rischio di errore di battitura su
  una chiave, e l'uguaglianza si verifica con `sha256sum` riga per riga.
- **Distinguere i due `.env.local` su Drive** leggendo `ISTRUZIONI-ENV.md`
  (id `1-Q6B8UFkFPhPrgQaezth_oYfewqpKvx0`), che mappa progetto → repo → file → cartella.
  Quello in `app/Aurea/` è più recente ma è di **un altro progetto**: prenderlo avrebbe
  puntato l'app al database sbagliato.
- **Verificare i test rossi con `git stash`** prima di attribuirseli.

## What did NOT work (e perché)

- **Sovrascrivere il file su Drive**: il connettore Drive di questa sessione ha
  `create_file`/`copy_file` ma **nessun update in place, nessun delete/trash**. Caricare
  un secondo file chiamato `.env.local` avrebbe lasciato due omonimi nella stessa
  cartella (Drive lo permette; su Drive desktop diventano `.env.local` e
  `.env.local (1)`) e `salva-env.ps1` cerca **per nome** → poteva prendere quello
  sbagliato. Da qui il nome datato `NUOVO-`, che lascia lo stato non ambiguo.
- **Recuperare `ATLAS_REPORT_SECRET` da qualche altra parte**: non c'è. Controllati i
  backup di Aurea, Villaverde, Salute, Ripristini, Gelateria e la cartella `Atlas` su
  Drive (contiene solo `ATLAS_PROJECT_BRIEF.md`). Gli strumenti Vercel disponibili
  (`get_project`, `list_projects`, …) **non espongono i valori delle variabili**: nessun
  tool env. Va preso a mano dal dashboard.
- **`git fetch origin <branch>` con un ref remoto stale**: `claude/scarica-progetto-env-uygghj`
  risultava in `git branch -a` ma non esisteva su origin; il fetch fallisce con
  `couldn't find remote ref` e **aborta l'intera fetch**, lasciando `origin/main`
  indietro di 277 commit e facendo sembrare il repo divergente. Fetchare `main` da solo
  ha risolto (forced update).

## Key decisions

- **`.env.example` committato** invece di documentare le variabili solo in un `.md`: il
  template sta accanto al codice, quindi si aggiorna insieme a chi legge `process.env`.
  Costo: l'eccezione in `.gitignore`, che va lasciata lì.
- **`secure` derivato dalla porta** invece di cambiare `SMTP_PORT` a 587 nell'env: la
  seconda avrebbe lasciato il codice fragile e il valore 465 sarebbe comunque rimasto su
  Vercel e nel backup Drive. Così entrambe le porte sono corrette ovunque.
- **`NEXT_PUBLIC_SITE_URL` lasciata all'URL di produzione** anche in locale: è usata per
  costruire link assoluti nelle sincronizzazioni rapportini e nelle API mappa, quindi i
  link condivisi devono puntare all'app vera. Non è un errore di configurazione.

## Key files & commands

- `.env.example` — elenco autorevole delle variabili e di cosa si rompe senza.
- `HANDOFF.md` (questo file) · `AGENTS.md` — regole di progetto, §11 sui file da non
  toccare senza istruzione.
- Drive `app/ISTRUZIONI-ENV.md` — mappa progetto→repo→file e trappole del backup.
- Drive `app/salva-env.ps1` — sync PC↔Drive; anche in `C:\Users\Edgardo\Desktop\tools\`.
  `-WhatIf` mostra cosa farebbe, `-Only Personale` limita a questo progetto.
- `npm run dev` · `npm run build` · `npm test` · `npx tsc --noEmit` · `npm run lint`.

## Open questions

- **Test rossi preesistenti su `main`** (3 su 3254, verificati con `git stash`: falliscono
  identici senza le modifiche di questa sessione): `lib/acqualatina/anagraficaUtente.test.ts`
  («la select espone le due colonne nuove»), `lib/acqualatina/matricolaNuovaRegistro.test.ts`
  («NON sta nella COLONNE principale»), `utils/numeroItGuardia.test.ts` («nessun sorgente
  formatta NUMERI con toLocaleString/Intl»). Sembrano guardie legate a **migration non
  ancora applicate**. Da sistemare o da dichiarare attese — ora rendono `npm test` rosso
  sempre, quindi non fa più da rete di sicurezza.
- `npm run lint`: **70 problemi** (37 errori, 33 warning) su tutto il repo, preesistenti.
- **Ereditate dallo stream mobile, da riverificare** (potrebbero essere superate dai
  commit iOS/fastlane): perimetro moduli sul telefono operatore; ok esplicito a
  installare Capacitor (AGENTS.md §11.3); modello login operatore; moduli per tablet;
  nome app e canale iOS; eventi push.
- **Sicurezza, fuori stream ma da non perdere**: 6 tabelle `bak_*_20260730` con RLS
  disabilitata (`bak_committente_manuali_20260730_{int,voci,ops}`,
  `bak_odl_impianto_20260730_{int,voci,ops}`) → abilitare RLS o eliminarle.

## Next step

Sul PC: eseguire il **Setup sul PC** qui sopra, poi aggiungere a `.env.local` i due
segreti presi da Vercel (`ATLAS_REPORT_SECRET`, `ASSIST_CHANNEL_SECRET`) e lanciare
`salva-env.ps1` senza `-Restore` per riallineare il backup su Drive — a quel punto il
file `.env.local.NUOVO-2026-08-06` su Drive si può cancellare.
