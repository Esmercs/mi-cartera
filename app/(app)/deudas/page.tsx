import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatMXN } from '@/lib/utils/currency'
import { formatMXDate, getNextPeriodDates, isOverdue } from '@/lib/utils/date-utils'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Card, ScheduledPayment } from '@/types/database'
import AddScheduledPaymentForm from '@/components/deudas/add-scheduled-payment-form'
import PayScheduledButton from '@/components/deudas/pay-scheduled-button'
import DeleteScheduledButton from '@/components/deudas/delete-scheduled-button'
import UpdateCardBalanceForm from '@/components/deudas/update-card-balance-form'
import AddCardForm from '@/components/deudas/add-card-form'
import DeleteCardButton from '@/components/deudas/delete-card-button'

export default async function DeudasPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const userId = session.user.id

  const { data: profile } = await supabase
    .from('profiles').select('display_name').eq('id', userId).single()

  const isLalo = profile?.display_name?.toLowerCase() === 'lalo'
  const ownership = isLalo ? 'lalo' : 'ale'

  // Tarjetas del usuario con saldo
  const { data: cards } = await supabase
    .from('cards')
    .select('*')
    .in('ownership', [ownership, 'shared'])
    .eq('is_active', true)
    .order('name') as { data: Card[] | null }

  // Pagos programados (todos, ordenados por fecha y tipo)
  const { data: allPayments } = await supabase
    .from('scheduled_payments')
    .select('*, cards(name)')
    .eq('owner_id', userId)
    .order('period_date', { ascending: true })
    .order('payment_type', { ascending: true }) as { data: ScheduledPayment[] | null }

  const { end: nextEnd } = getNextPeriodDates()
  const nextPeriodStr = format(nextEnd, 'yyyy-MM-dd')

  const totalDebt = (cards ?? []).reduce((s, c) => s + c.current_balance, 0)

  // Agrupar pagos por quincena
  const periodMap = new Map<string, ScheduledPayment[]>()
  for (const p of allPayments ?? []) {
    if (!periodMap.has(p.period_date)) periodMap.set(p.period_date, [])
    periodMap.get(p.period_date)!.push(p)
  }
  const periods = Array.from(periodMap.entries()).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header — desktop */}
      <div className="hidden md:flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deudas</h1>
          <p className="text-gray-500 text-sm mt-0.5">Saldos de tarjetas y pagos programados</p>
        </div>
        <AddScheduledPaymentForm defaultPeriodDate={nextPeriodStr} />
      </div>

      {/* Header — mobile */}
      <div className="flex items-center justify-between md:hidden">
        <p className="text-xs text-gray-400">Deuda total: {formatMXN(totalDebt)}</p>
        <AddScheduledPaymentForm defaultPeriodDate={nextPeriodStr} />
      </div>

      {/* Tarjetas con saldo */}
      <section className="card p-4 md:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 text-sm">Deuda en tarjetas</h2>
          <div className="flex items-center gap-3">
            <AddCardForm />
            <span className="text-sm font-bold text-red-600">{formatMXN(totalDebt)}</span>
          </div>
        </div>

        {!cards?.length ? (
          <p className="text-sm text-gray-400">Sin tarjetas registradas.</p>
        ) : (
          <div className="space-y-2">
            {cards.map(card => (
              <div key={card.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800">{card.name}</p>
                  {card.last_four && (
                    <p className="text-xs text-gray-400">···· {card.last_four}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-sm font-bold ${card.current_balance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {formatMXN(card.current_balance)}
                  </span>
                  <UpdateCardBalanceForm
                    cardId={card.id}
                    cardName={card.name}
                    currentBalance={card.current_balance}
                  />
                  <DeleteCardButton id={card.id} name={card.name} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pagos programados por quincena */}
      {periods.length === 0 ? (
        <div className="card p-4 text-center">
          <p className="text-sm text-gray-400">Sin pagos programados.</p>
          <p className="text-xs text-gray-300 mt-1">Agrega los pagos que tienes planeados para cada quincena.</p>
        </div>
      ) : (
        periods.map(([periodDate, payments]) => {
          const date = parseISO(periodDate)
          const label = format(date, "d 'de' MMMM yyyy", { locale: es })
          const totalFijos = payments.filter(p => p.payment_type === 'fijo').reduce((s, p) => s + p.amount, 0)
          const totalExtra = payments.filter(p => p.payment_type === 'extra').reduce((s, p) => s + p.amount, 0)
          const pending = payments.filter(p => !p.is_paid)
          const paid = payments.filter(p => p.is_paid)
          const isPast = isOverdue(periodDate)

          return (
            <section key={periodDate} className="card p-4 md:p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-gray-800 text-sm">{label}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Fijos: {formatMXN(totalFijos)}
                    {totalExtra > 0 && <> · Extra: {formatMXN(totalExtra)}</>}
                    {' '}· <span className="font-medium text-gray-600">Total: {formatMXN(totalFijos + totalExtra)}</span>
                  </p>
                </div>
                {isPast && pending.length > 0 && (
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full shrink-0">
                    {pending.length} pendiente{pending.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Pendientes */}
              {pending.length > 0 && (
                <div className="space-y-1">
                  {pending.map(p => (
                    <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0 gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.concept}</p>
                        <p className="text-xs text-gray-400">
                          {(p as any).cards?.name ?? 'Sin tarjeta'}
                          {p.payment_type === 'extra' && (
                            <span className="ml-1.5 bg-orange-100 text-orange-600 text-[10px] px-1.5 rounded">extra</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold text-gray-800">{formatMXN(p.amount)}</span>
                        <PayScheduledButton
                          paymentId={p.id}
                          concept={p.concept}
                          amount={p.amount}
                          cardId={p.card_id}
                        />
                        <DeleteScheduledButton id={p.id} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagados */}
              {paid.length > 0 && (
                <div className="space-y-1 opacity-50">
                  {paid.map(p => (
                    <div key={p.id} className="flex items-center justify-between py-1.5 border-b last:border-0 gap-2">
                      <p className="text-sm text-gray-500 line-through truncate flex-1">{p.concept}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm text-gray-400 line-through">{formatMXN(p.amount)}</span>
                        <DeleteScheduledButton id={p.id} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}
