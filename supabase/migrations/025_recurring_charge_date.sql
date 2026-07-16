-- Fecha de cobro para gastos fijos domiciliados a una tarjeta.
-- Al llegar la fecha, la app materializa el cargo como card_expense
-- (aparece en el saldo de la tarjeta) y recorre la fecha según el intervalo.
-- La vista recurring_expenses_split usa re.*, así que la columna fluye sola.
ALTER TABLE recurring_expenses
  ADD COLUMN IF NOT EXISTS next_charge_date DATE;
