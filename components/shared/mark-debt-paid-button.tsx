'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'
import ConfirmDialog from '@/components/shared/confirm-dialog'

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
  const [open, setOpen] = useState(false)

  const isInstallment = totalInstallments !== null
  const remaining = isInstallment ? totalInstallments - paidInstallments : null

  const title = isInstallment
    ? `Confirmar cuota ${paidInstallments + 1} de ${totalInstallments} recibida`
    : 'Confirmar pago recibido'

  // Solo el acreedor confirma que recibió el pago; no se registra como gasto de nadie —
  // el deudor puede anotar su transferencia en "Ya pagado" si quiere llevar el registro.
  async function handlePay() {
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

    const { data } = await supabase
      .from('inter_person_debts').update(update).eq('id', debtId).select('id')

    setLoading(false)
    setOpen(false)
    if (!data?.length) {
      alert('No se pudo confirmar: solo quien recibe el pago puede marcarlo.')
      return
    }
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={loading}
        className={`text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200
                   rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50${isInstallment ? ' whitespace-nowrap' : ''}`}
      >
        {isInstallment
          ? `Confirmar cuota (${remaining} restante${remaining === 1 ? '' : 's'})`
          : 'Confirmar pago'}
      </button>

      <ConfirmDialog
        open={open}
        title={title}
        confirmLabel={isInstallment ? 'Sí, recibí la cuota' : 'Sí, recibí el pago'}
        tone="success"
        loading={loading}
        onConfirm={handlePay}
        onCancel={() => setOpen(false)}
        message={isInstallment
          ? 'Se registrará la cuota recibida y la fecha de vencimiento avanzará un mes.'
          : 'Esto marcará la deuda como pagada.'}
      >
        {concept && (
          <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
            <span className="text-sm text-gray-600 truncate mr-2">{concept}</span>
            {amount != null && (
              <span className="text-sm font-semibold text-gray-800 shrink-0">{formatMXN(amount)}</span>
            )}
          </div>
        )}
      </ConfirmDialog>
    </>
  )
}
