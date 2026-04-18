-- Fix definitivo: función SECURITY DEFINER para calcular split sin depender de RLS.
-- Las vistas anteriores fallaban porque consultaban income_config con el contexto
-- del usuario logueado, que podía no ver todos los registros.

CREATE OR REPLACE FUNCTION get_split_percentages()
RETURNS TABLE(lalo_pct numeric, ale_pct numeric)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql AS $$
  WITH latest AS (
    SELECT DISTINCT ON (owner_id) owner_id, amount
    FROM income_config
    ORDER BY owner_id, valid_from DESC
  ),
  totals AS (SELECT SUM(amount) AS total FROM latest),
  by_name AS (
    SELECT LOWER(p.display_name) AS name,
           ROUND(l.amount / t.total * 100, 4) AS pct
    FROM latest l
    JOIN profiles p ON p.id = l.owner_id
    CROSS JOIN totals t
  )
  SELECT
    MAX(CASE WHEN name = 'lalo' THEN pct END),
    MAX(CASE WHEN name = 'ale'  THEN pct END)
  FROM by_name;
$$;

CREATE OR REPLACE VIEW recurring_expenses_split AS
SELECT
  re.*,
  CASE
    WHEN re.ownership = 'shared' THEN ROUND(re.total_amount * sp.lalo_pct / 100, 2)
    WHEN re.ownership = 'lalo'   THEN re.total_amount
    ELSE 0
  END AS lalo_amount,
  CASE
    WHEN re.ownership = 'shared' THEN ROUND(re.total_amount * sp.ale_pct / 100, 2)
    WHEN re.ownership = 'ale'    THEN re.total_amount
    ELSE 0
  END AS ale_amount
FROM recurring_expenses re
CROSS JOIN get_split_percentages() sp
WHERE re.is_active = TRUE;
