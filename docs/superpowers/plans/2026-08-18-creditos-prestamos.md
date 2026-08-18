# Créditos y préstamos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar créditos con tasa de interés, ver el saldo real crecer mes con mes, abonar montos libres, y que la parte de cada persona aparezca en su quincena.

**Architecture:** Entidad nueva `credits` con un ledger `credit_movements` (desembolso, interés devengado, abonos) del que se **deriva** el saldo — nunca una columna mutable. La matemática vive en funciones puras aisladas. El interés se devenga perezosamente al cargar `/tarjetas`, igual que `materializeCardCharges`. La repartición entre personas usa la vista `credits_split`, espejo de `recurring_expenses_split`.

**Tech Stack:** Next.js 14 App Router (server components), Supabase (Postgres + RLS), TypeScript, Tailwind, date-fns.

**Spec:** [`docs/superpowers/specs/2026-08-18-creditos-prestamos-design.md`](../specs/2026-08-18-creditos-prestamos-design.md)

---

## Contexto que el ingeniero necesita

**Convenciones del proyecto, no negociables:**

- `createServerClient()` de `@/lib/supabase/server` en server components; `createClient()` de `@/lib/supabase/client` en client components (`'use client'`).
- Las queries de Supabase van tipadas con `as unknown as Promise<{ data: T | null }>` porque los tipos generados de la BD no están en el repo. `next.config.js` tiene `typescript.ignoreBuildErrors: true`, así que **TypeScript no te va a atrapar los errores** — verifica con `npx next build` y leyendo el código.
- **RLS no lanza error**: si una política filtra la fila, un `update`/`delete`/`insert` afecta 0 renglones y Supabase regresa `error: null`. Toda escritura debe hacer `.select()` y verificar `data.length`, o el usuario ve "guardado" sin que se guarde nada. Este bug ya nos mordió en `components/gastos-fijos/edit-expense-button.tsx`.
- Montos siempre redondeados a centavos con `Math.round(n * 100) / 100`.
- Todo el texto de UI en español. Comentarios en español, explicando **por qué**, no qué.
- `formatMXN` de `@/lib/utils/currency` para dinero.

**Las migraciones del repo NO están necesariamente aplicadas en la base de datos.** Nunca corras `supabase db push` sin permiso explícito del usuario. La Tarea 1 termina pidiéndolo.

**Perfiles:** `profiles.display_name` es `'Lalo'` o `'Ale'`. El patrón en todas las páginas es `const isLalo = profile?.display_name?.toLowerCase() === 'lalo'` y `const myOwnership = isLalo ? 'lalo' : 'ale'`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/029_credits.sql` | Tablas, vista, índices, RLS |
| `types/database.ts` *(modificar)* | `Credit`, `CreditSplit`, `CreditMovement`, `CreditKind` |
| `lib/utils/credit-math.ts` | Matemática pura: tasa, interés, cuota, proyección |
| `scripts/verify-credit-math.mjs` | Verificación ejecutable de la matemática |
| `lib/utils/accrue-credit-interest.ts` | Devengo perezoso del interés mensual |
| `lib/utils/credit-balance.ts` | Derivar saldo y desglose desde los movimientos |
| `components/tarjetas/credits-section.tsx` | Sección completa (server-rendered) |
| `components/tarjetas/credit-row.tsx` | Fila colapsable de un crédito |
| `components/tarjetas/add-credit-form.tsx` | Alta |
| `components/tarjetas/edit-credit-button.tsx` | Edición |
| `components/tarjetas/delete-credit-button.tsx` | Borrado |
| `components/tarjetas/register-credit-payment-button.tsx` | Registrar abono |
| `components/tarjetas/recalc-interest-button.tsx` | Recalcular intereses |
| `app/(app)/tarjetas/page.tsx` *(modificar)* | Query, devengo, render de la sección |
| `app/(app)/dashboard/page.tsx` *(modificar)* | Item `type: 'credito'` en la quincena |
| `app/(app)/analisis/page.tsx` *(modificar)* | Pasar créditos al motor |
| `lib/utils/financial-analysis.ts` *(modificar)* | Bloque Ahorro y deudas |

Cada componente es un archivo chico y enfocado a propósito: `app/(app)/tarjetas/page.tsx` ya tiene 304 líneas y 10 kB de bundle, y meterle la sección inline la volvería inmanejable.

---

## Task 1: Migración de base de datos

**Files:**
- Create: `supabase/migrations/029_credits.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Créditos y préstamos: deuda con tasa de interés, saldo insoluto y abonos libres.
-- El saldo NO se guarda: se deriva de credit_movements (ver vista credits_split).
-- Diseño: docs/superpowers/specs/2026-08-18-creditos-prestamos-design.md

CREATE TABLE IF NOT EXISTS credits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID REFERENCES profiles,          -- NULL si ownership='shared'
  ownership       TEXT NOT NULL CHECK (ownership IN ('lalo','ale','shared')),
  paid_by         TEXT NOT NULL DEFAULT 'each' CHECK (paid_by IN ('each','lalo','ale')),
  name            TEXT NOT NULL,
  principal       DECIMAL(12,2) NOT NULL CHECK (principal > 0),
  -- % anual simple. Sin IVA: son préstamos personales, no tarjetas. 0 = sin interés.
  annual_rate     DECIMAL(6,3) NOT NULL DEFAULT 0 CHECK (annual_rate >= 0),
  term_months     INTEGER NOT NULL CHECK (term_months > 0),
  monthly_payment DECIMAL(12,2) NOT NULL CHECK (monthly_payment > 0),
  -- Solo 15 y 30: son los únicos cortes de quincena que existe (getOffsetPeriodDates
  -- devuelve payDay 15|30). Otro valor haría que el crédito no salga en ninguna quincena.
  payment_day     SMALLINT NOT NULL DEFAULT 15 CHECK (payment_day IN (15, 30)),
  started_at      DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_movements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id      UUID NOT NULL REFERENCES credits ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('disbursement','interest','payment')),
  amount         DECIMAL(12,2) NOT NULL CHECK (amount > 0),   -- siempre positivo; kind da el signo
  -- Ordena el ledger: started_at el desembolso, fin de mes el interés, la fecha del abono
  -- un pago. Existe para que un devengo atrasado use el saldo DE ESE MES y no el de hoy.
  effective_date DATE NOT NULL,
  accrual_month  DATE,                                        -- primer día del mes; solo interés
  created_by     UUID REFERENCES auth.users,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT accrual_only_interest
    CHECK ((kind = 'interest') = (accrual_month IS NOT NULL))
);

-- Idempotencia del devengo: un solo interés por crédito y mes. Si dos cargas de la
-- página compiten, una gana y la otra corta.
CREATE UNIQUE INDEX IF NOT EXISTS credit_interest_once
  ON credit_movements (credit_id, accrual_month) WHERE kind = 'interest';

CREATE INDEX IF NOT EXISTS idx_cm_credit ON credit_movements (credit_id, effective_date);

-- Liquidaciones de la parte del otro. internal_debt_settlements no sirve: su FK a
-- recurring_expenses es NOT NULL.
CREATE TABLE IF NOT EXISTS credit_settlements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id       UUID NOT NULL REFERENCES credits ON DELETE CASCADE,
  period_date     DATE NOT NULL,
  payer           TEXT NOT NULL CHECK (payer IN ('lalo','ale')),
  amount          DECIMAL(12,2) NOT NULL,
  paid_at         DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_by_user_id UUID NOT NULL REFERENCES auth.users,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (credit_id, period_date, payer)
);

-- Vista con el split vigente y el saldo derivado. Espejo de recurring_expenses_split.
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

ALTER TABLE credits            ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_movements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_settlements ENABLE ROW LEVEL SECURITY;

-- Las cuatro operaciones aceptan shared (owner_id NULL). recurring_expenses tiene el
-- hoyo de exigir owner_id = auth.uid() en INSERT, lo que bloquea crear compartidos.
CREATE POLICY "credits_select" ON credits FOR SELECT
  USING (is_approved() AND (ownership = 'shared' OR owner_id = auth.uid() OR is_admin()));

CREATE POLICY "credits_insert" ON credits FOR INSERT
  WITH CHECK (is_approved() AND (ownership = 'shared' OR owner_id = auth.uid() OR is_admin()));

CREATE POLICY "credits_update" ON credits FOR UPDATE
  USING (is_approved() AND (ownership = 'shared' OR owner_id = auth.uid() OR is_admin()));

CREATE POLICY "credits_delete" ON credits FOR DELETE
  USING (is_approved() AND (ownership = 'shared' OR owner_id = auth.uid() OR is_admin()));

