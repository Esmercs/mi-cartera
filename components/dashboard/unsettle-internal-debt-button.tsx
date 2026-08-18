'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Deshace una liquidación. `kind` decide la tabla, igual que en el botón de registrar.
//
// OJO: la política de DELETE solo deja borrar tus propias filas
// (paid_by_user_id = auth.uid()). Si el otro fue quien registró el pago, aquí sale
// el aviso de permisos — es correcto: que lo deshaga quien lo marcó.
type SettlementKind = 'recurring' | 'credit'

const TABLES: Record<SettlementKind, string> = {
  recurring: 'internal_debt_settlements',
  credit:    'credit_settlements',
}

export default function UnsettleInternalDebtButton({
  settlementId, kind = 'recurring',
}: { settlementId: string; kind?: SettlementKind }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const { data } = await supabase.from(TABLES[kind]).delete().eq('id', settlementId).select('id')
    setLoading(false)
    if (!data?.length) {
      alert('No se pudo deshacer el pago: solo lo puede deshacer quien lo registró.')
      return
    }
    router.refresh()
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
      title="Deshacer pago"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
    </button>
  )
}
