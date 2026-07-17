-- Categorías de gastos fijos para el módulo Análisis.
-- Auto-clasificación inicial por palabras clave; Eduardo corrige con el lápiz de Gastos.

ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'otros';

-- Backfill: el orden importa (gasolina/carro antes que 'gas'; xbox gold antes que 'gold' genérico)
UPDATE recurring_expenses SET category = CASE
  WHEN concept ILIKE '%gasolina%' OR concept ILIKE '%carro%' OR concept ILIKE '%uber%'
    OR concept ILIKE '%caseta%' THEN 'transporte'
  WHEN concept ILIKE '%netflix%' OR concept ILIKE '%disney%' OR concept ILIKE '%xbox%'
    OR concept ILIKE '%spotify%' OR concept ILIKE '%hbo%' OR concept ILIKE '%prime%'
    OR concept ILIKE '%gold%' THEN 'suscripciones'
  WHEN concept ILIKE '%sggm%' OR concept ILIKE '%doctor%' OR concept ILIKE '%farmacia%'
    OR concept ILIKE '%nutri%' OR concept ILIKE '%dentista%' THEN 'salud'
  WHEN concept ILIKE '%renta%' OR concept ILIKE '%limpieza%' THEN 'vivienda'
  WHEN concept ILIKE '%luz%' OR concept ILIKE '%agua%' OR concept ILIKE '%gas%'
    OR concept ILIKE '%internet%' OR concept ILIKE '%cfe%' OR concept ILIKE '%telmex%' THEN 'servicios'
  WHEN concept ILIKE '%comida%' OR concept ILIKE '%despensa%' OR concept ILIKE '%super%' THEN 'alimentacion'
  WHEN concept ILIKE '%diversion%' OR concept ILIKE '%diversión%' THEN 'diversion'
  ELSE 'otros'
END
WHERE category = 'otros';

-- Recrear la vista para que exponga category (re.* la incluye, pero queda antes de
-- las columnas calculadas — CREATE OR REPLACE no permite reordenar: DROP + CREATE)
DROP VIEW IF EXISTS recurring_expenses_split;
CREATE VIEW recurring_expenses_split AS
SELECT
  re.*,
  CASE
    WHEN re.ownership = 'shared' THEN ROUND(re.total_amount * sp.lalo_pct / 100, 2)
    WHEN re.ownership = 'lalo'   THEN re.total_amount
    ELSE 0
  END AS lalo_amount,
  CASE
    WHEN re.ownership = 'shared' THEN ROUND(re.total_amount * sp.ale_pct / 100, 2)
    WHEN re.ownership = 'ale'    THEN re.total_amount
    ELSE 0
  END AS ale_amount
FROM recurring_expenses re
CROSS JOIN get_split_percentages() sp
WHERE re.is_active = TRUE;