CREATE POLICY "cm_select" ON credit_movements FOR SELECT
  USING (is_approved() AND EXISTS (
    SELECT 1 FROM credits c WHERE c.id = credit_movements.credit_id
      AND (c.ownership = 'shared' OR c.owner_id = auth.uid() OR is_admin())));

CREATE POLICY "cm_insert" ON credit_movements FOR INSERT
  WITH CHECK (is_approved() AND EXISTS (
    SELECT 1 FROM credits c WHERE c.id = credit_id
      AND (c.ownership = 'shared' OR c.owner_id = auth.uid() OR is_admin())));

-- Un abono es de quien lo registró; el interés lo genera el sistema, así que
-- cualquiera que vea el crédito puede borrarlo — si no, "recalcular intereses"
-- quedaría roto para el usuario que no devengó ese mes.
CREATE POLICY "cm_delete" ON credit_movements FOR DELETE
  USING (is_approved() AND EXISTS (
    SELECT 1 FROM credits c WHERE c.id = credit_movements.credit_id
      AND (c.ownership = 'shared' OR c.owner_id = auth.uid() OR is_admin()))
    AND (kind = 'interest' OR created_by = auth.uid()));

CREATE POLICY "cs_select" ON credit_settlements FOR SELECT
  USING (is_approved() AND EXISTS (
    SELECT 1 FROM credits c WHERE c.id = credit_settlements.credit_id AND c.ownership = 'shared'));

CREATE POLICY "cs_insert" ON credit_settlements FOR INSERT
  WITH CHECK (is_approved() AND paid_by_user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM credits c WHERE c.id = credit_id AND c.ownership = 'shared'));

CREATE POLICY "cs_delete" ON credit_settlements FOR DELETE
  USING (is_approved() AND paid_by_user_id = auth.uid());
```

- [ ] **Step 2: Verificar que la sintaxis es válida sin aplicar nada**

Run: `grep -c ";" supabase/migrations/029_credits.sql`
Expected: un número ≥ 25 (cada statement termina en `;`).

Revisa a mano que `get_split_percentages()`, `is_approved()` e `is_admin()` existen:

Run: `grep -rn "FUNCTION get_split_percentages\|FUNCTION is_approved\|FUNCTION is_admin" supabase/migrations/*.sql`
Expected: al menos una definición de cada una.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/029_credits.sql
git commit -m "Add credits and loans schema with derived balance ledger"
```

- [ ] **Step 4: PARAR y pedir permiso para aplicar**

**No corras `supabase db push`.** Dile al usuario:

> La migración `029_credits.sql` está lista y commiteada. Necesito tu permiso para aplicarla con `supabase db push` — crea 3 tablas, 1 vista y 11 políticas RLS. ¿Le doy?

Espera respuesta. Si el usuario prefiere aplicarla él, las tareas siguientes se pueden escribir igual, pero **no van a funcionar en runtime** hasta que exista el esquema.

---

## Task 2: Tipos de TypeScript

**Files:**
- Modify: `types/database.ts`

- [ ] **Step 1: Agregar los tipos al final del archivo**

```ts
// ── Créditos y préstamos ──

export type CreditKind = 'disbursement' | 'interest' | 'payment'

export interface Credit {
  id: string
  owner_id: string | null
  ownership: Ownership
  paid_by: PaidBy
  name: string
  principal: number
  annual_rate: number      // % anual simple, sin IVA
  term_months: number
  monthly_payment: number  // cuota fija; un abono extra NO la mueve
  payment_day: 15 | 30
  started_at: string
  is_active: boolean
  notes: string | null
  created_at: string
}

// Vista credits_split: agrega el saldo derivado y el split vigente
export interface CreditSplit extends Credit {
  balance: number
  lalo_payment: number
  ale_payment: number
  lalo_balance: number
  ale_balance: number
}

export interface CreditMovement {
  id: string
  credit_id: string
  kind: CreditKind
  amount: number           // siempre positivo; `kind` da la dirección
  effective_date: string
  accrual_month: string | null
  created_by: string | null
  notes: string | null
  created_at: string
}
```

- [ ] **Step 2: Verificar que `Ownership` y `PaidBy` ya existen**

Run: `grep -n "export type Ownership\|export type PaidBy" types/database.ts`
Expected: dos líneas. Si `PaidBy` no existe, búscalo con `grep -n "PaidBy" types/database.ts` y usa el nombre real.

- [ ] **Step 3: Commit**

```bash
git add types/database.ts
git commit -m "Add Credit, CreditSplit and CreditMovement types"
```

---

## Task 3: Matemática del crédito (TDD)

El proyecto no tiene runner de tests. La verificación es un script ejecutable que importa el módulo real usando el stripping de tipos nativo de Node (v25 en esta máquina).

**Files:**
- Create: `lib/utils/credit-math.ts`
- Create: `scripts/verify-credit-math.mjs`

- [ ] **Step 1: Escribir el script de verificación que falla**

```js
// Verificación de lib/utils/credit-math.ts — funciones puras, sin BD.
// Correr: node --experimental-strip-types scripts/verify-credit-math.mjs
import {
  monthlyRate, accruedInterest, amortizedPayment, projectPayoff,
} from '../lib/utils/credit-math.ts'

let fails = 0
function check(label, actual, expected, tol = 0.01) {
  const ok = typeof expected === 'number'
    ? Math.abs(actual - expected) <= tol
    : JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}  →  ${JSON.stringify(actual)}${ok ? '' : ` (esperado ${JSON.stringify(expected)})`}`)
  if (!ok) fails++
}

console.log('monthlyRate')
check('24% anual → 2% mensual', monthlyRate(24), 0.02, 1e-9)
check('0% → 0', monthlyRate(0), 0, 1e-9)

console.log('accruedInterest')
check('saldo 100000 a 24%', accruedInterest(100000, 24), 2000)
check('saldo 0 → 0', accruedInterest(0, 24), 0)
check('tasa 0 → 0', accruedInterest(100000, 0), 0)
check('saldo negativo → 0', accruedInterest(-500, 24), 0)

console.log('amortizedPayment')
check('100000 a 24% en 24 meses', amortizedPayment(100000, 24, 24), 5287.11)
check('tasa 0 reparte parejo', amortizedPayment(120000, 0, 24), 5000)
check('plazo 0 → 0 (sin dividir entre cero)', amortizedPayment(100000, 24, 0), 0)

console.log('projectPayoff')
// La cuota amortizada liquida exactamente en el plazo
check('24 meses con la cuota calculada', projectPayoff(100000, 24, 5287.11).months, 24, 0)
check('saldo 0 → 0 meses', projectPayoff(0, 24, 5287.11).months, 0, 0)
check('interés restante a 24 meses', projectPayoff(100000, 24, 5287.11).remainingInterest, 26890.63, 1)
// La regla del usuario: un abono extra acorta el plazo, la cuota no cambia
const sinExtra = projectPayoff(100000, 24, 5287.11)
const conExtra = projectPayoff(80000, 24, 5287.11)   // como si hubiera abonado 20000 extra hoy
check('abonar 20000 acorta el plazo', conExtra.months < sinExtra.months, true)
// Cuota que no cubre el interés: hay que decirlo, no colgarse
check('cuota menor al interés → neverPaysOff', projectPayoff(100000, 24, 100).neverPaysOff, true)
check('neverPaysOff no reporta meses', projectPayoff(100000, 24, 100).months, 0, 0)

console.log(fails === 0 ? '\nTODO PASA' : `\n${fails} FALLAS`)
process.exit(fails ? 1 : 0)
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `node --experimental-strip-types scripts/verify-credit-math.mjs`
Expected: FALLA con `ERR_MODULE_NOT_FOUND` — `lib/utils/credit-math.ts` no existe todavía.

- [ ] **Step 3: Escribir la implementación mínima**

```ts
// Matemática de créditos. Funciones puras: sin Supabase, sin leer la fecha del
// sistema, sin efectos. Todo lo que decide dinero vive aquí para poder verificarlo
// aislado con scripts/verify-credit-math.mjs.
//
// Sin IVA sobre el interés: son préstamos personales, no tarjetas de crédito
// (las tarjetas mexicanas sí lo cobran — ver la nota de extensión en el spec).

const r2 = (n: number) => Math.round(n * 100) / 100

/** Tasa mensual a partir de la anual en porcentaje. 24 → 0.02 */
export function monthlyRate(annualRate: number): number {
  return annualRate / 100 / 12
}

/** Interés que devenga un saldo en un mes, a centavos. */
export function accruedInterest(balance: number, annualRate: number): number {
  if (balance <= 0 || annualRate <= 0) return 0
  return r2(balance * monthlyRate(annualRate))
}

