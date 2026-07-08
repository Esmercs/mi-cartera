-- Proyectos a futuro: presupuesto, fecha límite y abonos con comprobante

CREATE TABLE projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  total_cost   DECIMAL(12,2) NOT NULL,
  due_date     DATE,
  notes        TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount       DECIMAL(12,2) NOT NULL,
  paid_at      DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_path TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_payments_project ON project_payments(project_id);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_all ON projects
  FOR ALL TO authenticated
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY project_payments_all ON project_payments
  FOR ALL TO authenticated
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Bucket privado para comprobantes de pago
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprobantes', 'comprobantes', false)
ON CONFLICT (id) DO NOTHING;

-- Cada usuario solo accede a archivos dentro de su carpeta (<user_id>/...)
CREATE POLICY comprobantes_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY comprobantes_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY comprobantes_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = auth.uid()::text);
