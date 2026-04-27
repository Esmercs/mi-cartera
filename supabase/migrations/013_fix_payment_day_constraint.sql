-- Fix: drop old check constraint that only allowed (15, 30) and replace with (0, 15, 30)
-- Then backfill quincenal records to 0 and any remaining nulls to 15.

ALTER TABLE recurring_expenses
  DROP CONSTRAINT IF EXISTS recurring_expenses_payment_day_check;

ALTER TABLE recurring_expenses
  ADD CONSTRAINT recurring_expenses_payment_day_check
  CHECK (payment_day IN (0, 15, 30));

UPDATE recurring_expenses
SET payment_day = 0
WHERE interval_type IN ('quincenal', 'c/15 dias');

UPDATE recurring_expenses
SET payment_day = 15
WHERE payment_day IS NULL;

ALTER TABLE recurring_expenses ALTER COLUMN payment_day SET NOT NULL;
ALTER TABLE recurring_expenses ALTER COLUMN payment_day SET DEFAULT 15;

-- Recreate the view so that re.* includes the payment_day column.
-- PostgreSQL expands SELECT * at view-creation time, so adding a column to the
-- underlying table after the view was created means the view does NOT return it.
CREATE OR REPLACE VIEW recurring_expenses_split AS
SELECT
  re.id,
  re.owner_id,
  re.ownership,
  re.concept,
  re.total_amount,
  re.interval_type,
  re.payment_day,
  re.next_payment_date,
  re.card_id,
  re.is_active,
  re.notes,
  re.created_at,
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
