'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'
import { amortizedPayment } from '@/lib/utils/credit-math'
import type { Ownership, PaidBy } from '@/types/database'

export default function AddCreditForm() {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', principal: '', annual_rate: '', term_months: '',
    monthly_payment: '', payment_day: '15',
    ownership: 'shared' as Ownership, paid_by: 'each' as PaidBy,
    started_at: new Date().toISOString().slice(0, 10),
  })

  // Cuota sugerida. Es solo sugerencia: los bancos redondean y cobran comisiones,
  // así que el campo es editable y lo que el usuario escriba es lo que manda.
  const suggested = amortizedPayment(
    parseFloat(form.principal) || 0,
    parseFloat(form.annual_rate) || 0,
    parseInt(form.term_months) || 0,
  )

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const principal = parseFloat(form.principal)
    const cuota = parseFloat(form.monthly_payment) || suggested

    if (!cuota || cuota <= 0) {
      setError('Captura la cuota mensual o el plazo para calcularla.')
      setLoading(false)
      return
    }

    const { data: created, error: insertError } = await supabase
      .from('credits')
      .insert({
        name:            form.name,
        principal,
        annual_rate:     parseFloat(form.annual_rate) || 0,
        term_months:     parseInt(form.term_months) || 1,
        monthly_payment: cuota,
        payment_day:     parseInt(form.payment_day),
        ownership:       form.ownership,
        owner_id:        form.ownership === 'shared' ? null : user!.id,
        paid_by:         form.ownership === 'shared' ? form.paid_by : 'each',
        started_at:      form.started_at,
      })
      .select('id')
      .single()

    if (insertError || !created) {
      setError(insertError?.message ?? 'No se pudo crear el crédito (permisos).')
      setLoading(false)
      return
    }

    // El desembolso inicial es el primer movimiento del ledger: sin él el saldo
    // arrancaría en cero y el crédito se vería liquidado.
    const { error: movError } = await supabase.from('credit_movements').insert({
      credit_id:      (created as any).id,
      kind:           'disbursement',
      amount:         principal,
      effective_date: form.started_at,
      created_by:     user!.id,
    })
    if (movError) {
      // Sin desembolso el crédito queda inservible; mejor no dejar basura
      await supabase.from('credits').delete().eq('id', (created as any).id)
      setError('No se pudo registrar el monto original. No se creó el crédito.')
      setLoading(false)
      return
    }

    setLoading(false)
    setOpen(false)
    setForm({
      name: '', principal: '', annual_rate: '', term_months: '',
      monthly_payment: '', payment_day: '15',
      ownership: 'shared', paid_by: 'each',
      started_at: new Date().toISOString().slice(0, 10),
    })
    router.refresh()
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5">
        <Plus size={13} /> Crédito
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="card p-5 w-full max-w-sm space-y-4 my-8">
            <h3 className="font-semibold text-gray-800">Nuevo crédito</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="label">Nombre</label>
                <input className="input" value={form.name} onChange={e => set('name', e.target.value)}
                  placeholder="Prestamo Banamex" required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Monto original</label>
                  <input className="input" type="number" step="0.01" min="0.01" value={form.principal}
                    onChange={e => set('principal', e.target.value)} placeholder="0.00" required />
                </div>
                <div>
                  <label className="label">Tasa anual %</label>
                  <input className="input" type="number" step="0.001" min="0" value={form.annual_rate}
                    onChange={e => set('annual_rate', e.target.value)} placeholder="18" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Plazo (meses)</label>
                  <input className="input" type="number" min="1" value={form.term_months}
                    onChange={e => set('term_months', e.target.value)} placeholder="24" required />
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
                <label className="label">
                  Cuota mensual
                  {suggested > 0 && (
                    <span className="text-gray-400 font-normal ml-1">calculada: {formatMXN(suggested)}</span>
                  )}
                </label>
                <input className="input" type="number" step="0.01" min="0.01"
                  value={form.monthly_payment}
                  onChange={e => set('monthly_payment', e.target.value)}
                  placeholder={suggested > 0 ? suggested.toFixed(2) : '0.00'} />
                <p className="text-[10px] text-gray-400 mt-1">
                  Déjala vacía para usar la calculada. Si tu cuota real es distinta, escríbela — esa manda.
                  No cambia nunca: si abonas de más, se acorta el plazo.
                </p>
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
              <div>
                <label className="label">Fecha de inicio</label>
                <input className="input" type="date" value={form.started_at}
                  onChange={e => set('started_at', e.target.value)} required />
                <p className="text-[10px] text-gray-400 mt-1">
                  El interés empieza a devengarse el mes siguiente a esta fecha.
                </p>
              </div>
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
