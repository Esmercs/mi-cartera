-- Dos huecos que quedaron abiertos después de la 032.
--
-- (1) get_split_percentages() se podía llamar SIN autenticar.
--     Comprobado contra prod con la pura anon key:
--       POST /rest/v1/rpc/get_split_percentages → 200 [{"lalo_pct":76,"ale_pct":24}]
--     No suelta nombres ni montos, pero sí la proporción de ingresos entre los dos,
--     que es justo lo que la 032 tapó por el lado de las vistas. Es SECURITY DEFINER,
--     así que el RLS de income_config no la detiene: la única defensa es el EXECUTE.
--
--     Ojo con el ACL: Postgres le da EXECUTE a PUBLIC por default, y encima Supabase
--     agrega un GRANT explícito a anon. Hay que quitar los dos; revocar solo a anon
--     deja el permiso vivo por la vía de PUBLIC.
--
-- (2) El arreglo de la 032 se deshace solo con un DROP VIEW.
--     Al recrear una vista, Postgres le aplica los default privileges del esquema,
--     y en Supabase esos incluyen GRANT ALL ... TO anon. O sea que la vista nueva
--     nace legible por anon otra vez, sin error y sin aviso. No es hipotético: es
--     exactamente el patrón que usó la 031 (DROP VIEW + CREATE VIEW sobre
--     recurring_expenses_split), y por eso la fuga sobrevivió a la 030.
--
--     Se corta de raíz quitando el GRANT automático a anon para las tablas y vistas
--     que se creen de aquí en adelante. Con esto, una vista nueva nace cerrada y hay
--     que abrirla a mano si alguna vez se quiere pública.
--
-- Lo que NO cambia para el usuario autenticado: las tres páginas que llaman la RPC
-- (gastos-fijos, analisis, tarjetas/add-expense-form) lo hacen con sesión, o sea
-- como authenticated, que conserva el EXECUTE.

-- ---------- (1) la RPC ----------
REVOKE EXECUTE ON FUNCTION get_split_percentages() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION get_split_percentages() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION get_split_percentages() TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION get_split_percentages() TO service_role';
  END IF;
END $$;

-- ---------- (2) que las vistas nuevas nazcan cerradas ----------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM anon';
    RAISE NOTICE 'Las tablas y vistas nuevas ya no se le conceden a anon automáticamente';
  END IF;
END $$;

-- Queda pendiente a propósito: los default privileges de FUNCIONES siguen abiertos,
-- así que una función SECURITY DEFINER nueva nacería llamable por anon igual que
-- get_split_percentages(). Cerrarlo toca a is_approved()/is_admin(), que se evalúan
-- dentro de las policies de RLS, y eso merece su propia migración y su propia prueba.

-- Verificación
SELECT proname,
       has_function_privilege('anon',          oid, 'EXECUTE') AS anon_puede,
       has_function_privilege('authenticated', oid, 'EXECUTE') AS auth_puede
  FROM pg_proc WHERE proname = 'get_split_percentages';