/**
 * Cuota fija que amortiza `principal` en exactamente `termMonths` pagos.
 * Con tasa 0 es una división simple — no se divide entre cero.
 */
export function amortizedPayment(principal: number, annualRate: number, termMonths: number): number {
  if (termMonths <= 0 || principal <= 0) return 0
  const i = monthlyRate(annualRate)
  if (i === 0) return r2(principal / termMonths)
  return r2(principal * i / (1 - Math.pow(1 + i, -termMonths)))
}

export interface PayoffProjection {
  months: number             // meses que faltan; 0 si ya está liquidado o si nunca liquida
  remainingInterest: number  // interés que queda por devengar
  neverPaysOff: boolean      // la cuota no alcanza a cubrir el interés
}

/**
 * Proyecta la liquidación abonando siempre la misma cuota.
 *
 * Si la cuota no cubre el interés del primer mes, la deuda crece para siempre:
 * eso se reporta con `neverPaysOff` en lugar de iterar 600 veces en balde. El tope
 * de 600 (50 años) existe igual como red por si el redondeo hace que el saldo se
 * estanque sin disparar esa condición.
 */
export function projectPayoff(
  balance: number,
  annualRate: number,
  monthlyPayment: number,
): PayoffProjection {
  if (balance <= 0) return { months: 0, remainingInterest: 0, neverPaysOff: false }
  if (monthlyPayment <= 0) return { months: 0, remainingInterest: 0, neverPaysOff: true }

  let bal = balance
  let interest = 0
  let months = 0
  while (bal > 0.005 && months < 600) {
    const i = accruedInterest(bal, annualRate)
    if (i >= monthlyPayment) return { months: 0, remainingInterest: 0, neverPaysOff: true }
    months++
    interest += i
    bal = r2(bal + i - Math.min(monthlyPayment, bal + i))
  }
  if (months >= 600) return { months: 0, remainingInterest: 0, neverPaysOff: true }
  return { months, remainingInterest: r2(interest), neverPaysOff: false }
}
```

- [ ] **Step 4: Correr para verificar que pasa**

Run: `node --experimental-strip-types scripts/verify-credit-math.mjs`
Expected: todas las líneas `ok` y `TODO PASA`, exit 0.

Si `amortizedPayment(100000, 24, 24)` no da 5287.11, revisa que estés usando `Math.pow(1 + i, -termMonths)` (exponente **negativo**).

- [ ] **Step 5: Commit**

```bash
git add lib/utils/credit-math.ts scripts/verify-credit-math.mjs
git commit -m "Add pure credit math with executable verification"
```

---

## Task 4: Derivar el saldo desde los movimientos

**Files:**
- Create: `lib/utils/credit-balance.ts`
- Modify: `scripts/verify-credit-math.mjs`

- [ ] **Step 1: Agregar la verificación al script (antes del `console.log` final)**

```js
console.log('credit-balance')
const { balanceAsOf, splitInterest } = await import('../lib/utils/credit-balance.ts')
const movs = [
  { kind: 'disbursement', amount: 100000, effective_date: '2026-01-01' },
  { kind: 'interest',     amount: 2000,   effective_date: '2026-01-31' },
  { kind: 'payment',      amount: 5287.11, effective_date: '2026-02-05' },
]
check('saldo al arranque', balanceAsOf(movs, '2026-01-01'), 100000)
check('saldo con el interés del mes', balanceAsOf(movs, '2026-01-31'), 102000)
check('saldo después del abono', balanceAsOf(movs, '2026-02-28'), 96712.89)
check('sin movimientos → 0', balanceAsOf([], '2026-02-28'), 0)
check('ignora lo posterior a la fecha', balanceAsOf(movs, '2026-01-15'), 100000)
check('interés devengado de enero', splitInterest(movs, '2026-01'), 2000)
check('interés de un mes sin devengo', splitInterest(movs, '2026-03'), 0)
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `node --experimental-strip-types scripts/verify-credit-math.mjs`
Expected: FALLA con `ERR_MODULE_NOT_FOUND` para `credit-balance.ts`.

- [ ] **Step 3: Escribir la implementación**

```ts
// El saldo de un crédito NO se guarda en una columna: se deriva del ledger. Así,
// borrar un abono mal capturado corrige el saldo solo, y cada peso es rastreable
// (mismo principio que el ledger de tarjetas).

export interface MovementLike {
  kind: string
  amount: number | string     // Postgres DECIMAL llega como string por el driver
  effective_date: string
  accrual_month?: string | null
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Saldo considerando solo los movimientos con effective_date <= `dateStr`. */
export function balanceAsOf(movements: MovementLike[], dateStr: string): number {
  const total = movements
    .filter(m => m.effective_date <= dateStr)
    .reduce((s, m) => {
      const amt = Number(m.amount)
      return s + (m.kind === 'payment' ? -amt : amt)
    }, 0)
  return r2(total)
}

/** Interés devengado en un mes `yyyy-MM`. 0 si ese mes no se ha devengado. */
export function splitInterest(movements: MovementLike[], monthKey: string): number {
  return r2(movements
    .filter(m => m.kind === 'interest' && (m.accrual_month ?? '').startsWith(monthKey))
    .reduce((s, m) => s + Number(m.amount), 0))
}
```

`amount` acepta `string` a propósito: el driver de Postgres entrega `DECIMAL` como string y `s + "2000"` concatenaría en lugar de sumar. El `Number()` no es decorativo.

- [ ] **Step 4: Correr para verificar que pasa**

Run: `node --experimental-strip-types scripts/verify-credit-math.mjs`
Expected: `TODO PASA`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/credit-balance.ts scripts/verify-credit-math.mjs
git commit -m "Derive credit balance from the movement ledger"
```

---

## Task 5: Devengo perezoso del interés

**Files:**
- Create: `lib/utils/accrue-credit-interest.ts`
- Modify: `app/(app)/tarjetas/page.tsx:31`

Patrón a copiar: `lib/utils/materialize-charges.ts` (mismo estilo de materialización perezosa, tope de 12 ciclos, idempotencia por índice único).

- [ ] **Step 1: Escribir el devengo**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { format, addMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { accruedInterest } from './credit-math'
import { balanceAsOf, type MovementLike } from './credit-balance'

// Devenga el interés mensual que falte de cada crédito activo. Perezoso: corre al
// cargar /tarjetas, igual que materializeCardCharges y la creación de periodos.
//
// Idempotente por el índice único (credit_id, accrual_month) WHERE kind='interest':
// si ambos usuarios abren la página a la vez, uno inserta y el otro corta.
export async function accrueCreditInterest(supabase: SupabaseClient): Promise<void> {
  const currentMonth = startOfMonth(new Date())

  // RLS ya acota a mis créditos + los compartidos
  const { data: credits } = await supabase
    .from('credits')
    .select('id, annual_rate, started_at')
    .eq('is_active', true)
    .gt('annual_rate', 0)

  for (const c of (credits ?? []) as any[]) {
    const { data: movements } = await supabase
      .from('credit_movements')
      .select('kind, amount, effective_date, accrual_month')
      .eq('credit_id', c.id)

    const rows = (movements ?? []) as MovementLike[]

    // Arrancar en el mes siguiente al último devengado, o al siguiente del inicio
    const accrued = rows
      .filter(m => m.kind === 'interest' && m.accrual_month)
      .map(m => m.accrual_month as string)
      .sort()
    let month = accrued.length
      ? addMonths(parseISO(accrued[accrued.length - 1]), 1)
      : addMonths(startOfMonth(parseISO(c.started_at)), 1)
    month = startOfMonth(month)

    // Tope de 12: ponerse al corriente sin bucles largos si la app no se abrió en meses
    for (let guard = 0; guard < 12 && month.getTime() <= currentMonth.getTime(); guard++) {
      const monthEndStr = format(endOfMonth(month), 'yyyy-MM-dd')
      // El saldo AL CIERRE DE ESE MES, no el de hoy: un abono hecho en el mes N ya
      // bajó el saldo antes de devengar el mes N+1.
      const interest = accruedInterest(balanceAsOf(rows, monthEndStr), Number(c.annual_rate))

      if (interest < 0.01) { month = addMonths(month, 1); continue }

      const accrualMonthStr = format(month, 'yyyy-MM-dd')
      const { error } = await supabase.from('credit_movements').insert({
        credit_id:      c.id,
        kind:           'interest',
        amount:         interest,
        accrual_month:  accrualMonthStr,
        effective_date: monthEndStr,
      })
      // 23505 = otra carga ya devengó este mes. Cualquier otro error tampoco vale
      // reintentar: los meses siguientes dependen de este saldo.
      if (error) break

      rows.push({ kind: 'interest', amount: interest, effective_date: monthEndStr, accrual_month: accrualMonthStr })
      month = addMonths(month, 1)
    }
  }
}
```

