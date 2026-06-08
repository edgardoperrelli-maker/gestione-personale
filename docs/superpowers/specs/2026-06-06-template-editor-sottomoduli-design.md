# Editor template a sotto-moduli con anteprima per sezione — Design

**Data:** 2026-06-06
**Branch proposto:** `feat/template-editor-sottomoduli` (da `main`)
**Stato:** approvato in brainstorming, in attesa di review spec

---

## 1. Obiettivo

Rendere l'editor del template rapportini (*Impostazioni → Template rapportini*) più chiaro per le modifiche, sostituendo l'unica anteprima grande con **4 sotto-moduli**, ognuno con i propri controlli + un'**anteprima focalizzata** della parte di card che produce. Così, mentre componi una sezione, vedi subito l'effetto su quella parte.

Confermato con l'utente: 4 sotto-moduli (Titolo, Header intervento, Dettagli anagrafici, Campi da compilare); il sotto-modulo Header è **anteprima + toggle COORDINATE** (indirizzo/fascia sono dati fissi dall'import, non configurabili).

Ambito: `components/modules/rapportini/` (scorporo parti di `VoceCard`) + `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`. Nessuna modifica a API/DB/Excel/comportamento operatore. Nessuna nuova dipendenza.

## 2. I 4 sotto-moduli

| Sotto-modulo | Controlli (riusano quelli esistenti) | Anteprima focalizzata |
|---|---|---|
| **1. Titolo voce** | lista `titolo_campi` ("Intestazione della card") | la riga del titolo |
| **2. Header intervento** | toggle del campo **COORDINATE** *(indirizzo/fascia: dati fissi, solo anteprima)* | indirizzo + "Punto esatto" + fascia |
| **3. Dettagli anagrafici** | lista `info_campi` ("Informazioni da mostrare") — **nota:** guida i Dettagli *e* le colonne dell'Excel | la card "Dettagli anagrafici" |
| **4. Campi da compilare** | editor campi crocetta/testo/select/numero | i campi / "Lavorazioni" |

In cima restano, come campi semplici (senza anteprima): **Nome template** e **Committente**.

L'**anteprima unica grande** (sticky) introdotta in precedenza viene **rimossa**: la sua funzione è distribuita nelle 4 anteprime di sezione.

**Coordinate:** il toggle COORDINATE vive nel sotto-modulo Header; quindi la lista `info_campi` del sotto-modulo Dettagli **esclude** `coordinate` (coerente con la card, dove la coordinata è il link "Punto esatto" nell'header, non una riga dei dettagli).

## 3. Architettura

### 3.1 Scorporo di `VoceCard` in parti riutilizzabili (iso-resa operatore)

Oggi `VoceCard` ([components/modules/rapportini/VoceCard.tsx](../../../components/modules/rapportini/VoceCard.tsx)) renderizza l'intera `<section>`. Estraggo le 3 parti principali in sotto-componenti **puramente visivi**, nello stesso file o accanto:

```tsx
// Parti della card, riusate da VoceCard (operatore) e dalle anteprime dei sotto-moduli.
export function VoceTitolo({ voce, titoloCampi, indice }): JSX.Element        // <h1>{titoloVoce(...)}</h1>
export function VoceHeaderInfo({ voce, coordinataAbilitata }): JSX.Element     // blocco indirizzo + Punto esatto + fascia
export function VoceDettagli({ voce, dettaglio }): JSX.Element                 // <details> Dettagli anagrafici (esclude coordinate)
export function VoceCampi({ campi, voce, disabilitato, onChange }): JSX.Element // campi "altri" + crocette "Lavorazioni"
```

`VoceCard` ricompone esattamente come ora:
```tsx
<section className={... bordo}>
  <div className="flex ..."><VoceTitolo .../>{headerRight}</div>
  {badge && (...)}
  <VoceHeaderInfo .../>
  <VoceDettagli .../>
  <VoceCampi .../>
</section>
```
**La resa per l'operatore deve restare identica** (stesso markup/classi): `VoceFocus`→`VoceCard` invariati nel risultato.

### 3.2 I 4 sotto-moduli nell'editor

In `TemplateRapportiniClient.tsx`, ogni sezione editor diventa una card che contiene **controlli + anteprima** (l'anteprima usa la parte corrispondente di 3.1 con i dati d'esempio `SAMPLE_VOCE_INFO`/`sampleRisposte`):

- **1. Titolo voce** = i controlli `titolo_campi` esistenti + `<VoceTitolo>` su `anteprimaVoce`.
- **2. Header intervento** = un toggle "Mostra coordinate (Punto esatto)" che fa `toggleInfo('coordinate')` + nota che indirizzo/fascia arrivano dall'import + `<VoceHeaderInfo>` su `anteprimaVoce` (con `coordinataAbilitata` derivato dal fatto che `coordinate` sia in `info_campi`).
- **3. Dettagli anagrafici** = l'editor `info_campi` esistente, **filtrato per nascondere `coordinate`** dalla lista e dal picker (gestito nell'Header) + `<VoceDettagli>` su `anteprimaVoce` con `dettaglio = partitionInfoCampi(infoCampi).dettaglio`.
- **4. Campi da compilare** = l'editor campi esistente + `<VoceCampi>` su `anteprimaVoce`.

