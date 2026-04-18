'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  plan: {
    id: string
    concept: string
    monthly_amount: number
    total_months: number
    next_payment_date: string | null
    card_id: string | null
  }
}

export default function EditInstallmentForm({ plan }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [cards, setCards] = useState<{ id: string; name: string }[]>([])
  const [form, setForm] = useState({
    concept:           plan.concept,
    monthly_amount:    plan.monthly_amount.toString(),
    total_months:      plan.total_months.toString(),
    next_payment_date: plan.next_payment_date ?? '',
    card_id:           plan.card_id ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleOpen() {
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
      concept:           plan.concept,
      monthly_amount:    plan.monthly_amount.toString(),
      total_months:      plan.total_months.toString(),
      next_payment_date: plan.next_payment_date ?? '',
      card_id:           plan.card_id ?? '',
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

    const monthlyAmount = parseFloat(form.monthly_amount)
    const totalMonths   = parseInt(form.total_months)

    const { error: err } = await supabase
      .from('installment_plans')
      .update({
        concept:           form.concept,
        monthly_amount:    monthlyAmount,
        total_months:      totalMonths,
        next_payment_date: form.next_payment_date || null,
        card_id:           form.card_id || null,
      })
      .eq('id', plan.id)

    setLoading(false)
    if (err) { setError(err.message); return }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
      >
        <Pencil size={14} />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-800">Editar MSI</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">Concepto</label>
                <input className="input" value={form.concept}
                  onChange={e => set('concept', e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Cantidad/mes</label>
                  <input className="input" type="number" step="0.01" min="0"
                    value={form.monthly_amount}
                    onChange={e => set('monthly_amount', e.target.value)} required />
                </div>
                <div>
                  <label className="label">Total meses</label>
                  <input className="input" type="number" min="1"
                    value={form.total_months}
                    onChange={e => set('total_months', e.target.value)} required />
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
                <label className="label">Próximo pago</label>
                <input className="input" type="date" value={form.next_payment_date}
                  onChange={e => set('next_payment_date', e.target.value)} />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
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
