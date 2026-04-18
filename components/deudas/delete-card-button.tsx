'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function DeleteCardButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm(`¿Ocultar la tarjeta "${name}"? Los registros existentes no se eliminarán.`)) return
    setLoading(true)
    const { error } = await supabase.from('cards').update({ is_active: false }).eq('id', id)
    setLoading(false)
    if (error) { alert(`Error: ${error.message}`); return }
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="p-1 text-gray-200 hover:text-red-400 transition-colors rounded disabled:opacity-50"
    >
      <X size={14} />
    </button>
  )
}
