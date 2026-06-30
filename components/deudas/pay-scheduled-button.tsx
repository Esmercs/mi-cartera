'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'
import ConfirmDialog from '@/components/shared/confirm-dialog'

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
  const [open, setOpen] = useState(false)

  async function handlePay() {
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
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={loading}
        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-green-50 text-green-700
                   border border-green-200 rounded-lg hover:bg-green-100 transition-colors
                   disabled:opacity-50 shrink-0"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
        {loading ? 'Pagando...' : 'Pagar'}
      </button>

      <ConfirmDialog
        open={open}
        title="Registrar pago"
        confirmLabel="Sí, registrar"
        tone="success"
        loading={loading}
        onConfirm={handlePay}
        onCancel={() => setOpen(false)}
        message={cardId ? 'Se descontará de la deuda de la tarjeta.' : undefined}
      >
        <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
          <span className="text-sm text-gray-600 truncate mr-2">{concept}</span>
          <span className="text-sm font-semibold text-gray-800 shrink-0">{formatMXN(amount)}</span>
        </div>
      </ConfirmDialog>
    </>
  )
}
