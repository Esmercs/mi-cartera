-- ============================================================
-- MiCapital — Esquema inicial
-- Ejecutar en: Supabase → SQL Editor
-- ============================================================

-- ============================================================
-- PROFILES (extiende auth.users de Supabase)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  full_name     TEXT,
  display_name  TEXT,                        -- "Lalo" o "Ale"
  role          TEXT NOT NULL DEFAULT 'user'
                  CHECK (role IN ('admin', 'user')),
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INCOME CONFIG (ingresos configurables para calcular splits)
-- ============================================================
CREATE TABLE IF NOT EXISTS income_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES profiles ON DELETE CASCADE,
  amount      DECIMAL(12,2) NOT NULL,       -- ingreso mensual total
  valid_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, valid_from)
);

-- Vista: porcentaje de split vigente
CREATE OR REPLACE VIEW split_percentages AS
WITH latest AS (
  SELECT DISTINCT ON (owner_id)
    owner_id,
    amount,
    valid_from
  FROM income_config
  ORDER BY owner_id, valid_from DESC
),
totals AS (
  SELECT SUM(amount) AS total FROM latest
)
SELECT
  l.owner_id,
  p.display_name,
  l.amount,
  ROUND((l.amount / t.total) * 100, 4) AS percentage
FROM latest l
JOIN profiles p ON p.id = l.owner_id
CROSS JOIN totals t;

-- ============================================================
-- CARDS (tarjetas)
-- ============================================================
CREATE TABLE IF NOT EXISTS cards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID REFERENCES profiles,     -- NULL si es compartida
  ownership        TEXT NOT NULL
                     CHECK (ownership IN ('lalo', 'ale', 'shared')),
  name             TEXT NOT NULL,                -- "BBVA", "Liverpool", "Banamex oro"
  card_type        TEXT DEFAULT 'credit'
                     CHECK (card_type IN ('credit', 'debit', 'cash')),
  last_four        TEXT,
  current_balance  DECIMAL(12,2) DEFAULT 0,
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Datos iniciales: tarjetas de tu Excel
INSERT INTO cards (ownership, name, card_type) VALUES
  ('lalo',   'BBVA',          'credit'),
  ('lalo',   'Liverpool',     'credit'),
  ('lalo',   'Banamex',       'credit'),
  ('lalo',   'Visa Cart',     'credit'),
  ('lalo',   'Rappy Cart',    'credit'),
  ('lalo',   'Banamex Oro',   'credit'),
  ('lalo',   'Bradescart',    'credit'),
  ('ale',    'Ojitos Bank',   'credit'),
  ('shared', 'Efectivo',      'cash'),
  ('shared', 'Gris Cash',     'cash');

-- ============================================================
-- RECURRING EXPENSES (Gastos Mensuales fijos y recurrentes)
-- ============================================================
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID REFERENCES profiles,    -- NULL si es compartido
  ownership         TEXT NOT NULL
                      CHECK (ownership IN ('lalo', 'ale', 'shared')),
  concept           TEXT NOT NULL,
  total_amount      DECIMAL(12,2) NOT NULL,      -- monto base (sin split)
  interval_type     TEXT NOT NULL
                      CHECK (interval_type IN (
                        'quincenal', 'mensual', 'bimestral',
                        'trimestral', 'c/15 dias', 'c/21 dias', 'anual'
                      )),
  next_payment_date DATE,
  card_id           UUID REFERENCES cards,
  is_active         BOOLEAN DEFAULT TRUE,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Vista: gastos con montos splitteados calculados dinámicamente
CREATE OR REPLACE VIEW recurring_expenses_split AS
WITH sp AS (
  SELECT
    MAX(CASE WHEN display_name = 'Lalo' THEN percentage END) AS lalo_pct,
    MAX(CASE WHEN display_name = 'Ale'  THEN percentage END) AS ale_pct
  FROM split_percentages
)
SELECT
  re.*,
  CASE
    WHEN re.ownership = 'shared'
      THEN ROUND(re.total_amount * sp.lalo_pct / 100, 2)
    WHEN re.ownership = 'lalo' THEN re.total_amount
    ELSE 0
  END AS lalo_amount,
  CASE
    WHEN re.ownership = 'shared'
      THEN ROUND(re.total_amount * sp.ale_pct / 100, 2)
    WHEN re.ownership = 'ale' THEN re.total_amount
    ELSE 0
  END AS ale_amount
