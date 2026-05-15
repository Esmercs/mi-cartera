-- Add paid_by to recurring_expenses for shared expenses:
--   'each' (default)  -> cada quien paga su parte (comportamiento original)
--   'lalo' / 'ale'    -> uno paga el total, el otro le debe su porcentaje
-- For non-shared rows the column is ignored.

ALTER TABLE recurring_expenses
  ADD COLUMN IF NOT EXISTS paid_by TEXT NOT NULL DEFAULT 'each'
    CHECK (paid_by IN ('each', 'lalo', 'ale'));

-- Recreate the split view to expose paid_by so the dashboard can compute deudas internas.
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
