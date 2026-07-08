-- Diversion debe dividirse "cada quien su parte" en lugar de que Lalo adelante el total.
-- Con paid_by='each' el desglose de la quincena muestra solo la parte de cada persona
-- (Lalo: $3,038.66) y deja de aparecer como deuda interna "Ale me debe".

UPDATE recurring_expenses
SET paid_by = 'each'
WHERE concept = 'Diversion'
  AND ownership = 'shared';
