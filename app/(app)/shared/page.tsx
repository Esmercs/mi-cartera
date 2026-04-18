import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatMXN } from '@/lib/utils/currency'
import { formatMXDate, isOverdue } from '@/lib/utils/date-utils'
import type { RecurringExpenseSplit, InstallmentPlan, FunBudgetSummary } from '@/types/database'
import AddInterPersonDebtForm from '@/components/shared/add-inter-person-debt-form'
import MarkDebtPaidButton from '@/components/shared/mark-debt-paid-button'

export default async function SharedPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  // Gastos compartidos con split
  const { data: sharedExpenses } = await supabase
    .from('recurring_expenses_split')
    .select('*')
    .eq('ownership', 'shared')
    .eq('is_active', true)
    .order('next_payment_date', { ascending: true }) as { data: RecurringExpenseSplit[] | null }

  // Split percentages
  const { data: splits } = await supabase.from('split_percentages').select('*')
  const laloSplit = splits?.find((s: any) => s.display_name?.toLowerCase() === 'lalo')
  const aleSplit  = splits?.find((s: any) => s.display_name?.toLowerCase() === 'ale')

  // Diversión actual
  const { data: funSummary } = await supabase
    .from('fun_budget_summary')
    .select('*')
    .order('period_start', { ascending: false })
    .limit(1)
    .single() as { data: FunBudgetSummary | null }

  // Deudas entre personas (no pagadas)
  const { data: debts } = await supabase
    .from('inter_person_debts')
    .select(`
      *,
      debtor:profiles!debtor_id(display_name, full_name),
      creditor:profiles!creditor_id(display_name, full_name)
    `)
    .eq('is_paid', false)
    .order('created_at', { ascending: false })

  const totalShared     = (sharedExpenses ?? []).reduce((s, e) => s + e.total_amount, 0)
  const totalLaloPart   = (sharedExpenses ?? []).reduce((s, e) => s + e.lalo_amount, 0)
  const totalAlePart    = (sharedExpenses ?? []).reduce((s, e) => s + e.ale_amount, 0)

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header — desktop */}
      <div className="hidden md:block">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Compartido</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Gastos conjuntos · Split: Lalo {laloSplit?.percentage?.toFixed(1) ?? '—'}% / Ale {aleSplit?.percentage?.toFixed(1) ?? '—'}%
        </p>
      </div>

      {/* Resumen de gastos compartidos */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 md:p-4 bg-purple-50">
          <p className="text-xs text-purple-600 font-medium truncate">Compartido/mes</p>
          <p className="text-base md:text-xl font-bold text-purple-800 mt-1">{formatMXN(totalShared)}</p>
        </div>
        <div className="card p-3 md:p-4 bg-lalo-light">
          <p className="text-xs text-lalo-dark font-medium">Lalo</p>
          <p className="text-base md:text-xl font-bold text-lalo-dark mt-1">{formatMXN(totalLaloPart)}</p>
          <p className="text-xs text-lalo">{laloSplit?.percentage?.toFixed(0)}%</p>
        </div>
        <div className="card p-3 md:p-4 bg-ale-light">
          <p className="text-xs text-ale-dark font-medium">Ale</p>
          <p className="text-base md:text-xl font-bold text-ale-dark mt-1">{formatMXN(totalAlePart)}</p>
          <p className="text-xs text-ale">{aleSplit?.percentage?.toFixed(0)}%</p>
        </div>
      </div>

      {/* Gastos compartidos */}
      <section className="card p-4 md:p-5 space-y-3">
        <h2 className="font-semibold text-gray-800 text-sm">Gastos fijos compartidos</h2>
        {!sharedExpenses?.length ? (
          <p className="text-sm text-gray-400">Sin gastos compartidos.</p>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="md:hidden space-y-2">
              {sharedExpenses.map(e => (
                <div key={e.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="min-w-0 flex-1 mr-2">
                    <p className="text-sm font-medium text-gray-800 truncate">{e.concept}</p>
                    <p className="text-xs mt-0.5">
                      <span className="text-lalo">{formatMXN(e.lalo_amount)}</span>
                      <span className="text-gray-300 mx-1">·</span>
                      <span className="text-ale">{formatMXN(e.ale_amount)}</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-800">{formatMXN(e.total_amount)}</p>
                    <p className={`text-xs ${isOverdue(e.next_payment_date) ? 'text-red-500' : 'text-gray-400'}`}>
                      {formatMXDate(e.next_payment_date)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b">
                    <th className="pb-2 font-medium">Concepto</th>
                    <th className="pb-2 font-medium">Total</th>
                    <th className="pb-2 font-medium text-lalo-dark">Lalo</th>
                    <th className="pb-2 font-medium text-ale-dark">Ale</th>
                    <th className="pb-2 font-medium">Próximo</th>
                  </tr>
                </thead>
                <tbody>
                  {sharedExpenses.map(e => (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2.5 font-medium text-gray-800">{e.concept}</td>
                      <td className="py-2.5 text-gray-700">{formatMXN(e.total_amount)}</td>
                      <td className="py-2.5 text-lalo font-medium">{formatMXN(e.lalo_amount)}</td>
                      <td className="py-2.5 text-ale font-medium">{formatMXN(e.ale_amount)}</td>
                      <td className={`py-2.5 text-xs ${isOverdue(e.next_payment_date) ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                        {formatMXDate(e.next_payment_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Diversión */}
      {funSummary && (
        <section className="card p-4 md:p-5 space-y-3">
          <h2 className="font-semibold text-gray-800 text-sm">Diversión — quincena actual</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-gray-400">Presupuesto</p>
              <p className="text-base md:text-lg font-bold text-gray-800">{formatMXN(funSummary.base_budget)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Gastado</p>
              <p className="text-base md:text-lg font-bold text-orange-600">{formatMXN(funSummary.total_spent)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Restante</p>
              <p className={`text-base md:text-lg font-bold ${funSummary.remaining_budget < 0 ? 'text-red-600' : 'text-green-700'}`}>
                {formatMXN(funSummary.remaining_budget)}
              </p>
            </div>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                funSummary.spent_pct >= 100 ? 'bg-red-500' :
                funSummary.spent_pct >= 80  ? 'bg-orange-400' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(funSummary.spent_pct, 100)}%` }}
            />
          </div>
        </section>
      )}

      {/* Deudas entre personas */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Deudas entre nosotros</h2>
          <AddInterPersonDebtForm />
        </div>

        {!debts?.length ? (
          <p className="text-sm text-gray-400">Sin deudas pendientes.</p>
        ) : (
          <div className="space-y-3">
            {debts.map((debt: any) => (
              <div
                key={debt.id}
                className="flex items-center justify-between p-3 border rounded-xl bg-gray-50"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">{debt.concept}</p>
                  <p className="text-xs text-gray-500">
                    <span className="font-medium">{debt.debtor?.display_name}</span>
                    {' '}le debe a{' '}
                    <span className="font-medium">{debt.creditor?.display_name}</span>
                  </p>
                  {debt.due_date && (
                    <p className={`text-xs mt-0.5 ${isOverdue(debt.due_date) ? 'text-red-500' : 'text-gray-400'}`}>
                      Vence: {formatMXDate(debt.due_date)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-800">{formatMXN(debt.amount)}</span>
                  <MarkDebtPaidButton debtId={debt.id} creditorId={debt.creditor_id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
