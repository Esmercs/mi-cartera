'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function MarkDebtPaidButton({
  debtId,
  creditorId,
}: {
  debtId: string
  creditorId: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [canPay, setCanPay] = useState<boolean | null>(null)

  async function checkAndPay() {
    if (canPay === null) {
      const { data: { user } } = await supabase.auth.getUser()
      const allowed = user?.id === creditorId
      setCanPay(allowed)
      if (!allowed) return
    }

    if (!confirm('¿Marcar esta deuda como pagada?')) return

    setLoading(true)
    await supabase
      .from('inter_person_debts')
      .update({ is_paid: true, paid_at: new Date().toISOString().split('T')[0] })
      .eq('id', debtId)
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={checkAndPay}
      disabled={loading}
      className="text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200
                 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
    >
      {loading ? '...' : 'Pagado'}
    </button>
  )
}
