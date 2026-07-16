import type { SupabaseClient } from '@supabase/supabase-js'

// Paga `paid` contra una cuota del ledger de tarjetas.
// Pago completo → se marca pagada. Pago parcial → la cuota se parte en dos:
// lo pagado queda como cuota pagada y el resto queda pendiente en la misma
// quincena, de modo que la suma de cuotas siempre iguala el total del gasto.
// Regresa false si la escritura fue bloqueada (RLS no lanza error, regresa 0 filas).
export async function payInstallment(
  supabase: SupabaseClient,
  installmentId: string,
  paid: number,
): Promise<boolean> {
  const { data: inst } = await supabase
    .from('card_expense_installments')
    .select('id, expense_id, number, amount, due_period_date')
    .eq('id', installmentId)
    .single()
  if (!inst) return false

  if (paid >= (inst as any).amount - 0.005) {
    const { data } = await supabase
      .from('card_expense_installments')
      .update({ is_paid: true, paid_at: new Date().toISOString() })
      .eq('id', installmentId)
      .select('id')
    return !!data?.length
  }

  const rest = Math.round(((inst as any).amount - paid) * 100) / 100
  const { data } = await supabase
    .from('card_expense_installments')
    .update({ amount: paid, is_paid: true, paid_at: new Date().toISOString() })
    .eq('id', installmentId)
    .select('id')
  if (!data?.length) return false

  await supabase.from('card_expense_installments').insert({
    expense_id:      (inst as any).expense_id,
    number:          (inst as any).number,
    amount:          rest,
    due_period_date: (inst as any).due_period_date,
    is_paid:         false,
  })
  return true
}
