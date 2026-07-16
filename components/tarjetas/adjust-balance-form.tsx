'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'

interface Props {
  cardId: string
  cardName: string
  derivedBalance: number
  creditLimit: number
}

// Reemplaza la edición directa del saldo: la diferencia contra el saldo real
// del banco se registra como movimiento de "ajuste" — el saldo nunca se sobrescribe.
export default function AdjustBalanceForm({ cardId, cardName, derivedBalance, creditLimit }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [realBalance, setRealBalance] = useState('')
  const [limit, setLimit] = useState(creditLimit.toString())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpen() {
    setRealBalance(derivedBalance.toFixed(2))
    setLimit(creditLimit.toString())
    setError(null)
    setOpen(true)
  }

  const diff = Math.round(((parseFloat(realBalance) || 0) - derivedBalance) * 100) / 100

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()

    if (Math.abs(diff) >= 0.01) {
      const { data: expense, error: expErr } = await supabase
        .from('card_expenses')
        .insert({
          owner_id:      user!.id,
          card_id:       cardId,
          concept:       'Ajuste manual',
          total_amount:  diff,
          months:        1,
          expense_type:  'ajuste',
        })
        .select('id')
        .single()

      if (expErr || !expense) {
        setError(expErr?.message ?? 'No se pudo crear el ajuste.')
        setLoading(false)
        return
      }

      // due_period_date NULL: cuenta en el saldo, no en la proyección de quincena
      const { error: instErr } = await supabase
        .from('card_expense_installments')
        .insert({ expense_id: expense.id, number: 1, amount: diff, due_period_date: null })

      if (instErr) {
        await supabase.from('card_expenses').delete().eq('id', expense.id)
        setError(instErr.message)
        setLoading(false)
        return
      }
    }

    const newLimit = parseFloat(limit) || 0
    if (newLimit !== creditLimit) {
      const { data: limitData } = await supabase
        .from('cards').update({ credit_limit: newLimit }).eq('id', cardId).select('id')
      if (!limitData?.length) {
        setError('El ajuste se guardó, pero no se pudo actualizar el límite de crédito (bloqueado por permisos).')
        setLoading(false)
        return
      }
    }

    setLoading(false)
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
            <h3 className="font-semibold text-gray-800">Ajustar tarjeta</h3>
            <p className="text-sm text-gray-500">{cardName}</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500">
                Saldo según la app: <span className="font-semibold text-gray-800">{formatMXN(derivedBalance)}</span>
              </div>
              <div>
                <label className="label">Saldo real según el banco</label>
                <input className="input" type="number" step="0.01"
                  value={realBalance} onChange={e => setRealBalance(e.target.value)} required />
                {Math.abs(diff) >= 0.01 && (
                  <p className={`text-xs mt-1 ${diff > 0 ? 'text-red-500' : 'text-green-600'}`}>
                    Se registrará un ajuste de {formatMXN(diff)}
                  </p>
                )}
              </div>
              <div>
                <label className="label">Límite de crédito</label>
                <input className="input" type="number" step="0.01" min="0"
                  value={limit} onChange={e => setLimit(e.target.value)}
                  placeholder="0 = sin límite configurado" />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
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
