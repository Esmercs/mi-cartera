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
