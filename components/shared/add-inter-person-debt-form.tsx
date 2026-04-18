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
  const [isMeses, setIsMeses] = useState(false)
  const [form, setForm] = useState({
    debtor_id: '',
    concept: '',
    amount: '',
    installments: '',
    due_date: '',
  })
  const [loading, setLoading] = useState(false)

  async function openModal() {
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('status', 'approved')
    setUsers(data ?? [])
    setIsMeses(false)
    setForm({ debtor_id: '', concept: '', amount: '', installments: '', due_date: '' })
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    const totalInstallments = isMeses ? parseInt(form.installments) : null

    await supabase.from('inter_person_debts').insert({
      creditor_id:        user!.id,
      debtor_id:          form.debtor_id,
      concept:            form.concept,
      amount:             parseFloat(form.amount),
      total_installments: totalInstallments,
      paid_installments:  0,
      due_date:           form.due_date || null,
    })

    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  const totalAmount = isMeses && form.amount && form.installments
    ? parseFloat(form.amount) * parseInt(form.installments)
    : null

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

              {/* Toggle a meses */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isMeses}
                  onChange={e => setIsMeses(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">¿A meses?</span>
              </label>

              {isMeses ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Monto por mes</label>
                    <input className="input" type="number" step="0.01" min="0"
                      value={form.amount} placeholder="200"
                      onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="label">Número de meses</label>
                    <input className="input" type="number" min="2" max="60"
                      value={form.installments} placeholder="3"
                      onChange={e => setForm(p => ({ ...p, installments: e.target.value }))} required />
                  </div>
                  {totalAmount !== null && (
                    <p className="col-span-2 text-xs text-gray-500">
                      Total: <span className="font-semibold text-gray-800">
                        ${totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </span>
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="label">Cantidad</label>
                  <input className="input" type="number" step="0.01" min="0"
                    value={form.amount}
                    onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} required />
                </div>
              )}

              <div>
                <label className="label">
                  {isMeses ? 'Fecha primer vencimiento (opcional)' : 'Fecha límite (opcional)'}
                </label>
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
