# Risanamento colonne — Fase 3: Assegnazione & generazione link

**Data:** 2026-06-09
**Stato:** Design approvato
**Progetto:** Flusso "Risanamento colonne" (multi-fase). Questo documento copre **solo la Fase 3**.

---

## Contesto e scelte

L'admin pianifica e genera i rapportini di risanamento **riusando la mappa esistente**:
- I **civici-palazzo** entrano nella pianificazione mappa con i metodi già esistenti — **import Excel**
  *oppure* **aggiunta manuale** dalla schermata mappa — come interventi con **attività "RESINE"**.
- **Un task = un palazzo** → una **voce-civico** nel rapportino.
- Alla generazione, se il piano contiene attività "RESINE", il sistema usa **automaticamente** il
  template con `tipo='risanamento'` (preselezione, override-abile).
- Il rapportino generato eredita `tipo='risanamento'` → è gerarchico (le **righe-misuratore** si
  aggiungono in Fase 4 via scanner; qui le voci-civico nascono "senza righe").

**Assunto:** esiste un solo template attivo `tipo='risanamento'` (se più, si usa il primo per nome).

Il grosso del flusso (import, distribuzione, generazione token, `/r/[token]`, scadenza) **esiste già**
in `sincronizzaRapportini` / mappa. La Fase 3 aggiunge solo il riconoscimento RESINE→template e lo
snapshot del tipo sul rapportino.

---

## Sezione 1 — Helper puri (riconoscimento RESINE + risoluzione template)

Modulo nuovo `lib/risanamento/templateRisanamento.ts` (testabile, niente I/O):

```ts
export const ATTIVITA_RISANAMENTO = 'RESINE';

/** True se l'attività indica un intervento di risanamento (case-insensitive, trim). */
export function isAttivitaRisanamento(attivita: unknown): boolean;

/** True se almeno un task del piano ha attività di risanamento. */
export function pianoHaRisanamento(tasks: Array<{ attivita?: string | null }>): boolean;

/** Primo template attivo con tipo='risanamento' (per nome), o null. */
export function risolviTemplateRisanamento(
  templates: Array<{ id: string; tipo?: string | null; active?: boolean; nome: string }>,
): string | null;
```

Questi helper sono puri e coprono il cuore logico (riconoscimento attività + scelta template),
testabili senza DB.

## Sezione 2 — Preselezione automatica del template (client mappa)

In `MappaOperatoriClient.tsx`: quando il piano corrente contiene task con attività "RESINE",
il dropdown del template si **preseleziona** sul template risanamento (via `risolviTemplateRisanamento`
sui template già caricati). L'admin può comunque cambiarlo (override). Se non esiste alcun template
risanamento → messaggio chiaro ("Crea un template di tipo Risanamento in Impostazioni → Template").

## Sezione 3 — Snapshot del tipo sul rapportino (server)

In `lib/interventi/sincronizzaRapportini.ts`: oggi l'insert/update di `rapportini` salva
`campi_snapshot`/`info_snapshot` dal template ma **non** il `tipo`. Si aggiunge `tipo: tpl.tipo ?? 'standard'`
sia nell'INSERT (nuovo rapportino) sia nell'UPDATE (rigenerazione). Così `/r/[token]` (Fase 4) e gli
export (Fase 5) sanno che il rapportino è gerarchico. `sincronizzaRapportini` carica già il template:
va solo assicurato che la select includa `tipo`.

## Sezione 4 — Voci-civico

Nessun cambiamento a `taskToVoce`: ogni task-palazzo produce una voce con i campi anagrafici disponibili
(via→`via`, comune→`comune`, ecc.). Per il risanamento il task-palazzo **non** ha matricola/PDR/ODL
(quelli arrivano dallo scanner in Fase 4), quindi:
- la voce-civico nasce con via/comune e senza matricola/pdr;
- il collegamento `intervento_id` (resolver per ODL/matricola/PDR) semplicemente non aggancia nulla
  (nessun match) — accettabile: le voci-civico risanamento non si legano a un intervento puntuale.
Le **righe-misuratore** (`rapportino_righe`) restano vuote alla generazione; si popolano in Fase 4.

## Data flow

```
Admin (mappa): carica/aggiunge palazzi (attività RESINE) → distribuisce agli operatori
   → "Genera": il client preseleziona il template risanamento (RESINE rilevata)
   → POST /api/mappa/rapportini/genera { pianoId, templateId(risanamento) }
   → sincronizzaRapportini: crea rapportino (token, scadenza) + voci-civico,
     snapshot campi/info/TIPO='risanamento'
   → /r/[token] (Fase 4): l'operatore vede card-civico, aggiunge righe-misuratore via scan
```

## Error handling

- Nessun template `tipo='risanamento'` → la preselezione mostra il messaggio "crea un template Risanamento"; la generazione con un template standard resta possibile (produce rapportino standard) ma è una scelta esplicita dell'admin.
- Piano misto (alcuni task RESINE, altri no) → `pianoHaRisanamento` è true se almeno uno è RESINE; preseleziona risanamento. Caso atipico (i piani risanamento sono omogenei); l'admin può override.
- `tipo` assente sul template (vecchi template) → default `'standard'` nello snapshot.

## Testing

- Unit (`lib/risanamento/templateRisanamento.test.ts`): `isAttivitaRisanamento` (case/trim/varianti), `pianoHaRisanamento` (almeno-uno), `risolviTemplateRisanamento` (primo attivo per nome, null se assente, ignora non-attivi e non-risanamento).
- Snapshot tipo / preselezione client: verifica via `tsc`/`eslint`/`build` (route e UI non testate in E2E nel progetto).

## Fuori scope (YAGNI / fasi successive)

- UI operatore gerarchica + scanner barcode/QR + lookup (Fase 4).
- Conteggio punti gas + conferma alla chiusura, vincolo doppia foto, spostamento in archivio, PDF (Fase 5).
- Nessuna modifica al flusso dei piani/rapportini standard (tutto dietro il riconoscimento RESINE).
- L'attività "RESINE" si crea dalla schermata Gruppo Attività (dato di configurazione, niente codice).
