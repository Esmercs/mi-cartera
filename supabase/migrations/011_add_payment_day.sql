-- Add payment_day (15 or 30) to recurring_expenses
-- Replaces date-range filtering in "próxima quincena" with a simple day-based model:
-- payment_day=15 → shows when next cutoff is the 15th
-- payment_day=30 → shows when next cutoff is the 30th/end of month

ALTER TABLE recurring_expenses
  ADD COLUMN IF NOT EXISTS payment_day SMALLINT
  CHECK (payment_day IN (15, 30));

-- Backfill from existing next_payment_date
UPDATE recurring_expenses
SET payment_day = CASE
  WHEN EXTRACT(DAY FROM next_payment_date) <= 15 THEN 15
  ELSE 30
END
WHERE next_payment_date IS NOT NULL;

-- Default to 15 for any remaining nulls, then enforce NOT NULL
UPDATE recurring_expenses SET payment_day = 15 WHERE payment_day IS NULL;

ALTER TABLE recurring_expenses ALTER COLUMN payment_day SET NOT NULL;
ALTER TABLE recurring_expenses ALTER COLUMN payment_day SET DEFAULT 15;
