# Rapportini — Template con informazioni dinamiche + export dinamico

- **Data:** 2026-06-03
- **Stato:** Design approvato — pronto per il piano
- **Approccio scelto:** 1 — colonna `info_campi` separata + modulo "sorgente di verità"

## 1. Contesto e problema

Oggi un `rapportino_template` definisce **solo i campi compilabili** dall'operatore
(`campi` jsonb: `crocetta | testo | select | numero`). Le **informazioni anagrafiche**
mostrate nel rapportino sono invece fisse e hardcoded:

- 11 colonne in `rapportino_voci` (`nominativo, matricola, pdr, odsin, via, comune,
  cap, recapito, attivita, accessibilita, fascia_oraria`) — migration
  `supabase/migrations/20260502000000_rapportini_interattivi.sql`.
- Renderizzate fisse in `components/modules/rapportini/RapportinoForm.tsx:333-345`
  (mostra solo quelle valorizzate).
- Export Excel con layout fisso A–Q in `lib/rapportini/exportStandard.ts`
  (+ pagine `clientela`/`massiva` + `exportDistribution` nella Mappa).

Inoltre la colonna `MATRICOLA` del formato "Export Dati" **non viene letta** dal parser
(`utils/routing/excelParser.ts:153` → `matricola: null`): la matricola resta vuota anche
quando presente nel file importato.

**Obiettivo:** rendere configurabile per-template **quali informazioni del DB** appaiono nel
rapportino (oltre ai campi compilabili già esistenti), con ordine ed etichetta, e far sì che
la scelta si rifletta sia nel **rapportino elettronico** sia nell'**export Excel**.

## 2. Obiettivi / Non-obiettivi

### Obiettivi
- Editor template: scegliere quali degli 11 campi anagrafici mostrare, con **ordine** ed
  **etichetta personalizzabile** (così si possono usare i nomi del committente).
- Rapportino elettronico (`/r/[token]`): mostra solo i campi scelti, nell'ordine scelto.
- Export Excel **server** (`/api/mappa/rapportini/export`) e **ZIP pianificazione**
  (`exportDistribution`): colonne = info scelte (in ordine) + `ORDINE` + campi compilabili.
- Prerequisito: il parser legge `MATRICOLA` dal formato "Export Dati"; il template
  scaricabile include la colonna.
- Retrocompatibilità totale: template/rapportini esistenti continuano a funzionare
  (fallback agli 11 campi attuali).

### Non-obiettivi (follow-up)
- Export `app/hub/rapportini/clientela` e `massiva`: partono da file committente caricati,
  non da un rapportino+template → restano col layout fisso attuale.
- Allargare il pool oltre gli 11 (campi extra da `interventi`: contratto, utenza, lettura,
  diametro, sigillo…).
- Interleaving arbitrario tra info e campi compilabili: restano **due blocchi distinti**
  (info → `ORDINE` → compilabili).

## 3. Modello dati

### Migration nuova — `supabase/migrations/20260603000000_rapportini_info_campi.sql`
```sql
alter table rapportino_template
  add column if not exists info_campi jsonb not null default '[]';
alter table rapportini
  add column if not exists info_snapshot jsonb not null default '[]';

-- Seed: il template Standard mostra gli 11 campi nell'ordine attuale (comportamento invariato)
update rapportino_template
set info_campi = '[
  {"chiave":"nominativo","etichetta":"NOMINATIVO","ordine":1},
  {"chiave":"matricola","etichetta":"MATRICOLA","ordine":2},
  {"chiave":"pdr","etichetta":"PDR","ordine":3},
  {"chiave":"odsin","etichetta":"ODSIN","ordine":4},
  {"chiave":"via","etichetta":"VIA","ordine":5},
  {"chiave":"comune","etichetta":"COMUNE","ordine":6},
  {"chiave":"cap","etichetta":"CAP","ordine":7},
  {"chiave":"recapito","etichetta":"RECAPITO","ordine":8},
  {"chiave":"attivita","etichetta":"ATTIVITA","ordine":9},
  {"chiave":"accessibilita","etichetta":"ACCESSIBILITA","ordine":10},
  {"chiave":"fascia_oraria","etichetta":"FASCIA ORARIA","ordine":11}
]'::jsonb
where is_default = true and (info_campi is null or info_campi = '[]'::jsonb);
```

### Tipi — in `utils/rapportini/infoCampi.ts`
```ts
export type InfoChiave =
  | 'nominativo' | 'matricola' | 'pdr' | 'odsin' | 'via'
  | 'comune' | 'cap' | 'recapito' | 'attivita' | 'accessibilita' | 'fascia_oraria';

export interface TemplateInfoCampo {
  chiave: InfoChiave;
  etichetta: string;
  ordine: number;
}
```
Semantica: presenza nell'array = campo **visibile**; `ordine` = posizione colonna/riga;
`etichetta` = nome mostrato (header Excel + label nel form).

## 4. Modulo sorgente-di-verità — `utils/rapportini/infoCampi.ts`

Unica definizione delle colonne info, usata da form **e** da tutti gli export (evita divergenze).

- `INFO_CAMPI_DISPONIBILI: { chiave: InfoChiave; etichettaDefault: string }[]` — gli 11 con
  etichetta default (`NOMINATIVO, MATRICOLA, PDR, ODSIN, VIA, COMUNE, CAP, RECAPITO,
  ATTIVITA, ACCESSIBILITA, FASCIA ORARIA`).
