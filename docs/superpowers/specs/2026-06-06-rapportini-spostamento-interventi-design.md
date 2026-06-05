# Spostamento interventi tra operatori — propagazione sicura al Salva

**Data:** 2026-06-06
**Stato:** Design approvato (brainstorming) — in attesa di review spec prima del piano

## Problema

Quando si riapre una pianificazione e si spostano interventi da un operatore a un altro
(tipicamente: operatore assente per malattia → i suoi interventi vanno ridistribuiti), serve
che la variazione si rifletta nei rapportini (digitale `/r/[token]` + export Excel) **senza
perdere ciò che è già stato compilato** e **senza rompere o moltiplicare i link**.

## Comportamento attuale (cosa GIÀ funziona)

Importante per non riscrivere ciò che esiste: il flusso di Salva della pianificazione
([MappaOperatoriClient.tsx:1610-1726](../../../components/modules/mappa/MappaOperatoriClient.tsx)) già esegue, in sequenza:

1. `PUT/POST /api/mappa/piani` — salva piano, operatori e `tasks`.
2. `POST /api/mappa/piani/interventi` — `ensureInterventiForPiano` allinea la tabella `interventi`.
3. `POST /api/mappa/rapportini/genera` con il template **ereditato** dai rapportini esistenti
   (`rapTemplateId`, [MappaOperatoriClient.tsx:1742](../../../components/modules/mappa/MappaOperatoriClient.tsx)).

Effetto già oggi:
- Lo spostamento **si riflette** nel rapportino digitale e nell'Excel (entrambi leggono da `rapportino_voci`).
- I **link/token restano stabili** per gli operatori già presenti; un nuovo link nasce solo per un
  operatore nuovo ([genera/route.ts:109-124](../../../app/api/mappa/rapportini/genera/route.ts)).
- Le **risposte già compilate sono preservate** per gli interventi che restano all'operatore
  (`mergeVoci`, [buildVoci.ts:26-29](../../../utils/rapportini/buildVoci.ts)).

## Cosa manca (oggetto di questa feature)

Tre lacune rispetto ai requisiti:

1. **Nessun riepilogo prima di applicare.** Oggi la propagazione è silenziosa (solo alert generici).
   Serve una modale che mostri la variazione e la faccia **approvare**.
2. **Nessun blocco sul singolo intervento completato.** Oggi un intervento già chiuso può essere
   spostato e la sua compilazione viene persa senza avviso.
3. **Rapportini già inviati non gestiti.** Aggiungendo interventi a un operatore che ha già inviato,
   le voci nuove compaiono ma il modulo resta in sola lettura (`readOnly={stato === 'inviato'}`,
   [page.tsx:170](../../../app/r/[token]/page.tsx)): non compilabili, e nessun avviso.

## Requisiti (decisioni del brainstorming)

| # | Decisione |
|---|-----------|
| Trigger | Il **Salva** della pianificazione. Nessun pulsante nuovo. |
| Compilazioni | Mai perse. Gestire spostamento **totale** e **parziale**. |
| Blocco | Solo sul **singolo intervento con `stato = 'completato'`** (chiuso/Fatto). Non si riassegna. Gli altri interventi si spostano liberamente, anche se un loro vicino è chiuso. |
| Link | Stabili per chi c'è già; nuovo link **solo** per operatore nuovo; operatore che resta a 0 interventi → rapportino **vuoto, link conservato** (non eliminato). |
| Inviati | **Avviso + conferma**; su conferma il rapportino viene **riaperto** (stato `in_corso`, valorizza `riaperto_at`) e si applica. |
| Conferma | **Riepilogo sempre** prima di applicare. |
| Approccio | **Motore condiviso** estratto da `genera`, con **anteprima** (dry-run) e **applica**. |

## Architettura

Separazione netta tra calcolo puro e I/O, per testabilità e per evitare divergenze tra anteprima e applica.

### Moduli

- **`utils/rapportini/diffRapportini.ts`** — funzione **pura**, senza DB.
  `calcolaDiffRapportini(input) → DiffRapportini`. Confronta lo stato corrente dei rapportini/interventi
  con la distribuzione **proposta** e produce il riepilogo (spostamenti, nuovi link, svuotati, inviati
  coinvolti, interventi bloccanti). Stessa filosofia di `mergeVoci`: calcolo isolato e testabile.

