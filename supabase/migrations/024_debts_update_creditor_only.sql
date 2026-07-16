-- Solo quien recibe el pago (acreedor) puede confirmar/actualizar una deuda
-- entre personas. Revierte la 009, que permitía al deudor marcar sus pagos.
DROP POLICY IF EXISTS "debts_update" ON inter_person_debts;

CREATE POLICY "debts_update"
  ON inter_person_debts FOR UPDATE
  USING (is_approved() AND creditor_id = auth.uid());
