'use client'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function DeleteExpenseButton({ id }: { id: string }) {
  const router = useRouter()
  const supabase = createClient()

  async function handleDelete() {
    await supabase.from('recurring_expenses').update({ is_active: false }).eq('id', id)
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      className="text-gray-300 hover:text-red-500 transition-colors"
      title="Desactivar gasto"
    >
      <Trash2 size={14} />
    </button>
  )
}
