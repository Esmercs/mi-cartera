-- Allow approved users to update shared recurring expenses (owner_id IS NULL)
-- Previously only the owner or admin could update, blocking shared expense edits

DROP POLICY IF EXISTS "recurring_update" ON recurring_expenses;

CREATE POLICY "recurring_update"
  ON recurring_expenses FOR UPDATE
  USING (
    is_approved() AND (
      owner_id = auth.uid()
      OR ownership = 'shared'
      OR is_admin()
    )
  );
