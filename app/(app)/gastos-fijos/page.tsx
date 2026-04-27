import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatMXN } from '@/lib/utils/currency'
import { intervalLabel } from '@/lib/utils/date-utils'
import type { RecurringExpenseSplit } from '@/types/database'
import AddExpenseForm from '@/components/gastos-fijos/add-expense-form'
import DeleteExpenseButton from '@/components/gastos-fijos/delete-expense-button'
import EditExpenseButton from '@/components/gastos-fijos/edit-expense-button'

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

  // Gastos con split calculado (vista SQL) + tarjetas en paralelo
  const [{ data: allExpenses }, { data: cards }] = await Promise.all([
    supabase.from('recurring_expenses_split').select('*').eq('is_active', true).order('next_payment_date', { ascending: true }) as Promise<{ data: RecurringExpenseSplit[] | null }>,
    supabase.from('cards').select('id, name').eq('is_active', true),
  ])
  const cardMap = new Map((cards ?? []).map(c => [c.id, c.name]))

  // Split vigente via SECURITY DEFINER function (bypasses RLS)
  const { data: splitRow } = await supabase.rpc('get_split_percentages').single() as
    { data: { lalo_pct: number; ale_pct: number } | null }

  const laloSplit = splitRow ? { percentage: splitRow.lalo_pct } : null
  const aleSplit  = splitRow ? { percentage: splitRow.ale_pct  } : null

  const personal = allExpenses?.filter(e => e.ownership === myOwnership) ?? []
  const shared   = allExpenses?.filter(e => e.ownership === 'shared') ?? []

  const mySharedTotal  = isLalo
    ? shared.reduce((s, e) => s + e.lalo_amount, 0)
    : shared.reduce((s, e) => s + e.ale_amount, 0)
  const personalTotal = personal.reduce((s, e) => s + e.total_amount, 0)

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header — desktop only */}
      <div className="hidden md:flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gastos Fijos</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Split vigente — Lalo:{' '}
            <span className="font-medium text-lalo">{laloSplit?.percentage?.toFixed(1) ?? '—'}%</span>
            {' '}· Ale:{' '}
            <span className="font-medium text-ale">{aleSplit?.percentage?.toFixed(1) ?? '—'}%</span>
          </p>
        </div>
        <AddExpenseForm />
      </div>

      {/* Header — mobile */}
      <div className="flex items-center justify-between md:hidden">
        <p className="text-xs text-gray-400">
          Lalo {laloSplit?.percentage?.toFixed(0) ?? '—'}% · Ale {aleSplit?.percentage?.toFixed(0) ?? '—'}%
        </p>
        <AddExpenseForm />
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3 md:p-4 bg-gray-50">
          <p className="text-xs text-gray-500 font-medium">Personales</p>
          <p className="text-lg md:text-xl font-bold text-gray-800 mt-1">{formatMXN(personalTotal)}</p>
          <p className="text-xs text-gray-400">/ mes</p>
        </div>
        <div className="card p-3 md:p-4 bg-purple-50">
          <p className="text-xs text-purple-700 font-medium">Mi parte compartidos</p>
          <p className="text-lg md:text-xl font-bold text-purple-800 mt-1">{formatMXN(mySharedTotal)}</p>
          <p className="text-xs text-purple-500">/ mes</p>
        </div>
        <div className="card p-3 md:p-4 bg-brand-50 col-span-2">
          <p className="text-xs text-brand-700 font-medium">Total mi responsabilidad</p>
          <p className="text-lg md:text-xl font-bold text-brand-800 mt-1">
            {formatMXN(personalTotal + mySharedTotal)}
          </p>
          <p className="text-xs text-brand-500">/ mes</p>
        </div>
      </div>

      {/* Gastos personales */}
      <section className="card p-4 md:p-5 space-y-3">
        <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
          Gastos personales
          <span className={isLalo ? 'badge-lalo' : 'badge-ale'}>
            {profile?.display_name}
          </span>
        </h2>
        <ExpenseTable expenses={personal} showSplit={false} isLalo={isLalo} cardMap={cardMap} />
      </section>

      {/* Gastos compartidos */}
      <section className="card p-4 md:p-5 space-y-3">
        <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
          Gastos compartidos
          <span className="badge-shared">Los 2</span>
          <span className="text-xs text-gray-400 font-normal ml-auto">
            {formatMXN(shared.reduce((s, e) => s + e.total_amount, 0))}/mes
          </span>
        </h2>
        <ExpenseTable expenses={shared} showSplit isLalo={isLalo} cardMap={cardMap} />
      </section>
    </div>
  )
}

function ExpenseTable({
  expenses,
  showSplit,
  isLalo,
  cardMap,
}: {
  expenses: RecurringExpenseSplit[]
  showSplit: boolean
  isLalo: boolean
  cardMap: Map<string, string>
}) {
  if (!expenses.length) {
    return <p className="text-sm text-gray-400">Sin gastos registrados.</p>
  }

  return (
    <>
      {/* Mobile: card list */}
      <div className="md:hidden space-y-2">
        {expenses.map(e => (
          <div key={e.id} className="flex items-center justify-between py-2 border-b last:border-0">
            <div className="min-w-0 flex-1 mr-2">
              <p className="text-sm font-medium text-gray-800 truncate">{e.concept}</p>
              <p className="text-xs text-gray-400">
                {intervalLabel(e.interval_type)} · {e.payment_day === 0 ? '15 y 30' : e.payment_day ? `Día ${e.payment_day}` : '—'}
                {e.card_id && cardMap.get(e.card_id) && (
                  <span className="ml-1 text-brand-600">· {cardMap.get(e.card_id)}</span>
                )}
              </p>
              {showSplit && (
                <p className="text-xs mt-0.5">
                  <span className="text-lalo">{formatMXN(e.lalo_amount)}</span>
                  <span className="text-gray-300 mx-1">·</span>
                  <span className="text-ale">{formatMXN(e.ale_amount)}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-semibold text-gray-800">{formatMXN(e.total_amount)}</span>
              <EditExpenseButton
                id={e.id}
                concept={e.concept}
                totalAmount={e.total_amount}
                intervalType={e.interval_type}
                paymentDay={e.payment_day ?? 15}
                nextPaymentDate={e.next_payment_date}
                cardId={e.card_id}
              />
              <DeleteExpenseButton id={e.id} />
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
              {showSplit && (
                <>
                  <th className="pb-2 font-medium text-lalo">Lalo</th>
                  <th className="pb-2 font-medium text-ale">Ale</th>
                </>
              )}
              <th className="pb-2 font-medium">Intervalo</th>
              <th className="pb-2 font-medium">Día de pago</th>
              <th className="pb-2 font-medium">Tarjeta</th>
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
                <td className="py-2.5 text-gray-500">
                  {e.payment_day === 0 ? '15 y 30' : e.payment_day ? `Día ${e.payment_day}` : '—'}
                </td>
                <td className="py-2.5 text-xs text-brand-600">
                  {e.card_id ? (cardMap.get(e.card_id) ?? '—') : '—'}
                </td>
                <td className="py-2.5">
                  <div className="flex items-center gap-1">
                    <EditExpenseButton
                      id={e.id}
                      concept={e.concept}
                      totalAmount={e.total_amount}
                      intervalType={e.interval_type}
                      paymentDay={e.payment_day ?? 15}
                      cardId={e.card_id}
                    />
                    <DeleteExpenseButton id={e.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
