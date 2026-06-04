# Design — Redesign mobile rapportino digitale (`/r/[token]`)

- **Data:** 2026-06-04
- **Stato:** approvato dall'utente (in attesa di revisione finale della spec)
- **Autore:** Edgardo Perrelli (con Claude)
- **Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind 4 · Vitest
- **Collegato a:** [Rapportini interattivi](2026-05-31-rapportini-interattivi-design.md) · [Template info dinamici](2026-06-03-rapportini-template-info-dinamici-design.md)
- **Mockup di riferimento:** [`docs/superpowers/mockups/rapportino-redesign.html`](../mockups/rapportino-redesign.html)

---

## 1. Contesto e obiettivo

La pagina pubblica `/r/[token]` (compilata dagli operatori **da smartphone**) oggi mostra ogni
intervento come una **card molto alta**: ~11 campi anagrafici in sola lettura + tutti i campi
compilabili impilati a tutta larghezza. Con i volumi reali (**10-30 interventi al giorno**) la
pagina diventa uno **scroll infinito**, faticoso da usare in campo.

**Obiettivo:** ridurre drasticamente l'ingombro verticale, dare un **colpo d'occhio**
sull'avanzamento della giornata e rendere la compilazione veloce e ordinata, mantenendo
l'allineamento al design **Aurea** già in uso e la piena **adattabilità ai vari smartphone**.

Il lavoro è un **redesign esclusivamente frontend**: nessuna modifica a DB, API,
generazione rapportini o lato admin.

## 2. Scope

