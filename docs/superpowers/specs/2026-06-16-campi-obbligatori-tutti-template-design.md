# Campi "Obbligatoria" su tutti i template — design

Data: 2026-06-16
Base: `origin/main` `4e51bf2` (worktree allineato dopo lavoro di sessione concorrente)
Stato: approvato (decisioni), spec aggiornata post-audit — approccio conservativo

## Obiettivo (minimale)

Poter marcare "Obbligatoria" **ogni campo non-foto su tutti i template** e fare in modo che un campo obbligatorio
vuoto **blocchi l'invio del rapportino con avviso** (asterisco sul campo + elenco di cosa manca).

**Vincoli dell'utente (non negoziabili):**
1. Il task deve **solo** rendere un'azione obbligabile e farla valere.
2. **Non deve rompere logiche o salvataggi** esistenti.
3. **Non deve in alcun modo alterare il flusso delle foto**.

Per rispettarli, l'implementazione è **puramente additiva e isolata**: nessuna modifica alle funzioni core di stato
voce (`voceColore.ts`, `voceMancante.ts`), nessuna modifica ai path di salvataggio, nessuna modifica alla pipeline foto.

## Stato attuale (audit su `4e51bf2`)

| # | Area | Stato |
|---|------|-------|
| 1 | Editor — checkbox "Obbligatoria" su tutti i template | 🟡 solo manuali (`TemplateRapportiniClient.tsx:704`) |
| 2 | Helper `campiObbligatoriMancanti` (esclude foto, tutti i tipi) | 🟢 esiste in `lib/interventi/manuali/` |
| 3 | Modale "+" bloccante | 🟢 fatta da sessione concorrente (`08a4792`) |
| 4 | Blocco nel rapportino standard pianificato | 🔴 da fare |
| 5 | Asterisco `*` sui campi non-foto | 🟡 solo foto (`CampoInput.tsx`, in `CampoFotoInput`) |
| 6 | Blocco nel risanamento | 🔴 da fare (solo foto oggi) |

## Approccio: check separato all'invio (come le foto), NON in `voceColore`

Il blocco delle **foto obbligatorie** nel rapportino standard non passa da `voceColore`: è un check separato in
`RapportinoForm` (`fotoObbligatorieMancantiDettaglio(voci, campi, titoloCampi)` → avviso pre-invio). Si replica lo
stesso schema, isolato, per i campi non-foto obbligatori. Così **non si tocca** lo stato/colore della voce, il
conteggio `daFare`, l'inviabilità calcolata, né alcun salvataggio.

### A. Helper (riuso)
- Si **riusa** `campiObbligatoriMancanti(campi, risposte)` esistente (`lib/interventi/manuali/campiObbligatoriMancanti.ts`,
  filtra già `tipo !== 'foto'`).
- Si **aggiunge** `campiObbligatoriMancantiVoci(voci, campi)` — parallelo a `fotoObbligatorieMancantiDettaglio`:
  scorre le voci (saltando le manuali come fa la controparte foto) e restituisce, per ogni voce con campi obbligatori
  vuoti, il titolo voce + l'elenco delle etichette mancanti. Funzione pura, testabile.

### B. Rapportino standard pianificato — `components/modules/rapportini/RapportinoForm.tsx`
- Nell'handler di invio, **prima** del check foto già esistente, si aggiunge:
  `const campiMancanti = campiObbligatoriMancantiVoci(voci, campi); if (campiMancanti.length) { mostra avviso; return; }`
  → **blocca** l'invio finché i campi obbligatori non sono compilati, mostrando l'elenco (riuso del pattern modale/avviso
  già usato per le foto, es. un `ModaleCampiMancanti` analogo o un riuso di `ModaleFotoMancanti` generalizzato).
- Non si toccano `inviabile`, `riepilogo.daFare`, `voceColore`, `voceMancante`, né il salvataggio voci.

### C. Asterisco — `components/modules/rapportini/CampoInput.tsx`
- Si aggiunge l'asterisco rosso `*` accanto all'etichetta dei campi **non-foto** con `obbligatoria=true`, in un punto
  **separato** dalla sotto-funzione `CampoFotoInput` (che resta invariata). Modifica puramente visiva.

### D. Risanamento — `utils/rapportini/righeIncomplete.ts` (additivo)
- Si **aggiunge** (senza toccare i blocchi foto esistenti) la validazione dei campi non-foto obbligatori, riusando
  `campiObbligatoriMancanti`: per ogni riga (misuratore) sui campi scope `misuratore`, per ogni civico con righe sui
  campi scope `fase`. I campi mancanti confluiscono in `DettaglioIncompleto.campiMancanti`.
