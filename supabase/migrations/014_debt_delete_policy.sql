-- Allow creditor (or admin) to delete their own debts
DROP POLICY IF EXISTS debts_delete ON inter_person_debts;
CREATE POLICY debts_delete ON inter_person_debts
  FOR DELETE TO authenticated
  USING (
    creditor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
