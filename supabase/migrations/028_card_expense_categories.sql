-- Categorías en gastos de tarjeta (extras) para el módulo Análisis.
-- Auto-clasificación inicial por palabras clave; se corrige con el lápiz de Tarjetas.

ALTER TABLE card_expenses ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'otros';

UPDATE card_expenses SET category = CASE
  WHEN concept ILIKE '%figo%' OR concept ILIKE '%mila%' OR concept ILIKE '%croquet%'
    OR concept ILIKE '%vet%' OR concept ILIKE '%perrit%' THEN 'mascotas'
  WHEN concept ILIKE '%comida%' OR concept ILIKE '%despensa%' OR concept ILIKE '%super%'
    OR concept ILIKE '%torta%' THEN 'alimentacion'
  WHEN concept ILIKE '%playera%' OR concept ILIKE '%ropa%' OR concept ILIKE '%tenis%'
    OR concept ILIKE '%pijama%' OR concept ILIKE '%reloj%' OR concept ILIKE '%pantal%'
    OR concept ILIKE '%vestido%' THEN 'ropa'
  WHEN concept ILIKE '%farmacia%' OR concept ILIKE '%suero%' OR concept ILIKE '%medicina%'
    OR concept ILIKE '%doctor%' OR concept ILIKE '%dentista%' OR concept ILIKE '%nutri%'
    OR concept ILIKE '%enferm%' THEN 'salud'
  WHEN concept ILIKE '%fabuloso%' OR concept ILIKE '%jabon%' OR concept ILIKE '%jabón%'
    OR concept ILIKE '%limpiador%' OR concept ILIKE '%limpieza%' OR concept ILIKE '%cortina%'
    OR concept ILIKE '%toallita%' OR concept ILIKE '%aceite%' THEN 'hogar'
  WHEN concept ILIKE '%gasolina%' OR concept ILIKE '%uber%' OR concept ILIKE '%caseta%' THEN 'transporte'
  ELSE 'otros'
END
WHERE category = 'otros';

-- Mascotas también puede existir en gastos fijos (croquetas recurrentes)
UPDATE recurring_expenses SET category = 'mascotas'
WHERE category = 'otros'
  AND (concept ILIKE '%figo%' OR concept ILIKE '%mila%' OR concept ILIKE '%croquet%'
       OR concept ILIKE '%vet%' OR concept ILIKE '%perrit%');
