# Campi "Obbligatoria" su tutti i template — design

Data: 2026-06-16
Stato: approvato (decisioni), in attesa scrittura/approvazione spec

## Contesto e problema

Nei template rapportini ogni campo (azione) ha un flag opzionale `obbligatoria?: boolean`. Oggi:

- **Editor** (`app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx:704`): il checkbox "Obbligatoria"
  per i campi **non-foto** appare SOLO quando `soloManuale` è true (template per interventi manuali).
  I campi foto hanno il loro "Foto obbligatoria" sempre disponibile.
- **A valle**, l'obbligatorietà dei campi non-foto produce **solo un `confirm()` non-bloccante**
  nella modale intervento manuale (`components/modules/rapportini/ModaleInterventoManuale.tsx:84`,
  helper `lib/interventi/manuali/campiObbligatoriMancanti.ts`).
- **Rapportino standard pianificato**: il flag `obbligatoria` su campi non-foto è **ignorato** (nessun asterisco,
  avviso o blocco).
- **Risanamento** (vista gerarchica): valida **solo le foto** obbligatorie via `utils/rapportini/righeIncomplete.ts`;
  i campi non-foto obbligatori sono ignorati.

Esiste già un meccanismo "blocco + avviso" per le **note obbligatorie su esito negativo**, ed è il modello che
vogliamo replicare. Funziona così (`utils/rapportini/voceColore.ts`):
- se una voce ha esito negativo ma la nota non è compilata, `voceEsitoColore` ritorna `'neutro'`;
- una voce `neutro` conta come "da fare" → `riepilogo.daFare > 0` → `RapportinoForm` rende `inviabile = false`
  (= **blocco invio**);
- `voceMancante.ts` espone il motivo (`'nota_mancante'`) usato per l'asterisco e la lista "cosa manca".

## Obiettivo

Rendere il flag "Obbligatoria" disponibile per **ogni campo non-foto su tutti i template**, e fare in modo che un
campo obbligatorio vuoto **blocchi l'invio del rapportino con avviso** (asterisco sul campo + voce nella lista
"cosa manca"), **come già avviene per le note su esito negativo**, in **tutti i contesti**: rapportino standard
pianificato, modale intervento manuale, e rapportino risanamento.

## Decisioni (approvate)

- **Comportamento**: blocco + avviso, riusando il meccanismo delle note (non un semplice avviso non-bloccante).
- **Campi "note"**: il flag esplicito vince — un campo nota marcato `obbligatoria` è **sempre** obbligatorio
  (anche con esito positivo); un campo nota **non** marcato mantiene la regola attuale (obbligatorio solo su esito
  negativo).
- **Risanamento**: incluso.

## Architettura

### Helper condiviso (unica fonte di verità)
Nuovo `utils/rapportini/campiObbligatori.ts` con due funzioni pure:
- `campiObbligatoriMancanti(risposte, campi): string[]` — etichette dei campi **non-foto** con `obbligatoria=true`
  il cui valore è mancante (riusa la logica `valoreMancante` per crocetta/numero/testo/select).
- `campiObbligatoriCompilati(risposte, campi): boolean` — `true` se nessun campo obbligatorio non-foto è mancante.

