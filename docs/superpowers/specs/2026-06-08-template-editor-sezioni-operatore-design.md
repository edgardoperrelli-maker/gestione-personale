# Editor template: sotto-moduli mappati sulle schermate operatore — Design

**Data:** 2026-06-08
**Branch proposto:** `feat/template-editor-sezioni-operatore` (da `main`)
**Stato:** approvato in brainstorming, in attesa di review spec

---

## 1. Obiettivo

Rimappare i 4 sotto-moduli dell'editor template sulle **schermate reali dell'operatore**, ognuno con controlli + anteprima della parte corrispondente:

1. **Card nella lista interventi** — la riga nella lista (`RapportinoLista`).
2. **Dettaglio card** — la testata della card aperta (titolo + indirizzo + "Punto esatto" + fascia).
3. **Dettaglio anagrafica** — la card "Dettagli anagrafici".
4. **Lista azioni da fare** — i campi da compilare (ESEGUITO / NOTE / LAVORAZIONI).

Sostituisce l'attuale impianto (Titolo voce / Header intervento / Dettagli anagrafici / Campi da compilare). Confermato con l'utente.

Ambito: `components/modules/rapportini/` (scorporo riga lista) + `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`. Nessuna modifica a API/DB/Excel/comportamento operatore. Nessuna nuova dipendenza.

## 2. I 4 sotto-moduli

| # | Sotto-modulo | Controlli | Anteprima |
|---|---|---|---|
| 1 | **Card nella lista interventi** | lista `titolo_campi` (il titolo) | la riga in lista: n° + titolo + attività·fascia + indirizzo + chip stato |
| 2 | **Dettaglio card** | toggle **COORDINATE** | testata card aperta: titolo + indirizzo (link) + "Punto esatto" + fascia |
| 3 | **Dettaglio anagrafica** | lista `info_campi` (ordine/etichette) — guida anche le colonne Excel | la card "Dettagli anagrafici" |
| 4 | **Lista azioni da fare** | editor campi crocetta/testo/select/numero/foto | i campi: ESEGUITO / NOTE / LAVORAZIONI |

In cima restano **Nome template** e **Committente** (campi semplici, senza anteprima).

**Titolo condiviso:** `titolo_campi` determina il titolo sia nella riga-lista sia nella card-dettaglio. I **controlli del titolo stanno nel sotto-modulo 1**; il sotto-modulo 2 lo **mostra** (riflette le scelte, reattivo) e aggiunge solo il toggle COORDINATE.

**Coordinate:** il toggle vive nel sotto-modulo 2; la lista `info_campi` del sotto-modulo 3 continua a **escludere** `coordinate` (com'è già oggi).

## 3. Architettura

### 3.1 Scorporo della riga lista: `RigaVoceCard` (iso-resa operatore)

Oggi `RapportinoLista` ([components/modules/rapportini/RapportinoLista.tsx:96-140](../../../components/modules/rapportini/RapportinoLista.tsx)) renderizza inline la riga (`<button>` con numero, titolo, attività·fascia, indirizzo, chip stato, badge Annullato/Nuovo/manuale, chevron). Estraggo la **riga** in un componente esportato dallo stesso file:

```tsx
// in RapportinoLista.tsx — riusato dall'editor per l'anteprima
export function RigaVoceCard({ riga, onApri }: { riga: RigaVoce; onApri: (index: number) => void }) { /* il <button> attuale, con chip/bordo/num calcolati internamente da riga */ }
```

`RapportinoLista` mappa `visibili` rendendo `<RigaVoceCard key={r.index} riga={r} onApri={onApri} />`. **Resa identica** per l'operatore (solo spostamento del markup).

### 3.2 Anteprime nell'editor

In `TemplateRapportiniClient.tsx`, ogni sotto-modulo usa `AnteprimaBox` (già esistente) con la parte giusta su dati d'esempio:

- **1. Card nella lista** = controlli `titolo_campi` + `<RigaVoceCard riga={anteprimaRiga} onApri={() => {}} />`.
- **2. Dettaglio card** = toggle COORDINATE + `<VoceTitolo>` e `<VoceHeaderInfo>` (titolo + header), già scorporati da `VoceCard`.
- **3. Dettaglio anagrafica** = editor `info_campi` (invariato, `coordinate` esclusa) + `<VoceDettagli voce={anteprimaVoce} dettaglio={anteprimaDettaglio} />`.
- **4. Lista azioni da fare** = editor campi (invariato) + `<VoceCampi campi={campi} voce={anteprimaVoce} disabilitato onChange={() => {}} />`.

### 3.3 Riga d'esempio per l'anteprima 1

```ts
const anteprimaRiga: RigaVoce = {
  index: 0,
  titolo: titoloVoce(anteprimaVoce, titoloCampi, 0),
  sub: [SAMPLE_VOCE_INFO.via, SAMPLE_VOCE_INFO.comune].filter(Boolean).join(' · '),
  attivita: SAMPLE_VOCE_INFO.attivita,
  fascia: SAMPLE_VOCE_INFO.fascia_oraria,
  stato: 'da_fare',
};
```
(`titoloVoce` importato da `infoCampi`; `RigaVoce` da `RapportinoLista`.) Reattivo: cambia con `titolo_campi`.

### 3.4 Mappa dal vecchio al nuovo impianto

- "Titolo voce" → **1. Card nella lista** (controlli titolo invariati; anteprima: da card intera → **riga lista**).
- "Header intervento" → **2. Dettaglio card** (toggle coordinate invariato; anteprima: da solo header → **titolo + header**).
- "Dettagli anagrafici" → **3. Dettaglio anagrafica** (rinomina; anteprima invariata `VoceDettagli`).
- "Campi da compilare" → **4. Lista azioni da fare** (rinomina; anteprima invariata `VoceCampi`).

## 4. File toccati

```
Modificati:
  components/modules/rapportini/RapportinoLista.tsx
    - scorpora ed esporta RigaVoceCard; la lista lo usa (iso-resa)
  app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx
    - 4 sotto-moduli rimappati: titoli/anteprime nuovi; import RigaVoceCard + RigaVoce + titoloVoce
    - anteprimaRiga d'esempio
```

Nessuna modifica a API/DB/Excel; `RapportinoForm` (che usa `RapportinoLista`) resta invariato.

## 5. Test

**Automatici (vitest):** logica pura già coperta; scorporo visivo → nessun nuovo unit test (no infra React).

**Manuali/verifica:**
- **Iso-resa operatore:** la **lista** `/r/[token]` e la **card** restano identiche.
- **Editor:** i 4 sotto-moduli mostrano controlli + anteprima della rispettiva schermata; ognuno reattivo (titolo → riga lista + testata card; toggle coordinate → "Punto esatto"; campi info → dettagli; campi → azioni).
- `tsc` pulito; `npm run build` ok; `eslint` senza nuovi problemi sui file toccati.

## 6. Fuori scope

- Rendere configurabili attività/fascia/indirizzo della riga (dati d'import).
- Modifiche a Excel/viste ufficio/comportamento operatore.

## 7. Rollout

Branch `feat/template-editor-sezioni-operatore` da `main`: verifiche locali (tsc/lint/test/build) → su OK utente, deploy ff in `main` (Vercel).
