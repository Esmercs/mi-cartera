'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXDate, isOverdue } from '@/lib/utils/date-utils'

export default function EditDebtDueDate({
  debtId,
  dueDate,
}: {
  debtId: string
  dueDate: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(dueDate)
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    if (value === dueDate) { setEditing(false); return }
    setLoading(true)
    await supabase.from('inter_person_debts').update({ due_date: value }).eq('id', debtId)
    setLoading(false)
    setEditing(false)
    router.refresh()
  }

  function handleCancel() {
    setValue(dueDate)
    setEditing(false)
  }

  if (editing) {
    return (
      <span className="flex items-center gap-1 mt-0.5">
        <input
          type="date"
          value={value}
          onChange={e => setValue(e.target.value)}
          className="text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:border-blue-400"
          autoFocus
        />
        {loading ? (
          <Loader2 size={12} className="animate-spin text-gray-400" />
        ) : (
          <>
            <button onClick={handleSave} className="text-green-600 hover:text-green-700">
              <Check size={13} />
            </button>
            <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          </>
        )}
      </span>
    )
  }

  return (
    <span className={`flex items-center gap-1 mt-0.5 ${isOverdue(dueDate) ? 'text-red-500' : 'text-gray-400'}`}>
      <span className="text-xs">Vence: {formatMXDate(dueDate)}</span>
      <button
        onClick={() => setEditing(true)}
        className="text-gray-300 hover:text-gray-500 transition-colors"
        title="Editar fecha"
      >
        <Pencil size={11} />
      </button>
    </span>
  )
}
