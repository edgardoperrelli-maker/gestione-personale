# Design — Auto-assegnazione da colonna "Esecutore" + Copia link più visibile

- **Data:** 2026-06-01
- **Stato:** in attesa di revisione utente
- **Autore:** Edgardo Perrelli (con Claude)
- **Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind 4 · xlsx · Vitest
- **Collegato a:** [Link rapportini nell'editor mappa](2026-06-01-link-rapportini-editor-mappa-design.md)

---

## 1. Contesto e obiettivo

Nell'editor mappa si importa un Excel di interventi, si geocodifica e si distribuisce tra
operatori. Il template "Export Dati" ha una colonna **`Esecutore`** (valori = cognomi, es.
`PASTORELLI`). Oggi quella colonna non viene usata per assegnare: il parser la estrae in
`task._operatore` solo per l'etichetta del marker, e il riconoscimento header non riconosce
nemmeno la parola "Esecutore".

**Obiettivo:** quando si carica un template con la colonna `Esecutore` valorizzata, il modulo
deve **auto-assegnare** ogni intervento all'operatore indicato e proseguire il flusso normale
(geocodifica → distribuzione → salva → genera rapportini), con il minimo di click.

In più: il pulsante **"Copia link"** del rapportino (già presente accanto a ogni operatore)
va reso **più visibile**, perché oggi viene oscurato dal pulsante WhatsApp.

## 2. Scope

**In scope:**
- Riconoscere l'header `Esecutore` (oltre a operatore/risorsa/tecnico/addetto).
- Abbinare il nome Esecutore a un operatore di **tutta l'anagrafica** (`operatorOptions`).
- Al caricamento: auto-selezionare gli operatori abbinati e **fissare** (pin) ogni intervento al suo esecutore; avviso sui nomi non abbinati.
- Distribuzione che rispetta i pin; righe vuote/non abbinate distribuite normalmente tra gli operatori selezionati.
- Auto-distribuzione dopo la geocodifica quando esistono pin esecutore.
- Rendere "Copia link" prominente quanto WhatsApp.

**Fuori scope:**
- Modifiche al backend / SQL (nessuna).
- Creazione di operatori non presenti in anagrafica (i non abbinati restano tali).
- Cambiare la logica di route/polyline, ZTL, salvataggio piano, generazione rapportini.

## 3. Decisioni (confermate con l'utente)

| Tema | Scelta |
|---|---|
| Insieme di match | **Tutta l'anagrafica** (`operatorOptions`), anche operatori non nel cronoprogramma del giorno. |
| Righe vuote / nome non trovato | **Distribuite** con l'algoritmo normale tra gli operatori selezionati; avviso sui nomi non abbinati. |
| Avvio distribuzione | **Automatico** dopo la geocodifica quando ci sono pin esecutore (l'utente può comunque ri-distribuire/azzerare). |
| Copia link | Reso **prominente** (stile primario, primo nella riga) accanto a WhatsApp. |
| Nome ambiguo (più operatori) | Non abbinato → finisce tra i "non abbinati" (avviso). |

## 4. Riconoscimento colonna (parser)

`utils/routing/excelParser.ts` → `detectFormat`, ramo "Export Dati / Geocall": estendere il
pattern della colonna operatore:
```ts
operatore: findCol(headers, [/^operatore$/, /^risorsa$/, /^tecnico$/, /^esecutore$/, /^addetto$/, /^nome (operatore|tecnico|risorsa)$/]),
```
Nessun'altra modifica: il valore finisce già in `task._operatore` (riga ~242/267). Il campo
resta `Task & { _operatore?: string }` (convenzione esistente, usata in 3 punti del client).

## 5. Logica pura — `utils/routing/esecutore.ts` (+ test)

```ts
type OpLite = { id: string; displayName: string };

// Normalizza: maiuscole, niente accenti, spazi singoli → token[]
function tokens(s: string): string[]

// Abbina se TUTTI i token del nome Excel sono presenti nei token del displayName.
// Nessun match → null. Più di un match → null (ambiguo).
export function matchEsecutore(nome: string, operators: OpLite[]): OpLite | null

// Costruisce i pin per i task che hanno _operatore.
export function buildEsecutorePins(
  tasks: { id: string; _operatore?: string }[],
  operators: OpLite[],
): {
  pins: Record<string, string>;        // taskId -> staffId
  operatoriDaSelezionare: string[];     // staffId distinti da auto-selezionare
  nonAbbinati: string[];                // nomi Esecutore senza match (distinti)
}
```
Esempi di match: `PASTORELLI` → "PASTORELLI MARIO" ✓; `DE SANTIS` → "DE SANTIS ALESSANDRO" ✓;
`ROSSI` con due operatori "ROSSI …" → `null` (ambiguo).

## 6. Caricamento file (`handleFileChange`)

Dopo `parseExcelToTasks` + filtro S-AI-051 e `setExcelTasks(filtered)`:
1. `const { pins, operatoriDaSelezionare, nonAbbinati } = buildEsecutorePins(filtered, operatorOptions)`.
2. Se `Object.keys(pins).length > 0`:
   - Salvo i pin in stato: `setEsecutorePins(pins)`.
   - **Auto-seleziono** gli operatori: per ogni `staffId` in `operatoriDaSelezionare`, costruisco l'`OpConfig` con la stessa logica di `toggleOp` (base/startAddress da reperibilità/home), `qty` = n° pin di quell'operatore; `setSelectedOps(ops)`.
   - Se `nonAbbinati.length`: avviso (riuso del banner `ztlConflicts` o un nuovo stato `esecutoreWarnings`) → "Esecutori non riconosciuti: X, Y — verranno distribuiti automaticamente."
3. Se nessun pin: comportamento attuale invariato (reset `esecutorePins` a `{}`).

Nota: l'auto-selezione avviene anche se il pannello distribuzione non è ancora visibile (compare a geocodifica ≥2); gli operatori risultano già pronti.

## 7. Distribuzione (`distributeToOps`) — rispetto dei pin

All'inizio di `distributeToOps`, dopo aver calcolato `geocoded` (task con coordinate, dedup PdR):
1. Partizione: `pinned` = task con `esecutorePins[task.id]` riferito a un operatore **selezionato**; `rest` = gli altri.
2. I `pinned` vengono inseriti direttamente nel bucket dell'operatore corrispondente (come avviene per `manualPre`).
3. I `rest` (vuoti o non abbinati o pin verso operatori non selezionati) proseguono nel flusso esistente: regole manuali → pre-assegnazione ZTL → bilanciamento per `qty`.
4. Route/polyline per operatore invariati.

I pin verso operatori **non** selezionati (caso raro: utente ha deselezionato a mano) ricadono in `rest`.

## 8. Auto-distribuzione dopo geocodifica

`useEffect` che osserva il completamento della geocodifica (`geocodingProgress?.done === total && total>0`,
o fine di `startGeocoding`): se `Object.keys(esecutorePins).length > 0` e `selectedOps.length > 0`
e `distribution == null`, chiama `distributeToOps()` una sola volta. L'utente può poi
**Azzera**/ri-**Distribuisci** normalmente.

## 9. Copia link più visibile (editor)

Nel blocco per-operatore di `MappaOperatoriClient.tsx` (Task 6 del piano precedente):
- "Copia link" diventa il **primo** elemento e usa lo **stile primario** (cyan, come il pulsante Genera): es. `bg-[var(--brand-primary)] text-[oklch(0.16_0.06_245)]` o bordo cyan pieno, dimensione coerente con WhatsApp.
- WhatsApp ed Excel restano secondari accanto.

## 10. Casi limite

| Caso | Comportamento |
|---|---|
| Tutte le righe con Esecutore valido | Tutti i task pinnati; ogni operatore riceve i suoi; auto-distribuzione. |
| Mix Esecutore + vuoti | Pin diretti + resto bilanciato tra gli operatori selezionati. |
| Nome non in anagrafica | Tra i "non abbinati" (avviso); riga distribuita normalmente. |
| Nome ambiguo (più match) | Non abbinato (avviso); riga distribuita. |
| Operatore abbinato senza indirizzo di partenza | Selezionato comunque (`base = null`, come da `toggleOp`); route parte senza base. |
| Template senza colonna Esecutore | Flusso attuale invariato (nessun pin, nessuna auto-distribuzione). |
| ZTL | Validazione invariata sulle righe non pinnate. (I pin esecutore hanno priorità esplicita dell'utente.) |

## 11. Testing (Vitest)

Logica pura in `utils/routing/esecutore.ts`:
- `matchEsecutore`: cognome singolo, multi-token (`DE SANTIS`), case/accenti, non trovato, ambiguo → null.
- `buildEsecutorePins`: pin corretti per task, operatori distinti da selezionare, lista non abbinati; task senza `_operatore` ignorati.

Verifica manuale: caricare il template allegato (tutti "PASTORELLI") → l'operatore PASTORELLI
risulta selezionato, geocodifica → distribuzione automatica con tutti i task su PASTORELLI →
salva → genera → "Copia link" ben visibile. Poi un file misto (alcuni esecutori vuoti) → i
vuoti distribuiti, avviso sui non riconosciuti.

## 12. File coinvolti

| Area | File | Azione |
|---|---|---|
| Riconoscimento header | `utils/routing/excelParser.ts` | Modify (regex operatore) |
| Logica pura match/pin | `utils/routing/esecutore.ts` (+ test) | Create |
| Caricamento + auto-select + pin + avviso | `components/modules/mappa/MappaOperatoriClient.tsx` (`handleFileChange`, stato) | Modify |
| Distribuzione con pin | `components/modules/mappa/MappaOperatoriClient.tsx` (`distributeToOps`) | Modify |
| Auto-distribuzione | `components/modules/mappa/MappaOperatoriClient.tsx` (useEffect) | Modify |
| Copia link prominente | `components/modules/mappa/MappaOperatoriClient.tsx` (blocco rapportini) | Modify |

## 13. Note

- **Nessuna SQL / migrazione.**
- Si mantiene il campo ad-hoc `_operatore` (convenzione esistente) anziché aggiungere `esecutore` al tipo `Task`, per minimizzare il churn.
- Coerenza tema Aurea (`--brand-*`).