- [ ] **Step 2: Llamarlo al cargar Tarjetas**

En `app/(app)/tarjetas/page.tsx`, después de la línea 31 (`await materializeCardCharges(...)`):

```tsx
  // Devengar el interés mensual pendiente de los créditos (perezoso, idempotente)
  await accrueCreditInterest(supabase as any)
```

Y el import junto a los demás, después de la línea 14:

```tsx
import { accrueCreditInterest } from '@/lib/utils/accrue-credit-interest'
```

- [ ] **Step 3: Verificar que compila**

Run: `npx next build 2>&1 | grep -iE "error|Compiled successfully"`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add lib/utils/accrue-credit-interest.ts "app/(app)/tarjetas/page.tsx"
git commit -m "Accrue monthly credit interest lazily on the cards page"
```

---

## Task 6: Sección de créditos en Tarjetas (solo lectura)

**Files:**
- Create: `components/tarjetas/credit-row.tsx`
- Create: `components/tarjetas/credits-section.tsx`
- Modify: `app/(app)/tarjetas/page.tsx`

- [ ] **Step 1: Fila colapsable del crédito**

Crear `components/tarjetas/credit-row.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatMXN } from '@/lib/utils/currency'
import { formatShortDate } from '@/lib/utils/date-utils'

export interface CreditRowData {
  id: string
  name: string
  principal: number
  balance: number
  myPayment: number        // mi parte de la cuota
  otherPayment: number     // parte del otro; > 0 solo si yo desembolso
  monthlyPayment: number   // cuota completa al banco
  annualRate: number
  paymentDay: 15 | 30
  monthInterest: number    // interés devengado del mes en curso
  payoffMonths: number
  payoffDate: string | null
  remainingInterest: number
  neverPaysOff: boolean
  movements: { id: string; kind: string; amount: number; date: string }[]
}

const KIND_LABEL: Record<string, string> = {
  disbursement: 'Monto original',
  interest:     'Interés del mes',
  payment:      'Abono',
}

