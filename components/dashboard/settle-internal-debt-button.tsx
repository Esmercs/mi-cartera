'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Registra que la parte de una persona en un gasto compartido de esta quincena ya
// se liquidó. Lo puede registrar cualquiera de los dos: quien paga marca «Pagar» y
// quien cobra marca «Ya me pagó». Escriben la MISMA fila, y el UNIQUE
// (target, period_date, payer) evita que se duplique — el primero que registre gana.
//
// `kind` decide la tabla: los créditos tienen la suya porque
// internal_debt_settlements ata su FK a recurring_expenses (NOT NULL).
type SettlementKind = 'recurring' | 'credit'

const TABLES: Record<SettlementKind, { table: string; fk: string }> = {
  recurring: { table: 'internal_debt_settlements', fk: 'recurring_expense_id' },
  credit:    { table: 'credit_settlements',        fk: 'credit_id' },
}

interface Props {
  targetId: string           // id del gasto fijo o del crédito, según `kind`
  periodDate: string
  payer: 'lalo' | 'ale'      // de quién es la parte que se está liquidando
  amount: number
  kind?: SettlementKind
  label?: string
}

export default function SettleInternalDebtButton({
  targetId, periodDate, payer, amount, kind = 'recurring', label = 'Pagar',
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { table, fk } = TABLES[kind]
    const { error, data } = await (supabase.from(table) as any).insert({
      [fk]: targetId,
      period_date: periodDate,
      payer,
      amount,
      paid_by_user_id: user.id,
    }).select('id')

    setLoading(false)

    // 23505 = ya estaba registrado (el otro lo marcó primero). No es un error que
    // valga la pena mostrar: el refresh lo va a pintar como pagado igual.
    if (error && (error as any).code !== '23505') {
      alert(`No se pudo registrar el pago: ${error.message}`)
      return
    }
    // RLS filtra en silencio en lugar de lanzar: sin este guard el botón se vería
    // exitoso y nada se habría guardado.
    if (!error && !data?.length) {
      alert('No se registró el pago: la base de datos rechazó la operación (permisos).')
      return
    }
    router.refresh()
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-xs px-2 py-1 rounded-md bg-green-50 text-green-700 hover:bg-green-100 flex items-center gap-1 shrink-0"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
      {label}
    </button>
  )
}
