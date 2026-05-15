-- Settlements para gastos shared con paid_by lalo|ale.
-- Cada renglón registra que en una quincena (period_date) alguien pagó su parte
-- al que adelantó el gasto. Visible para ambos usuarios shared.

CREATE TABLE IF NOT EXISTS internal_debt_settlements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_expense_id  UUID NOT NULL REFERENCES recurring_expenses ON DELETE CASCADE,
  period_date           DATE NOT NULL,
  payer                 TEXT NOT NULL CHECK (payer IN ('lalo', 'ale')),
  amount                DECIMAL(12,2) NOT NULL,
  paid_at               DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_by_user_id       UUID NOT NULL REFERENCES auth.users,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (recurring_expense_id, period_date, payer)
);

CREATE INDEX IF NOT EXISTS idx_ids_period ON internal_debt_settlements (period_date);

ALTER TABLE internal_debt_settlements ENABLE ROW LEVEL SECURITY;

-- Ambos miembros shared pueden ver todos los settlements de gastos shared.
CREATE POLICY "ids_select"
  ON internal_debt_settlements FOR SELECT
  USING (
    is_approved() AND EXISTS (
      SELECT 1 FROM recurring_expenses re
      WHERE re.id = internal_debt_settlements.recurring_expense_id
        AND re.ownership = 'shared'
    )
  );

-- Sólo puedes registrar settlements donde tú eres quien pagó.
CREATE POLICY "ids_insert"
  ON internal_debt_settlements FOR INSERT
  WITH CHECK (
    is_approved()
    AND paid_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM recurring_expenses re
      WHERE re.id = recurring_expense_id
        AND re.ownership = 'shared'
    )
  );

-- Sólo puedes borrar tus propios settlements.
CREATE POLICY "ids_delete"
  ON internal_debt_settlements FOR DELETE
  USING (is_approved() AND paid_by_user_id = auth.uid());