export default function CreditRow({
  credit, otherName, children,
}: {
  credit: CreditRowData
  otherName: string
  children?: React.ReactNode   // botones de acción (abono, editar, borrar, recalcular)
}) {
  const [open, setOpen] = useState(false)
  // Avance sobre el monto original: cuánto del principal ya no debes
  const paidPct = credit.principal > 0
    ? Math.max(0, Math.min(100, Math.round((1 - credit.balance / credit.principal) * 100)))
    : 0

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 gap-2">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 flex-1 text-left min-w-0">
          {open
            ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
            : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{credit.name}</p>
            <p className="text-xs text-gray-400">
              cuota {formatMXN(credit.monthlyPayment)} · día {credit.paymentDay}
              {credit.annualRate > 0 && ` · ${credit.annualRate}% anual`}
              {credit.otherPayment > 0 && (
                <span className="text-green-600"> · + {formatMXN(credit.otherPayment)} de {otherName}</span>
              )}
            </p>
          </div>
        </button>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-red-600">{formatMXN(credit.balance)}</p>
          <p className="text-[10px] text-gray-400">{paidPct}% liquidado</p>
        </div>
      </div>

      <div className="px-3 pb-2">
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full" style={{ width: `${paidPct}%` }} />
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100 px-3 py-2.5 space-y-2">
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Interés devengado este mes</span>
              <span>{formatMXN(credit.monthInterest)}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold text-gray-600">
              <span>Mi parte de la cuota</span>
              <span>{formatMXN(credit.myPayment)}</span>
            </div>
            {credit.otherPayment > 0 && (
              <div className="flex justify-between text-xs font-semibold text-green-700">
                <span>A recibir de {otherName}</span>
                <span>{formatMXN(credit.otherPayment)}</span>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-gray-50 px-2.5 py-2">
            {credit.neverPaysOff ? (
              <p className="text-xs text-amber-700">
                Con esta cuota la deuda no baja: el interés del mes
                ({formatMXN(credit.monthInterest)}) alcanza o supera el abono.
              </p>
            ) : (
              <p className="text-xs text-gray-500">
                Te quedan <span className="font-semibold text-gray-700">{credit.payoffMonths} meses</span>
                {credit.payoffDate && <> · liquidas en {formatShortDate(credit.payoffDate)}</>}
                <span className="block text-[10px] text-gray-400 mt-0.5">
                  Interés por pagar: {formatMXN(credit.remainingInterest)}. Si abonas de más, la
                  cuota no cambia — se acorta el plazo.
                </span>
              </p>
            )}
          </div>

          {credit.movements.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Movimientos</p>
              <div className="space-y-0.5">
                {credit.movements.map(m => (
                  <div key={m.id} className="flex justify-between text-xs">
                    <span className="text-gray-500">
                      {KIND_LABEL[m.kind] ?? m.kind}
                      <span className="text-gray-300 ml-1">{formatShortDate(m.date)}</span>
                    </span>
                    <span className={m.kind === 'payment' ? 'text-green-600' : 'text-gray-600'}>
                      {m.kind === 'payment' ? '−' : '+'}{formatMXN(m.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {children && <div className="flex flex-wrap gap-2 pt-1">{children}</div>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Sección que arma los datos (server component)**

Crear `components/tarjetas/credits-section.tsx`:

```tsx
import { format, addMonths } from 'date-fns'
import { formatMXN } from '@/lib/utils/currency'
import { projectPayoff } from '@/lib/utils/credit-math'
import { splitInterest, type MovementLike } from '@/lib/utils/credit-balance'
import CreditRow, { type CreditRowData } from './credit-row'
import AddCreditForm from './add-credit-form'
import EditCreditButton from './edit-credit-button'
import DeleteCreditButton from './delete-credit-button'
import RegisterCreditPaymentButton from './register-credit-payment-button'
import RecalcInterestButton from './recalc-interest-button'
import type { CreditSplit, CreditMovement } from '@/types/database'

export default function CreditsSection({
  credits, movements, isLalo, otherName, periodId,
}: {
  credits: CreditSplit[]
  movements: CreditMovement[]
  isLalo: boolean
  otherName: string
  periodId: string
}) {
  const myOwnership = isLalo ? 'lalo' : 'ale'
  const monthKey = format(new Date(), 'yyyy-MM')
  const r2 = (n: number) => Math.round(n * 100) / 100

  const rows: CreditRowData[] = credits.map(c => {
    const mine  = Number(isLalo ? c.lalo_payment : c.ale_payment)
    const other = Number(isLalo ? c.ale_payment  : c.lalo_payment)
    // Solo hay algo a recabar cuando YO desembolso el crédito compartido completo
    const iDisburse = c.ownership === 'shared' && c.paid_by === myOwnership
    const mvs = movements.filter(m => m.credit_id === c.id)
    const proj = projectPayoff(Number(c.balance), Number(c.annual_rate), Number(c.monthly_payment))

    return {
      id: c.id,
      name: c.name,
      principal: Number(c.principal),
      balance: Number(c.balance),
      myPayment: mine,
      otherPayment: iDisburse ? other : 0,
      monthlyPayment: Number(c.monthly_payment),
      annualRate: Number(c.annual_rate),
      paymentDay: c.payment_day,
      monthInterest: splitInterest(mvs as unknown as MovementLike[], monthKey),
      payoffMonths: proj.months,
      payoffDate: proj.months > 0
        ? format(addMonths(new Date(), proj.months), 'yyyy-MM-dd')
        : null,
      remainingInterest: proj.remainingInterest,
      neverPaysOff: proj.neverPaysOff,
      movements: mvs
        .slice()
        .sort((a, b) => b.effective_date.localeCompare(a.effective_date))
        .slice(0, 12)
        .map(m => ({ id: m.id, kind: m.kind, amount: Number(m.amount), date: m.effective_date })),
    }
  })

  const totalBalance  = r2(rows.reduce((s, r) => s + r.balance, 0))
  const totalMine     = r2(rows.reduce((s, r) => s + r.myPayment, 0))
  const totalToCollect = r2(rows.reduce((s, r) => s + r.otherPayment, 0))

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="font-semibold text-gray-800 text-sm">Créditos y préstamos</h2>
          {rows.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              Saldo {formatMXN(totalBalance)} · mi cuota {formatMXN(totalMine)}/mes
              {totalToCollect > 0 && (
                <span className="text-green-600"> · a recibir de {otherName} {formatMXN(totalToCollect)}</span>
              )}
            </p>
          )}
        </div>
        <AddCreditForm />
      </div>

      {rows.length === 0 ? (
        <div className="card p-4 text-center">
          <p className="text-sm text-gray-400">Sin créditos registrados.</p>
        </div>
      ) : (
        rows.map(row => {
          const credit = credits.find(c => c.id === row.id)!
          return (
            <CreditRow key={row.id} credit={row} otherName={otherName}>
              <RegisterCreditPaymentButton
                creditId={row.id}
                creditName={row.name}
                balance={row.balance}
                monthlyPayment={row.monthlyPayment}
                myPayment={row.myPayment}
                otherPayment={row.otherPayment}
                monthInterest={row.monthInterest}
                otherName={otherName}
                periodId={periodId}
              />
              <EditCreditButton credit={credit} />
              <RecalcInterestButton creditId={row.id} creditName={row.name} />
              <DeleteCreditButton creditId={row.id} creditName={row.name} />
            </CreditRow>
          )
        })
      )}
    </section>
  )
}
```

- [ ] **Step 3: Cargar los datos y renderizar en la página**

En `app/(app)/tarjetas/page.tsx`, agregar al `Promise.all` de la línea 33 dos queries más y desestructurarlas:

```tsx
  const [
    { data: cards }, { data: expenses }, { data: cardDebts },
    { data: credits }, { data: creditMovements },
  ] = await Promise.all([
    // ... las tres existentes, sin cambios ...
    supabase.from('credits_split').select('*')
      .eq('is_active', true)
      .order('name') as unknown as Promise<{ data: CreditSplit[] | null }>,
    supabase.from('credit_movements').select('*')
      .order('effective_date', { ascending: false }) as unknown as Promise<{ data: CreditMovement[] | null }>,
  ])
```

Imports (junto a la línea 8):

```tsx
import type { Card, CardExpense, CardExpenseInstallment, CreditSplit, CreditMovement } from '@/types/database'
import CreditsSection from '@/components/tarjetas/credits-section'
```

El periodo actual, para anclar los `period_payments` de los abonos — agregar después del cálculo de `currentPeriodStr`:

```tsx
  // Periodo de la quincena en curso: ahí se anclan los pagos de abonos a créditos
  const { data: currentPeriod } = await supabase
    .from('periods').select('id')
    .eq('owner_id', userId).eq('period_date', currentPeriodStr).single()
```

Totales del hero — **importante**: `totalDebt` (línea 154) alimenta `totalUsedPct`, que divide entre el límite de crédito de las tarjetas. Un préstamo no tiene límite de crédito, así que el porcentaje debe seguir siendo solo de tarjetas. Después de la línea 156, agregar:

```tsx
  // El saldo de créditos NO entra a totalUsedPct: un préstamo no tiene línea de
  // crédito, y meterlo inflaría el "% del crédito disponible".
  const creditsBalance = Math.round(
    (credits ?? []).reduce((s, c) => s + Number(c.balance), 0) * 100
  ) / 100
  const totalOwed = Math.round((totalDebt + creditsBalance) * 100) / 100
```

En el hero (línea 192-194), cambiar el monto y agregar el desglose:

```tsx
            <p className={`text-2xl font-bold mt-1 ${totalOwed > 0 ? 'text-red-600' : 'text-gray-800'}`}>
              {formatMXN(totalOwed)}
            </p>
            {creditsBalance > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                tarjetas {formatMXN(totalDebt)} · créditos {formatMXN(creditsBalance)}
              </p>
            )}
```

Y el header móvil (línea 183): `Deuda total: {formatMXN(totalOwed)}`.

Renderizar la sección después del bloque `{/* ── Tarjetas ── */}` que cierra en `</section>`:

```tsx
      {/* ── Créditos y préstamos ── */}
      <CreditsSection
        credits={credits ?? []}
        movements={creditMovements ?? []}
        isLalo={isLalo}
        otherName={partnerName}
        periodId={(currentPeriod as any)?.id ?? ''}
      />
```

- [ ] **Step 4: Verificar que compila** (va a fallar hasta la Tarea 7 — los componentes de acción no existen)

Crea stubs temporales para poder compilar, en cada archivo faltante:

```tsx
'use client'
export default function Stub() { return null }
```

Archivos a stubear: `add-credit-form.tsx`, `edit-credit-button.tsx`, `delete-credit-button.tsx`, `register-credit-payment-button.tsx`, `recalc-interest-button.tsx`.

Run: `npx next build 2>&1 | grep -iE "error|Compiled successfully"`
Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add components/tarjetas/credit-row.tsx components/tarjetas/credits-section.tsx components/tarjetas/add-credit-form.tsx components/tarjetas/edit-credit-button.tsx components/tarjetas/delete-credit-button.tsx components/tarjetas/register-credit-payment-button.tsx components/tarjetas/recalc-interest-button.tsx "app/(app)/tarjetas/page.tsx"
git commit -m "Render credits section on the cards page"
```

---

## Task 7: Alta de crédito

**Files:**
- Modify: `components/tarjetas/add-credit-form.tsx` (reemplazar el stub)

Patrón a copiar: `components/gastos-fijos/add-expense-form.tsx` (mismo estilo de diálogo, estado de formulario y manejo de error).

- [ ] **Step 1: Escribir el formulario**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'
import { amortizedPayment } from '@/lib/utils/credit-math'
import type { Ownership, PaidBy } from '@/types/database'

export default function AddCreditForm() {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', principal: '', annual_rate: '', term_months: '',
    monthly_payment: '', payment_day: '15',
    ownership: 'shared' as Ownership, paid_by: 'each' as PaidBy,
    started_at: new Date().toISOString().slice(0, 10),
  })

  // Cuota sugerida. Es solo sugerencia: los bancos redondean y cobran comisiones,
  // así que el campo es editable y lo que el usuario escriba es lo que manda.
  const suggested = amortizedPayment(
    parseFloat(form.principal) || 0,
    parseFloat(form.annual_rate) || 0,
    parseInt(form.term_months) || 0,
  )

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const principal = parseFloat(form.principal)
    const cuota = parseFloat(form.monthly_payment) || suggested

    if (!cuota || cuota <= 0) {
      setError('Captura la cuota mensual o el plazo para calcularla.')
      setLoading(false)
      return
    }

    const { data: created, error: insertError } = await supabase
      .from('credits')
      .insert({
        name:            form.name,
        principal,
        annual_rate:     parseFloat(form.annual_rate) || 0,
        term_months:     parseInt(form.term_months) || 1,
        monthly_payment: cuota,
        payment_day:     parseInt(form.payment_day),
        ownership:       form.ownership,
        owner_id:        form.ownership === 'shared' ? null : user!.id,
        paid_by:         form.ownership === 'shared' ? form.paid_by : 'each',
        started_at:      form.started_at,
      })
      .select('id')
      .single()

    if (insertError || !created) {
      setError(insertError?.message ?? 'No se pudo crear el crédito (permisos).')
      setLoading(false)
      return
    }

    // El desembolso inicial es el primer movimiento del ledger: sin él el saldo
    // arrancaría en cero y el crédito se vería liquidado.
    const { error: movError } = await supabase.from('credit_movements').insert({
      credit_id:      (created as any).id,
      kind:           'disbursement',
      amount:         principal,
      effective_date: form.started_at,
      created_by:     user!.id,
    })
    if (movError) {
      // Sin desembolso el crédito queda inservible; mejor no dejar basura
      await supabase.from('credits').delete().eq('id', (created as any).id)
      setError('No se pudo registrar el monto original. No se creó el crédito.')
      setLoading(false)
      return
    }

    setLoading(false)
    setOpen(false)
    setForm({
      name: '', principal: '', annual_rate: '', term_months: '',
      monthly_payment: '', payment_day: '15',
      ownership: 'shared', paid_by: 'each',
      started_at: new Date().toISOString().slice(0, 10),
    })
    router.refresh()
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5">
        <Plus size={13} /> Crédito
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="card p-5 w-full max-w-sm space-y-4 my-8">
            <h3 className="font-semibold text-gray-800">Nuevo crédito</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="label">Nombre</label>
                <input className="input" value={form.name} onChange={e => set('name', e.target.value)}
                  placeholder="Prestamo Banamex" required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Monto original</label>
                  <input className="input" type="number" step="0.01" min="0.01" value={form.principal}
                    onChange={e => set('principal', e.target.value)} placeholder="0.00" required />
                </div>
                <div>
                  <label className="label">Tasa anual %</label>
                  <input className="input" type="number" step="0.001" min="0" value={form.annual_rate}
                    onChange={e => set('annual_rate', e.target.value)} placeholder="18" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Plazo (meses)</label>
                  <input className="input" type="number" min="1" value={form.term_months}
                    onChange={e => set('term_months', e.target.value)} placeholder="24" required />
                </div>
                <div>
                  <label className="label">Día de pago</label>
                  <select className="input" value={form.payment_day} onChange={e => set('payment_day', e.target.value)}>
                    <option value="15">Día 15</option>
                    <option value="30">Día 30 (fin de mes)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">
                  Cuota mensual
                  {suggested > 0 && (
                    <span className="text-gray-400 font-normal ml-1">calculada: {formatMXN(suggested)}</span>
                  )}
                </label>
                <input className="input" type="number" step="0.01" min="0.01"
                  value={form.monthly_payment}
                  onChange={e => set('monthly_payment', e.target.value)}
                  placeholder={suggested > 0 ? suggested.toFixed(2) : '0.00'} />
                <p className="text-[10px] text-gray-400 mt-1">
                  Déjala vacía para usar la calculada. Si tu cuota real es distinta, escríbela — esa manda.
                  No cambia nunca: si abonas de más, se acorta el plazo.
                </p>
              </div>
              <div>
                <label className="label">Dueño</label>
                <select className="input" value={form.ownership} onChange={e => set('ownership', e.target.value)}>
                  <option value="shared">Compartido (Los 2)</option>
                  <option value="lalo">Lalo (personal)</option>
                  <option value="ale">Ale (personal)</option>
                </select>
              </div>
              {form.ownership === 'shared' && (
                <div>
                  <label className="label">¿Quién paga?</label>
                  <select className="input" value={form.paid_by} onChange={e => set('paid_by', e.target.value)}>
                    <option value="each">Cada quien su parte</option>
                    <option value="lalo">Lalo paga todo (Ale le debe)</option>
                    <option value="ale">Ale paga todo (Lalo le debe)</option>
                  </select>
                </div>
              )}
              <div>
                <label className="label">Fecha de inicio</label>
                <input className="input" type="date" value={form.started_at}
                  onChange={e => set('started_at', e.target.value)} required />
                <p className="text-[10px] text-gray-400 mt-1">
                  El interés empieza a devengarse el mes siguiente a esta fecha.
                </p>
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx next build 2>&1 | grep -iE "error|Compiled successfully"`
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add components/tarjetas/add-credit-form.tsx
git commit -m "Add credit creation form with suggested amortized payment"
```

---

## Task 8: Registrar abono

Es la pieza con más reglas. Un abono hace tres cosas: mueve el ledger del crédito por el **monto completo**, descuenta de mi quincena solo **mi parte**, y deja la parte del otro como cobrable. Es el mismo desdoblamiento `amount` / `ledgerAmount` que ya usan los fijos con tarjeta.

**Files:**
- Modify: `components/tarjetas/register-credit-payment-button.tsx` (reemplazar el stub)

- [ ] **Step 1: Escribir el botón y su diálogo**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'

interface Props {
  creditId: string
  creditName: string
  balance: number
  monthlyPayment: number   // cuota completa al banco
  myPayment: number        // mi parte de la cuota
  otherPayment: number     // parte del otro; > 0 solo si yo desembolso
  monthInterest: number
  otherName: string
  periodId: string
}

export default function RegisterCreditPaymentButton({
  creditId, creditName, balance, monthlyPayment, myPayment, otherPayment,
  monthInterest, otherName, periodId,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(monthlyPayment.toString())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const paid = parseFloat(amount) || 0
  // Proporción de la cuota que representa mi parte. Un abono extra se reparte con
  // los mismos porcentajes (consecuencia aceptada del split global — ver spec).
  const myRatio = monthlyPayment > 0 ? myPayment / monthlyPayment : 1
  const myShare = Math.round(paid * myRatio * 100) / 100
  const overpay = paid > balance
  const underInterest = monthInterest > 0 && paid < monthInterest

  function handleOpen() {
    setAmount(monthlyPayment.toString())
    setError(null)
    setOpen(true)
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()

    // Nunca abonar más que el saldo: dejaría el crédito en negativo
    const toLedger = Math.round(Math.min(paid, balance) * 100) / 100
    const toPeriod = Math.round(toLedger * myRatio * 100) / 100

    const { data: mov, error: movError } = await supabase
      .from('credit_movements')
      .insert({
        credit_id:      creditId,
        kind:           'payment',
        amount:         toLedger,
        effective_date: new Date().toISOString().slice(0, 10),
        created_by:     user!.id,
      })
      .select('id')

    if (movError) { setError(movError.message); setLoading(false); return }
    // RLS filtra en silencio en lugar de lanzar: sin este guard el diálogo se
    // cerraría "guardado" y el saldo no se movería.
    if (!mov?.length) {
      setError('No se guardó: la base de datos rechazó el abono (permisos).')
      setLoading(false)
      return
    }

    // Mi parte pesa en mi quincena. Si no hay periodo (quincena futura sin crear)
    // se omite: el ledger del crédito ya quedó correcto, que es lo importante.
    if (periodId && toPeriod >= 0.01) {
      await supabase.from('period_payments').insert({
        period_id:    periodId,
        concept:      creditName,
        amount:       toPeriod,
        card_id:      null,
        payment_type: 'fijo',
        paid_at:      new Date().toISOString(),
      })
    }

    // Si el saldo quedó en cero, el crédito está liquidado
    if (toLedger >= balance - 0.005) {
      await supabase.from('credits').update({ is_active: false }).eq('id', creditId)
    }

    setLoading(false)
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button onClick={handleOpen}
        className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-green-50 text-green-700
                   border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
        <CheckCircle size={13} /> Registrar abono
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-xs space-y-4">
            <div>
              <h3 className="font-semibold text-gray-800">Registrar abono</h3>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{creditName}</p>
              <div className="mt-2 rounded-lg bg-gray-50 px-2.5 py-2 space-y-0.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Saldo actual</span><span>{formatMXN(balance)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Interés de este mes</span><span>{formatMXN(monthInterest)}</span>
                </div>
              </div>
            </div>
            <form onSubmit={handlePay} className="space-y-3">
              <div>
                <label className="label">
                  Monto al banco
                  <span className="text-gray-400 font-normal ml-1">(cuota: {formatMXN(monthlyPayment)})</span>
                </label>
                <input className="input" type="number" step="0.01" min="0.01" value={amount}
                  onChange={e => setAmount(e.target.value)} required autoFocus />
                {otherPayment > 0 && paid > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    De tu quincena sale <span className="font-semibold">{formatMXN(myShare)}</span>;
                    {' '}{formatMXN(Math.round((paid - myShare) * 100) / 100)} los repone {otherName}.
                  </p>
                )}
                {overpay && (
                  <p className="text-xs text-amber-600 mt-1">
                    Liquidas el crédito: solo se aplican {formatMXN(balance)}, sobran{' '}
                    {formatMXN(Math.round((paid - balance) * 100) / 100)}.
                  </p>
                )}
                {underInterest && !overpay && (
                  <p className="text-xs text-amber-600 mt-1">
                    Este abono no cubre el interés del mes ({formatMXN(monthInterest)}): la deuda va a crecer.
                  </p>
                )}
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  {loading ? 'Guardando...' : 'Abonar'}
                </button>
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx next build 2>&1 | grep -iE "error|Compiled successfully"`
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add components/tarjetas/register-credit-payment-button.tsx
git commit -m "Register credit payments: full amount to ledger, my share to the quincena"
```

---

## Task 9: Editar, borrar y recalcular intereses

**Files:**
- Modify: `components/tarjetas/edit-credit-button.tsx`
- Modify: `components/tarjetas/delete-credit-button.tsx`
- Modify: `components/tarjetas/recalc-interest-button.tsx`

- [ ] **Step 1: Edición**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { CreditSplit, Ownership, PaidBy } from '@/types/database'

export default function EditCreditButton({ credit }: { credit: CreditSplit }) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: credit.name,
    annual_rate: String(credit.annual_rate),
    term_months: String(credit.term_months),
    monthly_payment: String(credit.monthly_payment),
    payment_day: String(credit.payment_day),
    ownership: credit.ownership as Ownership,
    paid_by: credit.paid_by as PaidBy,
  })

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: updated, error: updateError } = await supabase
      .from('credits')
      .update({
        name:            form.name,
        annual_rate:     parseFloat(form.annual_rate) || 0,
        term_months:     parseInt(form.term_months) || 1,
        monthly_payment: parseFloat(form.monthly_payment),
        payment_day:     parseInt(form.payment_day),
        ownership:       form.ownership,
        owner_id:        form.ownership === 'shared' ? null : user!.id,
        paid_by:         form.ownership === 'shared' ? form.paid_by : 'each',
      })
      .eq('id', credit.id)
      .select('id')

    setLoading(false)
    if (updateError) { setError(updateError.message); return }
    if (!updated?.length) {
      setError('No se guardó: la base de datos rechazó el cambio (permisos).')
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="text-xs px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg
                   hover:bg-gray-50 flex items-center gap-1">
        <Pencil size={12} /> Editar
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="card p-5 w-full max-w-sm space-y-4 my-8">
            <div>
              <h3 className="font-semibold text-gray-800">Editar crédito</h3>
              <p className="text-[10px] text-gray-400 mt-1">
                El monto original y la fecha de inicio no se editan: viven en el ledger.
                Para corregirlos, borra el crédito y créalo de nuevo. Cambiar la tasa aplica
                desde el siguiente devengo — usa «Recalcular intereses» si quieres rehacer
                los meses ya devengados.
              </p>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="label">Nombre</label>
                <input className="input" value={form.name} onChange={e => set('name', e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Tasa anual %</label>
                  <input className="input" type="number" step="0.001" min="0" value={form.annual_rate}
                    onChange={e => set('annual_rate', e.target.value)} required />
                </div>
                <div>
                  <label className="label">Plazo (meses)</label>
                  <input className="input" type="number" min="1" value={form.term_months}
                    onChange={e => set('term_months', e.target.value)} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Cuota mensual</label>
                  <input className="input" type="number" step="0.01" min="0.01" value={form.monthly_payment}
                    onChange={e => set('monthly_payment', e.target.value)} required />
                </div>
                <div>
                  <label className="label">Día de pago</label>
                  <select className="input" value={form.payment_day} onChange={e => set('payment_day', e.target.value)}>
                    <option value="15">Día 15</option>
                    <option value="30">Día 30 (fin de mes)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Dueño</label>
                <select className="input" value={form.ownership} onChange={e => set('ownership', e.target.value)}>
                  <option value="shared">Compartido (Los 2)</option>
                  <option value="lalo">Lalo (personal)</option>
                  <option value="ale">Ale (personal)</option>
                </select>
              </div>
              {form.ownership === 'shared' && (
                <div>
                  <label className="label">¿Quién paga?</label>
                  <select className="input" value={form.paid_by} onChange={e => set('paid_by', e.target.value)}>
                    <option value="each">Cada quien su parte</option>
                    <option value="lalo">Lalo paga todo (Ale le debe)</option>
                    <option value="ale">Ale paga todo (Lalo le debe)</option>
                  </select>
                </div>
              )}
              {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Borrado**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function DeleteCreditButton({
  creditId, creditName,
}: { creditId: string; creditName: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!window.confirm(
      `¿Borrar «${creditName}»? Se van también todos sus movimientos (monto original, ` +
      `intereses y abonos). Los pagos ya registrados en tus quincenas NO se borran.`
    )) return

    setLoading(true)
    // .select() para detectar el bloqueo silencioso de RLS: un delete filtrado
    // regresa error null y 0 filas.
    const { data, error } = await supabase.from('credits').delete().eq('id', creditId).select('id')
    setLoading(false)
    if (error || !data?.length) {
      alert('No se borró: la base de datos rechazó la operación (permisos).')
      return
    }
    router.refresh()
  }

  return (
    <button onClick={handleDelete} disabled={loading}
      className="text-xs px-2.5 py-1.5 border border-red-200 text-red-600 rounded-lg
                 hover:bg-red-50 flex items-center gap-1">
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Borrar
    </button>
  )
}
```

- [ ] **Step 3: Recalcular intereses**

Borrar un abono viejo corrige el saldo pero no el interés que ya se devengó sobre el saldo equivocado. Esta acción borra los movimientos de interés y deja que el devengo perezoso los regenere en el siguiente render.

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function RecalcInterestButton({
  creditId, creditName,
}: { creditId: string; creditName: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleRecalc() {
    if (!window.confirm(
      `¿Recalcular los intereses de «${creditName}»? Se borran los intereses devengados ` +
      `y se vuelven a generar desde la fecha de inicio con los abonos actuales. ` +
      `Úsalo si corregiste o borraste un abono viejo.`
    )) return

    setLoading(true)
    const { error } = await supabase
      .from('credit_movements')
      .delete()
      .eq('credit_id', creditId)
      .eq('kind', 'interest')
    setLoading(false)
    if (error) {
      alert(`No se pudo recalcular: ${error.message}`)
      return
    }
    // El devengo perezoso los regenera al recargar. router.refresh() vuelve a correr
    // el server component, que llama a accrueCreditInterest.
    router.refresh()
  }

  return (
    <button onClick={handleRecalc} disabled={loading}
      className="text-xs px-2.5 py-1.5 border border-gray-200 text-gray-500 rounded-lg
                 hover:bg-gray-50 flex items-center gap-1"
      title="Rehace los intereses devengados con los abonos actuales">
      {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Recalcular
    </button>
  )
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npx next build 2>&1 | grep -iE "error|Compiled successfully"`
Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add components/tarjetas/edit-credit-button.tsx components/tarjetas/delete-credit-button.tsx components/tarjetas/recalc-interest-button.tsx
git commit -m "Add credit edit, delete and interest recalculation"
```

- [ ] **Step 6: PARAR y pedir prueba manual**

Dile al usuario:

> El módulo ya es usable en `/tarjetas`: crear crédito, ver saldo e interés, abonar, editar, borrar y recalcular. Todavía **no** aparece en la quincena del Dashboard ni en Análisis (Tareas 10 y 11). ¿Lo pruebas capturando tu Prestamo Banamex antes de que siga? Si el plazo que muestra no cuadra con el del banco, la tasa o el principal están mal capturados.

---

## Task 10: Integración al Dashboard

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Cargar los créditos que vencen en la quincena**

Agregar al segundo `Promise.all` (el que trae `nextFijosByDay`, `allCards`, `sharedRows`, `settlementsRaw`) una query más:

```tsx
    // Créditos cuyo día de pago cae en el corte de esta quincena
    supabase.from('credits_split').select('*')
      .eq('is_active', true)
      .eq('payment_day', nextPayDay) as unknown as Promise<{ data: any[] | null }>,
```

Y desestructurarla como `{ data: dueCredits }`.

- [ ] **Step 2: Agregar `'credito'` al union de tipos de `NextItem`**

```tsx
    type: 'fijo' | 'msi' | 'programado' | 'deuda' | 'credito'
```

Y un campo para el id del crédito, junto a `sharedTotal` / `ledgerAmount`:

```tsx
    creditId?: string | null
```

- [ ] **Step 3: Meter los créditos a `nextItems`**

Agregar un tercer spread al arreglo `nextItems`, después del de `nextFijos`:

```tsx
    // Créditos: la cuota fija de este mes. Mismo desdoblamiento que los compartidos
    // con tarjeta — mi parte pesa en la quincena, el ledger se mueve por el completo.
    ...((dueCredits ?? []) as any[]).flatMap(c => {
      const myShare    = Number(isLalo ? c.lalo_payment : c.ale_payment)
      const otherShare = Number(isLalo ? c.ale_payment  : c.lalo_payment)
      const iDisburse  = c.ownership === 'shared' && c.paid_by === myOwnership
      // Si lo paga el otro, mi parte es deuda interna, no un pago mío de esta quincena
      if (c.ownership === 'shared' && (c.paid_by === 'lalo' || c.paid_by === 'ale') && !iDisburse) return []
      const paidAmt = paidAmounts.get(`${c.name}|`) ?? 0
      const amount  = round2(myShare - paidAmt)
      if (amount < 0.01) return []
      const fullPending = iDisburse && myShare > 0
        ? round2(Number(c.monthly_payment) * (amount / myShare))
        : null
      return [{
        key: `credit-${c.id}`, concept: c.name, amount,
        card: null, type: 'credito' as const,
        cardId: null, installmentId: null,
        debtId: null, creditorName: null,
        totalInstallments: null, paidInstallments: 0, dueDate: null,
        recurringExpenseId: null, intervalType: null, currentNextPaymentDate: null,
        sharedTotal:       fullPending,
        sharedOtherAmount: fullPending != null ? round2(fullPending - amount) : null,
        ledgerAmount:      null,
        creditId:          c.id,
      }]
    }),
```

`paidAmounts` se llena con la clave `` `${concept}|${card_id ?? ''}` ``, y los abonos a créditos se registran con `card_id: null`, así que la clave es `` `${c.name}|` ``. Eso hace que un crédito ya abonado en la quincena desaparezca de la lista, igual que un fijo.

- [ ] **Step 4: Enrutar el botón de pago en la sección sin tarjeta**

En el render de `noCardItems`, el `else` que hoy monta `RegisterNextPaymentButton` necesita una rama previa para créditos. Cambiar la condición:

```tsx
                      {item.type === 'deuda' && item.debtId ? (
                        <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg whitespace-nowrap">
                          Confirma {item.creditorName ?? otherName}
                        </span>
                      ) : item.type === 'credito' && item.creditId ? (
                        <RegisterCreditPaymentButton
                          creditId={item.creditId}
                          creditName={item.concept}
                          balance={creditBalanceById.get(item.creditId) ?? item.amount}
                          monthlyPayment={item.sharedTotal ?? item.amount}
                          myPayment={item.amount}
                          otherPayment={item.sharedOtherAmount ?? 0}
                          monthInterest={0}
                          otherName={otherName}
                          periodId={activePeriodId}
                        />
                      ) : (
                        <RegisterNextPaymentButton
                          /* ...sin cambios... */
                        />
                      )}
```

`monthInterest={0}` a propósito: el dashboard no carga el ledger de movimientos y no vale traerlo solo para una advertencia. La advertencia completa vive en `/tarjetas`, que sí tiene el dato.

El mapa de saldos, junto a los demás cálculos previos al render:

```tsx
  // Saldo por crédito, para que el diálogo de abono pueda topar al saldo
  const creditBalanceById = new Map<string, number>(
    ((dueCredits ?? []) as any[]).map(c => [c.id as string, Number(c.balance)])
  )
```

Y el import:

```tsx
import RegisterCreditPaymentButton from '@/components/tarjetas/register-credit-payment-button'
```

- [ ] **Step 5: Badge del tipo**

En el `<span>` del badge de `noCardItems`, agregar el color y la etiqueta:

```tsx
                        item.type === 'fijo'    ? 'bg-blue-50 text-blue-600' :
                        item.type === 'msi'     ? 'bg-purple-50 text-purple-600' :
                        item.type === 'credito' ? 'bg-indigo-50 text-indigo-600' :
                        item.type === 'deuda'   ? 'bg-red-50 text-red-600' :
                        'bg-orange-50 text-orange-600'
```

```tsx
                        {item.type === 'fijo' ? 'Fijo' : item.type === 'msi' ? 'MSI' :
                         item.type === 'credito' ? 'Crédito' :
                         item.type === 'deuda' ? `→ ${item.creditorName ?? 'deuda'}` : 'Programado'}
```

- [ ] **Step 6: Verificar que compila**

Run: `npx next build 2>&1 | grep -iE "error|Compiled successfully"`
Expected: `✓ Compiled successfully`

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/dashboard/page.tsx"
git commit -m "Show credit payments in the quincena with the shared split"
```

---

## Task 11: Integración a Análisis

**Files:**
- Modify: `lib/utils/financial-analysis.ts`
- Modify: `app/(app)/analisis/page.tsx`

- [ ] **Step 1: Aceptar créditos en el motor**

En `AnalysisInput`, junto a `msiMonthly` / `msiItems`:

```ts
  // Cuota mensual de créditos y préstamos (mi parte), con un item por crédito
  creditsMonthly: number
  creditItems: AnalysisItem[]
```

En el bloque `ahorro_deudas`, agregar el renglón entre MSI y ahorro:

```ts
      rows = [
        infoRow('msi', 'Pagos a MSI (deudas)', input.msiMonthly, input.msiItems,
          'Carga mensual de tus compras a meses.'),
        infoRow('creditos', 'Créditos y préstamos', input.creditsMonthly, input.creditItems,
          'Cuota fija mensual de tus créditos. Abonar de más acorta el plazo, no baja la cuota.'),
        infoRow('ahorro', 'Ahorro y proyectos', input.ahorroMonthly,
          input.ahorroMonthly > 0 ? [{ concept: 'Abonos a proyectos (prom. 3 meses)', monthly: input.ahorroMonthly }] : [],
          'Promedio mensual de tus abonos a metas.'),
      ]
```

Y en `committedMonthly`, contar los créditos como obligación igual que los MSI:

```ts
  const committedMonthly = r2(nec.monthly + des.monthly + input.msiMonthly + input.creditsMonthly)
```

Actualizar el comentario del campo en `AnalysisResult`:

```ts
  committedMonthly: number     // necesidades + deseos + MSI + créditos
```

- [ ] **Step 2: Cargar y pasar los créditos**

En `app/(app)/analisis/page.tsx`, agregar al `Promise.all`:

```tsx
    supabase.from('credits_split').select('*').eq('is_active', true) as unknown as Promise<{ data: any[] | null }>,
```

Desestructurar como `{ data: creditRows }` y calcular antes del `analyzeFinances`:

```tsx
  // Créditos: la cuota ya es mensual, así que NO pasa por monthlyEquivalent.
  // Se cuenta mi parte, con la parte del otro aparte cuando yo desembolso.
  const creditItems = (creditRows ?? []).map((c: any) => {
    const mine      = Number(isLalo ? c.lalo_payment : c.ale_payment)
    const other     = Number(isLalo ? c.ale_payment  : c.lalo_payment)
    const iDisburse = c.ownership === 'shared' && c.paid_by === myOwnership
    return {
      concept: c.name,
      monthly: mine,
      sharedTotal:       iDisburse ? Number(c.monthly_payment) : null,
      sharedOtherAmount: iDisburse ? other : null,
    }
  })
  const creditsMonthly = Math.round(creditItems.reduce((s, i) => s + i.monthly, 0) * 100) / 100
```

Y pasarlos:

```tsx
  const analysis = analyzeFinances({
    monthlyIncome, fijos, variables, diversionMonthly, ahorroMonthly, msiMonthly, msiItems,
    creditsMonthly, creditItems,
  })
```

- [ ] **Step 3: Verificar que compila y que la matemática sigue pasando**

Run: `npx next build 2>&1 | grep -iE "error|Compiled successfully"`
Expected: `✓ Compiled successfully`

Run: `node --experimental-strip-types scripts/verify-credit-math.mjs`
Expected: `TODO PASA`

- [ ] **Step 4: Commit y push**

```bash
git add lib/utils/financial-analysis.ts "app/(app)/analisis/page.tsx"
git commit -m "Count credit payments in the debt block of financial analysis"
git push origin main
```

- [ ] **Step 5: Verificar el deploy**

```bash
until [ "$(gh api repos/Esmercs/mi-cartera/deployments --jq '.[0].sha[0:7]')" = "$(git rev-parse --short=7 HEAD)" ]; do sleep 5; done
id=$(gh api repos/Esmercs/mi-cartera/deployments --jq '.[0].id')
gh api repos/Esmercs/mi-cartera/deployments/$id/statuses --jq '.[] | "\(.state) \(.environment)"'
```

Expected: `success Production`

Nota: `vercel --prod` falla en esta máquina (el CLI está autenticado con una cuenta sin acceso al team del proyecto). El deploy sale por la integración de GitHub al hacer push.

---

## Autorevisión del plan

**Cobertura del spec:**

| Sección del spec | Tarea |
|---|---|
| `credits`, `credit_movements`, `credit_settlements`, `credits_split`, RLS | 1 |
| Tipos TS | 2 |
| `monthlyRate`, `accruedInterest`, `amortizedPayment`, `projectPayoff` | 3 |
| Saldo derivado | 4 |
| Devengo perezoso con tope de 12 e idempotencia | 5 |
| UI: sección, fila, saldo, interés del mes, plazo restante, movimientos, Deuda total | 6 |
| Alta con cuota autocalculada y editable | 7 |
| Abono de monto libre, tope al saldo, reparto proporcional, liquidación | 8 |
| Edición, borrado, recalcular intereses | 9 |
| Dashboard `type: 'credito'` | 10 |
| Análisis bloque Ahorro y deudas | 11 |

**Hueco encontrado y cerrado:** el spec menciona `credit_settlements` y las Tareas 1 y 8 no la usan para nada. La liquidación de la parte del otro **queda fuera de este plan**: la tabla se crea (para no volver a migrar después) pero la UI para registrar "Ale ya me pagó su parte del crédito" es un plan aparte, análogo a `SettleInternalDebtButton` del dashboard. Sin ella, la parte del otro se ve pero no se marca como cobrada. Decirlo al usuario al terminar la Tarea 11.

**Bordes del spec no cubiertos a propósito:**
- "Sección de liquidados" para créditos con saldo cero: la Tarea 8 pone `is_active = false` y desaparecen de la lista. No hay pantalla de historial. Es cosmético; si el usuario lo quiere, es un filtro más.

**Consistencia de nombres verificada:** `balanceAsOf` / `splitInterest` (Tarea 4) se usan igual en Tareas 5 y 6. `CreditRowData` (Tarea 6) coincide campo por campo con lo que arma `credits-section.tsx`. Las props de `RegisterCreditPaymentButton` (Tarea 8) son las mismas que le pasan la Tarea 6 y la Tarea 10. `creditsMonthly` / `creditItems` (Tarea 11) coinciden entre el motor y la página.
