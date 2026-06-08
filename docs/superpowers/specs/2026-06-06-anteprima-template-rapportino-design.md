# Anteprima live del template rapportino (scheda operatore) — Design

**Data:** 2026-06-06
**Branch:** `fix/template-save-coordinate-400` (riusa lo stesso branch: deploy insieme al fix del 400 sul salvataggio template, lavoro coeso sull'editor)
**Stato:** approvato in brainstorming, in attesa di review spec

---

## 1. Obiettivo

Nelle *Impostazioni → Template rapportini*, mostrare una **anteprima live** di come apparirà il rapportino all'operatore, **aggiornata mentre l'admin compone il template** (campi info, ordine, etichette, intestazione/titolo, campi crocetta/testo/select/numero). Scopo: rendere più facile e immediata la composizione del template, vedendo subito l'effetto delle scelte.

Decisioni confermate con l'utente:
- L'anteprima mostra la **scheda digitale dell'operatore** (non la tabella Excel).
- Deve essere **identica** a ciò che vede l'operatore → si estrae il contenuto della card da `VoceFocus` in un **componente condiviso**, usato sia dall'operatore sia dall'anteprima (niente divergenza nel tempo).

Ambito: `components/modules/rapportini/` (estrazione card) + l'editor `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`. Nessuna nuova dipendenza. Nessuna modifica al comportamento dell'operatore (solo refactor visivo a iso-resa).

## 2. Cosa mostra l'anteprima

Una card identica a quella dell'operatore, con **dati d'esempio fissi e realistici**:
- **Titolo** della voce (dal primo campo non vuoto di *Intestazione card* / `titolo_campi`).
- **Indirizzo** (via + comune) cliccabile e, se il campo **COORDINATE** è selezionato, il link **"Punto esatto"** sulla coordinata d'esempio → dimostra subito l'effetto del campo coordinate.
- **Fascia oraria**.
- **Dettagli anagrafici**: i campi info selezionati (esclusi i primari) con etichette correnti e valori d'esempio, nell'ordine scelto.
- **Lavorazioni / campi**: i campi crocetta/testo/select/numero del template, con risposte d'esempio (crocette alternate spuntate, testo "esempio", numero "1", select = prima opzione).

Si aggiorna **live**: legge gli stessi stati dell'editor (`titoloCampi`, `infoCampi`, `campi`) → reattiva, nessun salvataggio necessario per vederla.

## 3. Architettura

### 3.1 Estrazione: `VoceCard` (nuovo, condiviso)

Oggi `VoceFocus.tsx` ([:52](../../../components/modules/rapportini/VoceFocus.tsx)) contiene sia il **layout a tutto schermo** (nav alto "Tutti gli interventi" + contatore, area scroll, barra bottoni in basso) sia la **card** (`<section>` con titolo, indirizzo/coordinata, dettagli, lavorazioni).

Estraggo la **sola card** (`<section>`, righe ~63-116) in un nuovo componente:

```tsx
// components/modules/rapportini/VoceCard.tsx
export function VoceCard({
  voce, indice, campi, dettaglio, titoloCampi,
  stato, disabilitato, onChange, headerRight,
}: {
  voce: VoceFocusData;
  indice: number;
  campi: TemplateCampo[];
  dettaglio: TemplateInfoCampo[];
  titoloCampi: InfoChiave[];
  stato: StatoVoce;
  disabilitato: boolean;
  onChange: (chiave: string, valore: unknown) => void;
  headerRight?: React.ReactNode; // SaveBadge (operatore) | niente (anteprima)
}): JSX.Element
```

- Contiene la logica già presente in `VoceFocus`: `titolo = titoloVoce(...)`, `indirizzo`, `coordinata`, `coordinataAbilitata = dettaglio.some(c => c.chiave === 'coordinate')`, `dett` (esclude coordinate), `crocette`/`altri`, bordo per `stato`, e i link Maps (indirizzo + "Punto esatto").
- `headerRight` rimpiazza il `SaveBadge` hardcoded: l'operatore passa `<SaveBadge state={saveState} />`, l'anteprima non passa nulla.

### 3.2 `VoceFocus` usa `VoceCard`

`VoceFocus` resta il wrapper a tutto schermo (nav alto + scroll + barra bottoni) e renderizza `<VoceCard ... headerRight={<SaveBadge state={saveState} />} />` al posto della `<section>` inline. **Resa identica a prima** (solo spostamento del markup). Le sue prop e callback (onPrev/onNext/onClose, salvataggio) restano dov'erano.

### 3.3 Anteprima nell'editor — `TemplateRapportiniClient.tsx`

Nuovo pannello **"Anteprima operatore"**, **sticky in cima** alla colonna editor (resta visibile mentre si scorre/modifica sotto). Renderizza `<VoceCard>` con:
- `voce` = `sampleVoce` (vedi 3.4) — un oggetto `VoceFocusData` con valori d'esempio per tutti i campi info + coordinata + `risposte` d'esempio.
- `campi` = lo stato `campi` corrente dell'editor (ordinati).
- `dettaglio` = `partitionInfoCampi(infoCampi).dettaglio` (stato `infoCampi` corrente).
- `titoloCampi` = stato `titoloCampi` corrente.
- `disabilitato = true` (sola lettura), `onChange` = no-op, nessun `headerRight`.

Così l'anteprima riflette **in tempo reale** ordine/etichette/selezione dei campi.

### 3.4 Dati d'esempio (nuovo `utils/rapportini/sampleVoce.ts`, puro e testabile)

```ts
export const SAMPLE_VOCE_INFO = {
  nominativo: 'Mario Rossi', matricola: 'MAT0012345', pdr: '00594202203925',
  odl: '20043151148', via: 'VIA ROMA 1', comune: 'Roma', cap: '00184',
  recapito: '333 1234567', attivita: 'S-PR-007', accessibilita: 'Libero',
  fascia_oraria: '08:00-10:00', coordinate: '41.853305, 12.782855',
};
/** Risposte d'esempio per i campi del template (per far vedere la card "piena"). */
export function sampleRisposte(campi: TemplateCampo[]): Record<string, unknown> { /* crocette alternate, testo 'esempio', numero '1', select opzioni[0] */ }
```

L'anteprima costruisce `sampleVoce = { id: 'preview', ordine: 1, ...SAMPLE_VOCE_INFO, risposte: sampleRisposte(campi) }`.

### 3.5 Note
- I link Maps nell'anteprima restano funzionanti (aprono Maps sui dati d'esempio) — innocuo; non vale la pena disabilitarli.
- La `colonneVisibili`/Excel non c'entra: l'anteprima è la **scheda**, non la tabella.

