import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatMXN } from '@/lib/utils/currency'
import { formatMXDate, isOverdue, getCurrentPeriodDates } from '@/lib/utils/date-utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { PeriodSummary, InstallmentPlan, InterPersonDebt, IncomeConfig } from '@/types/database'
import AddPeriodPaymentForm from '@/components/dashboard/add-period-payment-form'
import PeriodPaymentsList from '@/components/dashboard/period-payments-list'
import AddIncomeForm from '@/components/dashboard/add-income-form'

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
    .eq('is_paid', false)

  const { data: debtsToCollect } = await supabase
    .from('inter_person_debts')
    .select('*, debtor:profiles!debtor_id(display_name, full_name)')
    .eq('creditor_id', userId)
    .eq('is_paid', false)

  // Ingreso actual
  const { data: currentIncome } = await supabase
    .from('income_config')
    .select('amount, valid_from')
    .eq('owner_id', userId)
    .order('valid_from', { ascending: false })
    .limit(1)
    .single() as { data: IncomeConfig | null }

  const totalMSI = (installments ?? []).reduce((sum, p) => sum + p.monthly_amount, 0)
  const totalOwed = (debtsOwed ?? []).reduce((sum, d) => sum + d.amount, 0)
  const totalToCollect = (debtsToCollect ?? []).reduce((sum, d) => sum + d.amount, 0)

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
            <div key={d.id} className="flex justify-between text-sm py-1 border-b last:border-0">
              <span className="text-gray-700 truncate mr-2">{d.concept}</span>
              <span className="font-medium text-red-600 shrink-0">{formatMXN(d.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {(debtsToCollect?.length ?? 0) > 0 && (
        <div className="card p-4 space-y-2">
          <h2 className="font-semibold text-green-700 text-sm">Me deben · {formatMXN(totalToCollect)}</h2>
          {debtsToCollect!.map(d => (
            <div key={d.id} className="flex justify-between text-sm py-1 border-b last:border-0">
              <span className="text-gray-700 truncate mr-2">{d.concept}</span>
              <span className="font-medium text-green-700 shrink-0">{formatMXN(d.amount)}</span>
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
