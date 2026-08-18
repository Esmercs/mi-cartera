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
check('24 meses con la cuota calculada', projectPayoff(100000, 24, 5287.11).months, 24, 0)
check('saldo 0 → 0 meses', projectPayoff(0, 24, 5287.11).months, 0, 0)
check('interés restante a 24 meses', projectPayoff(100000, 24, 5287.11).remainingInterest, 26890.63, 1)
const sinExtra = projectPayoff(100000, 24, 5287.11)
const conExtra = projectPayoff(80000, 24, 5287.11)
check('abonar 20000 acorta el plazo', conExtra.months < sinExtra.months, true)
check('cuota menor al interés → neverPaysOff', projectPayoff(100000, 24, 100).neverPaysOff, true)
check('neverPaysOff no reporta meses', projectPayoff(100000, 24, 100).months, 0, 0)

console.log('credit-balance')
const { balanceAsOf, splitInterest } = await import('../lib/utils/credit-balance.ts')
const movs = [
  { kind: 'disbursement', amount: 100000, effective_date: '2026-01-01' },
  { kind: 'interest',     amount: 2000,   effective_date: '2026-01-31', accrual_month: '2026-01-01' },
  { kind: 'payment',      amount: 5287.11, effective_date: '2026-02-05' },
]
check('saldo al arranque', balanceAsOf(movs, '2026-01-01'), 100000)
check('saldo con el interés del mes', balanceAsOf(movs, '2026-01-31'), 102000)
check('saldo después del abono', balanceAsOf(movs, '2026-02-28'), 96712.89)
check('sin movimientos → 0', balanceAsOf([], '2026-02-28'), 0)
check('ignora lo posterior a la fecha', balanceAsOf(movs, '2026-01-15'), 100000)
check('DECIMAL como string se suma, no concatena', balanceAsOf([
  { kind: 'disbursement', amount: '1000', effective_date: '2026-01-01' },
  { kind: 'interest',     amount: '20',   effective_date: '2026-01-31', accrual_month: '2026-01-01' },
], '2026-01-31'), 1020)
check('interés devengado de enero', splitInterest(movs, '2026-01'), 2000)
check('interés de un mes sin devengo', splitInterest(movs, '2026-03'), 0)

console.log(fails === 0 ? '\nTODO PASA' : `\n${fails} FALLAS`)
process.exit(fails ? 1 : 0)
