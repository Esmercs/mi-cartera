# Créditos y préstamos — diseño

Fecha: 2026-08-18

## Problema

MiCapital no puede representar un crédito. Los tres modelos existentes se quedan cortos:

- `card_expenses` / `card_expense_installments` — cuotas de monto fijo conocido de antemano, sin interés ni saldo insoluto.
- `recurring_expenses` — monto fijo recurrente, sin deuda acumulada.
- `inter_person_debts` — deuda puntual entre personas, sin tasa.

Hace falta: capturar un crédito, ver el saldo real crecer con su tasa mes con mes, abonar montos libres, y que la parte de cada persona aparezca en su quincena.

## Decisiones tomadas

| Decisión | Elección | Por qué |
|---|---|---|
| Cálculo de la deuda | Saldo insoluto, el interés capitaliza | Es cómo funciona un crédito real |
| Tasa | Anual simple, **sin IVA** | Es un préstamo personal, no una tarjeta |
| Split de compartidos | Porcentaje global vigente (`get_split_percentages`) | Consistente con `recurring_expenses_split` |
| Quién paga al banco | Configurable por crédito (`paid_by`) | Reutiliza el patrón ya conocido de gastos fijos |
| Monto en la quincena | Cuota fija amortizada, **nunca cambia** | Un abono extra acorta el plazo, no la cuota |
| Fechas | Un `payment_day` (15 o 30) por crédito | Cae en la quincena de cada quien según ese día |
| Ubicación | Sección propia en la página Tarjetas | Entidad nueva, sin mezclarse con el ledger de tarjetas |

### Consecuencia aceptada del split global

La parte de cada persona se deriva en vivo (`saldo × porcentaje`), no de un ledger de aportaciones. Dos implicaciones que el usuario aceptó explícitamente:

1. Si cambia el split global, la repartición del **saldo pendiente** se recalcula. El histórico de movimientos no se toca.
2. **Todo abono se reparte con los mismos porcentajes**, incluido uno extra. Si abonas $6,000 en vez de $4,500, el otro queda debiendo su porcentaje de los $6,000 completos.

Atribuir un abono a una sola persona exigiría un ledger de aportaciones por persona en lugar de derivar del saldo. Queda fuera de alcance; si estorba, se agrega después una casilla "este abono es solo mío" junto con ese modelo.

## Modelo de datos

### `credits`

```sql
CREATE TABLE credits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID REFERENCES profiles,          -- NULL si ownership='shared'
  ownership       TEXT NOT NULL CHECK (ownership IN ('lalo','ale','shared')),
  paid_by         TEXT NOT NULL DEFAULT 'each' CHECK (paid_by IN ('each','lalo','ale')),
  name            TEXT NOT NULL,                     -- "Prestamo Banamex"
  principal       DECIMAL(12,2) NOT NULL CHECK (principal > 0),
  annual_rate     DECIMAL(6,3) NOT NULL DEFAULT 0 CHECK (annual_rate >= 0),  -- % anual, 0 = sin interés
  term_months     INTEGER NOT NULL CHECK (term_months > 0),
  monthly_payment DECIMAL(12,2) NOT NULL CHECK (monthly_payment > 0),
  payment_day     SMALLINT NOT NULL DEFAULT 15 CHECK (payment_day IN (15, 30)),
  started_at      DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

`payment_day` se restringe a 15 y 30 a propósito: son los únicos cortes de quincena que existen (`getOffsetPeriodDates` solo devuelve `payDay: 15 | 30`). Un valor distinto haría que el crédito nunca apareciera en ninguna quincena — el mismo hoyo que ya tiene `recurring_expenses`.

### `credit_movements`

```sql
CREATE TABLE credit_movements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id      UUID NOT NULL REFERENCES credits ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('disbursement','interest','payment')),
  amount         DECIMAL(12,2) NOT NULL CHECK (amount > 0),  -- siempre positivo
  effective_date DATE NOT NULL,
  accrual_month  DATE,          -- primer día del mes; solo para kind='interest'
  created_by     UUID REFERENCES auth.users,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT accrual_only_interest
    CHECK ((kind = 'interest') = (accrual_month IS NOT NULL))
);

