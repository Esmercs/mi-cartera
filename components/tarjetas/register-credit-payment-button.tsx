'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'

interface Props {
  creditId: string
  creditName: string
  balance: number
  monthlyPayment: number   // cuota completa al banco
  myPayment: number        // mi parte de la cuota
  otherPayment: number     // parte del otro; > 0 solo si yo desembolso
  monthInterest: number
  otherName: string
  periodId: string
}

export default function RegisterCreditPaymentButton({
  creditId, creditName, balance, monthlyPayment, myPayment, otherPayment,
  monthInterest, otherName, periodId,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(monthlyPayment.toString())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const paid = parseFloat(amount) || 0
  // Proporción de la cuota que representa mi parte. Un abono extra se reparte con
  // los mismos porcentajes (consecuencia aceptada del split global — ver spec).
  const myRatio = monthlyPayment > 0 ? myPayment / monthlyPayment : 1
  const myShare = Math.round(paid * myRatio * 100) / 100
  const overpay = paid > balance
  const underInterest = monthInterest > 0 && paid < monthInterest

  function handleOpen() {
    setAmount(monthlyPayment.toString())
    setError(null)
    setOpen(true)
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()

    // Nunca abonar más que el saldo: dejaría el crédito en negativo
    const toLedger = Math.round(Math.min(paid, balance) * 100) / 100
    const toPeriod = Math.round(toLedger * myRatio * 100) / 100

    const { data: mov, error: movError } = await supabase
      .from('credit_movements')
      .insert({
        credit_id:      creditId,
        kind:           'payment',
        amount:         toLedger,
        effective_date: new Date().toISOString().slice(0, 10),
        created_by:     user!.id,
      })
      .select('id')

    if (movError) { setError(movError.message); setLoading(false); return }
    // RLS filtra en silencio en lugar de lanzar: sin este guard el diálogo se
    // cerraría "guardado" y el saldo no se movería.
    if (!mov?.length) {
      setError('No se guardó: la base de datos rechazó el abono (permisos).')
      setLoading(false)
      return
    }

    // Mi parte pesa en mi quincena. Si no hay periodo (quincena futura sin crear)
    // se omite: el ledger del crédito ya quedó correcto, que es lo importante.
    if (periodId && toPeriod >= 0.01) {
      await supabase.from('period_payments').insert({
        period_id:    periodId,
        concept:      creditName,
        amount:       toPeriod,
        card_id:      null,
        payment_type: 'fijo',
        paid_at:      new Date().toISOString(),
      })
    }

    // Si el saldo quedó en cero, el crédito está liquidado
    if (toLedger >= balance - 0.005) {
      await supabase.from('credits').update({ is_active: false }).eq('id', creditId)
    }

    setLoading(false)
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button onClick={handleOpen}
        className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-green-50 text-green-700
                   border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
        <CheckCircle size={13} /> Registrar abono
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-xs space-y-4">
            <div>
              <h3 className="font-semibold text-gray-800">Registrar abono</h3>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{creditName}</p>
              <div className="mt-2 rounded-lg bg-gray-50 px-2.5 py-2 space-y-0.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Saldo actual</span><span>{formatMXN(balance)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Interés de este mes</span><span>{formatMXN(monthInterest)}</span>
                </div>
              </div>
            </div>
            <form onSubmit={handlePay} className="space-y-3">
              <div>
                <label className="label">
                  Monto al banco
                  <span className="text-gray-400 font-normal ml-1">(cuota: {formatMXN(monthlyPayment)})</span>
                </label>
                <input className="input" type="number" step="0.01" min="0.01" value={amount}
                  onChange={e => setAmount(e.target.value)} required autoFocus />
                {otherPayment > 0 && paid > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    De tu quincena sale <span className="font-semibold">{formatMXN(myShare)}</span>;
                    {' '}{formatMXN(Math.round((paid - myShare) * 100) / 100)} los repone {otherName}.
                  </p>
                )}
                {overpay && (
                  <p className="text-xs text-amber-600 mt-1">
                    Liquidas el crédito: solo se aplican {formatMXN(balance)}, sobran{' '}
                    {formatMXN(Math.round((paid - balance) * 100) / 100)}.
                  </p>
                )}
                {underInterest && !overpay && (
                  <p className="text-xs text-amber-600 mt-1">
                    Este abono no cubre el interés del mes ({formatMXN(monthInterest)}): la deuda va a crecer.
                  </p>
                )}
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  {loading ? 'Guardando...' : 'Abonar'}
                </button>
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
