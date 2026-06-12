-- MIGRAZIONE STORICA: ferie/104/malattia/permesso/congedo/lutto da `assignments` → `disponibilita_operatore`.
-- Le assenze storiche diventano 'intera' (giornata intera). Da lanciare UNA VOLTA in produzione.
-- I nomi attività attesi: Ferie, 104, Malattia, Permesso, Congedo, Lutto (match case-insensitive esatto).

-- 1) VERIFICA PRE-MIGRAZIONE — conferma nomi/conteggi prima di procedere.
SELECT a.name, count(*)
FROM assignments asg
JOIN activities_renamed a ON a.id = asg.activity_id
WHERE lower(trim(a.name)) IN ('ferie','104','malattia','permesso','congedo','lutto')
GROUP BY a.name
ORDER BY a.name;

-- 2) INSERIMENTO nelle disponibilità (idempotente su staff_id+data).
INSERT INTO disponibilita_operatore (staff_id, data, tipo, modalita, ora_da, ora_a)
SELECT asg.staff_id::text, cd.day, lower(trim(a.name)), 'intera', NULL, NULL
FROM assignments asg
JOIN activities_renamed a ON a.id = asg.activity_id
JOIN calendar_days cd ON cd.id = asg.day_id
WHERE lower(trim(a.name)) IN ('ferie','104','malattia','permesso','congedo','lutto')
  AND asg.staff_id IS NOT NULL
ON CONFLICT (staff_id, data) DO NOTHING;

-- 3) RIMOZIONE delle vecchie card-attività migrate (evita doppioni nel calendario).
DELETE FROM assignments asg
USING activities_renamed a
WHERE a.id = asg.activity_id
  AND lower(trim(a.name)) IN ('ferie','104','malattia','permesso','congedo','lutto');
