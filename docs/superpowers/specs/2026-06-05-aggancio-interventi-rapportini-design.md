# Aggancio interventi aggiuntivi al gruppo rapportini (mappa) — Design

**Data:** 2026-06-05
**Branch proposto:** `feat/aggancio-interventi-rapportini` (da `main`)
**Stato:** approvato in brainstorming, in attesa di review spec

---

## 1. Obiettivo

Completare il flusso **"Riapri piano dal Riepilogo rapportini → aggiungi interventi con `+ Aggiungi attività da template` / `+ Aggiungi manuale` → Salva distribuzione"** in modo che:

1. I nuovi interventi si **aggancino agli stessi rapportini** del gruppo riaperto (link digitale `/r/[token]` + export Excel), **senza generare nuovi link**.
2. Le **assegnazioni già fatte** del piano riaperto **restino stabili** (non si rimescolano).
3. La modale di aggiunta manuale mostri come esecutore **solo gli operatori del gruppo riaperto**, non tutti quelli del DB.
4. Lasciando l'esecutore **vuoto**, l'intervento resti **non assegnato** e si possa assegnare **a mano dalla mappa**.
5. Al **Salva distribuzione**, i rapportini (digitale + Excel) si **aggiornino automaticamente** mantenendo lo stesso link.

Ambito: modulo mappa (`components/modules/mappa/`) + endpoint rapportini. Nessuna nuova dipendenza (regola #3 di `AGENTS.md`). Nessuna modifica alla logica di business non strettamente necessaria (§1 `AGENTS.md`).

## 2. Decisioni di prodotto (confermate)

- **Salva → rapportini: "Auto, sempre".** Ogni `Salva distribuzione` (per piani con `pianoId`) genera/aggiorna i rapportini usando il template selezionato. La generazione manuale resta disponibile come azione opzionale (es. cambio template).
- **Rapportini già inviati: "Aggiorna, tieni risposte".** Aggiungendo un intervento e salvando, anche i rapportini con stato `inviato` ricevono la nuova voce, **preservando le risposte già compilate** e mantenendo **token e stato**. Questo comportamento è **già implementato** in `app/api/mappa/rapportini/genera/route.ts` (merge risposte per `task_id`, update senza cambio stato/token) → nessuna modifica backend necessaria per questo punto.

## 3. Causa radice (stato attuale)

Al "Riapri" piano, gli effetti in `MappaOperatoriClient.tsx` ([:738](../../../components/modules/mappa/MappaOperatoriClient.tsx) e [:837](../../../components/modules/mappa/MappaOperatoriClient.tsx)) ricostruiscono `excelTasks`, `selectedOps`, `distribution` e impostano `savedDistribution = true`, **ma NON ricostruiscono `esecutorePins`**.

Da qui i 4 difetti:

| # | Difetto | Punto nel codice |
|---|---|---|
| G1 | `addManualTask` e `handleTemplateFileChange` chiamano `distributeToOps()` (ridistribuzione completa per quantità). Con `esecutorePins` vuoto al reopen, i task già assegnati vengono **rimescolati** tra operatori → si rompe il legame task↔operatore↔rapportino. **È il "non si agganciano".** | [`addManualTask`:1942](../../../components/modules/mappa/MappaOperatoriClient.tsx), [`handleTemplateFileChange`:1467](../../../components/modules/mappa/MappaOperatoriClient.tsx) |
| G2 | La modale riceve **tutti** gli operatori del DB. | render modale [:3296](../../../components/modules/mappa/MappaOperatoriClient.tsx) passa `operatorOptions` |
| G3 | Esecutore vuoto non resta "non assegnato": viene auto-distribuito. | conseguenza di G1 |
| G4 | `saveDistribution` salva piano + interventi ma **non** rigenera le voci dei rapportini: serve un secondo click manuale. | [`saveDistribution`:1567](../../../components/modules/mappa/MappaOperatoriClient.tsx) |

Confermato che l'export Excel ([`export/route.ts`:38](../../../app/api/mappa/rapportini/export/route.ts)) e il link digitale leggono entrambi da `rapportino_voci` per lo stesso `rapportinoId`/token → **rigenerare le voci aggiorna entrambi senza nuovo link**.

## 4. Architettura del fix

### 4.1 Funzione pura riutilizzabile (testabile)

Nuovo file **`utils/mappa/appendTask.ts`** — niente React, niente Leaflet, unit-testabile (sulla scia di `app/api/mappa/piani/rulePayload.test.ts`).

```ts
// Aggiunge un task alla entry di un operatore preservando tutte le altre,
// ricalcolando la rotta del solo operatore tramite la routine passata.
appendTaskToOperator(
  distribution: DistEntry[],
  toIdx: number,
  task: Task,
  optimize: (tasks: Task[], base?: OperatorBase) => RouteResult
): DistEntry[]
```

Riusata sia da `addManualTask` sia da `assignUnassignedTask` (che oggi duplica questa logica a [:1975](../../../components/modules/mappa/MappaOperatoriClient.tsx)). Mantiene `optimizeRouteByFascia` come dipendenza iniettata (resta nel client).

### 4.2 `addManualTask` (G1, G3) — `MappaOperatoriClient.tsx:1909`

- Rimuovere la `distributeToOps()` finale.
- Costruire il task come ora (geocodifica inclusa) e aggiungerlo a `excelTasks`.
- **Se è scelto un operatore del gruppo**: trovarne l'indice in `distribution`; se `distribution` esiste, `setDistribution(appendTaskToOperator(distribution, idx, task, optimizeRouteByFascia))`. (Aggiungere l'operatore a `selectedOps` solo se manca — caso limite, non in flusso reopen.)
- **Se esecutore vuoto** (o `distribution` assente): `setUnassignedTasks(prev => [...prev, task])`. Il task compare in "Non assegnate" ([:2908](../../../components/modules/mappa/MappaOperatoriClient.tsx)) e sulla mappa, assegnabile con `assignUnassignedTask`.