- `RisanamentoView.tsx` usa già `righeIncomplete` → blocco client automatico; si generalizza solo il testo del
  messaggio ("Mancano foto obbligatorie" → "Mancano foto/campi obbligatori"). `app/api/r/[token]/invia/route.ts` usa
  già `righeIncomplete` → blocco server (409) automatico, nessuna modifica.

### E. Editor — `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx:704`
- `{soloManuale && campo.tipo !== 'foto' && (…)}` → `{campo.tipo !== 'foto' && (…)}` → checkbox "Obbligatoria" per ogni
  campo non-foto su tutti i template (nella sezione accordion "Azioni da fare").

## Cosa NON si tocca (garanzie)

- **`utils/rapportini/voceColore.ts`** (`voceEsitoColore`, `haEsitoNegativo`) — invariato.
- **`utils/rapportini/voceMancante.ts`** (`motivoVoceIncompleta`) — invariato.
- **Stato voce / `daFare` / `inviabile` / colori** — invariati (il blocco è un gate aggiuntivo all'invio, non un
  cambio di stato).
- **Salvataggi** (`/voce`, `/foto-campo`, sincronizzazione, merge risposte) — invariati.
- **Pipeline foto** (`validaFotoObbligatorie`, `fotoObbligatorieMancanti*`, `ModaleFotoMancanti`, naming, salvataggio,
  "foto non obbligatorie su esito negativo") — invariata. La nuova logica filtra sempre `tipo !== 'foto'`.
- **`ModaleInterventoManuale.tsx`** — invariata (già bloccante da `08a4792`).

## File toccati

| File | Modifica | Tipo |
|---|---|---|
| `utils/rapportini/campiObbligatoriVoci.ts` (nuovo) | `campiObbligatoriMancantiVoci` (+ test) | additivo |
| `components/modules/rapportini/RapportinoForm.tsx` | check + blocco all'invio (prima del check foto) | additivo |
| `components/modules/rapportini/ModaleCampiMancanti.tsx` (nuovo) o riuso generalizzato | avviso elenco campi | additivo |
| `components/modules/rapportini/CampoInput.tsx` | asterisco per non-foto obbligatori | additivo, visivo |
| `utils/rapportini/righeIncomplete.ts` | aggiunge validazione campi non-foto (foto invariate) (+ test) | additivo |
| `components/modules/rapportini/risanamento/RisanamentoView.tsx` | testo messaggio generalizzato | testo |
| `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` | checkbox su tutti i template | 1 riga |

Nessuna SQL. Nessuna modifica a DB/API payload (l'API risanamento cambia solo perché chiama la `righeIncomplete` estesa).

## Edge case e regressioni

- **Template esistenti senza campi non-foto obbligatori**: `campiObbligatoriMancanti*` ritorna sempre vuoto → nessun
  blocco aggiuntivo → **zero regressioni** su rapportini standard/risanamento in corso.
- **Foto**: invariate (filtro `tipo !== 'foto'` + isolamento).
- **Campi note**: il flag esplicito vince (un nota marcato `obbligatoria` entra nel check, come gli altri non-foto);
  i nota non marcati restano gestiti dalla logica nota-su-negativo esistente (non toccata).

## Criteri di accettazione

1. Editor: il checkbox "Obbligatoria" appare per ogni campo non-foto su template classici **e** manuali.
2. Rapportino standard: campo obbligatorio vuoto → asterisco sul campo + **invio bloccato** con elenco "cosa manca",
   finché non compilato.
3. Risanamento: campi non-foto obbligatori vuoti bloccano l'invio (client **e** server 409) e compaiono nell'elenco.
4. **Foto invariate**: i test foto restano verdi; con campi obbligatori OK, blocco/avviso/naming/salvataggio foto si
   comportano esattamente come su `4e51bf2`.
5. **Logiche/salvataggi invariati**: `voceColore`, `voceMancante`, stato voce, `daFare`, salvataggi non sono toccati;
   i loro test restano verdi.
6. Zero regressioni su template esistenti senza campi obbligatori non-foto.

## Verifica

- vitest mirato: nuovi helper (`campiObbligatoriMancantiVoci`), `righeIncomplete` esteso, **+ i test esistenti di
  foto / voceColore / voceMancante che devono restare verdi e invariati**.
- eslint sui file toccati; `npx tsc --noEmit` (baseline e2e/playwright già rossa — gate mirati).
- smoke browser: template classico/manuale/risanamento con un campo non-foto obbligatorio → invio bloccato finché
  vuoto; un rapportino con foto obbligatorie continua a comportarsi come oggi.

## Note operative

Worktree isolato `.claude/worktrees/campi-obbligatori-tutti-template`, base `origin/main` `4e51bf2`. Al merge finale:
verificare lo stato reale di `origin/main` (`git ls-remote`) prima del push, per via dei ref in movimento (sessione
concorrente attiva).
