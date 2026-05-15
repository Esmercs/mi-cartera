'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function DeletePeriodPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    await supabase.from('period_payments').delete().eq('id', paymentId)
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
      title="Eliminar pago"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
    </button>
  )
}
