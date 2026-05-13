'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AddProjectionForm() {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cards, setCards] = useState<{ id: string; name: string }[]>([])
  const [form, setForm] = useState({
    concept: '',
    amount: '',
    projected_date: '',
    card_id: '',
    notes: '',
  })

  async function openModal() {
    const { data } = await supabase.from('cards').select('id, name').eq('is_active', true).order('name')
    setCards(data ?? [])
    setForm({ concept: '', amount: '', projected_date: '', card_id: '', notes: '' })
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    await (supabase.from('projections') as any).insert({
      owner_id:       user!.id,
      concept:        form.concept,
      amount:         parseFloat(form.amount),
      projected_date: form.projected_date,
      card_id:        form.card_id || null,
      notes:          form.notes || null,
    })
    setLoading(false)
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-1 text-xs btn-primary px-2 py-1"
      >
        <Plus size={13} /> Agregar
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <div className="card p-5 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Nueva proyección</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">Concepto</label>
                <input
                  className="input"
                  placeholder="Regalo cumpleaños mamá"
                  value={form.concept}
                  onChange={e => setForm(p => ({ ...p, concept: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label">Monto</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="500"
                  value={form.amount}
                  onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label">Fecha proyectada</label>
                <input
                  className="input"
                  type="date"
                  value={form.projected_date}
                  onChange={e => setForm(p => ({ ...p, projected_date: e.target.value }))}
                  required
                />
              </div>
              {cards.length > 0 && (
                <div>
                  <label className="label">Tarjeta (opcional)</label>
                  <select
                    className="input"
                    value={form.card_id}
                    onChange={e => setForm(p => ({ ...p, card_id: e.target.value }))}
                  >
                    <option value="">Sin tarjeta</option>
                    {cards.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="label">Notas (opcional)</label>
                <input
                  className="input"
                  placeholder="Detalles adicionales"
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary flex-1 flex items-center justify-center gap-1.5"
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
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
