-- ============================================================
-- 023 — Módulo Tarjetas: ledger de gastos + migración de datos
-- El saldo de cada tarjeta pasa a ser DERIVADO (suma de
-- mensualidades no pagadas), nunca editado a mano.
-- Idempotente: se puede correr más de una vez sin duplicar.
-- ============================================================

-- 1. Fin de quincena que contiene una fecha.
--    GEMELA de periodEndForDate() en lib/utils/date-utils.ts — si cambia una, cambia la otra.
--    Regla: día D, último día del mes ld →
--      D <= 14      → día 14 del mismo mes
--      14 < D < ld  → día ld-1 del mismo mes
--      D = ld       → día 14 del mes siguiente
CREATE OR REPLACE FUNCTION quincena_end(d DATE)
RETURNS DATE LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN EXTRACT(DAY FROM d)::int <= 14
      THEN make_date(EXTRACT(YEAR FROM d)::int, EXTRACT(MONTH FROM d)::int, 14)
    WHEN EXTRACT(DAY FROM d)::int
         < EXTRACT(DAY FROM (date_trunc('month', d) + INTERVAL '1 month - 1 day'))::int
      THEN ((date_trunc('month', d) + INTERVAL '1 month - 1 day')::date - 1)
    ELSE ((date_trunc('month', d) + INTERVAL '1 month')::date + 13)
  END
$$;

-- 2. Tablas
CREATE TABLE IF NOT EXISTS card_expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  card_id       UUID REFERENCES cards(id) ON DELETE SET NULL,  -- NULL = sin tarjeta / efectivo
  concept       TEXT NOT NULL,
  total_amount  NUMERIC(12,2) NOT NULL,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  months        INTEGER NOT NULL DEFAULT 1 CHECK (months >= 1), -- 1 = una exhibición
  expense_type  TEXT NOT NULL DEFAULT 'compra' CHECK (expense_type IN ('compra','ajuste')),
  is_shared     BOOLEAN NOT NULL DEFAULT FALSE,
  shared_pct    NUMERIC(7,4),          -- % de la pareja, snapshot al momento de la compra
  inter_person_debt_id UUID REFERENCES inter_person_debts(id) ON DELETE SET NULL,
  source        TEXT NOT NULL DEFAULT 'app',  -- 'app' | 'installment_plan' | 'scheduled_payment' | 'migration_ajuste'
  source_id     UUID,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expense_type = 'ajuste' OR total_amount > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS card_expenses_source_uni
  ON card_expenses(source, source_id) WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS card_expense_installments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id      UUID NOT NULL REFERENCES card_expenses(id) ON DELETE CASCADE,
  number          INTEGER NOT NULL,    -- 1..months; sin unique: un pago parcial parte la cuota en dos hermanas
  amount          NUMERIC(12,2) NOT NULL,
  due_period_date DATE,                -- fin de quincena; NULL = cuenta en saldo pero sin quincena programada (ajustes)
  is_paid         BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cei_expense_idx ON card_expense_installments(expense_id);
CREATE INDEX IF NOT EXISTS cei_due_idx ON card_expense_installments(due_period_date) WHERE NOT is_paid;

-- 3. RLS: owner todo + SELECT para tarjetas compartidas (ambos ven el saldo completo)
ALTER TABLE card_expenses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_expense_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS card_expenses_owner ON card_expenses;
CREATE POLICY card_expenses_owner ON card_expenses FOR ALL
  USING      (owner_id = auth.uid() AND is_approved())
  WITH CHECK (owner_id = auth.uid() AND is_approved());

DROP POLICY IF EXISTS card_expenses_shared_select ON card_expenses;
CREATE POLICY card_expenses_shared_select ON card_expenses FOR SELECT
  USING (is_approved() AND EXISTS (
    SELECT 1 FROM cards c WHERE c.id = card_expenses.card_id AND c.ownership = 'shared'));

DROP POLICY IF EXISTS cei_owner ON card_expense_installments;
CREATE POLICY cei_owner ON card_expense_installments FOR ALL
  USING (is_approved() AND EXISTS (
    SELECT 1 FROM card_expenses e WHERE e.id = expense_id AND e.owner_id = auth.uid()))
  WITH CHECK (is_approved() AND EXISTS (
    SELECT 1 FROM card_expenses e WHERE e.id = expense_id AND e.owner_id = auth.uid()));

DROP POLICY IF EXISTS cei_shared_select ON card_expense_installments;
CREATE POLICY cei_shared_select ON card_expense_installments FOR SELECT
  USING (is_approved() AND EXISTS (
    SELECT 1 FROM card_expenses e JOIN cards c ON c.id = e.card_id
    WHERE e.id = expense_id AND c.ownership = 'shared'));

-- ============================================================
-- 4. MIGRACIÓN DE DATOS
-- ============================================================

-- 4a. installment_plans → card_expenses (activos y terminados)
INSERT INTO card_expenses (owner_id, card_id, concept, total_amount, purchase_date,
                           months, expense_type, source, source_id, created_at)
