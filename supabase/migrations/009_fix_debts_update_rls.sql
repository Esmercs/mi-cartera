-- Allow debtor to also update their own debts (register installment payments)
DROP POLICY IF EXISTS "debts_update" ON inter_person_debts;

CREATE POLICY "debts_update"
  ON inter_person_debts FOR UPDATE
  USING (
    is_approved() AND (
      creditor_id = auth.uid()
      OR debtor_id = auth.uid()
      OR is_admin()
    )
  );
