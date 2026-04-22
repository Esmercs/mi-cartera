-- Add payment_day to recurring_expenses
-- 0  = ambos (quincenal: 15 y 30)
-- 15 = día 15 de cada mes
-- 30 = último día del mes

ALTER TABLE recurring_expenses
  ADD COLUMN IF NOT EXISTS payment_day SMALLINT
  CHECK (payment_day IN (0, 15, 30));

-- Backfill quincenal → 0 (ambos), resto desde next_payment_date
UPDATE recurring_expenses
SET payment_day = CASE
  WHEN interval_type = 'quincenal' THEN 0
  WHEN EXTRACT(DAY FROM next_payment_date) <= 15 THEN 15
  ELSE 30
END
WHERE next_payment_date IS NOT NULL;

UPDATE recurring_expenses
SET payment_day = CASE WHEN interval_type = 'quincenal' THEN 0 ELSE 15 END
WHERE payment_day IS NULL;

ALTER TABLE recurring_expenses ALTER COLUMN payment_day SET NOT NULL;
ALTER TABLE recurring_expenses ALTER COLUMN payment_day SET DEFAULT 15;
