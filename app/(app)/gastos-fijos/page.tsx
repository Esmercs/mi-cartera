export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatMXN } from '@/lib/utils/currency'
import { intervalLabel, formatMXDate, isOverdue, getCurrentPeriodDates, getOffsetPeriodDates } from '@/lib/utils/date-utils'
import { format } from 'date-fns'
import Link from 'next/link'
import type { RecurringExpenseSplit } from '@/types/database'
import { monthlyEquivalent } from '@/lib/utils/financial-analysis'
import AddExpenseForm from '@/components/gastos-fijos/add-expense-form'
import DeleteExpenseButton from '@/components/gastos-fijos/delete-expense-button'
import EditExpenseButton from '@/components/gastos-fijos/edit-expense-button'
import AddProjectionForm from '@/components/dashboard/add-projection-form'
import MarkProjectionPaidButton from '@/components/dashboard/mark-projection-paid-button'
import AddInterPersonDebtForm from '@/components/shared/add-inter-person-debt-form'
import MarkDebtPaidButton from '@/components/shared/mark-debt-paid-button'
import EditDebtDialog from '@/components/shared/edit-debt-dialog'

export default async function GastosFijosPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const userId = session.user.id
  const { end } = getCurrentPeriodDates()
  const { start: nextStart, end: nextEnd, label: nextLabel } = getOffsetPeriodDates(0)
  const periodDateStr  = format(end, 'yyyy-MM-dd')
  const nextStartStr   = format(nextStart, 'yyyy-MM-dd')
  const nextPeriodStr  = format(nextEnd, 'yyyy-MM-dd')
  const todayStr       = format(new Date(), 'yyyy-MM-dd')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, id')
    .eq('id', userId)
    .single()

  const isLalo = profile?.display_name?.toLowerCase() === 'lalo'
  const myOwnership = isLalo ? 'lalo' : 'ale'

  // Período actual para registrar pagos de proyecciones
  let { data: period } = await supabase
    .from('periods')
    .select('id')
    .eq('owner_id', userId)
    .eq('period_date', periodDateStr)
    .single()

  // Gastos con split calculado (vista SQL) + tarjetas + proyecciones + deudas entre nosotros en paralelo
  const [{ data: allExpenses }, { data: cards }, { data: allProjections }, { data: debts }] = await Promise.all([
    supabase.from('recurring_expenses_split').select('*').eq('is_active', true).order('next_payment_date', { ascending: true }) as Promise<{ data: RecurringExpenseSplit[] | null }>,
    supabase.from('cards').select('id, name').eq('is_active', true),
    (supabase.from('projections') as any).select('*, cards(name)').eq('owner_id', userId).eq('is_paid', false).gte('projected_date', todayStr).order('projected_date', { ascending: true }),
    supabase.from('inter_person_debts').select('*, debtor:profiles!debtor_id(display_name, full_name), creditor:profiles!creditor_id(display_name, full_name), cards(name)').eq('is_paid', false).order('created_at', { ascending: false }),
  ])

  const proximaProjections = (allProjections ?? []).filter(
    (p: any) => p.projected_date >= nextStartStr && p.projected_date <= nextPeriodStr
  )
  const futureProjections = (allProjections ?? []).filter(
    (p: any) => p.projected_date > nextPeriodStr
  )
  const cardMap = new Map((cards ?? []).map(c => [c.id, c.name]))

  // Split vigente via SECURITY DEFINER function (bypasses RLS)
  const { data: splitRow } = await supabase.rpc('get_split_percentages').single() as
    { data: { lalo_pct: number; ale_pct: number } | null }

  const laloSplit = splitRow ? { percentage: splitRow.lalo_pct } : null
  const aleSplit  = splitRow ? { percentage: splitRow.ale_pct  } : null

  const personal = allExpenses?.filter(e => e.ownership === myOwnership) ?? []
  const shared   = allExpenses?.filter(e => e.ownership === 'shared') ?? []

  const round2 = (n: number) => Math.round(n * 100) / 100
  const otherName = isLalo ? 'Ale' : 'Lalo'
  const myPart    = (e: RecurringExpenseSplit) => isLalo ? e.lalo_amount : e.ale_amount
  const otherPart = (e: RecurringExpenseSplit) => isLalo ? e.ale_amount  : e.lalo_amount
  // Yo desembolso el compartido completo → la parte del otro es a recabar
  const iDisburse = (e: RecurringExpenseSplit) => e.paid_by === myOwnership

  // Todo total de esta página es mensualizado: sumar montos en crudo con
  // intervalos distintos no significa nada (una quincenal pesa el doble que su
  // monto, una bimestral la mitad). Coincide con la sección de Análisis.
  const perMonth = (e: RecurringExpenseSplit, amount: number) =>
    monthlyEquivalent(amount, e.interval_type)

  const mySharedTotal   = round2(shared.reduce((s, e) => s + perMonth(e, myPart(e)), 0))
  const personalTotal   = round2(personal.reduce((s, e) => s + perMonth(e, e.total_amount), 0))
  const sharedTotal     = round2(shared.reduce((s, e) => s + perMonth(e, e.total_amount), 0))
  // Lo que pongo de más en los compartidos que yo pago y el otro me repone
  const toCollectTotal  = round2(shared.filter(iDisburse).reduce((s, e) => s + perMonth(e, otherPart(e)), 0))
  // Mi parte de los compartidos que paga el otro: eso se lo repongo yo
  const toRepayTotal    = round2(
    shared.filter(e => !iDisburse(e) && e.paid_by && e.paid_by !== 'each')
          .reduce((s, e) => s + perMonth(e, myPart(e)), 0)
  )
  // Efectivo que sale por mis manos: mis personales + el cargo completo de los
  // compartidos que yo pago + mi parte en los de «cada quien»
  const myOutlay = round2(
    personalTotal
    + shared.filter(iDisburse).reduce((s, e) => s + perMonth(e, e.total_amount), 0)
    + shared.filter(e => !e.paid_by || e.paid_by === 'each').reduce((s, e) => s + perMonth(e, myPart(e)), 0)
  )

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header — desktop only */}
      <div className="hidden md:flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gastos</h1>
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
            {formatMXN(round2(personalTotal + mySharedTotal))}
          </p>
          <p className="text-xs text-brand-500">/ mes</p>
          {(toCollectTotal > 0 || toRepayTotal > 0) && (
            <div className="mt-2 pt-2 border-t border-brand-100 space-y-1">
              <div className="flex justify-between text-xs text-brand-500">
                <span>Sale por mis manos</span>
                <span>{formatMXN(myOutlay)}</span>
              </div>
              {toCollectTotal > 0 && (
                <div className="flex justify-between text-xs font-semibold text-green-700">
                  <span>A recibir de {otherName}</span>
                  <span>{formatMXN(toCollectTotal)}</span>
                </div>
              )}
              {toRepayTotal > 0 && (
                <div className="flex justify-between text-xs font-semibold text-red-600">
                  <span>A reponerle a {otherName}</span>
                  <span>{formatMXN(toRepayTotal)}</span>
                </div>
              )}
            </div>
          )}
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
          <span className="text-xs font-normal ml-auto text-right">
            <span className="text-gray-600 font-semibold">{formatMXN(mySharedTotal)}</span>
            <span className="text-gray-400"> mi parte de {formatMXN(sharedTotal)}/mes</span>
          </span>
        </h2>
        <ExpenseTable expenses={shared} showSplit isLalo={isLalo} cardMap={cardMap} />
      </section>

      {/* Proyecciones */}
      <section className="card p-4 md:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800 text-sm">Proyecciones</h2>
            <p className="text-xs text-gray-400 mt-0.5">Gastos futuros planificados</p>
          </div>
          <AddProjectionForm />
        </div>

        {(allProjections ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">Sin proyecciones. Agrega gastos futuros planeados.</p>
        ) : (
          <>
            {proximaProjections.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Próxima quincena · {nextLabel}
                </p>
                <div className="space-y-0">
                  {proximaProjections.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between py-2.5 border-b last:border-0 gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.concept}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-400">{formatMXDate(p.projected_date)}</span>
                          {p.cards?.name && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-medium">
                              {p.cards.name}
                            </span>
                          )}
                        </div>
                        {p.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{p.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold text-gray-800">{formatMXN(p.amount)}</span>
                        <MarkProjectionPaidButton
                          projectionId={p.id}
                          periodId={period?.id ?? ''}
                          concept={p.concept}
                          amount={p.amount}
                          cardId={p.card_id ?? null}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {futureProjections.length > 0 && (
              <div>
                {proximaProjections.length > 0 && (
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 pt-1">
                    Más adelante
                  </p>
                )}
                <div className="space-y-0">
                  {futureProjections.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between py-2.5 border-b last:border-0 gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.concept}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-400">{formatMXDate(p.projected_date)}</span>
                          {p.cards?.name && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-medium">
                              {p.cards.name}
                            </span>
                          )}
                        </div>
                        {p.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{p.notes}</p>}
                      </div>
                      <span className="text-sm font-semibold text-gray-700 shrink-0">{formatMXN(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Deudas entre nosotros */}
      <section className="card p-4 md:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Deudas entre nosotros</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Las compras con tarjeta regístralas en{' '}
              <Link href="/tarjetas" className="text-brand-600 hover:underline">Tarjetas</Link>
              {' '}como gasto compartido — la deuda se crea sola.
            </p>
          </div>
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-gray-800">{debt.concept}</p>
                    <EditDebtDialog
                      debtId={debt.id}
                      concept={debt.concept}
                      amount={debt.amount}
                      dueDate={debt.due_date ?? null}
                      totalInstallments={debt.total_installments ?? null}
                      paidInstallments={debt.paid_installments ?? 0}
                      cardId={debt.card_id ?? null}
                      cardName={debt.cards?.name ?? null}
                      creditorId={debt.creditor_id}
                      currentUserId={userId}
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    <span className="font-medium">{debt.debtor?.display_name}</span>
                    {' '}le debe a{' '}
                    <span className="font-medium">{debt.creditor?.display_name}</span>
                    {debt.cards?.name && (
                      <span className="ml-1.5 bg-blue-50 text-blue-600 text-[10px] px-1.5 py-0.5 rounded">
                        💳 {debt.cards.name}
                      </span>
                    )}
                  </p>
                  {debt.total_installments && (
                    <p className="text-xs text-purple-600 mt-0.5">
                      {debt.paid_installments}/{debt.total_installments} cuotas ·{' '}
                      {formatMXN(debt.amount)}/mes
                    </p>
                  )}
                  {debt.due_date && (
                    <p className={`text-xs mt-0.5 ${isOverdue(debt.due_date) ? 'text-red-500' : 'text-gray-400'}`}>
                      Vence: {formatMXDate(debt.due_date)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-semibold text-gray-800">
                    {debt.total_installments
                      ? formatMXN(debt.amount * (debt.total_installments - debt.paid_installments))
                      : formatMXN(debt.amount)}
                  </span>
                  {debt.creditor_id === userId ? (
                    <MarkDebtPaidButton
                      debtId={debt.id}
                      creditorId={debt.creditor_id}
                      totalInstallments={debt.total_installments ?? null}
                      paidInstallments={debt.paid_installments ?? 0}
                      dueDate={debt.due_date ?? null}
                      concept={debt.concept}
                      amount={debt.amount}
                    />
                  ) : (
                    // Solo quien recibe el pago (acreedor) puede confirmarlo
                    <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg whitespace-nowrap">
                      Confirma {debt.creditor?.display_name}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
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

  const round2    = (n: number) => Math.round(n * 100) / 100
  const otherName = isLalo ? 'Ale' : 'Lalo'
  const myPart    = (e: RecurringExpenseSplit) => isLalo ? e.lalo_amount : e.ale_amount
  const otherPart = (e: RecurringExpenseSplit) => isLalo ? e.ale_amount  : e.lalo_amount
  // Compartido que yo desembolso completo: la parte del otro es a recabar
  const iDisburse = (e: RecurringExpenseSplit) => e.paid_by === (isLalo ? 'lalo' : 'ale')
  // El importe que pesa sobre mí siempre es mi parte; en personales es el total
  const rowMine   = (e: RecurringExpenseSplit) => showSplit ? myPart(e) : e.total_amount

  // Los totales son mensualizados; las filas siguen mostrando el cargo real de
  // cada cobro, así que una fila quincenal pesa el doble en el total.
  const perMonth   = (e: RecurringExpenseSplit, amount: number) =>
    monthlyEquivalent(amount, e.interval_type)
  const isMonthly  = (e: RecurringExpenseSplit) => e.interval_type === 'mensual'

  const sumTotal   = round2(expenses.reduce((s, e) => s + perMonth(e, e.total_amount), 0))
  const sumMine    = round2(expenses.reduce((s, e) => s + perMonth(e, rowMine(e)), 0))
  const sumLalo    = round2(expenses.reduce((s, e) => s + perMonth(e, e.lalo_amount), 0))
  const sumAle     = round2(expenses.reduce((s, e) => s + perMonth(e, e.ale_amount), 0))
  const sumCollect = round2(expenses.filter(iDisburse).reduce((s, e) => s + perMonth(e, otherPart(e)), 0))

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
                {e.ownership === 'shared' && e.paid_by && e.paid_by !== 'each' && (
                  <span className="ml-1 text-purple-600">· Paga {e.paid_by === 'lalo' ? 'Lalo' : 'Ale'}</span>
                )}
              </p>
              {showSplit && (
                <p className="text-xs mt-0.5">
                  <span className="text-gray-400">Total {formatMXN(e.total_amount)}</span>
                  <span className="text-gray-300 mx-1">·</span>
                  {iDisburse(e) ? (
                    <span className="text-green-600 font-medium">
                      recabas {formatMXN(otherPart(e))} de {otherName}
                    </span>
                  ) : (
                    <span className="text-gray-400">{otherName} {formatMXN(otherPart(e))}</span>
                  )}
                </p>
              )}
              {!isMonthly(e) && (
                <p className="text-[10px] text-gray-400 mt-0.5">
                  ≡ {formatMXN(perMonth(e, rowMine(e)))}/mes de mi parte
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-semibold text-gray-800">{formatMXN(rowMine(e))}</span>
              <EditExpenseButton
                id={e.id}
                concept={e.concept}
                totalAmount={e.total_amount}
                intervalType={e.interval_type}
                paymentDay={e.payment_day ?? 15}
                nextPaymentDate={e.next_payment_date}
                cardId={e.card_id}
                ownership={e.ownership}
                paidBy={e.paid_by}
                category={e.category}
                nextChargeDate={e.next_charge_date}
              />
              <DeleteExpenseButton id={e.id} />
            </div>
          </div>
        ))}
        <div className="pt-2 border-t border-gray-100 space-y-1">
          <div className="flex justify-between text-xs font-semibold text-gray-500">
            <span>{showSplit ? 'Mi parte' : 'Total'} /mes</span>
            <span>{formatMXN(sumMine)}</span>
          </div>
          {showSplit && (
            <div className="flex justify-between text-xs text-gray-400">
              <span>Total compartido /mes</span>
              <span>{formatMXN(sumTotal)}</span>
            </div>
          )}
          {sumCollect > 0 && (
            <div className="flex justify-between text-xs font-semibold text-green-700">
              <span>A recibir de {otherName} /mes</span>
              <span>{formatMXN(sumCollect)}</span>
            </div>
          )}
          <p className="text-[10px] text-gray-300">
            Totales mensualizados: cada gasto se lleva a su equivalente por mes según
            su intervalo, así que no son la suma directa de los montos de arriba.
          </p>
        </div>
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
                  <th className="pb-2 font-medium text-lalo">Lalo{isLalo && ' (tú)'}</th>
                  <th className="pb-2 font-medium text-ale">Ale{!isLalo && ' (tú)'}</th>
                </>
              )}
              <th className="pb-2 font-medium">Intervalo</th>
              <th className="pb-2 font-medium">Día de pago</th>
              {showSplit && <th className="pb-2 font-medium">Paga</th>}
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
                    <td className={`py-2.5 text-lalo ${isLalo ? 'font-bold' : 'font-medium'}`}>
                      {formatMXN(e.lalo_amount)}
                      {!isLalo && iDisburse(e) && <CollectTag otherName={otherName} />}
                    </td>
                    <td className={`py-2.5 text-ale ${!isLalo ? 'font-bold' : 'font-medium'}`}>
                      {formatMXN(e.ale_amount)}
                      {isLalo && iDisburse(e) && <CollectTag otherName={otherName} />}
                    </td>
                  </>
                )}
                <td className="py-2.5 text-gray-500">
                  {intervalLabel(e.interval_type)}
                  {!isMonthly(e) && (
                    <span className="block text-[10px] text-gray-400">
                      ≡ {formatMXN(perMonth(e, rowMine(e)))}/mes
                    </span>
                  )}
                </td>
                <td className="py-2.5 text-gray-500">
                  {e.payment_day === 0 ? '15 y 30' : e.payment_day ? `Día ${e.payment_day}` : '—'}
                </td>
                {showSplit && (
                  <td className="py-2.5 text-xs">
                    {!e.paid_by || e.paid_by === 'each'
                      ? <span className="text-gray-400">Cada quien</span>
                      : e.paid_by === 'lalo'
                        ? <span className="text-lalo font-medium">Lalo</span>
                        : <span className="text-ale font-medium">Ale</span>
                    }
                  </td>
                )}
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
                      ownership={e.ownership}
                      paidBy={e.paid_by}
                      nextChargeDate={e.next_charge_date}
                      category={e.category}
                    />
                    <DeleteExpenseButton id={e.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 text-xs">
              <td className="pt-2 font-semibold text-gray-500">Totales /mes</td>
              <td className="pt-2 text-gray-500">{formatMXN(sumTotal)}</td>
              {showSplit && (
                <>
                  <td className={`pt-2 text-lalo ${isLalo ? 'font-bold' : 'font-semibold'}`}>{formatMXN(sumLalo)}</td>
                  <td className={`pt-2 text-ale ${!isLalo ? 'font-bold' : 'font-semibold'}`}>{formatMXN(sumAle)}</td>
                </>
              )}
              <td className="pt-2" colSpan={showSplit ? 5 : 4}>
                {sumCollect > 0 && (
                  <span className="text-green-700 font-semibold">
                    A recibir de {otherName}: {formatMXN(sumCollect)}
                  </span>
                )}
              </td>
            </tr>
            <tr className="text-xs">
              <td className="pt-1 text-gray-400" colSpan={showSplit ? 9 : 6}>
                {showSplit && (
                  <>
                    Mi parte: <span className="font-semibold text-gray-600">{formatMXN(sumMine)}</span>
                    {' '}de {formatMXN(sumTotal)}.{' '}
                  </>
                )}
                Totales mensualizados según el intervalo de cada gasto — no son la suma
                directa de la columna.
                {sumCollect > 0 && ` «A recibir» es lo que pones tú y ${otherName} te repone.`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}

// Marca la parte del otro en un compartido que yo desembolso completo
function CollectTag({ otherName }: { otherName: string }) {
  return (
    <span
      className="text-green-600 text-[10px] ml-1 font-medium"
      title={`Lo pones tú y ${otherName} te lo repone`}
    >
      a recabar
    </span>
  )
}