-- Idempotencia del devengo: un solo interés por crédito y por mes
CREATE UNIQUE INDEX credit_interest_once
  ON credit_movements (credit_id, accrual_month) WHERE kind = 'interest';

CREATE INDEX idx_cm_credit ON credit_movements (credit_id, effective_date);
```

`amount` siempre positivo y `kind` define la dirección. El saldo es **derivado**, nunca una columna:

```
saldo(D) = Σ amount[disbursement | interest] − Σ amount[payment]
           sobre los movimientos con effective_date <= D
```

`effective_date` es lo que ordena el ledger: `started_at` para el desembolso, último día de `accrual_month` para el interés, la fecha del abono para un pago. Existe para que el devengo atrasado use el saldo **de ese mes** y no el de hoy.

### `credits_split` (vista)

Espejo de `recurring_expenses_split`:

```sql
CREATE OR REPLACE VIEW credits_split AS
SELECT
  c.*,
  COALESCE(b.balance, 0) AS balance,
  CASE WHEN c.ownership = 'shared' THEN ROUND(c.monthly_payment * sp.lalo_pct / 100, 2)
       WHEN c.ownership = 'lalo'   THEN c.monthly_payment ELSE 0 END AS lalo_payment,
  CASE WHEN c.ownership = 'shared' THEN ROUND(c.monthly_payment * sp.ale_pct  / 100, 2)
       WHEN c.ownership = 'ale'    THEN c.monthly_payment ELSE 0 END AS ale_payment,
  CASE WHEN c.ownership = 'shared' THEN ROUND(COALESCE(b.balance,0) * sp.lalo_pct / 100, 2)
       WHEN c.ownership = 'lalo'   THEN COALESCE(b.balance,0) ELSE 0 END AS lalo_balance,
  CASE WHEN c.ownership = 'shared' THEN ROUND(COALESCE(b.balance,0) * sp.ale_pct  / 100, 2)
       WHEN c.ownership = 'ale'    THEN COALESCE(b.balance,0) ELSE 0 END AS ale_balance
FROM credits c
CROSS JOIN get_split_percentages() sp
LEFT JOIN (
  SELECT credit_id,
         SUM(CASE WHEN kind = 'payment' THEN -amount ELSE amount END) AS balance
  FROM credit_movements GROUP BY credit_id
) b ON b.credit_id = c.id;
```

### `credit_settlements`

`internal_debt_settlements` no sirve: su FK a `recurring_expenses` es NOT NULL. Tabla nueva con la misma forma y las mismas políticas, con `credit_id` en lugar de `recurring_expense_id` y `UNIQUE (credit_id, period_date, payer)`.

### RLS

Políticas espejo de `recurring_expenses`, **corrigiendo de entrada el hoyo que tiene**: `recurring_insert` exige `owner_id = auth.uid()`, lo que bloquea insertar un compartido (`owner_id NULL`). Las de `credits` aceptan shared en las cuatro operaciones:

- `credits_select` — `is_approved() AND (ownership='shared' OR owner_id = auth.uid() OR is_admin())`
- `credits_insert` / `credits_update` / `credits_delete` — `is_approved() AND (ownership='shared' OR owner_id = auth.uid() OR is_admin())`
- `credit_movements` — SELECT e INSERT si el crédito es visible. DELETE distingue por `kind`:
  - `payment` — solo `created_by = auth.uid()`. Un abono es de quien lo registró.
  - `interest` — cualquiera que vea el crédito. Los genera el sistema, no una persona: si Ale devengó un mes y Lalo necesita "recalcular intereses", tiene que poder borrarlo. Atarlo a `created_by` dejaría el recálculo roto para el otro usuario.
  - `disbursement` — nadie; se va con el crédito por `ON DELETE CASCADE`.
- `credit_settlements` — igual que `internal_debt_settlements`

## Matemática (`lib/utils/credit-math.ts`)

Funciones puras, sin Supabase, testeables aisladas.

```ts
// Tasa mensual. Sin IVA: es un préstamo personal, no una tarjeta de crédito.
monthlyRate(annualRate: number): number
  → annualRate / 100 / 12

