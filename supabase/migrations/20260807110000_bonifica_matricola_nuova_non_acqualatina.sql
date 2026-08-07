-- ============================================================================
-- BONIFICA — la «matricola nuovo misuratore» fuori da AcquaLatina
-- ============================================================================
-- Il campo «MATRICOLA NUOVO MISURATORE» esiste in UN solo flusso di Azioni operatori:
-- «ACQUALATINA SOSTITUZIONE MISURATORI» (committente acqualatina, gruppo SOSTITUZIONE
-- MISURATORI). La configurazione è sempre stata giusta; a sbagliare era il MODELLO DI RIPIEGO
-- del rapportino: `sincronizzaRapportini` sceglieva «il primo template attivo non-manuale in
-- ordine di nome», e dal 27/07/2026 — data di nascita del flusso AcquaLatina — il primo in
-- ordine alfabetico è diventato proprio lui. Da lì in poi ogni voce senza flusso per-attività
-- (intervento non agganciato, gruppo senza flusso) ha ereditato il modulo AcquaLatina, matricola
-- obbligatoria compresa, anche su lavori ACEA e Italgas.
--
-- Gli operatori hanno fatto l'unica cosa che potevano per andare avanti: PICARRO (04/08, Firenze
-- e Greve in Chianti) ha scritto «0», l'ACEA di Guidonia «-», e le BONIFICHE EXTRA (05/08,
-- Castiglione del Lago) hanno scritto la matricola del contatore GAS — un dato vero, ma di un
-- altro mestiere, in una colonna che nasce per i contatori dell'acqua.
--
-- Il registro AcquaLatina non è stato toccato: `propagaMatricolaNuovaARegistro` filtra sul
-- committente e `acea_ordini.matricola_nuova` è rimasta a zero righe. La scrittura su
-- `interventi.matricola_nuova` invece non aveva quel filtro, e quella colonna finisce
-- nell'export interventi: da lì il valore sbagliato poteva arrivare in un report al committente.
--
-- Qui si azzerano i 14 interventi Italgas colpiti e la risposta residua nelle rispettive voci.
-- Le voci AcquaLatina non si toccano MAI — nemmeno quelle orfane (intervento scollegato) del
-- 03/08 con attività «Sostituzione misuratore»: quello è lavoro suo, il dato è buono.
--
-- Valori rimossi (per la storia, se mai servisse ricostruirli):
--   2026-08-04 · PICARRO · FIRENZE / GREVE IN CHIANTI · 5 interventi · tutti «0»
--     P564742026, P564762026, P708772026, P587212026, P135972026
--   2026-08-05 · BONIFICHE EXTRA · CASTIGLIONE DEL LAGO · 9 interventi
--     FIOR034422087361, FIOR034420195545, MTSB03BE08577925, MIT0032012706412,
--     WTTS034220077721, ELS034016778820, MIT0032014278644, MIT0032012706418, MIT0032009481191
--   2026-08-07 · DUNNING · GUIDONIA MONTECELIO · ODL 957464576 · «-» (già rimosso a mano)
--
-- Idempotente: alla seconda esecuzione non trova più righe da toccare.

-- ─── 1. Le voci: via la risposta, il resto delle risposte resta intatto ─────
update public.rapportino_voci v
   set risposte = v.risposte - 'matricola_nuova'
  from public.interventi i
 where i.id = v.intervento_id
   and i.committente <> 'acqualatina'
   and coalesce(v.risposte ->> 'matricola_nuova', '') <> '';

-- ─── 2. Gli interventi: la colonna torna vuota ─────────────────────────────
update public.interventi
   set matricola_nuova = null,
       updated_at = now()
 where committente <> 'acqualatina'
   and coalesce(matricola_nuova, '') <> '';