**In scope:**
- Refactor della UI della rotta pubblica: [`app/r/[token]/page.tsx`](../../../app/r/[token]/page.tsx) e [`components/modules/rapportini/RapportinoForm.tsx`](../../../components/modules/rapportini/RapportinoForm.tsx).
- Nuova architettura a **due viste**: **Lista** (colpo d'occhio + scelta) e **Focus** (un intervento a tutto schermo).
- **Header fisso** nella Lista con **riepilogo** (esiti positivi/negativi + totali lavorazioni) — in scroll si muove solo l'elenco.
- **Menu a tendina "Dettagli anagrafici"** che nasconde i campi secondari nel Focus.
- Estrazione di **helper puri** (riepilogo, stato voce, partizione campi info) con test Vitest.
- Verifica responsive 320-430px.

**Fuori scope (non-goals):**
- Modifiche a schema DB, migrazioni, rotte API (`/voce`, `/invia`), generazione dei rapportini, lato admin, export Excel/Allegato 10.
- Nuovi campi compilabili o anagrafici (si usano `campi_snapshot` e `info_snapshot` esistenti).
- Logica di autosave/retry/backoff e regole colore esito: **riusate**, non riscritte.
- Login/account operatori (resta accesso solo via token).

## 3. Decisioni di design (confermate con l'utente)

| Tema | Decisione |
|---|---|
| Volume tipico | 10-30 interventi → compressione decisa necessaria |
| Navigazione | **Ibrido**: Lista compatta + apertura in Focus a tutto schermo |
| Info sempre a vista | **Nominativo**, **Indirizzo** (via + comune), **Fascia oraria** |
| Campi nel menu a tendina | Tutti gli altri info configurati (matricola, PDR, ODSIN, CAP, recapito, attività, accessibilità…) |
| Scroll | **Header fisso**: si muove solo la lista; info principali sempre in cima |
| Riepilogo | Accanto a nome/data: **eseguiti** positivi e negativi + totali **lavorazioni** (cambio, mini bag, RG stop, RC stop…) |
| Stile | Allineato ad **Aurea** (variabili di `globals.css`: navy, glow ciano/magenta, Geist, chip success/danger) |
| Scrollbar | A tema Aurea (**non grigia**) nei contenitori scrollabili |
| Invio | **Esito obbligatorio**: niente invio finché ogni voce non ha esito positivo/negativo |

## 4. Architettura UI

Stesso entry-point (`page.tsx`, Server Component invariato: carica per token, valida
scadenza/stato, passa `voci`, `campiSnapshot`, `infoCampi`, `readOnly` al form). Il form
client passa da "lista di card" a un **router a due viste** in stato locale.

```
RapportinoForm (orchestratore client)
├─ stato: vista ('lista' | 'focus'), indiceCorrente, filtro, voci, saveStates, inviato/bloccato
├─ autosave/debounce/backoff  ........ RIUSATO invariato
├─ <RapportinoLista>   → vista 'lista'
│   ├─ <IntestazioneRiepilogo>  (header FISSO: nome, data, riepilogo, avanzamento)
│   ├─ <FiltroStato>            (segmentato Tutti · Da fare · Completati)
│   └─ lista scrollabile di <RigaVoce>  (num, nome, via·comune·fascia, chip stato)
└─ <VoceFocus>        → vista 'focus'
    ├─ barra (‹ Tutti gli interventi · "n / N")
    ├─ sommario (nominativo, indirizzo, fascia) + <SaveBadge>
    ├─ <DettagliAnagrafici>  (<details> chiuso di default)
    ├─ campi compilabili → <CampoInput> (crocetta/select/numero/testo)  ESISTENTE, estratto
    └─ barra azione (‹ indietro · "Salva e avanti ›")
```

**Principio:** componenti piccoli a responsabilità singola. `RapportinoForm` tiene lo stato e
gli effetti (autosave, invio); `RapportinoLista` e `VoceFocus` sono **presentazionali** e
ricevono dati + callback. `CampoInput` (oggi inline) viene **estratto** in un file proprio.

## 5. Vista LISTA

**Header fisso** (`flex` colonna su `100dvh`; solo l'elenco ha `overflow-y:auto`):
- Occhiello "Rapportino", **nome operatore** (bold) + **data** (allineata a destra).
- **Riepilogo** (vedi §7): pill **eseguiti** (verde), **non eseguiti** (magenta), **da fare** (neutro); sotto, chip per **ogni lavorazione** con conteggio (es. `Cambio 2 · Mini bag 1 · RG stop 1`).
- **Barra di avanzamento** sottile (completati / totali).
- **Filtro segmentato**: Tutti · Da fare · Completati — dove **Completati** = voci con esito (eseguiti + non eseguiti) e **Da fare** = voci neutre (nessun esito).

**Elenco** (scrollabile, l'unica parte che si muove):
- Ogni voce = **riga compatta** (~64px): badge numero, **nominativo** (troncato), riga `via · comune · fascia`, **chip di stato** colorato e bordo sinistro colorato; chevron.
- Tap sulla riga → apre il **Focus** su quell'intervento.

**Barra azione fissa in fondo:** "**Invia rapportino**" + conteggio mancanti. Il pulsante è
**disabilitato finché ogni voce non ha un esito** (positivo o negativo): l'hint del conteggio,
se toccato, applica il filtro "Da fare" per trovare subito le voci mancanti. Disabilitato anche
in sola lettura; in stato inviato mostra conferma.

## 6. Vista FOCUS

- Barra superiore: "**‹ Tutti gli interventi**" + posizione "**n / N**".
- **Sommario sempre a vista**: nominativo (titolo), indirizzo (via, comune) con icona, fascia oraria con icona; **SaveBadge** ("salvataggio…/salvato ✓/non salvato").
- **`<details>` "Dettagli anagrafici"** (chiuso di default): griglia 2 colonne con i campi info secondari (tutti i configurati tranne i primari). Chevron che ruota all'apertura.
- **Campi compilabili** resi dal `campi_snapshot` via `CampoInput`:
  - `select` (es. ESEGUITO) — bordo verde/rosso secondo l'esito;
  - `crocetta` → **griglia 2 colonne** di toggle (non più impilati a tutta larghezza);
  - `numero`, `testo` come oggi.
- Bordo card verde/rosso/neutro secondo l'esito (riuso `voceEsitoColore`).
- **Barra azione fissa:** "**‹**" (indietro) + "**Salva e avanti ›**" (sull'ultima voce: "Salva e torna alla lista"). "Avanti" **flusha** l'eventuale autosave in sospeso e passa alla voce successiva.

## 7. Riepilogo — logica di calcolo (helper puro)

Tutto derivabile **lato client** dai dati già caricati. Nuovo helper puro testabile:

```ts
// utils/rapportini/riepilogo.ts
type StatoVoce = 'eseguito' | 'non_eseguito' | 'da_fare';

function statoVoce(risposte, campi): StatoVoce
// mappa voceEsitoColore: verde→eseguito, rossa→non_eseguito, neutro→da_fare

interface RiepilogoRapportino {
  eseguiti: number;        // voci verdi
  nonEseguiti: number;     // voci rosse
  daFare: number;          // voci neutre
  totali: number;
  lavorazioni: { chiave: string; etichetta: string; count: number }[];
  // una entry per ogni campo tipo 'crocetta' del template con count = n. voci con valore true
}

function riepilogoRapportino(voci, campi): RiepilogoRapportino
```

- **Esiti**: si riusa `voceEsitoColore` (già esistente) come unica fonte di verità per chip,
  bordo, filtro e riepilogo → coerenza garantita.
- **Lavorazioni**: si conta, per ogni campo `tipo === 'crocetta'` del `campi_snapshot`,
  quante voci hanno `risposte[chiave] === true`. Le chiavi/etichette sono **configurabili da
  template**: il riepilogo si adatta da solo. Vengono mostrate solo le crocette con `count > 0`.
- Aggiornamento **live**: il riepilogo è calcolato dallo stato `voci`, quindi si aggiorna a
  ogni autosave senza logica aggiuntiva.
- **Gate d'invio**: il rapportino è inviabile **solo** se `daFare === 0` (esito obbligatorio per tutte le voci).

## 8. Partizione campi anagrafici (helper puro)

```ts
// utils/rapportini/infoCampi.ts (estensione)
const INFO_PRIMARI = ['nominativo', 'via', 'comune', 'fascia_oraria'] as const;
function partitionInfoCampi(infoCampi): { primari: TemplateInfoCampo[]; dettaglio: TemplateInfoCampo[] }
```

- **primari** → compongono titolo (nominativo) + riga indirizzo (via, comune) + riga fascia.
- **dettaglio** → tutti gli altri campi configurati, mostrati nel `<details>`.
- Rispetta la **configurazione admin**: se un campo primario non è nello snapshot, semplicemente
  non compare; l'ordine dei dettagli segue `ordine`. Fallback titolo invariato: nominativo → pdr → "Voce N".

## 9. Comportamento e stati

| Aspetto | Comportamento |
|---|---|
| Autosave | Invariato: debounce per voce, retry/backoff, `SaveBadge`. "Salva e avanti" flusha il debounce pendente |
| Colori esito | `voceEsitoColore` riusato (verde/rossa/neutro) per chip, bordo, riepilogo, filtro |
| Invia | Dalla barra della Lista; **bloccato finché ogni voce non ha un esito** (positivo/negativo). Niente più invio parziale |
| Bloccato (409) | Banner "non più modificabile" (come oggi); disabilita la compilazione |
| Sola lettura (inviato/scaduto) | Lista e Focus in sola lettura; nessuna azione di salvataggio; messaggio "Inviato ✓" |
| Non trovato / scaduto | Gestiti da `page.tsx` (CenteredCard) — invariati |
| Stesso link su 2 device | Last-write-wins per voce (invariato) |
| Deep-link | Apertura predefinita sulla **Lista**; il Focus è stato locale (no routing per voce in questa fase) |

> **Nota — esito obbligatorio (modifica rispetto al passato):** il [design rapportini
> interattivi](2026-05-31-rapportini-interattivi-design.md) consentiva l'invio parziale con
> conferma. **Da ora** il rapportino è inviabile **solo** quando *tutte* le voci hanno un esito.
> "Ha esito" = `statoVoce(voce) !== 'da_fare'` (cioè `voceEsitoColore !== 'neutro'`). Il gate
> d'invio usa `riepilogoRapportino(...).daFare === 0`.

## 10. Responsive

- Mobile-first, contenitore `max-width: 480px` centrato; layout `100dvh` con header/azioni
  fissi e area centrale scrollabile.
- Griglie a 2 colonne (dettagli, crocette) che reggono da **320px**; verifica a 320 / 375 / 390 / 430px.
- Tap target ≥ 46px (già imposti in `globals.css` per `max-width:768px`); `viewport-fit=cover`
  + `env(safe-area-inset-bottom)` per la barra azioni su iPhone con notch.
- **Scrollbar a tema** (non grigia) sui contenitori scrollabili: thumb **ciano Aurea**
  (`--brand-primary` ~55% alpha) su track trasparente → hover/active `--brand-primary` pieno,
  sia con `scrollbar-width/-color` (Firefox) sia con `::-webkit-scrollbar`/`-thumb`
  (Chromium/WebKit iOS). Override mirato sul `/r` rispetto alla scrollbar globale (più tenue)
  di `globals.css`, per renderla chiaramente visibile su mobile.

## 11. Riuso e refactor

- **Estrarre** `CampoInput` da `RapportinoForm.tsx` in `components/modules/rapportini/CampoInput.tsx`.
- **Nuovi componenti**: `RapportinoLista.tsx`, `VoceFocus.tsx`, `IntestazioneRiepilogo.tsx` (o sezione interna alla Lista).
- `RapportinoForm.tsx` resta l'orchestratore (stato + autosave + invio + switch vista) ma più snello.
- **Nessun** cambiamento alle firme delle API o ai tipi dei dati in ingresso al form.

## 12. Testing (Vitest, funzioni pure)

- `statoVoce(risposte, campi)` → eseguito/non_eseguito/da_fare (casi: crocetta positiva, select negativa, assente, vuoto).
- `riepilogoRapportino(voci, campi)` → conteggi esiti + lavorazioni (casi: mix di stati; più crocette; crocette a 0 escluse; template senza crocette).
- `partitionInfoCampi(infoCampi)` → primari/dettaglio corretti (casi: tutti gli 11; alcuni primari assenti; ordine dettagli per `ordine`).
- **Gate d'invio** (`riepilogoRapportino(...).daFare === 0`): inviabile se tutte le voci hanno esito; non inviabile con ≥1 voce neutra (casi: tutte con esito; una sola da fare; rapportino vuoto).
- **Verifica manuale** (mobile): apertura link, scroll (solo lista si muove), apertura Focus, menu a tendina, compilazione + autosave, riepilogo che si aggiorna, Invia.

## 13. File coinvolti (riferimenti per il piano)

| Area | File |
|---|---|
| Helper riepilogo (nuovo) | `utils/rapportini/riepilogo.ts` (+ test) |
| Helper partizione info | `utils/rapportini/infoCampi.ts` (estensione `partitionInfoCampi` + test) |
| Form orchestratore | `components/modules/rapportini/RapportinoForm.tsx` (refactor) |
| Viste/sotto-componenti (nuovi) | `RapportinoLista.tsx`, `VoceFocus.tsx`, `IntestazioneRiepilogo.tsx`, `CampoInput.tsx` |
| Rotta pubblica | `app/r/[token]/page.tsx` (props invariate; eventuale Shell semplificata) |
| Mockup di riferimento | `docs/superpowers/mockups/rapportino-redesign.html` |

## 14. Passi futuri (fuori scope)

- Routing per-voce (deep-link al singolo intervento) e ripristino posizione.
- Ordinamento/raggruppamento interventi (per comune, per fascia) nella Lista.
- Filtri aggiuntivi (per lavorazione) e ricerca testuale per liste molto lunghe.
