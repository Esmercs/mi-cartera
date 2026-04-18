'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'

interface Props {
  paymentId: string
  concept: string
  amount: number
  cardId: string | null
}

export default function PayScheduledButton({ paymentId, concept, amount, cardId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handlePay() {
    if (!confirm(`¿Registrar pago "${concept}" por ${formatMXN(amount)}?${cardId ? '\nSe descontará de la deuda de la tarjeta.' : ''}`)) return

    setLoading(true)

    await supabase
      .from('scheduled_payments')
      .update({ is_paid: true, paid_at: new Date().toISOString() })
      .eq('id', paymentId)

    if (cardId) {
      const { data: card } = await supabase
        .from('cards').select('current_balance').eq('id', cardId).single()
      const newBalance = Math.max(0, (card?.current_balance ?? 0) - amount)
      await supabase.from('cards').update({ current_balance: newBalance }).eq('id', cardId)
    }

    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={handlePay}
      disabled={loading}
      className="flex items-center gap-1 text-xs px-3 py-1.5 bg-green-50 text-green-700
                 border border-green-200 rounded-lg hover:bg-green-100 transition-colors
                 disabled:opacity-50 shrink-0"
    >
      <CheckCircle size={13} />
      {loading ? '...' : 'Pagar'}
    </button>
  )
}
