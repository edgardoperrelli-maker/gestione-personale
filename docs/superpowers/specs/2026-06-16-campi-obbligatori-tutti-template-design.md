# Campi "Obbligatoria" su tutti i template — design

Data: 2026-06-16
Base: `origin/main` `4e51bf2` (worktree allineato dopo lavoro di sessione concorrente)
Stato: approvato (decisioni), spec aggiornata post-audit

## Contesto e problema

Nei template rapportini ogni campo (azione) ha un flag opzionale `obbligatoria?: boolean`. Vogliamo poter marcare
"Obbligatoria" **ogni campo non-foto su tutti i template** e far sì che un campo obbligatorio vuoto **blocchi
l'invio con avviso** (asterisco + voce nella lista "cosa manca"), **come già avviene per le note su esito negativo**.

### Stato attuale (audit su `4e51bf2`)

Una sessione concorrente ha già implementato parte del lavoro. Stato verificato:

| # | Area | Stato | Dettaglio |
|---|------|-------|-----------|
| 1 | Editor — checkbox "Obbligatoria" su tutti i template | 🟡 Parziale | `TemplateRapportiniClient.tsx:704` ancora `{soloManuale && campo.tipo !== 'foto' && …}` |
| 2 | Helper `campiObbligatoriMancanti` | 🟢 Fatto | `lib/interventi/manuali/campiObbligatoriMancanti.ts` — esclude foto, tutti i tipi |
| 3 | Modale "+" bloccante | 🟢 **Fatto (concorrente, `08a4792`)** | blocco con elenco campi mancanti |
| 4 | Rapportino standard (blocco+"cosa manca") | 🔴 Da fare | `voceColore.ts`/`voceMancante.ts` ignorano il flag non-foto |
| 5 | Asterisco `*` sui campi non-foto | 🟡 Parziale | `CampoInput.tsx:166` mostra `*` solo per le foto (in `CampoFotoInput`) |
| 6 | Risanamento (blocco campi non-foto) | 🔴 Da fare | `righeIncomplete.ts` valida solo le foto |

Modello di riferimento (nota obbligatoria su esito negativo, `utils/rapportini/voceColore.ts`): se la nota manca,
`voceEsitoColore` ritorna `'neutro'` → la voce conta come "da fare" → `daFare > 0` → `RapportinoForm` rende
`inviabile = false` (blocco). `voceMancante.ts` espone il motivo per asterisco e lista "cosa manca".

## VINCOLO NON NEGOZIABILE — non perdere il flusso foto

Questo task **non deve in alcun modo alterare il flusso delle foto**. Tutto il comportamento foto esistente resta
identico: validazione foto obbligatorie (`validaFotoObbligatorie`, `utils/rapportini/fotoObbligatorieMancanti.ts`,
`ModaleFotoMancanti`), blocco foto, naming (`fotoNaming`), salvataggio/merge foto, e la regola
"foto non obbligatorie su esito negativo".

**Garanzie di isolamento (verificate in fase di review):**
- L'helper sui campi obbligatori filtra sempre `tipo !== 'foto'`: **nessun campo foto entra mai** nella nuova logica.
- `voceEsitoColore` non gestisce le foto (gestisce esiti crocetta/select): il check campi obbligatori è **additivo**
  e non tocca la pipeline foto.
- `fotoObbligatorieMancantiDettaglio` continua a basarsi su `haEsitoNegativo` (non su `voceEsitoColore`): la nuova
  logica non cambia quali voci la funzione foto considera/salta.
- In `righeIncomplete` (risanamento) la validazione **foto resta intatta**; si **aggiunge** solo un controllo per i
  campi non-foto, senza modificare i blocchi foto esistenti.
- In `CampoInput` l'asterisco per i non-foto va in un punto **separato** dalla sotto-funzione `CampoFotoInput`.
- Il blocco standard (voce `neutro` per campo obbligatorio mancante) **precede** il check foto ma non lo sostituisce:
  quando i campi obbligatori sono OK, il flusso foto (`ModaleFotoMancanti`, ecc.) procede **esattamente come oggi**.
- I test esistenti delle foto (`validaFotoObbligatorie.test`, `fotoObbligatorieMancanti.test`, i casi foto di
  `righeIncomplete`) devono restare **verdi e invariati**.

## Decisioni (approvate)

- **Comportamento**: blocco + avviso, riusando il meccanismo delle note.
- **Campi "note"**: il flag esplicito vince — un campo nota marcato `obbligatoria` è sempre obbligatorio; senza spunta
  mantiene la regola attuale (obbligatorio solo su esito negativo).
- **Risanamento**: incluso.
- **Modale "+"**: già fatta dalla sessione concorrente (`08a4792`) → **fuori scope** di questo task; si riusa il suo
  helper, non se ne crea un altro.

## Architettura

### Helper condiviso (riuso, niente duplicati)
Si **riusa** `campiObbligatoriMancanti` esistente (`lib/interventi/manuali/campiObbligatoriMancanti.ts`), che già
filtra `tipo !== 'foto'` e gestisce crocetta/numero/testo/select. Si **aggiunge** accanto un
`campiObbligatoriCompilati(risposte, campi): boolean` (= `campiObbligatoriMancanti(...).length === 0`) nello stesso
modulo (o in `utils/rapportini/`), così standard e risanamento usano la stessa fonte di verità della modale "+".

