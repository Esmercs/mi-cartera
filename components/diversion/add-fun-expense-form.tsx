'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AddFunExpenseForm({ budgetPeriodId }: { budgetPeriodId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ concept: '', amount: '', expense_date: '' })
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  async function openModal() {
    // Cargar conceptos previos al abrir
    const { data } = await supabase
      .from('fun_expenses')
      .select('concept')
      .order('created_at', { ascending: false })

    if (data) {
      // Únicos, preservando orden de más reciente a más antiguo
      const unique = [...new Set(data.map(d => d.concept))]
      setSuggestions(unique)
    }
    setOpen(true)
  }

  function handleConceptChange(value: string) {
    setForm(p => ({ ...p, concept: value }))
    setShowSuggestions(value.length > 0)
  }

  function selectSuggestion(concept: string) {
    setForm(p => ({ ...p, concept }))
    setShowSuggestions(false)
  }

  const filtered = suggestions.filter(s =>
    s.toLowerCase().includes(form.concept.toLowerCase()) &&
    s.toLowerCase() !== form.concept.toLowerCase()
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('fun_expenses').insert({
      budget_period_id: budgetPeriodId,
      concept:          form.concept,
      amount:           parseFloat(form.amount),
      expense_date:     form.expense_date || new Date().toISOString().split('T')[0],
      registered_by:    user?.id ?? null,
    })

    setForm({ concept: '', amount: '', expense_date: '' })
    setShowSuggestions(false)
    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <>
      <button onClick={openModal} className="btn-primary flex items-center gap-1">
        <Plus size={16} /> Agregar gasto
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-800">Nuevo gasto de diversión</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <label className="label">Concepto</label>
                <input
                  className="input"
                  value={form.concept}
                  onChange={e => handleConceptChange(e.target.value)}
                  onFocus={() => form.concept.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="Standup, Starbucks, Cine…"
                  autoComplete="off"
                  required
                />
                {showSuggestions && filtered.length > 0 && (
                  <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                    {filtered.map(s => (
                      <li
                        key={s}
                        onMouseDown={() => selectSuggestion(s)}
                        className="px-3 py-2 text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700 cursor-pointer"
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
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
                <label className="label">Fecha</label>
                <input
                  className="input"
                  type="date"
                  value={form.expense_date}
                  onChange={e => setForm(p => ({ ...p, expense_date: e.target.value }))}
                />
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