La logica esistente in `lib/interventi/manuali/campiObbligatoriMancanti.ts` viene **spostata** qui; quel file
re-esporta da `utils/rapportini/campiObbligatori.ts` (o l'import in `ModaleInterventoManuale` viene rediretto),
così non c'è duplicazione.

### Contesto 1 — Rapportino standard pianificato
- `utils/rapportini/voceColore.ts` → `voceEsitoColore`: in testa, `if (!campiObbligatoriCompilati(risposte, campi)) return 'neutro';`.
  Una voce con campi obbligatori vuoti resta "da fare" → blocca l'invio, esattamente come le note.
- `utils/rapportini/voceMancante.ts` → `motivoVoceIncompleta`: nuovo motivo `'campi_obbligatori_mancanti'`,
  con **priorità** sugli altri: se mancano campi obbligatori → quel motivo; altrimenti la logica esistente
  (`nota_mancante` / `senza_esito`).
- `components/modules/rapportini/CampoInput.tsx`: asterisco rosso anche per i campi **non-foto** con `obbligatoria=true`
  (oggi l'asterisco c'è solo per le foto).
- Lista "cosa manca" (`RapportinoLista.tsx` / `VoceCard.tsx`): testo per il nuovo motivo (es. "Compila i campi obbligatori").

### Contesto 2 — Modale intervento manuale
- `components/modules/rapportini/ModaleInterventoManuale.tsx`: il `confirm()` non-bloccante diventa **blocco**:
  l'invio è impedito finché `campiObbligatoriMancanti` non è vuoto (come già per le foto obbligatorie),
  con l'elenco dei campi mancanti mostrato.

### Contesto 3 — Risanamento (vista gerarchica)
- `utils/rapportini/righeIncomplete.ts`: estesa per validare anche i **campi non-foto** obbligatori, riusando
  `campiObbligatoriMancanti`: per ogni **riga** (misuratore) sui campi scope `misuratore`, e per ogni **civico**
  (con righe) sui campi scope `fase`. I campi mancanti confluiscono in `DettaglioIncompleto.campiMancanti`
  insieme alle foto.
- `components/modules/rapportini/risanamento/RisanamentoView.tsx`: usa già `righeIncomplete` → blocco client
  automatico; si generalizza il testo del messaggio da "Mancano foto obbligatorie" a "Mancano foto/campi obbligatori".
- `app/api/r/[token]/invia/route.ts`: usa già `righeIncomplete` → blocco server (409) automatico.

### Editor
- `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx:704`: la condizione
  `{soloManuale && campo.tipo !== 'foto' && (...)}` diventa `{campo.tipo !== 'foto' && (...)}` →
  il checkbox "Obbligatoria" appare per ogni campo non-foto su **tutti** i template (classici e manuali).
  (Il blocco vive nella sezione accordion "Azioni da fare" introdotta dal redesign.)

## File toccati

| File | Modifica |
|---|---|
| `utils/rapportini/campiObbligatori.ts` | **nuovo** — helper puro + (test) |
| `utils/rapportini/voceColore.ts` | `voceEsitoColore`: priorità campi obbligatori → neutro |
| `utils/rapportini/voceMancante.ts` | nuovo motivo `campi_obbligatori_mancanti` |
| `utils/rapportini/righeIncomplete.ts` | valida anche campi non-foto obbligatori (riga/civico) |
| `lib/interventi/manuali/campiObbligatoriMancanti.ts` | re-export da utils (no duplicati) |
| `components/modules/rapportini/CampoInput.tsx` | asterisco per non-foto obbligatori |
| `components/modules/rapportini/ModaleInterventoManuale.tsx` | da `confirm()` a blocco |
| `components/modules/rapportini/RapportinoLista.tsx` (e/o `VoceCard.tsx`) | testo nuovo motivo |
| `components/modules/rapportini/risanamento/RisanamentoView.tsx` | testo messaggio generalizzato |
| `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` | checkbox "Obbligatoria" su tutti i template |

Nessuna modifica a DB/schema/API payload. **Nessuna SQL.** (`app/api/r/[token]/invia/route.ts` cambia solo perché
chiama la `righeIncomplete` estesa.)

## Edge case e regressioni

- **Template classici esistenti**: nessun campo non-foto ha oggi `obbligatoria=true` (il checkbox non era disponibile)
  → `campiObbligatoriCompilati` ritorna sempre `true` → `voceEsitoColore` invariato → **zero regressioni** sui
  rapportini pianificati in corso. L'effetto compare solo sui template (ri)salvati con la spunta.
- **Template manuali esistenti** con campi obbligatori: passano da avviso non-bloccante a **bloccante** (coerente
  con la richiesta).
- **Campi foto**: invariati (validati separatamente; `campiObbligatoriMancanti` esclude `tipo='foto'`).
- **Campi note non marcati obbligatoria**: regola invariata (obbligatori solo su esito negativo).
- **Priorità in `voceEsitoColore`**: il check campi obbligatori precede gli altri rami → una voce con esito positivo
  ma campo obbligatorio vuoto diventa `neutro` (bloccata), come desiderato.

## Criteri di accettazione

1. Editor: il checkbox "Obbligatoria" appare per ogni campo non-foto su template classici **e** manuali.
2. Rapportino standard: campo obbligatorio vuoto → voce "da fare", asterisco sul campo, voce in "cosa manca",
   invio bloccato finché non compilato.
3. Modale manuale: campi obbligatori vuoti **bloccano** l'invio (non più solo `confirm()`), con elenco mancanti.
4. Risanamento: campi non-foto obbligatori vuoti bloccano l'invio (client **e** server 409) e compaiono nell'elenco
   dei mancanti.
5. Campo nota marcato `obbligatoria` → sempre obbligatorio; non marcato → solo su esito negativo (invariato).
6. Zero regressioni su template esistenti senza campi obbligatori non-foto.

## Verifica

- vitest mirato sui nuovi/estesi helper puri (`campiObbligatori`, `voceColore`, `voceMancante`, `righeIncomplete`).
- eslint sui file toccati; `npx tsc --noEmit` (baseline e2e/playwright già rossa — gate mirati, vedi memo
  "Lint/test baseline rosso").
- smoke browser: template classico con un campo obbligatorio → rapportino standard bloccato finché vuoto;
  template manuale → modale bloccata; template risanamento con campo non-foto obbligatorio → invio bloccato.

## Note operative

Lavoro svolto in un **worktree isolato** (`.claude/worktrees/campi-obbligatori-tutti-template`, base `f1fe82b`)
per non interferire con una **sessione Claude concorrente** attiva sullo stesso repo. Al merge finale: verificare lo
stato reale di `origin/main` (`git ls-remote`) prima di push, per via dei ref in movimento.
