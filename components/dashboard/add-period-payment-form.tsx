'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AddPeriodPaymentForm({ periodId }: { periodId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    concept: '',
    amount: '',
    payment_type: 'fijo' as 'fijo' | 'extra',
  })
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    await supabase.from('period_payments').insert({
      period_id: periodId,
      concept: form.concept,
      amount: parseFloat(form.amount),
      payment_type: form.payment_type,
    })

    setForm({ concept: '', amount: '', payment_type: 'fijo' })
    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs btn-primary px-2 py-1"
      >
        <Plus size={14} /> Agregar
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-800">Nuevo pago</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">Concepto</label>
                <input
                  className="input"
                  value={form.concept}
                  onChange={e => setForm(p => ({ ...p, concept: e.target.value }))}
                  placeholder="Liverpool, Banamex, etc."
                  required
                />
              </div>
              <div>
                <label className="label">Cantidad</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="label">Tipo</label>
                <select
                  className="input"
                  value={form.payment_type}
                  onChange={e => setForm(p => ({
                    ...p,
                    payment_type: e.target.value as 'fijo' | 'extra',
                  }))}
                >
                  <option value="fijo">Fijo</option>
                  <option value="extra">Extra</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={loading} className="btn-primary flex-1">
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-ghost flex-1"
                >
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
