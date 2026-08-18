import type { SupabaseClient } from '@supabase/supabase-js'
import { format, addMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { accruedInterest } from './credit-math'
import { balanceAsOf, type MovementLike } from './credit-balance'

// Devenga el interés mensual que falte de cada crédito activo. Perezoso: corre al
// cargar /tarjetas, igual que materializeCardCharges y la creación de periodos.
//
// Idempotente por el índice único (credit_id, accrual_month) WHERE kind='interest':
// si ambos usuarios abren la página a la vez, uno inserta y el otro corta.
export async function accrueCreditInterest(supabase: SupabaseClient): Promise<void> {
  const currentMonth = startOfMonth(new Date())

  // RLS ya acota a mis créditos + los compartidos
  const { data: credits } = await supabase
    .from('credits')
    .select('id, annual_rate, started_at')
    .eq('is_active', true)
    .gt('annual_rate', 0)

  for (const c of (credits ?? []) as any[]) {
    const { data: movements } = await supabase
      .from('credit_movements')
      .select('kind, amount, effective_date, accrual_month')
      .eq('credit_id', c.id)

    const rows = (movements ?? []) as MovementLike[]

    // Arrancar en el mes siguiente al último devengado, o al siguiente del inicio
    const accrued = rows
      .filter(m => m.kind === 'interest' && m.accrual_month)
      .map(m => m.accrual_month as string)
      .sort()
    let month = accrued.length
      ? addMonths(parseISO(accrued[accrued.length - 1]), 1)
      : addMonths(startOfMonth(parseISO(c.started_at)), 1)
    month = startOfMonth(month)

    // Tope de 12: ponerse al corriente sin bucles largos si la app no se abrió en meses
    for (let guard = 0; guard < 12 && month.getTime() <= currentMonth.getTime(); guard++) {
      const monthEndStr = format(endOfMonth(month), 'yyyy-MM-dd')
      // El saldo AL CIERRE DE ESE MES, no el de hoy: un abono hecho en el mes N ya
      // bajó el saldo antes de devengar el mes N+1.
      const interest = accruedInterest(balanceAsOf(rows, monthEndStr), Number(c.annual_rate))

      if (interest < 0.01) { month = addMonths(month, 1); continue }

      const accrualMonthStr = format(month, 'yyyy-MM-dd')
      const { error } = await supabase.from('credit_movements').insert({
        credit_id:      c.id,
        kind:           'interest',
        amount:         interest,
        accrual_month:  accrualMonthStr,
        effective_date: monthEndStr,
      })
      // 23505 = otra carga ya devengó este mes. Cualquier otro error tampoco vale
      // reintentar: los meses siguientes dependen de este saldo.
      if (error) break

      rows.push({ kind: 'interest', amount: interest, effective_date: monthEndStr, accrual_month: accrualMonthStr })
      month = addMonths(month, 1)
    }
  }
}
