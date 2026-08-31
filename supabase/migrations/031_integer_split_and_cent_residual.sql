-- El split ahora es un porcentaje entero, y las dos partes siempre suman el total.
--
-- Dos problemas que se veían juntos en Gastos fijos:
--
-- 1) get_split_percentages() devolvía el porcentaje de ingresos con 4 decimales
--    (75.9666 / 24.0334), pero la UI lo imprime redondeado ("Lalo 76% · Ale 24%").
--    La renta de $12,500 salía en $3,004.18 y no en los $3,000 que sugiere el 24%.
--    Se redondea a entero para que el número que se muestra sea el que se cobra.
--    La parte de Ale se calcula como 100 − Lalo para que nunca sumen 99 o 101 por
--    redondear cada lado por separado.
--
-- 2) Las vistas redondeaban cada parte por su cuenta, así que podían sumar un
--    centavo de más o de menos que el total (9,495.83 + 3,004.18 = 12,500.01).
--    Ahora se redondea la parte de Lalo y la de Ale es el residuo exacto.

CREATE OR REPLACE FUNCTION get_split_percentages()
RETURNS TABLE(lalo_pct numeric, ale_pct numeric)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql AS $$
  WITH latest AS (
    SELECT DISTINCT ON (owner_id) owner_id, amount
    FROM income_config
    ORDER BY owner_id, valid_from DESC
  ),
  totals AS (SELECT SUM(amount) AS total FROM latest),
  by_name AS (
    SELECT LOWER(p.display_name) AS name,
           l.amount / t.total * 100 AS pct
    FROM latest l
    JOIN profiles p ON p.id = l.owner_id
    CROSS JOIN totals t
  ),
  raw AS (
    SELECT MAX(CASE WHEN name = 'lalo' THEN pct END) AS lalo,
           MAX(CASE WHEN name = 'ale'  THEN pct END) AS ale
    FROM by_name
  )
  SELECT
    ROUND(lalo, 0),
    -- Complemento, no un segundo redondeo: garantiza que sumen 100.
    -- Si no hay ingreso de Lalo no hay de qué sacar el complemento.
    CASE WHEN lalo IS NULL THEN ROUND(ale, 0) ELSE 100 - ROUND(lalo, 0) END
  FROM raw;
$$;

-- recurring_expenses_split — misma forma que en 027, con la parte de Ale como residuo
DROP VIEW IF EXISTS recurring_expenses_split;
CREATE VIEW recurring_expenses_split AS
SELECT
  re.*,
  CASE
    WHEN re.ownership = 'shared' THEN ROUND(re.total_amount * sp.lalo_pct / 100, 2)
    WHEN re.ownership = 'lalo'   THEN re.total_amount
    ELSE 0
  END AS lalo_amount,
  CASE
    WHEN re.ownership = 'shared' THEN re.total_amount - ROUND(re.total_amount * sp.lalo_pct / 100, 2)
    WHEN re.ownership = 'ale'    THEN re.total_amount
    ELSE 0
  END AS ale_amount
FROM recurring_expenses re
CROSS JOIN get_split_percentages() sp
WHERE re.is_active = TRUE;

-- credits_split — CREATE OR REPLACE (no DROP) para no perder el security_invoker de 030
CREATE OR REPLACE VIEW credits_split AS
SELECT
  c.*,
  COALESCE(b.balance, 0) AS balance,
  CASE WHEN c.ownership = 'shared' THEN ROUND(c.monthly_payment * sp.lalo_pct / 100, 2)
       WHEN c.ownership = 'lalo'   THEN c.monthly_payment ELSE 0 END AS lalo_payment,
  CASE WHEN c.ownership = 'shared' THEN c.monthly_payment - ROUND(c.monthly_payment * sp.lalo_pct / 100, 2)
       WHEN c.ownership = 'ale'    THEN c.monthly_payment ELSE 0 END AS ale_payment,
  CASE WHEN c.ownership = 'shared' THEN ROUND(COALESCE(b.balance,0) * sp.lalo_pct / 100, 2)
       WHEN c.ownership = 'lalo'   THEN COALESCE(b.balance,0) ELSE 0 END AS lalo_balance,
  CASE WHEN c.ownership = 'shared' THEN COALESCE(b.balance,0) - ROUND(COALESCE(b.balance,0) * sp.lalo_pct / 100, 2)
       WHEN c.ownership = 'ale'    THEN COALESCE(b.balance,0) ELSE 0 END AS ale_balance
FROM credits c
CROSS JOIN get_split_percentages() sp
LEFT JOIN (
  SELECT credit_id,
         SUM(CASE WHEN kind = 'payment' THEN -amount ELSE amount END) AS balance
  FROM credit_movements GROUP BY credit_id
) b ON b.credit_id = c.id;

-- Reafirmar el security_invoker de 030 por si el REPLACE llegara sin él
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 150000 THEN
    EXECUTE 'ALTER VIEW credits_split SET (security_invoker = true)';
  END IF;
END $$;

-- Verificación: enteros que suman 100, y renta de 12,500 partida en 9,500 / 3,000
SELECT lalo_pct, ale_pct, lalo_pct + ale_pct AS suma FROM get_split_percentages();

SELECT concept, total_amount, lalo_amount, ale_amount,
       lalo_amount + ale_amount AS suma,
       (lalo_amount + ale_amount = total_amount) AS cuadra
  FROM recurring_expenses_split
 WHERE ownership = 'shared'
 ORDER BY concept;
