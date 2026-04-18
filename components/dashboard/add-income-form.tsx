'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'

export default function AddIncomeForm({ currentAmount }: { currentAmount: number }) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(currentAmount.toString())
  const [loading, setLoading] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('income_config').upsert({
      owner_id: user.id,
      amount: parseFloat(amount),
      valid_from: new Date().toISOString().split('T')[0],
    }, { onConflict: 'owner_id,valid_from' })

    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => { setAmount(currentAmount.toString()); setOpen(true) }}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800
                   border rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
      >
        <Settings size={13} />
        Ingreso: {formatMXN(currentAmount)}/mes
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-xs space-y-4">
            <h3 className="font-semibold text-gray-800">Actualizar ingreso mensual</h3>
            <p className="text-xs text-gray-500">
              El split de gastos compartidos se recalcula automáticamente basado en los ingresos de cada quien.
            </p>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="label">Ingreso mensual total</label>
                <input
                  className="input"
                  type="number"
                  step="1"
                  min="0"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  required
                />
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
