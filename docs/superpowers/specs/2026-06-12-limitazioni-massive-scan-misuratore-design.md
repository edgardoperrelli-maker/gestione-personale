# Limitazioni massive — "Cerca matricola" (scan/digita) nel + intervento manuale

**Data:** 2026-06-12
**Stato:** Design in revisione

## Contesto
Gli operatori lavorano un **comune** facendo attività di **limitazione**. Le anagrafiche/toponimi
sono spesso errati, quindi tornano sullo stesso civico più volte: il legame per indirizzo è
inaffidabile, la **matricola** del misuratore è l'unico identificativo solido.

Oggi il "+" sul rapportino ([FabInterventoManuale](../../../components/modules/rapportini/FabInterventoManuale.tsx) →
[ModaleInterventoManuale](../../../components/modules/rapportini/ModaleInterventoManuale.tsx)) crea un
**intervento manuale** scegliendo committente (Italgas/Acea/Altro); la richiesta va in
`interventi_manuali` → **Lista Attesa**. Si aggiunge una **quarta opzione "Limitazioni massive"**
che, prima dell'anagrafica, fa **cercare la matricola** (scan QR/barcode *oppure* digitazione) su un
DB di misuratori "censiti", autocompilando i dati quando la trova.

Riusa il motore barcode/QR di Resine ([ScannerMisuratore](../../../components/modules/rapportini/risanamento/ScannerMisuratore.tsx),
nativo Android + zxing-WASM iOS) e il pattern lookup di
[lookup-misuratore](../../../app/api/r/[token]/lookup-misuratore/route.ts).

## Decisioni (confermate)
1. **Storage:** nuova tabella dedicata `limitazione_misuratori_ref` (Resine resta intatto → zero regressioni).
2. **Committente fisso:** "Limitazioni massive" cerca **solo** nella tabella limitazioni con
   `committente = 'acea'`. Nessun ramo Italgas, nessun sotto-tap nella modale.
3. **Non censito → inserimento manuale consentito** (niente blocco): tutto passa dal controllo ufficio in Lista Attesa.
4. **Differenza da Resine:** le limitazioni **passano** dalla Lista Attesa (Resine no), perché vanno controllati tutti i dati.
5. **Ricerca:** prima match **esatto** sulla matricola, poi **suggerimenti simili**. Funziona sia da scan sia da digitazione.
6. **Campi obbligatori:** definiti nel **template** `lim_massive` (l'utente li configura; l'autofill popola quelli che arrivano dal DB).

## 1. Modello dati — estrazione misuratori
Adatto il modulo **Estrazione misuratori**
([ImportMisuratoriClient](../../../app/impostazioni/risanamento-misuratori/ImportMisuratoriClient.tsx) +
[route import](../../../app/api/admin/risanamento/import-misuratori/route.ts)).

**Nuova tabella** (mirror di `risanamento_misuratori_ref` + `committente`):
```
limitazione_misuratori_ref (
  id bigserial PK,
  import_id uuid NOT NULL,
  committente text NOT NULL DEFAULT 'acea',   -- 'acea' | 'italgas' (per ora solo acea usato)
  indirizzo text NOT NULL DEFAULT '',
  civico    text NOT NULL DEFAULT '',
  comune    text NOT NULL DEFAULT '',
  cap       text NOT NULL DEFAULT '',
  pdr       text NOT NULL DEFAULT '',
  matricola text NOT NULL,
  nominativo text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
)
-- indici: (matricola), (import_id), (committente)
-- vista catalogo import: limitazione_import_catalog (analoga a risanamento_import_catalog)
```
La migration SQL la **lancia l'utente** su prod (il Supabase MCP non punta al prod).

**Import module (adattato):**
- Due selettori: **committente** (Italgas/Acea) e **attività** (Resine/Limitazioni).
- Il [parser](../../../lib/risanamento/parseImportMisuratori.ts) resta identico (stesse colonne:
  Matricola obbligatoria, PDR, Nominativo, Indirizzo, Civico, Comune, CAP) e si **riusa** tale e quale.
- La route import accetta `attivita` + `committente` e instrada l'insert nella tabella giusta
  (`risanamento_misuratori_ref` per Resine, `limitazione_misuratori_ref` per Limitazioni).
  Catalogo/lista/eliminazione filtrati per attività.
- Resine: comportamento **invariato** (committente ignorato dal suo lookup).

## 2. Endpoint di ricerca
Nuovo `GET /api/r/[token]/cerca-limitazione?q=<matricola>` (operatore, auth via token come lookup-misuratore):
- valida token (`tokenStatus` === valido);
- **match esatto** su `matricola` in `limitazione_misuratori_ref` WHERE `committente='acea'`
  → `{ trovato: true, ref_id, pdr, nominativo, indirizzo, civico, comune, cap }`;
- se nessun esatto → `{ trovato: false, suggerimenti: [...] }`: fino a **8** suggerimenti.
- **Similarità bidirezionale + suffix-aware** (il problema reale è un **prefisso variabile**, es. `99`):
  normalizzando entrambe (upper + via spazi/trattini/non-alfanumerici), un candidato è simile se
  `norm(cand).includes(norm(q))` **oppure** `norm(q).includes(norm(cand))` (contenimento simmetrico).
  Così `A023041` trova `99A023041` **e** viceversa. Per evitare rumore: containment solo se `q.length >= 4`.
