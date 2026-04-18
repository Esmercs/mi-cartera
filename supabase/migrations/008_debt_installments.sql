ALTER TABLE inter_person_debts
  ADD COLUMN IF NOT EXISTS total_installments INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS paid_installments  INT NOT NULL DEFAULT 0;
