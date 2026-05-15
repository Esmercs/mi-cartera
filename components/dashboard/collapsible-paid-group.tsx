'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'

interface PaidPayment {
  id: string
  concept: string
  amount: number
  payment_type: string
}

export default function CollapsiblePaidGroup({
  label,
  payments,
}: {
  label: string
  payments: PaidPayment[]
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const total = payments.reduce((s, p) => s + p.amount, 0)

  async function handleDelete(id: string) {
    await supabase.from('period_payments').delete().eq('id', id)
    router.refresh()
  }

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {open
            ? <ChevronDown size={13} className="text-gray-400 shrink-0" />
            : <ChevronRight size={13} className="text-gray-400 shrink-0" />
          }
          <span className="text-xs font-semibold text-gray-600 truncate">{label}</span>
          {!open && (
            <span className="text-xs text-gray-400 shrink-0">
              · {payments.length} item{payments.length !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        <span className="text-xs font-semibold text-gray-700 shrink-0">{formatMXN(total)}</span>
      </button>

      {open && (
        <div className="divide-y divide-gray-50 px-3">
          {payments.map(p => (
            <div key={p.id} className="flex items-center justify-between py-2 gap-2 group">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800 truncate">{p.concept}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  p.payment_type === 'extra'
                    ? 'bg-orange-50 text-orange-600'
                    : 'bg-blue-50 text-blue-600'
                }`}>
                  {p.payment_type}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-semibold text-gray-700">{formatMXN(p.amount)}</span>
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
      )}
    </div>
  )
}
