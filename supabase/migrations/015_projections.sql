CREATE TABLE projections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  concept       TEXT NOT NULL,
  amount        DECIMAL(12,2) NOT NULL,
  projected_date DATE NOT NULL,
  card_id       UUID REFERENCES cards(id),
  notes         TEXT,
  is_paid       BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at       DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE projections ENABLE ROW LEVEL SECURITY;

CREATE POLICY projections_all ON projections
  FOR ALL TO authenticated
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
