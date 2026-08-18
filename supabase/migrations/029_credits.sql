-- Créditos y préstamos: deuda con tasa de interés, saldo insoluto y abonos libres.
-- El saldo NO se guarda: se deriva de credit_movements (ver vista credits_split).
-- Diseño: docs/superpowers/specs/2026-08-18-creditos-prestamos-design.md

CREATE TABLE IF NOT EXISTS credits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID REFERENCES profiles,          -- NULL si ownership='shared'
  ownership       TEXT NOT NULL CHECK (ownership IN ('lalo','ale','shared')),
  paid_by         TEXT NOT NULL DEFAULT 'each' CHECK (paid_by IN ('each','lalo','ale')),
  name            TEXT NOT NULL,
  principal       DECIMAL(12,2) NOT NULL CHECK (principal > 0),
  -- % anual simple. Sin IVA: son préstamos personales, no tarjetas. 0 = sin interés.
  annual_rate     DECIMAL(6,3) NOT NULL DEFAULT 0 CHECK (annual_rate >= 0),
  term_months     INTEGER NOT NULL CHECK (term_months > 0),
  monthly_payment DECIMAL(12,2) NOT NULL CHECK (monthly_payment > 0),
  -- Solo 15 y 30: son los únicos cortes de quincena que existen (getOffsetPeriodDates
  -- devuelve payDay 15|30). Otro valor haría que el crédito no salga en ninguna quincena.
  payment_day     SMALLINT NOT NULL DEFAULT 15 CHECK (payment_day IN (15, 30)),
  started_at      DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_movements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id      UUID NOT NULL REFERENCES credits ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('disbursement','interest','payment')),
  amount         DECIMAL(12,2) NOT NULL CHECK (amount > 0),   -- siempre positivo; kind da el signo
  -- Ordena el ledger: started_at el desembolso, fin de mes el interés, la fecha del abono
  -- un pago. Existe para que un devengo atrasado use el saldo DE ESE MES y no el de hoy.
  effective_date DATE NOT NULL,
  accrual_month  DATE,                                        -- primer día del mes; solo interés
  created_by     UUID REFERENCES auth.users,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT accrual_only_interest
    CHECK ((kind = 'interest') = (accrual_month IS NOT NULL))
);

-- Idempotencia del devengo: un solo interés por crédito y mes. Si dos cargas de la
-- página compiten, una gana y la otra corta.
CREATE UNIQUE INDEX IF NOT EXISTS credit_interest_once
  ON credit_movements (credit_id, accrual_month) WHERE kind = 'interest';

CREATE INDEX IF NOT EXISTS idx_cm_credit ON credit_movements (credit_id, effective_date);

-- Liquidaciones de la parte del otro. internal_debt_settlements no sirve: su FK a
-- recurring_expenses es NOT NULL.
CREATE TABLE IF NOT EXISTS credit_settlements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id       UUID NOT NULL REFERENCES credits ON DELETE CASCADE,
  period_date     DATE NOT NULL,
  payer           TEXT NOT NULL CHECK (payer IN ('lalo','ale')),
  amount          DECIMAL(12,2) NOT NULL,
  paid_at         DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_by_user_id UUID NOT NULL REFERENCES auth.users,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (credit_id, period_date, payer)
);

-- Vista con el split vigente y el saldo derivado. Espejo de recurring_expenses_split.
CREATE OR REPLACE VIEW credits_split AS
SELECT
  c.*,
  COALESCE(b.balance, 0) AS balance,
  CASE WHEN c.ownership = 'shared' THEN ROUND(c.monthly_payment * sp.lalo_pct / 100, 2)
       WHEN c.ownership = 'lalo'   THEN c.monthly_payment ELSE 0 END AS lalo_payment,
  CASE WHEN c.ownership = 'shared' THEN ROUND(c.monthly_payment * sp.ale_pct  / 100, 2)
       WHEN c.ownership = 'ale'    THEN c.monthly_payment ELSE 0 END AS ale_payment,
  CASE WHEN c.ownership = 'shared' THEN ROUND(COALESCE(b.balance,0) * sp.lalo_pct / 100, 2)
       WHEN c.ownership = 'lalo'   THEN COALESCE(b.balance,0) ELSE 0 END AS lalo_balance,
  CASE WHEN c.ownership = 'shared' THEN ROUND(COALESCE(b.balance,0) * sp.ale_pct  / 100, 2)
       WHEN c.ownership = 'ale'    THEN COALESCE(b.balance,0) ELSE 0 END AS ale_balance