### 4.3 `handleTemplateFileChange` (G1) — `MappaOperatoriClient.tsx:1412`

- Il file template non ha colonna esecutore → i task generati vanno in `unassignedTasks` invece di `distributeToOps()`. Restano assegnabili a mano dalla mappa, senza scombinare il piano.

### 4.4 Modale: solo operatori del gruppo (G2) — render `MappaOperatoriClient.tsx:3294`

```tsx
operators={
  (distribution && selectedOps.length > 0)
    ? selectedOps.map((o) => ({ id: o.id, displayName: o.name }))
    : availableOperators.map((o) => ({ id: o.id, displayName: o.displayName }))
}
```

In pianificazione da zero (nessun gruppo ancora) resta la lista completa.

### 4.5 Salva → rapportini automatici (G4) — `saveDistribution:1567`

Dopo il salvataggio del piano (POST/PUT) e degli interventi, **se `pid` esiste e `rapTemplateId` è valorizzato**:

```ts
await fetch('/api/mappa/rapportini/genera', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pianoId: pid, templateId: rapTemplateId }),
});
await caricaRapportini(pid);
```

- `genera` riusa i token esistenti per coppia (piano, operatore) → **stesso link**; per i nuovi operatori (non in questo flusso) creerebbe un token, ma la modale ristretta al gruppo lo impedisce.
- Se `rapTemplateId` è vuoto (nessun template attivo): saltare la generazione e mostrare l'avviso esistente (`rapError`), **senza bloccare** il salvataggio del piano.

**Preservare il template già usato dal gruppo:** al reopen `rapTemplateId` deve riflettere il template dei rapportini esistenti, non forzare il default.
- `app/api/mappa/rapportini/route.ts` (GET per `pianoId`): aggiungere `template_id` ai campi restituiti.
- `RapportinoStato` (tipo in `MappaOperatoriClient.tsx`): aggiungere `template_id?: string`.
- In `caricaRapportini`/effetto di reopen: se i rapportini esistono, impostare `rapTemplateId` dal loro `template_id` (fallback: default già caricato).

**UI:** mostrare il selettore template accanto a `Salva distribuzione` quando esiste `distribution` (oggi appare solo dopo `savedDistribution`), così la scelta del modello è disponibile prima del salvataggio auto. Il pulsante "Rigenera rapportini" resta come azione manuale.

## 5. Casi limite e sicurezza

