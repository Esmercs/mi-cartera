import { addMonths, parseISO } from 'date-fns'
import { periodEndForDate } from './date-utils'

export interface NewInstallment {
  number: number
  amount: number
  due_period_date: string
}

// Genera las cuotas de un gasto: cuota = round(total/meses, 2), la última absorbe
// el residuo para que la suma sea exactamente el total. Cada vencimiento mensual
// se mapea al fin de quincena que lo contiene.
export function generateInstallments(
  total: number,
  months: number,
  firstDue: string,
): NewInstallment[] {
  const cuota = Math.round((total / months) * 100) / 100
  const first = parseISO(firstDue)
  const rows: NewInstallment[] = []
  for (let i = 1; i <= months; i++) {
    rows.push({
      number: i,
      amount: i === months
        ? Math.round((total - cuota * (months - 1)) * 100) / 100
        : cuota,
      due_period_date: periodEndForDate(addMonths(first, i - 1)),
    })
  }
  return rows
}
