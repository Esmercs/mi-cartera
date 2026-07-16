'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'
import { payInstallment } from '@/lib/utils/pay-installment'

interface Item {
  concept: string
  amount: number
  cardId: string | null
  type: 'fijo' | 'msi' | 'programado' | 'deuda'
  installmentId: string | null
}

interface Props {
  periodId: string
  cardName: string
  items: Item[]
  totalAmount: number
}

export default function PayCardGroupButton({ periodId, cardName, items, totalAmount }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [paidAmount, setPaidAmount] = useState(totalAmount.toString())
  const [loading, setLoading] = useState(false)

  function handleOpen() {
    setPaidAmount(totalAmount.toString())
    setOpen(true)
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const paid = parseFloat(paidAmount)
    const isPartial = paid < totalAmount

    if (isPartial) {
      // Pago parcial: un solo movimiento por el monto ingresado
      await supabase.from('period_payments').insert({
        period_id:    periodId,
        concept:      `Pago parcial ${cardName}`,
        amount:       paid,
        card_id:      items[0]?.cardId ?? null,
        payment_type: 'fijo',
        paid_at:      new Date().toISOString(),
      })
      // Aplicar el pago a las cuotas en orden: completas mientras alcance,
      // la última que no alcanza se parte (el resto queda pendiente)
      let remaining = paid
      for (const item of items) {
        if (!item.installmentId || remaining < 0.01) continue
        const pay = Math.min(remaining, item.amount)
        await payInstallment(supabase, item.installmentId, pay)
        remaining = Math.round((remaining - pay) * 100) / 100
      }
    } else {
      // Pago completo: registrar cada ítem y marcar su cuota
      for (const item of items) {
        await supabase.from('period_payments').insert({
          period_id:    periodId,
          concept:      item.concept,
          amount:       item.amount,
          card_id:      item.cardId ?? null,
          payment_type: item.type === 'msi' ? 'extra' : 'fijo',
          paid_at:      new Date().toISOString(),
        })
        if (item.installmentId) {
          await payInstallment(supabase, item.installmentId, item.amount)
        }
      }
    }

    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  const paid = parseFloat(paidAmount) || 0
  const isPartial = paid < totalAmount && paid > 0

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-brand-600 text-white
                   rounded-lg hover:bg-brand-700 transition-colors shrink-0"
      >
        <CreditCard size={13} />
        Pagar todo · {formatMXN(totalAmount)}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-xs space-y-4">
            <div>
              <h3 className="font-semibold text-gray-800">Pagar {cardName}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{items.length} concepto(s)</p>
            </div>
            <form onSubmit={handlePay} className="space-y-3">
              <div>
                <label className="label">
                  Monto a pagar
                  <span className="text-gray-400 font-normal ml-1">(total: {formatMXN(totalAmount)})</span>
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
                    Pago parcial · pendiente {formatMXN(totalAmount - paid)}
                  </p>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  {loading ? 'Pagando...' : isPartial ? 'Pago parcial' : 'Pagar todo'}
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
