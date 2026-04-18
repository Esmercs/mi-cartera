'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function DeleteScheduledButton({ id }: { id: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm('¿Eliminar este pago programado?')) return
    setLoading(true)
    await supabase.from('scheduled_payments').delete().eq('id', id)
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded disabled:opacity-50"
    >
      <Trash2 size={14} />
    </button>
  )
}
