'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Loader2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  debtId: string
  concept: string
  amount: number
  dueDate: string | null
  totalInstallments: number | null
  paidInstallments: number
  cardId: string | null
  cardName: string | null
  creditorId: string
  currentUserId: string
}

export default function EditDebtDialog({
  debtId, concept, amount, dueDate,
  totalInstallments, paidInstallments,
  cardId, cardName,
  creditorId, currentUserId,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cards, setCards] = useState<{ id: string; name: string }[]>([])
  const [form, setForm] = useState({
    concept,
    amount: String(amount),
    due_date: dueDate ?? '',
    total_installments: totalInstallments ? String(totalInstallments) : '',
    card_id: cardId ?? '',
  })

  const canEdit = creditorId === currentUserId

  async function openDialog() {
    const { data } = await supabase.from('cards').select('id, name').eq('is_active', true).order('name')
    setCards(data ?? [])
    setForm({
      concept,
      amount: String(amount),
      due_date: dueDate ?? '',
      total_installments: totalInstallments ? String(totalInstallments) : '',
      card_id: cardId ?? '',
    })
    setConfirmDelete(false)
    setError(null)
    setOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await (supabase.from('inter_person_debts') as any).update({
      concept:            form.concept,
      amount:             parseFloat(form.amount),
      due_date:           form.due_date || null,
      total_installments: form.total_installments ? parseInt(form.total_installments) : null,
      card_id:            form.card_id || null,
    }).eq('id', debtId)
    setLoading(false)
    setOpen(false)
    router.refresh()
  }

  async function handleDelete() {
    setLoading(true)
    setError(null)
    const { data, error: delError } = await supabase
      .from('inter_person_debts')
      .delete()
      .eq('id', debtId)
      .select()
    setLoading(false)
    if (delError) {
      setError(delError.message)
      return
    }
    if (!data || data.length === 0) {
      // RLS no lanza error: borra 0 filas y devuelve data vacía.
      setError('No se pudo eliminar la deuda (sin permisos). Falta aplicar la política de borrado en la base de datos.')
      return
    }
    setOpen(false)
    router.refresh()
  }

  const remainingInstallments = totalInstallments
    ? parseInt(form.total_installments || '0') - paidInstallments
    : null

  return (
    <>
      <button
        onClick={openDialog}
        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
        title="Editar deuda"
      >
        <Pencil size={13} />
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <div className="card p-5 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Editar deuda</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {!canEdit ? (
              <p className="text-sm text-gray-500">Solo el acreedor puede editar esta deuda.</p>
            ) : confirmDelete ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-700">
                  ¿Eliminar <span className="font-semibold">{concept}</span>? Esta acción no se puede deshacer.
                </p>
                {error && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loading && <Loader2 size={14} className="animate-spin" />}
                    Sí, eliminar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="btn-ghost flex-1"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-3">
                <div>
                  <label className="label">Concepto</label>
                  <input
                    className="input"
                    value={form.concept}
                    onChange={e => setForm(p => ({ ...p, concept: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <label className="label">
                    {totalInstallments ? 'Monto por cuota' : 'Cantidad'}
                  </label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.amount}
                    onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                    required
                  />
                </div>

                {totalInstallments !== null && (
                  <div>
                    <label className="label">Total de cuotas</label>
                    <input
                      className="input"
                      type="number"
                      min={paidInstallments + 1}
                      value={form.total_installments}
                      onChange={e => setForm(p => ({ ...p, total_installments: e.target.value }))}
                      required
                    />
                    {remainingInstallments !== null && remainingInstallments > 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        {paidInstallments} pagadas · {remainingInstallments} restantes
                      </p>
                    )}
                  </div>
                )}

                {cards.length > 0 && (
                  <div>
                    <label className="label">Tarjeta (opcional)</label>
                    <select
                      className="input"
                      value={form.card_id}
                      onChange={e => setForm(p => ({ ...p, card_id: e.target.value }))}
                    >
                      <option value="">Sin tarjeta</option>
                      {cards.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="label">Fecha de vencimiento</label>
                  <input
                    className="input"
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary flex-1 flex items-center justify-center gap-1.5"
                  >
                    {loading && <Loader2 size={14} className="animate-spin" />}
                    {loading ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="btn-ghost flex-1"
                  >
                    Cancelar
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-red-500 hover:text-red-700 py-1 transition-colors"
                >
                  <Trash2 size={12} /> Eliminar deuda
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
