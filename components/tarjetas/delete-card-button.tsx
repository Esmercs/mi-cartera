'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ConfirmDialog from '@/components/shared/confirm-dialog'

export default function DeleteCardButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  async function handleDelete() {
    setLoading(true)
    const { error } = await supabase.from('cards').update({ is_active: false }).eq('id', id)
    setLoading(false)
    if (error) { alert(`Error: ${error.message}`); return }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={loading}
        className="p-1 text-gray-200 hover:text-red-400 transition-colors rounded disabled:opacity-50"
      >
        <X size={14} />
      </button>

      <ConfirmDialog
        open={open}
        title={`Ocultar tarjeta "${name}"`}
        confirmLabel="Sí, ocultar"
        tone="danger"
        loading={loading}
        onConfirm={handleDelete}
        onCancel={() => setOpen(false)}
        message="Los registros existentes no se eliminarán."
      />
    </>
  )
}
