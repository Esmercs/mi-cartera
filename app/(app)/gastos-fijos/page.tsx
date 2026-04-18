import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatMXN } from '@/lib/utils/currency'
import { formatMXDate, intervalLabel, isOverdue } from '@/lib/utils/date-utils'
import type { RecurringExpenseSplit, SplitPercentage } from '@/types/database'
import AddExpenseForm from '@/components/gastos-fijos/add-expense-form'
import DeleteExpenseButton from '@/components/gastos-fijos/delete-expense-button'

export default async function GastosFijosPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, id')
    .eq('id', session.user.id)
    .single()

  const isLalo = profile?.display_name?.toLowerCase() === 'lalo'
  const myOwnership = isLalo ? 'lalo' : 'ale'

  // Gastos con split calculado (vista SQL)
  const { data: allExpenses } = await supabase
    .from('recurring_expenses_split')
    .select('*')
    .eq('is_active', true)
    .order('next_payment_date', { ascending: true }) as { data: RecurringExpenseSplit[] | null }

  // Split vigente
  const { data: splits } = await supabase
    .from('split_percentages')
    .select('*') as { data: SplitPercentage[] | null }

  const laloSplit = splits?.find(s => s.display_name?.toLowerCase() === 'lalo')
  const aleSplit  = splits?.find(s => s.display_name?.toLowerCase() === 'ale')

  const personal = allExpenses?.filter(e => e.ownership === myOwnership) ?? []
  const shared   = allExpenses?.filter(e => e.ownership === 'shared') ?? []

  const mySharedTotal  = isLalo
    ? shared.reduce((s, e) => s + e.lalo_amount, 0)
    : shared.reduce((s, e) => s + e.ale_amount, 0)
  const personalTotal = personal.reduce((s, e) => s + e.total_amount, 0)

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gastos Fijos</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Split vigente — Lalo:{' '}
            <span className="font-medium text-lalo">{laloSplit?.percentage?.toFixed(1) ?? '—'}%</span>
            {' '}· Ale:{' '}
            <span className="font-medium text-ale">{aleSplit?.percentage?.toFixed(1) ?? '—'}%</span>
            {' '}(basado en ingresos configurados)
          </p>
        </div>
        <AddExpenseForm />
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card p-4 bg-gray-50">
          <p className="text-xs text-gray-500 font-medium">Gastos personales</p>
          <p className="text-xl font-bold text-gray-800 mt-1">{formatMXN(personalTotal)}</p>
          <p className="text-xs text-gray-400">/ mes</p>
        </div>
        <div className="card p-4 bg-purple-50">
          <p className="text-xs text-purple-700 font-medium">Mi parte de compartidos</p>
          <p className="text-xl font-bold text-purple-800 mt-1">{formatMXN(mySharedTotal)}</p>
          <p className="text-xs text-purple-500">/ mes</p>
        </div>
        <div className="card p-4 bg-brand-50 col-span-2 lg:col-span-1">
          <p className="text-xs text-brand-700 font-medium">Total mi responsabilidad</p>
          <p className="text-xl font-bold text-brand-800 mt-1">
            {formatMXN(personalTotal + mySharedTotal)}
          </p>
          <p className="text-xs text-brand-500">/ mes</p>
        </div>
      </div>

      {/* Gastos personales */}
      <section className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          Gastos personales
          <span className={isLalo ? 'badge-lalo' : 'badge-ale'}>
            {profile?.display_name}
          </span>
        </h2>
        <ExpenseTable expenses={personal} showSplit={false} isLalo={isLalo} />
      </section>

      {/* Gastos compartidos */}
      <section className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          Gastos compartidos
          <span className="badge-shared">Los 2</span>
          <span className="text-xs text-gray-400 font-normal ml-auto">
            Total compartido: {formatMXN(shared.reduce((s, e) => s + e.total_amount, 0))}/mes
          </span>
        </h2>
        <ExpenseTable expenses={shared} showSplit isLalo={isLalo} />
      </section>
    </div>
  )
}

function ExpenseTable({
  expenses,
  showSplit,
  isLalo,
}: {
  expenses: RecurringExpenseSplit[]
  showSplit: boolean
  isLalo: boolean
}) {
  if (!expenses.length) {
    return <p className="text-sm text-gray-400">Sin gastos registrados.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-400 border-b">
            <th className="pb-2 font-medium">Concepto</th>
            <th className="pb-2 font-medium">Total</th>
            {showSplit && (
              <>
                <th className="pb-2 font-medium text-lalo">Lalo</th>
                <th className="pb-2 font-medium text-ale">Ale</th>
              </>
            )}
            <th className="pb-2 font-medium">Intervalo</th>
            <th className="pb-2 font-medium">Próximo pago</th>
            <th className="pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {expenses.map(e => (
            <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50">
              <td className="py-2.5 font-medium text-gray-800">{e.concept}</td>
              <td className="py-2.5 text-gray-700">{formatMXN(e.total_amount)}</td>
              {showSplit && (
                <>
                  <td className="py-2.5 text-lalo font-medium">{formatMXN(e.lalo_amount)}</td>
                  <td className="py-2.5 text-ale font-medium">{formatMXN(e.ale_amount)}</td>
                </>
              )}
              <td className="py-2.5 text-gray-500">{intervalLabel(e.interval_type)}</td>
              <td className={`py-2.5 ${isOverdue(e.next_payment_date) ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                {formatMXDate(e.next_payment_date)}
              </td>
              <td className="py-2.5">
                <DeleteExpenseButton id={e.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
