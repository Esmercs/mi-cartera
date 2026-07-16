'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { IntervalType, Ownership, PaidBy } from '@/types/database'

const intervals: { value: IntervalType; label: string }[] = [
  { value: 'quincenal',  label: 'Quincenal' },
  { value: 'mensual',    label: 'Mensual' },
  { value: 'bimestral',  label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'c/15 dias',  label: 'Cada 15 días' },
  { value: 'c/21 dias',  label: 'Cada 21 días' },
  { value: 'anual',      label: 'Anual' },
]

const DATE_BASED: IntervalType[] = ['bimestral', 'trimestral', 'c/15 dias', 'c/21 dias', 'anual']

interface Props {
  id: string
  concept: string
  totalAmount: number
  intervalType: IntervalType
  paymentDay: 0 | 15 | 30
  nextPaymentDate?: string | null
  cardId?: string | null
  ownership: Ownership
  paidBy?: PaidBy
  nextChargeDate?: string | null
}

export default function EditExpenseButton({
  id, concept, totalAmount, intervalType, paymentDay, nextPaymentDate, cardId, ownership, paidBy, nextChargeDate,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    concept,
    total_amount: totalAmount.toString(),
    ownership,
    paid_by: (paidBy ?? 'each') as PaidBy,
    interval_type: intervalType,
    payment_day: (paymentDay ?? 15).toString(),
    next_payment_date: nextPaymentDate ?? '',
    card_id: cardId ?? '',
    next_charge_date: nextChargeDate ?? '',
  })
  const [cards, setCards] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDateBased = DATE_BASED.includes(form.interval_type as IntervalType)

  async function openModal() {
    setForm({
      concept,
      total_amount: totalAmount.toString(),
      ownership,
      paid_by: (paidBy ?? 'each') as PaidBy,
      interval_type: intervalType,
      payment_day: (paymentDay ?? 15).toString(),
      next_payment_date: nextPaymentDate ?? '',
      card_id: cardId ?? '',
      next_charge_date: nextChargeDate ?? '',
    })
    setError(null)
    const { data } = await supabase.from('cards').select('id, name').eq('is_active', true).order('name')
    setCards(data ?? [])
    setOpen(true)
  }

  function set(field: string, value: string) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'interval_type' && value === 'quincenal') next.payment_day = '0'
      if (field === 'interval_type' && value !== 'quincenal' && prev.payment_day === '0') next.payment_day = '15'
      return next
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const { error: updateError } = await supabase
      .from('recurring_expenses')
      .update({
        concept: form.concept,
        total_amount: parseFloat(form.total_amount),
        ownership: form.ownership as Ownership,
        owner_id: form.ownership === 'shared' ? null : user!.id,
        interval_type: form.interval_type,
        payment_day: parseInt(form.payment_day) as 0 | 15 | 30,
        next_payment_date: isDateBased ? (form.next_payment_date || null) : null,
        card_id: form.card_id || null,
        next_charge_date: form.card_id ? (form.next_charge_date || null) : null,
        paid_by: form.ownership === 'shared' ? form.paid_by : 'each',
      })
      .eq('id', id)
    setLoading(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={openModal}
        className="text-gray-300 hover:text-gray-600 transition-colors"
        title="Editar gasto"
      >
        <Pencil size={14} />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-800">Editar gasto fijo</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="label">Concepto</label>
                <input className="input" value={form.concept}
                  onChange={e => set('concept', e.target.value)} required />
              </div>
              <div>
                <label className="label">Cantidad total</label>
                <input className="input" type="number" step="0.01" min="0"
                  value={form.total_amount}
                  onChange={e => set('total_amount', e.target.value)} required />
              </div>
              <div>
                <label className="label">Dueño</label>
                <select className="input" value={form.ownership}
                  onChange={e => set('ownership', e.target.value)}>
                  <option value="shared">Compartido (Los 2)</option>
                  <option value="lalo">Lalo (personal)</option>
                  <option value="ale">Ale (personal)</option>
                </select>
              </div>
              {form.ownership === 'shared' && (
                <div>
                  <label className="label">¿Quién paga?</label>
                  <select className="input" value={form.paid_by}
                    onChange={e => set('paid_by', e.target.value)}>
                    <option value="each">Cada quien su parte</option>
                    <option value="lalo">Lalo paga todo (Ale le debe)</option>
                    <option value="ale">Ale paga todo (Lalo le debe)</option>
                  </select>
                </div>
              )}
              <div>
                <label className="label">Intervalo</label>
                <select className="input" value={form.interval_type}
                  onChange={e => set('interval_type', e.target.value)}>
                  {intervals.map(i => (
                    <option key={i.value} value={i.value}>{i.label}</option>
                  ))}
                </select>
              </div>
              {isDateBased ? (
                <div>
                  <label className="label">Próximo pago</label>
                  <input className="input" type="date" value={form.next_payment_date}
                    onChange={e => set('next_payment_date', e.target.value)} required />
                </div>
              ) : (
                <div>
                  <label className="label">Día de pago</label>
                  <select className="input" value={form.payment_day}
                    onChange={e => set('payment_day', e.target.value)}
                    disabled={form.interval_type === 'quincenal'}>
                    {form.interval_type === 'quincenal'
                      ? <option value="0">Ambos (15 y 30)</option>
                      : <>
                          <option value="15">Día 15</option>
                          <option value="30">Día 30 (fin de mes)</option>
                        </>
                    }
                  </select>
                </div>
              )}
              <div>
                <label className="label">Tarjeta de domiciliación</label>
                <select className="input" value={form.card_id}
                  onChange={e => set('card_id', e.target.value)}>
                  <option value="">Sin tarjeta</option>
                  {cards.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {form.card_id && (
                <div>
                  <label className="label">Próxima fecha de cobro (opcional)</label>
                  <input className="input" type="date" value={form.next_charge_date}
                    onChange={e => set('next_charge_date', e.target.value)} />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Al llegar esta fecha, el cargo aparece automáticamente como deuda
                    de la tarjeta y la fecha se recorre según el intervalo.
                  </p>
                </div>
              )}
              {error && (
                <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>
              )}
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
