-- Las vistas del proyecto se podían leer SIN iniciar sesión.
--
-- En Postgres una vista no hereda el RLS de sus tablas base: corre con los
-- privilegios de su dueño. La 030 ya lo había arreglado para credits_split y dejó
-- anotado que las demás tenían la misma exposición. Comprobado con la anon key
-- contra REST, sin autenticar:
--
--   recurring_expenses_split → todos los gastos compartidos con montos y split
--   period_summary           → periodos con ingreso y presupuestos por usuario
--   fun_budget_summary       → presupuesto de diversión y lo gastado
--   split_percentages        → nombres, user ids y los INGRESOS de ambos
--
-- Las tablas base sí bloqueaban; solo las vistas estaban abiertas.
--
-- Dos capas:
--   1) security_invoker = true → la vista respeta el RLS de quien la consulta.
--      anon no pasa is_approved(), así que ve cero filas.
--   2) REVOKE SELECT ... FROM anon → aunque una policy futura se afloje, el rol
--      anónimo ni siquiera puede tocar las vistas. Va sin guarda de versión para
--      que sirva de protección también en Postgres < 15.
--
-- Para los usuarios autenticados NO cambia lo que ven:
--   recurring_expenses_split → recurring_select ya permite «shared OR propio»
--   fun_budget_summary       → fun_budget_select y fun_expenses_select son is_approved(),
--                              o sea ambos ven todo: los totales agregados no se mueven
--   period_summary           → periods_select_own = propio; la app ya filtra por owner_id
--   split_percentages        → income_select_approved (005) deja leer ambos ingresos
--
-- split_percentages quedó sin uso desde la 007 (get_split_percentages() lee
-- income_config directo). NO se borra aquí: asegurarla es suficiente y borrarla es
-- otra decisión. Vale la pena limpiarla después.

DO $$
DECLARE v text;
BEGIN
  IF current_setting('server_version_num')::int >= 150000 THEN
    FOREACH v IN ARRAY ARRAY[
      'recurring_expenses_split', 'period_summary', 'fun_budget_summary',
      'split_percentages', 'credits_split'
    ] LOOP
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
    END LOOP;
    RAISE NOTICE 'Las cinco vistas respetan el RLS de quien las consulta';
  ELSE
    RAISE NOTICE 'Postgres < 15: sin security_invoker; el REVOKE de abajo es la protección';
  END IF;
END $$;

DO $$
DECLARE v text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    FOREACH v IN ARRAY ARRAY[
      'recurring_expenses_split', 'period_summary', 'fun_budget_summary',
      'split_percentages', 'credits_split'
    ] LOOP
      EXECUTE format('REVOKE SELECT ON public.%I FROM anon', v);
    END LOOP;
    RAISE NOTICE 'El rol anon ya no puede leer las vistas';
  ELSE
    RAISE NOTICE 'No existe el rol anon (base local): nada que revocar';
  END IF;
END $$;

-- Verificación: las cinco con security_invoker=true y sin SELECT para anon
SELECT c.relname AS vista,
       COALESCE((SELECT o FROM unnest(c.reloptions) AS o WHERE o LIKE 'security_invoker%'),
                'sin security_invoker') AS opcion,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_puede_leer
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'v'
 ORDER BY c.relname;
