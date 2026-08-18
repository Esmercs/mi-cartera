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
    // projectPayoff va con el saldo y la cuota COMPLETOS: el plazo es del préstamo,
    // no de mi parte. Con mi parte contra la cuota completa diría que liquido antes.
    const fullBalance = Number(c.balance)
    const proj = projectPayoff(fullBalance, Number(c.annual_rate), Number(c.monthly_payment))
    // Mi parte de lo que falta por pagar, que es lo que realmente debo yo
    const myBalance    = Number(isLalo ? c.lalo_balance : c.ale_balance)
    const otherBalance = Number(isLalo ? c.ale_balance  : c.lalo_balance)
    const principal    = Number(c.principal)

    return {
      id: c.id,
      name: c.name,
      principal,
      myBalance,
      fullBalance,
      otherBalance: iDisburse ? otherBalance : 0,
      // Sobre los totales: el avance es el mismo proporción sea mi parte o el completo
      paidPct: principal > 0
        ? Math.max(0, Math.min(100, Math.round((1 - fullBalance / principal) * 100)))
        : 0,
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

  const totalMyBalance   = r2(rows.reduce((s, r) => s + r.myBalance, 0))
  const totalFullBalance = r2(rows.reduce((s, r) => s + r.fullBalance, 0))
  const totalMine        = r2(rows.reduce((s, r) => s + r.myPayment, 0))
  const totalToCollect   = r2(rows.reduce((s, r) => s + r.otherPayment, 0))

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="font-semibold text-gray-800 text-sm">Créditos y préstamos</h2>
          {rows.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              Mi saldo {formatMXN(totalMyBalance)}
              {totalFullBalance !== totalMyBalance && <> de {formatMXN(totalFullBalance)}</>}
              {' '}· mi cuota {formatMXN(totalMine)}/mes
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
                balance={row.fullBalance}
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