- `resolveInfoCampi(snapshot: TemplateInfoCampo[] | null | undefined): TemplateInfoCampo[]`
  — filtra a chiavi note, ordina per `ordine`; se snapshot **vuoto/null → ritorna tutti gli
  11** con etichette default (fallback = comportamento attuale).
- `valoreInfo(voce, chiave): string` — estrae il valore dal record voce (la voce usa già
  `via` per l'indirizzo).

## 5. Componenti e modifiche per file

### 5.1 Editor — `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`
- Nuova sezione **"Informazioni da mostrare"**: lista degli 11 `INFO_CAMPI_DISPONIBILI`,
  ciascuno con: checkbox visibile, input etichetta (default = `etichettaDefault`, attivo se
  selezionato), ▲▼ per l'ordine tra i selezionati.
- Stato `infoCampi: TemplateInfoCampo[]`; al load del template pre-compila (snapshot vuoto ⇒
  tutti gli 11 di default così l'admin vede lo stato effettivo).
- `handleSave` include `info_campi` nel payload.

### 5.2 API — `app/api/admin/rapportino-template/route.ts`
- Zod: `InfoCampoSchema = { chiave: z.enum([...11]), etichetta: z.string().min(1),
  ordine: z.number().int() }`.
- `TemplateSchema` aggiunge `info_campi: z.array(InfoCampoSchema).default([])`.
- POST/PATCH persistono `info_campi`; GET aggiunge `info_campi` alla select.

### 5.3 Generazione — `app/api/mappa/rapportini/genera/route.ts`
- Select template: aggiungere `info_campi`.
- Insert/Update rapportino: salvare `info_snapshot: tpl.info_campi` accanto a `campi_snapshot`.

### 5.4 Rapportino elettronico — `app/r/[token]/page.tsx` + `RapportinoForm.tsx`
- `page.tsx`: select `info_snapshot`; passare `infoCampi` (snapshot) al form.
- `RapportinoForm.tsx`: sostituire l'array `anagrafica` hardcoded (righe 333-345) con
  `resolveInfoCampi(infoCampi)` → `{ label: c.etichetta, value: valoreInfo(voce, c.chiave) }`,
  filtrando i vuoti.

### 5.5 Export Excel
- `lib/rapportini/exportStandard.ts`: unificare in **un solo builder dinamico**
  `buildRapportinoXlsx(rap, voci)`:
  - header riga 6 = `resolveInfoCampi(rap.info_snapshot).etichetta[]` + `ORDINE`
    + `campi_snapshot.etichetta[]`;
  - righe da riga 7 = `valoreInfo(voce, chiave)` + ordine + `risposte[campoChiave]`
    (crocetta → `X`, note in coda);
  - mantiene il blocco header `Rapportino.xlsx` (B2 = data, B4 = operatore) e auto-larghezza;
  - **rimuove** la dicotomia `isStandardSnapshot` / Standard / Generic (un solo path).
- `app/api/mappa/rapportini/export/route.ts`: `RAP_COLS` aggiunge `info_snapshot`; usa il
  builder unico.
- `components/modules/mappa/MappaOperatoriClient.tsx` `exportDistribution`: header/righe da
  `resolveInfoCampi(template scelto)` invece dei 17 fissi. Il template di riferimento è quello
  selezionato per "genera rapportini"; se assente, config default (gli 11).

### 5.6 Prerequisito matricola — `utils/routing/excelParser.ts` + Mappa
- Ramo "Export Dati" (~righe 140-158): `matricola: findCol(headers, [/^matricola$/, /matricola/])`
  invece di `null`.
- `downloadTemplate` (`MappaOperatoriClient.tsx:2125`): aggiungere `MATRICOLA` agli header
  ed esempi del template scaricabile.

## 6. Flusso dati (end-to-end)
```
Import Excel (con MATRICOLA)
  → parseExcelToTasks (legge matricola)
  → Task → taskToVoce → rapportino_voci.matricola
  → [template.info_campi → genera → rapportini.info_snapshot]
  → resolveInfoCampi → RapportinoForm (mostra) + export builder (colonna Excel)
```

## 7. Retrocompatibilità
- `info_campi` / `info_snapshot` default `[]` → `resolveInfoCampi([])` = gli 11 → identico a oggi.
- Rapportini già inviati (senza `info_snapshot`) → fallback agli 11.
- Template Standard seedato con gli 11 → l'editor mostra lo stato effettivo.
- Export con config default → replica l'attuale layout A–Q (+ `ORDINE` + esiti).

## 8. Testing (vitest)
- `utils/rapportini/infoCampi.test.ts`: `resolveInfoCampi` (vuoto → 11; ordina per `ordine`;
  rispetta etichette custom; ignora chiavi sconosciute); `valoreInfo`.
- Export builder: header/righe dinamiche con config custom **e** con fallback.
- `utils/routing/excelParser`: ramo "Export Dati" legge `MATRICOLA` se presente, `''` se assente.
- Regression: `buildVoci` / `excelMapping` invariati.

## 9. Rischi / note
- `exportDistribution` avviene in pianificazione: garantire un template di riferimento
  (quello scelto in "genera rapportini") o config default.
- Formattazione `Rapportino.xlsx`: con colonne dinamiche lo styling oltre le celle scritte
  potrebbe non combaciare al 100% → accettabile (funzionale).
- `ORDINE` resta colonna fissa calcolata (non selezionabile), posta tra info e compilabili.
