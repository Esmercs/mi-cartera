-- Safe backfill for payment_day in case migration 011 was never applied in prod.
-- This is idempotent: if payment_day is already populated this is a no-op.
UPDATE recurring_expenses
SET payment_day = CASE
  WHEN interval_type = 'quincenal' THEN 0
  WHEN interval_type = 'c/15 dias' THEN 0
  ELSE 15
END
WHERE payment_day IS NULL;
