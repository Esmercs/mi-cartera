'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  id: string
  concept: string
  amount: number
  cardId: string | null
  paymentType: string
  periodDate: string
  notes: string | null
}

export default function EditScheduledButton({ id, concept, amount, cardId, paymentType, periodDate, notes }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [cards, setCards] = useState<{ id: string; name: string }[]>([])
  const [form, setForm] = useState({
    concept,
    amount: String(amount),
    card_id: cardId ?? '',
    payment_type: paymentType,
    period_date: periodDate,
    notes: notes ?? '',
  })
  const [loading, setLoading] = useState(false)

  async function openModal() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles').select('display_name').eq('id', user!.id).single()

    const isLalo = profile?.display_name?.toLowerCase() === 'lalo'
    const { data } = await supabase
      .from('cards').select('id, name')
      .in('ownership', [isLalo ? 'lalo' : 'ale', 'shared'])
      .eq('is_active', true)

    setCards(data ?? [])
    setForm({
      concept,
      amount: String(amount),
      card_id: cardId ?? '',
      payment_type: paymentType,
      period_date: periodDate,
      notes: notes ?? '',
    })
    setOpen(true)
  }

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function adjustCardBalance(targetCardId: string, delta: number) {
    const { data: card } = await supabase
      .from('cards').select('current_balance').eq('id', targetCardId).single()
    await supabase.from('cards')
      .update({ current_balance: Math.max(0, (card?.current_balance ?? 0) + delta) })
      .eq('id', targetCardId)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const newAmount = parseFloat(form.amount)
    const newCardId = form.card_id || null

    await supabase.from('scheduled_payments').update({
      concept:      form.concept,
      amount:       newAmount,
      card_id:      newCardId,
      payment_type: form.payment_type,
      period_date:  form.period_date,
      notes:        form.notes || null,
    }).eq('id', id)

    // Mantener el saldo de tarjetas en sincronía con el cargo programado
    if (cardId === newCardId) {
      if (cardId && newAmount !== amount) await adjustCardBalance(cardId, newAmount - amount)
    } else {
      if (cardId) await adjustCardBalance(cardId, -amount)
      if (newCardId) await adjustCardBalance(newCardId, newAmount)
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
            <h3 className="font-semibold text-gray-800">Editar pago programado</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">Concepto</label>
                <input className="input" value={form.concept}
                  onChange={e => set('concept', e.target.value)}
                  placeholder="BBVA, Carro, Nutrióloga..." required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Monto</label>
                  <input className="input" type="number" step="0.01" min="0"
                    value={form.amount} onChange={e => set('amount', e.target.value)} required />
                </div>
                <div>
                  <label className="label">Tipo</label>
                  <select className="input" value={form.payment_type}
                    onChange={e => set('payment_type', e.target.value)}>
                    <option value="fijo">Fijo</option>
                    <option value="extra">Extra</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Tarjeta (opcional)</label>
                <select className="input" value={form.card_id}
                  onChange={e => set('card_id', e.target.value)}>
                  <option value="">Sin tarjeta / efectivo</option>
                  {cards.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Quincena</label>
                <input className="input" type="date" value={form.period_date}
                  onChange={e => set('period_date', e.target.value)} required />
              </div>
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
