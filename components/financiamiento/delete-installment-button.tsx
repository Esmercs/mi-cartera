'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ConfirmDialog from '@/components/shared/confirm-dialog'

export default function DeleteInstallmentButton({ id, concept }: { id: string; concept: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  async function handleDelete() {
    setLoading(true)
    // .select() para detectar borrados bloqueados por RLS (no lanzan error, regresan 0 filas)
    const { data } = await supabase
      .from('installment_plans').delete().eq('id', id).select('id')
    setLoading(false)
    setOpen(false)
    if (!data?.length) {
      alert('No se pudo eliminar. Falta aplicar la migración 022 en la base de datos.')
      return
    }
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
        title="Eliminar MSI"
        confirmLabel="Sí, eliminar"
        tone="danger"
        loading={loading}
        onConfirm={handleDelete}
        onCancel={() => setOpen(false)}
        message={`Se eliminará "${concept}". Esta acción no se puede deshacer y no modifica el saldo de la tarjeta.`}
      />
    </>
  )
}
