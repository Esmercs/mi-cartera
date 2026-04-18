'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function MarkDebtPaidButton({
  debtId,
  creditorId,
  totalInstallments,
  paidInstallments,
}: {
  debtId: string
  creditorId: string
  totalInstallments: number | null
  paidInstallments: number
}) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const isInstallment = totalInstallments !== null
  const remaining = isInstallment ? totalInstallments - paidInstallments : null

  async function handlePay() {
    const label = isInstallment
      ? `¿Registrar cuota ${paidInstallments + 1} de ${totalInstallments}?`
      : '¿Marcar esta deuda como pagada?'
    if (!confirm(label)) return

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const newPaid = isInstallment ? paidInstallments + 1 : null
    const isDone  = !isInstallment || newPaid === totalInstallments

    await supabase
      .from('inter_person_debts')
      .update({
        paid_installments: newPaid ?? paidInstallments,
        is_paid:  isDone,
        paid_at:  isDone ? new Date().toISOString().split('T')[0] : null,
      })
      .eq('id', debtId)

    setLoading(false)
    router.refresh()
  }

  if (isInstallment) {
    return (
      <button
        onClick={handlePay}
        disabled={loading}
        className="text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200
                   rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50 whitespace-nowrap"
      >
        {loading ? '...' : `Pagar cuota (${remaining} restante${remaining === 1 ? '' : 's'})`}
      </button>
    )
  }

  return (
    <button
      onClick={handlePay}
      disabled={loading}
      className="text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200
                 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
    >
      {loading ? '...' : 'Pagado'}
    </button>
  )
}
