# Scanner ibrido — BarcodeDetector nativo + zxing potenziato

**Data:** 2026-06-11
**Stato:** Design approvato

## Contesto
Lo scanner zxing fatica coi barcode 1D densi (es. Code128 dei misuratori Meter Italia EF4 evo, `MIT…`). Si potenzia
usando il **lettore di sistema** (`BarcodeDetector`) dove disponibile (Android Chrome) — nettamente più affidabile —
con **fallback a zxing potenziato** (iOS/Safari). Risoluzione alta in entrambi.

## Comportamento (`ScannerMisuratore`, deps `[]`, onCodice via ref)
1. **Path nativo** — se `window.BarcodeDetector` esiste:
   - `getUserMedia({ video: { facingMode:'environment', width:{ideal:2560}, height:{ideal:1440} } })` → mostra nel `<video>`.
   - `new BarcodeDetector({ formats })` con i formati supportati tra: code_128, code_39, itf, ean_13, ean_8, upc_a, qr_code, data_matrix.
   - Loop `requestAnimationFrame` → `detector.detect(video)`; al primo `rawValue` → ferma tutto + `onCodice`.
   - Se fallisce (permesso/eccezione) → prova il fallback zxing.
2. **Fallback zxing** — `BrowserMultiFormatReader(HINTS)` (TRY_HARDER + formati) con `decodeFromConstraints` a 2K (come ora).
3. **Cleanup unico** (`fermaTutto`): `cancelAnimationFrame`, `zxingControls.stop()`, `stream.getTracks().stop()` — chiamato all'unmount e al primo codice trovato.

## Tipi
`BarcodeDetector` non è sempre nei lib DOM → interfaccia minimale locale (`BarcodeDetectorCtor`/`BarcodeDetectorLike`/`DetectedBarcode`), accesso via `window as unknown as { BarcodeDetector?: ... }` (niente `any`).

## Testing
Non testabile in locale (fotocamera + API device) → gate `tsc`/`eslint`/`build`; verifica sul campo (Android = nativo, iPhone = zxing 2K).

## Fuori scope
- Zoom/torcia (eventuale follow-up se serve).
- Nessun cambiamento agli endpoint/lookup; resta il fallback "+ Aggiungi misuratore" manuale.
