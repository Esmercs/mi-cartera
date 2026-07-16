'use client'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function DeleteFunExpenseButton({ id }: { id: string }) {
  const router = useRouter()
  const supabase = createClient()

  async function handleDelete() {
    // .select() detecta bloqueos de RLS (no lanzan error, regresan 0 filas)
    const { data } = await supabase.from('fun_expenses').delete().eq('id', id).select('id')
    if (!data?.length) {
      alert('No se pudo eliminar (bloqueado por permisos).')
      return
    }
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
      title="Eliminar gasto"
    >
      <Trash2 size={14} />
    </button>
  )
}
