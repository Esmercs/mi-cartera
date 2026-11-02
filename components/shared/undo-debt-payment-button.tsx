'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Undo2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'
import { subOneMonth } from '@/lib/utils/date-utils'
import ConfirmDialog from '@/components/shared/confirm-dialog'

// Deshace la última cuota confirmada de una deuda entre personas: el inverso exacto
// de MarkDebtPaidButton, para cuando se confirmó un pago que no llegó.
//
// OJO: la política de UPDATE solo deja tocar las deudas donde eres el acreedor
// (creditor_id = auth.uid()), igual que al confirmar. Si confirmó el otro, aquí
// sale el aviso de permisos — es correcto: que lo deshaga quien lo marcó.
export default function UndoDebtPaymentButton({
  debtId,
  totalInstallments,
  paidInstallments,
  isPaid,
  dueDate,
  concept,
  amount,
}: {
  debtId: string
  totalInstallments: number | null
  paidInstallments: number
  isPaid: boolean
  dueDate?: string | null
  concept?: string
  amount?: number
}) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const isInstallment = totalInstallments !== null

  // Sin cuotas confirmadas (o sin pago marcado) no hay nada que deshacer
  if (isInstallment ? paidInstallments < 1 : !isPaid) return null

  async function handleUndo() {
    setLoading(true)

    // Al confirmar, el vencimiento se recorrió un mes salvo en la última cuota:
    // solo lo regresamos cuando la cuota que se deshace no cerró la deuda.
    const closedTheDebt = isInstallment ? paidInstallments === totalInstallments : true

    const update: Record<string, unknown> = { is_paid: false, paid_at: null }
    if (isInstallment) {
      update.paid_installments = paidInstallments - 1
      if (!closedTheDebt && dueDate) update.due_date = subOneMonth(dueDate)
    }

    const { data } = await supabase
      .from('inter_person_debts').update(update).eq('id', debtId).select('id')

    setLoading(false)
    setOpen(false)
    if (!data?.length) {
      alert('No se pudo deshacer: solo quien recibe el pago puede quitarlo.')
      return
    }
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={loading}
        title={isInstallment ? 'Deshacer la última cuota' : 'Deshacer el pago'}
        className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50 shrink-0"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
      </button>

      <ConfirmDialog
        open={open}
        title={isInstallment
          ? `Deshacer la cuota ${paidInstallments} de ${totalInstallments}`
          : 'Deshacer el pago recibido'}
        confirmLabel="Sí, deshacer"
        tone="danger"
        loading={loading}
        onConfirm={handleUndo}
        onCancel={() => setOpen(false)}
        message={isInstallment
          ? 'La deuda vuelve a quedar con una cuota menos confirmada y el vencimiento regresa un mes.'
          : 'La deuda vuelve a quedar pendiente.'}
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
