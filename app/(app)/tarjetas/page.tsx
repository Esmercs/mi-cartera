export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatMXN } from '@/lib/utils/currency'
import { formatMXDate, getCurrentPeriodDates, paydayForPeriodEnd } from '@/lib/utils/date-utils'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Card, CardExpense, CardExpenseInstallment } from '@/types/database'
import AddExpenseForm from '@/components/tarjetas/add-expense-form'
import AddCardForm from '@/components/tarjetas/add-card-form'
import DeleteCardButton from '@/components/tarjetas/delete-card-button'
import AdjustBalanceForm from '@/components/tarjetas/adjust-balance-form'
import CardExpensesGroup, { type ExpenseRow } from '@/components/tarjetas/card-expenses-group'
import { materializeCardCharges } from '@/lib/utils/materialize-charges'
import PayInstallmentButton from '@/components/tarjetas/pay-installment-button'

export default async function TarjetasPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const userId = session.user.id

  const { data: profile } = await supabase
    .from('profiles').select('display_name').eq('id', userId).single()
  const isLalo = (profile as any)?.display_name?.toLowerCase() === 'lalo'
  const ownership = isLalo ? 'lalo' : 'ale'
  const partnerName = isLalo ? 'Ale' : 'Lalo'

  // Materializar cargos domiciliados cuya fecha de cobro ya llegó
  await materializeCardCharges(supabase as any, ownership, userId)

  const [{ data: cards }, { data: expenses }, { data: cardDebts }] = await Promise.all([
    supabase.from('cards').select('*')
      .in('ownership', [ownership, 'shared'])
      .eq('is_active', true)
      .order('name') as unknown as Promise<{ data: Card[] | null }>,
    // Sin filtro de owner: RLS regresa mis gastos + los de tarjetas compartidas
    supabase.from('card_expenses')
      .select('*, cards(name), card_expense_installments(*)')
      .order('created_at', { ascending: false }) as unknown as Promise<{ data: CardExpense[] | null }>,
    // Deudas entre personas cargadas a una de mis tarjetas (yo soy el acreedor)
    supabase.from('inter_person_debts')
      .select('*, debtor:profiles!debtor_id(display_name)')
      .eq('creditor_id', userId)
      .eq('is_paid', false)
      .not('card_id', 'is', null) as unknown as Promise<{ data: any[] | null }>,
  ])

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  // Quincena en curso: lo que se paga con el pago actual (día 15 o fin de mes)
  const { end: currentEnd } = getCurrentPeriodDates()
  const currentPeriodStr = format(currentEnd, 'yyyy-MM-dd')
  const currentPayday = paydayForPeriodEnd(currentPeriodStr)
  const currentLabel = currentPayday
    ? format(parseISO(currentPayday), "d 'de' MMMM", { locale: es })
    : ''

  // ── Armar filas por gasto con datos derivados ──
  type FullRow = ExpenseRow & {
    cardName: string
    purchaseDate: string
    createdAt: string
  }
  const rows: FullRow[] = (expenses ?? []).map(e => {
    const insts: CardExpenseInstallment[] = [...(e.card_expense_installments ?? [])]
      .sort((a, b) => a.number - b.number || (a.due_period_date ?? '9999').localeCompare(b.due_period_date ?? '9999'))
    const unpaid = insts.filter(i => !i.is_paid)
      .sort((a, b) => (a.due_period_date ?? '9999').localeCompare(b.due_period_date ?? '9999'))
    const remaining = Math.round(unpaid.reduce((s, i) => s + i.amount, 0) * 100) / 100
    const paidInsts = insts.filter(i => i.is_paid)
    const next = e.expense_type === 'compra' ? (unpaid[0] ?? null) : null
    return {
      id: e.id,
      concept: e.concept,
      category: (e as any).category ?? 'otros',
      months: e.months,
      totalAmount: e.total_amount,
      remaining,
      paidCount: paidInsts.length,
      isShared: e.is_shared,
      sharedPct: e.shared_pct,
      expenseType: e.expense_type,
      isDomiciliado: e.source?.startsWith('recurring-') ?? false,
      mine: e.owner_id === userId,
      // Vencida = ya pasó su día de pago (no el fin de la quincena)
      overdue: !!next?.due_period_date && (paydayForPeriodEnd(next.due_period_date) ?? '9999') < todayStr,
      interPersonDebtId: e.inter_person_debt_id,
      hasPaidInstallments: paidInsts.length > 0,
      nextInstallment: next ? { id: next.id, amount: next.amount, due: next.due_period_date } : null,
      cardId: e.card_id,
      cardName: e.cards?.name ?? 'Sin tarjeta',
      purchaseDate: e.purchase_date,
      createdAt: e.created_at,
    }
  })

  const active = rows.filter(r => Math.abs(r.remaining) >= 0.01)
  const history = rows.filter(r => Math.abs(r.remaining) < 0.01 && r.expenseType === 'compra')

  // ── Agrupar por tarjeta ──
  const groupMap = new Map<string, { cardName: string; card: Card | null; rows: FullRow[] }>()
  for (const card of cards ?? []) {
    groupMap.set(card.id, { cardName: card.name, card, rows: [] })
  }
  const noCardRows: FullRow[] = []
  for (const r of active) {
    if (r.cardId && groupMap.has(r.cardId)) groupMap.get(r.cardId)!.rows.push(r)
    else if (r.cardId) {
      groupMap.set(r.cardId, { cardName: r.cardName, card: null, rows: [r] })
    } else noCardRows.push(r)
  }

  // Deudas con tarjeta que NO nacieron de un gasto compartido del ledger
  // (esas ya están contadas en su card_expense — evitar doble conteo)
  const linkedDebtIds = new Set((expenses ?? []).map(e => e.inter_person_debt_id).filter(Boolean))
  const receivablesByCard = new Map<string, {
    id: string; concept: string; debtorName: string; pending: number
    cuotasLabel: string | null; totalInstallments: number | null; paidInstallments: number
    dueDate: string | null; amount: number
  }[]>()
  for (const d of cardDebts ?? []) {
    if (!d.card_id || linkedDebtIds.has(d.id) || !groupMap.has(d.card_id)) continue
    const pending = d.total_installments
      ? Math.round(d.amount * (d.total_installments - (d.paid_installments ?? 0)) * 100) / 100
      : d.amount
    if (pending < 0.01) continue
    if (!receivablesByCard.has(d.card_id)) receivablesByCard.set(d.card_id, [])
    receivablesByCard.get(d.card_id)!.push({
      id: d.id,
      concept: d.concept,
      debtorName: d.debtor?.display_name ?? 'Deudor',
      pending,
      cuotasLabel: d.total_installments
        ? `${d.paid_installments ?? 0}/${d.total_installments} cuotas · ${formatMXN(d.amount)}/mes`
        : null,
      totalInstallments: d.total_installments ?? null,
      paidInstallments: d.paid_installments ?? 0,
      dueDate: d.due_date ?? null,
      amount: d.amount,
    })
  }

  const groups = Array.from(groupMap.entries()).map(([cardId, g]) => {
    const receivables = receivablesByCard.get(cardId) ?? []
    const receivableTotal = receivables.reduce((s, r) => s + r.pending, 0)
    return {
      ...g,
      receivables,
      balance: Math.round((g.rows.reduce((s, r) => s + r.remaining, 0) + receivableTotal) * 100) / 100,
    }
  })

  const totalDebt = Math.round(groups.reduce((s, g) => s + g.balance, 0) * 100) / 100
  const totalLimit = groups.reduce((s, g) => s + (g.card?.card_type === 'credit' ? g.card.credit_limit : 0), 0)
  const totalUsedPct = totalLimit > 0 ? Math.round((totalDebt / totalLimit) * 100) : null

  // ── Proyección: cuotas que vencen la próxima quincena + vencidas ──
  const allUnpaid = active.flatMap(r =>
    r.nextInstallment && r.expenseType === 'compra'
      ? [{ row: r, inst: r.nextInstallment }]
      : []
  )
  const nextQuincena = allUnpaid.filter(x => x.inst.due === currentPeriodStr)
  const totalNextQuincena = Math.round(nextQuincena.reduce((s, x) => s + x.inst.amount, 0) * 100) / 100
  const overdueItems = allUnpaid.filter(x =>
    x.inst.due && x.inst.due !== currentPeriodStr
    && (paydayForPeriodEnd(x.inst.due) ?? '9999') < todayStr)

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header — desktop */}
      <div className="hidden md:flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tarjetas</h1>
          <p className="text-gray-500 text-sm mt-0.5">Gastos de tarjeta — el saldo se calcula solo, cada peso rastreable</p>
        </div>
        <AddExpenseForm />
      </div>

      {/* Header — mobile */}
      <div className="flex items-center justify-between md:hidden">
        <p className="text-xs text-gray-400">Deuda total: {formatMXN(totalDebt)}</p>
        <AddExpenseForm />
      </div>

      {/* ── Hero: totales ── */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-gray-100">
          <div className="p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Deuda total</p>
            <p className={`text-2xl font-bold mt-1 ${totalDebt > 0 ? 'text-red-600' : 'text-gray-800'}`}>
              {formatMXN(totalDebt)}
            </p>
            {totalUsedPct !== null && (
              <p className="text-xs text-gray-400 mt-1">{totalUsedPct}% del crédito disponible</p>
            )}
          </div>
          <div className="p-4 bg-blue-50/50">
            <p className="text-xs font-medium text-blue-400 uppercase tracking-wide">Esta quincena</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">{formatMXN(totalNextQuincena)}</p>
            <p className="text-xs text-gray-400 mt-1">pago del {currentLabel}</p>
          </div>
        </div>
      </div>

      {/* ── Vencidas ── */}
      {overdueItems.length > 0 && (
        <section className="card p-4 space-y-2 border border-red-100 bg-red-50/50">
          <h2 className="font-semibold text-red-600 text-sm">⚠ Cuotas vencidas</h2>
          {overdueItems.map(({ row, inst }) => (
            <div key={inst.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-red-100 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{row.concept}</p>
                <p className="text-xs text-red-500">
                  {row.cardName} · venció {formatMXDate(paydayForPeriodEnd(inst.due))}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold text-gray-800">{formatMXN(inst.amount)}</span>
                {row.mine && (
                  <PayInstallmentButton
                    installmentId={inst.id}
                    concept={row.concept}
                    amount={inst.amount}
                    cuotaLabel={row.months > 1 ? `cuota ${Math.min(row.paidCount + 1, row.months)}/${row.months}` : null}
                  />
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── Tarjetas ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-semibold text-gray-800 text-sm">Mis tarjetas</h2>
          <AddCardForm />
        </div>
        {groups.length === 0 ? (
          <div className="card p-4 text-center">
            <p className="text-sm text-gray-400">Sin tarjetas registradas.</p>
          </div>
        ) : (
          groups.map(g => (
            <CardExpensesGroup
              key={g.card?.id ?? g.cardName}
              cardName={g.cardName}
              balance={g.balance}
              creditLimit={g.card?.card_type === 'credit' ? g.card.credit_limit : 0}
              expenses={g.rows}
              partnerName={partnerName}
              receivables={g.receivables}
              headerActions={g.card ? (
                <>
                  <AdjustBalanceForm
                    cardId={g.card.id}
                    cardName={g.card.name}
                    derivedBalance={g.balance}
                    creditLimit={g.card.credit_limit}
                  />
                  <DeleteCardButton id={g.card.id} name={g.card.name} />
                </>
              ) : undefined}
            />
          ))
        )}

        {noCardRows.length > 0 && (
          <CardExpensesGroup
            cardName="Sin tarjeta / efectivo"
            balance={Math.round(noCardRows.reduce((s, r) => s + r.remaining, 0) * 100) / 100}
            creditLimit={0}
            expenses={noCardRows}
            partnerName={partnerName}
          />
        )}
      </section>

      {/* ── Historial (pagados por completo) ── */}
      {history.length > 0 && (
        <details className="card p-4">
          <summary className="text-sm font-semibold text-gray-500 cursor-pointer">
            Historial · {history.length} gasto{history.length !== 1 ? 's' : ''} liquidado{history.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-1 opacity-60">
            {history.map(r => (
              <div key={r.id} className="flex items-center justify-between py-1.5 border-b last:border-0 gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <span className="text-gray-600 line-through">{r.concept}</span>
                  <span className="text-gray-400 text-xs ml-2">
                    {r.cardName}{r.months > 1 ? ` · ${r.months} meses` : ''} · {formatMXDate(r.purchaseDate)}
                  </span>
                </div>
                <span className="text-gray-400 shrink-0">{formatMXN(r.totalAmount)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