- **Task non assegnati al salvataggio**: se `unassignedTasks.length > 0`, chiedere conferma ("N interventi non assegnati resteranno fuori dal piano finché non li assegni a un operatore"). Il modello `mappa_piani_operatori` salva i task per-operatore: gli unassigned non hanno destinazione.
- **Nessun template disponibile**: niente generazione automatica + avviso, salvataggio piano comunque ok.
- **Operatore già `inviato`**: aggiornato preservando risposte/stato/token (comportamento `genera` esistente). Lo stato *calcolato* mostrato nel riepilogo può cambiare se la nuova voce è da compilare — atteso (c'è lavoro nuovo).
- **Nessun link nuovo garantito**: modale ristretta al gruppo ⇒ nessun operatore nuovo ⇒ nessun token nuovo; `genera` riusa i token; Excel e `/r/[token]` leggono le stesse voci.

## 6. File toccati (riepilogo)

```
Nuovi:
  utils/mappa/appendTask.ts                 (+ appendTask.test.ts)
Modificati:
  components/modules/mappa/MappaOperatoriClient.tsx
    - addManualTask (no redistribuzione cieca; append o unassigned)
    - handleTemplateFileChange (template → unassigned)
    - render ManualTaskModal (operatori = gruppo)
    - saveDistribution (auto-genera rapportini, preserva token/template)
    - RapportinoStato (+ template_id), reopen imposta rapTemplateId
    - UI: selettore template visibile con distribution + conferma unassigned
  app/api/mappa/rapportini/route.ts         (GET: + template_id nei campi)
```

Nessuna modifica a `app/api/mappa/rapportini/genera/route.ts`, `export/route.ts`, `app/api/mappa/piani/route.ts` (già corretti per lo scopo).

## 7. Test

**Automatici (vitest):**
- `utils/mappa/appendTask.test.ts`:
  - append a un operatore preserva gli altri (task e km invariati per gli operatori non coinvolti);
  - il task finisce nell'operatore giusto; la rotta del solo operatore target viene ricalcolata;
  - indice fuori range → ritorna la distribuzione invariata (difensivo).

**Verifiche locali pre-push:** `npm run build` / typecheck; `npx eslint` **sui soli file toccati** (baseline lint già rossa — vedi memoria progetto).

**Manuali (anteprima Vercel) — flusso end-to-end:**
1. Riepilogo → "Riapri" un gruppo esistente con rapportini già generati.
2. `+ Aggiungi manuale` con esecutore = un operatore del gruppo → la modale mostra **solo** gli operatori del gruppo → l'intervento entra **solo** in quell'operatore, gli altri restano intatti.
3. `+ Aggiungi manuale` con esecutore **vuoto** → l'intervento appare in "Non assegnate" → assegnabile dalla mappa.
4. `Salva distribuzione` → stesso link del rapportino (token invariato), Excel scaricato aggiornato con la nuova voce, risposte preesistenti intatte.
5. `+ Aggiungi attività da template` (file) → i task entrano come "Non assegnate" e si assegnano a mano.

## 8. Fuori scope

- Pulsante principale "Distribuisci" / ridistribuzione completa per piani nuovi: invariato.
- Colonna esecutore nel file template Excel: i template restano ad assegnazione manuale dalla mappa.
- Ricostruzione di `esecutorePins` al reopen: non necessaria con l'approccio "append" (la sidesteppa).

## 9. Rollout sicuro

1. Sviluppo sul branch `feat/aggancio-interventi-rapportini` (da `main`).
2. Verifiche locali (build/lint/test).
3. `git push` → Vercel crea URL di anteprima HTTPS.
4. Test sul flusso reale dall'anteprima.
5. Solo dopo OK utente: merge ff in `main` → deploy → elimina branch.

## 10. Addendum (richiesta in corso d'opera): badge "NUOVO"

Gli interventi **aggiunti dopo** (con +Aggiungi su un rapportino già generato) devono mostrare un **badge "NUOVO"** sia nel rapportino **digitale** sia nell'**Excel**, per individuarli a colpo d'occhio.

**Decisione (confermata):** flag salvato in `raw_json` della voce — **nessuna migration** sul DB prod.

- **Rilevamento** (`app/api/mappa/rapportini/genera/route.ts`): la `existingVoci` ora seleziona anche `raw_json`; una voce con `task_id` mai presente su un rapportino **già esistente** riceve `raw_json._nuovo = true`. Alla prima generazione nessuna è nuova. Il flag è **preservato** tra rigenerazioni (le voci già presenti mantengono il valore precedente).
- **Digitale** (`app/r/[token]/page.tsx` → `RapportinoForm` → `RapportinoLista`): la voce porta `nuovo: boolean`; pill gialla "NUOVO" davanti al titolo nella lista.
- **Excel** (`app/api/mappa/rapportini/export/route.ts` + `lib/rapportini/exportStandard.ts`): `raw_json` aggiunto al select; colonna **"NUOVO" in fondo** (per non rompere i test che leggono dall'inizio) + riga evidenziata in giallo.

Persistenza: il badge resta finché non si rigenera da zero; non si auto-azzera all'invio (YAGNI).
