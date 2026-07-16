import type { SupabaseClient } from '@supabase/supabase-js'
import { format } from 'date-fns'
import { nextPaymentDate, periodEndForDate } from './date-utils'
import type { IntervalType } from '@/types/database'

// Materializa cargos domiciliados vencidos: cada gasto fijo con tarjeta y
// next_charge_date <= hoy genera un card_expense (months=1) con su cuota en la
// quincena del cobro, y la fecha se recorre según el intervalo. Se ejecuta al
// cargar Dashboard/Tarjetas (patrón lazy del proyecto, igual que la creación
// de periodos). Idempotente: índice único (source, source_id) con
// source = `recurring-${fecha}` evita duplicados si dos cargas compiten.
export async function materializeCardCharges(
  supabase: SupabaseClient,
  myOwnership: 'lalo' | 'ale',
  ownerId: string,
): Promise<void> {
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const { data: dueCharges } = await supabase
    .from('recurring_expenses')
    .select('*, cards(ownership)')
    .eq('is_active', true)
    .not('card_id', 'is', null)
    .not('next_charge_date', 'is', null)
    .lte('next_charge_date', todayStr)

  for (const e of (dueCharges ?? []) as any[]) {
    // Materializa quien paga el cargo: dueño del gasto; en compartidos, quien
    // paga todo; en "cada quien", el dueño de la tarjeta (el banco le cobra a él)
    const payer = e.ownership !== 'shared'
      ? e.ownership
      : (e.paid_by === 'lalo' || e.paid_by === 'ale')
        ? e.paid_by
        : (e.cards?.ownership === 'ale' ? 'ale' : 'lalo')
    if (payer !== myOwnership) continue

    // Ponerse al corriente si pasaron varios ciclos sin abrir la app (tope 12)
    let chargeDate: string = e.next_charge_date
    for (let i = 0; i < 12 && chargeDate <= todayStr; i++) {
      const { data: expense, error } = await supabase
        .from('card_expenses')
        .insert({
          owner_id:      ownerId,
          card_id:       e.card_id,
          concept:       e.concept,
          total_amount:  e.total_amount,
          purchase_date: chargeDate,
          months:        1,
          expense_type:  'compra',
          source:        `recurring-${chargeDate}`,
          source_id:     e.id,
          notes:         'Cargo domiciliado automático',
        })
        .select('id')
        .single()

      if (error) {
        // 23505 = ya materializado por otra carga concurrente (esa avanza la fecha)
        break
      }
      await supabase.from('card_expense_installments').insert({
        expense_id:      expense.id,
        number:          1,
        amount:          e.total_amount,
        due_period_date: periodEndForDate(chargeDate),
        is_paid:         false,
      })

      chargeDate = nextPaymentDate(chargeDate, e.interval_type as IntervalType)
      await supabase.from('recurring_expenses')
        .update({ next_charge_date: chargeDate })
        .eq('id', e.id)
    }
  }
}
