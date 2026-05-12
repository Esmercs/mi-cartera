'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'

interface Props {
  planId: string
  monthlyAmount: number
  cardId: string | null
}

export default function RegisterPaymentButton({ planId, monthlyAmount, cardId }: Props) {
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

    if (cardId) {
      const { data: card } = await supabase
        .from('cards').select('current_balance').eq('id', cardId).single()
      const newBalance = Math.max(0, (card?.current_balance ?? 0) - monthlyAmount)
      await supabase.from('cards').update({ current_balance: newBalance }).eq('id', cardId)
    }

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
      {loading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
      {loading ? 'Registrando...' : 'Registrar pago'}
    </button>
  )
}
