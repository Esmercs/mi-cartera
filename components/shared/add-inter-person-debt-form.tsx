'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AddInterPersonDebtForm() {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<{ id: string; display_name: string }[]>([])
  const [form, setForm] = useState({
    debtor_id: '',
    concept: '',
    amount: '',
    due_date: '',
  })
  const [loading, setLoading] = useState(false)

  async function openModal() {
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('status', 'approved')
    setUsers(data ?? [])
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('inter_person_debts').insert({
      creditor_id: user!.id,
      debtor_id:   form.debtor_id,
      concept:     form.concept,
      amount:      parseFloat(form.amount),
      due_date:    form.due_date || null,
    })

    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <>
      <button onClick={openModal} className="flex items-center gap-1 text-xs btn-primary px-2 py-1">
        <Plus size={13} /> Registrar deuda
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-800">Registrar deuda</h3>
            <p className="text-xs text-gray-500">Tú eres el acreedor (a ti te deben).</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">¿Quién te debe?</label>
                <select className="input" value={form.debtor_id}
                  onChange={e => setForm(p => ({ ...p, debtor_id: e.target.value }))} required>
                  <option value="">Seleccionar</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.display_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Concepto</label>
                <input className="input" value={form.concept}
                  onChange={e => setForm(p => ({ ...p, concept: e.target.value }))}
                  placeholder="Descripción de la deuda" required />
              </div>
              <div>
                <label className="label">Cantidad</label>
                <input className="input" type="number" step="0.01" min="0"
                  value={form.amount}
                  onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Fecha límite (opcional)</label>
                <input className="input" type="date" value={form.due_date}
                  onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
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
