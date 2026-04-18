import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatMXN } from '@/lib/utils/currency'
import { formatMXDate, isOverdue, getCurrentPeriodDates, getNextPeriodDates } from '@/lib/utils/date-utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { PeriodSummary, InstallmentPlan, InterPersonDebt, IncomeConfig, ScheduledPayment, RecurringExpenseSplit } from '@/types/database'
import AddPeriodPaymentForm from '@/components/dashboard/add-period-payment-form'
import PeriodPaymentsList from '@/components/dashboard/period-payments-list'
import AddIncomeForm from '@/components/dashboard/add-income-form'
import RegisterNextPaymentButton from '@/components/dashboard/register-next-payment-button'
import PayCardGroupButton from '@/components/dashboard/pay-card-group-button'
import MarkDebtPaidButton from '@/components/shared/mark-debt-paid-button'

export default async function DashboardPage() {
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

  // Resumen de la quincena
  const { data: summary } = await supabase
    .from('period_summary')
    .select('*')
    .eq('id', period?.id)
    .single() as { data: PeriodSummary | null }

  // Pagos de la quincena actual
  const { data: payments } = await supabase
    .from('period_payments')
    .select('*, cards(name)')
    .eq('period_id', period?.id ?? '')
    .order('paid_at', { ascending: false })

  // MSIs activos del usuario
  const { data: installments } = await supabase
    .from('installment_plans')
    .select('*, cards(name)')
    .eq('owner_id', userId)
    .eq('is_active', true)
    .order('next_payment_date', { ascending: true }) as { data: InstallmentPlan[] | null }

  // Deudas interpersonales
  const { data: debtsOwed } = await supabase
    .from('inter_person_debts')
    .select('*, creditor:profiles!creditor_id(display_name, full_name)')
    .eq('debtor_id', userId)
    .eq('is_paid', false) as { data: InterPersonDebt[] | null }

  const { data: debtsToCollect } = await supabase
    .from('inter_person_debts')
    .select('*, debtor:profiles!debtor_id(display_name, full_name)')
    .eq('creditor_id', userId)
    .eq('is_paid', false) as { data: InterPersonDebt[] | null }

  // Próxima quincena — todas las fuentes
  const { start: nextStart, end: nextEnd, label: nextLabel } = getNextPeriodDates()
  const nextPeriodStr  = format(nextEnd, 'yyyy-MM-dd')
  const nextStartStr   = format(nextStart, 'yyyy-MM-dd')

  const { data: profile } = await supabase
    .from('profiles').select('display_name').eq('id', userId).single()
  const isLalo     = profile?.display_name?.toLowerCase() === 'lalo'
  const myOwnership = isLalo ? 'lalo' : 'ale'

  // 1. Pagos programados del usuario
  const { data: nextScheduled } = await supabase
    .from('scheduled_payments')
    .select('*, cards(name)')
    .eq('owner_id', userId)
    .eq('period_date', nextPeriodStr)
    .eq('is_paid', false)
    .order('payment_type', { ascending: true }) as { data: ScheduledPayment[] | null }

  // 2. Gastos fijos (personales + compartidos) con next_payment_date en la próxima quincena
  const { data: nextFijos } = await supabase
    .from('recurring_expenses_split')
    .select('*')
    .eq('is_active', true)
    .in('ownership', [myOwnership, 'shared'])
    .gte('next_payment_date', nextStartStr)
    .lte('next_payment_date', nextPeriodStr) as { data: RecurringExpenseSplit[] | null }

  // 3. MSIs con next_payment_date en la próxima quincena
  const { data: nextMSI } = await supabase
    .from('installment_plans')
    .select('*, cards(name)')
    .eq('owner_id', userId)
    .eq('is_active', true)
    .gte('next_payment_date', nextStartStr)
    .lte('next_payment_date', nextPeriodStr) as { data: InstallmentPlan[] | null }

  // 4. Deudas personales con vencimiento en la próxima quincena
  const { data: nextDebts } = await supabase
    .from('inter_person_debts')
    .select('*, creditor:profiles!creditor_id(display_name)')
    .eq('debtor_id', userId)
    .eq('is_paid', false)
    .gte('due_date', nextStartStr)
    .lte('due_date', nextPeriodStr) as { data: any[] | null }

  // Unificar en una lista ordenada por monto descendente
  type NextItem = {
    key: string; concept: string; amount: number; card: string | null
    type: 'fijo' | 'msi' | 'programado' | 'deuda'
    cardId: string | null; planId: string | null; scheduledId: string | null
    debtId: string | null; creditorName: string | null
    totalInstallments: number | null; paidInstallments: number; dueDate: string | null
  }
  const nextItems: NextItem[] = [
    ...(nextScheduled ?? []).map(p => ({
      key: p.id, concept: p.concept, amount: p.amount,
      card: (p as any).cards?.name ?? null,
      type: 'programado' as const,
      cardId: p.card_id ?? null, planId: null, scheduledId: p.id,
      debtId: null, creditorName: null,
      totalInstallments: null, paidInstallments: 0, dueDate: null,
    })),
    ...(nextFijos ?? []).map(e => ({
      key: e.id, concept: e.concept,
      amount: e.ownership === 'shared' ? (isLalo ? e.lalo_amount : e.ale_amount) : e.total_amount,
      card: null, type: 'fijo' as const,
      cardId: null, planId: null, scheduledId: null,
      debtId: null, creditorName: null,
      totalInstallments: null, paidInstallments: 0, dueDate: null,
    })),
    ...(nextMSI ?? []).map(p => ({
      key: p.id, concept: p.concept, amount: p.monthly_amount,
      card: (p as any).cards?.name ?? null,
      type: 'msi' as const,
      cardId: p.card_id ?? null, planId: p.id, scheduledId: null,
      debtId: null, creditorName: null,
      totalInstallments: null, paidInstallments: 0, dueDate: null,
    })),
    ...(nextDebts ?? []).map(d => ({
      key: d.id, concept: d.concept, amount: d.amount,
      card: null, type: 'deuda' as const,
      cardId: null, planId: null, scheduledId: null,
      debtId: d.id, creditorName: d.creditor?.display_name ?? null,
      totalInstallments: d.total_installments ?? null,
      paidInstallments: d.paid_installments ?? 0,
      dueDate: d.due_date ?? null,
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

  // Ingreso actual
  const { data: currentIncome } = await supabase
    .from('income_config')
    .select('amount, valid_from')
    .eq('owner_id', userId)
    .order('valid_from', { ascending: false })
    .limit(1)
    .single() as { data: IncomeConfig | null }

  const totalMSI = (installments ?? []).reduce((sum, p) => sum + p.monthly_amount, 0)
  const debtPending = (d: InterPersonDebt) =>
    d.total_installments ? d.amount * (d.total_installments - d.paid_installments) : d.amount
  const totalOwed       = (debtsOwed      ?? []).reduce((sum, d) => sum + debtPending(d), 0)
  const totalToCollect  = (debtsToCollect ?? []).reduce((sum, d) => sum + debtPending(d), 0)

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
        <SummaryCard label="Ingreso quincenal" value={formatMXN(summary?.income ?? 0)} color="blue" />
        <SummaryCard
          label="Pagado"
          value={formatMXN((summary?.total_fijos_pagado ?? 0) + (summary?.total_extra_pagado ?? 0))}
          color="orange"
        />
        <SummaryCard
          label="Restante"
          value={formatMXN(summary?.restante_fijos ?? 0)}
          color={(summary?.restante_fijos ?? 0) < 0 ? 'red' : 'green'}
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
        <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
          Próxima quincena
          <span className="font-normal text-gray-400 text-xs">{nextLabel}</span>
          {nextItems.length > 0 && (
            <span className="ml-auto text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {nextItems.length}
            </span>
          )}
        </h2>

        {nextItems.length === 0 ? (
          <p className="text-sm text-gray-400">Sin pagos programados para la próxima quincena.</p>
        ) : (
          <>
            {/* Grupos por tarjeta */}
            {cardGroups.map(group => {
              const groupTotal = group.items.reduce((s, i) => s + i.amount, 0)
              return (
                <div key={group.cardId} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
                    <span className="text-xs font-semibold text-gray-600">{group.cardName}</span>
                    <PayCardGroupButton
                      periodId={period?.id ?? ''}
                      cardName={group.cardName}
                      items={group.items}
                      totalAmount={groupTotal}
                    />
                  </div>
                  <div className="divide-y divide-gray-50 px-3">
                    {group.items.map(item => (
                      <div key={item.key} className="flex items-center justify-between py-2 gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-800 truncate">{item.concept}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            item.type === 'fijo' ? 'bg-blue-50 text-blue-600' :
                            item.type === 'msi'  ? 'bg-purple-50 text-purple-600' :
                            'bg-orange-50 text-orange-600'
                          }`}>
                            {item.type === 'fijo' ? 'Fijo' : item.type === 'msi' ? 'MSI' : 'Programado'}
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-gray-700 shrink-0">{formatMXN(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

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
