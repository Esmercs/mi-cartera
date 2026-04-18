'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function EditBudgetButton({
  budgetPeriodId,
  currentBudget,
}: {
  budgetPeriodId: string
  currentBudget: number
}) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [budget, setBudget] = useState(currentBudget.toString())
  const [loading, setLoading] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    await supabase
      .from('fun_budget_periods')
      .update({ base_budget: parseFloat(budget) })
      .eq('id', budgetPeriodId)

    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded"
        title="Editar presupuesto"
      >
        <Pencil size={16} />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-xs space-y-4">
            <h3 className="font-semibold text-gray-800">Editar presupuesto</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="label">Presupuesto quincenal</label>
                <input className="input" type="number" step="1" min="0"
                  value={budget} onChange={e => setBudget(e.target.value)} required />
              </div>
              <div className="flex gap-2">
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
