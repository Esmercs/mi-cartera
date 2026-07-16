'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ConfirmDialog from '@/components/shared/confirm-dialog'

interface Props {
  id: string
  concept: string
  interPersonDebtId: string | null
  hasPaidInstallments: boolean
}

export default function DeleteExpenseButton({ id, concept, interPersonDebtId, hasPaidInstallments }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  async function handleDelete() {
    setLoading(true)

    // Deuda compartida vinculada: se borra solo si no tiene pagos registrados
    if (interPersonDebtId) {
      const { data: debt } = await supabase
        .from('inter_person_debts')
        .select('is_paid, paid_installments')
        .eq('id', interPersonDebtId)
        .single()
      if (debt && !debt.is_paid && (debt.paid_installments ?? 0) === 0) {
        await supabase.from('inter_person_debts').delete().eq('id', interPersonDebtId)
      }
    }

    const { data } = await supabase
      .from('card_expenses').delete().eq('id', id).select('id')
    setLoading(false)
    setOpen(false)
    if (!data?.length) {
      alert('No se pudo eliminar (bloqueado por permisos).')
      return
    }
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={loading}
        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded disabled:opacity-50"
      >
        <Trash2 size={14} />
      </button>

      <ConfirmDialog
        open={open}
        title="Eliminar gasto"
        confirmLabel="Sí, eliminar"
        tone="danger"
        loading={loading}
        onConfirm={handleDelete}
        onCancel={() => setOpen(false)}
        message={
          `Se eliminará "${concept}" con todas sus cuotas${hasPaidInstallments ? ' (incluido su historial de pagos)' : ''}.` +
          (interPersonDebtId ? ' Si la deuda compartida vinculada no tiene pagos, también se elimina.' : '') +
          ' Esta acción no se puede deshacer.'
        }
      />
    </>
  )
}
