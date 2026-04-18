-- Fix: cards seeded without owner_id can't be updated.
-- Allow update when owner_id matches, ownership matches display_name, or card is shared.

DROP POLICY IF EXISTS "cards_update_own" ON cards;

CREATE POLICY "cards_update_own"
  ON cards FOR UPDATE
  USING (
    is_approved() AND (
      owner_id = auth.uid()
      OR ownership = (SELECT display_name FROM profiles WHERE id = auth.uid())
      OR ownership = 'shared'
    )
  )
  WITH CHECK (
    is_approved() AND (
      owner_id = auth.uid()
      OR ownership = (SELECT display_name FROM profiles WHERE id = auth.uid())
      OR ownership = 'shared'
    )
  );