FROM credits c
CROSS JOIN get_split_percentages() sp
LEFT JOIN (
  SELECT credit_id,
         SUM(CASE WHEN kind = 'payment' THEN -amount ELSE amount END) AS balance
  FROM credit_movements GROUP BY credit_id
) b ON b.credit_id = c.id;

ALTER TABLE credits            ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_movements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_settlements ENABLE ROW LEVEL SECURITY;

-- Las cuatro operaciones aceptan shared (owner_id NULL). recurring_expenses tiene el
-- hoyo de exigir owner_id = auth.uid() en INSERT, lo que bloquea crear compartidos.
DROP POLICY IF EXISTS "credits_select" ON credits;
CREATE POLICY "credits_select" ON credits FOR SELECT
  USING (is_approved() AND (ownership = 'shared' OR owner_id = auth.uid() OR is_admin()));

DROP POLICY IF EXISTS "credits_insert" ON credits;
CREATE POLICY "credits_insert" ON credits FOR INSERT
  WITH CHECK (is_approved() AND (ownership = 'shared' OR owner_id = auth.uid() OR is_admin()));

DROP POLICY IF EXISTS "credits_update" ON credits;
CREATE POLICY "credits_update" ON credits FOR UPDATE
  USING (is_approved() AND (ownership = 'shared' OR owner_id = auth.uid() OR is_admin()));

DROP POLICY IF EXISTS "credits_delete" ON credits;
CREATE POLICY "credits_delete" ON credits FOR DELETE
  USING (is_approved() AND (ownership = 'shared' OR owner_id = auth.uid() OR is_admin()));

DROP POLICY IF EXISTS "cm_select" ON credit_movements;
CREATE POLICY "cm_select" ON credit_movements FOR SELECT
  USING (is_approved() AND EXISTS (
    SELECT 1 FROM credits c WHERE c.id = credit_movements.credit_id
      AND (c.ownership = 'shared' OR c.owner_id = auth.uid() OR is_admin())));

DROP POLICY IF EXISTS "cm_insert" ON credit_movements;
CREATE POLICY "cm_insert" ON credit_movements FOR INSERT
  WITH CHECK (is_approved() AND EXISTS (
    SELECT 1 FROM credits c WHERE c.id = credit_id
      AND (c.ownership = 'shared' OR c.owner_id = auth.uid() OR is_admin())));

-- Un abono es de quien lo registró; el interés lo genera el sistema, así que
-- cualquiera que vea el crédito puede borrarlo — si no, "recalcular intereses"
-- quedaría roto para el usuario que no devengó ese mes.
DROP POLICY IF EXISTS "cm_delete" ON credit_movements;
CREATE POLICY "cm_delete" ON credit_movements FOR DELETE
  USING (is_approved() AND EXISTS (
    SELECT 1 FROM credits c WHERE c.id = credit_movements.credit_id
      AND (c.ownership = 'shared' OR c.owner_id = auth.uid() OR is_admin()))
    AND (kind = 'interest' OR created_by = auth.uid()));

DROP POLICY IF EXISTS "cs_select" ON credit_settlements;
CREATE POLICY "cs_select" ON credit_settlements FOR SELECT
  USING (is_approved() AND EXISTS (
    SELECT 1 FROM credits c WHERE c.id = credit_settlements.credit_id AND c.ownership = 'shared'));

DROP POLICY IF EXISTS "cs_insert" ON credit_settlements;
CREATE POLICY "cs_insert" ON credit_settlements FOR INSERT
  WITH CHECK (is_approved() AND paid_by_user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM credits c WHERE c.id = credit_id AND c.ownership = 'shared'));

DROP POLICY IF EXISTS "cs_delete" ON credit_settlements;
CREATE POLICY "cs_delete" ON credit_settlements FOR DELETE
  USING (is_approved() AND paid_by_user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación: al correr esto en el SQL Editor, la última consulta te dice si
-- quedó todo. Deben salir 3 tablas, 1 vista, 2 índices y 10 políticas.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'tablas'   AS objeto, count(*) AS encontrados, 3  AS esperados
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name IN ('credits','credit_movements','credit_settlements')
UNION ALL
SELECT 'vista', count(*), 1
  FROM information_schema.views
 WHERE table_schema = 'public' AND table_name = 'credits_split'
UNION ALL
SELECT 'indices', count(*), 2
  FROM pg_indexes
 WHERE schemaname = 'public' AND indexname IN ('credit_interest_once','idx_cm_credit')
UNION ALL
SELECT 'politicas', count(*), 10
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('credits','credit_movements','credit_settlements');