### Contesto A — Rapportino standard pianificato
- `utils/rapportini/voceColore.ts` → `voceEsitoColore`: in testa,
  `if (!campiObbligatoriCompilati(risposte, campi)) return 'neutro';`. Additivo, non tocca la logica esistente né le foto.
- `utils/rapportini/voceMancante.ts` → `motivoVoceIncompleta`: nuovo motivo `'campi_obbligatori_mancanti'`,
  con priorità: se mancano campi obbligatori → quel motivo; altrimenti logica esistente (`nota_mancante`/`senza_esito`).
- `components/modules/rapportini/CampoInput.tsx`: asterisco rosso per i campi **non-foto** con `obbligatoria=true`
  (punto separato da `CampoFotoInput`, che resta invariato).
- Lista "cosa manca" (`RapportinoLista.tsx`/`VoceCard.tsx`): testo per il nuovo motivo (es. "Compila i campi obbligatori").

### Contesto B — Risanamento (vista gerarchica)
- `utils/rapportini/righeIncomplete.ts`: **aggiunta** (senza toccare la parte foto) della validazione dei campi
  non-foto obbligatori, riusando `campiObbligatoriMancanti`: per ogni riga (misuratore) sui campi scope `misuratore`,
  per ogni civico con righe sui campi scope `fase`. I campi mancanti confluiscono in `DettaglioIncompleto.campiMancanti`.
- `components/modules/rapportini/risanamento/RisanamentoView.tsx`: usa già `righeIncomplete` → blocco client automatico;
  si generalizza solo il testo del messaggio ("Mancano foto obbligatorie" → "Mancano foto/campi obbligatori").
- `app/api/r/[token]/invia/route.ts`: usa già `righeIncomplete` → blocco server (409) automatico, nessuna modifica.

### Editor
- `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx:704`:
  `{soloManuale && campo.tipo !== 'foto' && (…)}` → `{campo.tipo !== 'foto' && (…)}` → checkbox "Obbligatoria" per ogni
  campo non-foto su tutti i template. (Il blocco vive nella sezione accordion "Azioni da fare" del redesign.)

## File toccati

| File | Modifica |
|---|---|
| `lib/interventi/manuali/campiObbligatoriMancanti.ts` (o `utils/rapportini/`) | aggiungere `campiObbligatoriCompilati` (+ test) |
| `utils/rapportini/voceColore.ts` | `voceEsitoColore`: priorità campi obbligatori → neutro (+ test) |
| `utils/rapportini/voceMancante.ts` | nuovo motivo `campi_obbligatori_mancanti` (+ test) |
| `utils/rapportini/righeIncomplete.ts` | **aggiunge** validazione campi non-foto (foto invariate) (+ test) |
| `components/modules/rapportini/CampoInput.tsx` | asterisco per non-foto obbligatori (foto invariate) |
| `components/modules/rapportini/RapportinoLista.tsx` (e/o `VoceCard.tsx`) | testo nuovo motivo |
| `components/modules/rapportini/risanamento/RisanamentoView.tsx` | testo messaggio generalizzato |
| `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` | checkbox su tutti i template |

Nessuna modifica a `ModaleInterventoManuale.tsx` (già bloccante da `08a4792`). Nessuna modifica alle funzioni foto.
**Nessuna SQL.**

## Edge case e regressioni

- **Template classici esistenti**: nessun campo non-foto ha oggi `obbligatoria=true` → `campiObbligatoriCompilati`
  ritorna sempre `true` → `voceEsitoColore` invariato → **zero regressioni** sui rapportini pianificati in corso.
- **Foto**: invariate per costruzione (filtro `tipo !== 'foto'`, isolamento descritto sopra).
- **Campi note non marcati obbligatoria**: regola invariata (obbligatori solo su esito negativo).
- **Modale "+"**: già bloccante (concorrente), non toccata.

## Criteri di accettazione

1. Editor: il checkbox "Obbligatoria" appare per ogni campo non-foto su template classici **e** manuali.
2. Rapportino standard: campo obbligatorio vuoto → voce "da fare", asterisco sul campo, voce in "cosa manca",
   invio bloccato finché non compilato.
3. Risanamento: campi non-foto obbligatori vuoti bloccano l'invio (client **e** server 409) e compaiono nell'elenco.
4. Campo nota marcato `obbligatoria` → sempre obbligatorio; non marcato → solo su esito negativo (invariato).
5. **Il flusso foto è identico a prima**: i test foto restano verdi; con campi obbligatori OK, blocco/avviso/naming/
   salvataggio foto si comportano esattamente come su `4e51bf2`.
6. Zero regressioni su template esistenti senza campi obbligatori non-foto.

## Verifica

- vitest mirato sui nuovi/estesi helper puri (`campiObbligatori*`, `voceColore`, `voceMancante`, `righeIncomplete`),
  **inclusi** i test foto esistenti che devono restare verdi.
- eslint sui file toccati; `npx tsc --noEmit` (baseline e2e/playwright già rossa — gate mirati).
- smoke browser: template classico/manuale/risanamento con un campo non-foto obbligatorio → invio bloccato finché
  vuoto; verificare che un rapportino con foto obbligatorie continui a comportarsi come oggi.

## Note operative

Worktree isolato `.claude/worktrees/campi-obbligatori-tutti-template`, base allineata a `origin/main` `4e51bf2`
(rebase dopo il lavoro della sessione concorrente). Al merge finale: verificare lo stato reale di `origin/main`
(`git ls-remote`) prima del push, per via dei ref in movimento.
