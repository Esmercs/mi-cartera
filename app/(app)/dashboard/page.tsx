import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatMXN } from '@/lib/utils/currency'
import { formatMXDate, isOverdue, getCurrentPeriodDates, getOffsetPeriodDates } from '@/lib/utils/date-utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { PeriodSummary, InstallmentPlan, InterPersonDebt, IncomeConfig, ScheduledPayment, RecurringExpenseSplit } from '@/types/database'
import AddPeriodPaymentForm from '@/components/dashboard/add-period-payment-form'
import PeriodPaymentsList from '@/components/dashboard/period-payments-list'
import AddIncomeForm from '@/components/dashboard/add-income-form'
import RegisterNextPaymentButton from '@/components/dashboard/register-next-payment-button'
import CollapsibleCardGroup from '@/components/dashboard/collapsible-card-group'
import MarkDebtPaidButton from '@/components/shared/mark-debt-paid-button'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { p?: string }
}) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const userId = session.user.id

  // Período actual
  const { start, end, label: periodLabel } = getCurrentPeriodDates()
  const periodDateStr = format(end, 'yyyy-MM-dd')

  // Buscar o crear la quincena actual
  let { data: period } = await supabase
    .from('periods')
    .select('*')
    .eq('owner_id', userId)
    .eq('period_date', periodDateStr)
    .single()

  if (!period) {
    // Obtener último ingreso registrado
    const { data: lastIncome } = await supabase
      .from('income_config')
      .select('amount')
      .eq('owner_id', userId)
      .order('valid_from', { ascending: false })
      .limit(1)
      .single() as { data: { amount: number } | null }

    const income = lastIncome?.amount ? lastIncome.amount / 2 : 0

    const { data: newPeriod } = await supabase
      .from('periods')
      .insert({
        owner_id: userId,
        period_date: periodDateStr,
        label: periodLabel,
        income,
        budget_fijos: income,
        budget_extra: 0,
      })
      .select()
      .single()

    period = newPeriod
  }

  // Próxima quincena — offset navegable (p=0 = quincena actual, p=1 = siguiente, etc.)
  const periodOffset = Math.max(0, parseInt(searchParams.p ?? '0') || 0)
  const { start: nextStart, end: nextEnd, label: nextLabel, payDay: nextPayDay } = getOffsetPeriodDates(periodOffset)
  const nextPeriodStr = format(nextEnd, 'yyyy-MM-dd')
  const nextStartStr  = format(nextStart, 'yyyy-MM-dd')

  // Grupo 1: queries independientes en paralelo
  const [
    { data: summary },
    { data: payments },
    { data: installments },
    { data: debtsOwed },
    { data: debtsToCollect },
    { data: profile },
    { data: currentIncome },
    { data: nextScheduled },
    { data: nextMSI },
    { data: nextDebts },
  ] = await Promise.all([
    supabase.from('period_summary').select('*').eq('id', period?.id).single() as Promise<{ data: PeriodSummary | null }>,
    supabase.from('period_payments').select('*, cards(name)').eq('period_id', period?.id ?? '').order('paid_at', { ascending: false }),
    supabase.from('installment_plans').select('*, cards(name)').eq('owner_id', userId).eq('is_active', true).order('next_payment_date', { ascending: true }) as Promise<{ data: InstallmentPlan[] | null }>,
    supabase.from('inter_person_debts').select('*, creditor:profiles!creditor_id(display_name, full_name)').eq('debtor_id', userId).eq('is_paid', false) as Promise<{ data: InterPersonDebt[] | null }>,
    supabase.from('inter_person_debts').select('*, debtor:profiles!debtor_id(display_name, full_name)').eq('creditor_id', userId).eq('is_paid', false) as Promise<{ data: InterPersonDebt[] | null }>,
    supabase.from('profiles').select('display_name').eq('id', userId).single(),
    supabase.from('income_config').select('amount, valid_from').eq('owner_id', userId).order('valid_from', { ascending: false }).limit(1).single() as Promise<{ data: IncomeConfig | null }>,
    supabase.from('scheduled_payments').select('*, cards(name)').eq('owner_id', userId).eq('period_date', nextPeriodStr).eq('is_paid', false).order('payment_type', { ascending: true }) as Promise<{ data: ScheduledPayment[] | null }>,
    supabase.from('installment_plans').select('*, cards(name)').eq('owner_id', userId).eq('is_active', true).gte('next_payment_date', nextStartStr).lte('next_payment_date', nextPeriodStr) as Promise<{ data: InstallmentPlan[] | null }>,
    supabase.from('inter_person_debts').select('*, creditor:profiles!creditor_id(display_name)').eq('debtor_id', userId).eq('is_paid', false).gte('due_date', nextStartStr).lte('due_date', nextPeriodStr) as Promise<{ data: any[] | null }>,
  ])

  const isLalo      = (profile as any)?.display_name?.toLowerCase() === 'lalo'
  const myOwnership = isLalo ? 'lalo' : 'ale'

  // Grupo 2: gastos fijos + tarjetas (dependen de myOwnership) en paralelo
  const [{ data: nextFijosByDay }, { data: nextFijosByDate }, { data: allCards }] = await Promise.all([
    supabase.from('recurring_expenses_split').select('*').eq('is_active', true).in('ownership', [myOwnership, 'shared']).or(`payment_day.eq.${nextPayDay},payment_day.eq.0,payment_day.is.null`).in('interval_type', ['quincenal', 'mensual']) as Promise<{ data: RecurringExpenseSplit[] | null }>,
    supabase.from('recurring_expenses_split').select('*').eq('is_active', true).in('ownership', [myOwnership, 'shared']).in('interval_type', ['bimestral', 'trimestral', 'anual', 'c/15 dias', 'c/21 dias']).gte('next_payment_date', nextStartStr).lte('next_payment_date', nextPeriodStr) as Promise<{ data: RecurringExpenseSplit[] | null }>,
    supabase.from('cards').select('id, name').eq('is_active', true),
  ])
  const cardNameMap = new Map((allCards ?? []).map(c => [c.id, c.name]))

  const nextFijos = [...(nextFijosByDay ?? []), ...(nextFijosByDate ?? [])]

  // Unificar en una lista ordenada por monto descendente
  type NextItem = {
    key: string; concept: string; amount: number; card: string | null
    type: 'fijo' | 'msi' | 'programado' | 'deuda'
    cardId: string | null; planId: string | null; scheduledId: string | null
    debtId: string | null; creditorName: string | null
    totalInstallments: number | null; paidInstallments: number; dueDate: string | null
    recurringExpenseId: string | null; intervalType: string | null; currentNextPaymentDate: string | null
  }
  const nextItems: NextItem[] = [
    ...(nextScheduled ?? []).map(p => ({
      key: p.id, concept: p.concept, amount: p.amount,
      card: (p as any).cards?.name ?? null,
      type: 'programado' as const,
      cardId: p.card_id ?? null, planId: null, scheduledId: p.id,
      debtId: null, creditorName: null,
      totalInstallments: null, paidInstallments: 0, dueDate: null,
      recurringExpenseId: null, intervalType: null, currentNextPaymentDate: null,
    })),
    ...(nextFijos).map(e => {
      const isDateBased = ['bimestral', 'trimestral', 'anual', 'c/15 dias', 'c/21 dias'].includes(e.interval_type)
      const cardName = e.card_id ? (cardNameMap.get(e.card_id) ?? null) : null
      return {
        key: e.id, concept: e.concept,
        amount: e.ownership === 'shared' ? (isLalo ? e.lalo_amount : e.ale_amount) : e.total_amount,
        card: cardName, type: 'fijo' as const,
        cardId: e.card_id ?? null, planId: null, scheduledId: null,
        debtId: null, creditorName: null,
        totalInstallments: null, paidInstallments: 0, dueDate: null,
        recurringExpenseId: isDateBased ? e.id : null,
        intervalType: isDateBased ? e.interval_type : null,
        currentNextPaymentDate: isDateBased ? (e.next_payment_date ?? null) : null,
      }
    }),
    ...(nextMSI ?? []).map(p => ({
      key: p.id, concept: p.concept, amount: p.monthly_amount,
      card: (p as any).cards?.name ?? null,
      type: 'msi' as const,
      cardId: p.card_id ?? null, planId: p.id, scheduledId: null,
      debtId: null, creditorName: null,
      totalInstallments: null, paidInstallments: 0, dueDate: null,
      recurringExpenseId: null, intervalType: null, currentNextPaymentDate: null,
    })),
    ...(nextDebts ?? []).map(d => ({
      key: d.id, concept: d.concept, amount: d.amount,
      card: null, type: 'deuda' as const,
      cardId: null, planId: null, scheduledId: null,
      debtId: d.id, creditorName: d.creditor?.display_name ?? null,
      totalInstallments: d.total_installments ?? null,
      paidInstallments: d.paid_installments ?? 0,
      dueDate: d.due_date ?? null,
      recurringExpenseId: null, intervalType: null, currentNextPaymentDate: null,
    })),
  ].sort((a, b) => b.amount - a.amount)

  // Agrupar por tarjeta (null = sin tarjeta)
  const cardGroupMap = new Map<string, { cardName: string; cardId: string; items: typeof nextItems }>()
  const noCardItems: typeof nextItems = []

  for (const item of nextItems) {
    if (item.cardId && item.card) {
      if (!cardGroupMap.has(item.cardId)) {
        cardGroupMap.set(item.cardId, { cardName: item.card, cardId: item.cardId, items: [] })
      }
      cardGroupMap.get(item.cardId)!.items.push(item)
    } else {
      noCardItems.push(item)
    }
  }
  const cardGroups = Array.from(cardGroupMap.values())


  const totalMSI = (installments ?? []).reduce((sum, p) => sum + p.monthly_amount, 0)
  const debtPending = (d: InterPersonDebt) =>
    d.total_installments ? d.amount * (d.total_installments - d.paid_installments) : d.amount
  const totalOwed       = (debtsOwed      ?? []).reduce((sum, d) => sum + debtPending(d), 0)
  const totalToCollect  = (debtsToCollect ?? []).reduce((sum, d) => sum + debtPending(d), 0)

  // Resumen calculado desde el ingreso vigente (no el guardado en el período)
  const ingresoQuincenal = Math.round((currentIncome?.amount ?? 0) / 2)
  const totalPagado      = (payments ?? []).reduce((sum, p) => sum + p.amount, 0)
  const restante         = ingresoQuincenal - totalPagado

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Header — solo desktop (en móvil lo muestra MobileHeader) */}
      <div className="hidden md:flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mi Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {format(start, "d 'de' MMMM", { locale: es })} – {format(end, "d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
        <AddIncomeForm currentAmount={currentIncome?.amount ?? 0} />
      </div>

      {/* Período + ingreso — móvil */}
      <div className="flex items-center justify-between md:hidden">
        <p className="text-xs text-gray-400">
          {format(start, "d MMM", { locale: es })} – {format(end, "d MMM", { locale: es })}
        </p>
        <AddIncomeForm currentAmount={currentIncome?.amount ?? 0} />
      </div>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Ingreso quincenal" value={formatMXN(ingresoQuincenal)} color="blue" />
        <SummaryCard label="Pagado" value={formatMXN(totalPagado)} color="orange" />
        <SummaryCard
          label="Restante"
          value={formatMXN(restante)}
          color={restante < 0 ? 'red' : 'green'}
        />
        <SummaryCard label="MSI/mes" value={formatMXN(totalMSI)} color="purple" />
      </div>

      {/* Pagos de la quincena */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 text-sm">Pagos de la quincena</h2>
          <AddPeriodPaymentForm periodId={period?.id ?? ''} />
        </div>
        <PeriodPaymentsList payments={payments ?? []} />
      </div>

      {/* Próxima quincena — agrupado por tarjeta */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-700 text-sm">Próxima quincena</h2>
          <div className="flex items-center gap-1">
            {periodOffset > 0 && (
              <a href={`?p=${periodOffset - 1}`}
                className="text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                ‹
              </a>
            )}
            <span className="font-normal text-gray-500 text-xs">{nextLabel}</span>
            <a href={`?p=${periodOffset + 1}`}
              className="text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              ›
            </a>
          </div>
          {nextItems.length > 0 && (
            <span className="ml-auto text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {nextItems.length}
            </span>
          )}
        </div>

        {nextItems.length === 0 ? (
          <p className="text-sm text-gray-400">Sin pagos programados para la próxima quincena.</p>
        ) : (
          <>
            {/* Grupos por tarjeta — expandibles */}
            {cardGroups.map(group => (
              <CollapsibleCardGroup
                key={group.cardId}
                cardId={group.cardId}
                cardName={group.cardName}
                items={group.items}
                periodId={period?.id ?? ''}
              />
            ))}

            {/* Ítems sin tarjeta — individuales */}
            {noCardItems.length > 0 && (
              <div className="space-y-0.5">
                {cardGroups.length > 0 && (
                  <p className="text-xs text-gray-400 font-medium pt-1">Sin tarjeta</p>
                )}
                {noCardItems.map(item => (
                  <div key={item.key} className="flex items-center justify-between py-2 border-b last:border-0 gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 truncate">{item.concept}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          item.type === 'fijo'  ? 'bg-blue-50 text-blue-600' :
                          item.type === 'msi'   ? 'bg-purple-50 text-purple-600' :
                          item.type === 'deuda' ? 'bg-red-50 text-red-600' :
                          'bg-orange-50 text-orange-600'
                        }`}>
                          {item.type === 'fijo' ? 'Fijo' : item.type === 'msi' ? 'MSI' :
                           item.type === 'deuda' ? `→ ${item.creditorName ?? 'deuda'}` : 'Programado'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold text-gray-800">{formatMXN(item.amount)}</span>
                      {item.type === 'deuda' && item.debtId ? (
                        <MarkDebtPaidButton
                          debtId={item.debtId}
                          totalInstallments={item.totalInstallments}
                          paidInstallments={item.paidInstallments}
                          dueDate={item.dueDate}
                        />
                      ) : (
                        <RegisterNextPaymentButton
                          periodId={period?.id ?? ''}
                          concept={item.concept}
                          amount={item.amount}
                          cardId={item.cardId}
                          type={item.type as 'fijo' | 'msi' | 'programado'}
                          planId={item.planId}
                          scheduledId={item.scheduledId}
                          recurringExpenseId={item.recurringExpenseId}
                          intervalType={item.intervalType as any}
                          currentNextPaymentDate={item.currentNextPaymentDate}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-1 border-t flex justify-between text-sm font-bold text-gray-700">
              <span>Total estimado</span>
              <span>{formatMXN(nextItems.reduce((s, i) => s + i.amount, 0))}</span>
            </div>
          </>
        )}
      </div>

      {/* MSIs activos */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
          Meses sin intereses
          {(installments?.length ?? 0) > 0 && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {installments?.length}
            </span>
          )}
        </h2>
        {!installments?.length ? (
          <p className="text-sm text-gray-400">Sin MSI activos.</p>
        ) : (
          <div className="space-y-2">
            {installments.map(plan => (
              <div key={plan.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="min-w-0 flex-1 mr-2">
                  <p className="text-sm font-medium text-gray-800 truncate">{plan.concept}</p>
                  <p className="text-xs text-gray-400">
                    {(plan as any).cards?.name ?? '—'} · {plan.current_month}/{plan.total_months}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-gray-800">{formatMXN(plan.monthly_amount)}</p>
                  <p className={`text-xs ${isOverdue(plan.next_payment_date) ? 'text-red-500' : 'text-gray-400'}`}>
                    {formatMXDate(plan.next_payment_date)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deudas */}
      {(debtsOwed?.length ?? 0) > 0 && (
        <div className="card p-4 space-y-2">
          <h2 className="font-semibold text-red-600 text-sm">Lo que debo · {formatMXN(totalOwed)}</h2>
          {debtsOwed!.map(d => (
            <div key={d.id} className="flex justify-between items-start py-1.5 border-b last:border-0 gap-2">
              <div className="min-w-0">
                <p className="text-sm text-gray-700 truncate">{d.concept}</p>
                {d.total_installments && (
                  <p className="text-xs text-purple-500">
                    {d.paid_installments}/{d.total_installments} cuotas · {formatMXN(d.amount)}/mes
                  </p>
                )}
              </div>
              <span className="font-medium text-red-600 shrink-0 text-sm">
                {d.total_installments
                  ? formatMXN(d.amount * (d.total_installments - d.paid_installments))
                  : formatMXN(d.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {(debtsToCollect?.length ?? 0) > 0 && (
        <div className="card p-4 space-y-2">
          <h2 className="font-semibold text-green-700 text-sm">Me deben · {formatMXN(totalToCollect)}</h2>
          {debtsToCollect!.map(d => (
            <div key={d.id} className="flex justify-between items-start py-1.5 border-b last:border-0 gap-2">
              <div className="min-w-0">
                <p className="text-sm text-gray-700 truncate">{d.concept}</p>
                {d.total_installments && (
                  <p className="text-xs text-purple-500">
                    {d.paid_installments}/{d.total_installments} cuotas · {formatMXN(d.amount)}/mes
                  </p>
                )}
              </div>
              <span className="font-medium text-green-700 shrink-0 text-sm">
                {d.total_installments
                  ? formatMXN(d.amount * (d.total_installments - d.paid_installments))
                  : formatMXN(d.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}

function SummaryCard({
  label, value, color,
}: {
  label: string
  value: string
  color: 'blue' | 'green' | 'orange' | 'purple' | 'red'
}) {
  const colors = {
    blue:   'bg-blue-50 text-blue-700',
    green:  'bg-green-50 text-green-700',
    orange: 'bg-orange-50 text-orange-700',
    purple: 'bg-purple-50 text-purple-700',
    red:    'bg-red-50 text-red-700',
  }
  return (
    <div className={`card p-3 md:p-4 ${colors[color]}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-lg md:text-xl font-bold mt-0.5">{value}</p>
    </div>
  )
}
