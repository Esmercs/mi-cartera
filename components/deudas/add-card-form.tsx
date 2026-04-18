'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AddCardForm() {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', card_type: 'credit', last_four: '' })
  const [loading, setLoading] = useState(false)

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles').select('display_name').eq('id', user!.id).single()

    const ownership = profile?.display_name?.toLowerCase() === 'lalo' ? 'lalo' : 'ale'

    await supabase.from('cards').insert({
      owner_id:        user!.id,
      ownership,
      name:            form.name,
      card_type:       form.card_type,
      last_four:       form.last_four || null,
      current_balance: 0,
      is_active:       true,
    })

    setOpen(false)
    setLoading(false)
    setForm({ name: '', card_type: 'credit', last_four: '' })
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs px-2.5 py-1.5 text-brand-600 hover:bg-brand-50 border border-brand-200 rounded-lg transition-colors"
      >
        <Plus size={13} /> Tarjeta
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-xs space-y-4">
            <h3 className="font-semibold text-gray-800">Nueva tarjeta</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">Nombre</label>
                <input className="input" value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="BBVA, Visa, Liverpool..." required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Tipo</label>
                  <select className="input" value={form.card_type}
                    onChange={e => set('card_type', e.target.value)}>
                    <option value="credit">Crédito</option>
                    <option value="debit">Débito</option>
                    <option value="cash">Efectivo</option>
                  </select>
                </div>
                <div>
                  <label className="label">Últimos 4 (opcional)</label>
                  <input className="input" maxLength={4} value={form.last_four}
                    onChange={e => set('last_four', e.target.value)}
                    placeholder="1234" />
                </div>
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