## 4. File toccati

```
Nuovi:
  components/modules/rapportini/VoceCard.tsx        (card estratta, condivisa)
  utils/rapportini/sampleVoce.ts                    (+ sampleVoce.test.ts: sampleRisposte)
Modificati:
  components/modules/rapportini/VoceFocus.tsx        (usa <VoceCard>, resa invariata)
  app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx
    - pannello "Anteprima operatore" sticky che renderizza <VoceCard> con sampleVoce + stati live
    - import di partitionInfoCampi, VoceCard, SAMPLE_VOCE_INFO/sampleRisposte
```

Nessuna modifica a API, DB, export Excel, viste ufficio.

## 5. Test

**Automatici (vitest):**
- `utils/rapportini/sampleVoce.test.ts`: `sampleRisposte` genera un valore coerente per ogni tipo (crocetta→boolean, testo→stringa, numero→stringa numerica, select→prima opzione); template vuoto → `{}`.

**Manuali/verifica:** i componenti React non hanno infrastruttura di test nel repo → `tsc` + verifica visiva. **Iso-resa operatore:** confronto che il rapportino digitale (`/r/[token]`) appaia **identico** a prima dell'estrazione (la `VoceCard` non deve cambiare nulla per l'operatore). **Anteprima:** selezionando/riordinando/rinominando campi e attivando COORDINATE, la card si aggiorna di conseguenza e mostra il link "Punto esatto".

## 6. Fuori scope

- Anteprima tabella/Excel (scelto: solo scheda operatore).
- Dati d'esempio configurabili dall'utente (sono fissi).
- Interattività dell'anteprima (è sola lettura).
- Modifiche al comportamento reale dell'operatore.

## 7. Rollout

Sullo stesso branch del fix 400 (`fix/template-save-coordinate-400`): verifiche locali (tsc/lint/test) → su OK utente, deploy ff in `main` (Vercel) **insieme** al fix del salvataggio template (400). Così l'utente riceve in un colpo: salvataggio COORDINATE funzionante + anteprima di composizione.
