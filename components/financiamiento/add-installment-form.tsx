'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AddInstallmentForm() {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [cards, setCards] = useState<{ id: string; name: string }[]>([])
  const [form, setForm] = useState({
    concept: '',
    total_months: '',
    monthly_amount: '',
    card_id: '',
    next_payment_date: '',
  })
  const [loading, setLoading] = useState(false)

  async function openModal() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user!.id)
      .single()

    const isLalo = profile?.display_name?.toLowerCase() === 'lalo'

    const { data } = await supabase
      .from('cards')
      .select('id, name')
      .in('ownership', [isLalo ? 'lalo' : 'ale', 'shared'])
      .eq('is_active', true)

    setCards(data ?? [])
    setForm({ concept: '', total_months: '', monthly_amount: '', card_id: '', next_payment_date: '' })
    setOpen(true)
  }

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user!.id)
      .single()

    const totalMonths    = parseInt(form.total_months)
    const monthlyAmount  = parseFloat(form.monthly_amount)

    await supabase.from('installment_plans').insert({
      owner_id:           user!.id,
      ownership:          profile?.display_name?.toLowerCase() === 'lalo' ? 'lalo' : 'ale',
      card_id:            form.card_id || null,
      concept:            form.concept,
      total_months:       totalMonths,
      current_month:      1,
      monthly_amount:     monthlyAmount,
      remaining_debt:     monthlyAmount * totalMonths,
      next_payment_date:  form.next_payment_date || null,
      is_active:          true,
    })

    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <>
      <button onClick={openModal} className="btn-primary flex items-center gap-1">
        <Plus size={16} /> Nuevo MSI
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-800">Nuevo financiamiento MSI</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">Concepto</label>
                <input className="input" value={form.concept}
                  onChange={e => set('concept', e.target.value)}
                  placeholder="Reloj Tissot, iPad, etc." required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Total de meses</label>
                  <input className="input" type="number" min="1" value={form.total_months}
                    onChange={e => set('total_months', e.target.value)} required />
                </div>
                <div>
                  <label className="label">Cantidad/mes</label>
                  <input className="input" type="number" step="0.01" min="0"
                    value={form.monthly_amount}
                    onChange={e => set('monthly_amount', e.target.value)} required />
                </div>
              </div>
              <div>
                <label className="label">Tarjeta</label>
                <select className="input" value={form.card_id}
                  onChange={e => set('card_id', e.target.value)}>
                  <option value="">Sin tarjeta</option>
                  {cards.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Fecha próximo pago</label>
                <input className="input" type="date" value={form.next_payment_date}
                  onChange={e => set('next_payment_date', e.target.value)} />
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
