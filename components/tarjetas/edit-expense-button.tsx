'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { periodEndForDate, paydayForPeriodEnd } from '@/lib/utils/date-utils'
import { generateInstallments } from '@/lib/utils/installments'
import { format, addMonths, parseISO } from 'date-fns'

interface Props {
  id: string
  concept: string
  totalAmount: number
  months: number
  cardId: string | null
  interPersonDebtId: string | null
  hasPaidInstallments: boolean
  nextDue: string | null   // due_period_date canónico de la siguiente cuota pendiente
}

export default function EditExpenseButton({
  id, concept, totalAmount, months, cardId, interPersonDebtId, hasPaidInstallments, nextDue,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [cards, setCards] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // El usuario piensa en días de pago (15 / fin de mes), no en el fin de quincena interno
  const initialDue = paydayForPeriodEnd(nextDue) ?? format(new Date(), 'yyyy-MM-dd')
  const [form, setForm] = useState({
    concept,
    total_amount: totalAmount.toString(),
    card_id: cardId ?? '',
    next_due: initialDue,
  })

  async function openModal() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles').select('display_name').eq('id', user!.id).single()
    const isLalo = (profile as any)?.display_name?.toLowerCase() === 'lalo'
    const { data } = await supabase
      .from('cards').select('id, name')
      .in('ownership', [isLalo ? 'lalo' : 'ale', 'shared'])
      .eq('is_active', true).order('name')
    setCards(data ?? [])
    setForm({
      concept,
      total_amount: totalAmount.toString(),
      card_id: cardId ?? '',
      next_due: initialDue,
    })
    setError(null)
    setOpen(true)
  }

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const newTotal = parseFloat(form.total_amount)
    const newCardId = form.card_id || null
    const amountChanged = !hasPaidInstallments && Math.abs(newTotal - totalAmount) >= 0.01
    const dateChanged = form.next_due !== initialDue

    const updates: Record<string, unknown> = { concept: form.concept, card_id: newCardId }
    if (amountChanged) updates.total_amount = newTotal

    const { data: updated } = await supabase
      .from('card_expenses').update(updates).eq('id', id).select('id')
    if (!updated?.length) {
      setError('No se pudo guardar (bloqueado por permisos).')
      setLoading(false)
      return
    }

    if (amountChanged) {
      // Sin pagos registrados: regenerar todas las cuotas desde cero
      await supabase.from('card_expense_installments').delete().eq('expense_id', id)
      const rows = generateInstallments(newTotal, months, form.next_due)
      await supabase.from('card_expense_installments')
        .insert(rows.map(r => ({ ...r, expense_id: id })))
    } else if (dateChanged) {
      // Re-espaciar solo las cuotas pendientes: la primera en la quincena elegida,
      // las siguientes avanzan mensualmente. Las pagadas no se tocan.
      const { data: insts } = await supabase
        .from('card_expense_installments')
        .select('number')
        .eq('expense_id', id)
        .eq('is_paid', false)
      const numbers = Array.from(new Set(((insts ?? []) as any[]).map(i => i.number))).sort((a, b) => a - b)
      const first = parseISO(form.next_due)
      for (let gi = 0; gi < numbers.length; gi++) {
        await supabase.from('card_expense_installments')
          .update({ due_period_date: periodEndForDate(addMonths(first, gi)) })
          .eq('expense_id', id)
          .eq('number', numbers[gi])
          .eq('is_paid', false)
      }
    }

    // Mantener la deuda compartida vinculada en sincronía
    if (interPersonDebtId) {
      await supabase.from('inter_person_debts')
        .update({ concept: form.concept, card_id: newCardId })
        .eq('id', interPersonDebtId)
    }

    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={openModal}
        className="p-1.5 text-gray-300 hover:text-blue-500 transition-colors rounded"
      >
        <Pencil size={14} />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-800">Editar movimiento</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">Concepto</label>
                <input className="input" value={form.concept}
                  onChange={e => set('concept', e.target.value)} required />
              </div>
              <div>
                <label className="label">
                  Monto total
                  {hasPaidInstallments && (
                    <span className="text-gray-400 font-normal ml-1">(tiene pagos, no editable)</span>
                  )}
                </label>
                <input className="input" type="number" step="0.01" min="0.01"
                  value={form.total_amount}
                  onChange={e => set('total_amount', e.target.value)}
                  disabled={hasPaidInstallments} required />
              </div>
              <div>
                <label className="label">Tarjeta</label>
                <select className="input" value={form.card_id}
                  onChange={e => set('card_id', e.target.value)}>
                  <option value="">Sin tarjeta / efectivo</option>
                  {cards.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">
                  {months > 1 ? 'Próximo pago (las siguientes cuotas se recorren)' : 'Fecha de pago'}
                </label>
                <input className="input" type="date" value={form.next_due}
                  onChange={e => set('next_due', e.target.value)} required />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                  {loading && <Loader2 size={14} className="animate-spin" />}{loading ? 'Guardando...' : 'Guardar'}
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
