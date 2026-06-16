# Campi "Obbligatoria" su tutti i template — design

Data: 2026-06-16
Base: `origin/main` `4e51bf2` (worktree allineato dopo lavoro di sessione concorrente)
Stato: approvato — approccio conservativo, risanamento escluso

## Obiettivo (minimale)

Poter marcare "Obbligatoria" **ogni campo non-foto su tutti i template** e fare in modo che un campo obbligatorio
vuoto **blocchi l'invio del rapportino standard con avviso** (asterisco sul campo + elenco di cosa manca).

**Vincoli dell'utente (non negoziabili):**
1. Il task deve **solo** rendere un'azione obbligabile e farla valere.
2. **Non deve rompere logiche o salvataggi** esistenti.
3. **Non deve in alcun modo alterare il flusso delle foto**.

L'implementazione è **puramente additiva e isolata**: nessuna modifica alle funzioni core di stato voce
(`voceColore.ts`, `voceMancante.ts`), ai path di salvataggio, o alla pipeline foto.

## Scope (deciso post-audit)

- **Modale "+"**: già bloccante (sessione concorrente, `08a4792`) → **fuori scope**.
- **Risanamento**: **escluso**. Nella vista risanamento i campi non-foto **non sono compilabili** (gestisce solo
  foto + dati misuratore; `campiPerScope`/`righeIncomplete` filtrano già `tipo==='foto'`, nessun `CampoInput` nella
  cartella `risanamento/`). Renderli obbligatori-bloccanti creerebbe un blocco irrisolvibile → contro il vincolo 2.
- **In scope**: editor (checkbox su tutti i template), asterisco campi non-foto, blocco all'invio del rapportino
  standard.

## Stato attuale (audit su `4e51bf2`)

| Area | Stato |
|------|-------|
| Editor — checkbox "Obbligatoria" su tutti i template | 🟡 solo manuali (`TemplateRapportiniClient.tsx:704`) |
| Helper `campiObbligatoriMancanti` (esclude foto, tutti i tipi) | 🟢 `lib/interventi/manuali/campiObbligatoriMancanti.ts` |
| Modale "+" bloccante | 🟢 fatta (`08a4792`) |
| Blocco nel rapportino standard | 🔴 da fare |
| Asterisco `*` sui campi non-foto | 🟡 solo foto (`CampoInput.tsx:166`, in `CampoFotoInput`) |

## Approccio: check separato all'invio (come le foto), NON in `voceColore`

Il blocco delle **foto obbligatorie** nel rapportino standard è un check separato in `RapportinoForm.handleInvia`
(`fotoObbligatorieMancantiDettaglio(voci, campi, titoloCampi)` → modale pre-invio). Si replica lo **stesso schema**,
isolato, per i campi non-foto obbligatori — bloccante (niente "invia comunque", a differenza delle foto).

### A. Helper (nuovo, parallelo alle foto)
- Si **riusa** `campiObbligatoriMancanti(campi, risposte)` esistente (filtra già `tipo !== 'foto'`).
- Si **aggiunge** `campiObbligatoriMancantiVoci(voci, campi, titoloCampi)` in un nuovo file
  `utils/rapportini/campiObbligatoriVoci.ts` — parallelo a `fotoObbligatorieMancantiDettaglio`: scorre le voci
  (saltando le manuali), e per ogni voce con campi obbligatori vuoti restituisce `{ index, titolo, campi: string[] }`.
  Funzione pura, testabile.

### B. Rapportino standard — `components/modules/rapportini/RapportinoForm.tsx`
- In `handleInvia`, **prima** del check foto esistente:
  `const campiMancanti = campiObbligatoriMancantiVoci(voci, campi, titoloCampi); if (campiMancanti.length) { setCampiMancanti(campiMancanti); return; }`
  → **blocca** l'invio finché i campi obbligatori non sono compilati, mostrando l'elenco (nuova modale, bloccante).
- Non si toccano `inviabile`, `riepilogo.daFare`, `voceColore`, `voceMancante`, né il salvataggio voci.

### C. Modale — `components/modules/rapportini/ModaleCampiMancanti.tsx` (nuovo)
- Analoga a `ModaleFotoMancanti` ma **bloccante**: elenca task + etichette campi mancanti, con "Vai a compilare"
  (naviga al task) e "Chiudi". **Niente "Invia comunque".**

