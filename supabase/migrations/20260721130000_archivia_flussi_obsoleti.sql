-- Azioni operatori: archiviazione dei flussi obsoleti del vecchio modello (2026-07-21).
-- Col motore per-attività ogni voce prende le azioni dal flusso del SUO gruppo:
--   · "Ibrido acea" (ombrello LIMITAZIONI MASSIVE + DUNNING) non serve più: per la regola
--     di specificità perdeva già su entrambi i gruppi contro i flussi dedicati. Il
--     riconoscimento PER NOME (fotoObbligatorieSoloMassive) resta nel codice per i
--     rapportini storici che lo referenziano; nessun nuovo rapportino lo userà.
--   · "IBRIDO ITALGAS/ACEA" non è mai stato collegato a un'attività (inerte).
-- Archiviare = active=false: fuori da generazione, "+" e albero; riattivabile in ogni
-- momento dalla sezione Archiviati del modulo. Idempotente.

update rapportino_template
set active = false
where active = true
  and solo_manuale = false
  and attivita_norm(nome) in (attivita_norm('Ibrido acea'), attivita_norm('IBRIDO ITALGAS/ACEA'));
