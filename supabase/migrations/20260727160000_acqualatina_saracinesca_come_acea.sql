-- AcquaLatina · la SARACINESCA prende la forma che ha su ACEA.
--
-- L'avevo messa come `crocetta`. Ma gli operatori che lavorano ACEA la incontrano da
-- sempre come SELECT etichettata «SOSTITUZIONE VALVOLA» (LIMITAZIONI/SOSPENSIONI,
-- RAPPORTINO LIMITAZIONI MASSIVE, TEMPLATE MANUALI LIM MASSIVE): due controlli diversi
-- per la stessa lavorazione, sullo stesso telefono, sono un invito all'errore.
-- Valvola e saracinesca sono la stessa cosa — deciso col committente il 27/07.
--
-- Si allinea la FORMA, non la parola: `select` con la sola opzione "SI", che è quella di
-- 2 template ACEA su 3. Semantica invariata rispetto alla crocetta: valorizzata = extra
-- eseguito, vuota = non eseguito. (Il terzo template ACEA usa ["SI","NO"]; qui l'extra di
-- norma NON si fa, e obbligare a rispondere su ogni voce sarebbe attrito senza
-- informazione in più.)
--
-- L'ETICHETTA resta «SARACINESCA», che è il termine del capitolato AcquaLatina e quello
-- che l'ufficio usa: la confusione da evitare stava nel CONTROLLO (una crocetta contro un
-- menu), non nel nome della lavorazione. Anche la chiave resta `saracinesca`, e ci punta
-- `listino.azione_chiave` della riga extra.
--
-- Nessun effetto sul calcolo dell'esito (utils/rapportini/voceColore.ts), verificato:
--   · `saracinesca SARACINESCA` non matcha NEG_NAME → non rende negativa la voce;
--   · non matcha ESITO_SELECT_NAME (/esegu|esito/) → non è il select d'esito;
--   · un select valorizzato mette `positivo = true` esattamente come la crocetta spuntata.

UPDATE public.rapportino_template
SET campi = (
  SELECT jsonb_agg(
    CASE
      WHEN c->>'chiave' = 'saracinesca' THEN jsonb_build_object(
        'chiave',    'saracinesca',
        'etichetta', 'SARACINESCA',
        'tipo',      'select',
        'opzioni',   jsonb_build_array('SI'),
        'ordine',    (c->>'ordine')::int
      )
      ELSE c
    END
    ORDER BY (c->>'ordine')::int
  )
  FROM jsonb_array_elements(campi) c
)
WHERE gruppo_committente = 'acqualatina'
  -- Guardia CONVERGENTE, non «è ancora una crocetta»: agisce finché il campo non ha
  -- esattamente la forma finale. Così è idempotente e, rieseguita, corregge anche uno
  -- stato intermedio — è servito davvero, per rimettere l'etichetta di capitolato dopo
  -- un primo giro che l'aveva allineata al nome ACEA.
  AND NOT campi @> '[{"chiave": "saracinesca", "tipo": "select", "etichetta": "SARACINESCA", "opzioni": ["SI"]}]'::jsonb;