- **Ordine di vicinanza:** esatto > stesso suffisso (`endsWith`) > prefisso (`startsWith`) > contenimento; a parità, minore differenza di lunghezza.
- **Nessun** vincolo sul civico (toponimi inaffidabili): ricerca su tutto il dataset committente=acea.
- Logica "matricole simili" in una **funzione pura** testabile (`lib/limitazione/matricoleSimili.ts`).
  Implementazione endpoint: pre-filtro SQL `ilike('matricola','%q%')` per il caso comune (candidato contiene q)
  **più** il caso inverso filtrato in memoria sul dataset acea (poche migliaia di righe per comune/import → ok);
  la `matricoleSimili` pura decide ordine e taglio a 8.

## 3. Modale — nuovo step "Cerca matricola"
Estendo [ModaleInterventoManuale](../../../components/modules/rapportini/ModaleInterventoManuale.tsx):
- Step 1 picker: aggiungo **"Limitazioni massive"** (valore committente `lim_massive`).
- Se `committente === 'lim_massive'`, prima dell'anagrafica si inserisce lo **step 0 "Cerca matricola"**:
  - campo testo matricola + bottone **"📷 Scansiona"** (riusa `ScannerMisuratore`);
  - da scan o digitazione → chiama `cerca-limitazione`;
  - **trovata** (esatta o suggerimento scelto) → autocompila l'anagrafica (matricola, pdr, nominativo,
    via←indirizzo, civico, comune, cap), salva `ref_id`, avanza allo step Anagrafica (campi precompilati ma **editabili**);
  - **non trovata** → messaggio "Misuratore non censito" + azione **"Inserisci a mano"** che porta
    all'anagrafica con la sola matricola digitata; gli altri campi a mano.
- Step successivi (Anagrafica → Esiti → Foto → Invia) **invariati**, guidati dai `campi`/`infoCampi` del template `lim_massive`.
- Mapping autofill censito → chiavi anagrafica in **funzione pura** testabile (`lib/limitazione/autofillAnagrafica.ts`).

## 4. Invio → Lista Attesa
Riuso la pipeline [`/api/r/[token]/intervento-manuale`](../../../app/api/r/[token]/intervento-manuale/route.ts):
- aggiungo `lim_massive` ai committenti validi (`COMMITTENTI`);
- `risolviTemplateCommittente` risolve il template con `committente='lim_massive'` (funziona già in modo generico);
- `ref_id`/committente reale del censito salvati dentro il JSON `dati` (nessuna colonna nuova su `interventi_manuali`);
- la riga finisce in `interventi_manuali` → **Lista Attesa** come categoria **"Limitazioni massive"**;
- idempotenza offline (`richiestaId`), corsia liberi/normale, foto: **invariati**.

## 5. Aggancio enum committente (modifiche puntuali)
Aggiungo `lim_massive` a `CommittenteManuale` e alle liste/etichette:
- [lib/interventi/manuali/types.ts](../../../lib/interventi/manuali/types.ts) — enum;
- ModaleInterventoManuale — bottone picker + step 0;
- [intervento-manuale/route.ts](../../../app/api/r/[token]/intervento-manuale/route.ts) — `COMMITTENTI`;
- [app/r/[token]/page.tsx](../../../app/r/[token]/page.tsx) (~riga 205) — mappa `templatesPerCommittente`;
- [app/hub/lista-attesa/page.tsx](../../../app/hub/lista-attesa/page.tsx) — `COMMITTENTI_MANUALI` + etichetta;
- componenti revisione/registro Lista Attesa — etichetta "Limitazioni massive" (helper label centralizzato).

## 6. Template
Un `rapportino_template` con `committente='lim_massive'`, `solo_manuale=true`, configurato dall'utente
nell'editor template esistente con i **campi obbligatori** (anagrafica/esiti/foto). L'architettura non
dipende dalla lista esatta: l'autofill popola i campi che arrivano dal DB, il resto si compila a mano.

## File toccati (stima)
- **DB:** migration `limitazione_misuratori_ref` + vista catalogo (lanciata dall'utente).
- **Nuovi:** `lib/limitazione/matricoleSimili.ts` (+test), `lib/limitazione/autofillAnagrafica.ts` (+test),
  `app/api/r/[token]/cerca-limitazione/route.ts`.
- **Modificati:** import route + `ImportMisuratoriClient.tsx` (selettori committente/attività),
  `ModaleInterventoManuale.tsx`, `types.ts`, `intervento-manuale/route.ts`, `app/r/[token]/page.tsx`,
  `app/hub/lista-attesa/page.tsx` + label revisione/registro.

## Testing
- **Pure fn:** `matricoleSimili` → unit (vitest). Casi obbligatori: match esatto; **prefisso variabile reale
  `q='A023041'` deve suggerire `'99A023041'`** e il caso inverso `q='99A023041'` → `'A023041'`; ordine
  (esatto > suffisso > prefisso > contenimento); soglia `q.length >= 4`; cap a 8. `autofillAnagrafica` (mapping campi) → unit.
- **Scanner/camera:** non testabile in locale → gate `tsc`/`eslint`/`build` + prova sul campo (deploy Vercel).
- Baseline lint/test già rossa su main: verifica **mirata** con `npx eslint`/`npx vitest run` sui soli file del WP.

## Fuori scope
- Limitazioni **Italgas** (per ora solo Acea; estendibile con un filtro/opzione).
- **Autofill offline** (la ricerca richiede rete; l'inserimento manuale funziona offline).
- Qualsiasi modifica al flusso **Resine** e alla pagina ufficio "Rapportini · Massiva".

## Aperti
- Lista **campi obbligatori** del template `lim_massive` (l'utente li configura nel template).
- Regola "suggerimenti simili" **definita** (contenimento simmetrico + suffix-aware, `q>=4`, max 8): vedi §2.
  Caso reale coperto: `A023041` ↔ `99A023041` (prefisso variabile).
