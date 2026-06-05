# Condivisione PDF riepilogo rapportino su WhatsApp — Design

**Data:** 2026-06-05
**Branch:** `feat/rapportino-condividi-whatsapp` (da `main`)
**Stato:** approvato in brainstorming, in attesa di review spec

---

## 1. Obiettivo

Quando un operatore compila e invia il rapportino di fine giornata su `/r/[token]`, deve poter
**generare un PDF di riepilogo** (compilato con i dati che ha inserito) e **condividerlo su WhatsApp**
con un tocco — **senza alcun servizio a pagamento** (niente Railway, niente conversione lato server,
niente WhatsApp Business API).

## 2. Vincoli e principi

- **PDF generato 100% nel browser** con `jspdf` + `jspdf-autotable` (già dipendenze del progetto). Nessuna nuova libreria (rispetta regola #3 di `AGENTS.md`).
- **Nessun server, nessuna scrittura su filesystem** (su Vercel `public/` è read-only): il PDF nasce e vive nel telefono.
- **Nessun invio automatico**: l'operatore conferma la condivisione (limite gratuito accettato; vedi §9).
- TypeScript strict, zero `any`, italiano, formati data `dd/MM/yyyy` per display.
- Il PDF è **chiaro su carta/telefono**: sfondo bianco, testo scuro, accenti colore (NON il tema scuro dell'app).

## 3. Layout del PDF — Concept C ("Riepilogo + dettaglio")

Mockup di riferimento: `docs/superpowers/mockups/pdf-C-riepilogo.html` (render: `pdf-C.png`).

Struttura, dall'alto:

1. **Intestazione**: occhiello "Rapportino giornaliero · Plenzich S.p.A.", nome operatore (grande), data lavori a destra.
2. **3 riquadri statistici**: Interventi (totali) · Eseguiti (verde) · Non eseguiti (rosso).
3. **Barre "Lavorazioni svolte"**: una barra per lavorazione (crocetta) con conteggio, lunghezza proporzionale al massimo.
4. **Sezione "✓ Eseguiti (n)"**: elenco righe — `#`, nominativo, PDR, indirizzo (via · comune), attività.
5. **Sezione "✗ Non eseguiti (n)"**: elenco righe — `#`, nominativo, PDR, indirizzo, **motivo**.
6. **Piè di pagina**: "GestiLab Cantieri · Plenzich S.p.A." · data/ora generazione · numero pagina.

Impaginazione **verticale A4**. Se gli interventi sono molti, gli elenchi proseguono nelle pagine successive
(paginazione automatica di `autoTable`).

## 4. Origine dei dati (tutto già nel client)

Il form `/r/[token]` (`RapportinoForm`) ha già in stato tutto il necessario: `voci`, `campiSnapshot`, `infoCampi`,
`rapportino.staff_name`, `rapportino.data`. Nessuna fetch aggiuntiva.

| Elemento PDF | Sorgente |
|---|---|
| Nome operatore / data | `rapportino.staff_name`, `rapportino.data` |
| Totali / Eseguiti / Non eseguiti | `riepilogoRapportino(voci, campi)` → `{ totali, eseguiti, nonEseguiti }` |
| Barre lavorazioni | `riepilogo.lavorazioni` → `[{ etichetta, count }]` |
| Stato di una voce | `statoVoce(risposte, campi)` → `eseguito` / `non_eseguito` / `da_fare` |
| Righe "Eseguiti" | voci con stato `eseguito` |
| Righe "Non eseguiti" | voci con stato `non_eseguito` |
| Nominativo / PDR / via / comune / attività | `valoreInfo(voce, chiave)` (da `utils/rapportini/infoCampi.ts`) |
| **Motivo** del non eseguito | `risposte.note` (testo libero, trim) **se presente, altrimenti "Assente"** |

Nota: al momento dell'invio tutte le voci sono `eseguito` o `non_eseguito` (l'invio richiede `daFare === 0`).
Eventuali voci `da_fare` (caso anomalo) vengono ignorate dagli elenchi ma conteggiate nei totali.

## 5. Architettura — 4 file nuovi + 2 modifiche piccole

### Nuovi

- **`utils/rapportini/datiRiepilogoPdf.ts`** — *puro, testabile*.
  `costruisciDatiPdf({ staffName, dataLabel, voci, campi, infoCampi })` → struttura pronta per il layout:
  `{ staffName, dataLabel, stats, lavorazioni, eseguiti[], nonEseguiti[] }`.
  Contiene `motivoNonEseguito(risposte)` = `note` trimmato oppure `"Assente"`.
  Nessuna dipendenza da jsPDF → unit-testabile con vitest.

- **`utils/rapportini/rapportinoPdf.ts`** — *client*.
  `generaRiepilogoPdfBlob(dati): Promise<Blob>`. Import **dinamico** (`await import('jspdf')` / `jspdf-autotable`)
  così il bundle pesa solo al tocco, non al caricamento pagina. Disegna intestazione, riquadri (rettangoli),
  barre (rettangoli), e i due elenchi (`autoTable`). Ritorna un `Blob` `application/pdf`.
  Nome file: `Rapportino_<Operatore>_<YYYY-MM-DD>.pdf` (sanificato).

- **`utils/rapportini/condividiFile.ts`** — *client*.
  `condividiOScarica({ blob, filename, title, text }): Promise<'shared' | 'downloaded' | 'cancelled'>`.
  Usa `navigator.canShare({ files })` → `navigator.share(...)`; se non supportato → download via object URL;
  `AbortError` (annullo utente) → `'cancelled'` senza errore.

- **`components/modules/rapportini/CondividiPdfButton.tsx`** — *client*.
  Props: `{ staffName, dataLabel, voci, campi, infoCampi }`. Stati: *idle / generazione / fatto / errore*.
  onClick → `costruisciDatiPdf` → `generaRiepilogoPdfBlob` → `condividiOScarica`.

### Modifiche

- **`components/modules/rapportini/RapportinoLista.tsx`** — rende `<CondividiPdfButton/>` dentro il box
  "Rapportino inviato ✓" ([righe ~107](../../../components/modules/rapportini/RapportinoLista.tsx)).
  Riceve `voci`, `campi`, `infoCampi` come nuove prop.

- **`components/modules/rapportini/RapportinoForm.tsx`** — passa `voci`, `campi`, `infoCampi` (già disponibili)
  a `RapportinoLista`. Nessun'altra modifica di logica.

## 6. Flusso UX (due tocchi)

1. L'operatore compila → tocca **"Invia rapportino"** → POST `/api/r/[token]/invia` → stato `inviato`.
2. Compare il box "Rapportino inviato ✓" con il pulsante **"📄 Condividi PDF su WhatsApp"**.
3. Tocco → genera PDF nel telefono → si apre il **menù di condivisione nativo** → l'operatore sceglie WhatsApp e la chat → invia.

Il pulsante è presente nel box "inviato" sia **subito dopo l'invio** sia **riaprendo** un rapportino già inviato
(la pagina ricarica le voci anche con stato `inviato`). Questo permette di **provarlo senza modificare il DB**.

## 7. Condivisione e fallback

- Mobile moderno (Android Chrome, iOS Safari 15+): `navigator.share({ files:[pdf], title, text })`.
- Desktop / browser senza file-share: **download** del PDF (l'operatore lo allega a mano).
- Annullo da parte dell'operatore: nessun messaggio d'errore.

## 8. Gestione errori

- Generazione PDF fallita → stato "errore" sul pulsante, testo "Riprova"; non blocca la pagina.
- `navigator.share` non disponibile → fallback download automatico (nessun errore mostrato).
- `AbortError` → trattato come annullo, silenzioso.

## 9. Fuori scope

- Invio automatico su WhatsApp (richiede WhatsApp Business API a pagamento).
- ALLEGATO 10 / conversione Word→PDF.
- Generazione PDF lato server.
- Modifiche al flusso di invio o alla logica di business esistente.

## 10. Test

**Automatici (vitest):**
- `datiRiepilogoPdf`: conteggi (totali/eseguiti/non eseguiti), composizione gruppi, `motivoNonEseguito` (nota presente → nota; nota assente → "Assente").
- Sanificazione del nome file.

**Verifiche locali pre-push:** `npm run build` / typecheck; `npx eslint` **sui soli file nuovi** (la baseline lint è già rossa).

**Manuali sul telefono (anteprima Vercel):**
- Generazione PDF dal rapportino inviato; condivisione reale su WhatsApp; correttezza dei dati.
- Riapertura di un rapportino già inviato → pulsante presente e funzionante.
- Fallback download su desktop.

## 11. Rollout sicuro (priorità: non rallentare gli operatori)

1. Sviluppo sul branch **`feat/rapportino-condividi-whatsapp`** (da `main`): il wp2b non finito resta fuori dalla produzione.
2. Verifiche locali (build/lint/test).
3. `git push origin feat/rapportino-condividi-whatsapp` → **Vercel crea un URL di anteprima HTTPS**.
4. Test sul telefono dall'URL di anteprima (gli operatori restano sulla produzione attuale, intatta).
5. Solo dopo l'OK dell'utente: **merge ff in `main`** → deploy in produzione → il pulsante diventa visibile agli operatori.

## 12. File toccati (riepilogo)

```
Nuovi:
  utils/rapportini/datiRiepilogoPdf.ts            (+ .test.ts)
  utils/rapportini/rapportinoPdf.ts
  utils/rapportini/condividiFile.ts
  components/modules/rapportini/CondividiPdfButton.tsx
Modificati:
  components/modules/rapportini/RapportinoLista.tsx
  components/modules/rapportini/RapportinoForm.tsx
Artefatti di design:
  docs/superpowers/mockups/pdf-{A,B,C}-*.html + pdf-{A,B,C}.png
```
