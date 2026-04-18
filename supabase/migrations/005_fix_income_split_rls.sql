-- Fix: la vista split_percentages solo veía el ingreso propio por RLS.
-- Para calcular el % de split ambos usuarios deben poder leer todos los income_config.

DROP POLICY IF EXISTS "income_select_own" ON income_config;

CREATE POLICY "income_select_approved"
  ON income_config FOR SELECT
  USING (is_approved() OR is_admin());