FROM recurring_expenses re
CROSS JOIN sp;

-- ============================================================
-- PERIODS (quincenas por usuario)
-- ============================================================
CREATE TABLE IF NOT EXISTS periods (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL REFERENCES profiles ON DELETE CASCADE,
  period_date    DATE NOT NULL,                  -- fecha de corte: día 15 o último del mes
  label          TEXT,                           -- "Quincena Abr 15"
  income         DECIMAL(12,2) DEFAULT 0,
  budget_fijos   DECIMAL(12,2) DEFAULT 0,
  budget_extra   DECIMAL(12,2) DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, period_date)
);

-- ============================================================
-- PERIOD PAYMENTS (pagos registrados por quincena)
-- ============================================================
CREATE TABLE IF NOT EXISTS period_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id    UUID NOT NULL REFERENCES periods ON DELETE CASCADE,
  concept      TEXT NOT NULL,
  card_id      UUID REFERENCES cards,
  amount       DECIMAL(12,2) NOT NULL,
  payment_type TEXT DEFAULT 'fijo'
                 CHECK (payment_type IN ('fijo', 'extra')),
  paid_at      DATE DEFAULT CURRENT_DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Vista: resumen por quincena
CREATE OR REPLACE VIEW period_summary AS
SELECT
  p.id,
  p.owner_id,
  p.period_date,
  p.label,
  p.income,
  p.budget_fijos,
  p.budget_extra,
  COALESCE(SUM(pp.amount) FILTER (WHERE pp.payment_type = 'fijo'), 0) AS total_fijos_pagado,
  COALESCE(SUM(pp.amount) FILTER (WHERE pp.payment_type = 'extra'), 0) AS total_extra_pagado,
  p.budget_fijos - COALESCE(SUM(pp.amount) FILTER (WHERE pp.payment_type = 'fijo'), 0) AS restante_fijos,
  p.budget_extra - COALESCE(SUM(pp.amount) FILTER (WHERE pp.payment_type = 'extra'), 0) AS restante_extra
FROM periods p
LEFT JOIN period_payments pp ON pp.period_id = p.id
GROUP BY p.id;

-- ============================================================
-- INSTALLMENT PLANS (Financiamiento / MSI)
-- ============================================================
CREATE TABLE IF NOT EXISTS installment_plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL REFERENCES profiles ON DELETE CASCADE,
  -- 'lalo'  = compra propia de Lalo (incluye "tutu" = apodo de Lalo)
  -- 'ale'   = compra propia de Ale
  ownership         TEXT NOT NULL
                      CHECK (ownership IN ('lalo', 'ale')),
  card_id           UUID REFERENCES cards,        -- tarjeta donde cae el cargo
  concept           TEXT NOT NULL,
  total_months      INTEGER NOT NULL,
  current_month     INTEGER NOT NULL DEFAULT 1,
  monthly_amount    DECIMAL(12,2) NOT NULL,
  next_payment_date DATE,
  remaining_debt    DECIMAL(12,2) NOT NULL,
  started_at        DATE DEFAULT CURRENT_DATE,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_months CHECK (current_month <= total_months + 1)
);

-- Trigger: al registrar un pago MSI, avanza el plan automáticamente
CREATE TABLE IF NOT EXISTS installment_payments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    UUID NOT NULL REFERENCES installment_plans ON DELETE CASCADE,
  amount     DECIMAL(12,2) NOT NULL,
  paid_at    DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION advance_installment_plan()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE installment_plans
  SET
    current_month     = current_month + 1,
    remaining_debt    = GREATEST(0, remaining_debt - NEW.amount),
    is_active         = (current_month + 1) <= total_months,
    next_payment_date = next_payment_date + INTERVAL '1 month'
  WHERE id = NEW.plan_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_advance_installment
AFTER INSERT ON installment_payments
FOR EACH ROW EXECUTE FUNCTION advance_installment_plan();

-- ============================================================
-- FUN BUDGET (Gastos Diversión — compartido)
-- ============================================================
CREATE TABLE IF NOT EXISTS fun_budget_periods (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  base_budget  DECIMAL(12,2) NOT NULL DEFAULT 4000,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (period_start)
);

