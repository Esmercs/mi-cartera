-- Módulo: pagos programados por quincena + deudas de tarjetas

CREATE TABLE IF NOT EXISTS scheduled_payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  concept       TEXT NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  card_id       UUID REFERENCES cards(id) ON DELETE SET NULL,
  payment_type  TEXT NOT NULL DEFAULT 'fijo',   -- 'fijo' | 'extra'
  period_date   DATE NOT NULL,                  -- fecha fin de la quincena (ej: 2025-04-30)
  is_paid       BOOLEAN NOT NULL DEFAULT false,
  paid_at       TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE scheduled_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheduled_payments_owner"
  ON scheduled_payments FOR ALL
  USING  (owner_id = auth.uid() AND is_approved())
  WITH CHECK (owner_id = auth.uid() AND is_approved());
