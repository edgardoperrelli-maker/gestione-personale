# Scanner unico "trova-o-crea" — Risanamento operatore

**Data:** 2026-06-10
**Stato:** Design approvato

## Contesto
Nella sezione Misuratori (RisanamentoView) ci sono due bottoni scanner — "📷 Scansiona" (crea) e "🔍 Cerca (scan)"
(ritrova) — fonte di confusione/errori in cantiere. Si unificano in **un solo bottone** intelligente.

## Comportamento (un solo handler `onScan`)
Al codice scansionato (`codice`):
1. **Cerca tra le righe del civico aperto** per `matricola === codice.trim()`.
   - **Trovata** → `setEvidenziata(riga.id)`, scorre alla riga (`scrollIntoView`), messaggio "Misuratore già presente: fai la foto «dopo»." NON crea doppioni.
   - **Non trovata** → `GET /lookup-misuratore` → se `trovato` crea la riga (`POST /riga` con fonte/ref_id); se `fuori_elenco` avviso; se non trovato precompila il form manuale (`setMat(codice)`). (= logica attuale di `onScanCrea`.)

## Modifiche (solo `RisanamentoView.tsx`)
- Unire `onScanCrea` + `onScanCerca` in **`onScan`** (cerca-poi-crea).
- Stato `scanner`: da `'crea' | 'cerca' | null` a `boolean` (aperto/chiuso); `<ScannerMisuratore onCodice={onScan} .../>`.
- Un solo bottone **"📷 Scansiona"**; rimuovere il bottone "🔍 Cerca (scan)".
- Aggiungere `id={`mis-${riga.id}`}` alla card della riga-misuratore; `useEffect` su `evidenziata` esegue
  `document.getElementById(`mis-${evidenziata}`)?.scrollIntoView({ behavior:'smooth', block:'center' })` (oltre all'auto-clear già presente).

## Invariato
- "+ Aggiungi misuratore" a mano (codice illeggibile).
- Tutto il resto del flusso (foto, fasi, accessorie, chiusura, PDF).

## Testing
- Logica scanner non testabile in locale (fotocamera) → gate `tsc`/`eslint`/`build`; comportamento sul campo.

## Fuori scope
- Nessun cambiamento al lookup/endpoint; nessun nuovo stato oltre l'unificazione.