CREATE TABLE IF NOT EXISTS fun_expenses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_period_id UUID NOT NULL REFERENCES fun_budget_periods ON DELETE CASCADE,
  concept          TEXT NOT NULL,
  amount           DECIMAL(12,2) NOT NULL,
  expense_date     DATE DEFAULT CURRENT_DATE,
  registered_by    UUID REFERENCES profiles,    -- quién lo registró
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Vista: presupuesto restante en tiempo real
CREATE OR REPLACE VIEW fun_budget_summary AS
SELECT
  fbp.id,
  fbp.period_start,
  fbp.period_end,
  fbp.base_budget,
  COALESCE(SUM(fe.amount), 0)                             AS total_spent,
  fbp.base_budget - COALESCE(SUM(fe.amount), 0)           AS remaining_budget,
  ROUND(
    (COALESCE(SUM(fe.amount), 0) / NULLIF(fbp.base_budget, 0)) * 100, 1
  )                                                        AS spent_pct
FROM fun_budget_periods fbp
LEFT JOIN fun_expenses fe ON fe.budget_period_id = fbp.id
GROUP BY fbp.id;

-- ============================================================
-- INTER PERSON DEBTS (deudas entre Lalo y Ale)
-- Ale puede registrar deudas que Eduardo (Lalo) le debe
-- ============================================================
CREATE TABLE IF NOT EXISTS inter_person_debts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_id   UUID NOT NULL REFERENCES profiles,     -- quien debe
  creditor_id UUID NOT NULL REFERENCES profiles,     -- a quien se le debe
  concept     TEXT NOT NULL,
  amount      DECIMAL(12,2) NOT NULL,
  is_paid     BOOLEAN DEFAULT FALSE,
  due_date    DATE,
  paid_at     DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT no_self_debt CHECK (debtor_id != creditor_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards               ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_expenses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE periods             ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_payments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_plans   ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fun_budget_periods  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fun_expenses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inter_person_debts  ENABLE ROW LEVEL SECURITY;

-- ---- Helpers ----
CREATE OR REPLACE FUNCTION is_approved()
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved'
  )
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND status = 'approved'
  )
$$;

-- ---- PROFILES ----
CREATE POLICY "profiles_select_own_or_admin"
  ON profiles FOR SELECT
  USING (id = auth.uid() OR is_admin());

CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_admin_only"
  ON profiles FOR UPDATE
  USING (is_admin());

-- ---- INCOME CONFIG ----
CREATE POLICY "income_select_own"
  ON income_config FOR SELECT
  USING (owner_id = auth.uid() OR is_admin());

CREATE POLICY "income_insert_own"
  ON income_config FOR INSERT
  WITH CHECK (owner_id = auth.uid() AND is_approved());

CREATE POLICY "income_update_own"
  ON income_config FOR UPDATE
  USING (owner_id = auth.uid() AND is_approved());

-- ---- CARDS ----
-- Aprobados ven sus propias tarjetas + las compartidas
CREATE POLICY "cards_select"
  ON cards FOR SELECT
  USING (
    is_approved() AND (
      ownership = 'shared'
      OR owner_id = auth.uid()
      OR is_admin()
    )
  );

CREATE POLICY "cards_insert_approved"
  ON cards FOR INSERT
  WITH CHECK (is_approved() AND (owner_id = auth.uid() OR is_admin()));

CREATE POLICY "cards_update_own"
  ON cards FOR UPDATE
  USING (owner_id = auth.uid() AND is_approved());

-- ---- RECURRING EXPENSES ----
CREATE POLICY "recurring_select"
  ON recurring_expenses FOR SELECT
  USING (
    is_approved() AND (
      ownership = 'shared'
      OR owner_id = auth.uid()
      OR is_admin()
    )
  );

CREATE POLICY "recurring_insert"
  ON recurring_expenses FOR INSERT
  WITH CHECK (is_approved() AND (owner_id = auth.uid() OR is_admin()));

CREATE POLICY "recurring_update"
  ON recurring_expenses FOR UPDATE
  USING (is_approved() AND (owner_id = auth.uid() OR is_admin()));

CREATE POLICY "recurring_delete"
  ON recurring_expenses FOR DELETE
  USING (is_approved() AND (owner_id = auth.uid() OR is_admin()));

