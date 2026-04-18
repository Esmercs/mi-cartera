'use client'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'

interface Payment {
  id: string
  concept: string
  amount: number
  payment_type: string
  paid_at: string
  cards?: { name: string } | null
}

export default function PeriodPaymentsList({ payments }: { payments: Payment[] }) {
  const router = useRouter()
  const supabase = createClient()

  async function handleDelete(id: string) {
    await supabase.from('period_payments').delete().eq('id', id)
    router.refresh()
  }

  if (!payments.length) {
    return <p className="text-sm text-gray-400">Sin pagos registrados esta quincena.</p>
  }

  return (
    <div className="space-y-2">
      {payments.map(p => (
        <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0 group">
          <div>
            <p className="text-sm font-medium text-gray-800">{p.concept}</p>
            <p className="text-xs text-gray-400">
              {p.cards?.name ?? 'Efectivo'} ·{' '}
              <span className={p.payment_type === 'extra' ? 'text-orange-500' : 'text-blue-500'}>
                {p.payment_type}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-800">
              {formatMXN(p.amount)}
            </span>
            <button
              onClick={() => handleDelete(p.id)}
              className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
