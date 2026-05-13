'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  projectionId: string
  periodId: string
  concept: string
  amount: number
  cardId: string | null
}

export default function MarkProjectionPaidButton({ projectionId, periodId, concept, amount, cardId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handlePay() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    await Promise.all([
      (supabase.from('projections') as any).update({ is_paid: true, paid_at: today }).eq('id', projectionId),
      (supabase.from('period_payments') as any).insert({
        period_id:    periodId,
        concept,
        amount,
        card_id:      cardId,
        payment_type: 'fijo',
        paid_at:      today,
      }),
    ])
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={handlePay}
      disabled={loading}
      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : null}
      Pagar
    </button>
  )
}
