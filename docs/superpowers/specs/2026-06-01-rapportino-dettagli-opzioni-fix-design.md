# Design — Fix rapportino digitale (dettagli completi) + opzioni template

- **Data:** 2026-06-01
- **Stato:** in attesa di revisione utente
- **Autore:** Edgardo Perrelli (con Claude)
- **Stack:** Next.js 15 · React 19 · Supabase · TypeScript · Tailwind 4 · xlsx · Vitest
- **Collegato a:** [Gestione pianificazioni & rapportini](2026-06-01-gestione-pianificazioni-rapportini-design.md)

---

## 1. Contesto e obiettivo

Testando il rapportino digitale (`/r/[token]`) in produzione emergono tre problemi:

1. **Dati intervento troncati/incompleti.** L'indirizzo è tagliato ("VIA CANCELLATA G…") e alcune info utili (tipo/attività, ODS) non compaiono. L'operatore deve vedere i dati **completi e leggibili**: tipo/attività, ODS, PDR, indirizzo completo, CAP, comune, fascia oraria, nominativo cliente. I campi **non valorizzati non vanno mostrati**.
2. **Inserimento opzioni del template rotto.** Nell'editor template, il campo "Selezione" non permette di inserire la virgola (sparisce a ogni battitura) e l'Invio non separa → risultato "SI.NO" come opzione unica invece di "SI" e "NO".

## 2. Cause (verificate nel codice)

- **Troncamento:** `components/modules/rapportini/RapportinoForm.tsx` — i valori dell'anagrafica usano `className="truncate"` (riga ~370), quindi l'indirizzo è tagliato.
- **Attività/ODS mancanti (formato "Export Dati"):** `utils/routing/excelParser.ts` — nel ramo "Export Dati / Geocall" `attivita: null` (riga ~156): la colonna "Tipo OdL(CdL)/Servizio" non viene mappata. Inoltre `odsin` è ricavato via `extractOdsin` (pattern `200########`): se il valore non corrisponde, l'ODSIN si perde.
- **Opzioni che perdono la virgola:** `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` (riga ~313) — l'input è controllato con `value={(opzioni).join(', ')}` e `onChange={split(',').map(trim).filter(Boolean)}`: a ogni battitura il segmento vuoto dopo la virgola viene eliminato da `filter(Boolean)`, quindi la virgola sparisce e non si può aggiungere la 2ª opzione.

## 3. Decisioni (confermate)

| Tema | Scelta |
|---|---|
| Indirizzo/dati | Non troncati: vanno a capo, leggibili per intero. |
| Campi vuoti | Restano nascosti (filtro già presente). |
| Attività/ODS | Il parser "Export Dati" mappa "Tipo…/Servizio" → attività; `odsin` con fallback al valore grezzo della colonna. |
| Opzioni template | Input **"una per riga"** (textarea). |

## 4. Fix 1 — Dettagli completi e non troncati

`components/modules/rapportini/RapportinoForm.tsx`, in `VoceCard`:
- Cambiare il `<dd className="truncate text-sm text-[var(--brand-text-main)]" title={r.value}>` in una versione che **va a capo** (es. `className="text-sm text-[var(--brand-text-main)] break-words"`, rimuovendo `truncate`). Le label `<dt>` restano.
- L'array `anagrafica` (già esteso in precedenza) elenca: Nominativo, Matricola, PDR, ODSIN, Via, Comune, CAP, Recapito, Attività, Accessibilità, Fascia oraria — con il filtro non-vuoti già presente. Nessun campo aggiunto qui (i dati arrivano dallo snapshot).

## 5. Fix 2 — Parser cattura "Tipo/attività" e ODS (formato Export Dati)

`utils/routing/excelParser.ts`:
- **Ramo "Export Dati"** (`detectFormat`): sostituire `attivita: null` con
  ```ts
  attivita: findCol(headers, [/^attivit/, /^tipo.*(odl|servizio|intervento)/, /^servizio$/, /^tipo$/]),
  ```
  così "Tipo OdL(CdL)/Servizio" → colonna attività (normalizzata `tipo odl(cdl)/servizio` → match su `/^tipo.*(odl|servizio|intervento)/`).
- **`parseExcelToTasks`**, calcolo di `odsin`: aggiungere come **ultimo fallback** il valore grezzo della colonna ODSIN, così se `extractOdsin` non trova il pattern `200…` ma la colonna ha un valore, l'ODS viene comunque mostrato:
  ```ts
  const odsin =
    (colMap.odsin != null ? extractOdsin(row[colMap.odsin]) : undefined) ??
    extractOdsin(odl) ??
    (colMap.pdR != null ? extractOdsin(row[colMap.pdR]) : undefined) ??
    (colMap.odsin != null ? (str(row[colMap.odsin]) || undefined) : undefined);
  ```
- Solo il ramo "Export Dati" cambia; ATTGIORN/Massiva (indici fissi) invariati.
- **Effetto temporale:** lo snapshot delle voci si congela alla **generazione**. Quindi attività/ODS appaiono nei rapportini **rigenerati** dopo il deploy. Per un piano esistente: Riapri → (ri-importa se serve) → Salva → **Rigenera**.

## 6. Fix 3 — Opzioni del template "una per riga"

`app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`:
- Sostituire l'`<input type="text">` delle opzioni con una **`<textarea>`**:
  - `value={(campo.opzioni ?? []).join('\n')}`
  - `onChange={(e) => updateCampo(idx, { opzioni: e.target.value.split('\n') })}` — **senza** `trim`/`filter` durante la digitazione (così l'Invio aggiunge una riga e nulla viene mangiato).
  - label "Opzioni (una per riga)", placeholder es. "SI\nNO".
- In `handleSave`, dove si costruisce il payload, **trim + rimozione vuoti solo al salvataggio**:
  ```ts
  opzioni: c.tipo === 'select' ? (c.opzioni ?? []).map((s) => s.trim()).filter(Boolean) : undefined,
  ```
- Risultato: digitazione robusta, una opzione per riga; al salvataggio le righe vuote vengono scartate.

## 7. Casi limite

| Caso | Comportamento |
|---|---|
| Campo intervento vuoto | Non mostrato (filtro non-vuoti). |
| Indirizzo molto lungo | Va a capo nella card (nessun troncamento). |
| Template senza colonna "Tipo/Servizio" | `attivita` resta non valorizzata → non mostrata. |
| ODSIN già in formato `200…` | Estrazione invariata (il fallback non si attiva). |
| Opzioni: righe vuote o spazi | Scartate al salvataggio. |
| Rapportini già generati | Mantengono il vecchio snapshot finché non rigenerati. |

## 8. Testing

Logica I/O/UI → `npx tsc --noEmit` + verifica manuale:
- Importa il template "Export Dati" con "Tipo OdL/Servizio" valorizzato → Genera → su `/r/<token>` compaiono Attività e ODS, indirizzo **intero**, campi vuoti assenti.
- Impostazioni → Template → campo "Selezione": scrivi "SI" Invio "NO" → due opzioni; salva → nel rapportino il select mostra "SI" e "NO" separati.

## 9. File coinvolti

| Area | File | Azione |
|---|---|---|
| Dettagli non troncati | `components/modules/rapportini/RapportinoForm.tsx` | Modify |
| Parser attività + ODS fallback | `utils/routing/excelParser.ts` | Modify |
| Opzioni "una per riga" | `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` | Modify |

## 10. Note

- **Nessuna SQL / migrazione.**
- Branch `fix/rapportino-dettagli-opzioni` da `main`; deploy finale via merge su `main`.
- Coerenza tema Aurea (`--brand-*`).
