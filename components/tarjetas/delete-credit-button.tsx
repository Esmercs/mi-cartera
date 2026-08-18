'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function DeleteCreditButton({
  creditId, creditName,
}: { creditId: string; creditName: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!window.confirm(
      `¿Borrar «${creditName}»? Se van también todos sus movimientos (monto original, ` +
      `intereses y abonos). Los pagos ya registrados en tus quincenas NO se borran.`
    )) return

    setLoading(true)
    // .select() para detectar el bloqueo silencioso de RLS: un delete filtrado
    // regresa error null y 0 filas.
    const { data, error } = await supabase.from('credits').delete().eq('id', creditId).select('id')
    setLoading(false)
    if (error || !data?.length) {
      alert('No se borró: la base de datos rechazó la operación (permisos).')
      return
    }
    router.refresh()
  }

  return (
    <button onClick={handleDelete} disabled={loading}
      className="text-xs px-2.5 py-1.5 border border-red-200 text-red-600 rounded-lg
                 hover:bg-red-50 flex items-center gap-1">
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Borrar
    </button>
  )
}
