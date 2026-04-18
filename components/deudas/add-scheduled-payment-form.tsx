'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'

interface Props {
  defaultPeriodDate: string
}

export default function AddScheduledPaymentForm({ defaultPeriodDate }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [cards, setCards] = useState<{ id: string; name: string }[]>([])
  const [form, setForm] = useState({
    concept: '',
    amount: '',
    card_id: '',
    payment_type: 'fijo',
    period_date: defaultPeriodDate,
    notes: '',
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
    setForm(f => ({ ...f, period_date: defaultPeriodDate }))
    setOpen(true)
  }

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('scheduled_payments').insert({
      owner_id:     user!.id,
      concept:      form.concept,
      amount:       parseFloat(form.amount),
      card_id:      form.card_id || null,
      payment_type: form.payment_type,
      period_date:  form.period_date,
      notes:        form.notes || null,
    })

    setOpen(false)
    setLoading(false)
    setForm({ concept: '', amount: '', card_id: '', payment_type: 'fijo', period_date: defaultPeriodDate, notes: '' })
    router.refresh()
  }

  return (
    <>
      <button onClick={openModal} className="btn-primary flex items-center gap-1 text-sm">
        <Plus size={15} /> Agregar pago
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-800">Agregar pago programado</h3>
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
                <button type="submit" disabled={loading} className="btn-primary flex-1">
                  {loading ? 'Guardando...' : 'Guardar'}
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
