export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatMXN } from '@/lib/utils/currency'
import type { InstallmentPlan } from '@/types/database'
import AddInstallmentForm from '@/components/financiamiento/add-installment-form'
import CollapsibleCardGroup from '@/components/financiamiento/collapsible-card-group'

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
    <div className="space-y-4 max-w-4xl">
      {/* Header — desktop */}
      <div className="hidden md:flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financiamiento</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Meses sin intereses (MSI) — pagos automáticos al registrar
          </p>
        </div>
        <AddInstallmentForm />
      </div>

      {/* Header — mobile */}
      <div className="flex items-center justify-end md:hidden">
        <AddInstallmentForm />
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 md:p-4 bg-blue-50">
          <p className="text-xs text-blue-600 font-medium">Activos</p>
          <p className="text-xl md:text-2xl font-bold text-blue-800 mt-1">{active.length}</p>
        </div>
        <div className="card p-3 md:p-4 bg-orange-50">
          <p className="text-xs text-orange-600 font-medium truncate">Pago/mes</p>
          <p className="text-base md:text-xl font-bold text-orange-800 mt-1">{formatMXN(totalMensual)}</p>
        </div>
        <div className="card p-3 md:p-4 bg-red-50">
          <p className="text-xs text-red-600 font-medium truncate">Deuda total</p>
          <p className="text-base md:text-xl font-bold text-red-800 mt-1">{formatMXN(totalDeuda)}</p>
        </div>
      </div>

      {/* MSIs activos — agrupados por tarjeta, colapsables */}
      <section className="card p-5 space-y-3">
        <h2 className="font-semibold text-gray-800">Activos</h2>

        {!active.length ? (
          <p className="text-sm text-gray-400">Sin MSI activos.</p>
        ) : (
          <>
            {(() => {
              const groups = new Map<string, { cardName: string; plans: typeof active; total: number }>()
              for (const plan of active) {
                const key = plan.card_id ?? '__none__'
                const name = plan.cards?.name ?? 'Sin tarjeta'
                if (!groups.has(key)) groups.set(key, { cardName: name, plans: [], total: 0 })
                const g = groups.get(key)!
                g.plans.push(plan)
                g.total += plan.monthly_amount
              }
              return Array.from(groups.values()).map(group => (
                <CollapsibleCardGroup
                  key={group.cardName}
                  cardName={group.cardName}
                  plans={group.plans}
                  totalMonthly={group.total}
                />
              ))
            })()}
          </>
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

