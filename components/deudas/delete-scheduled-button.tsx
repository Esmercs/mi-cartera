'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ConfirmDialog from '@/components/shared/confirm-dialog'

export default function DeleteScheduledButton({ id }: { id: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  async function handleDelete() {
    setLoading(true)
    await supabase.from('scheduled_payments').delete().eq('id', id)
    setLoading(false)
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={loading}
        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded disabled:opacity-50"
      >
        <Trash2 size={14} />
      </button>

      <ConfirmDialog
        open={open}
        title="Eliminar pago programado"
        confirmLabel="Sí, eliminar"
        tone="danger"
        loading={loading}
        onConfirm={handleDelete}
        onCancel={() => setOpen(false)}
        message="Esta acción no se puede deshacer."
      />
    </>
  )
}
