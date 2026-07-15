# Handoff — 2026-07-15: agente lim-sync (ZAGAROLO riconciliato + Labico multi-comune)

**Branch**: `main` (= produzione Vercel) · **Stato**: tutto mergiato e in produzione; restano 2 passi manuali (vedi Next step)

## FILONE 1 — Perf Riepilogo rapportini (CONCLUSO)
PR **#96 mergiata** (`d1168d5`): `GET /api/mappa/rapportini/riepilogo` da **4,71s → ~55ms**.
La route scansionava `rapportino_voci` due volte (una per contare le voci, una col JSONB
`risposte` per le foto in sospeso), paginando a 1000 righe e conteggiando in JS. Ora una sola
RPC `riepilogo_conteggi_voci(rap_ids uuid[])` (migration `20260715120000`, applicata) +
piani/ai-log/RPC in `Promise.all`. Rimossi `lib/rapportini/contaVoci.ts`, `contaVoci.test.ts`,
`contaFotoInSospeso.ts`; tenuta la util pura `utils/rapportini/fotoInSospeso.ts`.
La logica foto-in-sospeso della RPC è stata validata su dati reali: **0 righe discordanti** vs JS.

## FILONE 2 — Esiti "non riportati" su ZAGAROLO (CONCLUSO)
Due segnalazioni di esiti positivi non riportati → **il codice era corretto, il canale era rotto**
(contesa OneDrive/co-authoring sul file condiviso). Nel percorso, 3 PR mergiate:

1. **PR #91 — il positivo vince SEMPRE**: `cellaEsitoDaSovrascrivere` (`lib/scrittura.mjs`) —
   il positivo sovrascrive QUALSIASI esito non-positivo (anche testo libero tipo "NO PASSAGGIO",
   anche su righe a mano). L'upgrade riscrive tutti i dati di lavorazione
   (`CAMPI_FORZA_POSITIVO`: esito/note/esecutore/sigillo/saracinesca + data); un campo VUOTO del
   positivo NON cancella il dato a file. Il refresh negativo resta limitato a esito/note/data.
2. **PR #92 — test-pollution `.sync-watch.json`**: env `LIMSYNC_WATCH_STATE` (default pigro in
   `sincronizzazioneWatch.mjs`), impostata da `vitest.config.ts` a una dir temp per run.
   `salvaStato` atomico (tmp+rename — lecito sullo stato locale, **MAI** sui master).
3. **PR #95 — cognomi composti**: `cognomeDaDisplayName` particle-aware ("DE SANTIS ALESSANDRO"
   → "DE SANTIS", non "DE"). Eliminati 27+ conflitti/giro.

**Riconciliazione ZAGAROLO.xlsx — procedura che FUNZIONA**: il file era diviso in due versioni
divergenti (server = salvataggi ufficio, locale = scritture agente) e OneDrive restava "in
sospeso" per sempre. Soluzione: backup → **aprire il file in Excel su questo PC** (merge
co-authoring a livello cella, nessuna perdita da nessun lato) → chiudere → "Disponibile".
**MAI spostare/cancellare il locale**: OneDrive propaga la DELETE al server.

## FILONE 4 — Template «Ibrido acea» (limitazioni massive + limitazioni/sospensioni)

Nuova richiesta (ATLAS `5d33e41f`): un **unico** template rapportino "Ibrido acea" per fare nello
stesso giro Acea sia le **limitazioni massive** sia le **limitazioni/sospensioni**. Realizzato come
**seed migration** — nessun codice nuovo: `supabase/migrations/20260715150000_ibrido_acea_template.sql`.

- È il **superset** di `RAPPORTINO LIMITAZIONI MASSIVE` + `LIMITAZIONI/SOSPENSIONI`; committente
  `acea`, `is_default=false` (non altera la risoluzione dei template pianificati, che si scelgono a mano).
- Le "funzioni già settate" si attivano da sole perché il codice riconosce i campi **per nome**:
  esito `eseguito` con "NESSUN PASSAGGIO" → rossa diretta (`utils/rapportini/voceColore.ts`) e valvola
  condizionale `sostituzione_valvola`=SI ⇒ foto `sost_valvola` obbligatoria (`utils/rapportini/fotoCondizionali.ts`).
  Per questo chiavi/etichette sono state **replicate identiche** ai due template origine.
