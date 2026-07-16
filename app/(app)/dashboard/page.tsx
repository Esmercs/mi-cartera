export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatMXN } from '@/lib/utils/currency'
import { formatMXDate, isOverdue, getCurrentPeriodDates, getOffsetPeriodDates, paydayForPeriodEnd } from '@/lib/utils/date-utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { PeriodSummary, InterPersonDebt, IncomeConfig, RecurringExpenseSplit, CardExpense } from '@/types/database'
import AddPeriodPaymentForm from '@/components/dashboard/add-period-payment-form'
import CollapsiblePaidGroup from '@/components/dashboard/collapsible-paid-group'
import SettleInternalDebtButton from '@/components/dashboard/settle-internal-debt-button'
import UnsettleInternalDebtButton from '@/components/dashboard/unsettle-internal-debt-button'
import DeletePeriodPaymentButton from '@/components/dashboard/delete-period-payment-button'
import AddIncomeForm from '@/components/dashboard/add-income-form'
import RegisterNextPaymentButton from '@/components/dashboard/register-next-payment-button'
import CollapsibleCardGroup, { type LinkedDebt } from '@/components/dashboard/collapsible-card-group'
import MarkDebtPaidButton from '@/components/shared/mark-debt-paid-button'
import PeriodSelector from '@/components/shared/period-selector'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { p?: string }
}) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const userId = session.user.id

  // Período actual
  const { start, end, label: periodLabel } = getCurrentPeriodDates()
  const periodDateStr = format(end, 'yyyy-MM-dd')

  // Buscar o crear la quincena actual
  let { data: period } = await supabase
    .from('periods')
    .select('*')
    .eq('owner_id', userId)
    .eq('period_date', periodDateStr)
    .single()

  if (!period) {
    // Obtener último ingreso registrado
    const { data: lastIncome } = await supabase
      .from('income_config')
      .select('amount')
      .eq('owner_id', userId)
      .order('valid_from', { ascending: false })
      .limit(1)
      .single() as { data: { amount: number } | null }

    const income = lastIncome?.amount ? lastIncome.amount / 2 : 0

    const { data: newPeriod } = await supabase
      .from('periods')
      .insert({
        owner_id: userId,
        period_date: periodDateStr,
        label: periodLabel,
        income,
        budget_fijos: income,
        budget_extra: 0,
      })
      .select()
      .single()

    period = newPeriod
  }

  // Quincena seleccionada — offset navegable (p=0 = actual, p=1 = siguiente, p=-1 = anterior, etc.)
  const periodOffset = parseInt(searchParams.p ?? '0') || 0
  const { start: nextStart, end: nextEnd, label: nextLabel, payDay: nextPayDay } = getOffsetPeriodDates(periodOffset)
  const nextPeriodStr = format(nextEnd, 'yyyy-MM-dd')
  const nextStartStr  = format(nextStart, 'yyyy-MM-dd')

  // Período visible: para quincenas pasadas se consulta su registro (solo lectura, no se crea);
  // para la actual y futuras se usa el período actual (comportamiento de siempre)
  let viewPeriod = period
  if (periodOffset < 0) {
    const { data: pastPeriod } = await supabase
      .from('periods')
      .select('*')
      .eq('owner_id', userId)
      .eq('period_date', nextPeriodStr)
      .single()
    viewPeriod = pastPeriod
  }
  const activePeriodId = (viewPeriod ?? period)?.id ?? ''

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  // Grupo 1: queries independientes en paralelo
  const [
    { data: summary },
    { data: payments },
    { data: msiExpenses },
    { data: debtsOwed },
    { data: debtsToCollect },
    { data: profile },
    { data: currentIncome },
    { data: dueInstallments },
    { data: nextDebts },
    { data: allProjections },
  ] = await Promise.all([
    supabase.from('period_summary').select('*').eq('id', viewPeriod?.id).single() as Promise<{ data: PeriodSummary | null }>,
    supabase.from('period_payments').select('*, cards(name)').eq('period_id', viewPeriod?.id ?? '').order('paid_at', { ascending: false }),
    supabase.from('card_expenses').select('*, cards(name), card_expense_installments(id, number, amount, due_period_date, is_paid)').eq('owner_id', userId).gt('months', 1) as Promise<{ data: CardExpense[] | null }>,
    supabase.from('inter_person_debts').select('*, creditor:profiles!creditor_id(display_name, full_name)').eq('debtor_id', userId).eq('is_paid', false) as Promise<{ data: InterPersonDebt[] | null }>,
    supabase.from('inter_person_debts').select('*, debtor:profiles!debtor_id(display_name, full_name), cards(name)').eq('creditor_id', userId).eq('is_paid', false) as Promise<{ data: InterPersonDebt[] | null }>,
    supabase.from('profiles').select('display_name').eq('id', userId).single(),
    supabase.from('income_config').select('amount, valid_from').eq('owner_id', userId).order('valid_from', { ascending: false }).limit(1).single() as Promise<{ data: IncomeConfig | null }>,
    // Cuotas del ledger de tarjetas que vencen en la quincena seleccionada
    supabase.from('card_expense_installments').select('*, expense:card_expenses(id, owner_id, concept, card_id, months, expense_type, cards(name))').eq('is_paid', false).eq('due_period_date', nextPeriodStr) as Promise<{ data: any[] | null }>,
    supabase.from('inter_person_debts').select('*, creditor:profiles!creditor_id(display_name)').eq('debtor_id', userId).eq('is_paid', false).gte('due_date', nextStartStr).lte('due_date', nextPeriodStr) as Promise<{ data: any[] | null }>,
    (supabase.from('projections') as any).select('*, cards(name)').eq('owner_id', userId).eq('is_paid', false).gte('projected_date', todayStr).order('projected_date', { ascending: true }),
  ])

  const isLalo      = (profile as any)?.display_name?.toLowerCase() === 'lalo'
  const myOwnership = isLalo ? 'lalo' : 'ale'

  // Grupo 2: gastos fijos + tarjetas + concepts compartidos + settlements en paralelo
  const [
    { data: nextFijosByDay },
    { data: nextFijosByDate },
    { data: allCards },
    { data: sharedConceptsRows },
    { data: settlementsRaw },
  ] = await Promise.all([
    supabase.from('recurring_expenses_split').select('*').eq('is_active', true).in('ownership', [myOwnership, 'shared']).or(`payment_day.eq.${nextPayDay},payment_day.eq.0,payment_day.is.null`).in('interval_type', ['quincenal', 'mensual']) as Promise<{ data: RecurringExpenseSplit[] | null }>,
    supabase.from('recurring_expenses_split').select('*').eq('is_active', true).in('ownership', [myOwnership, 'shared']).in('interval_type', ['bimestral', 'trimestral', 'anual', 'c/15 dias', 'c/21 dias']).gte('next_payment_date', nextStartStr).lte('next_payment_date', nextPeriodStr) as Promise<{ data: RecurringExpenseSplit[] | null }>,
    supabase.from('cards').select('id, name').eq('is_active', true),
    supabase.from('recurring_expenses_split').select('concept').eq('is_active', true).eq('ownership', 'shared') as Promise<{ data: { concept: string }[] | null }>,
    (supabase.from('internal_debt_settlements') as any).select('*').eq('period_date', nextPeriodStr) as Promise<{ data: any[] | null }>,
  ])
  const settlements = (settlementsRaw ?? []) as any[]
  const sharedConceptSet = new Set((sharedConceptsRows ?? []).map(r => r.concept))
  const cardNameMap = new Map((allCards ?? []).map(c => [c.id, c.name]))

  const nextFijos = [...(nextFijosByDay ?? []), ...(nextFijosByDate ?? [])]

  // Cuentas internas (gastos shared con paid_by lalo|ale) — esta quincena
  const otherOwnership = isLalo ? 'ale' : 'lalo'
  const otherName      = isLalo ? 'Ale' : 'Lalo'
  // Lookup: settlement por (recurring_expense_id, payer)
  const settlementMap = new Map<string, any>()
  for (const s of settlements) {
    settlementMap.set(`${s.recurring_expense_id}|${s.payer}`, s)
  }
  type InternalRow = {
    id: string
    concept: string
    amount: number
    settlement: any | null      // null si pendiente
  }
  const internalIOwe:   InternalRow[] = []
  const internalOwesMe: InternalRow[] = []
  for (const e of nextFijos) {
    if (e.ownership !== 'shared') continue
    if (e.paid_by === otherOwnership) {
      // Yo soy quien debe pagar mi parte → payer = myOwnership
      const s = settlementMap.get(`${e.id}|${myOwnership}`) ?? null
      internalIOwe.push({
        id: e.id,
        concept: e.concept,
        amount: isLalo ? e.lalo_amount : e.ale_amount,
        settlement: s,
      })
    } else if (e.paid_by === myOwnership) {
      // El otro debe pagarme su parte → payer = otherOwnership
      const s = settlementMap.get(`${e.id}|${otherOwnership}`) ?? null
      internalOwesMe.push({
        id: e.id,
        concept: e.concept,
        amount: isLalo ? e.ale_amount : e.lalo_amount,
        settlement: s,
      })
    }
  }
  const pendingIOwe   = internalIOwe.filter(x => !x.settlement)
  const paidIOwe      = internalIOwe.filter(x => x.settlement)
  const pendingOwesMe = internalOwesMe.filter(x => !x.settlement)
  const paidOwesMe    = internalOwesMe.filter(x => x.settlement)
  const totalIOwe     = pendingIOwe.reduce((s, x) => s + x.amount, 0)
  const totalOwesMe   = pendingOwesMe.reduce((s, x) => s + x.amount, 0)

  // Conceptos ya pagados en el período actual (para filtrar fijos pre-pagados)
  const paidKeys = new Set(
    (payments ?? []).map(p => `${p.concept}|${p.card_id ?? ''}`)
  )

  // Unificar en una lista ordenada por monto descendente
  type NextItem = {
    key: string; concept: string; amount: number; card: string | null
    type: 'fijo' | 'msi' | 'programado' | 'deuda'
    cardId: string | null; installmentId: string | null
    debtId: string | null; creditorName: string | null
    totalInstallments: number | null; paidInstallments: number; dueDate: string | null
    recurringExpenseId: string | null; intervalType: string | null; currentNextPaymentDate: string | null
  }
  const nextItems: NextItem[] = [
    // Cuotas del ledger de tarjetas (una exhibición y MSI) que vencen esta quincena
    ...((dueInstallments ?? []) as any[])
      .filter(i => i.expense?.owner_id === userId && i.expense?.expense_type === 'compra')
      .map(i => ({
        key: i.id as string, concept: i.expense.concept as string, amount: i.amount as number,
        card: i.expense.cards?.name ?? null,
        type: (i.expense.months > 1 ? 'msi' : 'programado') as 'msi' | 'programado',
        cardId: (i.expense.card_id ?? null) as string | null, installmentId: i.id as string,
        debtId: null, creditorName: null,
        totalInstallments: null, paidInstallments: 0, dueDate: null,
        recurringExpenseId: null, intervalType: null, currentNextPaymentDate: null,
      })),
    ...(nextFijos)
      .filter(e => !paidKeys.has(`${e.concept}|${e.card_id ?? ''}`))
      // Si es shared y lo paga el otro, no aparece en mi lista (queda como deuda interna)
      .filter(e => !(e.ownership === 'shared' && (e.paid_by === 'lalo' || e.paid_by === 'ale') && e.paid_by !== myOwnership))
      .map(e => {
      const isDateBased = ['bimestral', 'trimestral', 'anual', 'c/15 dias', 'c/21 dias'].includes(e.interval_type)
      const cardName = e.card_id ? (cardNameMap.get(e.card_id) ?? null) : null
      // Si shared y yo lo pago, debo el total; si shared y cada quien su parte, sólo mi parte
      const sharedFullPayer = e.ownership === 'shared' && e.paid_by === myOwnership
      const amount = e.ownership === 'shared'
        ? (sharedFullPayer ? e.total_amount : (isLalo ? e.lalo_amount : e.ale_amount))
        : e.total_amount
      return {
        key: e.id, concept: e.concept,
        amount,
        card: cardName, type: 'fijo' as const,
        cardId: e.card_id ?? null, installmentId: null,
        debtId: null, creditorName: null,
        totalInstallments: null, paidInstallments: 0, dueDate: null,
        recurringExpenseId: isDateBased ? e.id : null,
        intervalType: isDateBased ? e.interval_type : null,
        currentNextPaymentDate: isDateBased ? (e.next_payment_date ?? null) : null,
      }
    }),
    ...(nextDebts ?? []).map(d => ({
      key: d.id, concept: d.concept, amount: d.amount,
      card: null, type: 'deuda' as const,
      cardId: null, installmentId: null,
      debtId: d.id, creditorName: d.creditor?.display_name ?? null,
      totalInstallments: d.total_installments ?? null,
      paidInstallments: d.paid_installments ?? 0,
      dueDate: d.due_date ?? null,
      recurringExpenseId: null, intervalType: null, currentNextPaymentDate: null,
    })),
  ].sort((a, b) => b.amount - a.amount)

  // Agrupar por tarjeta (null = sin tarjeta)
  const cardGroupMap = new Map<string, { cardName: string; cardId: string; items: typeof nextItems }>()
  const noCardItems: typeof nextItems = []

  for (const item of nextItems) {
    if (item.cardId && item.card) {
      if (!cardGroupMap.has(item.cardId)) {
        cardGroupMap.set(item.cardId, { cardName: item.card, cardId: item.cardId, items: [] })
      }
      cardGroupMap.get(item.cardId)!.items.push(item)
    } else {
      noCardItems.push(item)
    }
  }
  const cardGroups = Array.from(cardGroupMap.values())


  // Agrupar pagos registrados: por tarjeta · gastos casa (shared sin tarjeta) · otros
  type PaidPayment = { id: string; concept: string; amount: number; payment_type: string }
  const paidByCard = new Map<string, PaidPayment[]>()
  const paidShared: PaidPayment[] = []
  const paidOther:  PaidPayment[] = []
  for (const p of (payments ?? [])) {
    const item: PaidPayment = { id: p.id, concept: p.concept, amount: p.amount, payment_type: p.payment_type }
    if (p.card_id) {
      if (!paidByCard.has(p.card_id)) paidByCard.set(p.card_id, [])
      paidByCard.get(p.card_id)!.push(item)
    } else if (sharedConceptSet.has(p.concept)) {
      paidShared.push(item)
    } else {
      paidOther.push(item)
    }
  }

  // MSIs activos desde el ledger: gastos a meses con cuotas pendientes
  const msiActive = (msiExpenses ?? []).flatMap(e => {
    const insts = e.card_expense_installments ?? []
    const unpaid = insts.filter(i => !i.is_paid)
      .sort((a, b) => (a.due_period_date ?? '9999').localeCompare(b.due_period_date ?? '9999'))
    if (!unpaid.length) return []
    const paidCount = insts.filter(i => i.is_paid).length
    return [{
      id: e.id,
      concept: e.concept,
      cardName: e.cards?.name ?? '—',
      monthly: unpaid[0].amount,
      currentMonth: Math.min(paidCount + 1, e.months),
      totalMonths: e.months,
      nextDate: unpaid[0].due_period_date,
    }]
  })
  const totalMSI = msiActive.reduce((sum, p) => sum + p.monthly, 0)
  // Lo que pesa en la quincena: para deudas a cuotas solo una mensualidad (d.amount);
  // para deudas sin cuotas, d.amount ya es el total
  const debtPending = (d: InterPersonDebt) => d.amount
  // Solo cuenta lo que vence en esta quincena (sin fecha o due_date <= fin de quincena);
  // las deudas con fecha posterior no se incluyen en el total ni en la lista.
  const dueThisPeriod = (d: InterPersonDebt) => !d.due_date || d.due_date <= nextPeriodStr
  const totalOwed       = (debtsOwed      ?? []).filter(dueThisPeriod).reduce((sum, d) => sum + debtPending(d), 0)
  const totalToCollect  = (debtsToCollect ?? []).filter(dueThisPeriod).reduce((sum, d) => sum + debtPending(d), 0)

  // Balance neto de esta quincena: lo que le debo menos lo que me debe.
  // > 0  → yo le debo a la otra persona; < 0 → la otra persona me debe.
  const netIOwe = (totalIOwe + totalOwed) - (totalOwesMe + totalToCollect)

  // Deudas de "me deben" agrupadas por tarjeta — solo las que vencen en esta quincena
  const debtsByCard = new Map<string, LinkedDebt[]>()
  for (const d of (debtsToCollect ?? []).filter(d => !d.due_date || d.due_date <= nextPeriodStr)) {
    const cid = (d as any).card_id
    if (!cid) continue
    const entry: LinkedDebt = {
      debtId:    d.id,
      concept:   d.concept,
      amount:    debtPending(d),
      debtorName: (d as any).debtor?.display_name ?? 'Deudor',
    }
    if (!debtsByCard.has(cid)) debtsByCard.set(cid, [])
    debtsByCard.get(cid)!.push(entry)
  }

  // Resumen calculado desde el ingreso vigente (no el guardado en el período)
  const ingresoQuincenal     = Math.round((currentIncome?.amount ?? 0) / 2)
  const totalPagado          = (payments ?? []).reduce((sum, p) => sum + p.amount, 0)

  // Proyecciones en la próxima quincena (se suman al estimado)
  const proximaProjections   = (allProjections ?? []).filter(
    (p: any) => p.projected_date >= nextStartStr && p.projected_date <= nextPeriodStr
  )
  const futureProjections    = (allProjections ?? []).filter(
    (p: any) => p.projected_date > nextPeriodStr
  )
  const totalProxProjections = proximaProjections.reduce((sum: number, p: any) => sum + p.amount, 0)

  const totalProximaQuincena = nextItems.reduce((sum, item) => sum + item.amount, 0) + totalProxProjections
  const totalGastos          = Math.max(totalPagado, totalProximaQuincena)
  const restante             = ingresoQuincenal - totalGastos

  // Deudas: solo las vencidas o que vencen en la próxima quincena, ordenadas por fecha
  const sortByDueDate = (a: InterPersonDebt, b: InterPersonDebt) => {
    if (!a.due_date && !b.due_date) return 0
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return a.due_date.localeCompare(b.due_date)
  }
  const visibleDebtsOwed = [...(debtsOwed ?? [])]
    .filter(dueThisPeriod)
    .sort(sortByDueDate)
  const hiddenDebtsOwed = (debtsOwed ?? []).length - visibleDebtsOwed.length

  const visibleDebtsToCollect = [...(debtsToCollect ?? [])]
    .filter(dueThisPeriod)
    .sort(sortByDueDate)
  const hiddenDebtsToCollect = (debtsToCollect ?? []).length - visibleDebtsToCollect.length

  const paidPct = ingresoQuincenal > 0
    ? Math.min(100, Math.round((totalPagado / ingresoQuincenal) * 100))
    : 0

  return (
    <div className="space-y-4 max-w-2xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 hidden md:block">Mi Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {format(nextStart, "d 'de' MMMM", { locale: es })} – {format(nextEnd, "d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
        <AddIncomeForm currentAmount={currentIncome?.amount ?? 0} />
      </div>

      {/* ── Balance hero ── */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-gray-100">
          {/* Ingreso */}
          <div className="p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Ingreso</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatMXN(ingresoQuincenal)}</p>
            {totalProximaQuincena > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                − {formatMXN(totalProximaQuincena)} gastos
              </p>
            )}
          </div>
          {/* Restante */}
          <div className={`p-4 ${restante < 0 ? 'bg-red-50' : 'bg-green-50'}`}>
            <p className={`text-xs font-medium uppercase tracking-wide ${restante < 0 ? 'text-red-400' : 'text-green-500'}`}>
              Restante
            </p>
            <p className={`text-2xl font-bold mt-1 ${restante < 0 ? 'text-red-600' : 'text-green-700'}`}>
              {formatMXN(restante)}
            </p>
            {restante < 0 && (
              <p className="text-xs text-red-400 mt-1">Déficit esta quincena</p>
            )}
          </div>
        </div>
        {/* Barra de progreso pagado */}
        {totalPagado > 0 && (
          <div className="px-4 pb-3 pt-0 border-t border-gray-50">
            <div className="flex justify-between text-xs text-gray-400 mb-1 mt-2">
              <span>Pagado {formatMXN(totalPagado)}</span>
              <span>{paidPct}% del ingreso</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-400 rounded-full transition-all"
                style={{ width: `${paidPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Métricas secundarias ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3.5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Pagado</p>
          <p className="text-lg font-bold text-orange-500 mt-1">{formatMXN(totalPagado)}</p>
        </div>
        <div className="card p-3.5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">MSI/mes</p>
          <p className="text-lg font-bold text-purple-600 mt-1">{formatMXN(totalMSI)}</p>
        </div>
      </div>

      {/* ── Esta quincena — header de navegación ── */}
      <div className="flex items-center gap-2 px-1">
        <h2 className="font-semibold text-gray-700 text-sm">
          {periodOffset === 0 ? 'Esta quincena' : periodOffset > 0 ? 'Próxima quincena' : 'Quincena pasada'}
        </h2>
        <PeriodSelector offset={periodOffset} label={nextLabel} />
        {nextItems.length > 0 && (
          <span className="ml-auto text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
            {formatMXN(nextItems.reduce((s, i) => s + i.amount, 0))}
          </span>
        )}
      </div>

      {nextItems.length === 0 ? (
        <p className="text-sm text-gray-400 px-1">Sin pagos programados.</p>
      ) : (
        <>
          {/* Tarjetas de crédito/débito */}
          {cardGroups.length > 0 && (
            <div className="card p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Tarjetas</p>
              {cardGroups.map(group => (
                <CollapsibleCardGroup
                  key={group.cardId}
                  cardId={group.cardId}
                  cardName={group.cardName}
                  items={group.items}
                  periodId={activePeriodId}
                  linkedDebts={debtsByCard.get(group.cardId)}
                />
              ))}
              <div className="pt-2 border-t border-gray-100 flex justify-between text-xs font-semibold text-gray-500">
                <span>Subtotal tarjetas</span>
                <span>{formatMXN(cardGroups.reduce((s, g) => s + g.items.reduce((si, i) => si + i.amount, 0), 0))}</span>
              </div>
            </div>
          )}

          {/* Gastos sin tarjeta */}
          {noCardItems.length > 0 && (
            <div className="card p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Gastos sin tarjeta</p>
              <div className="space-y-0">
                {noCardItems.map(item => (
                  <div key={item.key} className="flex items-center justify-between py-2.5 border-b last:border-0 gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 truncate font-medium">{item.concept}</p>
                      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-medium mt-0.5 ${
                        item.type === 'fijo'  ? 'bg-blue-50 text-blue-600' :
                        item.type === 'msi'   ? 'bg-purple-50 text-purple-600' :
                        item.type === 'deuda' ? 'bg-red-50 text-red-600' :
                        'bg-orange-50 text-orange-600'
                      }`}>
                        {item.type === 'fijo' ? 'Fijo' : item.type === 'msi' ? 'MSI' :
                         item.type === 'deuda' ? `→ ${item.creditorName ?? 'deuda'}` : 'Programado'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold text-gray-800">{formatMXN(item.amount)}</span>
                      {item.type === 'deuda' && item.debtId ? (
                        <MarkDebtPaidButton
                          debtId={item.debtId}
                          totalInstallments={item.totalInstallments}
                          paidInstallments={item.paidInstallments}
                          dueDate={item.dueDate}
                          concept={item.concept}
                          amount={item.amount}
                        />
                      ) : (
                        <RegisterNextPaymentButton
                          periodId={activePeriodId}
                          concept={item.concept}
                          amount={item.amount}
                          cardId={item.cardId}
                          type={item.type as 'fijo' | 'msi' | 'programado'}
                          installmentId={item.installmentId}
                          recurringExpenseId={item.recurringExpenseId}
                          intervalType={item.intervalType as any}
                          currentNextPaymentDate={item.currentNextPaymentDate}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-gray-100 flex justify-between text-xs font-semibold text-gray-500 mt-1">
                <span>Subtotal sin tarjeta</span>
                <span>{formatMXN(noCardItems.reduce((s, i) => s + i.amount, 0))}</span>
              </div>
            </div>
          )}

          {/* Total general próxima quincena */}
          <div className="flex justify-between items-center px-1 py-1">
            <span className="text-sm font-bold text-gray-700">Total estimado</span>
            <span className="text-sm font-bold text-gray-900">{formatMXN(nextItems.reduce((s, i) => s + i.amount, 0))}</span>
          </div>
        </>
      )}

      {/* ── Cuentas con {otherName}: recurring shared + inter-person debts unificados ── */}
      {(internalIOwe.length > 0 || internalOwesMe.length > 0 || visibleDebtsOwed.length > 0 || visibleDebtsToCollect.length > 0) && (
        <div className="space-y-3">
        {/* Balance neto de esta quincena */}
        <div className={`card p-4 flex items-center justify-between ${
          Math.abs(netIOwe) < 0.01 ? 'bg-gray-50' : netIOwe > 0 ? 'bg-red-50' : 'bg-green-50'
        }`}>
          <span className="text-sm font-semibold text-gray-700">Balance neto</span>
          {Math.abs(netIOwe) < 0.01 ? (
            <span className="text-sm font-bold text-gray-600">Están a mano 🎉</span>
          ) : netIOwe > 0 ? (
            <span className="text-sm font-bold text-red-600">
              Le debes a {otherName} {formatMXN(netIOwe)}
            </span>
          ) : (
            <span className="text-sm font-bold text-green-700">
              {otherName} te debe {formatMXN(-netIOwe)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Le debo a {otherName} */}
          {(internalIOwe.length > 0 || visibleDebtsOwed.length > 0) && (
            <div className="card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-red-600">Le debo a {otherName}</h2>
                <span className="text-sm font-bold text-red-600">
                  {formatMXN(totalIOwe + totalOwed)}
                </span>
              </div>
              <div className="space-y-0">
                {pendingIOwe.length > 0 && (
                  <>
                    {visibleDebtsOwed.length > 0 && (
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide pt-1 pb-0.5">Gastos casa</p>
                    )}
                    {pendingIOwe.map(x => (
                      <div key={x.id} className="flex justify-between items-center py-2 border-b last:border-0 gap-2">
                        <p className="text-sm text-gray-800 truncate flex-1">{x.concept}</p>
                        <span className="text-sm font-semibold text-red-500 shrink-0">{formatMXN(x.amount)}</span>
                        <SettleInternalDebtButton
                          recurringExpenseId={x.id}
                          periodDate={nextPeriodStr}
                          payer={myOwnership as 'lalo' | 'ale'}
                          amount={x.amount}
                        />
                      </div>
                    ))}
                  </>
                )}
                {visibleDebtsOwed.length > 0 && (
                  <>
                    {pendingIOwe.length > 0 && (
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide pt-2 pb-0.5">Gastos personales</p>
                    )}
                    {visibleDebtsOwed.map(d => (
                      <div key={d.id} className="py-2 border-b last:border-0">
                        <div className="flex justify-between items-start gap-2">
                          <p className="text-sm text-gray-800 font-medium truncate flex-1">{d.concept}</p>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-semibold text-red-500">
                              {formatMXN(d.amount)}
                            </span>
                            <MarkDebtPaidButton
                              debtId={d.id}
                              totalInstallments={d.total_installments ?? null}
                              paidInstallments={d.paid_installments ?? 0}
                              dueDate={d.due_date ?? null}
                              concept={d.concept}
                              amount={d.amount}
                            />
                          </div>
                        </div>
                        {d.total_installments && (
                          <p className="text-xs text-purple-500 mt-0.5">
                            {d.paid_installments}/{d.total_installments} cuotas · restan {formatMXN(d.amount * (d.total_installments! - d.paid_installments))}
                          </p>
                        )}
                        {d.due_date && (
                          <p className={`text-xs mt-0.5 ${isOverdue(d.due_date) ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                            {isOverdue(d.due_date) ? '⚠ ' : ''}Vence {formatMXDate(d.due_date)}
                          </p>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
              {hiddenDebtsOwed > 0 && (
                <a href="/shared" className="block text-xs text-gray-400 hover:text-gray-600 text-center pt-1">
                  + {hiddenDebtsOwed} más con fecha posterior →
                </a>
              )}
              {(paidIOwe.length > 0 || paidOther.length > 0) && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Pagados</p>
                  {paidIOwe.length > 0 && (
                    <>
                      {paidOther.length > 0 && (
                        <p className="text-[10px] text-gray-300 uppercase tracking-wide mt-1 mb-0.5">Gastos casa</p>
                      )}
                      {paidIOwe.map(x => (
                        <div key={x.id} className="flex justify-between items-center py-1.5 gap-2 text-gray-400">
                          <p className="text-xs truncate flex-1 line-through">{x.concept}</p>
                          <span className="text-xs shrink-0">{formatMXN(x.amount)}</span>
                          <UnsettleInternalDebtButton settlementId={x.settlement.id} />
                        </div>
                      ))}
                    </>
                  )}
                  {paidOther.length > 0 && (
                    <>
                      {paidIOwe.length > 0 && (
                        <p className="text-[10px] text-gray-300 uppercase tracking-wide mt-2 mb-0.5">Gastos personales</p>
                      )}
                      {paidOther.map(p => (
                        <div key={p.id} className="flex justify-between items-center py-1.5 gap-2 text-gray-400">
                          <p className="text-xs truncate flex-1 line-through">{p.concept}</p>
                          <span className="text-xs shrink-0">{formatMXN(p.amount)}</span>
                          <DeletePeriodPaymentButton paymentId={p.id} />
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* {otherName} me debe */}
          {(internalOwesMe.length > 0 || visibleDebtsToCollect.length > 0) && (
            <div className="card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-green-700">{otherName} me debe</h2>
                <span className="text-sm font-bold text-green-700">
                  {formatMXN(totalOwesMe + totalToCollect)}
                </span>
              </div>
              <div className="space-y-0">
                {pendingOwesMe.length > 0 && (
                  <>
                    {visibleDebtsToCollect.length > 0 && (
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide pt-1 pb-0.5">Gastos casa</p>
                    )}
                    {pendingOwesMe.map(x => (
                      <div key={x.id} className="flex justify-between items-center py-2 border-b last:border-0">
                        <p className="text-sm text-gray-800 truncate">{x.concept}</p>
                        <span className="text-sm font-semibold text-green-600 shrink-0">{formatMXN(x.amount)}</span>
                      </div>
                    ))}
                  </>
                )}
                {visibleDebtsToCollect.length > 0 && (
                  <>
                    {pendingOwesMe.length > 0 && (
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide pt-2 pb-0.5">Gastos personales</p>
                    )}
                    {visibleDebtsToCollect.map(d => (
                      <div key={d.id} className="py-2 border-b last:border-0">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-800 font-medium truncate">{d.concept}</p>
                            <p className="text-xs text-gray-400">{(d as any).debtor?.display_name}</p>
                          </div>
                          <span className="text-sm font-semibold text-green-600 shrink-0">
                            {formatMXN(d.amount)}
                          </span>
                        </div>
                        {d.total_installments && (
                          <p className="text-xs text-purple-500 mt-0.5">
                            {d.paid_installments}/{d.total_installments} cuotas · restan {formatMXN(d.amount * (d.total_installments! - d.paid_installments))}
                          </p>
                        )}
                        {d.due_date && (
                          <p className={`text-xs mt-0.5 ${isOverdue(d.due_date) ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                            {isOverdue(d.due_date) ? '⚠ ' : ''}Vence {formatMXDate(d.due_date)}
                          </p>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
              {hiddenDebtsToCollect > 0 && (
                <a href="/shared" className="block text-xs text-gray-400 hover:text-gray-600 text-center pt-1">
                  + {hiddenDebtsToCollect} más con fecha posterior →
                </a>
              )}
              {paidOwesMe.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{otherName} ya pagó</p>
                  <p className="text-[10px] text-gray-300 uppercase tracking-wide mt-1 mb-0.5">Gastos casa</p>
                  {paidOwesMe.map(x => (
                    <div key={x.id} className="flex justify-between items-center py-1.5 gap-2 text-gray-400">
                      <p className="text-xs truncate flex-1 line-through">{x.concept}</p>
                      <span className="text-xs shrink-0">{formatMXN(x.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      )}

      {/* ── Pagos registrados de la quincena (agrupados) ── */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 text-sm">
            {periodOffset < 0 ? `Pagado · ${nextLabel}` : 'Ya pagado esta quincena'}
          </h2>
          <div className="flex items-center gap-2">
            {totalPagado > 0 && (
              <span className="text-xs font-semibold text-gray-500">{formatMXN(totalPagado)}</span>
            )}
            <AddPeriodPaymentForm periodId={activePeriodId} />
          </div>
        </div>

        {(payments?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-400">Sin pagos registrados esta quincena.</p>
        ) : (
          <div className="space-y-2">
            {Array.from(paidByCard.entries()).map(([cardId, items]) => (
              <CollapsiblePaidGroup
                key={cardId}
                label={cardNameMap.get(cardId) ?? 'Tarjeta'}
                payments={items}
              />
            ))}
            {paidShared.length > 0 && (
              <CollapsiblePaidGroup label="Gastos casa" payments={paidShared} />
            )}
          </div>
        )}
      </div>

      {/* ── MSIs activos (del ledger de tarjetas) ── */}
      {msiActive.length > 0 && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 text-sm">Meses sin intereses</h2>
            <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-medium">
              {formatMXN(totalMSI)}/mes
            </span>
          </div>
          <div className="space-y-0">
            {msiActive.map(plan => (
              <div key={plan.id} className="flex items-center justify-between py-2.5 border-b last:border-0">
                <div className="min-w-0 flex-1 mr-3">
                  <p className="text-sm font-medium text-gray-800 truncate">{plan.concept}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {plan.cardName} · cuota {plan.currentMonth}/{plan.totalMonths}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-gray-800">{formatMXN(plan.monthly)}</p>
                  <p className={`text-xs mt-0.5 ${isOverdue(paydayForPeriodEnd(plan.nextDate)) ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                    {formatMXDate(paydayForPeriodEnd(plan.nextDate))}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


    </div>
  )
}

function SummaryCard({
  label, value, color, subtitle,
}: {
  label: string
  value: string
  color: 'blue' | 'green' | 'orange' | 'purple' | 'red'
  subtitle?: string
}) {
  const colors = {
    blue:   'bg-blue-50 text-blue-700',
    green:  'bg-green-50 text-green-700',
    orange: 'bg-orange-50 text-orange-700',
    purple: 'bg-purple-50 text-purple-700',
    red:    'bg-red-50 text-red-700',
  }
  return (
    <div className={`card p-3 md:p-4 ${colors[color]}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-lg md:text-xl font-bold mt-0.5">{value}</p>
      {subtitle && <p className="text-xs opacity-60 mt-0.5">{subtitle}</p>}
    </div>
  )
}
