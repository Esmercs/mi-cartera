'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function addOneMonth(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().split('T')[0]
}

export default function MarkDebtPaidButton({
  debtId,
  totalInstallments,
  paidInstallments,
  dueDate,
  concept,
  amount,
}: {
  debtId: string
  creditorId?: string
  totalInstallments: number | null
  paidInstallments: number
  dueDate?: string | null
  concept?: string
  amount?: number
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

    const newPaid = isInstallment ? paidInstallments + 1 : null
    const isDone  = !isInstallment || newPaid === totalInstallments

    const update: Record<string, unknown> = {
      paid_installments: newPaid ?? paidInstallments,
      is_paid: isDone,
      paid_at: isDone ? new Date().toISOString().split('T')[0] : null,
    }

    if (isInstallment && !isDone && dueDate) {
      update.due_date = addOneMonth(dueDate)
    }

    await supabase.from('inter_person_debts').update(update).eq('id', debtId)

    // Registrar en period_payments del usuario actual para que aparezca en "Ya pagado"
    if (concept && amount) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const today = new Date()
        // Buscar el período activo del usuario (el más reciente con period_date >= hoy)
        const { data: period } = await supabase
          .from('periods')
          .select('id')
          .eq('owner_id', user.id)
          .gte('period_date', today.toISOString().split('T')[0])
          .order('period_date', { ascending: true })
          .limit(1)
          .single()

        if (period) {
          const installmentAmount = isInstallment ? amount : amount
          await supabase.from('period_payments').insert({
            period_id: period.id,
            concept: isInstallment ? `${concept} (cuota ${(newPaid ?? paidInstallments + 1)})` : concept,
            amount: installmentAmount,
            payment_type: 'extra',
          })
        }
      }
    }

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
        {loading ? <><Loader2 size={11} className="animate-spin inline mr-1" />Pagando...</> : `Pagar cuota (${remaining} restante${remaining === 1 ? '' : 's'})`}
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
      {loading ? <><Loader2 size={11} className="animate-spin inline mr-1" />Pagando...</> : 'Marcar pagada'}
    </button>
  )
}
