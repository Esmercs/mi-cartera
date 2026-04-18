import { addDays, addMonths, addWeeks, format, parseISO, isBefore } from 'date-fns'
import { es } from 'date-fns/locale'
import type { IntervalType } from '@/types/database'

export function formatMXDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return format(parseISO(dateStr), "d 'de' MMMM yyyy", { locale: es })
}

export function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return format(parseISO(dateStr), 'dd/MM/yyyy')
}

export function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  return isBefore(parseISO(dateStr), new Date())
}

export function nextPaymentDate(
  currentDate: string,
  interval: IntervalType,
): string {
  const date = parseISO(currentDate)
  switch (interval) {
    case 'quincenal':
    case 'c/15 dias':
      return format(addDays(date, 15), 'yyyy-MM-dd')
    case 'mensual':
      return format(addMonths(date, 1), 'yyyy-MM-dd')
    case 'bimestral':
      return format(addMonths(date, 2), 'yyyy-MM-dd')
    case 'trimestral':
      return format(addMonths(date, 3), 'yyyy-MM-dd')
    case 'anual':
      return format(addMonths(date, 12), 'yyyy-MM-dd')
    case 'c/21 dias':
      return format(addWeeks(date, 3), 'yyyy-MM-dd')
    default:
      return format(addMonths(date, 1), 'yyyy-MM-dd')
  }
}

export function getCurrentPeriodDates(): { start: Date; end: Date; label: string } {
  const now = new Date()
  const day = now.getDate()
  const year = now.getFullYear()
  const month = now.getMonth()

  if (day <= 15) {
    const start = new Date(year, month, 1)
    const end = new Date(year, month, 15)
    return { start, end, label: `1–15 ${format(now, 'MMM yyyy', { locale: es })}` }
  } else {
    const start = new Date(year, month, 16)
    const end = new Date(year, month + 1, 0) // último día del mes
    return { start, end, label: `16–${end.getDate()} ${format(now, 'MMM yyyy', { locale: es })}` }
  }
}

export function intervalLabel(interval: IntervalType): string {
  const labels: Record<IntervalType, string> = {
    quincenal: 'Quincenal',
    mensual: 'Mensual',
    bimestral: 'Bimestral',
    trimestral: 'Trimestral',
    'c/15 dias': 'Cada 15 días',
    'c/21 dias': 'Cada 21 días',
    anual: 'Anual',
  }
  return labels[interval] ?? interval
}
