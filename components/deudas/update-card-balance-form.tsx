'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'

interface Props {
  cardId: string
  cardName: string
  currentBalance: number
  creditLimit: number
}

export default function UpdateCardBalanceForm({ cardId, cardName, currentBalance, creditLimit }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [balance, setBalance] = useState(currentBalance.toString())
  const [limit, setLimit] = useState(creditLimit.toString())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpen() {
    setBalance(currentBalance.toString())
    setLimit(creditLimit.toString())
    setError(null)
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: err } = await supabase
      .from('cards')
      .update({
        current_balance: parseFloat(balance),
        credit_limit: parseFloat(limit),
      })
      .eq('id', cardId)
    setLoading(false)
    if (err) { setError(err.message); return }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="p-1 text-gray-300 hover:text-brand-600 transition-colors rounded"
      >
        <Pencil size={13} />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-xs space-y-4">
            <h3 className="font-semibold text-gray-800">Editar tarjeta</h3>
            <p className="text-sm text-gray-500">{cardName}</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">Saldo adeudado</label>
                <input className="input" type="number" step="0.01" min="0"
                  value={balance} onChange={e => setBalance(e.target.value)} required />
              </div>
              <div>
                <label className="label">Límite de crédito</label>
                <input className="input" type="number" step="0.01" min="0"
                  value={limit} onChange={e => setLimit(e.target.value)}
                  placeholder="0 = sin límite configurado" />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
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
