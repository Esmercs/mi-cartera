'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'
import { getNextPeriodDates } from '@/lib/utils/date-utils'
import { generateInstallments } from '@/lib/utils/installments'
import { format, addMonths } from 'date-fns'

export default function AddExpenseForm() {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [cards, setCards] = useState<{ id: string; name: string }[]>([])
  const [partner, setPartner] = useState<{ id: string; name: string; pct: number } | null>(null)
  const [isMsi, setIsMsi] = useState(false)
  const [isShared, setIsShared] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  // Default: el próximo día de pago (15 o fin de mes) — la fecha que elija el
  // usuario se mapea de todos modos a la quincena que la contiene
  const nextPeriodStr = format(getNextPeriodDates().start, 'yyyy-MM-dd')

  const [form, setForm] = useState({
    concept: '',
    total_amount: '',
    card_id: '',
    purchase_date: todayStr,
    months: '3',
    first_due: nextPeriodStr,
  })

  async function openModal() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles').select('display_name').eq('id', user!.id).single()
    const isLalo = (profile as any)?.display_name?.toLowerCase() === 'lalo'

    const [{ data: cardData }, { data: profiles }, { data: splits }] = await Promise.all([
      supabase.from('cards').select('id, name')
        .in('ownership', [isLalo ? 'lalo' : 'ale', 'shared'])
        .eq('is_active', true).order('name'),
      supabase.from('profiles').select('id, display_name').eq('status', 'approved'),
      supabase.rpc('get_split_percentages'),
    ])

    const other = (profiles ?? []).find(p => p.id !== user!.id)
    const otherSplit = ((splits ?? []) as any[]).find(s => s.owner_id === other?.id)
    setPartner(other ? {
      id: other.id,
      name: other.display_name ?? 'Pareja',
      pct: otherSplit ? Number(otherSplit.percentage) : 50,
    } : null)

    setCards(cardData ?? [])
    setIsMsi(false)
    setIsShared(false)
    setError(null)
    setForm({
      concept: '', total_amount: '', card_id: '',
      purchase_date: todayStr, months: '3', first_due: nextPeriodStr,
    })
    setOpen(true)
  }

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function toggleMsi(on: boolean) {
    setIsMsi(on)
    set('first_due', on ? format(addMonths(new Date(), 1), 'yyyy-MM-dd') : nextPeriodStr)
  }

  const total = parseFloat(form.total_amount) || 0
  const months = isMsi ? Math.max(1, parseInt(form.months) || 1) : 1
  const cuota = months > 1 ? Math.round((total / months) * 100) / 100 : total
  const partnerTotal = partner && isShared ? Math.round(total * partner.pct) / 100 : 0
  const partnerCuota = partner && isShared
    ? Math.round((total * partner.pct) / 100 / months * 100) / 100
    : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: expense, error: expErr } = await supabase
      .from('card_expenses')
      .insert({
        owner_id:      user!.id,
        card_id:       form.card_id || null,
        concept:       form.concept,
        total_amount:  total,
        purchase_date: form.purchase_date,
        months,
        expense_type:  'compra',
        is_shared:     isShared && !!partner,
        shared_pct:    isShared && partner ? partner.pct : null,
      })
      .select('id')
      .single()

    if (expErr || !expense) {
      setError(expErr?.message ?? 'No se pudo guardar el gasto.')
      setLoading(false)
      return
    }

    const rows = generateInstallments(total, months, form.first_due)
    const { error: instErr } = await supabase
      .from('card_expense_installments')
      .insert(rows.map(r => ({ ...r, expense_id: expense.id })))

    if (instErr) {
      // No dejar un gasto sin cuotas: revertir el expense
      await supabase.from('card_expenses').delete().eq('id', expense.id)
      setError(instErr.message)
      setLoading(false)
      return
    }

    // Gasto compartido → la parte de la pareja queda como deuda entre personas
    // (la muestran y liquidan el Dashboard y Compartido sin código nuevo)
    if (isShared && partner) {
      const { data: debt } = await supabase
        .from('inter_person_debts')
        .insert({
          creditor_id:        user!.id,
          debtor_id:          partner.id,
          concept:            form.concept,
          amount:             partnerCuota,
          total_installments: months > 1 ? months : null,
          paid_installments:  0,
          due_date:           form.first_due,
          card_id:            form.card_id || null,
        })
        .select('id')
        .single()

      if (debt) {
        await supabase.from('card_expenses')
          .update({ inter_person_debt_id: debt.id })
          .eq('id', expense.id)
      }
    }

    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <>
      <button onClick={openModal} className="btn-primary flex items-center gap-1 text-sm">
        <Plus size={15} /> Registrar gasto
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="card p-5 w-full max-w-sm space-y-4 my-auto">
            <h3 className="font-semibold text-gray-800">Registrar gasto de tarjeta</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">Concepto</label>
                <input className="input" value={form.concept}
                  onChange={e => set('concept', e.target.value)}
                  placeholder="Super, Playera, Anualidad..." required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Monto total</label>
                  <input className="input" type="number" step="0.01" min="0.01"
                    value={form.total_amount}
                    onChange={e => set('total_amount', e.target.value)} required />
                </div>
                <div>
                  <label className="label">Fecha de compra</label>
                  <input className="input" type="date" value={form.purchase_date}
                    onChange={e => set('purchase_date', e.target.value)} required />
                </div>
              </div>
              <div>
                <label className="label">Tarjeta</label>
                <select className="input" value={form.card_id}
                  onChange={e => set('card_id', e.target.value)}>
                  <option value="">Sin tarjeta / efectivo</option>
                  {cards.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* A meses (MSI) */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isMsi}
                  onChange={e => toggleMsi(e.target.checked)} className="rounded" />
                <span className="text-sm text-gray-700">A meses (MSI)</span>
              </label>

              {isMsi ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Meses</label>
                    <input className="input" type="number" min="2" max="60"
                      value={form.months} onChange={e => set('months', e.target.value)} required />
                  </div>
                  <div>
                    <label className="label">Primer pago</label>
                    <input className="input" type="date" value={form.first_due}
                      onChange={e => set('first_due', e.target.value)} required />
                  </div>
                  {total > 0 && months > 1 && (
                    <p className="col-span-2 text-xs text-gray-500">
                      {months} cuotas de <span className="font-semibold text-gray-800">{formatMXN(cuota)}</span>/mes
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="label">Quincena en que lo pagarás</label>
                  <input className="input" type="date" value={form.first_due}
                    onChange={e => set('first_due', e.target.value)} required />
                </div>
              )}

              {/* Compartido */}
              {partner && (
                <>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={isShared}
                      onChange={e => setIsShared(e.target.checked)} className="rounded" />
                    <span className="text-sm text-gray-700">Compartido con {partner.name}</span>
                  </label>

                  {isShared && total > 0 && (
                    <div className="bg-purple-50 rounded-lg px-3 py-2 text-xs text-purple-700 space-y-0.5">
                      <p>
                        Según ingresos: tú <span className="font-semibold">{(100 - partner.pct).toFixed(0)}%</span> ·{' '}
                        {partner.name} <span className="font-semibold">{partner.pct.toFixed(0)}%</span>
                      </p>
                      <p>
                        {partner.name} te deberá <span className="font-semibold">{formatMXN(partnerTotal)}</span>
                        {months > 1 && <> ({formatMXN(partnerCuota)} por cuota)</>}
                      </p>
                    </div>
                  )}
                </>
              )}

              {error && <p className="text-xs text-red-500">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                  {loading && <Loader2 size={14} className="animate-spin" />}{loading ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
