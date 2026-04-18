import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatMXN } from '@/lib/utils/currency'
import { formatMXDate, isOverdue } from '@/lib/utils/date-utils'
import type { InstallmentPlan } from '@/types/database'
import AddInstallmentForm from '@/components/financiamiento/add-installment-form'
import RegisterPaymentButton from '@/components/financiamiento/register-payment-button'

export default async function FinanciamientoPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: plans } = await supabase
    .from('installment_plans')
    .select('*, cards(name)')
    .eq('owner_id', session.user.id)
    .order('next_payment_date', { ascending: true }) as { data: (InstallmentPlan & { cards?: { name: string } | null })[] | null }

  const active   = (plans ?? []).filter(p => p.is_active)
  const finished = (plans ?? []).filter(p => !p.is_active)

  const totalMensual = active.reduce((s, p) => s + p.monthly_amount, 0)
  const totalDeuda   = active.reduce((s, p) => s + p.remaining_debt, 0)

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financiamiento</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Meses sin intereses (MSI) — pagos automáticos al registrar
          </p>
        </div>
        <AddInstallmentForm />
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 bg-blue-50">
          <p className="text-xs text-blue-600 font-medium">MSIs activos</p>
          <p className="text-2xl font-bold text-blue-800 mt-1">{active.length}</p>
        </div>
        <div className="card p-4 bg-orange-50">
          <p className="text-xs text-orange-600 font-medium">Pago mensual total</p>
          <p className="text-xl font-bold text-orange-800 mt-1">{formatMXN(totalMensual)}</p>
        </div>
        <div className="card p-4 bg-red-50">
          <p className="text-xs text-red-600 font-medium">Deuda total restante</p>
          <p className="text-xl font-bold text-red-800 mt-1">{formatMXN(totalDeuda)}</p>
        </div>
      </div>

      {/* MSIs activos */}
      <section className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-800">Activos</h2>

        {!active.length ? (
          <p className="text-sm text-gray-400">Sin MSI activos.</p>
        ) : (
          <div className="space-y-3">
            {active.map(plan => (
              <InstallmentCard key={plan.id} plan={plan} />
            ))}
          </div>
        )}
      </section>

      {/* MSIs terminados */}
      {finished.length > 0 && (
        <section className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-500 text-sm">Terminados</h2>
          <div className="space-y-2 opacity-60">
            {finished.map(plan => (
              <div key={plan.id} className="flex justify-between items-center py-2 border-b last:border-0 text-sm">
                <div>
                  <span className="font-medium text-gray-700">{plan.concept}</span>
                  <span className="text-gray-400 ml-2">({plan.cards?.name ?? '—'})</span>
                </div>
                <span className="text-gray-400">
                  {plan.total_months} meses · {formatMXN(plan.monthly_amount)}/mes
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function InstallmentCard({
  plan,
}: {
  plan: InstallmentPlan & { cards?: { name: string } | null }
}) {
  const progress = (plan.current_month / plan.total_months) * 100
  const overdue  = isOverdue(plan.next_payment_date)

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${overdue ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-gray-800">{plan.concept}</p>
          <p className="text-sm text-gray-500">
            {plan.cards?.name ?? 'Sin tarjeta'} ·
            Mes <span className="font-medium">{plan.current_month}</span>/{plan.total_months}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-800">{formatMXN(plan.monthly_amount)}/mes</p>
          <p className="text-xs text-gray-400">Restante: {formatMXN(plan.remaining_debt)}</p>
        </div>
      </div>

      {/* Barra de progreso */}
      <div>
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Progreso</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className={`text-sm ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
          {overdue ? '⚠️ ' : ''}Próximo pago: {formatMXDate(plan.next_payment_date)}
        </p>
        <RegisterPaymentButton planId={plan.id} monthlyAmount={plan.monthly_amount} />
      </div>
    </div>
  )
}
