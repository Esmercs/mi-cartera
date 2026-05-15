'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMXN } from '@/lib/utils/currency'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface HistoryRow {
  id: string
  period_start: string
  period_end: string
  base_budget: number
  total_spent: number
  remaining_budget: number
}

interface Expense {
  id: string
  concept: string
  amount: number
  expense_date: string
  registered_by_profile?: { display_name: string } | null
}

export default function ExpandableHistoryRow({ h }: { h: HistoryRow }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [expenses, setExpenses] = useState<Expense[] | null>(null)

  async function toggle() {
    if (!open && expenses === null) {
      setLoading(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('fun_expenses')
        .select('*, registered_by_profile:profiles!registered_by(display_name)')
        .eq('budget_period_id', h.id)
        .order('expense_date', { ascending: false })
      setExpenses((data as Expense[]) ?? [])
      setLoading(false)
    }
    setOpen(o => !o)
  }

  return (
    <div className="border-b last:border-0">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between text-sm py-2.5 gap-2 hover:bg-gray-50 transition-colors px-1 -mx-1 rounded"
      >
        <span className="flex items-center gap-1.5 shrink-0">
          {loading
            ? <Loader2 size={12} className="animate-spin text-gray-400" />
            : open
              ? <ChevronDown size={12} className="text-gray-400" />
              : <ChevronRight size={12} className="text-gray-400" />
          }
          <span className="text-gray-600 text-xs">
            {format(new Date(h.period_start), "d MMM", { locale: es })} –{' '}
            {format(new Date(h.period_end), "d MMM yy", { locale: es })}
          </span>
        </span>
        <div className="flex items-center gap-2 md:gap-4 ml-auto shrink-0">
          <span className="text-gray-500 text-xs">{formatMXN(h.total_spent)} / {formatMXN(h.base_budget)}</span>
          <span className={`text-xs font-medium w-14 text-right ${h.remaining_budget < 0 ? 'text-red-500' : 'text-green-600'}`}>
            {h.remaining_budget < 0 ? '−' : '+'}{formatMXN(Math.abs(h.remaining_budget))}
          </span>
        </div>
      </button>

      {open && expenses !== null && (
        <div className="pb-2 pl-5 space-y-0">
          {expenses.length === 0 ? (
            <p className="text-xs text-gray-400 py-1">Sin gastos registrados.</p>
          ) : (
            expenses.map(e => (
              <div key={e.id} className="flex items-center justify-between py-1.5 gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-700 truncate">{e.concept}</p>
                  <p className="text-[10px] text-gray-400">
                    {format(new Date(e.expense_date + 'T12:00:00'), "d MMM", { locale: es })}
                    {e.registered_by_profile && (
                      <span className="ml-1 text-gray-300">· {e.registered_by_profile.display_name}</span>
                    )}
                  </p>
                </div>
                <span className="text-xs font-semibold text-gray-700 shrink-0">{formatMXN(e.amount)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