-- ---- PERIODS (completamente privadas por usuario) ----
CREATE POLICY "periods_select_own"
  ON periods FOR SELECT
  USING (is_approved() AND (owner_id = auth.uid() OR is_admin()));

CREATE POLICY "periods_insert_own"
  ON periods FOR INSERT
  WITH CHECK (is_approved() AND owner_id = auth.uid());

CREATE POLICY "periods_update_own"
  ON periods FOR UPDATE
  USING (is_approved() AND owner_id = auth.uid());

-- ---- PERIOD PAYMENTS ----
CREATE POLICY "period_payments_select"
  ON period_payments FOR SELECT
  USING (
    is_approved() AND EXISTS (
      SELECT 1 FROM periods p
      WHERE p.id = period_id AND (p.owner_id = auth.uid() OR is_admin())
    )
  );

CREATE POLICY "period_payments_insert"
  ON period_payments FOR INSERT
  WITH CHECK (
    is_approved() AND EXISTS (
      SELECT 1 FROM periods p WHERE p.id = period_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "period_payments_delete"
  ON period_payments FOR DELETE
  USING (
    is_approved() AND EXISTS (
      SELECT 1 FROM periods p WHERE p.id = period_id AND p.owner_id = auth.uid()
    )
  );

-- ---- INSTALLMENT PLANS ----
CREATE POLICY "installment_select"
  ON installment_plans FOR SELECT
  USING (
    is_approved() AND (
      owner_id = auth.uid()
      OR is_admin()
    )
  );

CREATE POLICY "installment_insert"
  ON installment_plans FOR INSERT
  WITH CHECK (is_approved() AND (owner_id = auth.uid() OR is_admin()));

CREATE POLICY "installment_update"
  ON installment_plans FOR UPDATE
  USING (is_approved() AND (owner_id = auth.uid() OR is_admin()));

-- ---- INSTALLMENT PAYMENTS ----
CREATE POLICY "installment_payments_select"
  ON installment_payments FOR SELECT
  USING (
    is_approved() AND EXISTS (
      SELECT 1 FROM installment_plans ip
      WHERE ip.id = plan_id AND (ip.owner_id = auth.uid() OR is_admin())
    )
  );

CREATE POLICY "installment_payments_insert"
  ON installment_payments FOR INSERT
  WITH CHECK (
    is_approved() AND EXISTS (
      SELECT 1 FROM installment_plans ip
      WHERE ip.id = plan_id AND (ip.owner_id = auth.uid() OR is_admin())
    )
  );

-- ---- FUN BUDGET (compartido — cualquier aprobado puede ver y agregar) ----
CREATE POLICY "fun_budget_select"
  ON fun_budget_periods FOR SELECT
  USING (is_approved());

CREATE POLICY "fun_budget_insert"
  ON fun_budget_periods FOR INSERT
  WITH CHECK (is_approved());

CREATE POLICY "fun_budget_update"
  ON fun_budget_periods FOR UPDATE
  USING (is_admin());

CREATE POLICY "fun_expenses_select"
  ON fun_expenses FOR SELECT
  USING (is_approved());

CREATE POLICY "fun_expenses_insert"
  ON fun_expenses FOR INSERT
  WITH CHECK (is_approved());

CREATE POLICY "fun_expenses_delete"
  ON fun_expenses FOR DELETE
  USING (registered_by = auth.uid() OR is_admin());

-- ---- INTER PERSON DEBTS ----
-- Ale ve deudas donde ella es acreedora; Lalo ve deudas donde él es deudor o acreedor
CREATE POLICY "debts_select"
  ON inter_person_debts FOR SELECT
  USING (
    is_approved() AND (
      debtor_id = auth.uid()
      OR creditor_id = auth.uid()
      OR is_admin()
    )
  );

CREATE POLICY "debts_insert"
  ON inter_person_debts FOR INSERT
  WITH CHECK (is_approved() AND creditor_id = auth.uid());

CREATE POLICY "debts_update"
  ON inter_person_debts FOR UPDATE
  USING (is_approved() AND (creditor_id = auth.uid() OR is_admin()));

-- ============================================================
-- TRIGGER: auto-crear profile al registrarse
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'display_name'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TRIGGER: actualizar updated_at en profiles
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
