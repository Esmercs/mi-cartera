'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function RecalcInterestButton({
  creditId, creditName,
}: { creditId: string; creditName: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleRecalc() {
    if (!window.confirm(
      `¿Recalcular los intereses de «${creditName}»? Se borran los intereses devengados ` +
      `y se vuelven a generar desde la fecha de inicio con los abonos actuales. ` +
      `Úsalo si corregiste o borraste un abono viejo.`
    )) return

    setLoading(true)
    const { error } = await supabase
      .from('credit_movements')
      .delete()
      .eq('credit_id', creditId)
      .eq('kind', 'interest')
    setLoading(false)
    if (error) {
      alert(`No se pudo recalcular: ${error.message}`)
      return
    }
    // El devengo perezoso los regenera al recargar. router.refresh() vuelve a correr
    // el server component, que llama a accrueCreditInterest.
    router.refresh()
  }

  return (
    <button onClick={handleRecalc} disabled={loading}
      className="text-xs px-2.5 py-1.5 border border-gray-200 text-gray-500 rounded-lg
                 hover:bg-gray-50 flex items-center gap-1"
      title="Rehace los intereses devengados con los abonos actuales">
      {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Recalcular
    </button>
  )
}