- **`lib/interventi/sincronizzaRapportini.ts`** — la parte **I/O** estratta da `genera/route.ts`
  (loop operatori → `mergeVoci` → riuso/creazione link → template → gestione orfani). Aggiunge:
  rifiuto server-side se ci sono spostamenti di interventi completati; riapertura degli inviati su conferma.

- **`app/api/mappa/piani/anteprima-rapportini/route.ts`** — nuovo endpoint **POST** (non scrive).
  Riceve `{ pianoId, operatori }` proposti, esegue `calcolaDiffRapportini` sui dati reali e ritorna il `DiffRapportini`.

- **`app/api/mappa/rapportini/genera/route.ts`** — diventa un wrapper sottile su `sincronizzaRapportini`
  (modalità applica), con `templateId` esplicito. Comportamento attuale invariato → coperto da test di non-regressione.
  Estende il body con `confermaInviati?: boolean`.

### Flusso del Salva (orchestrazione UI)

```
1. Sposti i task nella mappa → premi "Salva"
2. → POST /api/mappa/piani/anteprima-rapportini  (NON scrive)  → DiffRapportini
3. ┌ ci sono interventi BLOCCATI (completati spostati) → STOP:
   │   messaggio con elenco, niente salvataggio; rimetti gli interventi a posto e ri-salva.
   ├ nessuna modifica ai rapportini → salva e basta (flusso attuale, nessuna modale)
   └ ci sono modifiche → MODALE riepilogo:
        - spostamenti, nuovi link, svuotati
        - se inviati coinvolti → avviso + checkbox "riapri e applica"
4. confermi → flusso attuale: PUT piani → interventi → genera { confermaInviati }
5. → resoconto finale (toast)
```

Il punto chiave dell'ordine: l'anteprima gira **prima** del salvataggio, sui task **proposti** dal browser
confrontati con lo stato **reale** dei rapportini/interventi nel DB. Se annulli o sei bloccato, **niente è stato scritto**.

### Template ed eredità

Il Salva non chiede un template: viene **ereditato** dai rapportini esistenti del piano (per i nuovi
operatori, lo stesso degli altri). Se il piano non ha ancora rapportini, il riepilogo elenca semplicemente
i link da creare (prima generazione); il template resta quello attivo come oggi (`rapTemplateId` di default).

## Struttura dati del diff

```ts
type DiffRapportini = {
  nessunaModifica: boolean;
  spostamenti: Array<{ identita: string; descr: string; daStaffId: string; daNome: string; aStaffId: string; aNome: string }>;
  nuoviLink:    Array<{ staffId: string; staffName: string }>;        // operatori che avranno un nuovo rapportino
  svuotati:     Array<{ staffId: string; staffName: string }>;        // restano a 0 voci, link conservato
  inviatiCoinvolti: Array<{ staffId: string; staffName: string; rapportinoId: string }>;
  bloccati:     Array<{ identita: string; descr: string; staffName: string; motivo: 'completato' }>;
};
```

- **identità** dell'intervento: ODL se presente, altrimenti identità composta indirizzo+matricola(+attività),
  riusando `identitaIntervento` ([planInterventiForPiano.ts:39](../../../lib/interventi/planInterventiForPiano.ts)).
- **stato prima**: operatore corrente dei `rapportino_voci` esistenti; **stato dopo**: operatore nei `tasks` proposti.
- **completato**: `interventi.stato === 'completato'` (coerente con `TERMINALI`,
  [InterventiAssegnabili.tsx:15](../../../components/modules/interventi/InterventiAssegnabili.tsx)). L'endpoint anteprima e
  `genera` caricano anche `stato` dalla tabella `interventi`.

## Dettaglio dei tre miglioramenti

### 1. Riepilogo (anteprima)
Modale prima di applicare, raggruppata per operatore. Mostra spostamenti ("Mario → Luigi: 3 interventi"
con ODL/indirizzo sintetici), nuovi link evidenziati, operatori svuotati. Se `nessunaModifica`, il Salva
procede senza modale.

