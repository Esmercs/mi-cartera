'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'

interface Item {
  concept: string
  amount: number
  cardId: string | null
  type: 'fijo' | 'msi' | 'programado' | 'deuda'
  planId: string | null
  scheduledId: string | null
}

interface Props {
  periodId: string
  cardName: string
  items: Item[]
  totalAmount: number
}

export default function PayCardGroupButton({ periodId, cardName, items, totalAmount }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handlePayAll() {
    if (!confirm(`¿Registrar ${items.length} pago(s) de ${cardName} por ${formatMXN(totalAmount)} en total?`)) return
    setLoading(true)

    for (const item of items) {
      // 1. Agregar a period_payments
      await supabase.from('period_payments').insert({
        period_id:    periodId,
        concept:      item.concept,
        amount:       item.amount,
        card_id:      item.cardId ?? null,
        payment_type: item.type === 'msi' ? 'extra' : 'fijo',
        paid_at:      new Date().toISOString(),
      })

      // 2. MSI: avanzar plan
      if (item.type === 'msi' && item.planId) {
        await supabase.from('installment_payments').insert({
          plan_id: item.planId,
          amount:  item.amount,
          paid_at: new Date().toISOString().split('T')[0],
        })
      }

      // 3. Programado: marcar pagado + descontar saldo
      if (item.type === 'programado' && item.scheduledId) {
        await supabase
          .from('scheduled_payments')
          .update({ is_paid: true, paid_at: new Date().toISOString() })
          .eq('id', item.scheduledId)

        if (item.cardId) {
          const { data: card } = await supabase
            .from('cards').select('current_balance').eq('id', item.cardId).single()
          const newBalance = Math.max(0, (card?.current_balance ?? 0) - item.amount)
          await supabase.from('cards').update({ current_balance: newBalance }).eq('id', item.cardId)
        }
      }
    }

    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={handlePayAll}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-brand-600 text-white
                 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 shrink-0"
    >
      <CreditCard size={13} />
      {loading ? '...' : `Pagar todo · ${formatMXN(totalAmount)}`}
    </button>
  )
}