SELECT ip.owner_id, ip.card_id, ip.concept,
       ROUND(ip.monthly_amount * ip.total_months, 2),
       COALESCE(ip.started_at, ip.created_at::date),
       ip.total_months, 'compra', 'installment_plan', ip.id, ip.created_at
FROM installment_plans ip
ON CONFLICT (source, source_id) WHERE source_id IS NOT NULL DO NOTHING;

-- 4b. Cuotas de cada plan: la cuota #current_month vence en quincena_end(next_payment_date),
--     anteriores pagadas, posteriores avanzan mensualmente; terminados → todas pagadas.
INSERT INTO card_expense_installments (expense_id, number, amount, due_period_date, is_paid, paid_at)
SELECT ce.id, gs.i, ip.monthly_amount,
       quincena_end((COALESCE(ip.next_payment_date, ip.started_at + INTERVAL '1 month')::date
         + make_interval(months => gs.i - LEAST(ip.current_month, ip.total_months)))::date),
       (gs.i < ip.current_month) OR (NOT ip.is_active),
       CASE WHEN (gs.i < ip.current_month) OR (NOT ip.is_active) THEN ip.created_at END
FROM installment_plans ip
JOIN card_expenses ce ON ce.source = 'installment_plan' AND ce.source_id = ip.id
CROSS JOIN LATERAL generate_series(1, ip.total_months) AS gs(i)
WHERE NOT EXISTS (SELECT 1 FROM card_expense_installments x WHERE x.expense_id = ce.id);

-- 4c. scheduled_payments → card_expenses (una exhibición)
INSERT INTO card_expenses (owner_id, card_id, concept, total_amount, purchase_date,
                           months, expense_type, notes, source, source_id, created_at)
SELECT sp.owner_id, sp.card_id, sp.concept, sp.amount, sp.created_at::date,
       1, 'compra', sp.notes, 'scheduled_payment', sp.id, sp.created_at
FROM scheduled_payments sp
WHERE sp.amount > 0
ON CONFLICT (source, source_id) WHERE source_id IS NOT NULL DO NOTHING;

INSERT INTO card_expense_installments (expense_id, number, amount, due_period_date, is_paid, paid_at)
SELECT ce.id, 1, sp.amount, quincena_end(sp.period_date), sp.is_paid, sp.paid_at
FROM scheduled_payments sp
JOIN card_expenses ce ON ce.source = 'scheduled_payment' AND ce.source_id = sp.id
WHERE NOT EXISTS (SELECT 1 FROM card_expense_installments x WHERE x.expense_id = ce.id);

-- 4d. Ajuste inicial por tarjeta: diferencia entre current_balance y la suma derivada.
--     due_period_date NULL → cuenta en el saldo pero NO en la proyección de quincena.
--     ONE-SHOT: correr una sola vez recién migrado (re-runs son no-op por el índice único,
--     pero si se corre después de actividad real simplemente no inserta — comportamiento seguro).
INSERT INTO card_expenses (owner_id, card_id, concept, total_amount, purchase_date,
                           months, expense_type, source, source_id)
SELECT COALESCE(c.owner_id,
         (SELECT id FROM profiles WHERE LOWER(display_name) = 'lalo' LIMIT 1)),
       c.id, 'Ajuste inicial (migración)',
       ROUND(c.current_balance - COALESCE(d.unpaid, 0), 2),
       CURRENT_DATE, 1, 'ajuste', 'migration_ajuste', c.id
FROM cards c
LEFT JOIN (
  SELECT e.card_id, SUM(i.amount) AS unpaid
  FROM card_expense_installments i
  JOIN card_expenses e ON e.id = i.expense_id
  WHERE NOT i.is_paid AND e.card_id IS NOT NULL
  GROUP BY e.card_id
) d ON d.card_id = c.id
WHERE c.is_active
  AND ABS(c.current_balance - COALESCE(d.unpaid, 0)) >= 0.01
ON CONFLICT (source, source_id) WHERE source_id IS NOT NULL DO NOTHING;

INSERT INTO card_expense_installments (expense_id, number, amount, due_period_date, is_paid)
SELECT ce.id, 1, ce.total_amount, NULL, FALSE
FROM card_expenses ce
WHERE ce.source = 'migration_ajuste'
  AND NOT EXISTS (SELECT 1 FROM card_expense_installments x WHERE x.expense_id = ce.id);

-- ============================================================
-- 5. VERIFICACIÓN (correr aparte; debe regresar 0 filas)
-- ============================================================
-- SELECT c.name, c.current_balance,
--        COALESCE(SUM(i.amount) FILTER (WHERE NOT i.is_paid), 0) AS derivado
-- FROM cards c
-- LEFT JOIN card_expenses e ON e.card_id = c.id
-- LEFT JOIN card_expense_installments i ON i.expense_id = e.id
-- WHERE c.is_active
-- GROUP BY c.id, c.name, c.current_balance
-- HAVING ABS(c.current_balance - COALESCE(SUM(i.amount) FILTER (WHERE NOT i.is_paid), 0)) >= 0.01;
