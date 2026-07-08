'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AddProjectForm() {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    total_cost: '',
    due_date: '',
    notes: '',
  })
  const [loading, setLoading] = useState(false)

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function openModal() {
    setForm({ name: '', total_cost: '', due_date: '', notes: '' })
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('projects').insert({
      owner_id:   user!.id,
      name:       form.name,
      total_cost: parseFloat(form.total_cost),
      due_date:   form.due_date || null,
      notes:      form.notes || null,
    })

    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <>
      <button onClick={openModal} className="btn-primary flex items-center gap-1">
        <Plus size={16} /> Nuevo proyecto
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-800">Nuevo proyecto</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">Nombre</label>
                <input className="input" value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="Boda Primo Lalo, viaje, etc." required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Costo total</label>
                  <input className="input" type="number" step="0.01" min="0.01"
                    value={form.total_cost}
                    onChange={e => set('total_cost', e.target.value)} required />
                </div>
                <div>
                  <label className="label">Fecha límite</label>
                  <input className="input" type="date" value={form.due_date}
                    onChange={e => set('due_date', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Notas (opcional)</label>
                <input className="input" value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  placeholder="Detalles, a quién se paga, etc." />
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
