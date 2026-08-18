-- Defensa en profundidad para credits_split.
--
-- En Postgres una VISTA no hereda el RLS de sus tablas base: se ejecuta con los
-- privilegios de su dueño, así que credits_split podía regresar los créditos
-- PERSONALES del otro usuario aunque la política credits_select los filtre.
-- Las páginas ya filtran por ownership en la query (igual que lo hace la de cards),
-- pero eso depende de que ningún consumidor futuro se olvide del filtro.
--
-- security_invoker = true hace que la vista respete el RLS de quien la consulta,
-- de modo que la base de datos lo garantiza sola. Requiere Postgres 15+, así que
-- va con guarda: en versiones anteriores no se aplica y el filtro de la app sigue
-- siendo la protección.
--
-- Las otras vistas del proyecto (recurring_expenses_split, period_summary,
-- fun_budget_summary, split_percentages) tienen la misma exposición. NO se tocan
-- aquí a propósito: cambiarlas puede alterar lo que ven las páginas existentes y
-- merece su propia revisión.

DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 150000 THEN
    EXECUTE 'ALTER VIEW credits_split SET (security_invoker = true)';
    RAISE NOTICE 'credits_split ahora respeta el RLS de quien la consulta';
  ELSE
    RAISE NOTICE 'Postgres < 15: security_invoker no disponible, la vista sigue con los privilegios de su dueño. El filtro de ownership en la app es la protección.';
  END IF;
END $$;

-- Verificación: debe salir security_invoker=true (en PG 15+)
SELECT c.relname AS vista,
       COALESCE(
         (SELECT o FROM unnest(c.reloptions) AS o WHERE o LIKE 'security_invoker%'),
         'sin security_invoker'
       ) AS opcion
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'credits_split';
