import type { SupabaseClient } from '@supabase/supabase-js'
import { nextPaymentDate, periodEndForDate } from './date-utils'
import { payInstallment } from './pay-installment'
import type { IntervalType } from '@/types/database'

// Refleja en el ledger de tarjetas el pago de un fijo domiciliado a tarjeta,
// para que la DEUDA de la tarjeta baje al pagarlo (no solo el rastreo de efectivo).
//
// Estrategia:
//  1. Si el cargo ya se materializó y pesa como deuda (cuota SIN pagar de este
//     gasto recurrente en el ledger), se liquida la más antigua → la deuda baja.
//  2. Si aún no se materializa (pago adelantado), se materializa el próximo cargo
//     programado directamente como PAGADO y se recorre next_charge_date, para que
//     el materializador automático no lo vuelva a crear como deuda (evita doble
//     conteo). Usa source = `recurring-${fecha}` igual que materialize-charges,
//     de modo que el índice único (source, source_id) protege contra duplicados.
//
// Regresa true si tocó el ledger, false si no aplicaba (fijo sin tarjeta o sin
// mecanismo de cargo domiciliado) o si la escritura fue bloqueada por RLS.
export async function settleRecurringCardCharge(
  supabase: SupabaseClient,
  recurringExpenseId: string,
  paid: number,
): Promise<boolean> {
  // ── 1. ¿Ya hay una cuota pendiente materializada de este domiciliado? ──
  const { data: existing } = await supabase
    .from('card_expenses')
    .select('id, card_expense_installments(id, is_paid, due_period_date, amount)')
    .eq('source_id', recurringExpenseId)

  const unpaid = ((existing ?? []) as any[])
    .flatMap(e => e.card_expense_installments ?? [])
    .filter((i: any) => !i.is_paid)
    .sort((a: any, b: any) =>
      (a.due_period_date ?? '9999').localeCompare(b.due_period_date ?? '9999'))

  if (unpaid.length > 0) {
    // Liquidar la cuota más antigua → la deuda de la tarjeta baja
    return payInstallment(supabase, unpaid[0].id, paid)
  }

  // ── 2. Pago adelantado: materializar el próximo cargo YA pagado ──
  const { data: re } = await supabase
    .from('recurring_expenses')
    .select('concept, card_id, total_amount, interval_type, next_charge_date')
    .eq('id', recurringExpenseId)
    .single()

  const r = re as any
  // Sin tarjeta o sin fecha de cargo domiciliado → no hay deuda de tarjeta que mover
  if (!r || !r.card_id || !r.next_charge_date) return false

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const chargeDate: string = r.next_charge_date
  const { data: expense, error } = await supabase
    .from('card_expenses')
    .insert({
      owner_id:      user.id,
      card_id:       r.card_id,
      concept:       r.concept,
      total_amount:  r.total_amount,
      purchase_date: chargeDate,
      months:        1,
      expense_type:  'compra',
      source:        `recurring-${chargeDate}`,
      source_id:     recurringExpenseId,
      notes:         'Cargo domiciliado (pagado por adelantado)',
    })
    .select('id')
    .single()

  // 23505 = ya materializado por otra carga; el índice único lo protege
  if (error || !expense) return false

  await supabase.from('card_expense_installments').insert({
    expense_id:      (expense as any).id,
    number:          1,
    amount:          r.total_amount,
    due_period_date: periodEndForDate(chargeDate),
    is_paid:         true,
    paid_at:         new Date().toISOString(),
  })

  // Recorrer la fecha para que el materializador no cree otra cuota (deuda) igual
  const newDate = nextPaymentDate(chargeDate, r.interval_type as IntervalType)
  await supabase
    .from('recurring_expenses')
    .update({ next_charge_date: newDate })
    .eq('id', recurringExpenseId)

  return true
}
