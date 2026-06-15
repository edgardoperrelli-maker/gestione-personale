-- SEED: imposta staff.cost_center col centro di costo più frequente nello storico assegnazioni.
-- Lanciare UNA VOLTA, dopo la migration tabella. Non sovrascrive i default già impostati.
UPDATE staff s
SET cost_center = sub.cc
FROM (
  SELECT staff_id, cc FROM (
    SELECT staff_id, cost_center AS cc,
           row_number() OVER (PARTITION BY staff_id ORDER BY count(*) DESC) AS rn
    FROM assignments
    WHERE cost_center IS NOT NULL
    GROUP BY staff_id, cost_center
  ) ranked
  WHERE rn = 1
) sub
WHERE s.id = sub.staff_id::text AND s.cost_center IS NULL;
