-- Fix: recurring_expenses_split usaba comparación case-sensitive ('Ale' vs 'ale').
-- Se cambia a LOWER() para que funcione sin importar cómo se registró el display_name.

CREATE OR REPLACE VIEW recurring_expenses_split AS
WITH sp AS (
  SELECT
    MAX(CASE WHEN LOWER(display_name) = 'lalo' THEN percentage END) AS lalo_pct,
    MAX(CASE WHEN LOWER(display_name) = 'ale'  THEN percentage END) AS ale_pct
  FROM split_percentages
)
SELECT
  re.*,
  CASE
    WHEN re.ownership = 'shared'
      THEN ROUND(re.total_amount * sp.lalo_pct / 100, 2)
    WHEN re.ownership = 'lalo' THEN re.total_amount
    ELSE 0
  END AS lalo_amount,
  CASE
    WHEN re.ownership = 'shared'
      THEN ROUND(re.total_amount * sp.ale_pct / 100, 2)
    WHEN re.ownership = 'ale' THEN re.total_amount
    ELSE 0
  END AS ale_amount
FROM recurring_expenses re
CROSS JOIN sp
WHERE re.is_active = TRUE;
