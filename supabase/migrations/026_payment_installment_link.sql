-- Vincula cada pago registrado con la cuota del ledger que marcó como pagada.
-- Permite que borrar un pago restaure su cuota a pendiente (deshacer real).
ALTER TABLE period_payments
  ADD COLUMN IF NOT EXISTS installment_id UUID
  REFERENCES card_expense_installments(id) ON DELETE SET NULL;
