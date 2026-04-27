export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatMXN } from '@/lib/utils/currency'
import { formatShortDate, getCurrentPeriodDates } from '@/lib/utils/date-utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { FunBudgetSummary, FunExpense } from '@/types/database'
import AddFunExpenseForm from '@/components/diversion/add-fun-expense-form'
import DeleteFunExpenseButton from '@/components/diversion/delete-fun-expense-button'
import EditBudgetButton from '@/components/diversion/edit-budget-button'

export default async function DiversionPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { start, end } = getCurrentPeriodDates()
  const startStr = format(start, 'yyyy-MM-dd')
  const endStr   = format(end, 'yyyy-MM-dd')

  // Buscar o crear el período de diversión actual
  let { data: budgetPeriod } = await supabase
    .from('fun_budget_periods')
    .select('*')
    .eq('period_start', startStr)
    .single()

  if (!budgetPeriod) {
    // Tomar el presupuesto del último período
    const { data: lastPeriod } = await supabase
      .from('fun_budget_periods')
      .select('base_budget')
      .order('period_start', { ascending: false })
      .limit(1)
      .single()

    const { data: newPeriod } = await supabase
      .from('fun_budget_periods')
      .insert({
        period_start: startStr,
        period_end:   endStr,
        base_budget:  lastPeriod?.base_budget ?? 4000,
      })
      .select()
      .single()

    budgetPeriod = newPeriod
  }

  // Resumen con cálculo en tiempo real (vista SQL)
  const { data: summary } = await supabase
    .from('fun_budget_summary')
    .select('*')
    .eq('id', budgetPeriod?.id)
    .single() as { data: FunBudgetSummary | null }

  // Gastos del período con nombre de quien registró
  const { data: expenses } = await supabase
    .from('fun_expenses')
    .select('*, registered_by_profile:profiles!registered_by(display_name)')
    .eq('budget_period_id', budgetPeriod?.id ?? '')
    .order('expense_date', { ascending: false }) as {
      data: (FunExpense & { registered_by_profile?: { display_name: string } | null })[] | null
    }

  // Historial de últimas 5 quincenas
  const { data: history } = await supabase
    .from('fun_budget_summary')
    .select('*')
    .neq('id', budgetPeriod?.id ?? '')
    .order('period_start', { ascending: false })
    .limit(5) as { data: FunBudgetSummary[] | null }

  const remaining   = summary?.remaining_budget ?? 0
  const spentPct    = summary?.spent_pct ?? 0
  const progressColor =
    spentPct >= 100 ? 'bg-red-500' :
    spentPct >= 80  ? 'bg-orange-400' :
    'bg-green-500'

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header — desktop */}
      <div className="hidden md:flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gastos Diversión</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Quincena {format(start, "d MMM", { locale: es })} –{' '}
            {format(end, "d MMM yyyy", { locale: es })} · Compartido
          </p>
        </div>
        <AddFunExpenseForm budgetPeriodId={budgetPeriod?.id ?? ''} />
      </div>

      {/* Header — mobile */}
      <div className="flex items-center justify-between md:hidden">
        <p className="text-xs text-gray-400">
          {format(start, "d MMM", { locale: es })} – {format(end, "d MMM", { locale: es })}
        </p>
        <AddFunExpenseForm budgetPeriodId={budgetPeriod?.id ?? ''} />
      </div>

      {/* Tarjeta principal */}
      <div className="card p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-500">Presupuesto base</p>
            <p className="text-3xl font-bold text-gray-900">
              {formatMXN(summary?.base_budget ?? 0)}
            </p>
          </div>
          <EditBudgetButton
            budgetPeriodId={budgetPeriod?.id ?? ''}
            currentBudget={summary?.base_budget ?? 4000}
          />
        </div>

        {/* Barra de progreso */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-500">
              Gastado: <span className="font-semibold text-gray-800">
                {formatMXN(summary?.total_spent ?? 0)}
              </span>
            </span>
            <span className={`font-semibold ${remaining < 0 ? 'text-red-600' : 'text-green-700'}`}>
              {remaining < 0 ? 'Excedido' : 'Restante'}: {formatMXN(Math.abs(remaining))}
            </span>
          </div>
          <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${progressColor} rounded-full transition-all duration-500`}
              style={{ width: `${Math.min(spentPct, 100)}%` }}
            />
          </div>
          <p className="text-right text-xs text-gray-400 mt-1">{spentPct}% utilizado</p>
        </div>
      </div>

      {/* Lista de gastos */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-800">
          Gastos de esta quincena
          {(expenses?.length ?? 0) > 0 && (
            <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {expenses?.length}
            </span>
          )}
        </h2>

        {!expenses?.length ? (
          <p className="text-sm text-gray-400">Sin gastos registrados esta quincena.</p>
        ) : (
          <div className="space-y-2">
            {expenses.map(expense => (
              <div
                key={expense.id}
                className="flex items-center justify-between py-2.5 border-b last:border-0 group"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">{expense.concept}</p>
                  <p className="text-xs text-gray-400">
                    {formatShortDate(expense.expense_date)}
                    {expense.registered_by_profile && (
                      <span className="ml-1.5 text-gray-300">
                        · por {expense.registered_by_profile.display_name}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-800">
                    {formatMXN(expense.amount)}
                  </span>
                  <DeleteFunExpenseButton id={expense.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historial */}
      {(history?.length ?? 0) > 0 && (
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-700 text-sm">Historial reciente</h2>
          {history!.map(h => (
            <div key={h.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0 gap-2">
              <span className="text-gray-600 shrink-0 text-xs">
                {format(new Date(h.period_start), "d MMM", { locale: es })} –{' '}
                {format(new Date(h.period_end), "d MMM yy", { locale: es })}
              </span>
              <div className="flex items-center gap-2 md:gap-4 ml-auto shrink-0">
                <span className="text-gray-500 text-xs">{formatMXN(h.total_spent)} / {formatMXN(h.base_budget)}</span>
                <span className={`text-xs font-medium ${h.remaining_budget < 0 ? 'text-red-500' : 'text-green-600'}`}>
                  {h.remaining_budget < 0 ? '−' : '+'}{formatMXN(Math.abs(h.remaining_budget))}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
