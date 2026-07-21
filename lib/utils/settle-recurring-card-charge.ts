import type { SupabaseClient } from '@supabase/supabase-js'
import { payInstallment } from './pay-installment'

// Refleja en el ledger de tarjetas el pago de un fijo domiciliado a tarjeta, de
// modo que la DEUDA de la tarjeta baje al pagarlo (no solo el rastreo de efectivo).
//
// Dos casos, según cómo esté registrada la deuda de ese cargo:
//  1. El cargo está ITEMIZADO como cuota sin pagar (tarjetas cuyos cargos se
//     materializan en el ledger, ej. compras o domiciliados con fecha de cargo):
//     se liquida la cuota más antigua → la deuda baja de forma exacta.
//  2. El cargo NO está itemizado: la deuda vive en el saldo de la tarjeta (saldo
//     real capturado como 'ajuste'/balance manual). Se registra un ABONO — un
//     'ajuste' de monto negativo — que baja el saldo por lo pagado. source_id
//     queda nulo a propósito: el índice único (source, source_id) solo aplica
//     con source_id no nulo, así que puedes abonar cada quincena sin colisión.
//
// Regresa true si tocó el ledger, false si no aplicaba (fijo sin tarjeta) o si
// la escritura fue bloqueada por RLS.
export async function settleRecurringCardCharge(
  supabase: SupabaseClient,
  recurringExpenseId: string,
  paid: number,
): Promise<boolean> {
  const amount = Math.round(paid * 100) / 100
  if (amount < 0.01) return false

  // ── 1. ¿Hay una cuota pendiente itemizada de este domiciliado? ──
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
    return payInstallment(supabase, unpaid[0].id, amount)
  }

  // ── 2. Sin cuota itemizada: abonar contra el saldo de la tarjeta ──
  const { data: re } = await supabase
    .from('recurring_expenses')
    .select('concept, card_id')
    .eq('id', recurringExpenseId)
    .single()

  const r = re as any
  if (!r || !r.card_id) return false // fijo sin tarjeta → no hay saldo que mover

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const credit = -amount // 'ajuste' negativo = abono que baja el saldo
  const { data: expense, error } = await supabase
    .from('card_expenses')
    .insert({
      owner_id:     user.id,
      card_id:      r.card_id,
      concept:      `Abono ${r.concept}`,
      total_amount: credit,
      months:       1,
      expense_type: 'ajuste',
      // sin source_id → múltiples abonos permitidos (índice único no aplica)
    })
    .select('id')
    .single()

  if (error || !expense) return false

  // due_period_date NULL: pesa en el saldo, no en la proyección de la quincena
  const { error: instErr } = await supabase
    .from('card_expense_installments')
    .insert({
      expense_id:      (expense as any).id,
      number:          1,
      amount:          credit,
      due_period_date: null,
      is_paid:         false,
    })

  if (instErr) {
    await supabase.from('card_expenses').delete().eq('id', (expense as any).id)
    return false
  }
  return true
}
