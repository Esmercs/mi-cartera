-- Allow owner (or admin) to delete their own installment plans.
-- installment_payments rows are removed via ON DELETE CASCADE.
DROP POLICY IF EXISTS installment_delete ON installment_plans;
CREATE POLICY installment_delete ON installment_plans
  FOR DELETE TO authenticated
  USING (is_approved() AND (owner_id = auth.uid() OR is_admin()));
