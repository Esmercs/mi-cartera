'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'

interface Props {
  periodId: string
  concept: string
  amount: number
  cardId: string | null
  type: 'fijo' | 'msi' | 'programado'
  planId: string | null       // MSI only
  scheduledId: string | null  // programado only
}

export default function RegisterNextPaymentButton({
  periodId, concept, amount, cardId, type, planId, scheduledId,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handlePay() {
    if (!confirm(`¿Registrar pago "${concept}" por ${formatMXN(amount)}?`)) return
    setLoading(true)

    // 1. Agregar a period_payments de la quincena actual
    await supabase.from('period_payments').insert({
      period_id:    periodId,
      concept,
      amount,
      card_id:      cardId ?? null,
      payment_type: type === 'msi' ? 'extra' : 'fijo',
      paid_at:      new Date().toISOString(),
    })

    // 2. Si es MSI: avanzar el plan (trigger vía installment_payments)
    if (type === 'msi' && planId) {
      await supabase.from('installment_payments').insert({
        plan_id: planId,
        amount,
        paid_at: new Date().toISOString().split('T')[0],
      })
    }

    // 3. Si es programado: marcar como pagado y descontar saldo de tarjeta
    if (type === 'programado' && scheduledId) {
      await supabase
        .from('scheduled_payments')
        .update({ is_paid: true, paid_at: new Date().toISOString() })
        .eq('id', scheduledId)

      if (cardId) {
        const { data: card } = await supabase
          .from('cards').select('current_balance').eq('id', cardId).single()
        const newBalance = Math.max(0, (card?.current_balance ?? 0) - amount)
        await supabase.from('cards').update({ current_balance: newBalance }).eq('id', cardId)
      }
    }

    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={handlePay}
      disabled={loading}
      className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-green-50 text-green-700
                 border border-green-200 rounded-lg hover:bg-green-100 transition-colors
                 disabled:opacity-50 shrink-0"
    >
      <CheckCircle size={13} />
      {loading ? '...' : 'Pagar'}
    </button>
  )
}