// Cuota fija amortizada. Con tasa 0 cae a principal/plazo (sin división por cero).
amortizedPayment(principal, annualRate, termMonths): number
  → i === 0 ? principal / n : principal * i / (1 - (1 + i) ** -n)

// Interés devengado de un mes, redondeado a centavos
accruedInterest(balance, annualRate): number

// Proyección con la cuota fija: cuántos meses faltan, cuándo se liquida,
// cuánto interés queda por pagar. Tope de 600 iteraciones.
projectPayoff(balance, annualRate, monthlyPayment, fromDate)
  → { months: number; payoffDate: string; remainingInterest: number }
```

`amortizedPayment` solo **sugiere** la cuota al crear el crédito; el campo es editable porque los bancos redondean y agregan comisiones. Si tu cuota real es $4,500, esa manda y esa se guarda.

Verificación del comportamiento pedido (principal $100,000, 24% anual, 24 meses → cuota $5,287.11):

| | Meses | Interés total |
|---|---|---|
| Sin abonos extra | 24 | $26,890.63 |
| Con $20,000 extra en el mes 6 | 19 | $19,503.53 (ahorra $7,387.10) |

La cuota no se mueve; se acorta el plazo y baja el interés.

**Extensión si algún día se agrega un crédito de tarjeta:** las tarjetas mexicanas sí cobran IVA sobre el interés. Eso se resuelve con una columna `applies_iva BOOLEAN DEFAULT FALSE` y un multiplicador en `monthlyRate`. Queda fuera de alcance mientras todos los créditos sean préstamos personales — no vale meter una casilla en el formulario para un caso que hoy no existe.

## Devengo del interés (`lib/utils/accrue-credit-interest.ts`)

Materialización perezosa al cargar la página, mismo patrón que `materializeCardCharges` y la creación de periodos.

```
para cada crédito activo visible con annual_rate > 0:
  mes ← primer mes sin movimiento 'interest', empezando en el mes siguiente a started_at
  repetir hasta 12 veces, mientras mes <= mes actual:
    saldo ← saldo al último día de ese mes   (solo movimientos con effective_date <= fin de mes)
    interes ← accruedInterest(saldo, annual_rate)
    si interes < 0.01: avanzar mes y continuar
    insertar movimiento kind='interest', amount=interes,
            accrual_month = primer día del mes, effective_date = último día del mes
    si el insert choca con credit_interest_once: break   -- otra carga ya lo hizo
    mes ← mes + 1