Ogni anteprima è incorniciata in un riquadro chiaro (bordo/sfondo) e marcata "Anteprima".

### 3.3 Stato e reattività

Nessun nuovo stato: i sotto-moduli leggono `titoloCampi`, `infoCampi`, `campi` già esistenti. `anteprimaVoce = { ...SAMPLE_VOCE_INFO, risposte: sampleRisposte(campi) }` e `anteprimaDettaglio = partitionInfoCampi(infoCampi).dettaglio` come ora. Le anteprime si aggiornano live perché derivano dallo stato.

## 4. File toccati

```
Modificati:
  components/modules/rapportini/VoceCard.tsx
    - scorporo VoceTitolo / VoceHeaderInfo / VoceDettagli / VoceCampi; VoceCard li ricompone (iso-resa)
  app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx
    - rimuove l'anteprima unica; ristruttura in 4 sotto-moduli (controlli + anteprima di parte)
    - Header: toggle COORDINATE; Dettagli: lista info_campi senza 'coordinate'
```

Nessuna modifica a `VoceFocus.tsx` (continua a usare `VoceCard`), né ad API/DB/Excel.

## 5. Test

**Automatici (vitest):** la logica pura (sampleVoce, partitionInfoCampi, valoreInfo) è già coperta. Lo scorporo è visivo → nessun nuovo unit test sui componenti (no infrastruttura React nel repo).

**Manuali/verifica:**
- **Iso-resa operatore:** `/r/[token]` scheda voce **identica** a prima (titolo, header, dettagli, lavorazioni, badge).
- **Editor:** i 4 sotto-moduli mostrano controlli + anteprima della propria parte; ogni anteprima si aggiorna modificando la sezione (titolo, toggle coordinate nell'Header, campi info nei Dettagli, campi da compilare).
- **Coordinate:** il toggle nel sotto-modulo Header attiva/disattiva il "Punto esatto" nell'anteprima Header; `coordinate` non compare nella lista del sotto-modulo Dettagli.
- `tsc` pulito; `npm run build` ok; `eslint` senza nuovi problemi sui file toccati.

## 6. Fuori scope

- Rendere configurabili indirizzo/fascia dell'header (sono dati d'import).
- Spaccare il modello `info_campi` per assegnare i campi a header vs dettagli (resta lo split automatico per `INFO_PRIMARI`).
- Modifiche all'Excel/viste ufficio.

## 7. Rollout

Branch `feat/template-editor-sottomoduli` da `main`: verifiche locali (tsc/lint/test/build) → su OK utente, deploy ff in `main` (Vercel).