- Foto: 4 obbligatorie fisse (ANTE PANORAMICA, INSERIMENTO LIMITAZIONE, LETTURA MISURATORE, SIGILLATURA)
  + SOST. VALVOLA obbligatoria **solo se** valvola=SI (condizionale, come nel massive). Totale 10 campi,
  5 foto, 7 obbligatori. JSON validato read-only sul DB; seed `insert ... where not exists` (idempotente).
- Scelte di merge (dove i due origine divergevano): `sostituzione_valvola` SI/NO **obbligatoria** e
  `sigillo` **obbligatorio** (versione massive, più completa; nelle sospensioni erano più leggeri).
  Un vero ibrido "campi diversi per attività" NON è possibile oggi (il template ha un solo set di campi
  per tutte le voci): servirebbe sviluppo dedicato.
- ⚠️ **Seed da applicare al prod** (non ancora eseguita): il template non esiste ancora a DB.

## FILONE 3 — Labico: limitazioni massive multi-comune (MERGED, 2 passi manuali aperti)

### Goal
Dal **16/07/2026** le limitazioni massive non sono più solo Zagarolo: parte **Labico**
(`LABICO.xlsx`, 525 righe, stessa cartella LIMITAZIONI MASSIVE). Richiesta: testare che
l'agente funzioni, poi rendere i giri scegli-il-comune "così da farlo girare sempre per tutti".

### Esito del test (prima di toccare codice)
- **Il giro di sincronizzazione notturno funzionava già**: `eseguiGiro` scansiona la cartella
  (`agente.mjs`, readdirSync) → Labico entra da solo. Provato in **dry-run sul file reale**:
  master riconosciuto, 0 colonne assenti, 0 conflitti, 0 errori; simulando i lavori di domani
  l'aggancio funziona. La mappatura va per **nome** di colonna (globale, non per file) → le 7
  colonne mappate esistono identiche in Labico.
- **Il giro ACEA no**: non scansiona, apriva **un solo** masterPath dal config. Gli ODL di Labico
  sono **già nell'export ACEA** (stesso contratto) e venivano scaricati e buttati ogni sera —
  prova: `_log/20260714-2001-acea-zagarolo.json` riporta 2869 non agganciate, **di cui esattamente
  525 nel range Labico** (= le 525 righe del file). `stato odl` non si sarebbe mai popolata.

### Cosa è stato fatto
- **PR #97 (MERGED) — parser import censiti, alias `Ordine` → odl.** Le estrazioni ACEA per comune
  intestano le colonne diversamente da quella usata per Zagarolo: `Ordine` (non `Ods/odl`) e
  `Impianto` (non `PDR`). L'import di Labico sarebbe entrato **senza ODL e senza PDR**.