```

El tope de 12 evita un bucle largo si la app no se abre en mucho tiempo, igual que `materializeCardCharges`. El orden cronológico importa: el interés de cada mes se calcula sobre el saldo que incluye el interés de los meses previos, y `effective_date` garantiza que un abono hecho en el mes N baje el saldo antes de devengar el mes N+1.

## Integración

### Dashboard

Un crédito activo cuyo `payment_day` coincide con el corte de la quincena entra a `nextItems` con `type: 'credito'`, reutilizando el desdoblamiento que ya existe para compartidos:

| `paid_by` | Se muestra | Al pagar |
|---|---|---|
| yo | mi parte de la cuota, con "Cargo $4,500 · Ale aporta $1,080" | `period_payments` = mi parte · `credit_movements` = abono completo |
| el otro | no aparece; mi parte va a "Le debo a …" | — |
| cada quien | mi parte | mi parte en ambos |

Reutiliza los campos ya existentes en `NextItem`: `amount` = mi parte, `sharedTotal` / `sharedOtherAmount` para el desglose, `ledgerAmount` para el abono al banco. Hay que agregar `'credito'` al union de `type` y enrutar el pago a la lógica de créditos en lugar de `settleRecurringCardCharge`.

Se descuenta lo ya pagado en la quincena por el mismo mecanismo que los fijos (`paidAmounts` por concepto), de modo que un crédito ya abonado desaparece de la lista.

### Análisis

Nuevo `infoRow` "Créditos y préstamos" en el bloque **Ahorro y deudas**, junto a los MSI, con mi parte de la cuota y un item por crédito. Entra en el cálculo de `committedMonthly` igual que `input.msiMonthly`: es una obligación comprometida. Ya es mensual, así que **no** pasa por `monthlyEquivalent`.

### Gastos fijos

No aparece. Un crédito no es un `recurring_expense` y listarlo ahí duplicaría el conteo con el bloque de deudas.

## UI

Sección "Créditos y préstamos" en `/tarjetas`, debajo de "Mis tarjetas". El "Deuda total" del encabezado suma los saldos de créditos.

**Fila colapsada** — nombre, saldo actual, barra de avance (% del principal liquidado), "cuota $4,500 · día 15", y `+ $X de Ale` cuando hay parte a recabar.

**Expandida** — interés devengado del mes en curso, mi parte y lo a recabar, plazo restante con fecha estimada de liquidación, historial de movimientos, y botón "Registrar abono".

**Registrar abono** — monto libre con la cuota como valor por omisión. Muestra cómo se reparte y advierte si el abono no alcanza a cubrir el interés del mes (la deuda crecería).

**Alta y edición** — nombre, monto original, tasa anual, plazo, cuota (autocalculada y editable), día de pago, dueño, quién paga, fecha de inicio.

Componentes nuevos, todos en `components/tarjetas/`: `credits-section.tsx`, `credit-row.tsx`, `add-credit-form.tsx`, `edit-credit-button.tsx`, `register-credit-payment-button.tsx`. Archivos chicos y enfocados; la página de tarjetas ya tiene 10 kB de bundle y no conviene engordarla.

## Bordes y errores

| Caso | Comportamiento |
|---|---|
| Abono mayor al saldo | Se topa al saldo y avisa "liquidas el crédito, sobran $X" |
| Saldo llega a cero | `is_active = false`, pasa a una sección de liquidados |
| Tasa 0% | Sin movimientos de interés; la cuota cae a `principal / plazo` |
| Abono que no cubre el interés | Se permite, con advertencia explícita de que la deuda crece |
| Borrar un abono viejo | El saldo se recalcula, pero el interés ya devengado **no**. Acción explícita "recalcular intereses" que borra y regenera los movimientos de interés desde `started_at` |
| Escritura bloqueada por RLS | Toda escritura usa `.select()` y verifica filas afectadas. RLS filtra en silencio en lugar de lanzar error — el bug que ya nos mordió en `edit-expense-button` |
| Dos cargas concurrentes devengando | El índice único `credit_interest_once` deja pasar una sola; la otra corta |

## Pruebas

El proyecto no tiene runner. La matemática vive aislada en `lib/utils/credit-math.ts` como funciones puras y se verifica con un script de Node (`node --experimental-strip-types`), como se hizo con `monthlyEquivalent`. Casos a cubrir:

- `amortizedPayment` con tasa 0 y con tasa positiva
- La cuota amortiza exactamente en el plazo cuando no hay abonos extra
- Un abono extra acorta el plazo y **no** mueve la cuota
- `accruedInterest` con saldo 0 y con tasa 0
- `projectPayoff` no entra en bucle infinito cuando la cuota no cubre el interés

Si se quiere red de seguridad permanente, instalar Vitest y convertirlos en tests de verdad. Queda a decisión del usuario, fuera del alcance base.

## Fuera de alcance

- Ledger de aportaciones por persona (atribuir un abono a uno solo)
- Cargar gastos a un crédito como si fuera tarjeta
- Tabla de amortización completa mes por mes en pantalla
- Comisiones, seguros o pagos anticipados con penalización
- Recalcular el interés histórico al editar la tasa (la tasa nueva aplica desde el siguiente devengo)

## Orden de construcción

1. Migración: tablas, vista, índices, RLS
2. `lib/utils/credit-math.ts` + verificación de la matemática
3. `lib/utils/accrue-credit-interest.ts` + llamada al cargar `/tarjetas`
4. UI en Tarjetas: sección, alta, edición, registrar abono
5. Integración al Dashboard (`type: 'credito'`)
6. Integración a Análisis (bloque Ahorro y deudas)

Cada paso es desplegable por sí solo: los pasos 1–4 dan un módulo funcional aunque el crédito todavía no aparezca en la quincena.
