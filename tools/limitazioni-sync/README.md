# Agente limitazioni massive → SharePoint

Aggiorna ogni sera i file Excel ACEA nella cartella OneDrive sincronizzata.

## Setup rapido
1. Copia `config.example.json` in `config.json` e compila `endpointUrl`, `exportKey`, `cartella`.
2. Tieni `"dryRun": true` finché non hai verificato un paio di report.
3. Lancia: `node agente.mjs`  (con il Node portable: `"<path>\node.exe" agente.mjs`).
4. Il report esce a video e in `_log/`. In dryRun NON scrive i file.
5. Quando i report sono ok, metti `"dryRun": false` e crea l'attività pianificata (vedi sezione Pianificazione).

Vedi il piano `docs/superpowers/plans/2026-06-16-sync-limitazioni-massive-sharepoint.md` per i dettagli.
