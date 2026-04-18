'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Ownership, IntervalType } from '@/types/database'

const intervals: { value: IntervalType; label: string }[] = [
  { value: 'quincenal',   label: 'Quincenal' },
  { value: 'mensual',     label: 'Mensual' },
  { value: 'bimestral',   label: 'Bimestral' },
  { value: 'trimestral',  label: 'Trimestral' },
  { value: 'c/15 dias',   label: 'Cada 15 días' },
  { value: 'c/21 dias',   label: 'Cada 21 días' },
  { value: 'anual',       label: 'Anual' },
]

export default function AddExpenseForm() {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    concept: '',
    total_amount: '',
    ownership: 'shared' as Ownership,
    interval_type: 'mensual' as IntervalType,
    next_payment_date: '',
  })
  const [loading, setLoading] = useState(false)

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user!.id)
      .single()

    await supabase.from('recurring_expenses').insert({
      owner_id: form.ownership === 'shared' ? null : profile!.id,
      ownership: form.ownership,
      concept: form.concept,
      total_amount: parseFloat(form.total_amount),
      interval_type: form.interval_type,
      next_payment_date: form.next_payment_date || null,
    })

    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1">
        <Plus size={16} /> Agregar gasto
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-800">Nuevo gasto fijo</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">Concepto</label>
                <input className="input" value={form.concept}
                  onChange={e => set('concept', e.target.value)}
                  placeholder="Netflix, Renta, etc." required />
              </div>
              <div>
                <label className="label">Cantidad total</label>
                <input className="input" type="number" step="0.01" min="0"
                  value={form.total_amount}
                  onChange={e => set('total_amount', e.target.value)}
                  placeholder="0.00" required />
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
              <div>
                <label className="label">Intervalo</label>
                <select className="input" value={form.interval_type}
                  onChange={e => set('interval_type', e.target.value)}>
                  {intervals.map(i => (
                    <option key={i.value} value={i.value}>{i.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Próximo pago</label>
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