### 2. Blocco intervento completato
Se `bloccati.length > 0`, il Salva **non procede**: messaggio chiaro con l'elenco ("Questi interventi sono
già completati e non possono essere riassegnati: …") e invito a riportarli all'operatore originale. Doppia
sicurezza: anche `genera`/`sincronizzaRapportini` rifiuta lato server uno spostamento di intervento completato.

### 3. Gestione inviati
Gli `inviatiCoinvolti` (rapportini in stato `inviato` toccati dallo spostamento, origine o destinazione)
sono mostrati nell'avviso. Solo se l'utente conferma (`confermaInviati: true`), all'applica i rapportini
interessati passano a `in_corso` valorizzando `riaperto_at`, poi si applica la variazione. Senza conferma,
quegli operatori non vengono toccati (gli altri spostamenti procedono).

## Casi limite

- **Spostamento parziale**: A tiene gli interventi fatti/compilati (preservati da `mergeVoci`) e cede i
  restanti; B li riceve con badge "NUOVO".
- **Spostamento totale**: A resta a 0 → rapportino svuotato, link conservato. NON è "orfano": resta nella
  lista operatori. (L'eliminazione del link resta l'azione esplicita di `DELETE /api/mappa/piani/operatore`.)
- **Operatore nuovo non in piano** → nuovo rapportino + nuovo link, template ereditato.
- **Conflitti cross-piano** (stesso operatore con rapportino in un altro piano, stessa data) → resta attiva
  la protezione `rilevaConflitti` già presente in `genera`.
- **Intervento completato spostato** → bloccato (vedi §2).
- **Destinazione già inviata** → avviso + riapertura su conferma (vedi §3).

## Error handling e limiti noti

- La propagazione scrive rapportino per rapportino, **non** in un'unica transazione atomica (come già oggi
  `genera`). In caso di errore a metà, l'applica si ferma e il resoconto indica cosa è stato fatto; nessuna
  perdita di compilazioni perché il merge è preservante. L'atomicità piena (RPC SQL) è una possibile
  estensione futura, **fuori scope**.
- Nessuna modifica allo schema DB: `interventi.stato`, `rapportini.stato`/`riaperto_at` esistono già.
- **Finestra anteprima→applica**: tra il calcolo del riepilogo e l'applica, un'altra sessione potrebbe
  cambiare lo stato (es. un intervento passa a `completato`). Mitigazione: il rifiuto del blocco è ricontrollato
  **lato server** all'applica, quindi un completato non può comunque essere spostato anche se il diff era stato
  calcolato prima. Il riepilogo mostrato può risultare leggermente disallineato in quel caso raro; non causa perdita dati.

## Strategia di test (TDD)

- **Unit** su `calcolaDiffRapportini` (pura): spostamento totale, parziale, operatore nuovo, svuotato,
  inviato coinvolto, intervento completato (bloccante), nessuna-modifica.
- **Motore** `sincronizzaRapportini`: link stabile (stesso token), risposte preservate, nuovo link creato,
  riapertura inviato su conferma, rifiuto spostamento completato.
- **Non-regressione** su `genera` dopo l'estrazione: stesso comportamento di prima (conflitti cross-piano,
  orfani, merge).

## File coinvolti

| File | Modifica |
|------|----------|
| `utils/rapportini/diffRapportini.ts` | **nuovo** — calcolo puro del diff |
| `lib/interventi/sincronizzaRapportini.ts` | **nuovo** — motore I/O estratto da `genera` |
| `app/api/mappa/piani/anteprima-rapportini/route.ts` | **nuovo** — endpoint dry-run |
| `app/api/mappa/rapportini/genera/route.ts` | refactor a wrapper + `confermaInviati` |
| `components/modules/mappa/MappaOperatoriClient.tsx` | flusso Salva: anteprima → modale → applica; gestione blocco/inviati |

## Fuori scope

- Trasferimento della compilazione tra rapportini con template diversi.
- Atomicità transazionale piena della propagazione.
- Modifiche al modulo digitale `/r/[token]` oltre la riapertura inviati.
- Blocco del drag&drop a monte nella mappa (il controllo è al Salva via anteprima).
