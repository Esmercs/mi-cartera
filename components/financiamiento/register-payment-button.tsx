'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'

interface Props {
  planId: string
  monthlyAmount: number
}

export default function RegisterPaymentButton({ planId, monthlyAmount }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handlePay() {
    if (!confirm(`¿Registrar pago de ${formatMXN(monthlyAmount)}? El mes avanzará automáticamente.`)) return

    setLoading(true)
    // El trigger de la DB se encarga de avanzar current_month y reducir remaining_debt
    await supabase.from('installment_payments').insert({
      plan_id: planId,
      amount:  monthlyAmount,
      paid_at: new Date().toISOString().split('T')[0],
    })

    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={handlePay}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-50 text-green-700
                 border border-green-200 rounded-lg hover:bg-green-100 transition-colors
                 disabled:opacity-50"
    >
      <CheckCircle size={13} />
      {loading ? 'Registrando...' : 'Registrar pago'}
    </button>
  )
}
