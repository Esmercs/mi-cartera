-- Proyectos compartidos: opción de hacer un proyecto visible para ambos.
-- Los privados (default) siguen siendo visibles solo para su dueño.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT FALSE;

-- Proyectos: compartidos visibles para usuarios aprobados; solo el dueño modifica/borra
DROP POLICY IF EXISTS projects_all ON projects;

CREATE POLICY projects_select ON projects
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR (is_shared AND is_approved()));

CREATE POLICY projects_insert ON projects
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY projects_update ON projects
  FOR UPDATE TO authenticated
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY projects_delete ON projects
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Abonos: en proyectos compartidos ambos ven y pueden abonar;
-- cada quien solo modifica/borra sus propios abonos
DROP POLICY IF EXISTS project_payments_all ON project_payments;

CREATE POLICY project_payments_select ON project_payments
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR (is_approved() AND EXISTS (
      SELECT 1 FROM projects p WHERE p.id = project_id AND p.is_shared
    ))
  );

CREATE POLICY project_payments_insert ON project_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id
        AND (p.owner_id = auth.uid() OR (p.is_shared AND is_approved()))
    )
  );

CREATE POLICY project_payments_update ON project_payments
  FOR UPDATE TO authenticated
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY project_payments_delete ON project_payments
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Storage: los comprobantes de abonos de proyectos compartidos los pueden ver ambos
DROP POLICY IF EXISTS comprobantes_select_shared ON storage.objects;

CREATE POLICY comprobantes_select_shared ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'comprobantes'
    AND public.is_approved()
    AND EXISTS (
      SELECT 1 FROM public.project_payments pp
      JOIN public.projects p ON p.id = pp.project_id
      WHERE pp.receipt_path = storage.objects.name
        AND p.is_shared
    )
  );
