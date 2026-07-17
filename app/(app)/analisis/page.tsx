export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatMXN } from '@/lib/utils/currency'
import { format, subMonths } from 'date-fns'
import type { RecurringExpenseSplit, IncomeConfig } from '@/types/database'
import { analyzeFinances, monthlyEquivalent } from '@/lib/utils/financial-analysis'
import CategoryBucketRow from '@/components/analisis/category-bucket-row'

export default async function AnalisisPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const userId = session.user.id

  const { data: profile } = await supabase
    .from('profiles').select('display_name').eq('id', userId).single()
  const isLalo = (profile as any)?.display_name?.toLowerCase() === 'lalo'
  const myOwnership = isLalo ? 'lalo' : 'ale'

  const threeMonthsAgo = format(subMonths(new Date(), 3), 'yyyy-MM-dd')

  const [
    { data: currentIncome },
    { data: fijosRows },
    { data: splitRow },
    { data: funRows },
    { data: cardExpenses },
    { data: projectRows },
  ] = await Promise.all([
    supabase.from('income_config').select('amount').eq('owner_id', userId).order('valid_from', { ascending: false }).limit(1).single() as Promise<{ data: IncomeConfig | null }>,
    supabase.from('recurring_expenses_split').select('*').in('ownership', [myOwnership, 'shared']) as Promise<{ data: RecurringExpenseSplit[] | null }>,
    supabase.rpc('get_split_percentages').single() as unknown as Promise<{ data: { lalo_pct: number; ale_pct: number } | null }>,
    supabase.from('fun_expenses').select('amount, expense_date').gte('expense_date', threeMonthsAgo) as Promise<{ data: { amount: number }[] | null }>,
    supabase.from('card_expenses').select('concept, expense_type, months, category, source, card_expense_installments(amount, due_period_date, is_paid)').eq('owner_id', userId).eq('expense_type', 'compra') as Promise<{ data: any[] | null }>,
    supabase.from('project_payments').select('amount, paid_at').eq('owner_id', userId).gte('paid_at', threeMonthsAgo) as Promise<{ data: { amount: number }[] | null }>,
  ])

  const monthlyIncome = currentIncome?.amount ?? 0
  const myPct = splitRow ? Number(isLalo ? splitRow.lalo_pct : splitRow.ale_pct) : 50

  // Fijos mensualizados — mi parte (la vista ya trae el split calculado)
  const fijos = (fijosRows ?? []).map(e => {
    const myPart = e.ownership === 'shared'
      ? (isLalo ? e.lalo_amount : e.ale_amount)
      : e.total_amount
    return {
      concept: e.concept,
      monthly: monthlyEquivalent(myPart, e.interval_type),
      category: (e as any).category ?? 'otros',
    }
  })

  // Diversión: promedio mensual real de los últimos 3 meses, mi parte del gasto compartido
  const funTotal = (funRows ?? []).reduce((s, f) => s + f.amount, 0)
  const diversionMonthly = Math.round((funTotal / 3) * (myPct / 100) * 100) / 100

  // Gasto variable de tarjetas por rubro: promedio de cuotas de los últimos 3 meses
  // (mes en curso + 2 anteriores), clasificado por la categoría del gasto
  const monthWindow = new Set(
    Array.from({ length: 3 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'))
  )
  const variables: { concept: string; monthly: number; category: string }[] = []
  const msiItems: { concept: string; monthly: number }[] = []
  for (const e of cardExpenses ?? []) {
    // Los cargos de tarjeta generados por fijos domiciliados ya están contados
    // como fijos en su categoría — incluirlos aquí los duplicaría
    if (e.source?.startsWith('recurring-')) continue
    const insts = e.card_expense_installments ?? []
    if (e.months > 1) {
      // Compras a meses = obligaciones (bloque Ahorro y deudas), no gasto del mes
      const unpaid = insts.filter((i: any) => !i.is_paid)
        .sort((a: any, b: any) => (a.due_period_date ?? '9999').localeCompare(b.due_period_date ?? '9999'))
      if (unpaid.length) msiItems.push({ concept: e.concept, monthly: unpaid[0].amount })
      continue
    }
    // Compras a una exhibición: promedio mensual de los últimos 3 meses, por categoría
    const windowSum = insts
      .filter((i: any) => monthWindow.has((i.due_period_date ?? '').slice(0, 7)))
      .reduce((s: number, i: any) => s + i.amount, 0)
    if (windowSum > 0) {
      variables.push({
        concept: e.concept,
        monthly: Math.round((windowSum / 3) * 100) / 100,
        category: e.category ?? 'otros',
      })
    }
  }
  msiItems.sort((a, b) => b.monthly - a.monthly)
  const msiMonthly = Math.round(msiItems.reduce((s, i) => s + i.monthly, 0) * 100) / 100

  // Ahorro: promedio mensual de abonos a proyectos
  const ahorroMonthly = Math.round(((projectRows ?? []).reduce((s, p) => s + p.amount, 0) / 3) * 100) / 100

  const analysis = analyzeFinances({
    monthlyIncome, fijos, variables, diversionMonthly, ahorroMonthly, msiMonthly, msiItems,
  })

  const sevStyles: Record<string, string> = {
    over: 'border-red-200 bg-red-50',
    warn: 'border-amber-200 bg-amber-50',
    info: 'border-blue-200 bg-blue-50',
  }
  const sevText: Record<string, string> = {
    over: 'text-red-700', warn: 'text-amber-700', info: 'text-blue-700',
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header */}
      <div className="hidden md:block">
        <h1 className="text-2xl font-bold text-gray-900">Análisis financiero</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Tu gasto mensual contra guías de finanzas personales
        </p>
      </div>

      {/* Hero */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-gray-100">
          <div className="p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Ingreso/mes</p>
            <p className="text-lg md:text-xl font-bold text-gray-900 mt-1">{formatMXN(monthlyIncome)}</p>
          </div>
          <div className="p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Comprometido</p>
            <p className="text-lg md:text-xl font-bold text-orange-600 mt-1">{formatMXN(analysis.committedMonthly)}</p>
            <p className="text-xs text-gray-400">{analysis.committedPct.toFixed(0)}% del ingreso</p>
          </div>
          <div className={`p-4 ${analysis.freeMonthly < 0 ? 'bg-red-50' : 'bg-green-50'}`}>
            <p className={`text-xs font-medium uppercase tracking-wide ${analysis.freeMonthly < 0 ? 'text-red-400' : 'text-green-500'}`}>
              Margen libre
            </p>
            <p className={`text-lg md:text-xl font-bold mt-1 ${analysis.freeMonthly < 0 ? 'text-red-600' : 'text-green-700'}`}>
              {formatMXN(analysis.freeMonthly)}
            </p>
          </div>
        </div>
      </div>

      {/* Recomendaciones */}
      {analysis.recommendations.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-gray-700 text-sm px-1">Recomendaciones</h2>
          {analysis.recommendations.map((rec, i) => (
            <div key={i} className={`card p-4 border ${sevStyles[rec.severity]}`}>
              <p className={`text-sm font-semibold ${sevText[rec.severity]}`}>{rec.title}</p>
              <p className="text-xs text-gray-600 mt-1">{rec.detail}</p>
            </div>
          ))}
        </section>
      )}
      {analysis.recommendations.length === 0 && monthlyIncome > 0 && (
        <div className="card p-4 border border-green-200 bg-green-50">
          <p className="text-sm font-semibold text-green-700">Tus porcentajes están dentro de las guías 🎉</p>
          <p className="text-xs text-gray-600 mt-1">Todas las categorías respetan los topes recomendados y tu ahorro cumple el mínimo.</p>
        </div>
      )}

      {/* Regla 50/30/20: tres bloques */}
      {analysis.groups.map(g => {
        const groupColor = g.status === 'ok' ? 'bg-green-500' : g.status === 'warn' ? 'bg-amber-400' : 'bg-red-500'
        const groupText  = g.status === 'ok' ? 'text-green-600' : g.status === 'warn' ? 'text-amber-600' : 'text-red-600'
        return (
          <section key={g.key} className="card p-4 md:p-5 space-y-1">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 text-sm">{g.label}</h2>
              <span className="text-xs">
                <span className={`font-bold ${groupText}`}>{g.pct.toFixed(1)}%</span>
                <span className="text-gray-400"> / {g.key === 'ahorro_deudas' ? '' : 'máx '}{g.cap}%</span>
                <span className="text-gray-500 font-medium ml-2">{formatMXN(g.monthly)}/mes</span>
              </span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden relative">
              <div className={`h-full rounded-full ${groupColor}`} style={{ width: `${Math.min(g.pct, 100)}%` }} />
              <div className="absolute top-0 bottom-0 w-0.5 bg-gray-400/60" style={{ left: `${g.cap}%` }} />
            </div>
            <p className="text-[10px] text-gray-300 pb-1">{g.why}</p>
            {g.rows.length === 0 ? (
              <p className="text-xs text-gray-400">Sin movimientos en este bloque.</p>
            ) : (
              g.rows.map(row => <CategoryBucketRow key={row.key} bucket={row} informational />)
            )}
          </section>
        )
      })}

      {/* Total verificable */}
      <div className="card p-4 flex items-center justify-between text-sm font-bold text-gray-700">
        <span>Total (los 3 bloques)</span>
        <span>
          {analysis.groups.reduce((s, g) => s + g.pct, 0).toFixed(1)}%
          <span className="text-gray-400 font-medium ml-2">
            {formatMXN(analysis.groups.reduce((s, g) => s + g.monthly, 0))}/mes de {formatMXN(monthlyIncome)}
          </span>
        </span>
      </div>

      <p className="text-xs text-gray-300 px-1">
        Regla 50/30/20: Necesidades hasta 50% del ingreso, Deseos hasta 30%, y 20% para
        ahorro y pago de deudas. Diversión y ahorro usan el promedio real de los últimos
        3 meses; las compras a meses cuentan como deudas, no como gasto del bloque.
      </p>
    </div>
  )
}
