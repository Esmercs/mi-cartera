-- Verifica que el interés devengado de cada crédito quedó bien.
-- Pégalo en el SQL Editor de Supabase. No modifica nada: solo lee.
--
-- Recalcula el interés de cada mes de forma independiente y lo compara contra el
-- movimiento guardado. La convención que debe cumplirse:
--
--   interés(mes) = saldo_de_apertura × (tasa_anual / 12) × 1.16
--   saldo_de_apertura = suma de los movimientos con effective_date < día 1 del mes
--                       (o sea, el cierre del mes anterior)
--
-- El IVA del 16% va dentro. El saldo de APERTURA es lo importante: un abono hecho
-- durante el mes NO debe bajar el interés de ese mismo mes, solo del siguiente.

-- ── 1. Resumen por crédito ───────────────────────────────────────────────────
SELECT
  c.name                                AS credito,
  c.annual_rate                         AS tasa_anual,
  c.principal                           AS monto_original,
  c.monthly_payment                     AS cuota,
  round(sum(CASE WHEN m.kind = 'payment'  THEN -m.amount ELSE m.amount END), 2) AS saldo_actual,
  count(*) FILTER (WHERE m.kind = 'interest')                                   AS meses_devengados,
  round(sum(m.amount) FILTER (WHERE m.kind = 'interest'), 2)                    AS interes_acumulado,
  round(sum(m.amount) FILTER (WHERE m.kind = 'payment'),  2)                    AS abonado
FROM credits c
LEFT JOIN credit_movements m ON m.credit_id = c.id
GROUP BY c.id, c.name, c.annual_rate, c.principal, c.monthly_payment
ORDER BY c.name;

-- ── 2. Mes por mes: guardado vs recalculado ──────────────────────────────────
-- La columna `veredicto` debe decir 'ok' en TODOS los renglones.
SELECT
  c.name                                    AS credito,
  to_char(m.accrual_month, 'YYYY-MM')       AS mes,
  ob.saldo                                  AS saldo_apertura,
  m.amount                                  AS interes_guardado,
  round(ob.saldo * c.annual_rate / 1200 * 1.16, 2) AS interes_esperado,
  round(m.amount - round(ob.saldo * c.annual_rate / 1200 * 1.16, 2), 2) AS diferencia,
  CASE
    WHEN abs(m.amount - round(ob.saldo * c.annual_rate / 1200 * 1.16, 2)) <= 0.01
      THEN 'ok'
    ELSE 'REVISAR'
  END                                       AS veredicto
FROM credit_movements m
JOIN credits c ON c.id = m.credit_id
CROSS JOIN LATERAL (
  -- Saldo al cierre del mes anterior = apertura de este mes
  SELECT COALESCE(sum(CASE WHEN m2.kind = 'payment' THEN -m2.amount ELSE m2.amount END), 0) AS saldo
    FROM credit_movements m2
   WHERE m2.credit_id = m.credit_id
     AND m2.effective_date < m.accrual_month
) ob
WHERE m.kind = 'interest'
ORDER BY c.name, m.accrual_month;

-- ── 3. Veredicto en una línea ────────────────────────────────────────────────
-- Tolerancia de 1 centavo: el código calcula en punto flotante y Postgres en
-- decimal exacto, así que una diferencia de centavo es redondeo, no un error.
SELECT
  count(*)                                                          AS meses_revisados,
  count(*) FILTER (WHERE abs(dif) > 0.01)                           AS con_problema,
  CASE WHEN count(*) FILTER (WHERE abs(dif) > 0.01) = 0
       THEN 'TODO BIEN'
       ELSE 'HAY MESES QUE NO CUADRAN — revisa la consulta 2'
  END                                                               AS veredicto
FROM (
  SELECT m.amount - round(ob.saldo * c.annual_rate / 1200 * 1.16, 2) AS dif
    FROM credit_movements m
    JOIN credits c ON c.id = m.credit_id
    CROSS JOIN LATERAL (
      SELECT COALESCE(sum(CASE WHEN m2.kind = 'payment' THEN -m2.amount ELSE m2.amount END), 0) AS saldo
        FROM credit_movements m2
       WHERE m2.credit_id = m.credit_id
         AND m2.effective_date < m.accrual_month
    ) ob
   WHERE m.kind = 'interest'
) t;

-- ── 4. Duplicados de devengo (no deberían existir) ───────────────────────────
-- El índice único credit_interest_once lo previene. Si sale algo, ese índice no
-- se aplicó y hay meses cobrados dos veces.
SELECT credit_id, accrual_month, count(*) AS veces
  FROM credit_movements
 WHERE kind = 'interest'
 GROUP BY credit_id, accrual_month
HAVING count(*) > 1;
