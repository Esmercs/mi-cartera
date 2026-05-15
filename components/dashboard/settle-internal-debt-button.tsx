'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  recurringExpenseId: string
  periodDate: string
  payer: 'lalo' | 'ale'
  amount: number
}

export default function SettleInternalDebtButton({ recurringExpenseId, periodDate, payer, amount }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    await (supabase.from('internal_debt_settlements') as any).insert({
      recurring_expense_id: recurringExpenseId,
      period_date: periodDate,
      payer,
      amount,
      paid_by_user_id: user.id,
    })
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-xs px-2 py-1 rounded-md bg-green-50 text-green-700 hover:bg-green-100 flex items-center gap-1 shrink-0"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
      Pagar
    </button>
  )
}
