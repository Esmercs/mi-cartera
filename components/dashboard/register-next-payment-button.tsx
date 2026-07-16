'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'
import { nextPaymentDate } from '@/lib/utils/date-utils'
import { payInstallment } from '@/lib/utils/pay-installment'
import type { IntervalType } from '@/types/database'

interface Props {
  periodId: string
  concept: string
  amount: number
  cardId: string | null
  type: 'fijo' | 'msi' | 'programado'
  installmentId: string | null
  // For date-based recurring expenses (bimestral, trimestral, anual, c/21 dias, c/15 dias)
  recurringExpenseId?: string | null
  intervalType?: IntervalType | null
  currentNextPaymentDate?: string | null
}

export default function RegisterNextPaymentButton({
  periodId, concept, amount, cardId, type, installmentId,
  recurringExpenseId, intervalType, currentNextPaymentDate,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [paidAmount, setPaidAmount] = useState(amount.toString())
  const [loading, setLoading] = useState(false)

  function handleOpen() {
    setPaidAmount(amount.toString())
    setOpen(true)
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const paid = parseFloat(paidAmount)

    await supabase.from('period_payments').insert({
      period_id:      periodId,
      concept,
      amount:         paid,
      card_id:        cardId ?? null,
      payment_type:   type === 'msi' ? 'extra' : 'fijo',
      paid_at:        new Date().toISOString(),
      // Vincular con la cuota: al borrar el pago, la cuota vuelve a pendiente
      installment_id: (type === 'msi' || type === 'programado') ? installmentId : null,
    })

    // Cuota del ledger de tarjetas: el saldo de la tarjeta se deriva solo
    if ((type === 'msi' || type === 'programado') && installmentId) {
      const ok = await payInstallment(supabase, installmentId, paid)
      if (!ok) alert('No se pudo marcar la cuota como pagada (bloqueado por permisos).')
    }

    // For date-based recurring expenses: advance next_payment_date by the interval
    if (type === 'fijo' && recurringExpenseId && intervalType && currentNextPaymentDate) {
      const newDate = nextPaymentDate(currentNextPaymentDate, intervalType)
      await supabase
        .from('recurring_expenses')
        .update({ next_payment_date: newDate })
        .eq('id', recurringExpenseId)
    }

    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  const isPartial = parseFloat(paidAmount) < amount && parseFloat(paidAmount) > 0

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-green-50 text-green-700
                   border border-green-200 rounded-lg hover:bg-green-100 transition-colors shrink-0"
      >
        <CheckCircle size={13} />
        Pagar
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-xs space-y-4">
            <div>
              <h3 className="font-semibold text-gray-800">Registrar pago</h3>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{concept}</p>
              {currentNextPaymentDate && intervalType && (
                <p className="text-xs text-blue-600 mt-1">
                  Siguiente pago se recorrerá automáticamente
                </p>
              )}
            </div>
            <form onSubmit={handlePay} className="space-y-3">
              <div>
                <label className="label">
                  Monto a pagar
                  <span className="text-gray-400 font-normal ml-1">(total: {formatMXN(amount)})</span>
                </label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={paidAmount}
                  onChange={e => setPaidAmount(e.target.value)}
                  required
                  autoFocus
                />
                {isPartial && (
                  <p className="text-xs text-amber-600 mt-1">
                    Pago parcial · pendiente {formatMXN(amount - parseFloat(paidAmount))}
                  </p>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  {loading ? 'Pagando...' : isPartial ? 'Pago parcial' : 'Pagar'}
                </button>
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