### D. Asterisco — `components/modules/rapportini/CampoInput.tsx`
- Asterisco rosso `*` accanto all'etichetta dei campi **non-foto** con `obbligatoria=true`: nel `labelEl`
  condiviso (select/numero/testo) e nella `<span>` della crocetta. La sotto-funzione `CampoFotoInput` resta invariata.

### E. Editor — `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx:704`
- `{soloManuale && campo.tipo !== 'foto' && (…)}` → `{campo.tipo !== 'foto' && (…)}` → checkbox "Obbligatoria" per
  ogni campo non-foto su tutti i template (sezione accordion "Azioni da fare").

## Cosa NON si tocca (garanzie)

- `utils/rapportini/voceColore.ts`, `utils/rapportini/voceMancante.ts` — invariati.
- Stato voce / `daFare` / `inviabile` / colori — invariati (il blocco è un gate aggiuntivo all'invio).
- Salvataggi (`/voce`, `/foto-campo`, sync, merge) — invariati.
- Pipeline foto (`validaFotoObbligatorie`, `fotoObbligatorieMancanti*`, `ModaleFotoMancanti`, naming) — invariata
  (nuova logica filtra `tipo !== 'foto'`).
- `ModaleInterventoManuale.tsx` (già bloccante) e tutto il risanamento — invariati.

## File toccati

| File | Modifica | Tipo |
|---|---|---|
| `utils/rapportini/campiObbligatoriVoci.ts` (nuovo) | `campiObbligatoriMancantiVoci` (+ test) | additivo |
| `components/modules/rapportini/ModaleCampiMancanti.tsx` (nuovo) | modale bloccante elenco campi | additivo |
| `components/modules/rapportini/RapportinoForm.tsx` | check + blocco all'invio (prima del check foto) | additivo |
| `components/modules/rapportini/CampoInput.tsx` | asterisco per non-foto obbligatori | additivo, visivo |
| `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` | checkbox su tutti i template | 1 riga |

Nessuna SQL. Nessuna modifica a DB/API.

## Edge case e regressioni

- **Template esistenti senza campi non-foto obbligatori**: `campiObbligatoriMancantiVoci` ritorna sempre vuoto →
  nessun blocco aggiuntivo → **zero regressioni** sui rapportini standard in corso.
- **Foto**: invariate (filtro `tipo !== 'foto'`).
- **Campi note**: il flag esplicito vince (un nota marcato `obbligatoria` entra nel check); i nota non marcati restano
  gestiti dalla logica nota-su-negativo esistente (non toccata).
- **Voci manuali**: saltate dal check (come fanno le foto), per non bloccare su voci create dal "+".

## Criteri di accettazione

1. Editor: il checkbox "Obbligatoria" appare per ogni campo non-foto su template classici **e** manuali.
2. Rapportino standard: campo obbligatorio vuoto → asterisco sul campo + **invio bloccato** con elenco "cosa manca",
   finché non compilato.
3. Campo nota marcato `obbligatoria` → entra nel check; non marcato → invariato.
4. **Foto invariate**: i test foto restano verdi; con campi obbligatori OK, blocco/avviso/naming/salvataggio foto si
   comportano esattamente come su `4e51bf2`.
5. **Logiche/salvataggi invariati**: `voceColore`, `voceMancante`, stato voce, salvataggi non toccati.
6. Zero regressioni su template esistenti senza campi obbligatori non-foto.

## Verifica

- vitest mirato: nuovo helper `campiObbligatoriMancantiVoci`, + test foto/voceColore esistenti che restano verdi.
- eslint sui file toccati; `npx tsc --noEmit` (baseline e2e/playwright già rossa — gate mirati).
- smoke browser: template classico/manuale con un campo non-foto obbligatorio → invio bloccato finché vuoto;
  un rapportino con foto obbligatorie continua a comportarsi come oggi.

## Note operative

Worktree isolato `.claude/worktrees/campi-obbligatori-tutti-template`, base `origin/main` `4e51bf2`. Al merge finale:
verificare lo stato reale di `origin/main` (`git ls-remote`) prima del push (sessione concorrente attiva).