- **PR #99 (APERTA ⚠️) — `Impianto` → pdr.** La #97 è stata mergiata mentre il secondo commit era
  ancora in volo: su main è finito **solo** l'alias `Ordine`. Verificato su `origin/main`
  (`PATTERN.pdr` è ancora quello vecchio). **Va mergiata PRIMA dell'import**, altrimenti i 525
  censiti entrano col PDR vuoto e vanno ricaricati.
  Su `LABICO.xlsx` reale: odl 0→**525/525** (già in prod), pdr 0→**525/525** (solo con la #99).
- **PR #98 (MERGED) — selettore comune** su entrambi i giri + migration `forza_giro_comune`
  (**applicata via MCP**, autorizzata dall'utente perché il tick era già in 500 dopo il merge).

### Key decisions

| Decisione | Perché |
|---|---|
| **Il comune È il nome del file** (`<cartella>/<COMUNE>.xlsx`) | Un comune nuovo = un file nella cartella. Niente blocco di config per comune, niente deploy, mai più. Le colonne sono identiche per tutti i comuni: l'unica differenza era il `masterPath`, che ora si deriva. |
| Un solo export ACEA per N master | login/ricerca/export sono condivisi. ACEA è lenta e inaffidabile: una sessione Playwright per comune moltiplicherebbe i fallimenti (vedi giro 23/06, 72/85 falliti). |
| Filtro comune **solo** sul lancio manuale | Il giro schedulato delle 21 deve fare SEMPRE tutti i comuni. `forza_giro_comune` è one-shot: il tick lo legge PRIMA di azzerarlo e lo restituisce solo se `forzato` (non basta l'igiene del dato: l'invariante regge per costruzione). |
| **Mai degradare a "tutti"** | Comune/target sconosciuto = errore (400 lato app, `erroreGlobale` lato agente). Scrivere sul master sbagliato è peggio che non scrivere. Prima un target ignoto diventava silenziosamente `dunning`. |
| `Impianto`→pdr come **ripiego**, non alias | La mappatura assegna a un campo la PRIMA colonna che matcha: in un file con `Impianto` prima di `PDR` un alias normale ruberebbe il posto al PDR vero. Seconda passata dedicata. |
| `^ordine$` **ancorato** | Un `/ordin/` lasco matcherebbe `Coordinate` delle estrazioni geolocalizzate. |
| "Non agganciate" = **intersezione** fra i master lavorati | Per-master, con 'Tutti' gli ODL di Labico risulterebbero mancanti solo perché stanno nell'altro file. |
| **Finestra resta a 60** | Decisione esplicita dell'utente (era ⚠️ "riportare a 15" dal recupero ZAGAROLO). Non riproporlo. |

### Failed approaches / ipotesi smontate (NON ripeterle)
- **"Le matricole di Labico non censite sono BLOCCANTI per domani"** → **FALSO**, verificato:
  `cerca-limitazione/route.ts:80` risponde `{trovato:false, suggerimenti}` e **non impedisce
  l'invio**; per `lim_massive` basta un identificativo (`anagraficaValida` → `return hasId`);
  e l'agente aggancia per ODL **oppure** `comune|matricola` (`lib/match.mjs:57`). Il censimento
  serve all'**autofill**, non al funzionamento. (Due agenti in disaccordo: il fatto 0/525 è vero,
  la catena causale verso il blocco no.)
- **"LABICO risulta `is_master=false` → il riconoscimento va allargato"** → **FALSO**: è solo uno
  snapshot vecchio. Lo scan **vero** oggi lo riconosce master con 17 colonne. Lo scan è
  **throttlato a 1/giorno** (`scanColonne.stamp`): girato alle 06:40, file riempito alle 12:42.
- **Blocco config `labico` copia-incolla** (la via "minima" suggerita in analisi) → scartata: al
  terzo comune si ripete. Sostituita da comune=nome-file.
- **`ZAGAROLO 1.xlsx` come comune** → era una riga fantasma: l'upsert di `agente_file_colonne`
  non cancellava mai i file spariti. Ora la scansione è la foto completa della cartella.

### Stato attuale
**Funziona**: tick verificato in produzione (heartbeat a 24s dal deploy → app nuova + agente nuovo
+ colonna nuova girano insieme). Repo dell'agente allineato (`git pull` fatto, HEAD `ad9119f`).

**`config.json` locale NON toccato** (ha ancora il blocco `zagarolo`, nessun `massive`): la
retro-compatibilità è stata verificata sul config **vero** —

| target | master risolto | foglio | col. stato |
|---|---|---|---|
| `dunning` | LIMITAZIONI CON ORDINE.xlsx | PIANIFICAZIONE | Stato Operazione |
| `ZAGAROLO` | ZAGAROLO.xlsx *(blocco legacy, ha la precedenza)* | Foglio1 | stato odl |
| `LABICO` | LABICO.xlsx *(derivato dal nome)* | Foglio1 | stato odl |
| `TUTTI` | **entrambi** | Foglio1 | stato odl |
| `PALESTRINA` | **0 master** → errore, nessuna scrittura | | |

### Code context
```js
// tools/limitazioni-sync/lib/acea/risolviMaster.mjs
// 'dunning'|'' → [{comune:'DUNNING', a: acea}]; '<COMUNE>' → <cartella>/<COMUNE>.xlsx;
// 'TUTTI' → tutti i master. Un blocco legacy per-comune col suo masterPath VINCE.
// Lista vuota = nessun master: il chiamante segnala, MAI degradare a "tutti".
risolviMaster({ acea, target, elencoFile }) -> [{ comune, a }]
elencoMasterMassive(cartella) -> string[]   // .xlsx della cartella, esclusi i ~$
// tools/limitazioni-sync/lib/comuni.mjs
comuneDaFile('C:\\...\\LABICO.xlsx') -> 'LABICO'   // basename senza estensione, UPPER
filtraFilePerComune(files, comune)                 // TUTTI/'' → nessun filtro
eseguiGiro({ ..., comune })                        // assente sul giro schedulato → tutti
```
`agente_config.forza_giro_comune text` (nullable) — one-shot; tick risponde `syncComune`.

### Warnings
- ⚠️ **App e agente vanno allineati insieme**: la UI ora manda il comune UPPERCASE
  (`'zagarolo'` → `'ZAGAROLO'`). Dopo un merge che tocca lim-sync: `git pull` in QUESTO repo.
- ⚠️ **`ultima_rivendicazione_giorno = 2026-07-15`**: il giorno è già rivendicato (giro delle
  10:54) → **stasera nessun giro schedulato**. Normale: a Labico si inizia domani, non ci
  sarebbe niente da scrivere. Domani 21:00 parte regolare su tutti i comuni.
- File `tools/limitazioni-sync/**` BLINDATI dall'hook `guard-acea.mjs`: modificarli solo su
  richiesta esplicita + conferma.
- L'agente gira da QUESTO repo a **tick singolo** via wrapper esterno: dopo un merge basta
  `git pull`, niente riavvii (eccetto il driver Playwright `assegnaInterventi.mjs`, in cache
  del wrapper → riavvio). `config.json` è riletto da disco a ogni tick.
- Il classifier può bloccare i push senza motivo: capitato una volta, ripetuto → passato.
  Non aggirare; ritentare o chiedere.
- ⚠️ **Il repo è PUBBLICO.** Non mettere identificativi ACEA di produzione (matricole, ODL,
  Impianto/PDR, indirizzi) nei corpi delle PR o nei messaggi di commit: fare la verifica sui dati
  veri va benissimo, pubblicarli no. Successo il 15/07 (corpo della PR #97, poi ripulito; il
  classifier ha fermato il secondo tentativo). Le fixture dei test contengono già valori reali per
  scelta preesistente del progetto: lasciate stare, ma non sono una scusa per aggiungerne altrove.
- ⚠️ **Verificare che un merge abbia preso TUTTI i commit del ramo**
  (`git merge-base --is-ancestor <ramo> origin/main`): la #97 è stata mergiata a metà e la cosa è
  emersa per puro caso, controllando prima di rimuovere il worktree.
- Suite: `npx vitest run` → 236 file / 1765 test verdi a fine sessione.

### Aperture / follow-up
1. **Strutturale contesa ZAGAROLO**: spostare i giri fuori orario ufficio o upload via
   Graph/SharePoint API (`Sites.Selected`, serve IT).
2. **18 conflitti esecutore residui** (giro 12:54): discrepanze REALI ufficio-vs-DB su chi ha
   eseguito — da rivedere in ufficio, non è un bug. +1 cosmetico "Eseguito" vs "eseguito"
   (`decidiScrittura` confronta case-sensitive, `cellaEsitoDaSovrascrivere` no).
3. **3 display_name in ordine inverso** in `staff` (NOME COGNOME anziché COGNOME NOME): per loro
   il "cognome" sui file è in realtà il nome. Fix = correggere l'anagrafica, non il codice.
4. `tools/limitazioni-sync/scanColonne.stamp` è un artefatto locale di runtime ma NON è
   gitignorato: resta untracked e rischia di finire in un `git add -A`.

## Next step
0. **Mergiare la PR #99** (`Impianto` → pdr): senza, l'import del punto 2 entra col PDR vuoto.
1. **Premere "Aggiorna tabella"** in `/hub/agente`: senza, Labico resta `is_master=false` a DB e
   **non compare nel menù comuni** (lo scan è quello delle 06:40). Un click → l'agente ri-scansiona,
   Labico appare e spariscono le 2 righe fantasma (`ZAGAROLO 1.xlsx`, `INTERVENTI_… (version 1)`).
2. **Importare `LABICO.xlsx`** da Estrazione misuratori → dataset **Limitazioni** → committente
   **Acea**: 525 censiti con ODL e PDR → il "+" lim_massive autofilla l'anagrafica.
3. Domani, dopo il primo giro reale su Labico: controllare in `/hub/agente` che `stato odl` di
   LABICO.xlsx si popoli (target `Tutti i comuni` o `Labico`).
4. Se ricompare un "esito non riportato": PRIMA controllare lo stato sync del file (quasi mai è
   il codice — vedi memoria `acea-zagarolo-sync-coauthoring`).
5. Follow-up performance restanti: ROADMAP.md → sezione Performance.
6. **Applicare al prod la seed `20260715150000_ibrido_acea_template.sql`** (FILONE 4): il template
   "Ibrido acea" non esiste ancora a DB. In alternativa, ricrearlo identico dall'editor Template
   rapportini (committente Acea, campi come da seed).
