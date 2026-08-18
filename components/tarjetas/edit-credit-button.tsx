'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { CreditSplit, Ownership, PaidBy } from '@/types/database'

export default function EditCreditButton({ credit }: { credit: CreditSplit }) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: credit.name,
    annual_rate: String(credit.annual_rate),
    term_months: String(credit.term_months),
    monthly_payment: String(credit.monthly_payment),
    payment_day: String(credit.payment_day),
    ownership: credit.ownership as Ownership,
    paid_by: credit.paid_by as PaidBy,
  })

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: updated, error: updateError } = await supabase
      .from('credits')
      .update({
        name:            form.name,
        annual_rate:     parseFloat(form.annual_rate) || 0,
        term_months:     parseInt(form.term_months) || 1,
        monthly_payment: parseFloat(form.monthly_payment),
        payment_day:     parseInt(form.payment_day),
        ownership:       form.ownership,
        owner_id:        form.ownership === 'shared' ? null : user!.id,
        paid_by:         form.ownership === 'shared' ? form.paid_by : 'each',
      })
      .eq('id', credit.id)
      .select('id')

    setLoading(false)
    if (updateError) { setError(updateError.message); return }
    if (!updated?.length) {
      setError('No se guardó: la base de datos rechazó el cambio (permisos).')
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="text-xs px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg
                   hover:bg-gray-50 flex items-center gap-1">
        <Pencil size={12} /> Editar
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="card p-5 w-full max-w-sm space-y-4 my-8">
            <div>
              <h3 className="font-semibold text-gray-800">Editar crédito</h3>
              <p className="text-[10px] text-gray-400 mt-1">
                El monto original y la fecha de inicio no se editan: viven en el ledger.
                Para corregirlos, borra el crédito y créalo de nuevo. Cambiar la tasa aplica
                desde el siguiente devengo — usa «Recalcular intereses» si quieres rehacer
                los meses ya devengados.
              </p>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="label">Nombre</label>
                <input className="input" value={form.name} onChange={e => set('name', e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">
                    Tasa anual %
                    <span className="text-gray-400 font-normal ml-1">antes de IVA</span>
                  </label>
                  <input className="input" type="number" step="0.001" min="0" value={form.annual_rate}
                    onChange={e => set('annual_rate', e.target.value)} required />
                </div>
                <div>
                  <label className="label">Plazo (meses)</label>
                  <input className="input" type="number" min="1" value={form.term_months}
                    onChange={e => set('term_months', e.target.value)} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Cuota mensual</label>
                  <input className="input" type="number" step="0.01" min="0.01" value={form.monthly_payment}
                    onChange={e => set('monthly_payment', e.target.value)} required />
                </div>
                <div>
                  <label className="label">Día de pago</label>
                  <select className="input" value={form.payment_day} onChange={e => set('payment_day', e.target.value)}>
                    <option value="15">Día 15</option>
                    <option value="30">Día 30 (fin de mes)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Dueño</label>
                <select className="input" value={form.ownership} onChange={e => set('ownership', e.target.value)}>
                  <option value="shared">Compartido (Los 2)</option>
                  <option value="lalo">Lalo (personal)</option>
                  <option value="ale">Ale (personal)</option>
                </select>
              </div>
              {form.ownership === 'shared' && (
                <div>
                  <label className="label">¿Quién paga?</label>
                  <select className="input" value={form.paid_by} onChange={e => set('paid_by', e.target.value)}>
                    <option value="each">Cada quien su parte</option>
                    <option value="lalo">Lalo paga todo (Ale le debe)</option>
                    <option value="ale">Ale paga todo (Lalo le debe)</option>
                  </select>
                </div>
              )}
              {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
