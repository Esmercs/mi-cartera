'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatMXN } from '@/lib/utils/currency'
import { formatMXDate, isOverdue } from '@/lib/utils/date-utils'
import type { InstallmentPlan } from '@/types/database'
import RegisterPaymentButton from './register-payment-button'
import EditInstallmentForm from './edit-installment-form'

type Plan = InstallmentPlan & { cards?: { name: string } | null }

function InstallmentCard({ plan }: { plan: Plan }) {
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
        <div className="flex items-center gap-2">
          <EditInstallmentForm plan={plan} />
          <RegisterPaymentButton planId={plan.id} monthlyAmount={plan.monthly_amount} />
        </div>
      </div>
    </div>
  )
}

interface Props {
  cardName: string
  plans: Plan[]
  totalMonthly: number
}

export default function CollapsibleCardGroup({ cardName, plans, totalMonthly }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open
            ? <ChevronDown size={14} className="text-gray-400" />
            : <ChevronRight size={14} className="text-gray-400" />
          }
          <span className="text-sm font-semibold text-gray-700">{cardName}</span>
          <span className="text-xs text-gray-400">
            · {plans.length} plan{plans.length !== 1 ? 'es' : ''}
          </span>
        </div>
        <span className="text-sm font-semibold text-gray-600">{formatMXN(totalMonthly)}/mes</span>
      </button>

      {open && (
        <div className="p-4 space-y-3 divide-y divide-gray-50">
          {plans.map(plan => (
            <div key={plan.id} className="pt-3 first:pt-0">
              <InstallmentCard plan={plan} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
